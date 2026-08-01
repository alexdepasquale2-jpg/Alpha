// The battle simulation.
//
// PURE AND HEADLESS. This module must never touch the DOM, the canvas,
// Math.random, Date.now, or performance.now. Everything it does is a function
// of the battle object and its seeded RNG. That is what lets us:
//   - render it live, or resolve it instantly and skip the animation
//   - replay any battle from its seed
//   - run ten thousand of them in Node to check balance
//
// Node imports this file directly in tests/sim.test.mjs, so keep its imports
// limited to other pure data/logic modules.

import { Rng } from '../core/rng.js';
import { UNITS } from '../data/units.js';
import { applyTech } from '../data/tech.js';
import {
  dist, selectTarget, nearestEngageable, nearestWoundedAlly, withinRadius,
} from './targeting.js';

export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;
export const FIELD_W = 6;
export const FIELD_H = 10;
export const DEPLOY_ROWS = 3;              // rows each side may deploy into
export const MAX_TICKS = SIM_HZ * 90;      // 90 seconds, then it's a draw

const ATTACK_INTERVAL = 1.0;               // seconds between attacks
const SEPARATION_RADIUS = 0.42;            // models push apart to avoid stacking
const HOMESTEAD_DAMAGE_PER_POWER = 0.055;

/* ---- construction -------------------------------------------------------- */

/**
 * Resolve a unit's live stats: base stats folded with the season's tech cards.
 * Kept separate so the deploy UI can show the same numbers the sim will use.
 */
export function resolveStats(unitId, techIds = []) {
  const base = UNITS[unitId];
  if (!base) throw new Error(`unknown unit "${unitId}"`);
  const stats = applyTech(base, techIds);
  stats.priority = stats.priority
    ?? (stats.flags.includes('flanker') ? 'backline' : 'nearest');
  return stats;
}

let nextModelId = 1;

function spawnModel(squad, index, side, techIds, rng) {
  const stats = resolveStats(squad.unitId, techIds);
  const hp = stats.hp * (1 + 0.06 * (squad.veterancy ?? 0));

  // Fan models out around the squad's deploy cell so they don't start stacked.
  const perRow = Math.ceil(Math.sqrt(Math.max(1, squad.count)));
  const col = index % perRow;
  const row = Math.floor(index / perRow);
  const spreadX = (col - (perRow - 1) / 2) * 0.34;
  const spreadY = (row - (perRow - 1) / 2) * 0.34;

  return {
    id: nextModelId++,
    side,
    squadId: squad.id,
    unitId: squad.unitId,
    stats,
    flying: !!stats.flying,
    x: squad.x + 0.5 + spreadX + rng.range(-0.06, 0.06),
    y: squad.y + 0.5 + spreadY + rng.range(-0.06, 0.06),
    hp,
    maxHp: hp,
    shield: stats.shield ?? 0,
    maxShield: stats.shield ?? 0,
    alive: true,
    targetId: null,
    cooldown: rng.range(0, ATTACK_INTERVAL),   // desync opening volleys
    burnTime: 0,
    burnDps: 0,
    struck: null,          // targets already hit once, for chargeStrike
    damageDealt: 0,
    kills: 0,
    // Aura bonuses, recomputed each tick from nearby aura sources.
    auraDamage: 1,
    auraArmor: 0,
  };
}

/**
 * Build a battle.
 *
 * @param {object} cfg
 *   playerSquads  [{ id, unitId, count, x, y, veterancy, hpPct }]
 *   enemySquads   same shape
 *   playerTech    tech ids owned by the player this season
 *   enemyTech     tech ids the enemy comp brings
 *   seed          number — same seed + same squads = identical battle
 *   homesteadHp   player's remaining assault HP
 */
