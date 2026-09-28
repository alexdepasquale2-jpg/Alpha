// Calculators and reference data. Everything is pure; views format results.

// Craft Yarn Council standard weights. Gauge is single crochets per 4 in
// (10 cm) except lace, which is quoted in double crochet.
export const YARN_WEIGHTS = [
  { id: 0, name: 'Lace', aka: 'Thread, cobweb, 10-count', hook: [1.4, 2.25], sc: [32, 42], wpi: [30, 40], ypc: [600, 1000] },
  { id: 1, name: 'Super Fine', aka: 'Fingering, sock, baby', hook: [2.25, 3.5], sc: [21, 32], wpi: [14, 30], ypc: [350, 500] },
  { id: 2, name: 'Fine', aka: 'Sport, baby', hook: [3.5, 4.5], sc: [16, 20], wpi: [12, 18], ypc: [250, 350] },
  { id: 3, name: 'Light', aka: 'DK, light worsted', hook: [4.5, 5.5], sc: [12, 17], wpi: [11, 15], ypc: [200, 300] },
  { id: 4, name: 'Medium', aka: 'Worsted, aran, afghan', hook: [5.5, 6.5], sc: [11, 14], wpi: [9, 12], ypc: [150, 220] },
  { id: 5, name: 'Bulky', aka: 'Chunky, craft, rug', hook: [6.5, 9], sc: [8, 11], wpi: [6, 9], ypc: [100, 150] },
  { id: 6, name: 'Super Bulky', aka: 'Super chunky, roving', hook: [9, 15], sc: [7, 9], wpi: [5, 6], ypc: [40, 100] },
  { id: 7, name: 'Jumbo', aka: 'Jumbo, roving', hook: [15, 25], sc: [4, 6], wpi: [1, 4], ypc: [10, 40] },
];

export const weightById = (id) => YARN_WEIGHTS[Math.max(0, Math.min(7, Number(id) || 0))];

// Hook sizes. US letters follow the Craft Yarn Council chart; the UK column is
// the pre-metric numbering still printed on vintage patterns.
export const HOOKS = [
  { mm: 2.25, us: 'B-1', uk: '13' },
  { mm: 2.5, us: '—', uk: '12' },
  { mm: 2.75, us: 'C-2', uk: '12' },
  { mm: 3.0, us: '—', uk: '11' },
  { mm: 3.25, us: 'D-3', uk: '10' },
  { mm: 3.5, us: 'E-4', uk: '9' },
  { mm: 3.75, us: 'F-5', uk: '9' },
  { mm: 4.0, us: 'G-6', uk: '8' },
  { mm: 4.5, us: '7', uk: '7' },
  { mm: 5.0, us: 'H-8', uk: '6' },
  { mm: 5.5, us: 'I-9', uk: '5' },
  { mm: 6.0, us: 'J-10', uk: '4' },
  { mm: 6.5, us: 'K-10½', uk: '3' },
  { mm: 7.0, us: '—', uk: '2' },
  { mm: 8.0, us: 'L-11', uk: '0' },
  { mm: 9.0, us: 'M/N-13', uk: '00' },
  { mm: 10.0, us: 'N/P-15', uk: '000' },
  { mm: 11.5, us: 'P-16', uk: '—' },
  { mm: 12.0, us: '—', uk: '—' },
  { mm: 15.0, us: 'P/Q', uk: '—' },
  { mm: 15.75, us: 'Q', uk: '—' },
  { mm: 16.0, us: 'Q', uk: '—' },
  { mm: 19.0, us: 'S', uk: '—' },
  { mm: 25.0, us: 'T/U/X', uk: '—' },
];

// Steel hooks for thread work; numbering varies a little between brands.
export const STEEL_HOOKS = [
  { mm: 0.75, us: '14' }, { mm: 0.85, us: '13' }, { mm: 1.0, us: '12' }, { mm: 1.1, us: '11' },
  { mm: 1.3, us: '10' }, { mm: 1.4, us: '9' }, { mm: 1.5, us: '8' }, { mm: 1.65, us: '7' },
  { mm: 1.8, us: '6' }, { mm: 1.9, us: '5' }, { mm: 2.0, us: '4' }, { mm: 2.1, us: '3' },
];

