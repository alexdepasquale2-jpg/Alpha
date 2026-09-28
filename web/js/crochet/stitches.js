// The stitch dictionary. US terms are canonical everywhere in Loopwright; UK
// names ride along for display and conversion.
//
// Counting fields:  c = stitches of the previous row this stitch is worked
// into, p = stitches it leaves behind to be worked into next row. The pattern
// checker is built on these two numbers.
//
// Symbols are drawn in a 40x40 box, stitch standing upright with its base
// near y=34. `d` is stroked, `fill` is filled.

const X = (cx, cy, r = 6) =>
  `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`;

export const SYMBOLS = {
  ch: { d: 'M11 20a9 5 0 1 0 18 0a9 5 0 1 0 -18 0' },
  slst: { fill: 'M15 20a5 3.6 0 1 0 10 0a5 3.6 0 1 0 -10 0' },
  sc: { d: X(20, 20, 7) },
  hdc: { d: 'M12 7H28M20 7V34' },
  dc: { d: 'M12 6H28M20 6V35M14.5 23L25.5 16' },
  tr: { d: 'M12 4H28M20 4V36M14.5 18L25.5 11M14.5 26L25.5 19' },
  dtr: { d: 'M12 3H28M20 3V37M14.5 14L25.5 8M14.5 21L25.5 15M14.5 28L25.5 22' },
  inc: { d: 'M20 35L14 22M20 35L26 22' + X(12, 14, 5) + X(28, 14, 5) },
  dec: { d: 'M20 6L14 19M20 6L26 19' + X(12, 27, 5) + X(28, 27, 5) },
  invdec: { d: 'M20 6L14 19M20 6L26 19' + X(12, 27, 5) + X(28, 27, 5) + 'M17 36h6' },
  hdc2tog: { d: 'M13 6H27M20 6L12 35M20 6L28 35' },
  dc2tog: { d: 'M13 5H27M20 5L12 36M20 5L28 36M11 24L18 18M22 18L29 24' },
  dc3tog: { d: 'M13 5H27M20 5L10 36M20 5V36M20 5L30 36M10 22l7-5M17 26l6-4M23 17l7 5' },
  fpdc: { d: 'M12 6H28M20 6V31M14.5 22L25.5 15M20 31c0 5 7 5 7 0' },
  bpdc: { d: 'M12 6H28M20 6V31M14.5 22L25.5 15M20 31c0 5 -7 5 -7 0' },
  blo: { d: X(20, 16, 7) + 'M12 31q8 7 16 0' },
  flo: { d: X(20, 14, 7) + 'M12 34q8 -7 16 0' },
  camel: { d: 'M12 7H28M20 7V30M13 33q7 -5 14 0' },
  bobble: { d: 'M13 5H27M20 5C9 14 9 26 20 35C31 26 31 14 20 5ZM15 19l10 -5M15 25l10 -5' },
  puff: { d: 'M20 5C10 14 10 26 20 35C30 26 30 14 20 5ZM20 5C16 14 16 26 20 35M20 5C24 14 24 26 20 35' },
  popcorn: { d: 'M20 36L8 12M20 36L14 8M20 36V6M20 36L26 8M20 36L32 12M8 12Q20 -2 32 12' },
  shell: { d: 'M20 36L6 14M20 36L11 7M20 36V4M20 36L29 7M20 36L34 14' },
  vst: { d: 'M20 36L11 8M20 36L29 8M7 8h8M25 8h8M12 22l5 -4M23 18l5 4M17 8a3 2 0 1 0 6 0a3 2 0 1 0 -6 0' },
  xst: { d: 'M12 35L28 6M28 35L12 6M8 6h8M24 6h8M14 26l4 -5M22 21l4 5' },
  spike: { d: X(20, 10, 6) + 'M20 16V38M16 34l4 4l4 -4' },
  crab: { d: X(20, 16, 7) + 'M28 31H12M16 27l-4 4l4 4' },
  picot: { d: 'M20 22a7 7 0 1 1 0.1 0', fill: 'M17 30a3 2.4 0 1 0 6 0a3 2.4 0 1 0 -6 0' },
  esc: { d: X(20, 13, 6) + 'M20 19V35M16 27h8' },
  mr: { d: 'M30 20a10 10 0 1 1 -20 0a10 10 0 1 1 20 0', dash: true },
  fsc: { d: X(20, 13, 6) + 'M13 30a7 4 0 1 0 14 0a7 4 0 1 0 -14 0' },
  waistcoat: { d: 'M20 10V30M10 20H30', fill: 'M17.5 20a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0' },
  sk: { d: 'M12 20h16', dash: true },
};

