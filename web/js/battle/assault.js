// The assault ladder: several rounds against one territory, with reinforcement
// and a tech pick between each. This is the layer that connects the persistent
// season army to the throwaway per-round simulation.

import {
  state, addGold, addItem, logEvent, absoluteDay,
} from '../core/state.js';
import { emit, EVENTS } from '../core/events.js';
import { Rng } from '../core/rng.js';
import { UNITS, squadCost } from '../data/units.js';
import { TECH, researchEffects } from '../data/tech.js';
import { CROPS } from '../data/crops.js';
import {
  getTerritory, budgetForRound, playerBudgetForRound, BIOMES,
} from '../data/territories.js';
import { buildArmy, enemyTech, offerTech, deployArmy } from './ai.js';
import { createBattle, run, result, FIELD_W, FIELD_H, DEPLOY_ROWS } from './simulation.js';

export const PLAYER_ROWS = [FIELD_H - 3, FIELD_H - 2, FIELD_H - 1];

/* ---- lifecycle ---------------------------------------------------------- */

export function startAssault(territoryId) {
  const territory = getTerritory(territoryId);
  if (!territory) return { ok: false, reason: 'No such territory.' };
  if (state.world.currentAssault) return { ok: false, reason: 'An assault is already underway.' };

  const research = researchEffects(state.army.research);
  const seed = (state.meta.seed ^ (absoluteDay() * 7919) ^ hash(territoryId)) >>> 0;

  state.world.currentAssault = {
    territoryId,
    round: 1,
    maxRounds: territory.rounds,
    wins: 0,
    losses: 0,
    seed,
    phase: 'deploy',
    gold: playerBudgetForRound(territory, 1) + research.startGold,
    techIds: [],
    techOffer: [],
    deployment: {},
    enemySquads: [],
    enemyTech: [],
    enemyStyleName: '',
    homesteadHp: state.army.homesteadHpMax + research.homesteadHp,
    homesteadHpMax: state.army.homesteadHpMax + research.homesteadHp,
    salvage: { scrap: 0, alloy: 0, core: 0 },
    history: [],
  };

  prepareRound();
  logEvent(`Marched on ${territory.name}.`, 'battle');
  return { ok: true, assault: state.world.currentAssault };
}

/** Roll the enemy army for the current round and auto-place your squads. */
export function prepareRound() {
  const assault = state.world.currentAssault;
  const territory = getTerritory(assault.territoryId);
  const rng = new Rng((assault.seed ^ (assault.round * 104729)) >>> 0);

  const budget = budgetForRound(territory, assault.round);
  const army = buildArmy(territory.enemyStyle, budget, rng, {
    counter: assault.round > 1 ? playerSquadsForSim() : [],
  });

  assault.enemySquads = army.squads;
  assault.enemyStyleName = army.styleName;
  assault.enemyTech = enemyTech(army.squads, assault.round * 0.7, rng);
  assault.phase = 'deploy';

  autoDeployUndeployed();
}

/** Everything in the season army that has a position, ready for the sim. */
export function playerSquadsForSim() {
  const assault = state.world.currentAssault;
  if (!assault) return [];
  return state.army.squads
    .filter((squad) => assault.deployment[squad.id] && squad.count > 0)
    .map((squad) => ({
      id: squad.id,
      unitId: squad.unitId,
      count: squad.count,
      veterancy: squad.veterancy ?? 0,
      hpPct: squad.hpPct ?? 1,
      x: assault.deployment[squad.id].x,
      y: assault.deployment[squad.id].y,
    }));
}

export function undeployedSquads() {
  const assault = state.world.currentAssault;
  if (!assault) return [];
  return state.army.squads.filter((s) => !assault.deployment[s.id] && s.count > 0);
}

/* ---- deployment --------------------------------------------------------- */

export function isPlayerCell(x, y) {
  return x >= 0 && x < FIELD_W && PLAYER_ROWS.includes(y);
}

export function cellOccupant(x, y) {
  const assault = state.world.currentAssault;
  if (!assault) return null;
  for (const [squadId, pos] of Object.entries(assault.deployment)) {
    if (pos.x === x && pos.y === y) {
      return state.army.squads.find((s) => String(s.id) === String(squadId)) ?? null;
    }
  }
  return null;
}

export function placeSquad(squadId, x, y) {
  const assault = state.world.currentAssault;
  if (!assault) return { ok: false, reason: 'No assault in progress.' };
  if (!isPlayerCell(x, y)) return { ok: false, reason: 'Deploy in your own three rows.' };

  const occupant = cellOccupant(x, y);
  if (occupant && String(occupant.id) !== String(squadId)) {
    // Swap rather than refuse — dragging onto a full cell should just work.
    const mine = assault.deployment[squadId];
    assault.deployment[occupant.id] = mine ? { ...mine } : { x, y };
    if (!mine) delete assault.deployment[occupant.id];
  }
  assault.deployment[squadId] = { x, y };
  return { ok: true };
}

