// Pattern generators. Each one returns pattern text that the checker in
// parser.js reads back cleanly (the tests hold them to that), plus the numbers
// a designer wants: size, stitches, yarn.

import { distribute } from './calc.js';

// ---------------------------------------------------------------------------
// Seeded randomness, so a generated design can be shared as its seed.
// ---------------------------------------------------------------------------

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const colorLetter = (i) => String.fromCharCode(65 + (i % 26));

// ---------------------------------------------------------------------------
// Amigurumi shapes
// ---------------------------------------------------------------------------

export const SHAPES = [
  { id: 'sphere', name: 'Ball', fields: ['diameter'], about: 'Heads, bodies, balls, berries.' },
  { id: 'egg', name: 'Egg', fields: ['width', 'height', 'taper'], about: 'Bodies that sit, eggs, pears.' },
  { id: 'ellipsoid', name: 'Oval', fields: ['width', 'height'], about: 'Long heads, beans, cocoons.' },
  { id: 'tube', name: 'Tube', fields: ['diameter', 'length', 'closedTop'], about: 'Arms, legs, tentacles, necks.' },
  { id: 'cone', name: 'Cone', fields: ['diameter', 'height', 'closedTop'], about: 'Horns, gnome hats, carrots, beaks.' },
  { id: 'custom', name: 'Freeform', fields: ['profile'], about: 'Draw the silhouette yourself.' },
];

/**
 * A shape's profile as a polyline of { z, r } in cm, from the starting pole
 * (where the magic ring goes) to the far end.
 */
export function profileFor(shape, p) {
  const pts = [];
  const N = 96;
  switch (shape) {
    case 'sphere': {
      const R = p.diameter / 2;
      for (let i = 0; i <= N; i++) {
        const t = (Math.PI * i) / N;
        pts.push({ z: R * (1 - Math.cos(t)), r: R * Math.sin(t) });
      }
      return { pts, closedEnd: true };
    }
    case 'egg':
    case 'ellipsoid': {
      const a = p.width / 2;
      const b = p.height / 2;
      const taper = shape === 'egg' ? (p.taper ?? 0.18) : 0;
      for (let i = 0; i <= N; i++) {
        const t = (Math.PI * i) / N;
        // Wider at the bottom (the magic ring end), narrower at the top.
        pts.push({ z: b * (1 - Math.cos(t)), r: a * Math.sin(t) * (1 + taper * Math.cos(t)) });
      }
      return { pts, closedEnd: true };
    }
    case 'tube': {
      const R = p.diameter / 2;
      const L = Math.max(p.length, R);
      // Flat base disc, straight wall, optional flat top disc.
      for (let i = 0; i <= 24; i++) pts.push({ z: 0, r: (R * i) / 24 });
      for (let i = 1; i <= 48; i++) pts.push({ z: (L * i) / 48, r: R });
      if (p.closedTop) for (let i = 1; i <= 24; i++) pts.push({ z: L, r: R * (1 - i / 24) });
      return { pts, closedEnd: !!p.closedTop };
    }
    case 'cone': {
      const R = p.diameter / 2;
      const H = p.height;
      for (let i = 0; i <= 48; i++) pts.push({ z: (H * i) / 48, r: (R * i) / 48 });
      if (p.closedTop) for (let i = 1; i <= 24; i++) pts.push({ z: H, r: R * (1 - i / 24) });
      return { pts, closedEnd: !!p.closedTop };
    }
    case 'custom': {
      // Catmull-Rom through the control points; r=0 at the start is implied.
      const ctrl = (p.profile || []).map((q) => ({ z: q.z, r: Math.max(0, q.r) }));
      if (ctrl.length < 2) return { pts: [{ z: 0, r: 0 }, { z: 1, r: 0 }], closedEnd: true };
      const out = [];
      for (let i = 0; i < ctrl.length - 1; i++) {
        const p0 = ctrl[Math.max(0, i - 1)];
        const p1 = ctrl[i];
        const p2 = ctrl[i + 1];
        const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
        for (let k = 0; k < 16; k++) {
          const t = k / 16;
          const t2 = t * t;
          const t3 = t2 * t;
          const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
          out.push({ z: f(p0.z, p1.z, p2.z, p3.z), r: Math.max(0, f(p0.r, p1.r, p2.r, p3.r)) });
        }
      }
      out.push(ctrl[ctrl.length - 1]);
      return { pts: out, closedEnd: ctrl[ctrl.length - 1].r < 0.3 };
    }
    default:
      return { pts: [], closedEnd: true };
  }
}

