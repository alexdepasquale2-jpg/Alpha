// The 14 mech chassis.
//
// Stats are in battlefield units: 1 = one grid cell. The field is 6 wide by 10
// deep, so a range of 7 reaches most of the way across it and a speed of 1.0
// crosses one cell per second.
//
// A "squad" is `size` identical models bought as one purchase. Reinforcing adds
// models at `reinforceCost` each, up to `maxSize`.

export const TARGET = {
  GROUND: 'ground',
  AIR: 'air',
  BOTH: 'both',
};

export const UNITS = {
  tiller: {
    id: 'tiller', name: 'Tiller', role: 'Swarm',
    cost: 100, reinforceCost: 18, size: 6, maxSize: 18,
    hp: 78, dps: 26, range: 0.7, speed: 1.3, armor: 1, splash: 0,
    targets: TARGET.GROUND, flying: false, traits: ['swarm'],
    desc: 'A converted field drone with a blade on the front. Cheap, numerous, expendable.',
    counters: 'Overwhelms slow single-target guns.',
    counteredBy: 'Anything with splash.',
  },
  scarecrow: {
    id: 'scarecrow', name: 'Scarecrow', role: 'Anti-air',
    cost: 150, reinforceCost: 30, size: 3, maxSize: 9,
    hp: 95, dps: 26, range: 3.0, speed: 0.8, armor: 2, splash: 0,
    targets: TARGET.BOTH, flying: false, traits: [], airBonus: 2.2,
    desc: 'Flak posts on legs. Barely bothers a tank; shreds anything airborne.',
    counters: 'Cropdusters and other flyers.',
    counteredBy: 'Ground bruisers that close the gap.',
  },
  plowhorse: {
    id: 'plowhorse', name: 'Plowhorse', role: 'Flanker',
    cost: 200, reinforceCost: 45, size: 3, maxSize: 9,
    hp: 200, dps: 56, range: 0.8, speed: 2.1, armor: 3, splash: 0,
    targets: TARGET.GROUND, flying: false, traits: ['flanker'],
    desc: 'Sprints the length of the field to get its ram into someone soft.',
    counters: 'Artillery and support sitting at the back.',
    counteredBy: 'Splash, and anything that shoots it on the way in.',
  },
  harvester: {
    id: 'harvester', name: 'Harvester', role: 'Bruiser',
    cost: 250, reinforceCost: 60, size: 2, maxSize: 8,
    hp: 340, dps: 58, range: 1.0, speed: 0.85, armor: 6, splash: 0,
    targets: TARGET.GROUND, flying: false, traits: [],
    desc: 'The workhorse. Thick plating, a big blade, and no opinions.',
    counters: 'Swarms, once it reaches them.',
    counteredBy: 'Siege guns that never let it arrive.',
  },
  thresher: {
    id: 'thresher', name: 'Thresher', role: 'Anti-swarm',
    cost: 300, reinforceCost: 70, size: 2, maxSize: 6,
    hp: 265, dps: 38, range: 2.3, speed: 0.6, armor: 5, splash: 1.25,
    targets: TARGET.GROUND, flying: false, traits: [],
    desc: 'Spins out a wall of shrapnel. One of these ruins a hundred Tillers.',
    counters: 'Tillers, and any dense formation.',
    counteredBy: 'Single heavy targets that shrug off the splash.',
  },
  sprinkler: {
    id: 'sprinkler', name: 'Sprinkler', role: 'Artillery',
    cost: 300, reinforceCost: 70, size: 2, maxSize: 6,
    hp: 195, dps: 56, range: 3.3, speed: 0.5, armor: 3, splash: 1.0,
    targets: TARGET.GROUND, flying: false, traits: [],
    desc: 'Lobs incendiary slurry in an arc. Do not stand in the puddle.',
    counters: 'Clumped ground pushes.',
    counteredBy: 'Flyers and flankers.',
  },
  cropduster: {
    id: 'cropduster', name: 'Cropduster', role: 'Air',
    cost: 300, reinforceCost: 70, size: 4, maxSize: 12,
    hp: 85, dps: 32, range: 1.7, speed: 2.1, armor: 1, splash: 0,
    targets: TARGET.BOTH, flying: true, traits: ['flanker'],
    desc: 'Ignores the ground entirely. Goes straight over the line for the guns behind it.',
    counters: 'Artillery, support, anything without flak.',
    counteredBy: 'Scarecrows and Root Anchors.',
  },
  beekeeper: {
    id: 'beekeeper', name: 'Beekeeper', role: 'Support',
    cost: 350, reinforceCost: 90, size: 1, maxSize: 4,
    hp: 190, dps: 0, range: 2.6, speed: 0.7, armor: 3, splash: 0,
    targets: TARGET.GROUND, flying: false, traits: ['support', 'healer'],
    heal: 60,
    desc: 'Releases repair swarms that knit plating back together mid-fight.',
    counters: 'Attrition. Makes a tank line very hard to finish.',
    counteredBy: 'Burst damage and flankers that reach it.',
  },
  root_anchor: {
    id: 'root_anchor', name: 'Root Anchor', role: 'Flak',
    cost: 400, reinforceCost: 100, size: 1, maxSize: 4,
    hp: 320, dps: 44, range: 4.6, speed: 0, armor: 6, splash: 0.8,
    targets: TARGET.AIR, flying: false, traits: ['static'],
    desc: 'Bolts itself to the earth and denies the whole sky above your line.',
    counters: 'Every flyer in the game.',
    counteredBy: 'Ground armies, which it cannot touch at all.',
  },
  barn_guardian: {
    id: 'barn_guardian', name: 'Barn Guardian', role: 'Tank',
    cost: 450, reinforceCost: 120, size: 1, maxSize: 4,
    hp: 950, dps: 42, range: 1.0, speed: 0.5, armor: 12, splash: 0,
    targets: TARGET.GROUND, flying: false, traits: ['shielded', 'taunt'],
    shield: 300,
    desc: 'A rolling barn door. Draws fire so the things behind it can work.',
    counters: 'Anything that has to shoot what is closest.',
    counteredBy: 'Splash that hits past it, and flyers that go over.',
  },
  seed_mortar: {
    id: 'seed_mortar', name: 'Seed Mortar', role: 'Siege',
    cost: 400, reinforceCost: 95, size: 1, maxSize: 4,
    hp: 230, dps: 40, range: 3.8, speed: 0.4, armor: 4, splash: 1.5,
    targets: TARGET.GROUND, flying: false, traits: ['minelayer'],
    minDamage: 90,
    desc: 'Seeds the ground ahead with proximity charges, then shells what survives.',
    counters: 'Slow advances and static lines.',
    counteredBy: 'Fast flankers and air.',
  },
  windmill_array: {
    id: 'windmill_array', name: 'Windmill Array', role: 'Aura',
    cost: 350, reinforceCost: 110, size: 1, maxSize: 3,
    hp: 270, dps: 0, range: 0, speed: 0, armor: 4, splash: 0,
    targets: TARGET.GROUND, flying: false, traits: ['static', 'support', 'aura'],
    aura: { radius: 3.0, damage: 1.2, armor: 2 },
    desc: 'Broadcasts targeting data. Everything nearby hits harder and takes less.',
    counters: 'Nothing directly — it makes the rest of your line 20% better.',
    counteredBy: 'Being found. It cannot defend itself.',
  },
  silo_cannon: {
    id: 'silo_cannon', name: 'Silo Cannon', role: 'Siege',
    cost: 700, reinforceCost: 190, size: 1, maxSize: 3,
    hp: 400, dps: 100, range: 5.8, speed: 0.3, armor: 6, splash: 1.8,
    targets: TARGET.GROUND, flying: false, traits: ['siege'], minRange: 3.2,
    desc: 'Outranges the entire field. Cannot depress the barrel for anything close.',
    counters: 'Tanks, static lines, everything that walks slowly at it.',
    counteredBy: 'Anything that gets inside two cells.',
  },
  combine_titan: {
    id: 'combine_titan', name: 'Combine Titan', role: 'Superheavy',
    cost: 1000, reinforceCost: 340, size: 1, maxSize: 2,
    hp: 1000, dps: 95, range: 2.6, speed: 0.45, armor: 10, splash: 1.2,
    targets: TARGET.BOTH, flying: false, traits: ['titan'],
    desc: 'Eight tonnes of threshing drum on tracks. It is the answer to most questions.',
    counters: 'Almost everything, one at a time.',
    counteredBy: 'Air, which it cannot reach, and its own price tag.',
  },
};

