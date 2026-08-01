// Target selection. Pure functions over sim models — no state, no randomness
// beyond what the caller passes in.

import { TARGET } from '../data/units.js';

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function dist(a, b) {
  return Math.sqrt(dist2(a, b));
}

/** Can `attacker` shoot `defender` at all, given air/ground restrictions? */
export function canEngage(attacker, defender) {
  if (!defender.alive) return false;
  const targets = attacker.stats.targets;
  if (defender.flying) return targets === TARGET.AIR || targets === TARGET.BOTH;
  return targets === TARGET.GROUND || targets === TARGET.BOTH;
}

/**
 * Pick a target from `enemies`.
 *
 * Priority modes:
 *   nearest    default — closest engageable enemy
 *   backline   flankers: the engageable enemy furthest into their own half
 *   lowestHp   finishers: whoever dies soonest
 *
 * A living `taunt` unit within range overrides everything: that is the whole
 * point of the Barn Guardian.
 */
export function selectTarget(model, enemies, { priority = null } = {}) {
  const mode = priority ?? model.stats.priority ?? 'nearest';
  const range = model.stats.range;
  const minRange = model.stats.minRange ?? 0;

  let best = null;
  let bestScore = Infinity;
  let tauntTarget = null;
  let tauntScore = Infinity;

  for (const foe of enemies) {
    if (!canEngage(model, foe)) continue;
    const d = dist(model, foe);

    // Siege guns cannot hit what is under their barrel.
    if (minRange > 0 && d < minRange && d <= range) continue;

    let score;
    switch (mode) {
      case 'backline':
        // Deepest into enemy territory, with distance as a mild tiebreak.
        score = -(model.side === 'player' ? -foe.y : foe.y) * 100 + d;
        break;
      case 'lowestHp':
        score = (foe.hp + foe.shield) * 0.01 + d;
        break;
      default:
        score = d;
    }

    if (score < bestScore) { bestScore = score; best = foe; }

    if (foe.stats.flags?.includes('taunt') && d <= range * 1.6 && score < tauntScore) {
      tauntScore = score;
      tauntTarget = foe;
    }
  }

  return tauntTarget ?? best;
}

/** Nearest engageable enemy regardless of priority — used for movement. */
export function nearestEngageable(model, enemies) {
  let best = null;
  let bestD = Infinity;
  for (const foe of enemies) {
    if (!canEngage(model, foe)) continue;
    const d = dist2(model, foe);
    if (d < bestD) { bestD = d; best = foe; }
  }
  return best;
}

/** Nearest wounded ally, for repair units. */
export function nearestWoundedAlly(model, allies) {
  let best = null;
  let bestScore = Infinity;
  for (const ally of allies) {
    if (!ally.alive || ally === model) continue;
    if (ally.hp >= ally.maxHp) continue;
    const d = dist(model, ally);
    if (d > model.stats.range) continue;
    // Prefer the most hurt, then the closest.
    const score = (ally.hp / ally.maxHp) * 10 + d * 0.1;
    if (score < bestScore) { bestScore = score; best = ally; }
  }
  return best;
}

/**
 * Rough "how dangerous is this model" number, used by the enemy AI to decide
 * what to counter-build and by the results screen to rank a battle's MVP.
 */
export function threat(model) {
  const s = model.stats;
  return Math.max(s.dps, s.heal ?? 0, 10) * (1 + (s.splash ?? 0)) * (1 + s.range / 8);
}

/** Everything within `radius` of a point — splash and aura queries. */
export function withinRadius(models, x, y, radius) {
  const r2 = radius * radius;
  const out = [];
  for (const m of models) {
    if (!m.alive) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    if (dx * dx + dy * dy <= r2) out.push(m);
  }
  return out;
}