export function hookFor(mm) {
  const n = Number(mm);
  if (!n) return null;
  const all = n < 2.2 ? STEEL_HOOKS.map((h) => ({ ...h, uk: '—', steel: true })) : HOOKS;
  return all.reduce((best, h) => (Math.abs(h.mm - n) < Math.abs(best.mm - n) ? h : best));
}

export function hookLabel(mm) {
  const h = hookFor(mm);
  if (!h) return '';
  const us = h.us && h.us !== '—' ? ` (${h.steel ? 'steel ' : ''}${h.us})` : '';
  return `${trim(h.mm)} mm${us}`;
}

/** The hook `steps` sizes up (+) or down (-) from mm in the standard run. */
export function stepHook(mm, steps) {
  const i = HOOKS.findIndex((h) => h.mm === hookFor(mm)?.mm);
  if (i < 0) return null;
  return HOOKS[Math.max(0, Math.min(HOOKS.length - 1, i + steps))];
}

export const IN_PER_CM = 1 / 2.54;
export const toCm = (v, unit) => (unit === 'in' ? v * 2.54 : v);
export const fromCm = (cm, unit) => (unit === 'in' ? cm / 2.54 : cm);

export function trim(n, places = 2) {
  if (!Number.isFinite(n)) return '—';
  return String(Number(n.toFixed(places)));
}

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

/**
 * Gauge is "sts per `per` units" (4 in or 10 cm). Returns stitches per cm.
 */
export const perCm = (sts, per = 10, unit = 'cm') => sts / toCm(per, unit);

/**
 * Compare your swatch with the pattern's gauge.
 * Returns how big the pattern will come out in your gauge and what to do.
 */
export function compareGauge({ patternSts, patternRows, mySts, myRows, hookMm }) {
  const out = {};
  if (patternSts > 0 && mySts > 0) {
    out.widthScale = patternSts / mySts; // >1: your piece comes out wider
    out.stDiffPct = (mySts / patternSts - 1) * 100;
  }
  if (patternRows > 0 && myRows > 0) {
    out.heightScale = patternRows / myRows;
    out.rowDiffPct = (myRows / patternRows - 1) * 100;
  }
  if (out.stDiffPct !== undefined) {
    const d = out.stDiffPct;
    if (Math.abs(d) < 3) out.advice = 'On gauge. Keep your hook.';
    else if (d > 0) out.advice = 'More stitches than the pattern: your fabric is tighter. Go up a hook size.';
    else out.advice = 'Fewer stitches than the pattern: your fabric is looser. Go down a hook size.';
    if (hookMm && Math.abs(d) >= 3) {
      // Roughly one hook size per 5-7% of stitch gauge.
      const steps = Math.max(-3, Math.min(3, Math.round(d / 6))) || Math.sign(d);
      const h = stepHook(hookMm, steps);
      if (h) out.suggestedHook = h.mm;
    }
  }
  return out;
}

/** Stitches (or rows) needed for a measurement at a gauge. */
export function countFor(length, gaugeSts, gaugePer) {
  if (!(gaugeSts > 0 && gaugePer > 0)) return 0;
  return (length * gaugeSts) / gaugePer;
}

/**
 * Starting chain for a width, respecting a stitch multiple:
 * "multiple of 6 + 2" -> the nearest 6k + 2 at or above the raw count.
 */
export function startingChain({ width, gaugeSts, gaugePer, multiple = 1, plus = 0, turning = 0 }) {
  const raw = countFor(width, gaugeSts, gaugePer);
  const m = Math.max(1, Math.round(multiple));
  const k = Math.max(1, Math.round((raw - plus) / m));
  const sts = k * m + plus;
  const actual = (sts / gaugeSts) * gaugePer;
  return { raw, sts, chain: sts + turning, repeats: k, actual };
}