export function recallSquad(squadId) {
  const assault = state.world.currentAssault;
  if (!assault) return { ok: false };
  delete assault.deployment[squadId];
  return { ok: true };
}

/** Fill empty cells with anything not yet on the board. */
export function autoDeployUndeployed() {
  const assault = state.world.currentAssault;
  if (!assault) return;
  const rng = new Rng((assault.seed ^ (assault.round * 7)) >>> 0);

  const pending = undeployedSquads();
  if (!pending.length) return;

  // Reuse the AI's formation logic, then transcribe onto the deployment map.
  const placeholder = pending.map((s) => ({ ...s, x: 0, y: 0 }));
  deployArmy(placeholder, 'player', rng);

  for (const squad of placeholder) {
    let { x, y } = squad;
    if (!isPlayerCell(x, y) || cellOccupant(x, y)) {
      const free = firstFreeCell();
      if (!free) break;
      ({ x, y } = free);
    }
    assault.deployment[squad.id] = { x, y };
  }
}

function firstFreeCell() {
  for (const y of PLAYER_ROWS) {
    for (let x = 0; x < FIELD_W; x++) {
      if (!cellOccupant(x, y)) return { x, y };
    }
  }
  return null;
}

/* ---- shop --------------------------------------------------------------- */

/**
 * Total buying power: the assault's stipend plus the farm's coffers.
 *
 * The stipend keeps the opening rounds playable before the farm is producing,
 * but crop money is what actually funds an army — that is the whole loop, so
 * the shop has to reach it.
 */
export function availableGold(assault = state.world.currentAssault) {
  return (assault?.gold ?? 0) + state.meta.gold;
}

/** Spend the stipend first, then farm gold. Returns false if it can't cover it. */
function spendWarChest(assault, cost) {
  if (availableGold(assault) < cost) return false;
  const fromStipend = Math.min(assault.gold, cost);
  assault.gold -= fromStipend;
  const remainder = cost - fromStipend;
  if (remainder > 0) addGold(-remainder, 'deployment');
  return true;
}

export function buyUnit(unitId) {
  const assault = state.world.currentAssault;
  const unit = UNITS[unitId];
  if (!assault) return { ok: false, reason: 'No assault in progress.' };
  if (!unit) return { ok: false, reason: 'Unknown chassis.' };
  if (!state.army.unlockedUnits.includes(unitId)) return { ok: false, reason: 'Not unlocked.' };
  const free = firstFreeCell();
  if (!free) return { ok: false, reason: 'No room left in your deployment zone.' };
  if (!spendWarChest(assault, unit.cost)) return { ok: false, reason: 'Not enough gold.' };

  const squad = {
    id: state.army.nextSquadId++,
    unitId,
    count: unit.size,
    maxCount: unit.maxSize,
    veterancy: 0,
    hpPct: 1,
    boughtOn: absoluteDay(),
  };
  state.army.squads.push(squad);
  assault.deployment[squad.id] = free;
  return { ok: true, squad };
}

export function reinforce(squadId, models = 1) {
  const assault = state.world.currentAssault;
  const squad = state.army.squads.find((s) => s.id === squadId);
  if (!assault || !squad) return { ok: false, reason: 'No such squad.' };
  const unit = UNITS[squad.unitId];
  if (squad.count >= unit.maxSize) return { ok: false, reason: `${unit.name} squad is at full strength.` };

  const n = Math.min(models, unit.maxSize - squad.count);
  const cost = n * unit.reinforceCost;
  if (!spendWarChest(assault, cost)) return { ok: false, reason: 'Not enough gold.' };

  squad.count += n;
  squad.maxCount = unit.maxSize;
  return { ok: true, added: n, cost };
}

export function sellSquad(squadId) {
  const assault = state.world.currentAssault;
  const index = state.army.squads.findIndex((s) => s.id === squadId);
  if (!assault || index < 0) return { ok: false, reason: 'No such squad.' };
  const squad = state.army.squads[index];
  // Half back, rounded down — selling is an escape hatch, not a strategy.
  const refund = Math.floor(squadCost(squad.unitId, squad.count) * 0.5);
  assault.gold += refund;
  state.army.squads.splice(index, 1);
  delete assault.deployment[squadId];
  return { ok: true, refund };
}

/* ---- running a round ----------------------------------------------------- */

/** Build the battle for the current round. The caller renders or runs it. */
export function buildRoundBattle({ collectFx = true } = {}) {
  const assault = state.world.currentAssault;
  if (!assault) return null;
  autoDeployUndeployed();

  return createBattle({
    playerSquads: playerSquadsForSim(),
    enemySquads: assault.enemySquads,
    playerTech: assault.techIds,
    enemyTech: assault.enemyTech,
    seed: (assault.seed ^ (assault.round * 2654435761)) >>> 0,
    homesteadHp: assault.homesteadHp,
    collectFx,
  });
}

