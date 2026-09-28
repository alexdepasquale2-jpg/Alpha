// First-run sample content, so the studio has something in it to explore.
// Everything is marked `sample: true` and can be cleared from Settings.

import * as store from '../core/store.js';
import { packCells } from '../crochet/chart.js';

const WHALE_BODY = `Work in continuous rounds with Color A (blue).
Rnd 1: 6 sc in MR (6)
Rnd 2: inc x6 (12)
Rnd 3: (sc, inc) x6 (18)
Rnd 4: (sc 2, inc) x6 (24)
Rnd 5: (sc 3, inc) x6 (30)
Rnd 6: (sc 4, inc) x6 (36)
Rnds 7-12: sc around (36)
Change to Color B (oat) for the belly.
Rnds 13-15: sc around (36)
Place safety eyes between Rnds 9 and 10, about 8 stitches apart.
Rnd 16: (sc 4, invdec) x6 (30)
Rnd 17: (sc 3, invdec) x6 (24)
Rnd 18: (sc 2, invdec) x6 (18)
Stuff firmly.
Rnd 19: (sc, invdec) x6 (12)
Rnd 20: invdec x6 (6)
Fasten off. Weave the tail through the front loops and pull closed.`;

const WHALE_FINS = `Rnd 1: 5 sc in MR (5)
Rnd 2: (sc, inc) x2, sc (7)
Rnds 3-5: sc around (7)
Fasten off, leaving a tail for sewing. Do not stuff.`;

const WHALE_TAIL = `Rnd 1: 6 sc in MR (6)
Rnd 2: (sc, inc) x3 (9)
Rnd 3: (sc 2, inc) x3 (12)
Rnds 4-6: sc around (12)
Fold flat and sew the tail to the back of the body, just above the belly line.`;

const HEART = [
  '...............',
  '..XXX.....XXX..',
  '.XXXXX...XXXXX.',
  'XXXXXXX.XXXXXXX',
  'XXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXX',
  '.XXXXXXXXXXXXX.',
  '..XXXXXXXXXXX..',
  '...XXXXXXXXX...',
  '....XXXXXXX....',
  '.....XXXXX.....',
  '......XXX......',
  '.......X.......',
];

const DAY = 86400000;

