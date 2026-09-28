// Unit tests for the pure crochet logic. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseLine, parseSection, parsePattern, usedStitches, pickSize, hasSizes, renumber, addCounts } from '../web/js/crochet/parser.js';
import { usToUk, ukToUs, detectTerms } from '../web/js/crochet/terms.js';
import { distribute, compareGauge, startingChain, skeinsNeeded, substitute, hookFor, hookLabel, yardageFromSwatch, quickYardage, pricing, flatCircle, yardsPerSc } from '../web/js/crochet/calc.js';
import { amigurumi, hat, granny, stripes, stripesPattern, blanketLayout, SHAPES } from '../web/js/crochet/generators.js';
import { tapestryRows, c2cRows, colorStats, cleanConfetti, imageToChart, floodFill, packCells, unpackCells, blankChart } from '../web/js/crochet/chart.js';
import { hexDelta, harmony, HARMONIES, kmeans, colorName, colorFamily, valueGrey, inkFor } from '../web/js/crochet/color.js';
import { qrEncode } from '../web/js/core/qr.js';
import { textBitmap, FONT_CHARS } from '../web/js/crochet/font.js';
import { STITCHES, STITCH_PATTERNS, stitchInfo } from '../web/js/crochet/stitches.js';

const counts = (text, prev = null) => {
  const l = parseLine(text, { prev, roundish: /rnd/i.test(text) });
  return { c: l.consumes, p: l.produces, errors: l.issues.filter((i) => i.level === 'error'), issues: l.issues, line: l };
};

test('reads the common ways of writing an amigurumi round', () => {
  const cases = [
    ['Rnd 1: 6 sc in MR (6)', null, 0, 6],
    ['Rnd 2: inc x6 (12)', 6, 6, 12],
    ['Rnd 2: 2 sc in each st around (12)', 6, 6, 12],
    ['Rnd 3: (sc, inc) x6 (18)', 12, 12, 18],
    ['Rnd 3: [sc, inc] 6 times (18)', 12, 12, 18],
    ['Rnd 3: *sc, inc; rep from * around (18)', 12, 12, 18],
    ['Rnd 3: *sc, inc; rep from * 5 more times (18)', 12, 12, 18],
    ['Rnd 3: *sc, inc* x6 (18)', 12, 12, 18],
    ['Rnd 3: (1 sc, 1 inc)*6 (18)', 12, 12, 18],
    ['R3: 1 sc, inc x 6 (18)', 12, 12, 18],
    ['Rnd 4: [sc in next 2 sts, 2 sc in next st] 6 times (24)', 18, 18, 24],
    ['Rnd 5: (sc 2, inc) around (32)', 24, 24, 32],
    ['Rnds 5-9: sc around (24)', 24, 24, 24],
    ['Rnd 10: (sc 2, dec) x6 (18)', 24, 24, 18],
    ['Rnd 11: (sc, invdec) x6 (12)', 18, 18, 12],
    ['Rnd 12: sc2tog x6 (6)', 12, 12, 6],
    ['Rnd 12: BLO sc around (27)', 27, 27, 27],
    ['Round 14: sc around, sl st to first sc to join. (27)', 27, 27, 27],
    ['Rnd 2: inc x6. (12)', 6, 6, 12],
    ['Rnd 3: Sc 1, inc. Repeat 6 times. (18)', 12, 12, 18],
  ];
  for (const [text, prev, c, p] of cases) {
    const r = counts(text, prev);
    assert.equal(r.p, p, `${text}: produces`);
    assert.equal(r.c, c, `${text}: consumes`);
    assert.deepEqual(r.errors, [], `${text}: no errors`);
  }
});

