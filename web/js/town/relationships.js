// Hearts, gifting, and the concrete perks that come with being liked.

import {
  state, addGold, addItem, removeItem, itemCount, logEvent,
} from '../core/state.js';
import { emit, EVENTS } from '../core/events.js';
import {
  NPCS, NPC_IDS, HEART_MAX, POINTS_PER_HEART, giftReaction, REACTION_TEXT, dialogueFor,
} from '../data/npcs.js';
import { itemName } from '../data/items.js';
import { UNITS } from '../data/units.js';
import { CROPS } from '../data/crops.js';
import { RESEARCH } from '../data/tech.js';

const GIFTS_PER_DAY = 1;

export function npcState(npcId) {
  const town = state.town;
  town.npcs[npcId] ??= { hearts: 0, points: 0, giftedOn: 0, met: false, claimed: [] };
  // Older saves predate `claimed`; graft it rather than crash on push.
  town.npcs[npcId].claimed ??= [];
  return town.npcs[npcId];
}

export function hearts(npcId) {
  return npcState(npcId).hearts;
}

export function canGift(npcId) {
  const day = dayKey();
  return npcState(npcId).giftedOn !== day;
}

function dayKey() {
  const m = state.meta;
  return m.year * 10000 + m.season * 100 + m.day;
}

/**
 * Give an item. Returns the reaction so the UI can print the right line and
 * the right face.
 */
export function giveGift(npcId, itemId) {
  const npc = NPCS[npcId];
  if (!npc) return { ok: false, reason: 'Nobody by that name.' };
  if (!canGift(npcId)) return { ok: false, reason: `${npc.name} has had a gift today.` };
  if (itemCount(itemId) < 1) return { ok: false, reason: `You have no ${itemName(itemId)}.` };

  removeItem(itemId, 1);
  const st = npcState(npcId);
  st.giftedOn = dayKey();
  st.met = true;

  const { reaction, points } = giftReaction(npcId, itemId);
  const unlocked = addPoints(npcId, points);

  const lines = REACTION_TEXT[reaction] ?? REACTION_TEXT.neutral;
  const line = lines[(st.points + itemId.length) % lines.length];

  return { ok: true, reaction, points, line, hearts: st.hearts, unlocked };
}

/** Add affection points and grant any newly-crossed heart rewards. */
export function addPoints(npcId, points) {
  const st = npcState(npcId);
  const before = st.hearts;
  st.points = Math.max(0, Math.min(HEART_MAX * POINTS_PER_HEART, st.points + points));
  st.hearts = Math.min(HEART_MAX, Math.floor(st.points / POINTS_PER_HEART));

  const unlocked = [];
  if (st.hearts > before) {
    emit(EVENTS.HEARTS_CHANGED, { npcId, hearts: st.hearts });
    for (let level = before + 1; level <= st.hearts; level++) {
      const reward = NPCS[npcId].rewards?.[level];
      if (reward && !st.claimed.includes(level)) {
        st.claimed.push(level);
        grantReward(npcId, reward);
        unlocked.push({ level, ...reward });
      }
    }
  }
  return unlocked;
}

function grantReward(npcId, reward) {
  const npc = NPCS[npcId];
  switch (reward.kind) {
    case 'gold':
      addGold(reward.value, `${npcId} reward`);
      break;
    case 'item':
      for (const [itemId, qty] of Object.entries(reward.value)) addItem(itemId, qty);
      break;
    case 'unit':
      if (UNITS[reward.value] && !state.army.unlockedUnits.includes(reward.value)) {
        state.army.unlockedUnits.push(reward.value);
        emit(EVENTS.UNIT_UNLOCKED, { unitId: reward.value });
      }
      break;
    case 'crop':
      if (CROPS[reward.value] && !state.farm.unlockedCrops.includes(reward.value)) {
        state.farm.unlockedCrops.push(reward.value);
        emit(EVENTS.CROP_UNLOCKED, { cropId: reward.value });
      }
      break;
    case 'research':
      if (RESEARCH[reward.value] && !state.army.research.includes(reward.value)) {
        state.army.research.push(reward.value);
      }
      break;
    case 'energy':
      state.meta.maxEnergy += reward.value;
      state.meta.energy += reward.value;
      break;
    case 'animal': {
      // Needs a building; if there's no room the animal waits as a voucher.
      state.farm.pendingAnimals ??= [];
      state.farm.pendingAnimals.push(reward.value);
      break;
    }
    default:
      // discount / produce / salvage / contracts are read live from hearts;
      // nothing to grant at the moment they unlock.
      break;
  }
  logEvent(`${npc.name}: ${reward.text}`, 'town');
  emit(EVENTS.TOAST, { message: `${npc.name} — ${reward.text}`, kind: 'gold', ms: 3600 });
}

/* ---- perks read live from heart level ------------------------------------ */

/** Best multiplier of `kind` currently unlocked from a given NPC. */
function perk(npcId, kind, fallback) {
  const st = npcState(npcId);
  const rewards = NPCS[npcId]?.rewards ?? {};
  let value = fallback;
  for (const [level, reward] of Object.entries(rewards)) {
    if (reward.kind !== kind) continue;
    if (st.hearts < Number(level)) continue;
    // Discounts are multipliers below 1 — take the best (lowest).
    value = kind.toLowerCase().includes('discount') ? Math.min(value, reward.value)
                                                    : Math.max(value, reward.value);
  }
  return value;
}

export const priceMultipliers = {
  mech: () => perk('mora', 'discount', 1),
  seed: () => perk('bram', 'discount', 1),
  tool: () => perk('ilse', 'toolDiscount', 1),
  ranch: () => perk('wren', 'discount', 1),
};

export function produceBonus() {
  return perk('wren', 'produce', 1);
}

export function salvageBonus() {
  return perk('sable', 'salvage', 1);
}

export function contractSlots() {
  return 2 + Math.round(perk('odell', 'contracts', 0));
}

/* ---- daily ---------------------------------------------------------------- */

/** A greeting line appropriate to how well they know you. */
export function greeting(npcId) {
  const st = npcState(npcId);
  const lines = dialogueFor(npcId, st.hearts);
  return lines[dayKey() % lines.length];
}

/** Talking is worth a little affection, once a day, for free. */
export function talkTo(npcId) {
  const st = npcState(npcId);
  const day = dayKey();
  const line = greeting(npcId);
  if (st.talkedOn === day) return { line, gained: 0, hearts: st.hearts };
  st.talkedOn = day;
  st.met = true;
  const unlocked = addPoints(npcId, 8);
  return { line, gained: 8, hearts: st.hearts, unlocked };
}

/** Summary rows for the town roster. */
export function roster() {
  return NPC_IDS.map((id) => {
    const st = npcState(id);
    return {
      id,
      npc: NPCS[id],
      hearts: st.hearts,
      progress: (st.points % POINTS_PER_HEART) / POINTS_PER_HEART,
      giftable: canGift(id),
      nextReward: NPCS[id].rewards?.[st.hearts + 1] ?? null,
    };
  });
}
