/* ============================================================================
 * data/buildings.js — outpost definitions for the base grid.
 *
 * Buildings tick passive income every second and can host one crew agent,
 * which multiplies their output. Levels are bought with credits + intel.
 * ========================================================================== */
CM.BUILDINGS = (function () {
  'use strict';

  const DEFS = [
    {
      id: 'node', name: 'DATA NODE', glyph: 'node', color: '#24e2ff',
      desc: 'Skims the city net for loose credits.',
      cost: { credits: 60 }, growth: 1.55,
      yields: { credits: 0.9 },        // per second at level 1
      tech: null
    },
    {
      id: 'den', name: 'SYNTH DEN', glyph: 'den', color: '#ff3fa4',
      desc: 'Backroom lab. Cooks intel out of stolen chatter.',
      cost: { credits: 220 }, growth: 1.62,
      yields: { intel: 0.10 },
      tech: null
    },
    {
      id: 'vault', name: 'POWER VAULT', glyph: 'vault', color: '#ffb020',
      desc: 'Siphons the grid. Raises energy cap and recharge.',
      cost: { credits: 500, intel: 8 }, growth: 1.70,
      yields: { energyRegen: 0.22, energyMax: 12 },
      tech: 'grid_tap'
    },
    {
      id: 'relay', name: 'GHOST RELAY', glyph: 'relay', color: '#9a6bff',
      desc: 'Bounces your signal. Boosts every other outpost nearby.',
      cost: { credits: 1400, intel: 30 }, growth: 1.75,
      yields: { adjacency: 0.14 },     // +14%/level to orthogonally adjacent outposts
      tech: 'ghost_net'
    },
    {
      id: 'forge', name: 'CHOP FORGE', glyph: 'wrench', color: '#49ff9b',
      desc: 'Strips wrecks into merge chips.',
      cost: { credits: 3200, intel: 70 }, growth: 1.80,
      yields: { chips: 0.010 },
      tech: 'chop_shop'
    }
  ];

  const byId = (id) => DEFS.find((d) => d.id === id);

  /** Cost of building fresh (level 1) or upgrading to `level`. */
  function cost(defId, level) {
    const d = byId(defId), m = Math.pow(d.growth, Math.max(0, level - 1));
    const out = {};
    for (const k in d.cost) out[k] = Math.ceil(d.cost[k] * m);
    return out;
  }
  /** Per-second yields of a placed building at its current level. */
  function yieldsOf(b) {
    const d = byId(b.type), out = {};
    // level scaling: linear-ish but with a mild exponent so upgrades stay juicy
    const s = Math.pow(b.level, 1.28);
    for (const k in d.yields) out[k] = d.yields[k] * s;
    return out;
  }
  const MAX_LEVEL = 12;

  return { DEFS, byId, cost, yieldsOf, MAX_LEVEL };
})();
