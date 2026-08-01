// Endless Defence: unlocked after taking the Ironfield. Waves escalate without
// end; you keep whatever salvage you bank before the homestead falls.
//
// It reuses the assault ladder wholesale by synthesising a "territory" whose
// round count is effectively infinite and whose budget curve never flattens.

import { state, addItem, addGold, logEvent } from '../core/state.js';
import { emit, EVENTS } from '../core/events.js';
import { TERRITORIES } from '../data/territories.js';
import { researchEffects } from '../data/tech.js';
import { startAssault } from '../battle/assault.js';

export const ENDLESS_ID = 'endless';

const STYLE_ROTATION = ['mixed', 'swarm', 'air', 'armor', 'artillery', 'titan'];

/**
 * Register the synthetic endless parcel. Kept out of the campaign map data so
 * it never shows up as a normal node or counts toward "parcels owned".
 */
export function ensureEndlessTerritory() {
  const best = state.world.endless.bestWave ?? 0;
  const style = STYLE_ROTATION[best % STYLE_ROTATION.length];

  TERRITORIES[ENDLESS_ID] = {
    id: ENDLESS_ID,
    name: 'Homestead Defence',
    biome: 'frostreach',
    pos: { x: 0.5, y: 0.5 },
    requires: [],
    rounds: 999,
    budget: 1400,
    escalation: 1.22,
    enemyStyle: style,
    synthetic: true,
    reward: {},
    desc: 'They keep coming. See how long the fences hold.',
  };
  return TERRITORIES[ENDLESS_ID];
}

export function startEndlessWave() {
  if (!state.world.endless.unlocked) {
    return { ok: false, reason: 'Take the Ironfield first.' };
  }
  if (state.world.currentAssault) {
    return { ok: false, reason: 'An assault is already underway.' };
  }

  ensureEndlessTerritory();
  const res = startAssault(ENDLESS_ID);
  if (!res.ok) return res;

  // Endless is meant to be survived, not won: no victory phase, just a score.
  res.assault.endless = true;
  res.assault.score = 0;
  logEvent('Endless defence begins.', 'battle');
  return res;
}

/** True when the assault currently running is an endless run. */
export function isEndless(assault = state.world.currentAssault) {
  return !!assault?.endless;
}

/**
 * Called from the round-end handler for endless runs. Scores the wave and
 * decides whether the run continues.
 */
export function scoreEndlessRound(assault, outcome) {
  if (!isEndless(assault)) return null;

  const wave = assault.wins;
  assault.score = (assault.score ?? 0) + outcome.stats.playerKills * 10 + wave * 25;

  const best = state.world.endless;
  if (wave > (best.bestWave ?? 0)) best.bestWave = wave;
  if (assault.score > (best.bestScore ?? 0)) best.bestScore = assault.score;

  return { wave, score: assault.score, bestWave: best.bestWave, bestScore: best.bestScore };
}

/**
 * End an endless run and pay out. Called instead of claimVictory, since the
 * run only ever ends in defeat or a voluntary stop.
 */
export function bankEndlessRun() {
  const assault = state.world.currentAssault;
  if (!isEndless(assault)) return null;

  const research = researchEffects(state.army.research);
  const wave = assault.wins;
  const gold = Math.round(wave * 220 * research.salvageMult);
  const banked = {};

  addGold(gold, 'endless');
  for (const [itemId, qty] of Object.entries(assault.salvage)) {
    if (qty > 0) { addItem(itemId, qty); banked[itemId] = qty; }
  }
  // A core per five waves survived, on top of battlefield salvage.
  const cores = Math.floor(wave / 5);
  if (cores > 0) { addItem('core', cores); banked.core = (banked.core ?? 0) + cores; }

  const summary = {
    wave,
    score: assault.score ?? 0,
    gold,
    banked,
    bestWave: state.world.endless.bestWave,
    bestScore: state.world.endless.bestScore,
  };

  logEvent(`Endless defence: survived ${wave} wave(s) for ${gold}g.`, 'battle');
  emit(EVENTS.BATTLE_OVER, { endless: true, ...summary });

  state.world.currentAssault = null;
  return summary;
}
