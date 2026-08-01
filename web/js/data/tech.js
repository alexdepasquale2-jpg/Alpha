// Tech cards (offered between battle rounds, Mechabellum-style) and the
// permanent farm research tree.
//
// A card's effect is plain data so it survives a save round-trip:
//   mult  multiply a stat            { dps: 1.3 }
//   add   add to a stat              { range: 1.0 }
//   flags behaviours the sim checks  ['splitOnDeath']
// Cards apply to every model in every squad of that unit type, for the rest of
// the season.

export const TECH = {
  /* ---- tiller ---------------------------------------------------------- */
  t_split: {
    id: 't_split', unitId: 'tiller', name: 'Split Harvest', cost: 180,
    desc: 'A destroyed Tiller breaks into two half-strength seedlings.',
    effect: { flags: ['splitOnDeath'] },
  },
  t_blades: {
    id: 't_blades', unitId: 'tiller', name: 'Sharpened Blades', cost: 150,
    desc: '+40% damage. Still made of tin.',
    effect: { mult: { dps: 1.4 } },
  },
  t_plating: {
    id: 't_plating', unitId: 'tiller', name: 'Scrap Plating', cost: 160,
    desc: '+50% health and +2 armour.',
    effect: { mult: { hp: 1.5 }, add: { armor: 2 } },
  },

  /* ---- scarecrow -------------------------------------------------------- */
  s_proximity: {
    id: 's_proximity', unitId: 'scarecrow', name: 'Proximity Fuses', cost: 200,
    desc: 'Flak bursts gain 0.8 splash — hits whole flights at once.',
    effect: { add: { splash: 0.8 } },
  },
  s_reach: {
    id: 's_reach', unitId: 'scarecrow', name: 'Long Barrels', cost: 180,
    desc: '+1.5 range.',
    effect: { add: { range: 1.5 } },
  },
  s_ground: {
    id: 's_ground', unitId: 'scarecrow', name: 'Depressed Mounts', cost: 220,
    desc: 'Full damage against ground targets, not just air.',
    effect: { mult: { dps: 1.9 }, set: { airBonus: 1.15 } },
  },

  /* ---- plowhorse -------------------------------------------------------- */
  p_charge: {
    id: 'p_charge', unitId: 'plowhorse', name: 'Charging Ram', cost: 200,
    desc: 'First hit on each target deals triple damage.',
    effect: { flags: ['chargeStrike'] },
  },
  p_sprint: {
    id: 'p_sprint', unitId: 'plowhorse', name: 'Overgeared', cost: 170,
    desc: '+45% speed.',
    effect: { mult: { speed: 1.45 } },
  },
  p_backline: {
    id: 'p_backline', unitId: 'plowhorse', name: 'Field Runner', cost: 240,
    desc: 'Ignores the front line and drives straight for artillery.',
    effect: { set: { priority: 'backline' } },
  },

  /* ---- harvester -------------------------------------------------------- */
  h_reaper: {
    id: 'h_reaper', unitId: 'harvester', name: 'Reaper Drum', cost: 240,
    desc: 'Attacks gain 1.0 splash.',
    effect: { add: { splash: 1.0 } },
  },
  h_armor: {
    id: 'h_armor', unitId: 'harvester', name: 'Barn Plate', cost: 200,
    desc: '+6 armour and +25% health.',
    effect: { add: { armor: 6 }, mult: { hp: 1.25 } },
  },
  h_vengeance: {
    id: 'h_vengeance', unitId: 'harvester', name: 'Last Swing', cost: 260,
    desc: 'Detonates on death for 140 damage in 1.5 cells.',
    effect: { flags: ['deathBlast'], set: { deathBlast: 140, deathBlastRadius: 1.5 } },
  },

  /* ---- thresher --------------------------------------------------------- */
  th_wide: {
    id: 'th_wide', unitId: 'thresher', name: 'Wide Spread', cost: 220,
    desc: '+0.9 splash radius.',
    effect: { add: { splash: 0.9 } },
  },
  th_rate: {
    id: 'th_rate', unitId: 'thresher', name: 'Feed Belt', cost: 200,
    desc: '+45% damage.',
    effect: { mult: { dps: 1.45 } },
  },
  th_sky: {
    id: 'th_sky', unitId: 'thresher', name: 'Elevated Chutes', cost: 250,
    desc: 'Can hit air targets.',
    effect: { set: { targets: 'both' } },
  },

  /* ---- sprinkler -------------------------------------------------------- */
  sp_range: {
    id: 'sp_range', unitId: 'sprinkler', name: 'Pressure Tanks', cost: 200,
    desc: '+2 range.',
    effect: { add: { range: 2.0 } },
  },
  sp_burn: {
    id: 'sp_burn', unitId: 'sprinkler', name: 'Incendiary Slurry', cost: 260,
    desc: 'Targets burn for 25 damage per second for 3 seconds.',
    effect: { flags: ['burn'], set: { burnDps: 25, burnTime: 3 } },
  },
  sp_wide: {
    id: 'sp_wide', unitId: 'sprinkler', name: 'Broad Nozzle', cost: 220,
    desc: '+0.8 splash radius.',
    effect: { add: { splash: 0.8 } },
  },

  /* ---- cropduster ------------------------------------------------------- */
  c_swarm: {
    id: 'c_swarm', unitId: 'cropduster', name: 'Hive Bays', cost: 220,
    desc: '+40% health.',
    effect: { mult: { hp: 1.4 } },
  },
  c_strafe: {
    id: 'c_strafe', unitId: 'cropduster', name: 'Strafing Run', cost: 240,
    desc: '+50% damage while moving.',
    effect: { mult: { dps: 1.5 } },
  },
  c_evade: {
    id: 'c_evade', unitId: 'cropduster', name: 'Chaff Dispensers', cost: 260,
    desc: 'Takes 35% less damage from flak.',
    effect: { flags: ['chaff'] },
  },

  /* ---- beekeeper -------------------------------------------------------- */
  b_swarm: {
    id: 'b_swarm', unitId: 'beekeeper', name: 'Second Hive', cost: 260,
    desc: '+70% repair rate.',
    effect: { mult: { heal: 1.7 } },
  },
  b_range: {
    id: 'b_range', unitId: 'beekeeper', name: 'Far Foragers', cost: 220,
    desc: '+2 repair range.',
    effect: { add: { range: 2.0 } },
  },
  b_sting: {
    id: 'b_sting', unitId: 'beekeeper', name: 'Angry Hive', cost: 240,
    desc: 'Also deals 30 damage per second to the nearest enemy.',
    effect: { set: { dps: 30 } },
  },

  /* ---- root anchor ------------------------------------------------------ */
  r_flak: {
    id: 'r_flak', unitId: 'root_anchor', name: 'Curtain Fire', cost: 260,
    desc: '+1.0 splash — clears whole formations of flyers.',
    effect: { add: { splash: 1.0 } },
  },
  r_reach: {
    id: 'r_reach', unitId: 'root_anchor', name: 'Deep Roots', cost: 240,
    desc: '+2.5 range.',
    effect: { add: { range: 2.5 } },
  },
  r_ground: {
    id: 'r_ground', unitId: 'root_anchor', name: 'Levelled Barrels', cost: 300,
    desc: 'Can also engage ground targets, at reduced damage.',
    effect: { set: { targets: 'both' }, mult: { dps: 0.7 } },
  },

  /* ---- barn guardian ---------------------------------------------------- */
  g_shield: {
    id: 'g_shield', unitId: 'barn_guardian', name: 'Reinforced Doors', cost: 280,
    desc: '+400 shield, and it regenerates between rounds.',
    effect: { add: { shield: 400 }, flags: ['shieldRegen'] },
  },
  g_thorns: {
    id: 'g_thorns', unitId: 'barn_guardian', name: 'Spiked Frame', cost: 240,
    desc: 'Reflects 25% of melee damage taken.',
    effect: { flags: ['thorns'] },
  },
  g_rally: {
    id: 'g_rally', unitId: 'barn_guardian', name: 'Rally Horn', cost: 300,
    desc: 'Allies within 3 cells gain +3 armour.',
    effect: { set: { aura: { radius: 3, armor: 3, damage: 1 } } },
  },

  /* ---- seed mortar ------------------------------------------------------ */
  m_mines: {
    id: 'm_mines', unitId: 'seed_mortar', name: 'Dense Sowing', cost: 260,
    desc: 'Mines deal 90 more damage.',
    effect: { add: { minDamage: 90 } },
  },
  m_range: {
    id: 'm_range', unitId: 'seed_mortar', name: 'Extended Tubes', cost: 220,
    desc: '+2 range.',
    effect: { add: { range: 2.0 } },
  },
  m_cluster: {
    id: 'm_cluster', unitId: 'seed_mortar', name: 'Cluster Pods', cost: 280,
    desc: '+35% damage and +0.6 splash.',
    effect: { mult: { dps: 1.35 }, add: { splash: 0.6 } },
  },

  /* ---- windmill array --------------------------------------------------- */
  w_wide: {
    id: 'w_wide', unitId: 'windmill_array', name: 'Tall Mast', cost: 240,
    desc: 'Aura radius +2 cells.',
    effect: { set: { aura: { radius: 5, damage: 1.2, armor: 2 } } },
  },
  w_power: {
    id: 'w_power', unitId: 'windmill_array', name: 'Overclocked Feed', cost: 300,
    desc: 'Aura damage bonus rises to +45%.',
    effect: { set: { aura: { radius: 3, damage: 1.45, armor: 2 } } },
  },
  w_shield: {
    id: 'w_shield', unitId: 'windmill_array', name: 'Field Emitter', cost: 320,
    desc: 'Aura also grants +150 shield to allies at the start of the round.',
    effect: { flags: ['auraShield'] },
  },

  /* ---- silo cannon ------------------------------------------------------ */
  sc_reload: {
    id: 'sc_reload', unitId: 'silo_cannon', name: 'Auto-Loader', cost: 320,
    desc: '+40% damage.',
    effect: { mult: { dps: 1.4 } },
  },
  sc_close: {
    id: 'sc_close', unitId: 'silo_cannon', name: 'Secondary Turret', cost: 300,
    desc: 'Removes the minimum range.',
    effect: { set: { minRange: 0 } },
  },
  sc_shell: {
    id: 'sc_shell', unitId: 'silo_cannon', name: 'Fragmentation Shells', cost: 340,
    desc: '+1.2 splash radius.',
    effect: { add: { splash: 1.2 } },
  },

  /* ---- combine titan ---------------------------------------------------- */
  ct_armor: {
    id: 'ct_armor', unitId: 'combine_titan', name: 'Ablative Hull', cost: 400,
    desc: '+8 armour and +30% health.',
    effect: { add: { armor: 8 }, mult: { hp: 1.3 } },
  },
  ct_reach: {
    id: 'ct_reach', unitId: 'combine_titan', name: 'Extended Drum', cost: 380,
    desc: '+2 range and +0.8 splash.',
    effect: { add: { range: 2.0, splash: 0.8 } },
  },
  ct_engine: {
    id: 'ct_engine', unitId: 'combine_titan', name: 'Threshing Overdrive', cost: 420,
    desc: '+60% damage, −20% speed.',
    effect: { mult: { dps: 1.6, speed: 0.8 } },
  },
};