export async function seedIfFirstRun() {
  if (store.metaGet('seeded')) return false;
  const now = Date.now();
  const yarns = [
    { brand: 'Loom & Lark', line: 'Coastal Cotton', colorway: 'Harbor', hex: '#2f6690', weight: 3, fiber: '100% cotton', yardsPerSkein: 137, gramsPerSkein: 50, skeins: 3, price: 4.5, location: 'Bin A' },
    { brand: 'Loom & Lark', line: 'Coastal Cotton', colorway: 'Oat', hex: '#efe3cc', weight: 3, fiber: '100% cotton', yardsPerSkein: 137, gramsPerSkein: 50, skeins: 2, price: 4.5, location: 'Bin A' },
    { brand: 'Hearthside', line: 'Wool Worsted', colorway: 'Rust', hex: '#b7410e', weight: 4, fiber: 'Wool', yardsPerSkein: 200, gramsPerSkein: 100, skeins: 6, price: 8, location: 'Shelf 2' },
    { brand: 'Hearthside', line: 'Wool Worsted', colorway: 'Sage', hex: '#9caf88', weight: 4, fiber: 'Wool', yardsPerSkein: 200, gramsPerSkein: 100, skeins: 4, price: 8, location: 'Shelf 2' },
    { brand: 'Meadowfield', line: 'Merino Sport', colorway: 'Honey', hex: '#e1ad01', weight: 2, fiber: 'Merino', yardsPerSkein: 270, gramsPerSkein: 100, skeins: 1.5, price: 12, location: 'Shelf 2' },
  ];
  const yarnRows = [];
  for (const y of yarns) yarnRows.push(await store.put('yarns', { ...y, sample: true }, { silent: true }));
  for (const mm of [2.5, 3.5, 4, 5, 6]) await store.put('tools', { kind: 'hook', mm, material: mm < 4 ? 'Aluminium' : 'Ergonomic', qty: 1, sample: true }, { silent: true });
  await store.put('tools', { kind: 'notion', name: 'Safety eyes, 8 mm', qty: 12, sample: true }, { silent: true });
  await store.put('tools', { kind: 'notion', name: 'Locking stitch markers', qty: 20, sample: true }, { silent: true });
  await store.put('tools', { kind: 'notion', name: 'Polyester fiberfill', qty: 1, notes: 'About half a bag left', sample: true }, { silent: true });

  const pattern = await store.put('patterns', {
    title: 'Pocket Whale',
    designer: 'Loopwright sample',
    category: 'Amigurumi',
    difficulty: 2,
    terms: 'US',
    yarnWeight: 3,
    hookMm: 3.5,
    gauge: { sts: 22, rows: 24, per: 4, unit: 'in' },
    size: 'About 4 in / 10 cm long',
    materials: 'DK cotton in blue (Color A, about 45 yd) and oat (Color B, about 20 yd). 3.5 mm hook. 8 mm safety eyes. Fiberfill. Stitch marker, yarn needle.',
    notes: 'Worked in continuous rounds. Move your stitch marker up at the start of every round.',
    sections: [
      { id: 's1', name: 'Body', text: WHALE_BODY, pieces: 1 },
      { id: 's2', name: 'Fins', text: WHALE_FINS, pieces: 2 },
      { id: 's3', name: 'Tail', text: WHALE_TAIL, pieces: 1 },
    ],
    tags: ['amigurumi', 'beginner'],
    sample: true,
  }, { silent: true });

  await store.put('patterns', {
    title: 'Everyday Ribbed Cowl',
    designer: 'Loopwright sample',
    category: 'Scarf & cowl',
    difficulty: 1,
    terms: 'US',
    yarnWeight: 4,
    hookMm: 5.5,
    sizes: ['S', 'M', 'L'],
    gauge: { sts: 14, rows: 16, per: 4, unit: 'in' },
    size: 'Circumference 20 (24, 28) in, 11 in deep',
    materials: 'Worsted wool, about 260 (310, 360) yd. 5.5 mm hook. Yarn needle.',
    notes: 'A graded pattern: numbers for M and L follow in brackets. Pick your size on the project page and the tracker shows only your numbers. Worked sideways in back-loop single crochet, then seamed into a loop.',
    sections: [{ id: 's1', name: 'Cowl', text: 'Ch 41.\nRow 1: sc in 2nd ch from hook and in each ch across, turn (40)\nRows 2-80 (96, 112): ch 1, sc in BLO of each st across, turn (40)\nFasten off, leaving a long tail. Whipstitch the first and last rows together.', pieces: 1 }],
    tags: ['cowl', 'graded'],
    sample: true,
  }, { silent: true });

  await store.put('projects', {
    name: 'Pocket Whale for Mira',
    status: 'active',
    patternId: pattern.id,
    category: 'Amigurumi',
    recipient: 'Mira',
    deadline: now + 12 * DAY,
    startedAt: now - 3 * DAY,
    hookMm: 3.5,
    yarns: [{ yarnId: yarnRows[0].id, yards: 45 }, { yarnId: yarnRows[1].id, yards: 20 }],
    notes: 'Birthday present. She asked for "a whale that smiles".',
    counters: [{ id: 'c1', name: 'Round', value: 7, linked: true }],
    pos: { step: 7, atom: 0 },
    timeMs: 85 * 60000,
    sessions: [{ start: now - 2 * DAY, end: now - 2 * DAY + 50 * 60000 }, { start: now - DAY, end: now - DAY + 35 * 60000 }],
    photoIds: [],
    tags: ['gift'],
    sample: true,
  }, { silent: true });
  await store.put('projects', {
    name: 'Sunday Throw', status: 'queued', category: 'Blanket', hookMm: 5.5,
    yarns: [{ yarnId: yarnRows[2].id, yards: 700 }, { yarnId: yarnRows[3].id, yards: 700 }],
    notes: 'Granny squares in rust and sage. Try the blanket planner in Imagine.', counters: [], photoIds: [], sample: true,
  }, { silent: true });
  await store.put('projects', {
    name: 'Market bag in cotton', status: 'idea', category: 'Bag', notes: 'Mesh body, solid base, long straps.', counters: [], photoIds: [], sample: true,
  }, { silent: true });
  await store.put('projects', {
    name: 'Harvest Beanie', status: 'done', category: 'Hat', hookMm: 5, startedAt: now - 30 * DAY, finishedAt: now - 21 * DAY,
    yarns: [{ yarnId: yarnRows[4].id, yards: 160 }], timeMs: 6.5 * 3600000, counters: [], photoIds: [], sample: true,
  }, { silent: true });

  await store.put('palettes', { name: 'Harbor', colors: ['#2f6690', '#efe3cc', '#b7410e', '#9caf88', '#e1ad01'], sample: true }, { silent: true });
  const cells = HEART.flatMap((row) => [...row].map((ch) => (ch === 'X' ? 1 : 0)));
  await store.put('charts', { name: 'Little heart', w: 15, h: 13, palette: ['#efe3cc', '#b7410e'], cells: packCells(cells), mode: 'c2c', sample: true }, { silent: true });
  await store.put('shopping', { text: 'Fiberfill, 1 bag', done: false, sample: true }, { silent: true });
  await store.put('people', { name: 'Mira', relation: 'Niece, age 6', color: '#7a4a78', birthday: new Date(2020, new Date(now + 12 * DAY).getMonth(), new Date(now + 12 * DAY).getDate(), 12).getTime(), m: { head: 20, hand: 6 }, likes: 'Blue, purple, anything with a face', avoid: 'Scratchy wool', sample: true }, { silent: true });

  await store.metaSet('seeded', now);
  return true;
}

export async function clearSamples() {
  let n = 0;
  for (const s of ['projects', 'patterns', 'charts', 'yarns', 'tools', 'palettes', 'journal', 'shopping', 'people']) {
    for (const row of store.all(s)) {
      if (row.sample) {
        await store.remove(s, row.id);
        n++;
      }
    }
  }
  return n;
}