test('reads flat rows, turning chains and chains that count', () => {
  assert.equal(counts('Ch 20.').p, 20);
  assert.equal(counts('Ch 20.').line.kind, 'chain');
  const r1 = counts('Row 1: sc in 2nd ch from hook and in each ch across (19)', 20);
  assert.equal(r1.p, 19);
  assert.equal(r1.c, 20);
  assert.deepEqual(r1.issues, []);
  assert.deepEqual(counts('Row 2: ch 1, turn, sc across (19)', 19).issues, []);
  assert.deepEqual(counts('Row 2: Ch 1, sc in each st across, turn. (19)', 19).issues, []);
  assert.deepEqual(counts('Row 3: ch 3 (counts as dc), dc in each st across (19)', 19).issues, []);
  assert.deepEqual(counts('Row 3: ch 2 (does not count as a st), dc in each st across (19)', 19).issues, []);
  const moss = counts('Row 1: sc in 4th ch from hook, *ch 1, sk next ch, sc in next ch; rep from * across, turn.', 20);
  assert.equal(moss.c, 20);
  assert.equal(moss.p, 17);
});

test('reads clusters, shells and stitches worked into one place', () => {
  assert.equal(counts('Rnd 9: (3 dc in next st, sk 1) x 6 (18)', 12).p, 18);
  assert.equal(counts('Rnd 1: ch 3 (counts as dc), 11 dc in ring, join (12)').p, 12);
  assert.deepEqual(counts('Rnd 2: ch 3 (counts as dc), dc in same st, 2 dc in each st around, join (24)', 12).issues, []);
  assert.deepEqual(counts('Row 4 (RS): FPdc around next st, BPdc around next st; rep across', 20).issues, []);
  assert.equal(counts('Row 4 (RS): FPdc around next st, BPdc around next st; rep across', 20).p, 20);
});