/** Resolve instantly, skipping the animation. */
export function resolveRoundInstantly() {
  const battle = buildRoundBattle({ collectFx: false });
  if (!battle) return null;
  return finishRound(run(battle));
}

/**
 * Fold a finished round's result back into the persistent army and the ladder.
 * Safe to call with the result of either a live or an instant battle.
 */
export function finishRound(outcome) {
  const assault = state.world.currentAssault;
  if (!assault) return null;
  const territory = getTerritory(assault.territoryId);
  const research = researchEffects(state.army.research);

  const playerWon = outcome.winner === 'player';
  if (playerWon) assault.wins++;
  else if (outcome.winner === 'enemy') assault.losses++;

  // Casualties: squads shrink to their survivor count and carry their damage.
  for (const squad of state.army.squads) {
    if (!assault.deployment[squad.id]) continue;
    const survived = outcome.survivors.player[squad.id] ?? 0;
    const health = outcome.health.player[squad.id] ?? 0;
    if (survived > 0 && playerWon) {
      squad.veterancy = Math.min(5, (squad.veterancy ?? 0) + 1);
    }
    squad.count = survived;
    squad.hpPct = survived > 0 ? Math.max(0.15, health) : 0;
  }
  // Wiped squads leave the roster entirely.
  state.army.squads = state.army.squads.filter((s) => s.count > 0);
  for (const id of Object.keys(assault.deployment)) {
    if (!state.army.squads.some((s) => String(s.id) === String(id))) {
      delete assault.deployment[id];
    }
  }

  // Salvage scales with what you destroyed.
  const killed = outcome.stats.playerKills;
  const scrap = Math.round(killed * 1.6 * research.salvageMult);
  const alloy = Math.round(killed * 0.25 * research.salvageMult);
  assault.salvage.scrap += scrap;
  assault.salvage.alloy += alloy;

  assault.homesteadHp = outcome.homesteadHp;
  assault.history.push({
    round: assault.round,
    winner: outcome.winner,
    seconds: outcome.seconds,
    kills: killed,
    homesteadDamage: outcome.homesteadDamage,
  });

  // Endless runs track a running score instead of working toward a win count.
  // Scored here rather than in map/endless.js to keep that module's import of
  // this one one-directional.
  if (assault.endless) {
    assault.score = (assault.score ?? 0) + killed * 10 + assault.wins * 25;
    const best = state.world.endless;
    if (assault.wins > (best.bestWave ?? 0)) best.bestWave = assault.wins;
    if (assault.score > (best.bestScore ?? 0)) best.bestScore = assault.score;
  }

  emit(EVENTS.BATTLE_ROUND_END, { round: assault.round, outcome, assault });

  // Ladder resolution.
  if (assault.homesteadHp <= 0) {
    assault.phase = 'defeat';
  } else if (!assault.endless && assault.wins >= assault.maxRounds) {
    assault.phase = 'victory';
  } else if (!state.army.squads.length && assault.gold < 100) {
    // No army and no money to rebuild — the assault is over.
    assault.phase = 'defeat';
  } else {
    assault.round++;
    assault.gold += Math.round(
      playerBudgetForRound(territory, assault.round) * research.reinforceMult,
    );
    const rng = new Rng((assault.seed ^ (assault.round * 15485863)) >>> 0);
    assault.techOffer = offerTech(
      playerSquadsForSim().length ? playerSquadsForSim() : state.army.squads,
      assault.techIds, rng, research.techChoices,
    ).map((card) => card.id);
    assault.phase = 'tech';
  }

  return { outcome, phase: assault.phase, assault };
}

export function pickTech(techId) {
  const assault = state.world.currentAssault;
  if (!assault) return { ok: false };
  if (!assault.techOffer.includes(techId)) return { ok: false, reason: 'Not on offer.' };
  assault.techIds.push(techId);
  assault.techOffer = [];
  prepareRound();
  return { ok: true, card: TECH[techId] };
}

export function skipTech() {
  const assault = state.world.currentAssault;
  if (!assault) return;
  assault.techOffer = [];
  prepareRound();
}

/* ---- ending ------------------------------------------------------------- */

