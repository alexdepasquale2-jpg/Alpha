// Shared palette and text helpers. Canvas has no stylesheet, so this is it.

export const COLORS = {
  ink: '#e8e2cf',
  inkDim: '#a49d86',
  inkFaint: '#6f6a58',
  bg: '#12180f',
  panel: '#1f2a1a',
  panelDeep: '#182114',
  panelEdge: '#3a4a30',
  gold: '#d8b45a',
  green: '#7fbf5a',
  greenDeep: '#46612f',
  rust: '#c4643a',
  blood: '#8e2f24',
  sky: '#5c86a8',
  water: '#4a7fa5',
  soil: '#5b432c',
  soilTilled: '#3f2e1e',
  soilWet: '#2d2116',
  ally: '#7fbf5a',
  enemy: '#c4643a',
  shield: '#6fb7d8',
  air: '#c9b3e6',
};

export const SEASON_TINT = {
  Sprout: '#8fc46a',
  Swelter: '#d9b356',
  Harvest: '#c97d3f',
  Frost: '#8fb6cf',
};

export const FONT = 'ui-rounded, "Avenir Next", "Segoe UI", system-ui, sans-serif';

export function font(size, weight = 600) {
  return `${weight} ${size}px ${FONT}`;
}

/** Rounded rect path. Canvas roundRect exists everywhere modern, but guard. */
export function roundRect(ctx, x, y, w, h, r = 8) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
  else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}

export function fillRound(ctx, x, y, w, h, r, fill) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function strokeRound(ctx, x, y, w, h, r, stroke, width = 2) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function panel(ctx, x, y, w, h, { r = 14, fill = COLORS.panel, edge = COLORS.panelEdge } = {}) {
  fillRound(ctx, x, y, w, h, r, fill);
  strokeRound(ctx, x, y, w, h, r, edge, 2);
}

export function text(ctx, str, x, y, {
  size = 14, weight = 600, color = COLORS.ink,
  align = 'left', baseline = 'middle', maxWidth = 0,
} = {}) {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (maxWidth > 0) ctx.fillText(str, x, y, maxWidth);
  else ctx.fillText(str, x, y);
}

/** Greedy word wrap. Returns the lines it drew. */
export function wrapText(ctx, str, x, y, maxWidth, lineHeight, opts = {}) {
  ctx.font = font(opts.size ?? 14, opts.weight ?? 500);
  const words = String(str).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => text(ctx, l, x, y + i * lineHeight, opts));
  return lines;
}

/** Horizontal bar with a filled portion — hp, energy, growth, hearts. */
export function bar(ctx, x, y, w, h, pct, { fill = COLORS.green, back = '#0d1209', edge = null, r = 4 } = {}) {
  const clamped = Math.max(0, Math.min(1, pct));
  fillRound(ctx, x, y, w, h, r, back);
  if (clamped > 0) fillRound(ctx, x, y, Math.max(h, w * clamped), h, r, fill);
  if (edge) strokeRound(ctx, x, y, w, h, r, edge, 1);
}

export function shadowText(ctx, str, x, y, opts = {}) {
  text(ctx, str, x + 1, y + 1, { ...opts, color: 'rgba(0,0,0,.6)' });
  text(ctx, str, x, y, opts);
}