// Stitches the checker understands, with their counting and height (in sc
// heights) for yardage and diagram layout.
export const STITCHES = [
  {
    id: 'ch', us: 'ch', uk: 'ch', name: 'Chain', ukName: 'Chain', cat: 'basic', level: 1,
    c: 0, p: 1, h: 0.4, yarn: 0.35,
    steps: ['Make a slip knot and put it on your hook.', 'Yarn over.', 'Pull the yarn through the loop on your hook. That is one chain.'],
    tip: 'Tight foundation chains pucker the bottom edge. If yours does, chain with a hook one or two sizes up and switch back for Row 1.',
  },
  {
    id: 'slst', us: 'sl st', uk: 'ss', name: 'Slip stitch', ukName: 'Slip stitch', cat: 'basic', level: 1,
    c: 1, p: 1, h: 0.2, yarn: 0.5,
    steps: ['Insert the hook into the stitch.', 'Yarn over.', 'Pull through the stitch and the loop on your hook in one motion.'],
    tip: 'Used for joining rounds and moving along the work without adding height. A joining slip stitch never counts as a stitch.',
  },
  {
    id: 'sc', us: 'sc', uk: 'dc', name: 'Single crochet', ukName: 'Double crochet', cat: 'basic', level: 1,
    c: 1, p: 1, h: 1, yarn: 1, turn: 1,
    steps: ['Insert the hook into the stitch.', 'Yarn over and pull up a loop (2 loops on hook).', 'Yarn over and pull through both loops.'],
    tip: 'Turning chain is ch 1 and does not count as a stitch. The first sc goes into the very first stitch.',
  },
  {
    id: 'hdc', us: 'hdc', uk: 'htr', name: 'Half double crochet', ukName: 'Half treble', cat: 'basic', level: 1,
    c: 1, p: 1, h: 1.5, yarn: 1.35, turn: 2,
    steps: ['Yarn over, insert the hook into the stitch.', 'Yarn over and pull up a loop (3 loops on hook).', 'Yarn over and pull through all 3 loops.'],
    tip: 'Turning chain is ch 2. Most modern patterns say it does not count; check the pattern notes.',
  },
  {
    id: 'dc', us: 'dc', uk: 'tr', name: 'Double crochet', ukName: 'Treble', cat: 'basic', level: 1,
    c: 1, p: 1, h: 2, yarn: 1.7, turn: 3,
    steps: ['Yarn over, insert the hook into the stitch.', 'Yarn over and pull up a loop (3 loops on hook).', 'Yarn over, pull through 2 loops (2 left).', 'Yarn over, pull through the last 2.'],
    tip: 'A ch 3 turning chain traditionally counts as the first dc, so the first real dc goes into the second stitch. A stacked sc + ch 1 or a chainless start gives a neater edge.',
  },
  {
    id: 'tr', us: 'tr', uk: 'dtr', name: 'Treble crochet', ukName: 'Double treble', cat: 'basic', level: 2,
    c: 1, p: 1, h: 3, yarn: 2.3, turn: 4,
    steps: ['Yarn over twice, insert the hook into the stitch.', 'Yarn over and pull up a loop (4 loops on hook).', '[Yarn over, pull through 2 loops] 3 times.'],
    tip: 'Also called triple crochet. Turning chain is ch 4 and usually counts as a stitch.',
  },
  {
    id: 'dtr', us: 'dtr', uk: 'trtr', name: 'Double treble', ukName: 'Triple treble', cat: 'basic', level: 2,
    c: 1, p: 1, h: 4, yarn: 2.9, turn: 5,
    steps: ['Yarn over 3 times, insert the hook into the stitch.', 'Yarn over and pull up a loop (5 loops on hook).', '[Yarn over, pull through 2 loops] 4 times.'],
    tip: 'Tall and lacy. Keep tension even through every pull or the post will twist.',
  },
  {
    id: 'inc', us: 'inc', uk: 'inc', name: 'Increase', ukName: 'Increase', cat: 'shaping', level: 1,
    c: 1, p: 2, h: 1, yarn: 2,
    steps: ['Work a single crochet into the stitch.', 'Work a second single crochet into the same stitch.'],
    tip: 'Unless a pattern says otherwise, "inc" means 2 sc in one stitch. Stagger increases between rounds so a circle stays round instead of turning hexagonal.',
  },
  {
    id: 'dec', us: 'sc2tog', uk: 'dc2tog', name: 'Single crochet decrease', ukName: 'Double crochet decrease', cat: 'shaping', level: 1,
    c: 2, p: 1, h: 1, yarn: 1.3,
    steps: ['Insert the hook into the next stitch, yarn over, pull up a loop.', 'Insert into the following stitch, yarn over, pull up a loop (3 loops on hook).', 'Yarn over and pull through all 3.'],
    tip: 'Two stitches become one. Written "dec" in most amigurumi patterns.',
  },
  {
    id: 'invdec', us: 'invdec', uk: 'invdec', name: 'Invisible decrease', ukName: 'Invisible decrease', cat: 'shaping', level: 2,
    c: 2, p: 1, h: 1, yarn: 1.2,
    steps: ['Insert the hook into the front loop only of the next stitch.', 'Without yarning over, insert into the front loop of the following stitch (3 loops on hook).', 'Yarn over, pull through the 2 front loops.', 'Yarn over, pull through the remaining 2 loops.'],
    tip: 'The amigurumi standard: it leaves no gap or bump on the right side.',
  },
  {
    id: 'hdc2tog', us: 'hdc2tog', uk: 'htr2tog', name: 'Half double decrease', ukName: 'Half treble decrease', cat: 'shaping', level: 2,
    c: 2, p: 1, h: 1.5, yarn: 2,
    steps: ['[Yarn over, insert into the next stitch, yarn over, pull up a loop] twice (5 loops on hook).', 'Yarn over and pull through all 5.'],
    tip: 'Pull the loops up to an even height before the final yarn over.',
  },
  {
    id: 'dc2tog', us: 'dc2tog', uk: 'tr2tog', name: 'Double crochet decrease', ukName: 'Treble decrease', cat: 'shaping', level: 2,
    c: 2, p: 1, h: 2, yarn: 2.6,
    steps: ['Yarn over, insert into the next stitch, yarn over, pull up a loop, yarn over, pull through 2 (2 on hook).', 'Yarn over, insert into the following stitch, yarn over, pull up a loop, yarn over, pull through 2 (3 on hook).', 'Yarn over and pull through all 3.'],
    tip: 'Every "Ntog" works the same way: leave the last loop of each stitch on the hook, then close them all at once.',
  },
  {
    id: 'blo', us: 'BLO', uk: 'BLO', name: 'Back loop only', ukName: 'Back loop only', cat: 'technique', level: 1,
    steps: ['Look down at the top of the stitch: two loops form a V.', 'Insert the hook under the loop farther from you only.', 'Complete the stitch as normal.'],
    tip: 'Leaves the front loop as a horizontal ridge. Great for ribbing, and for a crisp fold where a flat base turns into walls.',
  },
  {
    id: 'flo', us: 'FLO', uk: 'FLO', name: 'Front loop only', ukName: 'Front loop only', cat: 'technique', level: 1,
    steps: ['Look down at the top of the stitch: two loops form a V.', 'Insert the hook under the loop nearer you only.', 'Complete the stitch as normal.'],
    tip: 'Leaves the back loops free, so you can come back later and work ruffles, frills or a second layer into them.',
  },
  {
    id: 'camel', us: 'hdc 3rd lp', uk: 'htr 3rd lp', name: 'Camel stitch (third loop hdc)', ukName: 'Camel stitch', cat: 'technique', level: 2,
    c: 1, p: 1, h: 1.5, yarn: 1.35,
    steps: ['Tip the work toward you: below the back loop of an hdc is a third, horizontal loop.', 'Work the hdc into that third loop only.'],
    tip: 'Rows of it look like knit stockinette on one side. Common for brims and knit-look garments.',
  },
  {
    id: 'fpdc', us: 'FPdc', uk: 'FPtr', name: 'Front post double crochet', ukName: 'Front post treble', cat: 'post', level: 2,
    c: 1, p: 1, h: 2, yarn: 2,
    steps: ['Yarn over.', 'Insert the hook from front to back to front around the post of the stitch below, so the post sits on the hook.', 'Yarn over, pull up a loop, and finish as a double crochet.'],
    tip: 'Pushes the post toward you. Alternate with BPdc for ribbing, stack it for cables.',
  },
  {
    id: 'bpdc', us: 'BPdc', uk: 'BPtr', name: 'Back post double crochet', ukName: 'Back post treble', cat: 'post', level: 2,
    c: 1, p: 1, h: 2, yarn: 2,
    steps: ['Yarn over.', 'Insert the hook from back to front to back around the post of the stitch below.', 'Yarn over, pull up a loop, and finish as a double crochet.'],
    tip: 'Pushes the post away from you. On a wrong-side row it reads as a front post from the right side.',
  },
  {
    id: 'bobble', us: 'bobble', uk: 'bobble', name: 'Bobble (5-dc)', ukName: 'Bobble (5-tr)', cat: 'texture', level: 3,
    c: 1, p: 1, h: 2, yarn: 6,
    steps: ['[Yarn over, insert into the same stitch, yarn over, pull up a loop, yarn over, pull through 2] 5 times (6 loops on hook).', 'Yarn over and pull through all 6.', 'Chain 1 to lock it if the pattern asks.'],
    tip: 'Bobbles pop toward the back of the work, so they are usually made on wrong-side rows between rows of sc.',
  },
  {
    id: 'puff', us: 'puff', uk: 'puff', name: 'Puff stitch', ukName: 'Puff stitch', cat: 'texture', level: 3,
    c: 1, p: 1, h: 2, yarn: 5,
    steps: ['[Yarn over, insert into the stitch, yarn over, pull up a loop to dc height] 4 times (9 loops on hook).', 'Yarn over and pull through all 9.', 'Chain 1 to close.'],
    tip: 'Keep every loop the same height, and use a smooth yarn: fuzzy yarn makes pulling through 9 loops painful.',
  },
  {
    id: 'popcorn', us: 'pc', uk: 'pc', name: 'Popcorn', ukName: 'Popcorn', cat: 'texture', level: 3,
    c: 1, p: 1, h: 2, yarn: 6,
    steps: ['Work 5 dc into the same stitch.', 'Drop the loop from the hook.', 'Insert the hook front to back into the top of the first dc, pick up the dropped loop and pull it through.'],
    tip: 'Pops toward the side you insert the hook from. Insert back to front on wrong-side rows to keep them facing out.',
  },
  {
    id: 'shell', us: 'shell', uk: 'shell', name: 'Shell (5-dc)', ukName: 'Shell (5-tr)', cat: 'texture', level: 1,
    c: 1, p: 1, h: 2, yarn: 8.5,
    steps: ['Work 5 double crochet into the same stitch.'],
    tip: 'Shells are usually separated by skipped stitches and anchored with a sc so the fabric stays flat. Counted as one unit.',
  },
  {
    id: 'vst', us: 'V-st', uk: 'V-st', name: 'V-stitch', ukName: 'V-stitch', cat: 'texture', level: 1,
    c: 1, p: 1, h: 2, yarn: 3.8,
    steps: ['Work (dc, ch 1, dc) into the same stitch.'],
    tip: 'On the next row, work into the ch-1 space at the center of each V. Counted as one unit.',
  },
  {
    id: 'xst', us: 'X-st', uk: 'X-st', name: 'Crossed double crochet', ukName: 'Crossed treble', cat: 'texture', level: 2,
    c: 2, p: 2, h: 2, yarn: 3.6,
    steps: ['Skip the next stitch and dc in the following stitch.', 'Working behind (or in front of) that dc, dc in the skipped stitch.'],
    tip: 'Keep the second dc loose enough that it does not squash the first.',
  },
  {
    id: 'spike', us: 'spike sc', uk: 'spike dc', name: 'Spike stitch', ukName: 'Spike stitch', cat: 'texture', level: 2,
    c: 1, p: 1, h: 1, yarn: 1.8,
    steps: ['Insert the hook into the stitch one or more rows below the next stitch.', 'Yarn over and pull up a long loop to the height of the current row.', 'Yarn over and pull through both loops.'],
    tip: 'Best in a contrasting color, where the long loops read as stripes of stitching.',
  },
  {
    id: 'crab', us: 'rev sc', uk: 'rev dc', name: 'Crab stitch (reverse sc)', ukName: 'Crab stitch', cat: 'edging', level: 2,
    c: 1, p: 1, h: 1, yarn: 1.1,
    steps: ['Do not turn. Working left to right (right-handed), insert into the next stitch to the right.', 'Yarn over, pull up a loop, twisting the hook down.', 'Yarn over and pull through both loops.'],
    tip: 'Makes a corded, rope-like edge. It feels awkward for the first dozen stitches for everyone.',
  },
  {
    id: 'picot', us: 'picot', uk: 'picot', name: 'Picot', ukName: 'Picot', cat: 'edging', level: 1,
    c: 0, p: 0, h: 0.6, yarn: 1.2,
    steps: ['Chain 3.', 'Slip stitch into the third chain from the hook (or the top of the last stitch).'],
    tip: 'A small decorative bump for edgings. It does not count as a stitch.',
  },
  {
    id: 'esc', us: 'esc', uk: 'edc', name: 'Extended single crochet', ukName: 'Extended double crochet', cat: 'basic', level: 2,
    c: 1, p: 1, h: 1.3, yarn: 1.2,
    steps: ['Insert into the stitch, yarn over, pull up a loop (2 loops on hook).', 'Yarn over, pull through 1 loop.', 'Yarn over, pull through both loops.'],
    tip: 'Drapier than sc and a little taller; a good swap for sc when fabric feels stiff.',
  },
  {
    id: 'mr', us: 'MR', uk: 'MR', name: 'Magic ring', ukName: 'Magic ring', cat: 'foundation', level: 2,
    c: 0, p: 0, h: 0, yarn: 0,
    steps: ['Wrap the yarn around two fingers so the tail crosses over the working yarn.', 'Insert the hook under both strands, pull up a loop and chain 1 to secure.', 'Work the first round of stitches over both strands of the ring.', 'Pull the tail to close the center completely.'],
    tip: 'Weave the tail back through the first round in the opposite direction before cutting, or the ring can loosen with wear.',
  },
  {
    id: 'fsc', us: 'fsc', uk: 'fdc', name: 'Foundation single crochet', ukName: 'Foundation double crochet', cat: 'foundation', level: 3,
    c: 0, p: 1, h: 1, yarn: 1.4,
    steps: ['Ch 2, insert into the 2nd ch from hook, yarn over, pull up a loop.', 'Yarn over, pull through 1 (this is the "chain").', 'Yarn over, pull through 2 (this is the "sc").', 'Insert into the chain made in step 2 and repeat.'],
    tip: 'Makes a chain and first row at once, with a stretchy edge that matches the rest of the fabric.',
  },
  {
    id: 'waistcoat', us: 'csc', uk: 'cdc', name: 'Waistcoat stitch (center sc)', ukName: 'Waistcoat stitch', cat: 'texture', level: 2,
    c: 1, p: 1, h: 1, yarn: 1,
    steps: ['Work in the round without turning.', 'Insert the hook through the center of the V of the stitch below, between its two legs.', 'Complete a single crochet.'],
    tip: 'Looks like knitting. It is dense: go up a hook size or two.',
  },
];