export function createBattle({
  playerSquads = [], enemySquads = [], playerTech = [], enemyTech = [],
  seed = 1, homesteadHp = 100, collectFx = true,
} = {}) {
  const rng = new Rng(seed);
  nextModelId = 1;

  const models = [];
  for (const squad of playerSquads) {
    for (let i = 0; i < squad.count; i++) {
      models.push(spawnModel(squad, i, 'player', playerTech, rng));
    }
  }
  for (const squad of enemySquads) {
    for (let i = 0; i < squad.count; i++) {
      models.push(spawnModel(squad, i, 'enemy', enemyTech, rng));
    }
  }

  // Squads deployed at partial strength come in already damaged.
  for (const squad of [...playerSquads, ...enemySquads]) {
    if (squad.hpPct != null && squad.hpPct < 1) {
      for (const m of models) {
        if (m.squadId === squad.id) m.hp = Math.max(1, m.maxHp * squad.hpPct);
      }
    }
  }

  const battle = {
    rng,
    seed,
    tick: 0,
    time: 0,
    over: false,
    winner: null,
    models,
    mines: [],
    fx: collectFx ? [] : null,
    homesteadHp,
    homesteadDamage: 0,
    stats: { playerKills: 0, enemyKills: 0, playerDamage: 0, enemyDamage: 0 },
  };

  applyRoundStartEffects(battle);
  return battle;
}

/** Minelayers seed the midfield; aura shields go up before the first shot. */
function applyRoundStartEffects(battle) {
  for (const m of battle.models) {
    if (m.stats.flags?.includes('minelayer')) {
      const forward = m.side === 'player' ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        battle.mines.push({
          side: m.side,
          x: clamp(m.x + battle.rng.range(-1.6, 1.6), 0.2, FIELD_W - 0.2),
          y: clamp(m.y + forward * battle.rng.range(1.5, 3.5), 0.2, FIELD_H - 0.2),
          damage: m.stats.minDamage ?? 90,
          radius: 0.9,
        });
      }
    }
    if (m.stats.flags?.includes('auraShield')) {
      for (const ally of withinRadius(battle.models, m.x, m.y, m.stats.aura?.radius ?? 3)) {
        if (ally.side === m.side && ally !== m) {
          ally.shield += 150;
          ally.maxShield += 150;
        }
      }
    }
  }
}

/* ---- stepping ------------------------------------------------------------ */

const alive = (battle, side) => battle.models.filter((m) => m.alive && m.side === side);

export function step(battle) {
  if (battle.over) return battle;

  battle.tick++;
  battle.time += SIM_DT;

  const players = alive(battle, 'player');
  const enemies = alive(battle, 'enemy');

  computeAuras(battle, players, enemies);

  // Stable iteration order (model ids ascend) keeps the sim deterministic.
  for (const model of battle.models) {
    if (!model.alive) continue;
    const foes = model.side === 'player' ? enemies : players;
    const friends = model.side === 'player' ? players : enemies;
    stepModel(battle, model, foes, friends);
  }

  applyBurn(battle);
  applySeparation(battle);
  checkMines(battle);
  reap(battle);
  checkVictory(battle);

  return battle;
}

function computeAuras(battle, players, enemies) {
  for (const m of battle.models) {
    m.auraDamage = 1;
    m.auraArmor = 0;
  }
  for (const source of battle.models) {
    if (!source.alive || !source.stats.aura) continue;
    const { radius, damage = 1, armor = 0 } = source.stats.aura;
    const pool = source.side === 'player' ? players : enemies;
    for (const ally of pool) {
      if (ally === source) continue;
      if (dist(source, ally) <= radius) {
        ally.auraDamage = Math.max(ally.auraDamage, damage);
        ally.auraArmor = Math.max(ally.auraArmor, armor);
      }
    }
  }
}

