// Farm simulation: plot actions, overnight growth, weather, and the day roll.
// Everything here mutates the state tree and emits events; it draws nothing.

import {
  state, DAYS_PER_SEASON, SEASONS, seasonName, addGold, spendEnergy,
  addItem, removeItem, itemCount, logEvent, plotAt,
} from '../core/state.js';
import { emit, EVENTS } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { CROPS, getCrop } from '../data/crops.js';
import { seedId, sellValue, getItem, QUALITY_NAME } from '../data/items.js';
import { advanceLivestockDay } from './livestock.js';

export const ENERGY = {
  till: 4,
  water: 2,
  plant: 2,
  harvest: 2,
  fertilize: 2,
  clear: 3,
  tendAnimal: 2,
};

export const WEATHER = {
  clear:  { id: 'clear',  name: 'Clear',  icon: '☀️', waters: false },
  rain:   { id: 'rain',   name: 'Rain',   icon: '🌧️', waters: true },
  storm:  { id: 'storm',  name: 'Storm',  icon: '⛈️', waters: true, damages: true },
  frost:  { id: 'frost',  name: 'Frost',  icon: '❄️', waters: false, freezes: true },
  windy:  { id: 'windy',  name: 'Windy',  icon: '🌬️', waters: false },
};

/** Deterministic per-day RNG so a save reloaded mid-day rolls the same weather. */
function dayRng(offset = 0) {
  const m = state.meta;
  return new Rng((m.seed ^ (m.year * 100000 + m.season * 1000 + m.day * 7 + offset)) >>> 0);
}

/* ---- new run ------------------------------------------------------------ */

export function initNewRun(s = state) {
  s.farm.inventory[seedId('turnip')] = 8;
  s.farm.inventory.fertilizer = 2;
  s.farm.tomorrowWeather = 'clear';
  s.farm.weather = 'clear';
  logEvent('You inherit the Ironfield homestead and a rusting workshop.', 'story');
}

/* ---- plot actions -------------------------------------------------------- */
// Each returns { ok, reason } so the UI can explain a refusal without knowing
// the rules itself.

const fail = (reason) => ({ ok: false, reason });
const done = (extra = {}) => ({ ok: true, ...extra });

export function till(x, y) {
  const plot = plotAt(x, y);
  if (!plot) return fail('No plot there.');
  if (plot.cropId) return fail('Something is already growing.');
  if (plot.tilled) return fail('Already tilled.');
  if (!spendEnergy(ENERGY.till)) return fail('Too tired.');
  plot.tilled = true;
  return done();
}

export function plant(x, y, cropId) {
  const plot = plotAt(x, y);
  const crop = getCrop(cropId);
  if (!plot) return fail('No plot there.');
  if (!crop) return fail('Unknown seed.');
  if (!plot.tilled) return fail('Till the soil first.');
  if (plot.cropId) return fail('Something is already growing.');
  if (!crop.seasons.includes(state.meta.season)) {
    return fail(`${crop.name} will not grow in ${seasonName()}.`);
  }
  if (itemCount(seedId(cropId)) < 1) return fail(`No ${crop.name} seeds.`);
  if (!spendEnergy(ENERGY.plant)) return fail('Too tired.');

  removeItem(seedId(cropId), 1);
  plot.cropId = cropId;
  plot.stage = 0;
  plot.daysGrown = 0;
  plot.dryDays = 0;
  plot.withered = false;
  plot.regrowsLeft = crop.regrowDays > 0 ? 99 : 0;
  return done({ crop });
}

export function water(x, y) {
  const plot = plotAt(x, y);
  if (!plot) return fail('No plot there.');
  if (!plot.tilled) return fail('Nothing to water.');
  if (plot.watered) return fail('Already watered.');
  const can = state.farm.wateringCan;
  if (can.water <= 0) return fail('The can is empty — refill at the pond.');
  if (!spendEnergy(ENERGY.water)) return fail('Too tired.');
  can.water--;
  plot.watered = true;
  plot.dryDays = 0;
  return done();
}

export function refillCan() {
  const can = state.farm.wateringCan;
  can.water = can.capacity;
  return done();
}

export function fertilize(x, y) {
  const plot = plotAt(x, y);
  if (!plot) return fail('No plot there.');
  if (!plot.tilled) return fail('Till the soil first.');
  if (plot.soil >= 3) return fail('This soil is already prime.');
  if (itemCount('fertilizer') < 1) return fail('No fertilizer.');
  if (!spendEnergy(ENERGY.fertilize)) return fail('Too tired.');
  removeItem('fertilizer', 1);
  plot.soil = Math.min(3, plot.soil + 1);
  return done({ soil: plot.soil });
}

