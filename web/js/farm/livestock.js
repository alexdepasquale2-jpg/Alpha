// Coop and barn animals. Higher gold-per-day than crops, but they cost energy
// every single day and sulk if you skip one.

import { state, spendEnergy, addItem } from '../core/state.js';
import { ENERGY } from './farmSim.js';

export const ANIMALS = {
  chicken: {
    id: 'chicken', name: 'Chicken', kind: 'chicken', building: 'coop',
    price: 800, produce: 'egg', everyDays: 1,
    desc: 'One egg a day, forever, as long as you feed it.',
  },
  cow: {
    id: 'cow', name: 'Cow', kind: 'cow', building: 'barn',
    price: 2400, produce: 'milk', everyDays: 1,
    desc: 'Milk every morning. Needs a barn and a real commitment.',
  },
  sheep: {
    id: 'sheep', name: 'Sheep', kind: 'sheep', building: 'barn',
    price: 3200, produce: 'wool', everyDays: 3,
    desc: 'Shears every third day for a lot of gold.',
  },
};

export const BUILDING_CAPACITY = { coop: 4, barn: 4 };

export function animalCapacity(s = state) {
  return {
    coop: (s.farm.buildings.coop ?? 0) * BUILDING_CAPACITY.coop,
    barn: (s.farm.buildings.barn ?? 0) * BUILDING_CAPACITY.barn,
  };
}

export function animalCount(building, s = state) {
  return s.farm.livestock.filter((a) => ANIMALS[a.kindId]?.building === building).length;
}

export function canHouse(animalId, s = state) {
  const def = ANIMALS[animalId];
  if (!def) return false;
  return animalCount(def.building, s) < animalCapacity(s)[def.building];
}

export function buyAnimal(animalId, name = '') {
  const def = ANIMALS[animalId];
  if (!def) return { ok: false, reason: 'Unknown animal.' };
  if (!canHouse(animalId)) return { ok: false, reason: `No room in the ${def.building}.` };

  state.farm.livestock.push({
    id: `a${Date.now().toString(36)}${state.farm.livestock.length}`,
    kindId: animalId,
    name: name || def.name,
    hearts: 0,
    points: 0,
    fedToday: false,
    daysSinceProduce: 0,
    produceReady: false,
  });
  return { ok: true };
}

/** Feed and pet one animal. Raises affection, which raises produce quality. */
export function tendAnimal(animalUid) {
  const animal = state.farm.livestock.find((a) => a.id === animalUid);
  if (!animal) return { ok: false, reason: 'No such animal.' };
  if (animal.fedToday) return { ok: false, reason: `${animal.name} is content.` };
  if (!spendEnergy(ENERGY.tendAnimal)) return { ok: false, reason: 'Too tired.' };

  animal.fedToday = true;
  animal.points = Math.min(1000, animal.points + 28);
  animal.hearts = Math.floor(animal.points / 100);
  return { ok: true, hearts: animal.hearts };
}

/** Collect whatever is waiting. Quality rises with affection. */
export function collectProduce(animalUid) {
  const animal = state.farm.livestock.find((a) => a.id === animalUid);
  if (!animal) return { ok: false, reason: 'No such animal.' };
  if (!animal.produceReady) return { ok: false, reason: 'Nothing ready yet.' };

  const def = ANIMALS[animal.kindId];
  const quality = animal.hearts >= 8 ? 2 : animal.hearts >= 4 ? 1 : 0;
  animal.produceReady = false;
  animal.daysSinceProduce = 0;
  addItem(def.produce, 1);
  return { ok: true, itemId: def.produce, quality };
}

export function tendAll() {
  let tended = 0;
  for (const animal of state.farm.livestock) {
    if (tendAnimal(animal.id).ok) tended++;
  }
  return tended;
}

export function collectAll() {
  const got = [];
  for (const animal of state.farm.livestock) {
    const res = collectProduce(animal.id);
    if (res.ok) got.push(res);
  }
  return got;
}

/** Called once per sleep. Returns a summary for the morning report. */
export function advanceLivestockDay(s = state) {
  let produced = 0;
  let neglected = 0;

  for (const animal of s.farm.livestock) {
    const def = ANIMALS[animal.kindId];
    if (!def) continue;

    if (animal.fedToday) {
      animal.daysSinceProduce++;
      if (animal.daysSinceProduce >= def.everyDays) animal.produceReady = true;
    } else {
      // Skipping a day costs affection and the day's produce.
      animal.points = Math.max(0, animal.points - 45);
      animal.hearts = Math.floor(animal.points / 100);
      neglected++;
    }
    if (animal.produceReady) produced++;
    animal.fedToday = false;
  }

  return { produced, neglected, total: s.farm.livestock.length };
}

export function untendedCount(s = state) {
  return s.farm.livestock.filter((a) => !a.fedToday).length;
}

export function readyProduceCount(s = state) {
  return s.farm.livestock.filter((a) => a.produceReady).length;
}
