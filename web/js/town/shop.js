// Shop stock and transactions, independent of how they're presented.
//
// Extracted from the old menu-driven town screen so the world scene can open
// the same counter after you walk up to a shopkeeper.

import {
  state, spendGold, addGold, addItem, removeItem, itemCount,
} from '../core/state.js';
import { cropsForBiome } from '../data/crops.js';
import { ITEMS, seedId, itemName } from '../data/items.js';
import { UNITS } from '../data/units.js';
import { RESEARCH, RESEARCH_IDS } from '../data/tech.js';
import { ANIMALS, buyAnimal, canHouse, animalCapacity, animalCount } from '../farm/livestock.js';
import { priceMultipliers } from './relationships.js';
import { activeMarketDiscount } from './festivals.js';

/** Rows for a shop counter. Shape varies by `kind`; the renderer switches on it. */
export function stockFor(shopId) {
  switch (shopId) {
    case 'seed': {
      const discount = priceMultipliers.seed() * activeMarketDiscount('seed');
      return state.world.biomesUnlocked
        .flatMap((biome) => cropsForBiome(biome))
        .map((crop) => ({
          kind: 'seed', crop,
          price: Math.max(1, Math.round(crop.seedCost * discount)),
          inSeason: crop.seasons.includes(state.meta.season),
          held: itemCount(seedId(crop.id)),
        }))
        .sort((a, b) => (b.inSeason - a.inSeason) || (a.price - b.price));
    }

    case 'mech': {
      const discount = priceMultipliers.mech();
      return state.army.unlockedUnits
        .map((id) => UNITS[id])
        .filter(Boolean)
        .sort((a, b) => a.cost - b.cost)
        .map((unit) => ({ kind: 'info', unit, price: Math.round(unit.cost * discount) }));
    }

    case 'ranch': {
      const discount = priceMultipliers.ranch();
      return Object.values(ANIMALS).map((animal) => ({
        kind: 'animal', animal,
        price: Math.round(animal.price * discount),
        room: canHouse(animal.id),
        housed: animalCount(animal.building),
        capacity: animalCapacity()[animal.building],
      }));
    }

    case 'forge': {
      const discount = priceMultipliers.tool();
      const can = state.farm.wateringCan;
      return [
        { kind: 'upgrade', id: 'can', label: 'Watering Can', level: can.level,
          price: Math.round(400 * Math.pow(2.1, can.level - 1) * discount),
          desc: `+8 capacity (now ${can.capacity}).` },
        { kind: 'building', id: 'coop', label: 'Coop', level: state.farm.buildings.coop,
          price: Math.round(2200 * Math.pow(1.8, state.farm.buildings.coop) * discount),
          desc: 'Houses 4 chickens. Appears on your farm.' },
        { kind: 'building', id: 'barn', label: 'Barn', level: state.farm.buildings.barn,
          price: Math.round(4800 * Math.pow(1.8, state.farm.buildings.barn) * discount),
          desc: 'Houses 4 cows or sheep. Appears on your farm.' },
      ];
    }

    case 'salvage': {
      const buys = ['fertilizer', 'ration', 'repairKit'].map((id) => ({
        kind: 'buy', item: ITEMS[id], price: ITEMS[id].price,
      }));
      const sells = ['scrap', 'alloy', 'core']
        .map((id) => ({ kind: 'sell', item: ITEMS[id], price: ITEMS[id].price, held: itemCount(id) }))
        .filter((row) => row.held > 0);
      return [...buys, ...sells];
    }

    case 'board':
      return RESEARCH_IDS.map((id) => {
        const node = RESEARCH[id];
        const owned = state.army.research.includes(id);
        const itemsOk = Object.entries(node.items ?? {})
          .every(([itemId, qty]) => itemCount(itemId) >= qty);
        return {
          kind: 'research', node, owned,
          affordable: state.meta.gold >= node.gold && itemsOk,
        };
      });

    default:
      return [];
  }
}

/**
 * Apply a purchase. Returns { ok, message, kind } — the caller only has to
 * show the message.
 */
export function purchase(row, { onFarmChanged = null } = {}) {
  switch (row.kind) {
    case 'seed':
      if (!spendGold(row.price, 'seed')) return fail('Not enough gold.');
      addItem(seedId(row.crop.id), 1);
      return ok(`Bought ${row.crop.name} seed.`);

    case 'animal': {
      if (!row.room) return fail(`Build a ${row.animal.building} first.`);
      if (!spendGold(row.price, 'animal')) return fail('Not enough gold.');
      const res = buyAnimal(row.animal.id);
      if (!res.ok) { addGold(row.price, 'refund'); return fail(res.reason); }
      return ok(`${row.animal.name} is waiting in the ${row.animal.building}.`);
    }

    case 'upgrade': {
      if (!spendGold(row.price, 'tool')) return fail('Not enough gold.');
      const can = state.farm.wateringCan;
      can.level++;
      can.capacity += 8;
      can.water = can.capacity;
      return ok(`Watering can holds ${can.capacity} now.`);
    }

    case 'building': {
      if (!spendGold(row.price, 'building')) return fail('Not enough gold.');
      state.farm.buildings[row.id] = (state.farm.buildings[row.id] ?? 0) + 1;

      // Redeem animals gifted before there was anywhere to put them.
      const pending = state.farm.pendingAnimals ?? [];
      for (let i = pending.length - 1; i >= 0; i--) {
        if (canHouse(pending[i])) { buyAnimal(pending[i]); pending.splice(i, 1); }
      }
      onFarmChanged?.();
      return ok(`${row.label} built. Go and see it.`);
    }

    case 'buy':
      if (!spendGold(row.price, 'item')) return fail('Not enough gold.');
      addItem(row.item.id, 1);
      return ok(`Bought ${row.item.name}.`);

    case 'sell':
      if (!removeItem(row.item.id, 1)) return fail('None left.');
      addGold(row.price, 'sale');
      return ok(`Sold ${row.item.name} for ${row.price}g.`);

    case 'research': {
      const node = row.node;
      if (row.owned) return fail('Already researched.');
      for (const [itemId, qty] of Object.entries(node.items ?? {})) {
        if (itemCount(itemId) < qty) return fail(`Needs ${qty} ${itemName(itemId)}.`);
      }
      if (!spendGold(node.gold, 'research')) return fail('Not enough gold.');
      for (const [itemId, qty] of Object.entries(node.items ?? {})) removeItem(itemId, qty);
      state.army.research.push(node.id);
      return ok(`${node.name} researched.`);
    }

    case 'info':
      return { ok: true, kind: 'info', unit: row.unit };

    default:
      return fail('Nothing to buy.');
  }
}

const ok = (message) => ({ ok: true, message });
const fail = (message) => ({ ok: false, message });

/** One-line description of what a shop is for, shown above its stock. */
export const SHOP_BLURB = {
  seed: 'Seed for every season you have land to grow it in.',
  mech: 'Chassis specs. Squads are bought at the front, with the war chest.',
  ranch: 'Livestock. They need a building before they need anything else.',
  forge: 'Tools and farm buildings.',
  salvage: 'Consumables bought, wreckage sold.',
  board: 'Permanent research. Costs gold and salvage both.',
};