/** Claim the territory. Called when phase === 'victory'. */
export function claimVictory() {
  const assault = state.world.currentAssault;
  if (!assault) return null;
  const territory = getTerritory(assault.territoryId);
  const reward = territory.reward ?? {};
  const granted = { gold: 0, rows: 0, crops: [], units: [], items: {}, biome: null };

  state.world.territories[territory.id] = { status: 'owned', bestRound: assault.wins };

  if (reward.gold) { addGold(reward.gold, 'territory'); granted.gold = reward.gold; }

  if (reward.rows) {
    expandFarm(reward.rows, territory.biome);
    granted.rows = reward.rows;
  }

  for (const cropId of reward.crops ?? []) {
    if (CROPS[cropId] && !state.farm.unlockedCrops.includes(cropId)) {
      state.farm.unlockedCrops.push(cropId);
      granted.crops.push(cropId);
      emit(EVENTS.CROP_UNLOCKED, { cropId });
    }
  }

  for (const unitId of reward.units ?? []) {
    if (UNITS[unitId] && !state.army.unlockedUnits.includes(unitId)) {
      state.army.unlockedUnits.push(unitId);
      granted.units.push(unitId);
      emit(EVENTS.UNIT_UNLOCKED, { unitId });
    }
  }

  for (const [itemId, qty] of Object.entries(reward.items ?? {})) {
    addItem(itemId, qty);
    granted.items[itemId] = qty;
  }
  for (const [itemId, qty] of Object.entries(assault.salvage)) {
    if (qty > 0) { addItem(itemId, qty); granted.items[itemId] = (granted.items[itemId] ?? 0) + qty; }
  }

  // Taking a gate parcel opens the next biome for farming and for seeds.
  if (territory.gate && !state.world.biomesUnlocked.includes(territory.gate)) {
    state.world.biomesUnlocked.push(territory.gate);
    granted.biome = territory.gate;
  }
  if (reward.endless) {
    state.world.endless.unlocked = true;
    granted.endless = true;
  }

  logEvent(`Took ${territory.name}.`, 'battle');
  emit(EVENTS.TERRITORY_CLAIMED, { territoryId: territory.id, granted });

  state.world.currentAssault = null;
  return { territory, granted };
}

/** Retreat — keeps the army, banks partial salvage, loses the day. */
export function retreat() {
  const assault = state.world.currentAssault;
  if (!assault) return null;
  const territory = getTerritory(assault.territoryId);

  const salvaged = {};
  for (const [itemId, qty] of Object.entries(assault.salvage)) {
    const half = Math.floor(qty * 0.5);
    if (half > 0) { addItem(itemId, half); salvaged[itemId] = half; }
  }

  // The endless parcel is synthetic — it must never enter the campaign map's
  // ownership table.
  if (!assault.endless) {
    const prior = state.world.territories[territory.id] ?? {};
    state.world.territories[territory.id] = {
      status: 'open',
      bestRound: Math.max(prior.bestRound ?? 0, assault.wins),
    };
  }

  logEvent(`Fell back from ${territory.name} after ${assault.wins} round(s).`, 'battle');
  state.world.currentAssault = null;
  return { territory, salvaged, wins: assault.wins };
}

/** Grow the plot grid downward, tagging the new rows with a biome. */
function expandFarm(rows, biome) {
  const farm = state.farm;
  for (let i = 0; i < rows; i++) {
    const y = farm.height;
    for (let x = 0; x < farm.width; x++) {
      farm.plots.push({
        x, y, biome,
        tilled: false, watered: false, soil: 1,
        cropId: null, stage: 0, daysGrown: 0, dryDays: 0,
        regrowsLeft: 0, withered: false,
      });
    }
    farm.height++;
  }
}

/* ---- season rollover ----------------------------------------------------- */

/** Retire the roster at season's end. Called from the season-change handler. */
export function retireArmy() {
  const research = researchEffects(state.army.research);
  if (!state.army.squads.length) return null;

  const entry = {
    season: state.meta.season,
    year: state.meta.year,
    squads: state.army.squads.map((s) => ({
      unitId: s.unitId, count: s.count, veterancy: s.veterancy ?? 0,
    })),
  };
  state.army.hallOfFame.unshift(entry);
  if (state.army.hallOfFame.length > 12) state.army.hallOfFame.length = 12;

  if (research.keepVeterancy) {
    // Veteran Cadre: the crews stay on, at half strength, and rebuild.
    state.army.squads = state.army.squads.map((s) => ({
      ...s,
      count: Math.max(1, Math.floor(s.count / 2)),
      hpPct: 1,
    }));
  } else {
    state.army.squads = [];
  }
  return entry;
}

export function assaultSummary() {
  const assault = state.world.currentAssault;
  if (!assault) return null;
  const territory = getTerritory(assault.territoryId);
  return {
    territory,
    biome: BIOMES[territory.biome],
    round: assault.round,
    maxRounds: assault.maxRounds,
    wins: assault.wins,
    gold: availableGold(assault),
    stipend: assault.gold,
    farmGold: state.meta.gold,
    homesteadHp: assault.homesteadHp,
    homesteadHpMax: assault.homesteadHpMax,
    phase: assault.phase,
    styleName: assault.enemyStyleName,
  };
}

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export { FIELD_W, FIELD_H, DEPLOY_ROWS, result };