// Arc length along a profile, so rounds are spaced by fabric height.
function arcTable(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i].z - pts[i - 1].z, pts[i].r - pts[i - 1].r));
  return s;
}

function sampleAt(pts, s, at) {
  if (at <= 0) return pts[0];
  const L = s[s.length - 1];
  if (at >= L) return pts[pts.length - 1];
  let i = 1;
  while (s[i] < at) i++;
  const t = (at - s[i - 1]) / (s[i] - s[i - 1] || 1);
  return { z: pts[i - 1].z + t * (pts[i].z - pts[i - 1].z), r: pts[i - 1].r + t * (pts[i].r - pts[i - 1].r) };
}

/**
 * Turn a shape into rounds.
 *   stsPerCm / rowsPerCm: your gauge in sc
 *   start: stitches in the magic ring (6 is standard)
 *   snap: keep counts on multiples of `start` for the classic, tidy
 *         "(sc n, inc) x6" rhythm
 */
export function amigurumi({ shape = 'sphere', params = {}, stsPerCm = 2, rowsPerCm = 2.2, start = 6, snap = true, stagger = true, invisible = true, name = 'Piece' } = {}) {
  const { pts, closedEnd } = profileFor(shape, params);
  const s = arcTable(pts);
  const L = s[s.length - 1];
  const N = Math.max(2, Math.round(L * rowsPerCm));
  const counts = [];
  let prev = start;
  counts.push(start);
  for (let i = 2; i <= N; i++) {
    const at = (i / N) * L;
    const q = sampleAt(pts, s, at);
    let target = 2 * Math.PI * q.r * stsPerCm;
    if (snap) target = Math.round(target / start) * start;
    else target = Math.round(target);
    // Physical limits: at most double, at most halve, never below the start.
    const floor = closedEnd ? start : Math.max(start, Math.ceil(prev / 2));
    target = Math.max(floor, Math.ceil(prev / 2), Math.min(2 * prev, target));
    if (snap && target % start) target = Math.min(2 * prev, Math.ceil(target / start) * start);
    counts.push(target);
    prev = target;
  }
  // A closed end finishes on the smallest round; trim trailing repeats of it.
  if (closedEnd) {
    while (counts.length > 2 && counts[counts.length - 1] === start && counts[counts.length - 2] === start) counts.pop();
  }

  const lines = [];
  lines.push(`Rnd 1: ${start} sc in MR (${start})`);
  let i = 1;
  const max = Math.max(...counts);
  let stuffNoted = false;
  let phase = 0;
  while (i < counts.length) {
    const from = counts[i - 1];
    const to = counts[i];
    if (to === from) {
      let j = i;
      while (j + 1 < counts.length && counts[j + 1] === to) j++;
      const label = j > i ? `Rnds ${i + 1}-${j + 1}` : `Rnd ${i + 1}`;
      lines.push(`${label}: sc around (${to})`);
      i = j + 1;
      continue;
    }
    if (to < from && !stuffNoted && closedEnd && to <= max * 0.5) {
      lines.push('Stuff firmly, adding a little more with each round from here.');
      stuffNoted = true;
    }
    const change = to - from;
    const k = Math.abs(change);
    const eats = change > 0 ? 1 : 2;
    const gap = Math.floor((from - k * eats) / k);
    const offset = stagger && phase % 2 === 1 ? Math.ceil(gap / 2) : 0;
    phase++;
    const d = distribute(from, change, { round: true, offset, invisible });
    lines.push(`Rnd ${i + 1}: ${d.text} (${to})`);
    i++;
  }
  if (closedEnd) {
    if (!stuffNoted) lines.push('Stuff firmly.');
    lines.push('Fasten off, leaving a long tail. Weave it through the front loops of the last round and pull tight to close.');
  } else {
    lines.push('Fasten off, leaving a long tail for sewing.');
  }

  const rounds = counts.length;
  const stitches = counts.reduce((a, b) => a + b, 0);
  // Actual geometry from the counts, for the preview.
  const geometry = counts.map((c, idx) => {
    const q = sampleAt(pts, s, ((idx + 1) / counts.length) * L);
    return { round: idx + 1, count: c, r: c / (2 * Math.PI * stsPerCm), z: q.z };
  });
  const volume = shapeVolume(pts);
  return {
    name,
    text: lines.join('\n'),
    counts,
    rounds,
    stitches,
    max,
    geometry,
    profile: pts,
    closedEnd,
    size: {
      width: (2 * max) / (2 * Math.PI * stsPerCm),
      length: Math.max(...pts.map((q) => q.z)),
    },
    // Poly-fil stuffed firm is roughly 0.04 g/cm³.
    stuffingGrams: closedEnd ? volume * 0.04 : 0,
  };
}

