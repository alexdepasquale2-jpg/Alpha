// Minimal pub/sub. Scenes and UI listen; systems emit. Keeps the farm sim from
// having to know that a toast widget exists.

const listeners = new Map();

/** Subscribe. Returns an unsubscribe function. */
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => off(event, fn);
}

/** Subscribe for exactly one firing. */
export function once(event, fn) {
  const stop = on(event, (payload) => { stop(); fn(payload); });
  return stop;
}

export function off(event, fn) {
  listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  // Copy first: a handler may unsubscribe itself or add another.
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[events] handler for "${event}" threw:`, err);
    }
  }
}

/** Drop every listener — used when starting a fresh run. */
export function clearAll() {
  listeners.clear();
}

export const EVENTS = {
  TOAST: 'toast',
  GOLD_CHANGED: 'gold:changed',
  DAY_STARTED: 'day:started',
  DAY_ENDED: 'day:ended',
  SEASON_CHANGED: 'season:changed',
  CROP_HARVESTED: 'crop:harvested',
  BATTLE_ROUND_END: 'battle:roundEnd',
  BATTLE_OVER: 'battle:over',
  TERRITORY_CLAIMED: 'territory:claimed',
  SAVED: 'save:written',
  SAVE_FAILED: 'save:failed',
  UNIT_UNLOCKED: 'unit:unlocked',
  CROP_UNLOCKED: 'crop:unlocked',
  HEARTS_CHANGED: 'npc:hearts',
};