// ---------------------------------------------------------------------------
// Even increases and decreases
// ---------------------------------------------------------------------------

/**
 * Spread `change` increases (positive) or decreases (negative) evenly across
 * `current` stitches and write the round or row.
 *
 *   distribute(60, 9)            -> "sc 3, inc, (sc 5, inc) x8, sc 3" style
 *   distribute(24, 6, {round})   -> "(sc 3, inc) x6"
 *
 * `offset` shifts where the first shaping stitch falls (stagger successive
 * rounds so a circle doesn't turn into a hexagon). Flat rows are centred so
 * shaping never lands on the edge stitches.
 */
export function distribute(current, change, opts = {}) {
  const { round = true, stitch = 'sc', offset = 0, invisible = false } = opts;
  const S = Math.round(current);
  const k = Math.round(Math.abs(change));
  const inc = change > 0;
  const result = { from: S, to: S + (inc ? k : -k), text: '', error: null };
  if (S <= 0) return { ...result, error: 'Start with at least one stitch.' };
  if (k === 0) return { ...result, text: `${plainWord(stitch, S, true)}` };
  if (inc && k > S) return { ...result, error: `You can add at most ${S} (an increase in every stitch) in one ${round ? 'round' : 'row'}.` };
  if (!inc && 2 * k > S) return { ...result, error: `You can remove at most ${Math.floor(S / 2)} (a decrease across every pair) in one ${round ? 'round' : 'row'}.` };

  const eats = inc ? 1 : 2;
  const plain = S - k * eats;
  // Bresenham spread of `plain` stitches into `k` gaps.
  const gaps = [];
  for (let i = 0; i < k; i++) gaps.push(Math.floor(((i + 1) * plain) / k) - Math.floor((i * plain) / k));
  // Unroll into a flat sequence of 'p' (plain) and 's' (shaping) units.
  let seq = [];
  for (const g of gaps) {
    for (let i = 0; i < g; i++) seq.push('p');
    seq.push('s');
  }
  // Rows are centred so shaping never sits on an edge; rounds rotate by
  // `offset` so successive rounds stagger.
  const unit = gaps[0] + 1;
  const move = round ? ((offset % unit) + unit) % unit : Math.floor(gaps[0] / 2);
  if (move) seq = [...seq.slice(move), ...seq.slice(0, move)];
  result.sequence = seq;
  result.text = formatSequence(seq, { stitch, inc, invisible });
  return result;
}

function plainWord(stitch, n, around = false) {
  if (around) return `${stitch} around`;
  if (stitch === 'sc') return `sc ${n}`;
  return n === 1 ? `${stitch} in next st` : `${stitch} in next ${n} sts`;
}

function shapeWord(stitch, inc, invisible) {
  if (inc) return stitch === 'sc' ? 'inc' : `2 ${stitch} in next st`;
  if (stitch === 'sc') return invisible ? 'invdec' : 'dec';
  return `${stitch}2tog`;
}