// Stitch patterns: repeatable fabrics with a stitch multiple.
export const STITCH_PATTERNS = [
  {
    id: 'moss', name: 'Moss stitch', aka: 'Linen stitch, granite stitch', multiple: 2, plus: 0, level: 1,
    about: 'A flat, woven-looking fabric that doesn\'t curl. The go-to stitch for blankets and scarves that look good on both sides.',
    rows: [
      'Ch an even number.',
      'Row 1: sc in 4th ch from hook, *ch 1, sk next ch, sc in next ch; rep from * across, turn.',
      'Row 2: ch 2, sc in first ch-1 sp, *ch 1, sc in next ch-1 sp; rep from * across, working the last sc in the turning ch-sp, turn.',
      'Repeat Row 2.',
    ],
  },
  {
    id: 'lemon', name: 'Lemon peel', aka: 'Alternating sc/dc', multiple: 2, plus: 1, level: 1,
    about: 'Alternating short and tall stitches make a bumpy, dense texture like citrus rind. Good for washcloths and bags.',
    rows: [
      'Ch an odd number.',
      'Row 1: sc in 2nd ch from hook, dc in next ch, *sc in next ch, dc in next ch; rep from * across, turn.',
      'Row 2: ch 1, sc in first dc, dc in next sc, *sc in next dc, dc in next sc; rep from * across, turn.',
      'Repeat Row 2.',
    ],
  },
  {
    id: 'shellrow', name: 'Classic shells', aka: 'Shell stitch', multiple: 6, plus: 2, level: 2,
    about: 'Fans of 5 dc anchored by single crochets. Drapey and pretty for shawls, baby blankets and edgings.',
    rows: [
      'Ch a multiple of 6 plus 2.',
      'Row 1: sc in 2nd ch from hook, *sk 2 ch, 5 dc in next ch, sk 2 ch, sc in next ch; rep from * across, turn.',
      'Row 2: ch 3 (counts as dc), 2 dc in first sc, *sk 2 dc, sc in next dc, sk 2 dc, 5 dc in next sc; rep from * across, ending with 3 dc in the last sc, turn.',
      'Row 3: ch 1, sc in first dc, *sk 2 dc, 5 dc in next sc, sk 2 dc, sc in next dc; rep from * across, ending with sc in the top of the turning ch, turn.',
      'Repeat Rows 2 and 3.',
    ],
  },
  {
    id: 'waffle', name: 'Waffle stitch', aka: '', multiple: 3, plus: 2, level: 2,
    about: 'Front post stitches build a thick grid of little pockets. Very warm, very squishy, and hungry for yarn.',
    rows: [
      'Ch a multiple of 3 plus 2.',
      'Row 1: dc in 4th ch from hook and in each ch across, turn.',
      'Row 2: ch 3 (counts as dc), *FPdc around next st, dc in next 2 sts; rep from * to last 2 sts, FPdc around next st, dc in top of turning ch, turn.',
      'Row 3: ch 3 (counts as dc), *dc in next st, FPdc around each of next 2 sts; rep from * to last 2 sts, dc in next st, dc in top of turning ch, turn.',
      'Repeat Rows 2 and 3.',
    ],
  },
  {
    id: 'suzette', name: 'Suzette stitch', aka: '', multiple: 2, plus: 0, level: 1,
    about: 'Pairs of (sc, dc) worked into the same stitch lean into each other for a textured, closed fabric.',
    rows: [
      'Ch an even number.',
      'Row 1: (sc, dc) in 2nd ch from hook, *sk next ch, (sc, dc) in next ch; rep from * to last 2 ch, sk next ch, sc in last ch, turn.',
      'Row 2: ch 1, (sc, dc) in first sc, *sk next dc, (sc, dc) in next sc; rep from * to last 2 sts, sk next dc, sc in last sc, turn.',
      'Repeat Row 2.',
    ],
  },
  {
    id: 'blorib', name: 'Ribbing (sc BLO)', aka: 'Brim ribbing', multiple: 1, plus: 1, level: 1,
    about: 'Worked sideways: the chain sets the depth of the rib, and the number of rows sets the length. Stretchy brims and cuffs.',
    rows: [
      'Ch the depth of the rib plus 1.',
      'Row 1: sc in 2nd ch from hook and in each ch across, turn.',
      'Row 2: ch 1, sc in BLO of each st across, turn.',
      'Repeat Row 2 until the rib is long enough, then seam the ends.',
    ],
  },
  {
    id: 'postrib', name: 'Post-stitch ribbing', aka: 'FPdc/BPdc rib', multiple: 2, plus: 0, level: 2,
    about: 'The classic knit-look 1×1 rib for hat bands and sweater hems. Worked lengthwise, so the rows are the rib height.',
    rows: [
      'Row 1: dc across an even number of sts, turn.',
      'Row 2: ch 2 (does not count), *FPdc around next st, BPdc around next st; rep from * across, turn.',
      'Row 3: ch 2, work FPdc around each FPdc and BPdc around each BPdc as they face you, turn.',
      'Repeat Row 3.',
    ],
  },
  {
    id: 'camelrib', name: 'Knit-look hdc', aka: 'Camel stitch fabric', multiple: 1, plus: 2, level: 2,
    about: 'Working hdc into the third loop on every row pushes the front loops forward into knit-like Vs.',
    rows: [
      'Ch the width plus 2.',
      'Row 1: hdc in 3rd ch from hook and in each ch across, turn.',
      'Row 2: ch 1, hdc in the 3rd loop of each st across, turn.',
      'Repeat Row 2.',
    ],
  },
];

