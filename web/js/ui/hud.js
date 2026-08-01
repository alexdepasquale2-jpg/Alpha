// Persistent top bar: date, weather, gold, energy. Drawn by whichever scene
// wants it rather than owning a slot in the scene stack.

import { COLORS, text, fillRound, bar, SEASON_TINT } from './theme.js';
import { dateLabel, seasonName } from '../core/state.js';
import { WEATHER } from '../farm/farmSim.js';

export const HUD_HEIGHT = 56;

export function hudBottom(view) {
  return view.safeTop + HUD_HEIGHT;
}

export function drawHud(ctx, view, state, { showEnergy = true } = {}) {
  const top = view.safeTop;
  const h = HUD_HEIGHT;

  ctx.fillStyle = 'rgba(18,24,15,.92)';
  ctx.fillRect(0, 0, view.w, top + h);
  ctx.fillStyle = COLORS.panelEdge;
  ctx.fillRect(0, top + h - 1, view.w, 1);

  // Season stripe — a colour cue you read before the words.
  const tint = SEASON_TINT[seasonName(state.meta.season)] ?? COLORS.green;
  ctx.fillStyle = tint;
  ctx.fillRect(0, top + h - 3, view.w, 3);

  const weather = WEATHER[state.farm.weather] ?? WEATHER.clear;
  text(ctx, `${weather.icon} ${dateLabel(state.meta)}`, 14, top + 20, {
    size: 14, color: COLORS.ink,
  });

  text(ctx, `${state.meta.gold.toLocaleString()}g`, view.w - 14, top + 20, {
    size: 16, color: COLORS.gold, align: 'right',
  });

  if (showEnergy) {
    const pct = state.meta.energy / state.meta.maxEnergy;
    const barW = Math.min(160, view.w * 0.4);
    const barX = 14;
    const barY = top + 34;
    bar(ctx, barX, barY, barW, 8, pct, {
      fill: pct > 0.3 ? COLORS.green : COLORS.rust,
      edge: COLORS.panelEdge,
    });
    text(ctx, `${Math.round(state.meta.energy)}`, barX + barW + 8, barY + 4, {
      size: 11, color: COLORS.inkDim, weight: 500,
    });
  }

  const squads = state.army.squads.length;
  if (squads) {
    text(ctx, `⚙ ${squads} squad${squads === 1 ? '' : 's'}`, view.w - 14, top + 40, {
      size: 11, color: COLORS.inkDim, align: 'right', weight: 500,
    });
  }
}

/** Small pill used for counters (ready crops, unwatered plots, unfed animals). */
export function pill(ctx, x, y, label, { color = COLORS.gold, bg = 'rgba(24,33,20,.9)' } = {}) {
  ctx.font = '600 11px ui-rounded, system-ui, sans-serif';
  const w = ctx.measureText(label).width + 18;
  fillRound(ctx, x, y, w, 22, 11, bg);
  text(ctx, label, x + w / 2, y + 11, { size: 11, color, align: 'center' });
  return w;
}
