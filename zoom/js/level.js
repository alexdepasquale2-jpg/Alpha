// The Contact wing, authored as rects. y grows downward; the floor of Mouth of
// Static sits at y=600. A fresh copy is built for every run because the sim
// mutates it (doors open, veins get ripped, molars crack).
//
//   Room A  Mouth of Static   x    0..2440   tongue, tastebud wall, door, gate
//   Room B  First Rib         x 2400..3560   breathing wall, molar crest, slide
//   Room C  Window Hall       x 3540..5960   panes, frame, molar row (chase)
//
// Solid kinds: solid | grip (climbable) | breath (climbable on exhale) | slick
// (climbable, slides you down). `on:false` switches a rect off.

export function buildLevel() {
  const S = [];
  const add = (x, y, w, h, kind = 'solid', extra = {}) => {
    const r = { x, y, w, h, kind, ...extra };
    S.push(r);
    return r;
  };

  /* ---------------- Room A: Mouth of Static ---------------- */
  add(-300, 600, 860, 200, 'solid', { tag: 'pool' });          // spit-pool floor
  add(620, 600, 500, 30, 'solid', { tag: 'tongue' });          // the slack tongue
  add(1120, 280, 60, 350, 'grip', { tag: 'tastebuds' });       // tastebud wall
  add(1180, 280, 1220, 50, 'solid', { tag: 'ledgeA' });        // upper tongue / corridor floor
  add(1640, -140, 800, 230, 'solid', { tag: 'ceilingA' });     // corridor ceiling
  const door = add(1640, 90, 60, 190, 'solid', { ref: 'door' });
  const gateBody = add(2100, 90, 56, 190, 'solid', { ref: 'gate' });

  /* ---------------- Room B: First Rib ---------------- */
  add(2340, 280, 60, 420, 'solid', { tag: 'cliff' });          // wall under the corridor's end
  add(2400, 600, 1160, 200, 'solid', { tag: 'floorB' });
  add(2540, -260, 60, 760, 'breath', { tag: 'breathwall' });    // climbs on exhale only
  for (const y of [420, 190, -30]) add(2500, y, 40, 14, 'solid', { tag: 'knuckle', oneway: true });
  add(2540, -260, 740, 40, 'solid', { tag: 'crest' });          // the rib's crest
  add(2600, -330, 60, 70, 'solid', { tag: 'step' });
  add(2690, -400, 110, 20, 'solid', { tag: 'sideledge', oneway: true });
  const sleeper = add(2750, -450, 50, 50, 'solid', { ref: 'sleeper' }); // the mouth we steal TEETH from
  for (const x of [2880, 2990, 3100]) add(x, -300, 40, 40, 'solid', { tag: 'lump' });
  const plank = add(3280, -260, 60, 8, 'solid', { ref: 'plank', tag: 'plank', on: false }); // the "helpful" bridge (conjured by the Menu)
  add(3340, -260, 60, 860, 'slick', { tag: 'ribside' });         // slide down its outer face
  add(3400, 300, 100, 40, 'solid', { tag: 'ledgeB' });

  /* ---------------- Room C: Window Hall ---------------- */
  const HX0 = 3600, HX1 = 5900, HY0 = -300, HY1 = 600;
  add(3540, HY0 - 60, 2420, 60, 'grip', { tag: 'ceilingC' });
  add(3540, HY1, 2420, 80, 'grip', { tag: 'floorC' });
  add(3540, HY0, 60, 380 - HY0, 'grip', { tag: 'leftC' });        // wall above the aperture
  add(HX1, HY0 - 60, 60, 800, 'grip', { tag: 'rightC' });
  const seal = add(3540, 380, 60, 220, 'grip', { ref: 'seal', on: false });
  add(4000, 510, 60, 90, 'grip', { tag: 'pillar' });
  add(4300, HY0, 60, 260, 'grip', { tag: 'pillar' });
  add(4700, 240, 80, 320, 'grip', { tag: 'framepillar' });   // hangs 40px off the floor: a dog-sized crawlspace
  add(5100, HY0, 60, 220, 'grip', { tag: 'pillar' });
  add(5450, 510, 60, 90, 'grip', { tag: 'pillar' });

  // molar row (index 2 is the hollow one, i.e. Scar 3)
  const molars = [];
  for (let i = 0; i < 5; i++) {
    const r = add(5560 + i * 66, 544, 52, 56, 'solid', { ref: 'molar', idx: i });
    molars.push({ idx: i, rect: r, hollow: i === 2, cracked: false, known: false, chewed: false, open: false });
  }

  // curtains hang floor to ceiling and split the hall into four zones, each
  // watched by one pane. They block sight, not bodies.
  const curtains = [
    { x: 3860, y: HY0, w: 16, h: HY1 - HY0 - 4 },
    { x: 4480, y: HY0, w: 16, h: HY1 - HY0 - 4 },
    { x: 5300, y: HY0, w: 16, h: HY1 - HY0 - 4 },
  ];

  const scars = [
    { id: 'socket', zone: { x: 1780, y: 222, w: 70, h: 58 }, spawn: { x: 1815, y: 270 }, stash: null, noHide: false, visited: false },
    { id: 'underrib', zone: { x: 3420, y: 262, w: 70, h: 38 }, spawn: { x: 3455, y: 290 }, stash: null, noHide: false, visited: false },
    { id: 'molar', zone: { x: 0, y: 548, w: 52, h: 52 }, spawn: { x: 0, y: 590 }, stash: null, noHide: false, visited: false, needsOpen: true },
  ];
  // Scar 3 lives inside the hollow molar
  scars[2].zone.x = molars[2].rect.x;
  scars[2].spawn.x = molars[2].rect.x + 26;

  const veins = [
    { id: 'door', law: 'WONT_CLOSE', x: 1648, y: 262, taken: false },
    { id: 'sleeper', law: 'TEETH', x: 2743, y: -428, taken: false },
    { id: 'frame', law: 'LOOKS', x: 4692, y: 440, taken: false },
  ];

  const pane = (id, x, y, base, sweep, speed, phase) => ({ id, x, y, base, sweep, speed, phase, range: 1000, half: 0.26, seen: 0, blind: 0, ignore: 0 });
  const panes = [
    pane('p1', 3612, 120, 1.2, 0.5, 0.9, 0),
    pane('p2', 4590, HY0 + 6, Math.PI / 2, 0.75, 1.1, 1.7),
    pane('p3', 5892, 240, 2.25, 0.5, 0.8, 3.1),
  ];

  const mites = [];
  const mite = (x, y, x0, x1) => mites.push({ x, y, x0, x1, dir: 1, vx: 0, vy: 0, alive: false, harmless: false, cool: 0, t: Math.random() });
  // room A corridor (wake when the door comes off)
  mite(1900, 275, 1720, 2090); mite(1960, 275, 1720, 2090); mite(2040, 275, 1720, 2090);
  // room B: two waiting where you land (drop on them: stomp), two on the crest
  mite(2445, 595, 2410, 2495); mite(2475, 595, 2410, 2495);
  mite(2930, -265, 2820, 3260); mite(3200, -265, 2820, 3260);

  return {
    solids: S, curtains, scars, veins, panes, mites, molars,
    door, gate: { rect: gateBody, x: 2100, y: 90, w: 56, h: 190, t: 0, jammed: false, teeth: false, mouthOpen: false },
    seal, plank, sleeper,
    warden: { x: 1980, y: 262, w: 42, h: 36, dir: -1, state: 'sleep', t: 0, x0: 1710, x1: 2080, stun: 0, harmless: false, lose: 0 },
    hall: { x0: HX0, x1: HX1, y0: HY0, y1: HY1 },
    spawn: { x: 80, y: 590 },
    hallSpawn: { x: 3640, y: 588 },
    staticSpot: { x: 5878, y: 150 },
    eyeHome: { x: 4730, y: HY0 + 10 },
    bounds: { x0: -400, x1: 6100, y0: -1100, y1: 1500 },
  };
}
