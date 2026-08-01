// The campaign map: 16 parcels across 4 biomes.
//
// Parcels unlock in order within a biome; a biome opens when its gate parcel in
// the previous biome is taken. Winning one grants farmland (new rows on your
// plot grid, in that biome), plus seeds, units and salvage.
//
// `budget` is the enemy army's gold value in round 1; it grows each round by
// `escalation`. `rounds` is how many rounds you must win to take the parcel —
// the ladder ends early if the Homestead falls.

export const BIOMES = {
  meadow: {
    id: 'meadow', name: 'Wyrd Meadow', color: '#7fbf5a',
    desc: 'Long grass and older fences. Whatever is out here was here first.',
  },
  marsh: {
    id: 'marsh', name: 'Sallow Marsh', color: '#5f8f7a',
    desc: 'Standing water year-round. Things sink into it and come back changed.',
  },
  ashlands: {
    id: 'ashlands', name: 'The Ashlands', color: '#c4643a',
    desc: 'Burned over so long ago nobody remembers by whom. The soil still works.',
  },
  frostreach: {
    id: 'frostreach', name: 'Frostreach', color: '#8fb6cf',
    desc: 'Short seasons, hard ground, and the richest crops on the continent.',
  },
};

export const BIOME_ORDER = ['meadow', 'marsh', 'ashlands', 'frostreach'];

