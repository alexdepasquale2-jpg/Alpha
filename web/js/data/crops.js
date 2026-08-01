// Crop definitions. Pure data — no logic, no imports.
//
// growDays   total days from planting to first harvest
// regrowDays 0 = single harvest (plot clears); >0 = keeps producing on a cycle
// stages     visual growth stages; the last one is harvestable
// water      days it can go unwatered before growth stalls and it starts drying
// seasons    season indices it grows in (0 Sprout, 1 Swelter, 2 Harvest, 3 Frost)
// biome      which land you must own to buy the seed

export const CROPS = {
  /* ---- Meadow (starting land) ------------------------------------------ */
  turnip: {
    id: 'turnip', name: 'Turnip', art: 'root', color: '#d8a0c0',
    seasons: [0], growDays: 4, regrowDays: 0, stages: 4,
    seedCost: 20, sellPrice: 42, water: 1, biome: 'meadow',
    desc: 'Fast and forgiving. The crop that funds your first squad.',
  },
  cornbolt: {
    id: 'cornbolt', name: 'Cornbolt', art: 'grain', color: '#e8c65a',
    seasons: [0, 1], growDays: 8, regrowDays: 3, stages: 5,
    seedCost: 70, sellPrice: 58, water: 1, biome: 'meadow',
    desc: 'Keeps bearing every few days. Plant early, harvest all season.',
  },
  hayberry: {
    id: 'hayberry', name: 'Hayberry', art: 'vine', color: '#c4433a',
    seasons: [1], growDays: 6, regrowDays: 2, stages: 4,
    seedCost: 90, sellPrice: 52, water: 2, biome: 'meadow',
    desc: 'Thirsty vines, but they never stop fruiting.',
  },
  sunmelon: {
    id: 'sunmelon', name: 'Sunmelon', art: 'fruit', color: '#e07f3c',
    seasons: [1], growDays: 11, regrowDays: 0, stages: 5,
    seedCost: 160, sellPrice: 340, water: 2, biome: 'meadow',
    desc: 'Slow, thirsty, and worth more than a Harvester chassis.',
  },
  frostcabbage: {
    id: 'frostcabbage', name: 'Frostcabbage', art: 'bloom', color: '#9ec9a8',
    seasons: [2, 3], growDays: 7, regrowDays: 0, stages: 4,
    seedCost: 85, sellPrice: 155, water: 1, biome: 'meadow',
    desc: 'Sweetens in the cold. The only reliable Frost earner on old land.',
  },

  /* ---- Marsh ------------------------------------------------------------ */
  reedcane: {
    id: 'reedcane', name: 'Reedcane', art: 'grain', color: '#a8c46a',
    seasons: [0, 1, 2], growDays: 6, regrowDays: 2, stages: 4,
    seedCost: 110, sellPrice: 84, water: 3, biome: 'marsh',
    desc: 'Wants standing water. Three seasons of income if you keep it soaked.',
  },
  bogroot: {
    id: 'bogroot', name: 'Bogroot', art: 'root', color: '#7f6a9c',
    seasons: [2, 3], growDays: 9, regrowDays: 0, stages: 5,
    seedCost: 150, sellPrice: 290, water: 2, biome: 'marsh',
    desc: 'Pulled from the muck in Harvest. The refinery pays well for it.',
  },
  mireblossom: {
    id: 'mireblossom', name: 'Mireblossom', art: 'bloom', color: '#c46a9c',
    seasons: [0, 1], growDays: 12, regrowDays: 5, stages: 5,
    seedCost: 260, sellPrice: 195, water: 3, biome: 'marsh',
    desc: 'A luxury bloom. Townsfolk will trade favours for a single stem.',
  },

  /* ---- Ashlands --------------------------------------------------------- */
  emberpepper: {
    id: 'emberpepper', name: 'Emberpepper', art: 'fruit', color: '#d8452c',
    seasons: [1, 2], growDays: 7, regrowDays: 2, stages: 4,
    seedCost: 200, sellPrice: 170, water: 0, biome: 'ashlands',
    desc: 'Needs no water at all. Ash country grows what ash country wants.',
  },
  cinderwheat: {
    id: 'cinderwheat', name: 'Cinderwheat', art: 'grain', color: '#c98f4f',
    seasons: [0, 1, 2, 3], growDays: 10, regrowDays: 0, stages: 5,
    seedCost: 280, sellPrice: 400, water: 1, biome: 'ashlands',
    desc: 'Grows in any season. The backbone of a serious war chest.',
  },
  slagvine: {
    id: 'slagvine', name: 'Slagvine', art: 'vine', color: '#8f8f96',
    seasons: [2, 3], growDays: 8, regrowDays: 3, stages: 4,
    seedCost: 240, sellPrice: 215, water: 1, biome: 'ashlands',
    desc: 'Its fibre is drawn into armour plate. Harvest it or wear it.',
  },

  /* ---- Frostreach ------------------------------------------------------- */
  rimeberry: {
    id: 'rimeberry', name: 'Rimeberry', art: 'vine', color: '#8fd0e0',
    seasons: [3], growDays: 5, regrowDays: 2, stages: 4,
    seedCost: 300, sellPrice: 320, water: 1, biome: 'frostreach',
    desc: 'Frost-only, and Frost is short. Plant the day you arrive.',
  },
  glacierleaf: {
    id: 'glacierleaf', name: 'Glacierleaf', art: 'bloom', color: '#cfe4ef',
    seasons: [2, 3], growDays: 12, regrowDays: 0, stages: 5,
    seedCost: 420, sellPrice: 720, water: 0, biome: 'frostreach',
    desc: 'Drinks from the air. Twelve days of patience for a small fortune.',
  },
  iceflax: {
    id: 'iceflax', name: 'Iceflax', art: 'grain', color: '#b0c8d8',
    seasons: [0, 3], growDays: 9, regrowDays: 4, stages: 5,
    seedCost: 360, sellPrice: 330, water: 1, biome: 'frostreach',
    desc: 'Spun into the cabling every heavy chassis runs on.',
  },

  /* ---- Reward-only ------------------------------------------------------ */
  ironfruit: {
    id: 'ironfruit', name: 'Ironfruit', art: 'fruit', color: '#d8b45a',
    seasons: [0, 1, 2, 3], growDays: 16, regrowDays: 6, stages: 6,
    seedCost: 900, sellPrice: 1100, water: 2, biome: 'reward',
    desc: 'The old orchard stock. Nobody sells the seed; you take it.',
  },
};

export const CROP_IDS = Object.keys(CROPS);

export function getCrop(id) {
  return CROPS[id] ?? null;
}

/** Crops the player can plant right now: unlocked, in season, land owned. */
export function plantableCrops(unlockedCrops, season, biomesUnlocked) {
  return unlockedCrops
    .map((id) => CROPS[id])
    .filter((c) => c && c.seasons.includes(season)
                && (c.biome === 'reward' || biomesUnlocked.includes(c.biome)));
}

/** Everything a shop in this biome would stock, ignoring season. */
export function cropsForBiome(biome) {
  return CROP_IDS.map((id) => CROPS[id]).filter((c) => c.biome === biome);
}

/** Gold per day if grown perfectly — the number balance actually cares about. */
export function goldPerDay(crop) {
  if (crop.regrowDays > 0) {
    // Amortise the seed over a full 28-day season of regrowth.
    const harvests = 1 + Math.floor((28 - crop.growDays) / crop.regrowDays);
    return (crop.sellPrice * harvests - crop.seedCost) / 28;
  }
  return (crop.sellPrice - crop.seedCost) / crop.growDays;
}
