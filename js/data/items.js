/* ============================================================================
 * data/items.js — the merge chains.
 *
 * Three parallel 8-tier chains. Two identical items (same kind + same tier)
 * merge into one item of the next tier. Tier caps are lifted by tech nodes,
 * which is what ties the merge board to the progression tree.
 * ========================================================================== */
CM.ITEMS = (function () {
  'use strict';

  /** Display names per kind, index = tier-1. */
  const CHAINS = {
    vehicle: {
      label: 'VEHICLES', accent: '#ffb020', role: 'Adds squad HP and loot haul',
      names: ['Rust Scooter','Hatchback','Street Sedan','Muscle Coupe','Armored Car',
              'Tech Van','Hover Cruiser','Warrig Hauler']
    },
    weapon: {
      label: 'WEAPONS', accent: '#24e2ff', role: 'Adds squad damage',
      names: ['Pipe Pistol','Scrap SMG','Street Rifle','Assault Carbine','Plasma Repeater',
              'Rail Cannon','Ion Lance','Singularity Gun']
    },
    agent: {
      label: 'CREW', accent: '#ff3fa4', role: 'Fights in missions, staffs outposts',
      names: ['Street Runner','Enforcer','Field Medic','Netrunner','Bruiser',
              'Ghost Operative','Cyber-Ronin','Chrome Warlord']
    }
  };
  const KINDS = ['vehicle', 'weapon', 'agent'];
  const MAX_TIER = 8;

  /* -------------------------------------------------------- economy ---- */
  /** Shop price of a fresh tier-1 item (rises as you craft more). */
  function craftCost(kind, crafted) {
    const base = { vehicle: 25, weapon: 30, agent: 45 }[kind];
    return Math.floor(base * Math.pow(1.14, crafted || 0));
  }
  /** Chips needed to add a "+1" refinement to an item. */
  function refineCost(item) {
    return Math.floor((4 + item.tier * 3) * Math.pow(1.6, item.plus || 0));
  }
  /** Credits you get for scrapping an item. */
  function scrapValue(item) {
    return Math.floor(12 * Math.pow(2.05, item.tier - 1) * (1 + (item.plus || 0) * .25));
  }

  /* -------------------------------------------------------- combat ----- */
  /* Raw power numbers used by the mission resolver. Tier scaling is ~1.62x
     per step so one merge always feels like a real jump. */
  function power(item) {
    if (!item) return { hp: 0, atk: 0, spd: 0 };
    const t = item.tier, p = 1 + (item.plus || 0) * 0.18;
    const g = Math.pow(1.62, t - 1);
    if (item.kind === 'agent')   return { hp: Math.round(46 * g * p), atk: Math.round(9 * g * p), spd: 6 + t };
    if (item.kind === 'weapon')  return { hp: 0,                       atk: Math.round(12 * g * p), spd: 2 + t * .5 };
    return                              { hp: Math.round(30 * g * p),  atk: Math.round(3 * g * p),  spd: 4 + t * .8 };
  }
  /** A single number used for sorting / "squad rating" displays. */
  function rating(item) { const p = power(item); return Math.round(p.hp * .6 + p.atk * 3); }

  /** Idle credits per second contributed by an agent stationed at an outpost. */
  function stationYield(item) { return 0.35 * Math.pow(1.55, item.tier - 1) * (1 + (item.plus || 0) * .2); }

  /* -------------------------------------------------------- factory ---- */
  function make(kind, tier, plus) {
    return { id: CM.util.uid('it'), kind: kind, tier: CM.util.clamp(tier || 1, 1, MAX_TIER), plus: plus || 0, at: null };
  }
  function name(item) {
    const c = CHAINS[item.kind];
    return (c.names[item.tier - 1] || (c.label + ' T' + item.tier)) + (item.plus ? ' +' + item.plus : '');
  }

  return { CHAINS, KINDS, MAX_TIER, craftCost, refineCost, scrapValue, power, rating, stationYield, make, name };
})();
