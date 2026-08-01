// Enemy army construction and deployment. Pure and seeded, like the sim, so a
// given territory + round + seed always produces the same opposing army.

import { UNITS, squadCost } from '../data/units.js';
import { TECH, TECH_IDS } from '../data/tech.js';
import { FIELD_W, FIELD_H, DEPLOY_ROWS } from './simulation.js';

/**
 * Composition archetypes. Weights are relative picks; the builder spends its
 * budget by repeatedly drawing from the style's pool.
 */
export const STYLES = {
  rabble: {
    name: 'Scavengers',
    pool: { tiller: 5, scarecrow: 2, harvester: 1 },
    desc: 'Numbers and nothing else.',
  },
  swarm: {
    name: 'Drone Host',
    pool: { tiller: 6, plowhorse: 3, cropduster: 2, harvester: 1 },
    desc: 'Fast, cheap, and everywhere at once.',
  },
  armor: {
    name: 'Iron Column',
    pool: { harvester: 4, barn_guardian: 3, combine_titan: 1, beekeeper: 2, thresher: 1 },
    desc: 'Slow, thick, and very hard to kill.',
  },
  artillery: {
    name: 'Gun Line',
    pool: { sprinkler: 4, seed_mortar: 3, silo_cannon: 2, harvester: 2, thresher: 2 },
    desc: 'Outranges you and waits.',
  },
  air: {
    name: 'Sky Flock',
    pool: { cropduster: 6, scarecrow: 2, root_anchor: 2, plowhorse: 1 },
    desc: 'Goes over your line, not through it.',
  },
  mixed: {
    name: 'Combined Arms',
    // Deliberately padded with cheap chaff. Combined arms has an answer to
    // everything, which would make it strictly best if it also hit as hard as
    // a specialist comp — the filler is what artillery punishes it for.
    pool: {
      tiller: 4, harvester: 2, thresher: 2, sprinkler: 1, cropduster: 2,
      scarecrow: 2, barn_guardian: 1, beekeeper: 1, plowhorse: 2,
    },
    desc: 'A little of everything, and no obvious hole.',
  },
  titan: {
    name: 'Siege Host',
    pool: {
      combine_titan: 3, silo_cannon: 3, barn_guardian: 2,
      root_anchor: 2, beekeeper: 2, thresher: 2,
    },
    desc: 'Heavy metal. Bring something that can chew through it.',
  },
};

/**
 * Build an enemy army worth roughly `budget` gold.
 *
 * @param {string} style key of STYLES
 * @param {number} budget gold to spend
 * @param {Rng} rng
 * @param {object} opts
 *   counter  the player's squads — the AI spends a slice of budget answering them
 */
export function buildArmy(style, budget, rng, { counter = [] } = {}) {
  const def = STYLES[style] ?? STYLES.mixed;
  const pool = Object.entries(def.pool)
    .map(([unitId, weight]) => ({ unitId, weight }))
    .filter((e) => UNITS[e.unitId]);

  const squads = [];
  let spent = 0;
  let nextId = 1000;

  // Reserve a slice to specifically answer what the player brought last time.
  const counterBudget = counter.length ? budget * 0.25 : 0;
  const counterPicks = pickCounters(counter, counterBudget, rng);
  for (const unitId of counterPicks) {
    const cost = squadCost(unitId);
    if (spent + cost > budget) break;
    squads.push(makeSquad(nextId++, unitId, UNITS[unitId].size));
    spent += cost;
  }

  // Spend the rest from the style pool. Bail out when nothing affordable is
  // left rather than looping forever on an unaffordable pool.
  let guard = 0;
  while (spent < budget && guard++ < 200) {
    const affordable = pool.filter((e) => spent + UNITS[e.unitId].cost <= budget);
    if (!affordable.length) break;
    const pick = rng.weighted(affordable);
    const unit = UNITS[pick.unitId];

    // Sometimes buy a bigger-than-standard squad instead of a second squad.
    let count = unit.size;
    const headroom = budget - spent - unit.cost;
    const extras = Math.min(
      unit.maxSize - unit.size,
      Math.floor(headroom / Math.max(1, unit.reinforceCost)),
    );
    if (extras > 0 && rng.chance(0.45)) count += rng.int(1, Math.min(extras, unit.size));

    squads.push(makeSquad(nextId++, pick.unitId, count));
    spent += squadCost(pick.unitId, count);
  }

  // Guarantee at least one squad, however small the budget.
  if (!squads.length) {
    squads.push(makeSquad(nextId++, pool[0]?.unitId ?? 'tiller', UNITS.tiller.size));
  }

  deployArmy(squads, 'enemy', rng);
  return { squads, spent, style, styleName: def.name };
}

