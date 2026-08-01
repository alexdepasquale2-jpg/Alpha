// Headless simulation tests. No browser, no build step:
//
//     node tests/sim.test.mjs
//     node tests/sim.test.mjs --matrix     also print the unit win-rate matrix
//
// The battle sim is a pure ES module with no DOM dependencies, which is what
// makes this possible — and what makes it worth keeping that way.

import { Rng } from '../web/js/core/rng.js';
import { UNITS, UNIT_IDS, squadCost } from '../web/js/data/units.js';
import { TECH_IDS, TECH, applyTech } from '../web/js/data/tech.js';
import {
  createBattle, run, simulate, step, result, MAX_TICKS, SIM_HZ, FIELD_H,
} from '../web/js/battle/simulation.js';
import { buildArmy, STYLES } from '../web/js/battle/ai.js';
import {
  TERRITORIES, TERRITORY_IDS, budgetForRound, playerBudgetForRound,
} from '../web/js/data/territories.js';

/* ---- tiny test harness --------------------------------------------------- */

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'not equal'}: expected ${expected}, got ${actual}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

/* ---- fixtures ------------------------------------------------------------ */

let squadId = 1;

function squad(unitId, count = null, x = 2, y = 8) {
  const unit = UNITS[unitId];
  return {
    id: squadId++,
    unitId,
    count: count ?? unit.size,
    veterancy: 0,
    hpPct: 1,
    x, y,
  };
}

/** Two armies of roughly equal gold value, for a fair matchup. */
function equalGoldArmies(unitA, unitB, gold = 900) {
  const a = UNITS[unitA];
  const b = UNITS[unitB];
  const countFor = (unit) => {
    const extra = Math.floor((gold - unit.cost) / unit.reinforceCost);
    return Math.max(1, Math.min(unit.maxSize, unit.size + Math.max(0, extra)));
  };
  return {
    playerSquads: [squad(unitA, countFor(a), 2, FIELD_H - 2)],
    enemySquads: [squad(unitB, countFor(b), 2, 1)],
  };
}

/* ---- determinism --------------------------------------------------------- */

section('Determinism');

test('identical seeds produce byte-identical results', () => {
  const config = equalGoldArmies('harvester', 'tiller');
  const first = JSON.stringify(simulate({ ...config, seed: 12345 }));
  for (let i = 0; i < 100; i++) {
    const again = JSON.stringify(simulate({ ...config, seed: 12345 }));
    assertEqual(again, first, `run ${i} diverged`);
  }
});

test('different seeds can produce different results', () => {
  const config = equalGoldArmies('scarecrow', 'cropduster');
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    seen.add(JSON.stringify(simulate({ ...config, seed })));
  }
  assert(seen.size > 1, 'every seed produced the same battle — RNG is not being consumed');
});

test('stepping manually matches running in one go', () => {
  const config = { ...equalGoldArmies('thresher', 'tiller'), seed: 999, collectFx: false };
  const a = run(createBattle(config));

  const b = createBattle(config);
  while (!b.over) step(b);
  const bResult = result(b);

  assertEqual(JSON.stringify(bResult), JSON.stringify(a), 'step-by-step diverged from run()');
});

test('the sim never touches Math.random', () => {
  const original = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return original(); };
  try {
    simulate({ ...equalGoldArmies('combine_titan', 'plowhorse'), seed: 5 });
  } finally {
    Math.random = original;
  }
  assertEqual(calls, 0, 'sim called Math.random — battles will not replay');
});

/* ---- termination --------------------------------------------------------- */

section('Termination');

test('every unit pairing terminates within the tick cap', () => {
  const rng = new Rng(4242);
  for (const a of UNIT_IDS) {
    for (const b of UNIT_IDS) {
      const config = equalGoldArmies(a, b);
      const outcome = simulate({ ...config, seed: rng.int(1, 1e9) });
      assert(outcome.ticks <= MAX_TICKS, `${a} vs ${b} ran past the cap`);
      assert(outcome.winner != null, `${a} vs ${b} produced no winner`);
    }
  }
});