export const TECH_IDS = Object.keys(TECH);

/** Cards that could be offered given the squads currently fielded. */
export function techFor(unitIds, ownedTechIds = []) {
  const owned = new Set(ownedTechIds);
  return TECH_IDS
    .map((id) => TECH[id])
    .filter((card) => unitIds.includes(card.unitId) && !owned.has(card.id));
}

/**
 * Fold a list of tech cards into a unit's base stats. Pure; returns a new
 * object. `flags` accumulate into a Set-like array the sim can check.
 */
export function applyTech(baseUnit, techIds = []) {
  const stats = { ...baseUnit, flags: [...(baseUnit.traits ?? [])] };
  const cards = techIds.map((id) => TECH[id]).filter((c) => c && c.unitId === baseUnit.id);

  // `set` first so a later `mult` still scales the overridden value.
  for (const card of cards) {
    for (const [key, value] of Object.entries(card.effect.set ?? {})) stats[key] = value;
  }
  for (const card of cards) {
    for (const [key, value] of Object.entries(card.effect.add ?? {})) {
      stats[key] = (stats[key] ?? 0) + value;
    }
  }
  for (const card of cards) {
    for (const [key, value] of Object.entries(card.effect.mult ?? {})) {
      stats[key] = (stats[key] ?? 0) * value;
    }
  }
  for (const card of cards) {
    for (const flag of card.effect.flags ?? []) {
      if (!stats.flags.includes(flag)) stats.flags.push(flag);
    }
  }
  return stats;
}