export const STITCH_CATEGORIES = [
  ['basic', 'Basics'],
  ['shaping', 'Increase & decrease'],
  ['technique', 'Loops'],
  ['post', 'Post stitches'],
  ['texture', 'Texture'],
  ['edging', 'Edging'],
  ['foundation', 'Foundation'],
];

export const STITCH_BY_ID = Object.fromEntries(STITCHES.map((s) => [s.id, s]));

// Anything of the form <base>Ntog: consumes N, leaves one.
const TOG_RE = /^(sc|hdc|dc|tr|dtr)(\d)tog$/;

/**
 * Counting info for a canonical stitch id (after the parser's alias pass).
 * Returns null for words that aren't stitches.
 */
export function stitchInfo(id) {
  if (STITCH_BY_ID[id] && STITCH_BY_ID[id].c !== undefined) {
    const s = STITCH_BY_ID[id];
    return { id, c: s.c, p: s.p, h: s.h, yarn: s.yarn };
  }
  const m = TOG_RE.exec(id);
  if (m) {
    const base = STITCH_BY_ID[m[1]];
    const n = Number(m[2]);
    return { id, c: n, p: 1, h: base.h, yarn: base.yarn * n * 0.75 };
  }
  const post = /^(fp|bp)(sc|hdc|dc|tr)$/.exec(id);
  if (post) {
    const base = STITCH_BY_ID[post[2]];
    return { id, c: 1, p: 1, h: base.h, yarn: base.yarn * 1.15 };
  }
  const found = /^f(sc|hdc|dc)$/.exec(id);
  if (found) {
    const base = STITCH_BY_ID[found[1]];
    return { id, c: 0, p: 1, h: base.h, yarn: base.yarn * 1.4 };
  }
  return null;
}