function stepModel(battle, model, foes, friends) {
  const stats = model.stats;

  // Repair units work on allies and never chase.
  if (stats.flags?.includes('healer') && stats.heal > 0) {
    const patient = nearestWoundedAlly(model, friends);
    if (patient) {
      patient.hp = Math.min(patient.maxHp, patient.hp + stats.heal * SIM_DT);
    }
    // An "Angry Hive" Beekeeper also shoots; fall through if it has dps.
    if (!stats.dps) { advanceOrHold(battle, model, foes); return; }
  }

  if (!foes.length) return;

  let target = model.targetId != null
    ? battle.models.find((m) => m.id === model.targetId && m.alive)
    : null;

  // Re-acquire when the current target dies or drifts out of reach.
  if (!target || dist(model, target) > stats.range * 1.35) {
    target = selectTarget(model, foes);
    model.targetId = target?.id ?? null;
  }

  if (!target) { advanceOrHold(battle, model, foes); return; }

  const d = dist(model, target);
  const minRange = stats.minRange ?? 0;
  const inRange = d <= stats.range && (minRange === 0 || d >= minRange);

  if (inRange) {
    model.cooldown -= SIM_DT;
    if (model.cooldown <= 0) {
      model.cooldown += ATTACK_INTERVAL;
      fire(battle, model, target);
    }
    // Siege units back away from anything inside their minimum range.
    if (minRange > 0 && d < minRange && stats.speed > 0) {
      moveAway(model, target, stats.speed * SIM_DT);
    }
  } else if (stats.speed > 0) {
    if (minRange > 0 && d < minRange) moveAway(model, target, stats.speed * SIM_DT);
    else moveToward(model, target, stats.speed * SIM_DT);
  }
}

/** No valid target: walk into enemy territory looking for one. */
function advanceOrHold(battle, model, foes) {
  if (model.stats.speed <= 0) return;
  const goal = nearestEngageable(model, foes);
  if (goal) { moveToward(model, goal, model.stats.speed * SIM_DT); return; }
  const forward = model.side === 'player' ? -1 : 1;
  model.y = clamp(model.y + forward * model.stats.speed * SIM_DT, 0.2, FIELD_H - 0.2);
}

function moveToward(model, target, step) {
  const dx = target.x - model.x;
  const dy = target.y - model.y;
  const len = Math.hypot(dx, dy) || 1;
  model.x = clamp(model.x + (dx / len) * step, 0.15, FIELD_W - 0.15);
  model.y = clamp(model.y + (dy / len) * step, 0.15, FIELD_H - 0.15);
}

function moveAway(model, target, step) {
  const dx = model.x - target.x;
  const dy = model.y - target.y;
  const len = Math.hypot(dx, dy) || 1;
  model.x = clamp(model.x + (dx / len) * step, 0.15, FIELD_W - 0.15);
  model.y = clamp(model.y + (dy / len) * step, 0.15, FIELD_H - 0.15);
}

function fire(battle, model, target) {
  const stats = model.stats;
  let damage = stats.dps * model.auraDamage;

  // Scarecrows and other flak do far more to things in the air.
  if (target.flying && stats.airBonus) damage *= stats.airBonus;

  // Plowhorse: the first hit on a given target lands like a charge.
  if (stats.flags?.includes('chargeStrike')) {
    model.struck = model.struck ?? [];
    if (!model.struck.includes(target.id)) {
      model.struck.push(target.id);
      damage *= 3;
    }
  }

  if (battle.fx) {
    battle.fx.push({
      type: 'shot', tick: battle.tick, side: model.side, weapon: stats.weapon,
      x0: model.x, y0: model.y, x1: target.x, y1: target.y, splash: stats.splash ?? 0,
    });
  }

  if ((stats.splash ?? 0) > 0) {
    const foes = battle.models.filter((m) => m.alive && m.side !== model.side);
    for (const victim of withinRadius(foes, target.x, target.y, stats.splash)) {
      // Falloff: full damage at the centre, half at the edge.
      const falloff = 1 - 0.5 * (dist(victim, target) / stats.splash);
      damageModel(battle, model, victim, damage * falloff);
    }
  } else {
    damageModel(battle, model, target, damage);
  }

  if (stats.flags?.includes('burn')) {
    target.burnTime = Math.max(target.burnTime, stats.burnTime ?? 3);
    target.burnDps = Math.max(target.burnDps, stats.burnDps ?? 25);
  }
}

