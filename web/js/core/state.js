// The single game-state tree.
//
// Hard rule: everything in here is JSON-serializable. Primitives, arrays and
// plain objects only, and cross-references are IDs, never live object handles.
// That is what makes save() a bare JSON.stringify and load() a bare parse with
// no rehydration pass.

import { emit, EVENTS } from './events.js';

export const SAVE_VERSION = 1;

export const SEASONS = ['Sprout', 'Swelter', 'Harvest', 'Frost'];
export const DAYS_PER_SEASON = 28;
export const BASE_ENERGY = 100;
export const START_FARM_W = 6;
export const START_FARM_H = 6;

/** Live state for the current session. Reassigned by load(). */
export let state = null;

export function setState(next) {
  state = next;
  return state;
}

export function getState() {
  return state;
}

function makePlots(w, h, biome = 'meadow') {
  const plots = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      plots.push({
        x, y,
        biome,
        tilled: false,
        watered: false,
        // Soil quality drifts with fertilizer and fallow days; scales yield.
        soil: 1,
        cropId: null,
        stage: 0,
        daysGrown: 0,
        dryDays: 0,
        regrowsLeft: 0,
        withered: false,
      });
    }
  }
  return plots;
}

export function createNewGame({ farmName = 'Ironfield', seed = null } = {}) {
  const rootSeed = seed ?? (Math.random() * 0xffffffff) >>> 0;
  return {
    version: SAVE_VERSION,

    meta: {
      farmName,
      seed: rootSeed,
      day: 1,
      season: 0,
      year: 1,
      gold: 500,
      energy: BASE_ENERGY,
      maxEnergy: BASE_ENERGY,
      savedAt: 0,
      playtimeMs: 0,
      createdAt: Date.now(),
    },

    farm: {
      width: START_FARM_W,
      height: START_FARM_H,
      plots: makePlots(START_FARM_W, START_FARM_H),
      // Bin contents are sold overnight, Harvest-Moon style.
      shippingBin: [],           // [{ itemId, qty, quality }]
      inventory: {},             // itemId -> qty (seeds, produce kept back, gifts)
      tools: { hoe: 1, can: 1, scythe: 1 },
      wateringCan: { level: 1, water: 20, capacity: 20 },
      weather: 'clear',
      tomorrowWeather: 'clear',
      buildings: { coop: 0, barn: 0, silo: 0, workshop: 1 },
      livestock: [],             // [{ id, kind, name, hearts, fedToday, produceReady }]
      unlockedCrops: ['turnip', 'cornbolt'],
    },

    army: {
      // Squads persist across battles within a season.
      squads: [],                // [{ id, unitId, count, maxCount, hp[], veterancy, techIds[] }]
      nextSquadId: 1,
      unlockedUnits: ['tiller', 'scarecrow', 'harvester', 'sprinkler'],
      research: [],              // permanent research node ids
      hallOfFame: [],            // retired rosters, one per finished season
      homesteadHpMax: 100,
    },

    town: {
      npcs: {},                  // npcId -> { hearts, points, giftedToday, metOn }
      festivalsDone: [],         // `${year}:${festivalId}`
      shopStock: {},             // refreshed daily
      contracts: [],
    },

    world: {
      territories: {},           // id -> { status: 'locked'|'open'|'owned', bestRound }
      currentAssault: null,      // live battle ladder state, or null
      biomesUnlocked: ['meadow'],
      endless: { unlocked: false, bestWave: 0, bestScore: 0 },
    },

    flags: {
      tutorialSeen: false,
      firstBattleDone: false,
    },

    log: [],                     // recent notable events, newest first, capped
  };
}

/* ---- calendar ----------------------------------------------------------- */

export function seasonName(s = state?.meta.season ?? 0) {
  return SEASONS[((s % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

export function dateLabel(meta = state?.meta) {
  if (!meta) return '';
  return `${seasonName(meta.season)} ${meta.day}, Y${meta.year}`;
}

/** Absolute day index since the start of the run — handy for timers. */
export function absoluteDay(meta = state?.meta) {
  if (!meta) return 0;
  return ((meta.year - 1) * SEASONS.length + meta.season) * DAYS_PER_SEASON + meta.day;
}

/* ---- resources ---------------------------------------------------------- */

export function addGold(amount, reason = '') {
  state.meta.gold = Math.max(0, Math.round(state.meta.gold + amount));
  emit(EVENTS.GOLD_CHANGED, { gold: state.meta.gold, delta: amount, reason });
  return state.meta.gold;
}

export function canAfford(cost) {
  return state.meta.gold >= cost;
}

/** Spend gold if affordable. Returns whether the purchase happened. */
export function spendGold(cost, reason = '') {
  if (!canAfford(cost)) return false;
  addGold(-cost, reason);
  return true;
}

export function spendEnergy(amount) {
  if (state.meta.energy < amount) return false;
  state.meta.energy -= amount;
  return true;
}

export function restoreEnergy(amount) {
  state.meta.energy = Math.min(state.meta.maxEnergy, state.meta.energy + amount);
  return state.meta.energy;
}

/* ---- inventory ---------------------------------------------------------- */

export function addItem(itemId, qty = 1) {
  if (qty === 0) return;
  const inv = state.farm.inventory;
  inv[itemId] = (inv[itemId] ?? 0) + qty;
  if (inv[itemId] <= 0) delete inv[itemId];
}

export function itemCount(itemId) {
  return state.farm.inventory[itemId] ?? 0;
}

export function removeItem(itemId, qty = 1) {
  if (itemCount(itemId) < qty) return false;
  addItem(itemId, -qty);
  return true;
}

/* ---- plots -------------------------------------------------------------- */

export function plotAt(x, y) {
  const { width, height, plots } = state.farm;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return plots[y * width + x] ?? null;
}

/* ---- log ---------------------------------------------------------------- */

export function logEvent(text, kind = 'info') {
  state.log.unshift({ text, kind, day: absoluteDay() });
  if (state.log.length > 60) state.log.length = 60;
}

/* ---- migration ---------------------------------------------------------- */

/**
 * Bring an older save forward. Each step mutates in place and bumps `version`.
 * Unknown-but-newer saves are returned untouched; the caller warns.
 */
export function migrate(save) {
  if (!save || typeof save !== 'object') return null;
  if (typeof save.version !== 'number') save.version = 0;

  // Fill in any keys added since the save was written, so new code can assume
  // the full shape exists without guarding every access.
  const fresh = createNewGame();
  const graft = (target, template) => {
    for (const [key, value] of Object.entries(template)) {
      if (target[key] === undefined) {
        target[key] = structuredClone(value);
      } else if (value && typeof value === 'object' && !Array.isArray(value)
                 && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        graft(target[key], value);
      }
    }
  };
  graft(save, fresh);

  save.version = SAVE_VERSION;
  return save;
}