function shapeVolume(pts) {
  let v = 0;
  for (let i = 1; i < pts.length; i++) {
    const dz = Math.abs(pts[i].z - pts[i - 1].z);
    const r = (pts[i].r + pts[i - 1].r) / 2;
    v += Math.PI * r * r * dz;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Hats (top-down, flat circle crown)
// ---------------------------------------------------------------------------

const CROWN = {
  sc: { start: 6, h: 1 },
  hdc: { start: 8, h: 1.5 },
  dc: { start: 12, h: 2 },
};

/**
 * A top-down hat.
 *   circ: head circumference, height: crown to brim (same unit as gauge per)
 *   gaugeSts / gaugeRows: in the hat's stitch, per `per` units
 */
export function hat({ circ = 22, height = 8.5, stitch = 'dc', gaugeSts = 12, gaugeRows = 7, per = 4, ease = 1.5, brim = 'ribbed', brimDepth = 1.5, slouch = 0 } = {}) {
  const c = CROWN[stitch] || CROWN.dc;
  const stsPer = gaugeSts / per;
  const rowsPer = gaugeRows / per;
  const hatCirc = Math.max(4, circ - ease);
  const target = hatCirc * stsPer;
  const incRounds = Math.max(2, Math.round(target / c.start));
  const count = incRounds * c.start;
  const totalRows = Math.max(incRounds + 2, Math.round((height + slouch) * rowsPer));
  // Post-stitch ribbing is dc height: convert brim depth to ribbing rounds.
  const ribRowHeight = (1 / rowsPer) * (2 / c.h);
  const brimRows = brim === 'none' ? 0 : Math.max(1, Math.round(brimDepth / ribRowHeight));
  const brimHeight = brimRows * ribRowHeight;
  const bodyRows = Math.max(0, Math.round((height + slouch - brimHeight) * rowsPer) - incRounds);

  const joined = stitch !== 'sc';
  const beg = joined ? 'ch 2 (does not count as a st), ' : '';
  const join = joined ? ', join with sl st to first st' : '';
  const lines = [];
  if (!joined) lines.push('Work in continuous rounds; mark the first stitch of each round.');
  if (stitch === 'sc') lines.push(`Rnd 1: 6 sc in MR (6)`);
  else lines.push(`Rnd 1: ${beg}${c.start} ${stitch} in MR${join} (${c.start})`);
  lines.push(`Rnd 2: ${beg}${stitch === 'sc' ? 'inc in each st around' : `2 ${stitch} in each st around`}${join} (${c.start * 2})`);
  for (let r = 3; r <= incRounds; r++) {
    const from = (r - 1) * c.start;
    const gap = r - 2;
    const d = distribute(from, c.start, { stitch, offset: r % 2 ? Math.ceil(gap / 2) : 0 });
    lines.push(`Rnd ${r}: ${beg}${d.text}${join} (${r * c.start})`);
  }
  let r = incRounds + 1;
  if (bodyRows > 0) {
    const label = bodyRows > 1 ? `Rnds ${r}-${r + bodyRows - 1}` : `Rnd ${r}`;
    lines.push(`${label}: ${beg}${stitch} in each st around${join} (${count})`);
    r += bodyRows;
  }
  if (brimRows > 0) {
    if (brim === 'ribbed') {
      lines.push('Brim: switch to post-stitch ribbing.');
      const label = brimRows > 1 ? `Rnds ${r}-${r + brimRows - 1}` : `Rnd ${r}`;
      lines.push(`${label}: ch 2 (does not count as a st), *FPdc around next st, BPdc around next st; rep from * around, join with sl st to first st (${count})`);
    } else {
      const label = brimRows > 1 ? `Rnds ${r}-${r + brimRows - 1}` : `Rnd ${r}`;
      lines.push(`${label}: ${beg}${stitch} in BLO of each st around${join} (${count})`);
    }
    r += brimRows;
  }
  lines.push('Fasten off and weave in ends. Fold up the brim if you like a cuff.');
  const rounds = incRounds + bodyRows + brimRows;
  return {
    text: lines.join('\n'),
    count,
    rounds,
    crownRounds: incRounds,
    bodyRows,
    brimRows,
    finishedCirc: count / stsPer,
    crownDiameter: count / stsPer / Math.PI,
    finishedHeight: (incRounds + bodyRows) / rowsPer + brimHeight,
    stitches: (incRounds * (incRounds + 1) / 2) * c.start + (bodyRows + brimRows) * count,
    totalRows,
  };
}

// ---------------------------------------------------------------------------
// Granny squares
// ---------------------------------------------------------------------------

/**
 * The classic granny square: clusters of 3 dc, ch-2 corners, ch-1 between
 * clusters. `colors` is the color letter for each round.
 */
export function granny({ rounds = 5, colors = null } = {}) {
  const n = Math.max(1, Math.min(30, Math.round(rounds)));
  const col = colors || Array.from({ length: n }, () => 'A');
  const lines = [];
  lines.push(`With Color ${col[0]}, ch 4 and join with sl st to form a ring.`);
  lines.push('Rnd 1: ch 3 (counts as dc), 2 dc in ring, ch 2, (3 dc in ring, ch 2) x3, join with sl st to top of beg ch-3 (12 dc, 4 ch-2 sps)');
  for (let r = 2; r <= n; r++) {
    const change = col[r - 1] !== col[r - 2];
    const start = change
      ? `Fasten off Color ${col[r - 2]}. Join Color ${col[r - 1]} in any ch-2 corner sp.`
      : null;
    if (start) lines.push(start);
    const move = change ? '' : 'sl st in next 2 sts and into ch-2 sp, ';
    const between = r - 2;
    const side = between > 0 ? `[ch 1, 3 dc in next ch-1 sp] x${between}, ` : '';
    const text = `Rnd ${r}: ${move}ch 3 (counts as dc), (2 dc, ch 2, 3 dc) in same sp, *${side}ch 1, (3 dc, ch 2, 3 dc) in next ch-2 sp; rep from * 2 more times, ${side}ch 1, join with sl st to top of beg ch-3 (${12 * r} dc)`;
    lines.push(text);
  }
  lines.push('Fasten off and weave in ends.');
  const perRound = Array.from({ length: n }, (_, i) => ({
    round: i + 1,
    color: col[i],
    dc: 12 * (i + 1),
    ch: i === 0 ? 8 : 8 + 4 * i,
  }));
  return { text: lines.join('\n'), rounds: n, perRound, totalDc: 6 * n * (n + 1) };
}

/** Approximate finished side of a granny square, in inches, per weight. */
export function grannySide(rounds, weightId = 4) {
  const scale = [0.45, 0.6, 0.72, 0.86, 1, 1.3, 1.7, 2.3][weightId] ?? 1;
  return (0.3 + rounds * 1.02) * scale;
}

/** Lay out a blanket of squares with no two neighbours the same color. */
export function blanketLayout({ across, down, colors, seed = 1 }) {
  const rand = rng(seed);
  const grid = [];
  const k = Math.max(1, colors);
  for (let y = 0; y < down; y++) {
    const row = [];
    for (let x = 0; x < across; x++) {
      const banned = new Set([row[x - 1], grid[y - 1]?.[x]]);
      const choices = [...Array(k).keys()].filter((c) => !banned.has(c));
      const pool = choices.length ? choices : [...Array(k).keys()];
      row.push(pool[Math.floor(rand() * pool.length)]);
    }
    grid.push(row);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Stripes
// ---------------------------------------------------------------------------

export const STRIPE_STYLES = [
  ['even', 'Even bands'],
  ['fibonacci', 'Fibonacci'],
  ['random', 'Random'],
  ['gradient', 'Gradient fade'],
  ['mirror', 'Mirrored'],
];

/** A stripe sequence: [{ color: index, rows }] summing to `rows`. */
export function stripes({ rows = 60, colors = 4, style = 'even', band = 4, seed = 1 }) {
  const k = Math.max(1, colors);
  const rand = rng(seed);
  const out = [];
  let used = 0;
  let c = 0;
  const push = (color, n) => {
    const take = Math.min(n, rows - used);
    if (take <= 0) return;
    const last = out[out.length - 1];
    if (last && last.color === color) last.rows += take;
    else out.push({ color, rows: take });
    used += take;
  };
  if (style === 'fibonacci') {
    const fib = [1, 1, 2, 3, 5, 8, 13];
    let i = 0;
    while (used < rows) {
      push(c % k, fib[i % fib.length]);
      c++;
      i++;
    }
  } else if (style === 'random') {
    let prev = -1;
    while (used < rows) {
      let color = Math.floor(rand() * k);
      if (color === prev && k > 1) color = (color + 1) % k;
      push(color, 1 + Math.floor(rand() * Math.max(1, band * 1.5)));
      prev = color;
    }
  } else if (style === 'gradient') {
    // Each color hands over to the next through alternating thin stripes.
    const seg = rows / k;
    for (let i = 0; i < k && used < rows; i++) {
      const solid = Math.max(1, Math.round(seg * 0.6));
      push(i, solid);
      if (i < k - 1) {
        for (let j = 0; j < Math.max(1, Math.round((seg - solid) / 2)); j++) {
          push(i + 1, 1);
          push(i, 1);
        }
      }
    }
    while (used < rows) push(k - 1, 1);
  } else if (style === 'mirror') {
    const half = [];
    let h = 0;
    while (h < rows / 2) {
      const n = Math.min(band, Math.ceil(rows / 2 - h));
      half.push({ color: c % k, rows: n });
      h += n;
      c++;
    }
    for (const s of half) push(s.color, s.rows);
    for (const s of [...half].reverse()) push(s.color, s.rows);
  } else {
    while (used < rows) {
      push(c % k, band);
      c++;
    }
  }
  return out;
}

/** Stripes as a worked pattern in rows of a basic stitch. */
export function stripesPattern({ seq, width = 40, stitch = 'sc' }) {
  const st = ['sc', 'hdc', 'dc'].includes(stitch) ? stitch : 'sc';
  const skip = { sc: 1, hdc: 2, dc: 3 }[st];
  const turn = { sc: 1, hdc: 2, dc: 2 }[st];
  const ord = { 1: '2nd', 2: '3rd', 3: '4th' }[skip];
  const lines = [`With Color ${colorLetter(seq[0]?.color ?? 0)}, ch ${width + skip}.`];
  let row = 1;
  seq.forEach((band, i) => {
    if (i > 0) lines.push(`Change to Color ${colorLetter(band.color)}.`);
    let rows = band.rows;
    if (row === 1) {
      const note = st === 'sc' ? '' : ' (skipped chs do not count as a st)';
      lines.push(`Row 1: ${st} in ${ord} ch from hook${note} and in each ch across, turn (${width})`);
      row = 2;
      rows--;
    }
    if (rows > 0) {
      const end = row + rows - 1;
      const label = end > row ? `Rows ${row}-${end}` : `Row ${row}`;
      const tc = st === 'sc' ? `ch ${turn}` : `ch ${turn} (does not count as a st)`;
      lines.push(`${label}: ${tc}, ${st} in each st across, turn (${width})`);
      row = end + 1;
    }
  });
  lines.push('Fasten off and weave in ends.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------

const IDEA = {
  make: ['market bag', 'bucket hat', 'cropped cardigan', 'granny square vest', 'plant hanger', 'cowl', 'tote bag', 'throw blanket', 'floor pouf', 'coaster set', 'balaclava', 'fingerless mitts', 'triangle shawl', 'bookmark', 'keychain charm', 'octopus plush', 'frog plush', 'mushroom plush', 'phone sling', 'headband', 'pillow cover', 'basket', 'baby booties', 'scrunchie set', 'tank top', 'beanie', 'table runner', 'pet bed', 'wall hanging', 'bralette'],
  stitch: ['moss stitch', 'waffle stitch', 'lemon peel', 'shells', 'puff stitches', 'bobbles', 'granny clusters', 'corner-to-corner blocks', 'tapestry colorwork', 'post-stitch ribbing', 'V-stitches', 'mosaic crochet', 'waistcoat stitch', 'filet mesh', 'spike stitches', 'Tunisian simple stitch'],
  yarn: ['a single skein', 'cotton', 'leftover scraps', 'mohair held double', 'chunky wool', 'fingering weight', 'recycled t-shirt yarn', 'a hand-dyed gradient', 'jute', 'your oldest stash yarn'],
  twist: ['in three colors only', 'with a surprise color in the last round', 'that works up in a weekend', 'as a gift for someone who needs cheering up', 'using zero new yarn', 'reversible, with no wrong side', 'with a picot edge', 'in a colorway pulled from a photo you took', 'sized for a child', 'with a pocket', 'with a checkerboard panel', 'that you could sell at a market'],
};

export function idea(seed) {
  const r = rng(seed);
  const pick = (list) => list[Math.floor(r() * list.length)];
  return { make: pick(IDEA.make), stitch: pick(IDEA.stitch), yarn: pick(IDEA.yarn), twist: pick(IDEA.twist) };
}