/** Armour is a smooth percentage reduction — no flat-damage cliff edges. */
function mitigate(raw, target) {
  const armor = Math.max(0, (target.stats.armor ?? 0) + target.auraArmor);
  let dmg = raw * (1 - armor / (armor + 30));
  if (target.stats.flags?.includes('chaff')) dmg *= 0.65;
  return dmg;
}

function damageModel(battle, attacker, target, raw) {
  if (!target.alive) return;
  const dmg = mitigate(raw, target);

  // Shields soak first and do not regenerate mid-round.
  let remaining = dmg;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp -= remaining;

  if (attacker) {
    attacker.damageDealt += dmg;
    if (attacker.side === 'player') battle.stats.playerDamage += dmg;
    else battle.stats.enemyDamage += dmg;

    // Spiked Frame reflects a slice of melee damage back at the attacker.
    if (target.stats.flags?.includes('thorns') && attacker.stats.range <= 1.2) {
      attacker.hp -= dmg * 0.25;
      if (attacker.hp <= 0) killModel(battle, attacker, null);
    }
  }

  if (target.hp <= 0) killModel(battle, target, attacker);
}

function killModel(battle, model, killer) {
  if (!model.alive) return;
  model.alive = false;
  model.hp = 0;

  if (killer) {
    killer.kills++;
    if (killer.side === 'player') battle.stats.playerKills++;
    else battle.stats.enemyKills++;
  }

  if (battle.fx) {
    battle.fx.push({ type: 'death', tick: battle.tick, x: model.x, y: model.y, side: model.side, unitId: model.unitId });
  }

  const stats = model.stats;

  // Harvester's Last Swing.
  if (stats.flags?.includes('deathBlast')) {
    const radius = stats.deathBlastRadius ?? 1.5;
    const foes = battle.models.filter((m) => m.alive && m.side !== model.side);
    for (const victim of withinRadius(foes, model.x, model.y, radius)) {
      damageModel(battle, null, victim, stats.deathBlast ?? 140);
    }
    if (battle.fx) battle.fx.push({ type: 'blast', tick: battle.tick, x: model.x, y: model.y, radius });
  }

  // Tiller's Split Harvest: two half-strength seedlings take its place.
  if (stats.flags?.includes('splitOnDeath') && !model.isSeedling) {
    for (let i = 0; i < 2; i++) {
      const seed = {
        ...model,
        id: nextModelId++,
        alive: true,
        isSeedling: true,
        hp: model.maxHp * 0.5,
        maxHp: model.maxHp * 0.5,
        shield: 0,
        maxShield: 0,
        targetId: null,
        cooldown: 0.3,
        struck: null,
        damageDealt: 0,
        kills: 0,
        stats: { ...stats, dps: stats.dps * 0.6 },
        x: clamp(model.x + (i === 0 ? -0.3 : 0.3), 0.15, FIELD_W - 0.15),
        y: model.y,
      };
      battle.models.push(seed);
    }
  }
}

function applyBurn(battle) {
  for (const model of battle.models) {
    if (!model.alive || model.burnTime <= 0) continue;
    model.burnTime -= SIM_DT;
    model.hp -= model.burnDps * SIM_DT;
    if (model.hp <= 0) killModel(battle, model, null);
  }
}

/** Cheap mutual repulsion so squads spread instead of occupying one point. */
function applySeparation(battle) {
  const living = battle.models.filter((m) => m.alive);
  for (let i = 0; i < living.length; i++) {
    const a = living[i];
    for (let j = i + 1; j < living.length; j++) {
      const b = living[j];
      if (a.flying !== b.flying) continue;   // different layers, no collision
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > SEPARATION_RADIUS * SEPARATION_RADIUS || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (SEPARATION_RADIUS - d) * 0.5;
      const nx = (dx / d) * push;
      const ny = (dy / d) * push;
      a.x = clamp(a.x - nx, 0.15, FIELD_W - 0.15);
      a.y = clamp(a.y - ny, 0.15, FIELD_H - 0.15);
      b.x = clamp(b.x + nx, 0.15, FIELD_W - 0.15);
      b.y = clamp(b.y + ny, 0.15, FIELD_H - 0.15);
    }
  }
}