export const UNIT_IDS = Object.keys(UNITS);

export function getUnit(id) {
  return UNITS[id] ?? null;
}

/** Squad cost including the models beyond the base size. */
export function squadCost(unitId, count = null) {
  const unit = UNITS[unitId];
  if (!unit) return 0;
  const n = count ?? unit.size;
  return unit.cost + Math.max(0, n - unit.size) * unit.reinforceCost;
}

/**
 * Rough power score — total hp x dps, used by the enemy AI to build comps of a
 * given strength and by the balance harness to compare armies at equal gold.
 */
export function powerScore(unitId, count = null) {
  const unit = UNITS[unitId];
  if (!unit) return 0;
  const n = count ?? unit.size;
  const offense = Math.max(unit.dps, unit.heal ?? 0, 12);
  const durability = (unit.hp + (unit.shield ?? 0)) * (1 + unit.armor / 20);
  return Math.sqrt(offense * durability) * n;
}

export function canTarget(attacker, defender) {
  if (defender.flying) return attacker.targets === TARGET.AIR || attacker.targets === TARGET.BOTH;
  return attacker.targets === TARGET.GROUND || attacker.targets === TARGET.BOTH;
}

/** Units available to buy, given what the player has unlocked. */
export function shopUnits(unlockedIds) {
  return unlockedIds.map((id) => UNITS[id]).filter(Boolean);
}