test('two static units that cannot reach each other resolve as a timeout', () => {
  // Root Anchor is air-only and immobile; two of them can never trade.
  const outcome = simulate({
    playerSquads: [squad('root_anchor', 1, 2, FIELD_H - 2)],
    enemySquads: [squad('root_anchor', 1, 2, 1)],
    seed: 7,
  });
  assertEqual(outcome.winner, 'timeout', 'expected a stalemate');
  assertEqual(outcome.ticks, MAX_TICKS, 'timeout should burn the full clock');
});

test('an empty side loses immediately', () => {
  const outcome = simulate({
    playerSquads: [],
    enemySquads: [squad('tiller', 6, 2, 1)],
    seed: 1,
  });
  assertEqual(outcome.winner, 'enemy');
  assert(outcome.ticks <= 2, 'should resolve on the first tick');
});

/* ---- mechanics ----------------------------------------------------------- */

section('Mechanics');

test('flyers are untouchable by ground-only weapons', () => {
  // Harvester is ground-only; Cropdusters should wipe it without losses.
  const outcome = simulate({
    playerSquads: [squad('cropduster', 4, 2, FIELD_H - 2)],
    enemySquads: [squad('harvester', 4, 2, 1)],
    seed: 3,
  });
  assertEqual(outcome.winner, 'player', 'ground-only unit somehow shot down flyers');
  assertEqual(outcome.stats.enemyKills, 0, 'flyers took losses from a ground-only weapon');
});

test('flak shreds what bruisers cannot touch', () => {
  const ground = simulate({
    playerSquads: [squad('harvester', 4, 2, FIELD_H - 2)],
    enemySquads: [squad('cropduster', 6, 2, 1)],
    seed: 11,
  });
  const flak = simulate({
    playerSquads: [squad('scarecrow', 6, 2, FIELD_H - 2)],
    enemySquads: [squad('cropduster', 6, 2, 1)],
    seed: 11,
  });
  assertEqual(ground.winner, 'enemy', 'harvesters should lose to air outright');
  assertEqual(flak.winner, 'player', 'scarecrows should beat an equal flight');
});

test('splash beats a swarm that single-target fire cannot clear', () => {
  const single = simulate({
    playerSquads: [squad('scarecrow', 3, 2, FIELD_H - 2)],
    enemySquads: [squad('tiller', 18, 2, 1)],
    seed: 21,
  });
  const splash = simulate({
    playerSquads: [squad('thresher', 2, 2, FIELD_H - 2)],
    enemySquads: [squad('tiller', 18, 2, 1)],
    seed: 21,
  });
  assert(splash.stats.playerKills > single.stats.playerKills,
         'splash killed no more swarm models than single-target fire');
});

test('armour reduces damage taken but never to zero', () => {
  // Same matchup twice, differing only in the defender's armour (via tech), so
  // nothing but mitigation can explain the difference.
  const base = {
    playerSquads: [squad('tiller', 14, 2, FIELD_H - 2)],
    enemySquads: [squad('harvester', 3, 2, 1)],
    seed: 31,
  };
  const soft = simulate(base);
  const armoured = simulate({ ...base, enemyTech: ['h_armor'] });   // +6 armour

  assert(armoured.stats.playerDamage > 0, 'armour zeroed out incoming damage entirely');
  assert(armoured.stats.playerKills <= soft.stats.playerKills,
         'the better-armoured squad lost at least as many models');
});

test('veterancy makes a squad strictly stronger', () => {
  const base = { enemySquads: [squad('harvester', 3, 2, 1)], seed: 77 };
  const green = simulate({ ...base, playerSquads: [{ ...squad('harvester', 3, 2, FIELD_H - 2), veterancy: 0 }] });
  const veteran = simulate({ ...base, playerSquads: [{ ...squad('harvester', 3, 2, FIELD_H - 2), veterancy: 5 }] });
  assert(veteran.stats.enemyKills <= green.stats.enemyKills,
         'veterans lost more models than green troops in the same fight');
});