function checkMines(battle) {
  if (!battle.mines.length) return;
  for (let i = battle.mines.length - 1; i >= 0; i--) {
    const mine = battle.mines[i];
    const victims = battle.models.filter(
      (m) => m.alive && m.side !== mine.side && !m.flying
         && Math.hypot(m.x - mine.x, m.y - mine.y) <= mine.radius,
    );
    if (!victims.length) continue;
    for (const victim of victims) damageModel(battle, null, victim, mine.damage);
    if (battle.fx) {
      battle.fx.push({ type: 'blast', tick: battle.tick, x: mine.x, y: mine.y, radius: mine.radius });
    }
    battle.mines.splice(i, 1);
  }
}

/** Drop the dead once per tick so the model list doesn't grow without bound. */
function reap(battle) {
  if (battle.tick % 30 !== 0) return;
  battle.models = battle.models.filter((m) => m.alive);
}

function checkVictory(battle) {
  const players = battle.models.some((m) => m.alive && m.side === 'player');
  const enemies = battle.models.some((m) => m.alive && m.side === 'enemy');

  if (players && enemies && battle.tick < MAX_TICKS) return;

  battle.over = true;
  if (players && !enemies) battle.winner = 'player';
  else if (enemies && !players) battle.winner = 'enemy';
  else if (!players && !enemies) battle.winner = 'draw';
  else battle.winner = 'timeout';

  // Whatever the enemy has left walks over the homestead.
  const survivors = battle.models.filter((m) => m.alive && m.side === 'enemy');
  let power = 0;
  for (const m of survivors) {
    power += (m.hp / Math.max(1, m.maxHp)) * Math.max(m.stats.dps, 10);
  }
  battle.homesteadDamage = Math.round(power * HOMESTEAD_DAMAGE_PER_POWER);
  battle.homesteadHp = Math.max(0, battle.homesteadHp - battle.homesteadDamage);
}

/* ---- whole-battle helpers ------------------------------------------------ */

/**
 * Run to completion without rendering. This is what "skip battle" calls, and
 * what the balance harness calls ten thousand times.
 */
export function run(battle, maxTicks = MAX_TICKS) {
  while (!battle.over && battle.tick < maxTicks) step(battle);
  if (!battle.over) { battle.tick = maxTicks; checkVictory(battle); }
  return result(battle);
}

/** Convenience: build and resolve in one call. */
export function simulate(config) {
  return run(createBattle({ ...config, collectFx: false }));
}

/** Serializable outcome. Squad survival feeds back into the persistent army. */
export function result(battle) {
  const survivors = { player: {}, enemy: {} };
  const health = { player: {}, enemy: {} };

  for (const model of battle.models) {
    if (!model.alive || model.isSeedling) continue;
    const bucket = survivors[model.side];
    bucket[model.squadId] = (bucket[model.squadId] ?? 0) + 1;
    const h = health[model.side];
    h[model.squadId] = (h[model.squadId] ?? 0) + model.hp / Math.max(1, model.maxHp);
  }
  for (const side of ['player', 'enemy']) {
    for (const squadId of Object.keys(health[side])) {
      health[side][squadId] /= survivors[side][squadId];
    }
  }

  return {
    winner: battle.winner,
    ticks: battle.tick,
    seconds: +(battle.tick / SIM_HZ).toFixed(1),
    survivors,
    health,
    homesteadHp: battle.homesteadHp,
    homesteadDamage: battle.homesteadDamage,
    stats: battle.stats,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