function makeSquad(id, unitId, count) {
  const unit = UNITS[unitId];
  return {
    id, unitId,
    count: Math.max(1, Math.min(count, unit.maxSize)),
    maxCount: unit.maxSize,
    veterancy: 0,
    hpPct: 1,
    x: 0, y: 0,
  };
}

/**
 * Look at what the player fielded and name units that beat it. Deliberately
 * partial — the AI should feel like it's adapting, not reading your mind.
 */
function pickCounters(playerSquads, budgetSlice, rng) {
  if (!playerSquads.length || budgetSlice <= 0) return [];

  let air = 0, swarm = 0, armor = 0, artillery = 0;
  for (const squad of playerSquads) {
    const unit = UNITS[squad.unitId];
    if (!unit) continue;
    const weight = squad.count * unit.cost;
    if (unit.flying) air += weight;
    if (unit.traits?.includes('swarm') || squad.count >= 8) swarm += weight;
    if (unit.hp >= 340) armor += weight;
    if (unit.range >= 3.5) artillery += weight;
  }

  const answers = [];
  if (air > 0) answers.push({ unitId: rng.chance(0.5) ? 'scarecrow' : 'root_anchor', weight: air });
  if (swarm > 0) answers.push({ unitId: 'thresher', weight: swarm });
  if (armor > 0) answers.push({ unitId: rng.chance(0.5) ? 'silo_cannon' : 'sprinkler', weight: armor });
  if (artillery > 0) answers.push({ unitId: rng.chance(0.5) ? 'plowhorse' : 'cropduster', weight: artillery });
  if (!answers.length) return [];

  answers.sort((a, b) => b.weight - a.weight);
  const picks = [];
  let spent = 0;
  for (const answer of answers) {
    const cost = squadCost(answer.unitId);
    if (spent + cost > budgetSlice) continue;
    picks.push(answer.unitId);
    spent += cost;
  }
  return picks;
}

/**
 * Place squads in their deployment zone. Ranged units go to the back rows,
 * melee to the front, and everything spreads across the width.
 */
export function deployArmy(squads, side, rng) {
  const rows = side === 'enemy'
    ? [0, 1, 2]                                   // enemy owns the top rows
    : [FIELD_H - 1, FIELD_H - 2, FIELD_H - 3];    // player the bottom

  const sorted = [...squads].sort((a, b) => {
    const ra = UNITS[a.unitId]?.range ?? 0;
    const rb = UNITS[b.unitId]?.range ?? 0;
    return ra - rb;    // shortest range first => front of the formation
  });

  // Front row for the sorted-first units, back row for the long guns.
  const taken = new Set();
  sorted.forEach((squad, i) => {
    const band = Math.min(DEPLOY_ROWS - 1, Math.floor((i / Math.max(1, sorted.length)) * DEPLOY_ROWS));
    const rowIndex = side === 'enemy' ? band : band;   // rows array is already oriented
    let placed = false;

    for (let attempt = 0; attempt < FIELD_W * DEPLOY_ROWS && !placed; attempt++) {
      const row = rows[Math.min(rows.length - 1, rowIndex + Math.floor(attempt / FIELD_W))];
      const col = (rng.int(0, FIELD_W - 1) + attempt) % FIELD_W;
      const key = `${col},${row}`;
      if (taken.has(key)) continue;
      taken.add(key);
      squad.x = col;
      squad.y = row;
      placed = true;
    }
    if (!placed) {
      squad.x = rng.int(0, FIELD_W - 1);
      squad.y = rows[rows.length - 1];
    }
  });

  return squads;
}

/** Tech the enemy brings, scaling with how deep into the campaign you are. */
export function enemyTech(squads, difficulty, rng) {
  const unitIds = [...new Set(squads.map((s) => s.unitId))];
  const candidates = TECH_IDS.filter((id) => unitIds.includes(TECH[id].unitId));
  if (!candidates.length) return [];
  const picks = Math.max(0, Math.min(candidates.length, Math.floor(difficulty)));
  return rng.sample(candidates, picks);
}

/**
 * Offer the player a hand of tech cards. Biased toward units they actually
 * field, with one wildcard so the choice isn't always obvious.
 */
export function offerTech(playerSquads, ownedTech, rng, count = 3) {
  const owned = new Set(ownedTech);
  const fielded = [...new Set(playerSquads.map((s) => s.unitId))];

  const relevant = TECH_IDS.filter((id) => fielded.includes(TECH[id].unitId) && !owned.has(id));
  const rest = TECH_IDS.filter((id) => !fielded.includes(TECH[id].unitId) && !owned.has(id));

  const hand = rng.sample(relevant, Math.min(count, relevant.length));
  while (hand.length < count && rest.length) {
    const pick = rng.pick(rest);
    if (!hand.includes(pick)) hand.push(pick);
    rest.splice(rest.indexOf(pick), 1);
  }
  return hand.map((id) => TECH[id]);
}