/** Symbol key for a stitch id; post and tog variants fall back sensibly. */
export function symbolFor(id) {
  if (SYMBOLS[id]) return id;
  if (/^fp/.test(id)) return 'fpdc';
  if (/^bp/.test(id)) return 'bpdc';
  const tog = TOG_RE.exec(id);
  if (tog) {
    if (tog[1] === 'sc') return 'dec';
    if (tog[1] === 'hdc') return 'hdc2tog';
    return tog[2] === '2' ? 'dc2tog' : 'dc3tog';
  }
  if (/^f(sc|dc|hdc)$/.test(id)) return 'fsc';
  return 'sc';
}

/** A human label for a canonical id, in US or UK terms. */
export function stitchLabel(id, terms = 'US') {
  const s = STITCH_BY_ID[id];
  if (s) return terms === 'UK' ? s.uk : s.us;
  const tog = TOG_RE.exec(id);
  if (tog && terms === 'UK') {
    const base = STITCH_BY_ID[tog[1]];
    return `${base.uk}${tog[2]}tog`;
  }
  if (terms === 'UK') {
    const post = /^(fp|bp)(sc|hdc|dc|tr)$/.exec(id);
    if (post) return `${post[1].toUpperCase()}${STITCH_BY_ID[post[2]].uk}`;
  }
  const post = /^(fp|bp)(\w+)$/.exec(id);
  if (post) return `${post[1].toUpperCase()}${post[2]}`;
  return id;
}