test('flags counts that are genuinely wrong', () => {
  const wrong = counts('Rnd 5: (sc 3, inc) x6 (29)', 24);
  assert.equal(wrong.p, 30);
  assert.equal(wrong.errors.length, 1);
  assert.match(wrong.errors[0].msg, /Says 29/);
  const short = counts('Rnd 11: sc 3, (inc, sc 5) x3, sc 2 (27)', 24);
  assert.ok(short.issues.some((i) => /unworked/.test(i.msg)));
  const over = counts('Rnd 6: (sc 3, inc) x6 (30)', 18);
  assert.ok(over.errors.some((i) => /row below has 18/.test(i.msg)));
  const uneven = counts('Rnd 6: (sc 3, inc) around', 22);
  assert.ok(uneven.errors.some((i) => /doesn't divide/.test(i.msg)));
});

test('never raises a hard error on a line it could not fully read', () => {
  const l = counts('Row 2: ch 3, 2 dc in first sc, *sk 2 dc, sc in next dc, sk 2 dc, 5 dc in next sc; rep from * across, ending with 3 dc in the last sc, turn.', 25);
  assert.equal(l.errors.length, 0);
  assert.ok(l.line.uncertain);
});

test('checks itemised totals like granny squares write them', () => {
  const g = parseSection(granny({ rounds: 5, colors: ['A', 'B', 'A', 'B', 'C'] }).text);
  assert.equal(g.errors, 0);
  assert.equal(g.warnings, 0);
  const bad = parseLine('Rnd 2: ch 3 (counts as dc), (2 dc, ch 2, 3 dc) in same sp, *ch 1, (3 dc, ch 2, 3 dc) in next ch-2 sp; rep from * 2 more times, ch 1, join (25 dc)', { prev: 20 });
  assert.ok(bad.issues.some((i) => /25 dc/.test(i.msg)));
});

test('a whole pattern flattens into tracker steps, with pieces made twice', () => {
  const p = parsePattern({
    sections: [
      { name: 'Head', text: 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nPlace eyes.\nRnds 3-5: sc around (12)\nRnd 6: dec x6 (6)\nFasten off.' },
      { name: 'Ears', text: 'Ears (make 2):\nRnd 1: 5 sc in MR (5)\nRnd 2: sc around (5)' },
    ],
  });
  assert.equal(p.errors, 0);
  assert.equal(p.rows, 6 + 4);
  assert.equal(p.steps[2].notes[0], 'Place eyes.');
  assert.equal(p.steps.filter((s) => s.part.startsWith('Ears')).length, 4);
  assert.deepEqual(p.steps.filter((s) => s.part.startsWith('Ears')).map((s) => s.piece), [1, 1, 2, 2]);
  assert.ok(usedStitches({ sections: [{ text: 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)' }] }).includes('mr'));
});

test('numbering gaps are pointed out', () => {
  const s = parseSection('Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nRnd 4: (sc, inc) x6 (18)');
  assert.ok(s.lines[2].issues.some((i) => /jumps/.test(i.msg)));
});

test('graded patterns are checked one size at a time', () => {
  assert.equal(pickSize('Rows 2-18 (20, 22): sc across (40 (48, 56))', 2), 'Rows 2-22: sc across (56)');
  assert.equal(pickSize('Row 3: sc 2 (-, 1), dec', 1), 'Row 3: sc 0, dec');
  assert.equal(pickSize('Rnd 3: (sc, inc) x6 (18)', 1), 'Rnd 3: (sc, inc) x6 (18)');
  assert.equal(pickSize('(12 dc, 4 ch-2 sps)', 1), '(12 dc, 4 ch-2 sps)');
  assert.ok(hasSizes('sc 20 [24, 28]'));
  assert.ok(!hasSizes('Rnd 1: 6 sc in MR (6)'));
  const pat = { sizes: ['S', 'M', 'L'], sections: [{ text: 'Ch 21 (25, 29).\nRow 1: sc in 2nd ch from hook and in each ch across, turn (20 (24, 28))\nRows 2-10 (12, 14): ch 1, sc across, turn (20 (24, 28))\nRow 11 (13, 15): ch 1, sc 9 (11, 13), sc2tog, sc 9 (11, 13), turn (19 (23, 26))' }] };
  assert.deepEqual([0, 1, 2].map((k) => parsePattern(pat, { size: k }).errors), [0, 0, 1]);
  assert.deepEqual([0, 1, 2].map((k) => parsePattern(pat, { size: k }).rows), [11, 13, 15]);
});

test('tech editing: renumber and add counts', () => {
  const messy = 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nRnd 2: (sc, inc) x6 (18)\nRnds 5-8: sc around (18)\nStuff.\nRnd 12: dec x9 (9)\nArms:\nRnd 3: 5 sc in MR (5)\nRnd 7: sc around (5)';
  assert.equal(renumber(messy), 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nRnd 3: (sc, inc) x6 (18)\nRnds 4-7: sc around (18)\nStuff.\nRnd 8: dec x9 (9)\nArms:\nRnd 3: 5 sc in MR (5)\nRnd 4: sc around (5)');
  assert.equal(parseSection(renumber(messy)).warnings, 0);
  const bare = 'Rnd 1: 6 sc in MR\nRnd 2: inc x6.\nRnd 3: (sc, inc) x6 (18)\nRnd 4: sc 2, blah blah';
  const r = addCounts(bare);
  assert.equal(r.added, 2);
  assert.equal(r.text, 'Rnd 1: 6 sc in MR (6)\nRnd 2: inc x6 (12)\nRnd 3: (sc, inc) x6 (18)\nRnd 4: sc 2, blah blah');
});

test('UK patterns are read in UK terms', () => {
  const l = parseLine('Rnd 3: (dc, inc) x6 (18)', { prev: 12, terms: 'UK' });
  assert.equal(l.produces, 18);
  assert.equal(parseLine('Row 2: ch 3, tr in each st across (20)', { prev: 20, terms: 'UK' }).tally.dc, 20);
});

test('US/UK conversion swaps every term exactly once', () => {
  assert.equal(usToUk('sc 3, hdc, dc, tr, sc2tog, FPdc'), 'dc 3, htr, tr, dtr, dc2tog, FPtr');
  assert.equal(ukToUs('dc 3, htr, tr, dtr, dc2tog, FPtr, ss'), 'sc 3, hdc, dc, tr, sc2tog, FPdc, sl st');
  assert.equal(usToUk('Single crochet into each stitch; half double crochet'), 'Double crochet into each stitch; half treble crochet');
  assert.equal(usToUk("Don't miss this. Skip next st."), "Don't miss this. Miss next st.");
  assert.equal(ukToUs(usToUk('sc, hdc, dc, tr, dtr, sl st, gauge, yo')), 'sc, hdc, dc, tr, dtr, sl st, gauge, yo');
  assert.equal(detectTerms('Rnd 1: 6 sc in MR. Rnd 2: hdc around'), 'US');
  assert.equal(detectTerms('Row 1: htr in each st, ss to join'), 'UK');
});

test('even increases and decreases always check out', () => {
  let checked = 0;
  for (let S = 1; S <= 72; S++) {
    for (let k = -Math.floor(S / 2); k <= S; k++) {
      for (const round of [true, false]) {
        for (const offset of [0, 1, 3]) {
          for (const stitch of ['sc', 'hdc', 'dc']) {
            const d = distribute(S, k, { round, offset, stitch });
            assert.equal(d.error, null);
            const l = parseLine(`Rnd 1: ${d.text} (${S + k})`, { prev: S });
            assert.equal(l.produces, S + k, `${S}${k >= 0 ? '+' : ''}${k}: ${d.text}`);
            assert.equal(l.consumes, S, `${S}${k >= 0 ? '+' : ''}${k}: ${d.text}`);
            checked++;
          }
        }
      }
    }
  }
  assert.ok(checked > 20000);
  assert.equal(distribute(24, 6).text, '(sc 3, inc) x6');
  assert.equal(distribute(18, 6, { offset: 1 }).text, 'sc 1, inc, (sc 2, inc) x5, sc 1');
  assert.equal(distribute(24, -6).text, '(sc 2, dec) x6');
  assert.match(distribute(10, 11).error, /at most 10/);
  assert.match(distribute(10, -6).error, /at most 5/);
});

test('gauge, chains, yarn and money', () => {
  const g = compareGauge({ patternSts: 16, mySts: 18, hookMm: 5 });
  assert.match(g.advice, /up a hook/);
  assert.ok(g.suggestedHook > 5);
  assert.equal(compareGauge({ patternSts: 16, mySts: 16 }).advice, 'On gauge. Keep your hook.');
  const ch = startingChain({ width: 20, gaugeSts: 14, gaugePer: 4, multiple: 6, plus: 2, turning: 0 });
  assert.equal((ch.sts - 2) % 6, 0);
  assert.equal(skeinsNeeded(1000, 200, 0.1), 6);
  assert.equal(skeinsNeeded(1000, 250, 0), 4);
  const sub = substitute({ patYards: 200, patGrams: 100, patSkeins: 5, subYards: 150, subGrams: 100 });
  assert.equal(sub.skeins, 7);
  assert.equal(sub.match, 'poor');
  assert.equal(hookFor(5.1).mm, 5);
  assert.equal(hookLabel(5), '5 mm (H-8)');
  assert.equal(hookFor(1.5).steel, true);
  const sw = yardageFromSwatch({ swatchW: 4, swatchH: 4, swatchGrams: 8, targetW: 40, targetH: 40, yardsPerSkein: 200, gramsPerSkein: 100 });
  assert.equal(Math.round(sw.grams), 800);
  assert.equal(Math.round(sw.yards), 1600);
  const q = quickYardage({ widthIn: 50, heightIn: 60, weightId: 4, fabric: 'sc' });
  assert.ok(q.yards > 2400 && q.yards < 4000, `worsted sc throw is roughly 3,000 yd, got ${q.yards}`);
  const beanie = hat({ stitch: 'hdc', gaugeSts: 13, gaugeRows: 10 });
  const beanieYards = beanie.stitches * yardsPerSc({ weightId: 4 }) * 1.35;
  assert.ok(beanieYards > 100 && beanieYards < 220, `worsted hdc beanie is 120-200 yd, got ${beanieYards}`);
  const pr = pricing({ materials: 30, hours: 10, rate: 15, overheadPct: 10, markup: 2 });
  assert.equal(pr.wholesale, 198);
  assert.equal(pr.retail, 396);
  assert.equal(flatCircle({ diameter: 10, stsPerUnit: 2, start: 6 }).rounds, 10);
});

test('every generator writes patterns the checker accepts', () => {
  const shapes = {
    sphere: { diameter: 8 },
    egg: { width: 7, height: 10, taper: 0.2 },
    ellipsoid: { width: 5, height: 9 },
    tube: { diameter: 3, length: 8, closedTop: true },
    cone: { diameter: 4, height: 6 },
    custom: { profile: [{ z: 0, r: 0 }, { z: 2, r: 3 }, { z: 5, r: 2 }, { z: 8, r: 3.5 }, { z: 10, r: 0 }] },
  };
  assert.deepEqual(Object.keys(shapes).sort(), SHAPES.map((s) => s.id).sort());
  for (const [shape, params] of Object.entries(shapes)) {
    for (const snap of [true, false]) {
      for (const stsPerCm of [1.4, 2, 3]) {
        const a = amigurumi({ shape, params, snap, stsPerCm });
        const s = parseSection(a.text);
        assert.equal(s.errors + s.warnings, 0, `${shape} snap=${snap}\n${a.text}`);
        assert.equal(s.rows, a.rounds);
      }
    }
  }
  for (const stitch of ['sc', 'hdc', 'dc']) {
    for (const brim of ['ribbed', 'plain', 'none']) {
      const h = hat({ stitch, brim, gaugeSts: 12, gaugeRows: stitch === 'sc' ? 14 : 8 });
      const s = parseSection(h.text);
      assert.equal(s.errors + s.warnings, 0, `hat ${stitch} ${brim}\n${h.text}`);
      assert.ok(Math.abs(h.finishedCirc - 20.5) < 2);
    }
  }
  for (const style of ['even', 'fibonacci', 'random', 'gradient', 'mirror']) {
    const seq = stripes({ rows: 57, colors: 3, style, seed: 4 });
    assert.equal(seq.reduce((a, b) => a + b.rows, 0), 57);
    for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i].color, seq[i - 1].color);
    for (const stitch of ['sc', 'hdc', 'dc']) {
      const s = parseSection(stripesPattern({ seq, width: 25, stitch }));
      assert.equal(s.errors + s.warnings, 0, `${style} ${stitch}`);
      assert.equal(s.rows, 57);
    }
  }
  const layout = blanketLayout({ across: 6, down: 5, colors: 3, seed: 9 });
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 6; x++) {
      if (x) assert.notEqual(layout[y][x], layout[y][x - 1]);
      if (y) assert.notEqual(layout[y][x], layout[y - 1][x]);
    }
  }
});

test('stitch dictionary patterns are consistent with their multiples', () => {
  assert.ok(STITCHES.length >= 25);
  assert.equal(stitchInfo('dc3tog').c, 3);
  assert.equal(stitchInfo('fphdc').p, 1);
  const shell = STITCH_PATTERNS.find((s) => s.id === 'shellrow');
  const chain = shell.multiple * 4 + shell.plus;
  const row1 = parseLine(shell.rows[1], { prev: chain });
  assert.deepEqual(row1.issues.filter((i) => i.level !== 'info'), []);
  const lemon = STITCH_PATTERNS.find((s) => s.id === 'lemon');
  const lr = parseLine(lemon.rows[1], { prev: 21 });
  assert.equal(lr.produces, 20);
  const lr2 = parseLine(lemon.rows[2], { prev: 20 });
  assert.equal(lr2.produces, 20);
  assert.deepEqual(lr2.issues, []);
  assert.deepEqual(lr.issues, []);
  const waffle = STITCH_PATTERNS.find((s) => s.id === 'waffle');
  const w1 = parseLine(waffle.rows[1], { prev: 3 * 8 + 2 });
  assert.deepEqual(w1.issues, []);
});

test('tapestry and C2C instructions', () => {
  const c = blankChart(4, 3, ['#ffffff', '#ff0000']);
  // Top row: 0 1 1 0, middle: 1 1 1 1, bottom: 0 0 0 1
  c.cells = [0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1];
  const t = tapestryRows(c, { mode: 'tapestry' });
  assert.equal(t[0].dir, '←');
  assert.deepEqual(t[0].runs, [{ color: 1, n: 1 }, { color: 0, n: 3 }]);
  assert.equal(t[1].dir, '→');
  assert.equal(tapestryRows(c, { mode: 'round' })[1].dir, '←');
  const d = c2cRows(c);
  assert.equal(d.length, 4 + 3 - 1);
  assert.equal(d[0].tiles, 1);
  assert.equal(d.reduce((a, r) => a + r.tiles, 0), 12);
  assert.equal(d[0].runs[0].color, 1); // bottom-right tile
  assert.equal(d[d.length - 1].tiles, 1);
  const stats = colorStats(c);
  assert.equal(stats[1].cells, 7);
  assert.equal(packCells([0, 0, 0, 1, 2, 2]), '3:0,1,2:2');
  assert.deepEqual(unpackCells('3:0,1,2:2', 6), [0, 0, 0, 1, 2, 2]);
  const f = floodFill(c, 0, 2, 1);
  assert.equal(f.cells.filter((v) => v === 1).length, 10);
});

test('confetti cleanup removes isolated stitches', () => {
  const c = blankChart(5, 5, ['#fff', '#000']);
  c.cells[12] = 1;
  const r = cleanConfetti(c);
  assert.equal(r.changed, 1);
  assert.equal(r.chart.cells[12], 0);
});

test('image to chart picks the obvious colors', () => {
  const px = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) px.push(x < 5 ? [250, 10, 10] : [10, 10, 250]);
  const ch = imageToChart(px, 10, 10, { colors: 2 });
  assert.equal(ch.palette.length, 2);
  assert.notEqual(ch.cells[0], ch.cells[9]);
  assert.equal(new Set(ch.cells.slice(0, 5)).size, 1);
  const km = kmeans(px, 2);
  assert.ok(Math.abs(km[0].share - 0.5) < 0.01);
});

test('color tools', () => {
  assert.ok(hexDelta('#ff0000', '#ff0000') < 0.001);
  assert.ok(hexDelta('#ff0000', '#00ff00') > 50);
  for (const [rule] of HARMONIES) {
    const h = harmony('#b7410e', rule, 5);
    assert.equal(h.length, 5);
    for (const hex of h) assert.match(hex, /^#[0-9a-f]{6}$/);
  }
  assert.equal(colorName('#b7410e'), 'Rust');
  assert.equal(colorFamily('#1e3a5f'), 'blue');
  assert.match(valueGrey('#b7410e'), /^#([0-9a-f]{2})\1\1$/);
  assert.equal(inkFor('#ffffff'), '#1f1a17');
});

test('pixel font for chart text', () => {
  const hi = textBitmap('Hi');
  assert.equal(hi.w, 11);
  assert.equal(hi.h, 7);
  assert.equal(hi.cells.length, 17 + 11);
  const big = textBitmap('I', 2);
  assert.equal(big.h, 14);
  assert.equal(big.cells.length, 11 * 4);
  assert.equal(textBitmap('A B').w, 5 + 1 + 3 + 5);
  assert.ok(FONT_CHARS.includes('♥'));
  assert.equal(textBitmap('<3').cells.length, textBitmap('♥').cells.length);
  for (const ch of FONT_CHARS) assert.ok(textBitmap(ch).cells.length > 0, ch);
});

test('QR codes have the right structure', () => {
  const q = qrEncode('https://loopwright.example/#/s/ABCD2345');
  assert.equal(q.size, q.version * 4 + 17);
  // Finder pattern corners are dark, the separator ring light.
  assert.equal(q.modules[0][0], true);
  assert.equal(q.modules[7][7], false);
  assert.equal(q.modules[q.size - 1][0], true);
  assert.throws(() => qrEncode('x'.repeat(4000)));
});
