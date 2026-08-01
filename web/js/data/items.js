// Non-crop items: livestock produce, salvage, consumables, gifts.
// Crop produce uses the crop id directly as its item id.

import { CROPS } from './crops.js';

export const ITEMS = {
  /* livestock produce */
  egg:     { id: 'egg', name: 'Egg', icon: '🥚', price: 55, kind: 'produce' },
  milk:    { id: 'milk', name: 'Milk', icon: '🥛', price: 125, kind: 'produce' },
  wool:    { id: 'wool', name: 'Wool', icon: '🧶', price: 210, kind: 'produce' },

  /* salvage — dropped by battles, spent on research and repairs */
  scrap:   { id: 'scrap', name: 'Scrap', icon: '⚙️', price: 18, kind: 'material',
             desc: 'Stripped from wrecks. Repairs squads and buys research.' },
  alloy:   { id: 'alloy', name: 'Alloy', icon: '🔩', price: 90, kind: 'material',
             desc: 'Refined plating. Heavy chassis are hungry for it.' },
  core:    { id: 'core', name: 'Power Core', icon: '🔋', price: 400, kind: 'material',
             desc: 'Intact from a downed titan. Research runs on these.' },

  /* consumables */
  fertilizer: { id: 'fertilizer', name: 'Fertilizer', icon: '💩', price: 60, kind: 'consumable',
                desc: 'Raises a plot\'s soil quality by one step.' },
  ration:     { id: 'ration', name: 'Field Ration', icon: '🍲', price: 120, kind: 'consumable',
                desc: 'Restores 40 energy on the spot.', energy: 40 },
  repairKit:  { id: 'repairKit', name: 'Repair Kit', icon: '🧰', price: 260, kind: 'consumable',
                desc: 'Fully restores one squad between battles.' },

  /* gifts */
  posy:    { id: 'posy', name: 'Wildflower Posy', icon: '💐', price: 80, kind: 'gift' },
  cider:   { id: 'cider', name: 'Cider', icon: '🍺', price: 140, kind: 'gift' },
  trinket: { id: 'trinket', name: 'Brass Trinket', icon: '🔮', price: 180, kind: 'gift' },
};

/** Seed item ids are derived, so adding a crop adds its seed automatically. */
export function seedId(cropId) {
  return `seed:${cropId}`;
}

export function isSeed(itemId) {
  return typeof itemId === 'string' && itemId.startsWith('seed:');
}

export function cropIdFromSeed(itemId) {
  return isSeed(itemId) ? itemId.slice(5) : null;
}

/** Resolve any item id — crop produce, seed, or a table entry. */
export function getItem(itemId) {
  if (ITEMS[itemId]) return ITEMS[itemId];

  if (isSeed(itemId)) {
    const crop = CROPS[cropIdFromSeed(itemId)];
    if (!crop) return null;
    return {
      id: itemId, name: `${crop.name} Seeds`, icon: '🌱',
      price: crop.seedCost, kind: 'seed', cropId: crop.id, color: crop.color,
    };
  }

  const crop = CROPS[itemId];
  if (crop) {
    return {
      id: crop.id, name: crop.name, icon: '🌾',
      price: crop.sellPrice, kind: 'produce', cropId: crop.id, color: crop.color,
    };
  }
  return null;
}

export function itemName(itemId) {
  return getItem(itemId)?.name ?? itemId;
}

/**
 * Sale value including quality. Quality 0 is normal, 1 silver, 2 gold —
 * driven by soil quality and watering discipline.
 */
export const QUALITY_MULT = [1, 1.35, 1.8];
export const QUALITY_NAME = ['', 'Silver', 'Gold'];

export function sellValue(itemId, quality = 0) {
  const item = getItem(itemId);
  if (!item) return 0;
  return Math.round(item.price * (QUALITY_MULT[quality] ?? 1));
}