export const TERRITORIES = {
  /* ---- Meadow ----------------------------------------------------------- */
  m1: {
    id: 'm1', name: 'The Near Field', biome: 'meadow', pos: { x: 0.5, y: 0.86 },
    requires: [], rounds: 3, budget: 260, escalation: 1.35,
    enemyStyle: 'rabble',
    reward: { rows: 1, gold: 200, crops: ['hayberry'], items: { scrap: 8 } },
    desc: 'Scavengers have been pulling your fence posts for fuel. Start here.',
  },
  m2: {
    id: 'm2', name: 'Crook Hollow', biome: 'meadow', pos: { x: 0.22, y: 0.74 },
    requires: ['m1'], rounds: 4, budget: 420, escalation: 1.35,
    enemyStyle: 'swarm',
    reward: { rows: 1, gold: 300, units: ['plowhorse'], items: { scrap: 12 } },
    desc: 'A hollow full of cheap drones and whoever is winding them up.',
  },
  m3: {
    id: 'm3', name: 'Old Orchard', biome: 'meadow', pos: { x: 0.76, y: 0.72 },
    requires: ['m1'], rounds: 4, budget: 480, escalation: 1.4,
    enemyStyle: 'armor',
    reward: { rows: 1, gold: 350, crops: ['sunmelon'], units: ['thresher'], items: { alloy: 4 } },
    desc: 'The trees are dead but the irrigation still runs. Somebody maintains it.',
  },
  m4: {
    id: 'm4', name: 'Wyrd Ridge', biome: 'meadow', pos: { x: 0.5, y: 0.6 },
    requires: ['m2', 'm3'], rounds: 5, budget: 700, escalation: 1.4,
    enemyStyle: 'air', gate: 'marsh',
    reward: { rows: 2, gold: 600, units: ['cropduster'], items: { alloy: 8, core: 1 } },
    desc: 'Take the ridge and the whole marsh road opens below it.',
  },

  /* ---- Marsh ------------------------------------------------------------ */
  s1: {
    id: 's1', name: 'Reed Crossing', biome: 'marsh', pos: { x: 0.26, y: 0.5 },
    requires: ['m4'], rounds: 4, budget: 820, escalation: 1.4,
    enemyStyle: 'swarm',
    reward: { rows: 1, gold: 500, crops: ['reedcane'], items: { scrap: 20 } },
    desc: 'The only dry path in. Naturally, it is held.',
  },
  s2: {
    id: 's2', name: 'Sunken Mill', biome: 'marsh', pos: { x: 0.6, y: 0.46 },
    requires: ['s1'], rounds: 5, budget: 1000, escalation: 1.42,
    enemyStyle: 'artillery',
    reward: { rows: 1, gold: 650, crops: ['bogroot'], units: ['beekeeper'], items: { alloy: 10 } },
    desc: 'Half a mill, half a wreck, entirely full of mortars.',
  },
  s3: {
    id: 's3', name: 'Blackwater Fen', biome: 'marsh', pos: { x: 0.16, y: 0.36 },
    requires: ['s1'], rounds: 5, budget: 1150, escalation: 1.42,
    enemyStyle: 'armor',
    reward: { rows: 1, gold: 700, crops: ['mireblossom'], units: ['barn_guardian'], items: { core: 1 } },
    desc: 'Armour sinks here. Theirs did not. Find out why.',
  },
  s4: {
    id: 's4', name: 'The Weir', biome: 'marsh', pos: { x: 0.44, y: 0.3 },
    requires: ['s2', 's3'], rounds: 6, budget: 1500, escalation: 1.45,
    enemyStyle: 'mixed', gate: 'ashlands',
    reward: { rows: 2, gold: 1000, units: ['seed_mortar'], items: { alloy: 16, core: 2 } },
    desc: 'Break the weir and the ash road is dry enough to march.',
  },

  /* ---- Ashlands --------------------------------------------------------- */
  a1: {
    id: 'a1', name: 'Cinder Flats', biome: 'ashlands', pos: { x: 0.74, y: 0.32 },
    requires: ['s4'], rounds: 5, budget: 1700, escalation: 1.45,
    enemyStyle: 'artillery',
    reward: { rows: 1, gold: 900, crops: ['emberpepper'], items: { scrap: 40 } },
    desc: 'Nothing grows without water here. Something grew anyway.',
  },
  a2: {
    id: 'a2', name: 'Slagworks', biome: 'ashlands', pos: { x: 0.86, y: 0.5 },
    requires: ['a1'], rounds: 6, budget: 2000, escalation: 1.45,
    enemyStyle: 'armor',
    reward: { rows: 1, gold: 1100, crops: ['slagvine'], units: ['root_anchor'], items: { alloy: 24 } },
    desc: 'They are still smelting. That is the worrying part.',
  },
  a3: {
    id: 'a3', name: 'Ember Terrace', biome: 'ashlands', pos: { x: 0.6, y: 0.2 },
    requires: ['a1'], rounds: 6, budget: 2200, escalation: 1.48,
    enemyStyle: 'air',
    reward: { rows: 1, gold: 1200, crops: ['cinderwheat'], units: ['windmill_array'], items: { core: 3 } },
    desc: 'Terraced fields cut into the ash. Whoever farms them flies to work.',
  },
  a4: {
    id: 'a4', name: 'The Cauldron', biome: 'ashlands', pos: { x: 0.82, y: 0.14 },
    requires: ['a2', 'a3'], rounds: 7, budget: 2900, escalation: 1.5,
    enemyStyle: 'titan', gate: 'frostreach',
    reward: { rows: 2, gold: 1800, units: ['silo_cannon'], items: { alloy: 30, core: 4 } },
    desc: 'The forge at the centre of it all. Past here, the ground turns white.',
  },

  /* ---- Frostreach ------------------------------------------------------- */
  f1: {
    id: 'f1', name: 'Rime Steps', biome: 'frostreach', pos: { x: 0.32, y: 0.16 },
    requires: ['a4'], rounds: 6, budget: 3200, escalation: 1.5,
    enemyStyle: 'mixed',
    reward: { rows: 1, gold: 1600, crops: ['rimeberry'], items: { alloy: 30 } },
    desc: 'Terraces of blue ice, and berries growing straight out of them.',
  },
  f2: {
    id: 'f2', name: 'Glass Basin', biome: 'frostreach', pos: { x: 0.14, y: 0.1 },
    requires: ['f1'], rounds: 7, budget: 3700, escalation: 1.5,
    enemyStyle: 'artillery',
    reward: { rows: 1, gold: 1900, crops: ['glacierleaf'], units: ['combine_titan'], items: { core: 5 } },
    desc: 'A frozen lake with guns dug into the shore all the way round.',
  },
  f3: {
    id: 'f3', name: 'Flax Hollow', biome: 'frostreach', pos: { x: 0.46, y: 0.06 },
    requires: ['f1'], rounds: 7, budget: 4000, escalation: 1.52,
    enemyStyle: 'air',
    reward: { rows: 1, gold: 2100, crops: ['iceflax'], items: { alloy: 40, core: 4 } },
    desc: 'The flax grows in the windbreak. So does everything hunting you.',
  },
  f4: {
    id: 'f4', name: 'The Ironfield', biome: 'frostreach', pos: { x: 0.7, y: 0.04 },
    requires: ['f2', 'f3'], rounds: 8, budget: 5200, escalation: 1.55,
    enemyStyle: 'titan', final: true,
    reward: { rows: 3, gold: 4000, crops: ['ironfruit'], items: { core: 10 }, endless: true },
    desc: 'The field your family was named for. Take it back and the war is over.',
  },
};

export const TERRITORY_IDS = Object.keys(TERRITORIES);

export function getTerritory(id) {
  return TERRITORIES[id] ?? null;
}

/** A parcel is available once every prerequisite is owned. */
export function isAvailable(id, world) {
  const t = TERRITORIES[id];
  if (!t) return false;
  if (world.territories[id]?.status === 'owned') return false;
  return t.requires.every((req) => world.territories[req]?.status === 'owned');
}

export function isOwned(id, world) {
  return world.territories[id]?.status === 'owned';
}

export function ownedCount(world) {
  return TERRITORY_IDS.filter((id) => isOwned(id, world)).length;
}

/** Enemy gold budget for a given round of an assault. */
export function budgetForRound(territory, round) {
  return Math.round(territory.budget * Math.pow(territory.escalation, round - 1));
}

/** Deployment gold the player gets entering round `round`. */
export function playerBudgetForRound(territory, round) {
  // Slightly under the enemy's, because the player's army persists between
  // rounds and theirs is rebuilt from scratch each time.
  return Math.round(territory.budget * 0.85 * Math.pow(territory.escalation * 0.92, round - 1));
}