export function harvest(x, y) {
  const plot = plotAt(x, y);
  if (!plot?.cropId) return fail('Nothing to harvest.');
  const crop = getCrop(plot.cropId);
  if (plot.withered) return clearPlot(x, y);
  if (plot.stage < crop.stages - 1) return fail(`${crop.name} is not ready.`);
  if (!spendEnergy(ENERGY.harvest)) return fail('Too tired.');

  const quality = rollQuality(plot);
  const yieldQty = rollYield(plot, crop);
  shipItem(plot.cropId, yieldQty, quality);

  if (crop.regrowDays > 0 && plot.regrowsLeft > 0) {
    // Step back to the stage that corresponds to the regrow window.
    plot.regrowsLeft--;
    plot.daysGrown = Math.max(0, crop.growDays - crop.regrowDays);
    plot.stage = Math.max(1, crop.stages - 2);
  } else {
    plot.cropId = null;
    plot.stage = 0;
    plot.daysGrown = 0;
    plot.regrowsLeft = 0;
    plot.tilled = true;   // stays workable; replant without re-tilling
  }

  emit(EVENTS.CROP_HARVESTED, { cropId: crop.id, qty: yieldQty, quality });
  return done({ crop, qty: yieldQty, quality });
}

export function clearPlot(x, y) {
  const plot = plotAt(x, y);
  if (!plot) return fail('No plot there.');
  if (!plot.cropId && !plot.tilled) return fail('Nothing to clear.');
  if (!spendEnergy(ENERGY.clear)) return fail('Too tired.');
  plot.cropId = null;
  plot.stage = 0;
  plot.daysGrown = 0;
  plot.withered = false;
  plot.regrowsLeft = 0;
  return done();
}

function rollQuality(plot) {
  // Soil quality is the main driver; a fully-watered run nudges it up.
  const rng = dayRng(plot.x * 31 + plot.y * 17);
  const score = (plot.soil - 1) * 0.28 + (plot.dryDays === 0 ? 0.12 : 0) + rng.next() * 0.3;
  if (score > 0.72) return 2;
  if (score > 0.42) return 1;
  return 0;
}

function rollYield(plot, crop) {
  const rng = dayRng(plot.x * 13 + plot.y * 29 + 5);
  let qty = 1;
  if (plot.soil >= 2 && rng.chance(0.25 * (plot.soil - 1))) qty++;
  if (crop.regrowDays > 0 && rng.chance(0.2)) qty++;
  return qty;
}

/** Put produce in the shipping bin — it converts to gold overnight. */
export function shipItem(itemId, qty = 1, quality = 0) {
  const bin = state.farm.shippingBin;
  const existing = bin.find((e) => e.itemId === itemId && e.quality === quality);
  if (existing) existing.qty += qty;
  else bin.push({ itemId, qty, quality });
}

/** Take an item out of the bin and back into your pockets. */
export function unship(itemId, quality = 0, qty = 1) {
  const bin = state.farm.shippingBin;
  const idx = bin.findIndex((e) => e.itemId === itemId && e.quality === quality);
  if (idx < 0) return fail('Not in the bin.');
  const entry = bin[idx];
  const take = Math.min(qty, entry.qty);
  entry.qty -= take;
  if (entry.qty <= 0) bin.splice(idx, 1);
  addItem(itemId, take);
  return done({ qty: take });
}

export function binValue() {
  return state.farm.shippingBin.reduce(
    (sum, e) => sum + sellValue(e.itemId, e.quality) * e.qty, 0,
  );
}

/* ---- the day roll -------------------------------------------------------- */

/**
 * Sleep. Sells the bin, grows everything, rolls tomorrow's weather, and
 * advances the calendar. This is the only place the date moves.
 */