/* ---- permanent research ------------------------------------------------- */
// Bought on the farm with gold plus salvage. Persists across seasons, unlike
// tech cards.

export const RESEARCH = {
  r_warchest: {
    id: 'r_warchest', name: 'War Chest', gold: 1200, items: { scrap: 20 },
    desc: 'Start every assault with 250 extra deployment gold.',
    effect: { startGold: 250 },
  },
  r_foundry: {
    id: 'r_foundry', name: 'Field Foundry', gold: 1800, items: { alloy: 12 },
    desc: 'Squads repair twice as fast overnight.',
    effect: { repairRate: 2 },
  },
  r_doctrine: {
    id: 'r_doctrine', name: 'Combat Doctrine', gold: 2400, items: { core: 2 },
    desc: 'Choose from four tech cards each round instead of three.',
    effect: { techChoices: 4 },
  },
  r_logistics: {
    id: 'r_logistics', name: 'Logistics Corps', gold: 2000, items: { scrap: 40 },
    desc: '+35% reinforcement gold between rounds.',
    effect: { reinforceMult: 1.35 },
  },
  r_bulwark: {
    id: 'r_bulwark', name: 'Homestead Bulwark', gold: 2600, items: { alloy: 20 },
    desc: '+60 Homestead HP on every assault.',
    effect: { homesteadHp: 60 },
  },
  r_scouts: {
    id: 'r_scouts', name: 'Scout Balloons', gold: 1500, items: { scrap: 25 },
    desc: 'See the enemy composition before you commit to deployment.',
    effect: { scouting: true },
  },
  r_salvage: {
    id: 'r_salvage', name: 'Salvage Rights', gold: 1600, items: { scrap: 15 },
    desc: '+80% salvage recovered from every battle.',
    effect: { salvageMult: 1.8 },
  },
  r_veterans: {
    id: 'r_veterans', name: 'Veteran Cadre', gold: 3000, items: { core: 3 },
    desc: 'Squads keep their veterancy when the season turns over.',
    effect: { keepVeterancy: true },
  },
};

export const RESEARCH_IDS = Object.keys(RESEARCH);

/** Combined effect of everything researched. */
export function researchEffects(ownedIds = []) {
  const out = {
    startGold: 0, repairRate: 1, techChoices: 3, reinforceMult: 1,
    homesteadHp: 0, scouting: false, salvageMult: 1, keepVeterancy: false,
  };
  for (const id of ownedIds) {
    const node = RESEARCH[id];
    if (!node) continue;
    for (const [key, value] of Object.entries(node.effect)) {
      if (typeof value === 'number' && typeof out[key] === 'number') {
        // Multipliers compose, flat bonuses add. `techChoices` is a floor.
        out[key] = key.endsWith('Mult') || key === 'repairRate'
          ? out[key] * value
          : key === 'techChoices' ? Math.max(out[key], value) : out[key] + value;
      } else {
        out[key] = value;
      }
    }
  }
  return out;
}