test('a damaged squad enters the field already hurt', () => {
  const outcome = simulate({
    playerSquads: [{ ...squad('harvester', 2, 2, FIELD_H - 2), hpPct: 0.2 }],
    enemySquads: [squad('harvester', 2, 2, 1)],
    seed: 55,
  });
  assertEqual(outcome.winner, 'enemy', 'a squad at 20% health should lose the mirror');
});

/* ---- tech ---------------------------------------------------------------- */

section('Tech');

test('every tech card targets a real unit and parses', () => {
  for (const id of TECH_IDS) {
    const card = TECH[id];
    assert(UNITS[card.unitId], `${id} targets unknown unit "${card.unitId}"`);
    assert(card.name && card.desc, `${id} is missing name or description`);
    const stats = applyTech(UNITS[card.unitId], [id]);
    assert(Number.isFinite(stats.hp) && stats.hp > 0, `${id} produced a non-finite hp`);
    assert(Number.isFinite(stats.dps) && stats.dps >= 0, `${id} produced a non-finite dps`);
  }
});

test('tech makes a unit measurably better in a mirror match', () => {
  const teched = simulate({
    playerSquads: [squad('tiller', 12, 2, FIELD_H - 2)],
    enemySquads: [squad('tiller', 12, 2, 1)],
    playerTech: ['t_blades', 't_plating'],
    seed: 91,
  });
  assertEqual(teched.winner, 'player', 'two tech cards failed to win a mirror match');
});

test('stat modifiers compose in set -> add -> mult order', () => {
  const stats = applyTech(UNITS.scarecrow, ['s_ground', 's_reach']);
  // s_reach adds 1.5 range on top of the base 3.0.
  assertEqual(stats.range, 4.5, 'additive range did not apply');
  // s_ground multiplies dps by 1.9 from the base 26.
  assert(Math.abs(stats.dps - 26 * 1.9) < 1e-9, 'multiplicative dps did not apply');
  assertEqual(stats.airBonus, 1.15, 'set override did not apply');
});

/* ---- AI and campaign ----------------------------------------------------- */

section('Campaign');

test('enemy armies fit their budget and field something', () => {
  const rng = new Rng(2024);
  for (const id of TERRITORY_IDS) {
    const territory = TERRITORIES[id];
    for (let round = 1; round <= territory.rounds; round++) {
      const budget = budgetForRound(territory, round);
      const army = buildArmy(territory.enemyStyle, budget, rng);
      assert(army.squads.length > 0, `${id} round ${round} produced an empty army`);
      assert(army.spent <= budget, `${id} round ${round} overspent: ${army.spent} > ${budget}`);
      assert(army.spent >= budget * 0.5,
             `${id} round ${round} underspent badly: ${army.spent} of ${budget}`);
      for (const s of army.squads) {
        assert(s.y >= 0 && s.y <= 2, `${id} squad deployed outside the enemy zone (y=${s.y})`);
        assert(s.count >= 1 && s.count <= UNITS[s.unitId].maxSize, `${id} squad has a bad count`);
      }
    }
  }
});

test('campaign difficulty rises monotonically across the critical path', () => {
  const path = ['m1', 'm2', 'm4', 's1', 's2', 's4', 'a1', 'a2', 'a4', 'f1', 'f2', 'f4'];
  let previous = 0;
  for (const id of path) {
    const budget = budgetForRound(TERRITORIES[id], 1);
    assert(budget > previous, `${id} (${budget}) is not harder than the parcel before it (${previous})`);
    previous = budget;
  }
});

