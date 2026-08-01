// Festival resolution. Data lives in data/festivals.js; this is the logic that
// pays out when one fires.

import { state, addGold, addItem, logEvent, seasonName } from '../core/state.js';
import { emit, EVENTS } from '../core/events.js';
import { FESTIVALS, festivalOn, festivalKey } from '../data/festivals.js';
import { NPC_IDS } from '../data/npcs.js';
import { addPoints } from './relationships.js';
import { sellValue, getItem } from '../data/items.js';
import { ownedCount } from '../data/territories.js';

/** The festival happening today, if it hasn't already been resolved this year. */
export function todaysFestival() {
  const { season, day, year } = state.meta;
  const festival = festivalOn(season, day);
  if (!festival) return null;
  if (state.town.festivalsDone.includes(festivalKey(festival.id, year))) return null;
  return festival;
}

function markDone(festival) {
  state.town.festivalsDone.push(festivalKey(festival.id, state.meta.year));
  if (state.town.festivalsDone.length > 80) state.town.festivalsDone.splice(0, 20);
}

/**
 * Attend. `entry` is festival-specific: a crop id for judging, nothing for the
 * social ones. Arena festivals are handled separately — see startArena.
 */
export function attend(festivalId, entry = null) {
  const festival = FESTIVALS[festivalId];
  if (!festival) return { ok: false, reason: 'No such festival.' };
  if (state.town.festivalsDone.includes(festivalKey(festivalId, state.meta.year))) {
    return { ok: false, reason: 'Already attended this year.' };
  }

  const outcome = { festival, lines: [] };

  switch (festival.kind) {
    case 'judging': {
      if (!entry) return { ok: false, reason: 'Bring a crop to enter.' };
      if ((state.farm.inventory[entry] ?? 0) < 1) {
        return { ok: false, reason: `No ${getItem(entry)?.name ?? entry} on hand.` };
      }
      state.farm.inventory[entry]--;
      if (state.farm.inventory[entry] <= 0) delete state.farm.inventory[entry];
      const prize = Math.round(sellValue(entry) * festival.effect.prizeMult);
      addGold(prize, 'festival');
      // Everyone saw you win.
      for (const npcId of NPC_IDS) addPoints(npcId, 12);
      outcome.lines.push(`${getItem(entry)?.name} took a prize: ${prize}g.`);
      break;
    }

    case 'social': {
      if (festival.effect.affection) {
        for (const npcId of NPC_IDS) addPoints(npcId, festival.effect.affection);
        outcome.lines.push('Everyone in Coldbrook warms to you.');
      }
      if (festival.effect.homesteadHp) {
        state.army.homesteadHpMax += festival.effect.homesteadHp;
        outcome.lines.push(`Homestead HP permanently +${festival.effect.homesteadHp}.`);
      }
      if (festival.effect.goldPerParcel) {
        const parcels = ownedCount(state.world);
        const gold = parcels * festival.effect.goldPerParcel;
        if (gold > 0) {
          addGold(gold, 'festival');
          outcome.lines.push(`The town pays ${gold}g for ${parcels} parcel(s).`);
        } else {
          outcome.lines.push('You hold no parcels yet. Next year.');
        }
      }
      break;
    }

    case 'market': {
      if (festival.effect.salvageStock) {
        addItem('alloy', 6);
        addItem('core', 1);
        outcome.lines.push('Sable throws in 6 alloy and a core.');
      }
      if (festival.effect.seedDiscount) {
        // The discount is read live by the shop while `activeFestival` matches.
        outcome.lines.push('Seed is 40% off in Bram\'s stall today.');
      }
      break;
    }

    case 'arena':
      // Handled by startArena; attending here just records the visit.
      outcome.lines.push(festival.blurb);
      break;

    default:
      break;
  }

  if (festival.kind !== 'arena' && festival.kind !== 'market') markDone(festival);
  logEvent(`Attended the ${festival.name}.`, 'town');
  emit(EVENTS.TOAST, { message: `${festival.name}: ${outcome.lines[0] ?? 'attended'}`, kind: 'gold' });
  return { ok: true, ...outcome };
}

/** Skip it. Some are once-a-year only, so warn before calling this. */
export function skip(festivalId) {
  const festival = FESTIVALS[festivalId];
  if (!festival) return { ok: false };
  markDone(festival);
  return { ok: true };
}

/**
 * Arena festivals run the normal assault ladder against a synthetic parcel with
 * a loaned budget. Returns the config the map/assault layer needs.
 */
export function arenaConfig(festivalId) {
  const festival = FESTIVALS[festivalId];
  if (!festival || festival.kind !== 'arena') return null;
  return {
    id: `festival:${festivalId}`,
    name: festival.name,
    biome: 'meadow',
    pos: { x: 0.5, y: 0.5 },
    requires: [],
    rounds: 3,
    budget: festival.effect.budget,
    escalation: 1.3,
    enemyStyle: 'mixed',
    synthetic: true,
    festivalId,
    reward: { gold: festival.effect.purse },
    desc: festival.desc,
  };
}

/** Is a market festival's discount live right now? */
export function activeMarketDiscount(kind) {
  const festival = todaysFestival();
  if (!festival || festival.kind !== 'market') return 1;
  if (kind === 'seed' && festival.effect.seedDiscount) return festival.effect.seedDiscount;
  return 1;
}

export function describeToday() {
  const festival = todaysFestival();
  if (!festival) return null;
  return `${festival.name} — ${seasonName()} ${state.meta.day}. ${festival.blurb}`;
}