// Compress a p/s sequence into "(sc 2, inc) x6"-style text. Each shaping
// stitch is written with the plain stitches before it; alternating spacings
// ("sc 5, inc, sc 6, inc") are folded into one repeat.
function formatSequence(seq, { stitch, inc, invisible }) {
  const units = [];
  let run = 0;
  for (const u of seq) {
    if (u === 'p') run++;
    else {
      units.push(run);
      run = 0;
    }
  }
  const tail = run;
  const shape = shapeWord(stitch, inc, invisible);
  const one = (g) => (g > 0 ? `${plainWord(stitch, g)}, ${shape}` : shape);
  const parts = [];
  let j = 0;
  while (j < units.length) {
    let best = { p: 1, r: 1 };
    for (let p = 1; p <= 4 && j + p <= units.length; p++) {
      let r = 1;
      while (j + p * (r + 1) <= units.length && units.slice(j + p * r, j + p * (r + 1)).every((g, k) => g === units[j + k])) r++;
      if (r >= 2 && p * r > best.p * best.r) best = { p, r };
    }
    const block = units.slice(j, j + best.p);
    if (best.r === 1) parts.push(one(block[0]));
    else if (best.p === 1 && block[0] === 0) parts.push(`${shape} x${best.r}`);
    else parts.push(`(${block.map(one).join(', ')}) x${best.r}`);
    j += best.p * best.r;
  }
  if (tail > 0) parts.push(plainWord(stitch, tail));
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Yarn
// ---------------------------------------------------------------------------

// Yards of yarn one single crochet uses. At a yarn's standard gauge a sc
// takes about ten stitch-widths of yarn (calibrated against real projects: a
// worsted sc throw of 50 × 60 in takes ~3,000 yd, an hdc beanie ~130 yd).
// The yarn's thickness drives this more than the gauge does, so a tighter
// gauge (amigurumi) only trims it gently.
export function yardsPerSc({ weightId = 4, scPer4in = null } = {}) {
  const w = weightById(weightId);
  const standard = (w.sc[0] + w.sc[1]) / 2;
  const base = (10 * (4 / standard)) / 36;
  if (!scPer4in) return base;
  return base * Math.sqrt(Math.max(0.4, Math.min(2.5, standard / scPer4in)));
}

/** Yards for a stitch tally ({ sc: 120, dc: 40 }) from the stitch dictionary. */
export function yardsForTally(tally, stitchYarn, opts = {}) {
  const per = yardsPerSc(opts) * (opts.calibration || 1);
  let total = 0;
  for (const [id, n] of Object.entries(tally)) total += n * (stitchYarn(id) ?? 1) * per;
  return total;
}

/**
 * The swatch method: weigh a swatch, scale by area. The most accurate
 * estimate there is short of making the thing.
 */
export function yardageFromSwatch({ swatchW, swatchH, swatchGrams, targetW, targetH, yardsPerSkein, gramsPerSkein, pieces = 1 }) {
  const swatchArea = swatchW * swatchH;
  if (!(swatchArea > 0 && swatchGrams > 0)) return null;
  const grams = (targetW * targetH * pieces / swatchArea) * swatchGrams;
  const yardsPerGram = yardsPerSkein > 0 && gramsPerSkein > 0 ? yardsPerSkein / gramsPerSkein : null;
  const yards = yardsPerGram ? grams * yardsPerGram : null;
  return { grams, yards, skeins: gramsPerSkein > 0 ? grams / gramsPerSkein : null };
}

// Yarn per square inch by fabric: denser stitches eat more yarn.
const FABRIC = {
  sc: { perSc: 1, density: 1 },
  hdc: { perSc: 1.35, density: 0.62 },
  dc: { perSc: 1.7, density: 0.5 },
  granny: { perSc: 1.7, density: 0.42 },
  moss: { perSc: 1, density: 0.82 },
  c2c: { perSc: 1.7, density: 0.52 },
  texture: { perSc: 1, density: 1.45 },
};

export const FABRICS = [
  ['sc', 'Single crochet'],
  ['hdc', 'Half double'],
  ['dc', 'Double crochet'],
  ['granny', 'Granny / lacy'],
  ['moss', 'Moss / linen'],
  ['c2c', 'Corner to corner'],
  ['texture', 'Bobbles, waffle, post'],
];

/** Quick estimate from area when there's no swatch. */
export function quickYardage({ widthIn, heightIn, weightId = 4, fabric = 'sc' }) {
  const w = weightById(weightId);
  const g = (w.sc[0] + w.sc[1]) / 2;
  const scPerSqIn = (g / 4) * (g / 4) * 1.15; // sc rows are a little shorter than they are wide
  const f = FABRIC[fabric] || FABRIC.sc;
  const perSqIn = scPerSqIn * f.density * f.perSc * yardsPerSc({ weightId });
  const yards = widthIn * heightIn * perSqIn;
  return { yards, low: yards * 0.85, high: yards * 1.2 };
}

export function skeinsNeeded(yards, yardsPerSkein, buffer = 0.1) {
  if (!(yardsPerSkein > 0)) return null;
  return Math.ceil((yards * (1 + buffer)) / yardsPerSkein - 1e-9);
}

/**
 * Swap the pattern's yarn for another: how many skeins, and does it behave
 * the same? Yards per gram within ~10% is a good sign of similar thickness.
 */
export function substitute({ patYards, patGrams, patSkeins, subYards, subGrams }) {
  const totalYards = patYards * patSkeins;
  const out = { totalYards, skeins: skeinsNeeded(totalYards, subYards, 0) };
  if (patYards > 0 && patGrams > 0 && subYards > 0 && subGrams > 0) {
    const a = patYards / patGrams;
    const b = subYards / subGrams;
    out.densityDiffPct = (b / a - 1) * 100;
    const d = Math.abs(out.densityDiffPct);
    out.match = d <= 10 ? 'good' : d <= 20 ? 'close' : 'poor';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Time and money
// ---------------------------------------------------------------------------

/**
 * Minutes to work a stitch tally at `speed` single crochets per minute.
 * Stitch heights stand in for effort; bobbles and puffs are slow.
 */
export function minutesForTally(tally, stitchEffort, speed = 20) {
  let effort = 0;
  for (const [id, n] of Object.entries(tally)) effort += n * (stitchEffort(id) ?? 1);
  return effort / Math.max(1, speed);
}

export function pricing({ materials = 0, hours = 0, rate = 0, overheadPct = 10, markup = 2 }) {
  const labor = hours * rate;
  const base = materials + labor;
  const overhead = base * (overheadPct / 100);
  const wholesale = base + overhead;
  const retail = wholesale * markup;
  return { labor, overhead, wholesale, retail, perHourAtRetail: hours > 0 ? (retail - materials) / hours : null };
}

// ---------------------------------------------------------------------------
// Standard sizes (inches). From the Craft Yarn Council's size charts.
// ---------------------------------------------------------------------------

export const BLANKETS = [
  { name: 'Lovey / security', w: 14, h: 17 },
  { name: 'Stroller', w: 30, h: 35 },
  { name: 'Receiving', w: 40, h: 40 },
  { name: 'Crib', w: 45, h: 60 },
  { name: 'Toddler', w: 42, h: 52 },
  { name: 'Lapghan', w: 36, h: 48 },
  { name: 'Throw', w: 50, h: 60 },
  { name: 'Twin', w: 66, h: 90 },
  { name: 'Full', w: 80, h: 90 },
  { name: 'Queen', w: 90, h: 100 },
  { name: 'King', w: 108, h: 100 },
];

export const HEADS = [
  { name: 'Preemie', circ: 12, height: 4.5 },
  { name: 'Newborn', circ: 14, height: 5.5 },
  { name: 'Baby 3–6 mo', circ: 16, height: 6 },
  { name: 'Baby 6–12 mo', circ: 17.5, height: 6.5 },
  { name: 'Toddler', circ: 18.5, height: 7 },
  { name: 'Child', circ: 19.5, height: 7.5 },
  { name: 'Teen / adult S', circ: 21, height: 8 },
  { name: 'Adult M', circ: 22, height: 8.5 },
  { name: 'Adult L', circ: 23.5, height: 9 },
];

export const SCARVES = [
  { name: 'Child scarf', w: 5, h: 48 },
  { name: 'Adult scarf', w: 7, h: 70 },
  { name: 'Cowl', w: 10, h: 26 },
  { name: 'Infinity scarf', w: 10, h: 60 },
];

// ---------------------------------------------------------------------------
// Blocking and circles
// ---------------------------------------------------------------------------

/** Flat circle: rounds and final count to reach a diameter. */
export function flatCircle({ diameter, stsPerUnit, start = 6 }) {
  const circ = Math.PI * diameter;
  const target = circ * stsPerUnit;
  const rounds = Math.max(1, Math.round(target / start));
  return { rounds, sts: rounds * start, actualDiameter: (rounds * start) / stsPerUnit / Math.PI };
}