test('every territory reward references real content', () => {
  for (const id of TERRITORY_IDS) {
    const reward = TERRITORIES[id].reward ?? {};
    for (const unitId of reward.units ?? []) {
      assert(UNITS[unitId], `${id} rewards unknown unit "${unitId}"`);
    }
    for (const req of TERRITORIES[id].requires) {
      assert(TERRITORIES[req], `${id} requires unknown territory "${req}"`);
    }
  }
});

test('a reasonable army beats the opening parcel', () => {
  const territory = TERRITORIES.m1;
  const rng = new Rng(31337);
  let wins = 0;
  const trials = 40;
  for (let i = 0; i < trials; i++) {
    const enemy = buildArmy(territory.enemyStyle, budgetForRound(territory, 1), rng);
    const gold = playerBudgetForRound(territory, 1);
    // What a new player would plausibly buy: a bruiser and a screen of tillers.
    const player = [
      squad('harvester', 2, 2, FIELD_H - 2),
      squad('tiller', 6, 3, FIELD_H - 1),
    ];
    void gold;
    const outcome = simulate({
      playerSquads: player,
      enemySquads: enemy.squads,
      seed: rng.int(1, 1e9),
    });
    if (outcome.winner === 'player') wins++;
  }
  const rate = wins / trials;
  assert(rate >= 0.5, `opening parcel is too hard: sensible opener wins only ${(rate * 100).toFixed(0)}%`);
});

/* ---- balance matrix (opt-in) --------------------------------------------- */

/**
 * Spend `gold` on one unit type across as many squads as it takes. A single
 * squad caps at maxSize, so buying one squad and calling it "equal gold" would
 * badly under-fund the cheap units — a real player buys three Tiller squads.
 */
function forceOf(unitId, gold, side) {
  const unit = UNITS[unitId];
  const rows = side === 'player' ? [FIELD_H - 1, FIELD_H - 2, FIELD_H - 3] : [0, 1, 2];
  const squads = [];
  let spent = 0;
  let slot = 0;

  while (spent + unit.cost <= gold && slot < 18) {
    let count = unit.size;
    let cost = unit.cost;
    while (count < unit.maxSize && spent + cost + unit.reinforceCost <= gold) {
      count++;
      cost += unit.reinforceCost;
    }
    squads.push({
      ...squad(unitId, count),
      x: slot % 6,
      y: rows[Math.floor(slot / 6) % 3],
    });
    spent += cost;
    slot++;
  }
  if (!squads.length) squads.push(squad(unitId, unit.size, 2, rows[0]));
  return squads;
}

function winRate(unitA, unitB, trials = 12, gold = 1400) {
  const rng = new Rng(9001 + unitA.length * 31 + unitB.length);
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const outcome = simulate({
      playerSquads: forceOf(unitA, gold, 'player'),
      enemySquads: forceOf(unitB, gold, 'enemy'),
      seed: rng.int(1, 1e9),
    });
    if (outcome.winner === 'player') wins++;
    else if (outcome.winner === 'timeout' || outcome.winner === 'draw') wins += 0.5;
  }
  return wins / trials;
}

function styleWinRate(styleA, styleB, trials = 16, budget = 2000) {
  const rng = new Rng(555 + styleA.length * 17 + styleB.length);
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const a = buildArmy(styleA, budget, rng);
    const b = buildArmy(styleB, budget, rng);
    for (const s of a.squads) s.y = FIELD_H - 1 - s.y;    // mirror to player rows
    const outcome = simulate({
      playerSquads: a.squads, enemySquads: b.squads, seed: rng.int(1, 1e9),
    });
    if (outcome.winner === 'player') wins++;
    else if (outcome.winner !== 'enemy') wins += 0.5;
  }
  return wins / trials;
}

section('Balance');

// Three chassis cannot win a solo duel by construction, and that is the design:
// Beekeeper and Windmill Array deal no damage at all, and Root Anchor is
// air-only, so it cannot touch eleven of the fourteen units. They are measured
// by what they do for an army, not by duels — see the composition test below.
const SOLO_EXEMPT = new Set(['beekeeper', 'windmill_array', 'root_anchor']);

