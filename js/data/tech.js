/* ============================================================================
 * data/tech.js — the progression / tech tree.
 *
 * The tree is a DAG laid out on an abstract (col,row) grid; tech.js only
 * stores the graph + effects, scenes/tech.js handles drawing and panning.
 *
 * Effect keys understood by state.js:
 *   tierCap  {kind:'weapon'|'vehicle'|'agent', tier:N}  raise merge ceiling
 *   mult     {credits|intel|chips|loot|damage|toughness: x}  multiplicative
 *   add      {energyMax|invSlots|squadSlots|dealSlots: N}    additive
 *   unlock   'buildingId' | 'featureId'
 * ========================================================================== */
CM.TECH = (function () {
  'use strict';

  const N = (id, o) => Object.assign({ id: id, req: [], cost: {}, effects: {} }, o);

  const NODES = [
    /* ------------------------------------------------------------ root */
    N('boot', {
      name: 'CREW BOOT', col: 3, row: 0, kind: 'core', icon: 'chip',
      desc: 'Your first burner terminal. Merge tier 4 unlocked on all lines.',
      cost: {}, free: true,
      effects: { tierCap: [{ kind: 'weapon', tier: 4 }, { kind: 'vehicle', tier: 4 }, { kind: 'agent', tier: 4 }] }
    }),

    /* -------------------------------------------------------- WEAPONS */
    N('w5', { name: 'GUNSMITH', col: 1, row: 1, kind: 'weapon', icon: 'bolt', req: ['boot'],
      desc: 'Unlock weapon merges up to Plasma Repeater (T5).',
      cost: { credits: 600, intel: 12 }, effects: { tierCap: [{ kind: 'weapon', tier: 5 }] } }),
    N('w6', { name: 'RAILWORKS', col: 1, row: 2, kind: 'weapon', icon: 'bolt', req: ['w5'],
      desc: 'Unlock Rail Cannon (T6). Squad damage +10%.',
      cost: { credits: 3200, intel: 45, chips: 6 },
      effects: { tierCap: [{ kind: 'weapon', tier: 6 }], mult: { damage: 1.10 } } }),
    N('w7', { name: 'ION LAB', col: 1, row: 3, kind: 'weapon', icon: 'bolt', req: ['w6'],
      desc: 'Unlock Ion Lance (T7). Squad damage +15%.',
      cost: { credits: 24000, intel: 220, chips: 30 },
      effects: { tierCap: [{ kind: 'weapon', tier: 7 }], mult: { damage: 1.15 } } }),
    N('w8', { name: 'SINGULARITY ARMS', short: 'SING. ARMS', col: 1, row: 4, kind: 'weapon', icon: 'bolt', req: ['w7'],
      desc: 'Unlock the Singularity Gun (T8). Squad damage +25%.',
      cost: { credits: 220000, intel: 1400, chips: 160 },
      effects: { tierCap: [{ kind: 'weapon', tier: 8 }], mult: { damage: 1.25 } } }),

    /* ------------------------------------------------------- VEHICLES */
    N('v5', { name: 'CHOP LINE', col: 3, row: 1, kind: 'vehicle', icon: 'target', req: ['boot'],
      desc: 'Unlock vehicle merges up to Armored Car (T5).',
      cost: { credits: 500, intel: 10 }, effects: { tierCap: [{ kind: 'vehicle', tier: 5 }] } }),
    N('v6', { name: 'TECH VANS', col: 3, row: 2, kind: 'vehicle', icon: 'target', req: ['v5'],
      desc: 'Unlock Tech Van (T6). Mission loot +15%.',
      cost: { credits: 2800, intel: 40, chips: 5 },
      effects: { tierCap: [{ kind: 'vehicle', tier: 6 }], mult: { loot: 1.15 } } }),
    N('v7', { name: 'HOVER RIGS', col: 3, row: 3, kind: 'vehicle', icon: 'target', req: ['v6'],
      desc: 'Unlock Hover Cruiser (T7). Squad toughness +20%.',
      cost: { credits: 21000, intel: 200, chips: 26 },
      effects: { tierCap: [{ kind: 'vehicle', tier: 7 }], mult: { toughness: 1.20 } } }),
    N('v8', { name: 'WARRIG WORKS', col: 3, row: 4, kind: 'vehicle', icon: 'target', req: ['v7'],
      desc: 'Unlock the Warrig Hauler (T8). Mission loot +30%.',
      cost: { credits: 200000, intel: 1300, chips: 150 },
      effects: { tierCap: [{ kind: 'vehicle', tier: 8 }], mult: { loot: 1.30 } } }),

    /* ---------------------------------------------------------- CREW */
    N('a5', { name: 'STREET SCHOOL', short: 'ST. SCHOOL', col: 5, row: 1, kind: 'agent', icon: 'den', req: ['boot'],
      desc: 'Unlock crew merges up to Bruiser (T5).',
      cost: { credits: 900, intel: 16 }, effects: { tierCap: [{ kind: 'agent', tier: 5 }] } }),
    N('a6', { name: 'GHOST PROGRAM', short: 'GHOST PROG', col: 5, row: 2, kind: 'agent', icon: 'den', req: ['a5'],
      desc: 'Unlock Ghost Operative (T6). Squad toughness +12%.',
      cost: { credits: 4200, intel: 55, chips: 8 },
      effects: { tierCap: [{ kind: 'agent', tier: 6 }], mult: { toughness: 1.12 } } }),
    N('a7', { name: 'RONIN CODEX', col: 5, row: 3, kind: 'agent', icon: 'den', req: ['a6'],
      desc: 'Unlock Cyber-Ronin (T7). Squad damage +12%.',
      cost: { credits: 30000, intel: 260, chips: 34 },
      effects: { tierCap: [{ kind: 'agent', tier: 7 }], mult: { damage: 1.12 } } }),
    N('a8', { name: 'CHROME THRONE', col: 5, row: 4, kind: 'agent', icon: 'den', req: ['a7'],
      desc: 'Unlock the Chrome Warlord (T8). Toughness +25%.',
      cost: { credits: 260000, intel: 1600, chips: 180 },
      effects: { tierCap: [{ kind: 'agent', tier: 8 }], mult: { toughness: 1.25 } } }),

    /* ------------------------------------------------------- ECONOMY */
    N('grid_tap', { name: 'GRID TAP', col: 2, row: 1, kind: 'econ', icon: 'vault', req: ['boot'],
      desc: 'Unlocks the POWER VAULT outpost. Energy cap +40.',
      cost: { credits: 800, intel: 14 },
      effects: { unlock: 'vault', add: { energyMax: 40 } } }),
    N('ghost_net', { name: 'GHOST NET', col: 2, row: 3, kind: 'econ', icon: 'relay', req: ['grid_tap', 'v6'],
      desc: 'Unlocks the GHOST RELAY outpost, which buffs neighbours.',
      cost: { credits: 9000, intel: 120, chips: 12 },
      effects: { unlock: 'relay' } }),
    N('chop_shop', { name: 'CHOP SHOP', col: 2, row: 5, kind: 'econ', icon: 'wrench', req: ['ghost_net', 'w7'],
      desc: 'Unlocks the CHOP FORGE outpost — passive merge chips.',
      cost: { credits: 60000, intel: 500, chips: 60 },
      effects: { unlock: 'forge' } }),
    N('black_market', { name: 'BLACK MARKET', short: 'BLACK MKT', col: 0, row: 2, kind: 'econ', icon: 'chip', req: ['w5'],
      desc: 'Credit income +35%. One extra slot in Shady Deals.',
      cost: { credits: 2200, intel: 30 },
      effects: { mult: { credits: 1.35 }, add: { dealSlots: 1 } } }),
    N('deep_probe', { name: 'DEEP PROBE', col: 0, row: 4, kind: 'econ', icon: 'chip', req: ['black_market'],
      desc: 'Intel income +50%. Credit income +25%.',
      cost: { credits: 26000, intel: 240, chips: 20 },
      effects: { mult: { intel: 1.50, credits: 1.25 } } }),
    N('overclock', { name: 'OVERCLOCK', col: 4, row: 1, kind: 'econ', icon: 'bolt', req: ['v5'],
      desc: 'Energy cap +60 and all outposts run 20% hotter.',
      cost: { credits: 1800, intel: 26 },
      effects: { add: { energyMax: 60 }, mult: { credits: 1.20, intel: 1.20 } } }),
    N('cargo_hold', { name: 'CARGO HOLD', col: 4, row: 3, kind: 'econ', icon: 'target', req: ['overclock'],
      desc: '+12 stash slots. Mission loot +20%.',
      cost: { credits: 14000, intel: 150, chips: 14 },
      effects: { add: { invSlots: 12 }, mult: { loot: 1.20 } } }),
    N('war_room', { name: 'WAR ROOM', col: 6, row: 2, kind: 'econ', icon: 'target', req: ['a5'],
      desc: 'Squad size 4. Unlocks the STRATEGY OPS map.',
      cost: { credits: 5200, intel: 70, chips: 8 },
      effects: { add: { squadSlots: 1 }, unlock: 'strategy' } }),
    N('command_net', { name: 'COMMAND NET', short: 'CMD NET', col: 6, row: 4, kind: 'econ', icon: 'relay', req: ['war_room', 'a7'],
      desc: 'Squad size 5. Stationed crew produce 60% more.',
      cost: { credits: 90000, intel: 700, chips: 90 },
      effects: { add: { squadSlots: 1 }, mult: { station: 1.60 } } }),
    N('chip_press', { name: 'CHIP PRESS', col: 4, row: 5, kind: 'econ', icon: 'wrench', req: ['cargo_hold'],
      desc: 'Merge chips gained from every source +50%.',
      cost: { credits: 70000, intel: 560, chips: 70 },
      effects: { mult: { chips: 1.50 } } }),

    /* ------------------------------------------------------- CAPSTONE */
    N('singularity', { name: 'SINGULARITY PROTOCOL', short: 'SINGULARITY', col: 3, row: 6, kind: 'core', icon: 'chip',
      req: ['w8', 'v8', 'a8', 'chop_shop', 'command_net'],
      desc: 'The crew becomes the city. Everything x2. Mission loot x2.',
      cost: { credits: 1500000, intel: 9000, chips: 900 },
      effects: { mult: { credits: 2, intel: 2, chips: 2, loot: 2, damage: 2, toughness: 2 } } })
  ];

  const byId = (id) => NODES.find((n) => n.id === id);

  /** Colour used for a node's ring, matching the reference palette. */
  const KIND_COLOR = { core: '#ffffff', weapon: '#24e2ff', vehicle: '#ffb020', agent: '#ff3fa4', econ: '#9a6bff' };

  /** Grid extents, used by the tech scene to size its virtual canvas. */
  const COLS = 7, ROWS = 7;

  return { NODES, byId, KIND_COLOR, COLS, ROWS };
})();
