// Wing three's look: a museum of Earth, lit like a tax office.

import { LAWS } from './laws.js';
import { clamp } from './geom.js';

const TAU = Math.PI * 2;
export const ZOO_SKY = ['#08131a', '#182a30'];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

export function drawZooBack(ctx, cam, W, H, S, t) {
  // cold spotlights hung from nowhere
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const par = 0.18 + (i % 3) * 0.06;
    const bx = ((i * 330 - cam.x * par * S) % (W + 500) + W + 500) % (W + 500) - 150;
    const sway = Math.sin(t * 0.4 + i * 1.7) * 18 * S;
    const grd = ctx.createLinearGradient(0, 0, 0, H * 0.9);
    grd.addColorStop(0, 'rgba(190,240,230,0.10)'); grd.addColorStop(1, 'rgba(190,240,230,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(bx - 8 * S, 0); ctx.lineTo(bx + 8 * S, 0);
    ctx.lineTo(bx + 90 * S + sway, H * 0.9); ctx.lineTo(bx - 90 * S + sway, H * 0.9);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* exhibits and fixtures                                               */
/* ------------------------------------------------------------------ */

function drawCar(ctx) {
  // painted over the three car solids (x 1700..2050, floor 600)
  ctx.save();
  ctx.fillStyle = '#7d3b3b'; ctx.strokeStyle = '#d99a8a'; ctx.lineWidth = 2;
  rr(ctx, 1700, 530, 350, 70, 10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8f4646'; rr(ctx, 1810, 470, 140, 70, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(160,220,240,0.55)';
  rr(ctx, 1822, 480, 52, 40, 4); ctx.fill(); rr(ctx, 1886, 480, 52, 40, 4); ctx.fill();
  ctx.fillStyle = '#111'; ctx.strokeStyle = '#999';
  for (const cx of [1750, 2000]) { ctx.beginPath(); ctx.arc(cx, 600, 19, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, 600, 7, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = '#ffe9a0'; ctx.fillRect(1702, 545, 8, 12);
  ctx.restore();
}

function drawPayphone(ctx, x, t) {
  ctx.save();
  ctx.translate(x, 600);
  ctx.fillStyle = '#2b4a6b'; ctx.strokeStyle = '#8fb6dd'; ctx.lineWidth = 2;
  rr(ctx, -16, -120, 32, 120, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0d1a26'; rr(ctx, -11, -108, 22, 26, 3); ctx.fill();
  ctx.strokeStyle = '#c5d8ea'; ctx.lineWidth = 3;
  const shake = Math.sin(t * 40) * (Math.sin(t * 0.8) > 0.6 ? 1.5 : 0);
  ctx.beginPath(); ctx.moveTo(-12 + shake, -96); ctx.quadraticCurveTo(-26, -70, -14, -56); ctx.stroke();
  ctx.fillStyle = '#e8d36a'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
  ctx.fillText('OUT OF ORDER', 0, -44); ctx.fillText('FOREVER', 0, -34);
  ctx.restore();
}

function drawVending(ctx, x) {
  ctx.save();
  ctx.translate(x, 600);
  ctx.fillStyle = '#31404c'; ctx.strokeStyle = '#7fa0b8'; ctx.lineWidth = 2;
  rr(ctx, -34, -150, 68, 150, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,180,0.18)'; rr(ctx, -28, -142, 44, 96, 3); ctx.fill();
  ctx.fillStyle = '#ffb45e';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ctx.fillRect(-24 + c * 14, -136 + r * 22, 9, 14);
  ctx.fillStyle = '#0d1a22'; ctx.fillRect(-28, -34, 44, 16);
  ctx.restore();
}

function drawKiosk(ctx, r, t, label) {
  ctx.save();
  ctx.fillStyle = '#20404a'; ctx.strokeStyle = '#7fd0c8'; ctx.lineWidth = 2;
  rr(ctx, r.x, r.y, r.w, r.h, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(150,230,255,0.25)'; rr(ctx, r.x + 8, r.y + 10, r.w - 16, 40, 3); ctx.fill();
  ctx.fillStyle = '#f2fbff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText(label, r.x + r.w / 2, r.y - 8 + Math.sin(t * 3) * 1);
  ctx.restore();
}

function drawTramp(ctx, s, g, t) {
  ctx.save();
  const squash = g.flags.boing > 0 ? clamp(g.flags.boing * 4, 0, 1) : 0;
  const top = s.y - 8 + squash * 5;
  ctx.strokeStyle = '#9aa'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(s.x + 6, s.y); ctx.lineTo(s.x + 6, top + 4); ctx.moveTo(s.x + s.w - 6, s.y); ctx.lineTo(s.x + s.w - 6, top + 4); ctx.stroke();
  ctx.fillStyle = '#e8d36a';
  rr(ctx, s.x, top, s.w, 5, 2); ctx.fill();
  ctx.fillStyle = 'rgba(232,211,106,0.35)';
  ctx.fillRect(s.x + 4, top - 2, s.w - 8, 2);
  ctx.restore();
}

function drawGate(ctx, gt, t) {
  const r = gt.rect;
  ctx.save();
  if (gt.broken) {
    // shards on the floor
    ctx.fillStyle = 'rgba(150,230,255,0.5)';
    for (let i = 0; i < 6; i++) ctx.fillRect(r.x - 10 + i * 8, r.y + r.h - 4 - (i % 2) * 3, 5, 3);
    ctx.restore();
    return;
  }
  const open = gt.open;
  // a turnstile: a post and three arms
  ctx.fillStyle = '#243a44'; ctx.strokeStyle = open ? '#7dffb3' : '#7fd0c8'; ctx.lineWidth = 2;
  rr(ctx, r.x, r.y, r.w, r.h, 4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(160,230,255,0.55)'; ctx.lineWidth = 2;
  const spin = open ? t * 5 : 0;
  for (let y = r.y + 16; y < r.y + r.h - 8; y += 22) {
    ctx.beginPath(); ctx.moveTo(r.x + 2, y); ctx.lineTo(r.x + r.w - 2, y + Math.sin(spin + y) * 4); ctx.stroke();
  }
  // the little screen
  ctx.fillStyle = '#eaf4ff'; ctx.strokeStyle = '#2f7dff';
  rr(ctx, r.x - 26, r.y - 22, r.w + 52, 20, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = open ? '#0a6a3a' : '#0a2a66'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
  ctx.fillText(open ? 'WELCOME' : gt.text, r.x + r.w / 2, r.y - 8);
  if (gt.hp < 6 && !open) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6 - gt.hp; i++) { ctx.beginPath(); ctx.moveTo(r.x + 3, r.y + 30 + i * 30); ctx.lineTo(r.x + 14, r.y + 44 + i * 30); ctx.lineTo(r.x + 8, r.y + 58 + i * 30); ctx.stroke(); }
  }
  ctx.restore();
}

function drawCage(ctx, t) {
  ctx.save();
  ctx.strokeStyle = 'rgba(170,220,230,0.55)'; ctx.lineWidth = 3;
  for (let x = 2996; x < 3120; x += 18) { ctx.beginPath(); ctx.moveTo(x, 240); ctx.lineTo(x, 350); ctx.stroke(); }
  ctx.fillStyle = '#e8d36a'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
  ctx.fillText('SPECIMEN: COIN', 3050, 182);
  ctx.restore();
}

function drawPlacard(ctx, pl, t) {
  if (pl.dead) return;
  ctx.save();
  ctx.translate(pl.x, pl.y);
  if (pl.gone > 0) { ctx.globalAlpha = 0.25; }
  // chain
  ctx.strokeStyle = '#7fa0a8'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-14, -60); ctx.moveTo(14, -14); ctx.lineTo(14, -60); ctx.stroke();
  const sway = Math.sin(t * 1.3 + pl.x) * 1.5;
  ctx.translate(sway, 0);
  ctx.fillStyle = '#eaf4ff'; ctx.strokeStyle = pl.bored > 0 ? '#b7a6ff' : '#2f7dff'; ctx.lineWidth = 2;
  rr(ctx, -34, -16, 68, 32, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = pl.cool < 0.5 && pl.gone <= 0 && pl.bored <= 0 ? '#c62828' : '#0a2a66';
  ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
  ctx.fillText(pl.text.length > 14 ? pl.text.slice(0, 13) + '…' : pl.text, 0, -2);
  ctx.fillText(pl.bored > 0 ? 'zzz' : '( i )', 0, 9);
  ctx.restore();
}

function drawShots(ctx, g) {
  for (const s of g.shots) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(234,244,255,0.95)'; ctx.strokeStyle = '#2f7dff'; ctx.lineWidth = 1.5;
    rr(ctx, -20, -8, 40, 16, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0a2a66'; ctx.font = 'bold 6px monospace'; ctx.textAlign = 'center';
    ctx.fillText(s.text.length > 10 ? s.text.slice(0, 9) + '…' : s.text, 0, 3);
    ctx.restore();
  }
}

function drawDecoy(ctx, g, t) {
  const D = g.decoy;
  if (!D) return;
  const k = clamp(D.t / 1.5, 0, 1);
  ctx.save();
  ctx.translate(D.x, D.y);
  ctx.globalAlpha = 0.25 + 0.75 * k;
  ctx.strokeStyle = LAWS.OWNS.color; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -t * 30;
  ctx.beginPath(); ctx.arc(0, 0, D.r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  const grd = ctx.createRadialGradient(0, 0, 10, 0, 0, D.r);
  grd.addColorStop(0, 'rgba(232,211,106,0.18)'); grd.addColorStop(1, 'rgba(232,211,106,0)');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, D.r, 0, TAU); ctx.fill();
  // a crowned pebble
  ctx.fillStyle = '#8a8a92'; ctx.beginPath(); ctx.ellipse(0, 4, 9, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = LAWS.OWNS.color; ctx.shadowColor = LAWS.OWNS.color; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(-8, -12); ctx.lineTo(-4, -7); ctx.lineTo(0, -14); ctx.lineTo(4, -7); ctx.lineTo(8, -12); ctx.lineTo(8, -3); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawShutters(ctx, g, t) {
  const L = g.L;
  if (!L.closing.on && !L.shutters.some((s) => s.state !== 'open')) return;
  for (const s of L.shutters) {
    const r = s.rect;
    // housing on the ceiling
    ctx.fillStyle = '#2a3c44'; ctx.fillRect(s.x - 6, 330, r.w + 12, 14);
    if (r.h < 2) continue;
    ctx.save();
    const grd = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    grd.addColorStop(0, '#647a80'); grd.addColorStop(1, '#3d5157');
    ctx.fillStyle = grd; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    for (let y = r.y + 8; y < r.y + r.h; y += 10) { ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke(); }
    if (s.state === 'closed' || (s.state === 'closing' && s.p > 0.5)) {
      ctx.fillStyle = '#eaf4ff'; ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2;
      rr(ctx, r.x - 26, 440, r.w + 52, 22, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c62828'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(s.state === 'broken' ? 'CLOS' : 'CLOSED', r.x + r.w / 2, 455);
    }
    if (s.state === 'broken') {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(r.x - 4, r.y + r.h - 20); ctx.lineTo(r.x + 12, r.y + r.h - 4); ctx.lineTo(r.x + r.w + 4, r.y + r.h - 22); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCursor(ctx, g, t) {
  const C = g.L.cursor;
  if (!C.active) return;
  // the telegraph ring
  if (C.state === 'aim' || C.state === 'click') {
    const k = C.state === 'click' ? 1 : clamp(C.t / 1.0, 0, 1);
    ctx.save();
    ctx.strokeStyle = `rgba(255,70,70,${0.4 + 0.5 * k})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(C.tx, C.ty, 66, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(255,60,60,${0.12 + 0.2 * k})`;
    ctx.beginPath(); ctx.arc(C.tx, C.ty, 66 * k, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // the arrow itself: much too big
  const busy = C.busy > 0;
  const down = C.state === 'click' ? 22 : 0;
  ctx.save();
  ctx.translate(C.cx, C.cy + down);
  const sc = 4.2;
  ctx.scale(sc, sc);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#f7fbff'; ctx.strokeStyle = '#0b0b10'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.3, 13.2); ctx.lineTo(7.2, 19.4); ctx.lineTo(9.6, 18.4); ctx.lineTo(6.8, 12.4); ctx.lineTo(12.2, 12.2); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  if (busy) {
    ctx.save(); ctx.translate(C.cx + 60, C.cy + 70);
    ctx.strokeStyle = '#f7fbff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 22, t * 5, t * 5 + 4.6); ctx.stroke();
    ctx.restore();
  }
}

export function drawZooWorld(ctx, g, cam, R, t) {
  const L = g.L;
  const near = (x) => Math.abs(x - cam.x) < R + 300;
  if (near(2200)) drawPayphone(ctx, 2200, t);
  if (near(3200)) drawVending(ctx, 3210);
  if (near(1875)) drawCar(ctx);
  for (const s of L.solids) {
    if (s.tag === 'kiosk' && near(s.x)) drawKiosk(ctx, s, t, 'TICKETS');
  }
  for (const s of L.springs) if (near(s.x)) drawTramp(ctx, s, g, t);
  if (near(3050)) drawCage(ctx, t);
  for (const gt of L.gates) if (near(gt.rect.x)) drawGate(ctx, gt, t);
  drawShutters(ctx, g, t);
  for (const pl of L.placards) if (near(pl.x)) drawPlacard(ctx, pl, t);
  // signs
  ctx.save();
  ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(234,244,255,0.5)';
  if (near(240)) ctx.fillText('EARTH (COLLECTED)', 240, 300);
  if (near(1600)) ctx.fillText('SPECIMEN ROW  →', 1600, 380);
  if (near(3900)) ctx.fillText('GIFT SHOP', 3900, 300);
  if (near(4900)) ctx.fillText('THE ZOO CLOSES SOON', 4900, 390);
  // the exit
  const ez = L.exitZone;
  if (near(ez.x)) {
    const grd = ctx.createLinearGradient(ez.x, 0, ez.x + ez.w, 0);
    grd.addColorStop(0, 'rgba(255,240,200,0.5)'); grd.addColorStop(1, 'rgba(255,240,200,0.05)');
    ctx.fillStyle = grd; ctx.fillRect(ez.x, ez.y, ez.w, ez.h);
    ctx.fillStyle = '#7dffb3'; ctx.fillText('EXIT', ez.x + 40, ez.y + 20);
  }
  ctx.restore();
}

/** Drawn after the dog: things that are in front of everyone. */
export function drawZooFront(ctx, g, t) {
  drawShots(ctx, g);
  drawDecoy(ctx, g, t);
  drawCursor(ctx, g, t);
}