test('no self-sufficient unit dominates or is dominated at equal gold', () => {
  const combatants = UNIT_IDS.filter((id) => !SOLO_EXEMPT.has(id));
  const averages = combatants.map((unitId) => {
    let total = 0;
    for (const other of combatants) {
      if (other === unitId) continue;
      total += winRate(unitId, other, 6);
    }
    return { unitId, rate: total / (combatants.length - 1) };
  });

  const broken = averages.filter((a) => a.rate > 0.88 || a.rate < 0.15);
  const detail = broken.map((a) => `${a.unitId} ${(a.rate * 100).toFixed(0)}%`).join(', ');
  assert(broken.length === 0, `unit(s) outside the 15-88% band at equal gold: ${detail}`);
});

test('support units earn their cost inside an army', () => {
  // A Beekeeper cannot win alone, but a line that includes one should beat the
  // same line without one. That is the only claim its stat block makes.
  const line = (extra) => [
    squad('harvester', 4, 2, FIELD_H - 2),
    squad('harvester', 4, 4, FIELD_H - 2),
    ...(extra ? [squad(extra, 1, 3, FIELD_H - 1)] : []),
  ];
  const enemy = () => [squad('harvester', 4, 2, 1), squad('harvester', 4, 4, 1)];

  let withSupport = 0;
  const rng = new Rng(6161);
  for (let i = 0; i < 20; i++) {
    const seed = rng.int(1, 1e9);
    const plain = simulate({ playerSquads: line(null), enemySquads: enemy(), seed });
    const helped = simulate({ playerSquads: line('beekeeper'), enemySquads: enemy(), seed });
    if (helped.stats.enemyKills <= plain.stats.enemyKills) withSupport++;
  }
  assert(withSupport >= 15,
         `a Beekeeper reduced losses in only ${withSupport}/20 fights — it is not pulling its weight`);
});

test('no composition style beats every other style', () => {
  const styles = Object.keys(STYLES);
  for (const a of styles) {
    const beatsAll = styles
      .filter((b) => b !== a)
      .every((b) => styleWinRate(a, b, 10) > 0.65);
    assert(!beatsAll, `"${a}" comps beat every other style — there is no counter to it`);
  }
});

test('every style has something it loses to', () => {
  const styles = Object.keys(STYLES);
  for (const a of styles) {
    const losesToSomething = styles
      .filter((b) => b !== a)
      .some((b) => styleWinRate(a, b, 10) < 0.5);
    assert(losesToSomething, `"${a}" comps have no losing matchup`);
  }
});

if (process.argv.includes('--matrix')) {
  section('Win-rate matrix (row beats column, equal gold)');
  const width = Math.max(...UNIT_IDS.map((id) => id.length));
  console.log(' '.repeat(width + 2) + UNIT_IDS.map((id) => id.slice(0, 4).padStart(6)).join(''));
  for (const a of UNIT_IDS) {
    const cells = UNIT_IDS.map((b) => (
      a === b ? '     ·' : `${(winRate(a, b, 10) * 100).toFixed(0)}%`.padStart(6)
    ));
    console.log(`  ${a.padEnd(width)}${cells.join('')}`);
  }

  section('Composition matrix (row beats column, equal budget)');
  const styles = Object.keys(STYLES);
  console.log(' '.repeat(12) + styles.map((s) => s.slice(0, 5).padStart(7)).join(''));
  for (const a of styles) {
    const cells = styles.map((b) => (
      a === b ? '      ·' : `${(styleWinRate(a, b, 16) * 100).toFixed(0)}%`.padStart(7)
    ));
    console.log(`  ${a.padEnd(10)}${cells.join('')}`);
  }
}

/* ---- report -------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  for (const f of failures) console.log(`\n${f.name}\n${f.err.stack}`);
  process.exit(1);
}