export function sleep() {
  const s = state;
  const report = {
    date: { day: s.meta.day, season: s.meta.season, year: s.meta.year },
    earned: 0, sold: [], grown: 0, harvestable: 0, withered: 0,
    weather: s.farm.tomorrowWeather, seasonChanged: false, newYear: false,
    animals: null,
  };

  // 1. Sell the shipping bin.
  for (const entry of s.farm.shippingBin) {
    const value = sellValue(entry.itemId, entry.quality) * entry.qty;
    report.earned += value;
    report.sold.push({ ...entry, value });
  }
  s.farm.shippingBin = [];
  if (report.earned > 0) addGold(report.earned, 'shipping');

  // 2. Advance the calendar.
  s.meta.day++;
  if (s.meta.day > DAYS_PER_SEASON) {
    s.meta.day = 1;
    s.meta.season++;
    report.seasonChanged = true;
    if (s.meta.season >= SEASONS.length) {
      s.meta.season = 0;
      s.meta.year++;
      report.newYear = true;
    }
  }

  // 3. Weather takes effect, then tomorrow's is forecast.
  s.farm.weather = report.weather;
  s.farm.tomorrowWeather = rollWeather();
  const weather = WEATHER[s.farm.weather] ?? WEATHER.clear;

  // 4. Grow, dry out, and wither.
  for (const plot of s.farm.plots) {
    if (weather.waters && plot.tilled) plot.watered = true;

    if (!plot.cropId) {
      plot.watered = false;
      continue;
    }
    const crop = CROPS[plot.cropId];
    if (!crop) { plot.cropId = null; continue; }

    // Out of season is fatal at the season boundary, not gradually.
    if (report.seasonChanged && !crop.seasons.includes(s.meta.season)) {
      plot.withered = true;
      report.withered++;
      plot.watered = false;
      continue;
    }
    if (weather.freezes && !crop.seasons.includes(3)) {
      plot.withered = true;
      report.withered++;
      plot.watered = false;
      continue;
    }

    const needsWater = crop.water > 0;
    if (needsWater && !plot.watered) {
      plot.dryDays++;
      if (plot.dryDays > crop.water) {
        plot.withered = true;
        report.withered++;
      }
    } else {
      plot.dryDays = 0;
      plot.daysGrown++;
      report.grown++;
      // Floor keeps the final stage pinned to growDays, but a crop that has had
      // a whole day of care must *look* like it — so never sit on stage 0.
      const scaled = Math.floor((plot.daysGrown / crop.growDays) * (crop.stages - 1));
      const target = crop.regrowDays > 0 && plot.daysGrown >= crop.growDays
        ? crop.stages - 1
        : Math.max(1, scaled);
      plot.stage = Math.min(crop.stages - 1, Math.max(plot.stage, target));
    }

    if (plot.stage >= crop.stages - 1 && !plot.withered) report.harvestable++;
    plot.watered = false;
  }

  // Storms can knock a plot's soil back a step.
  if (weather.damages) {
    const rng = dayRng(99);
    for (const plot of s.farm.plots) {
      if (plot.soil > 1 && rng.chance(0.12)) plot.soil--;
    }
  }

  // 5. Livestock, energy, water.
  report.animals = advanceLivestockDay(s);
  s.meta.energy = s.meta.maxEnergy;
  s.farm.wateringCan.water = s.farm.wateringCan.capacity;

  // 6. Squads repair a little overnight.
  repairSquadsOvernight(s);

  emit(EVENTS.DAY_ENDED, report);
  if (report.seasonChanged) {
    emit(EVENTS.SEASON_CHANGED, { season: s.meta.season, year: s.meta.year });
    logEvent(`${seasonName(s.meta.season)} of Year ${s.meta.year} begins.`, 'season');
  }
  emit(EVENTS.DAY_STARTED, { day: s.meta.day, season: s.meta.season, year: s.meta.year });
  return report;
}

function rollWeather() {
  const rng = dayRng(1234);
  const season = state.meta.season;
  const table = [
    // Sprout: wet. Swelter: dry and stormy. Harvest: mixed. Frost: cold.
    [['rain', 34], ['clear', 44], ['windy', 14], ['storm', 8]],
    [['clear', 58], ['rain', 16], ['storm', 16], ['windy', 10]],
    [['clear', 46], ['rain', 24], ['windy', 20], ['storm', 10]],
    [['clear', 40], ['frost', 30], ['windy', 18], ['rain', 12]],
  ][season] ?? [['clear', 100]];

  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [id, w] of table) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return 'clear';
}

/** Squads mend slowly at home; scrap in the inventory speeds it up. */
function repairSquadsOvernight(s) {
  const scrapOnHand = s.farm.inventory.scrap ?? 0;
  const rate = 0.08 + Math.min(0.12, scrapOnHand * 0.004);
  let scrapUsed = 0;
  for (const squad of s.army.squads) {
    if (squad.count < squad.maxCount && scrapOnHand - scrapUsed >= 4) {
      squad.count++;
      scrapUsed += 4;
    }
    squad.hpPct = Math.min(1, (squad.hpPct ?? 1) + rate);
  }
  if (scrapUsed) removeItem('scrap', scrapUsed);
}

/* ---- queries the UI needs ------------------------------------------------ */

export function plotStatus(plot) {
  if (!plot) return 'none';
  if (plot.withered) return 'withered';
  if (!plot.cropId) return plot.tilled ? 'tilled' : 'wild';
  const crop = CROPS[plot.cropId];
  if (plot.stage >= crop.stages - 1) return 'ready';
  return plot.watered ? 'growing-wet' : 'growing';
}

export function daysUntilHarvest(plot) {
  if (!plot?.cropId) return null;
  const crop = CROPS[plot.cropId];
  return Math.max(0, crop.growDays - plot.daysGrown);
}

export function countReady() {
  return state.farm.plots.filter((p) => plotStatus(p) === 'ready').length;
}

export function countUnwatered() {
  return state.farm.plots.filter((p) => p.cropId && !p.watered && !p.withered
    && (CROPS[p.cropId]?.water ?? 0) > 0).length;
}

/** Human-readable summary of an overnight report, for the morning card. */
export function describeReport(report) {
  const lines = [];
  if (report.earned > 0) {
    const top = report.sold.slice().sort((a, b) => b.value - a.value)[0];
    const label = top ? `${QUALITY_NAME[top.quality] || ''} ${getItem(top.itemId)?.name ?? ''}`.trim() : '';
    lines.push(`Shipped for ${report.earned}g${label ? ` (best: ${label})` : ''}.`);
  }
  if (report.animals?.produced) lines.push(`${report.animals.produced} animal goods collected.`);
  if (report.harvestable) lines.push(`${report.harvestable} plot(s) ready to harvest.`);
  if (report.withered) lines.push(`${report.withered} crop(s) withered.`);
  const w = WEATHER[report.weather] ?? WEATHER.clear;
  lines.push(`Today: ${w.icon} ${w.name}.`);
  return lines.join('\n');
}
