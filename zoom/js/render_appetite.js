// Wing two's look: acid, mouths, glass, crumbling ledges, the worn Laws.

import { LAWS } from './laws.js';
import { clamp } from './geom.js';
import { mawRect } from './appetite.js';

const TAU = Math.PI * 2;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

export function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.2, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* backdrop                                                            */
/* ------------------------------------------------------------------ */

export const APPETITE_SKY = ['#150a05', '#2e1b08'];

export function drawAppetiteBack(ctx, cam, W, H, S, t) {
  // hunger bells: pale hanging shapes far behind, slowly swaying
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const par = 0.12 + (i % 3) * 0.05;
    const bx = ((i * 380 - cam.x * par * S) % (W + 600) + W + 600) % (W + 600) - 200;
    const sway = Math.sin(t * 0.5 + i) * 12;
    const len = (110 + (i * 53) % 170) * S;
    const grd = ctx.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, 'rgba(210,140,60,0.10)'); grd.addColorStop(1, 'rgba(210,140,60,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(bx - 26 * S, 0); ctx.lineTo(bx + 26 * S, 0);
    ctx.quadraticCurveTo(bx + 34 * S + sway, len * 0.6, bx + sway, len);
    ctx.quadraticCurveTo(bx - 34 * S + sway, len * 0.6, bx - 26 * S, 0);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* world objects                                                       */
/* ------------------------------------------------------------------ */

function drawMaw(ctx, m, t) {
  ctx.save();
  ctx.translate(m.x, m.y);
  const ang = Math.atan2(m.dy, m.dx);
  ctx.rotate(ang);
  const open = m.gone > 0 ? 0 : m.state === 'wind' ? 0.6 + 0.4 * Math.sin(t * 30) * 0 + 0.4 : m.state === 'snap' ? 1 : m.open ? 0.9 : 0.12;
  // stalk
  ctx.fillStyle = '#5b1f33';
  ctx.beginPath(); ctx.ellipse(-16, 0, 20, 16, 0, 0, TAU); ctx.fill();
  if (m.gone > 0) {
    ctx.strokeStyle = 'rgba(255,200,160,0.4)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.stroke();
    ctx.restore();
    return;
  }
  const gape = open * 20;
  // jaws
  ctx.fillStyle = m.bored ? '#4b3a5e' : '#8e2b45';
  ctx.beginPath(); ctx.moveTo(-6, -4 - gape * 0.5); ctx.quadraticCurveTo(22, -16 - gape, 30, -3 - gape); ctx.lineTo(4, -2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, 4 + gape * 0.5); ctx.quadraticCurveTo(22, 16 + gape, 30, 3 + gape); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill();
  // throat
  ctx.fillStyle = '#12040a';
  ctx.beginPath(); ctx.ellipse(10, 0, 10, 2 + gape * 0.55, 0, 0, TAU); ctx.fill();
  // teeth
  ctx.fillStyle = '#efe2c8';
  for (let i = 0; i < 4; i++) {
    const x = 6 + i * 6;
    ctx.beginPath(); ctx.moveTo(x, -3 - gape * 0.5); ctx.lineTo(x + 2.5, -1 - gape * 0.15); ctx.lineTo(x + 5, -3 - gape * 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, 3 + gape * 0.5); ctx.lineTo(x + 2.5, 1 + gape * 0.15); ctx.lineTo(x + 5, 3 + gape * 0.5); ctx.fill();
  }
  ctx.restore();
  if (m.state === 'wind') {
    const r = mawRect(m);
    ctx.save();
    ctx.fillStyle = `rgba(255,70,60,${0.14 + 0.1 * Math.sin(t * 25)})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(255,110,90,0.7)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  } else if (m.state === 'snap') {
    const r = mawRect(m);
    ctx.fillStyle = 'rgba(255,220,180,0.5)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}

export function drawAppetiteWorld(ctx, g, cam, R, t) {
  const L = g.L;
  // acid-etched stone under the pit
  // crumbling ledges
  for (const c of L.crumbles) {
    const s = c.rect;
    if (Math.abs(s.x - cam.x) > R + 200) continue;
    if (s.on === false) {
      ctx.strokeStyle = 'rgba(255,220,180,0.25)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.strokeRect(s.x, s.y, s.w, s.h); ctx.setLineDash([]);
      continue;
    }
    const shake = c.t > 0.05 ? Math.sin(t * 70) * Math.min(3, c.t * 6) : 0;
    ctx.save();
    ctx.translate(shake, 0);
    rr(ctx, s.x, s.y, s.w, s.h, 6);
    ctx.fillStyle = c.perm ? '#7a2a3d' : '#7b5a34'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = c.perm ? '#ff8aa0' : '#d9b27a'; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
    if (!c.perm) {
      ctx.beginPath();
      for (let x = s.x + 14; x < s.x + s.w - 6; x += 22) { ctx.moveTo(x, s.y + 2); ctx.lineTo(x - 4, s.y + s.h * 0.6); ctx.lineTo(x + 2, s.y + s.h - 2); }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ff5d7a';
      heartPath(ctx, s.x + s.w / 2, s.y + s.h / 2, 4); ctx.fill();
    }
    ctx.restore();
  }
  // glass: only there when something sees through
  for (const s of L.glass) {
    if (Math.abs(s.x - cam.x) > R + 200) continue;
    if (s.on !== false) {
      const fade = clamp((s.until - g.t) / 0.3, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.5 * fade;
      rr(ctx, s.x, s.y, s.w, s.h, 5);
      ctx.fillStyle = 'rgba(120,220,255,0.5)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#a8ecff'; ctx.stroke();
      ctx.restore();
    } else {
      const shimmer = 0.05 + 0.05 * Math.sin(t * 2 + s.x * 0.05);
      ctx.strokeStyle = `rgba(160,230,255,${shimmer + 0.04})`;
      ctx.setLineDash([2, 6]); ctx.lineWidth = 1.5;
      ctx.strokeRect(s.x, s.y, s.w, s.h); ctx.setLineDash([]);
    }
  }
  // the exit sphincter
  const sp = L.sphincter;
  const r = sp.rect;
  ctx.save();
  if (!sp.open) {
    rr(ctx, r.x, r.y, r.w, r.h, 12); ctx.fillStyle = '#5c1e34'; ctx.fill();
    ctx.strokeStyle = '#e58aa9'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
    for (let y = r.y + 14; y < r.y + r.h - 8; y += 16) { ctx.beginPath(); ctx.moveTo(r.x + 4, y); ctx.quadraticCurveTo(r.x + r.w / 2, y + 8, r.x + r.w - 4, y); ctx.stroke(); }
    ctx.fillStyle = LAWS.LEAVES.color; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3);
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('EXIT', r.x + r.w / 2, r.y - 6);
  } else {
    const ez = L.exitZone;
    const grd = ctx.createLinearGradient(ez.x, 0, ez.x + ez.w, 0);
    grd.addColorStop(0, 'rgba(255,240,200,0.55)'); grd.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = grd; ctx.fillRect(ez.x, ez.y, ez.w, ez.h);
    ctx.fillStyle = '#12040a'; ctx.fillRect(r.x, r.y, 6, r.h);
  }
  ctx.restore();
  // mouths
  for (const m of L.maws) if (Math.abs(m.x - cam.x) < R + 200) drawMaw(ctx, m, t);
  // a stomach about to clench
  if (L.surge.pending > 0 || L.surge.on) {
    ctx.fillStyle = 'rgba(255,150,50,0.06)';
    ctx.fillRect(cam.x - R, cam.y - R, R * 2, R * 2);
  }
}

/* ------------------------------------------------------------------ */
/* acid                                                                */
/* ------------------------------------------------------------------ */

export function drawAcid(ctx, g, cam, R, t) {
  for (const z of g.L.acid) {
    if (z.x1 < cam.x - R || z.x0 > cam.x + R) continue;
    if (z.y > cam.y + R + 60 && z.y > z.bottom) continue;
    const x0 = Math.max(z.x0, cam.x - R); const x1 = Math.min(z.x1, cam.x + R);
    const yTop = z.y;
    const yBot = Math.min(z.bottom, Math.max(cam.y + R + 60, yTop + 40));
    if (yBot <= yTop) continue;
    const grd = ctx.createLinearGradient(0, yTop, 0, yTop + 500);
    grd.addColorStop(0, 'rgba(196,224,60,0.62)');
    grd.addColorStop(0.35, 'rgba(120,160,24,0.72)');
    grd.addColorStop(1, 'rgba(48,70,10,0.86)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x0, yBot);
    ctx.lineTo(x0, yTop);
    const wob = z.bored > 0 ? 1.5 : 4;
    for (let x = x0; x <= x1; x += 14) ctx.lineTo(x, yTop + Math.sin(x * 0.045 + t * 2.2) * wob + Math.sin(x * 0.013 - t * 1.3) * wob * 0.6);
    ctx.lineTo(x1, yTop);
    ctx.lineTo(x1, yBot);
    ctx.closePath();
    ctx.fill();
    // hot skin
    ctx.strokeStyle = z.bored > 0 ? 'rgba(200,180,255,0.8)' : 'rgba(236,255,120,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 14) {
      const yy = yTop + Math.sin(x * 0.045 + t * 2.2) * wob + Math.sin(x * 0.013 - t * 1.3) * wob * 0.6;
      if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    // bubbles
    ctx.fillStyle = 'rgba(230,255,150,0.5)';
    for (let i = 0; i < 26; i++) {
      const bx = x0 + ((i * 97.3 + Math.floor(t * 0.7 + i) * 13.7) % Math.max(20, x1 - x0));
      const life = (t * 0.5 + i * 0.37) % 1;
      const by = yTop + 8 + (1 - life) * Math.min(160, yBot - yTop - 8);
      if (by > yBot) continue;
      ctx.globalAlpha = 0.5 * (1 - life);
      ctx.beginPath(); ctx.arc(bx, by, 1.5 + (i % 3), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ */
/* the dog, dressed                                                    */
/* ------------------------------------------------------------------ */

/** Local space of the dog (head at +x). */
export function drawWornBody(ctx, p, t) {
  if (p.worn === 'BORED') {
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10.5, -7); ctx.lineTo(17, -4.5); ctx.stroke();
    ctx.fillStyle = 'rgba(190,175,255,0.9)'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left';
    ctx.fillText('z', 16, -18 - ((t * 6) % 6)); ctx.fillText('Z', 22, -25 - ((t * 5) % 6));
  }
  if (p.worn === 'LEAVES') {
    ctx.fillStyle = '#6b4a2b'; ctx.strokeStyle = LAWS.LEAVES.color; ctx.lineWidth = 1.5;
    rr(ctx, -9, -10, 14, 9, 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(-5, -13); ctx.lineTo(1, -13); ctx.lineTo(1, -10); ctx.stroke();
  }
  if (p.worn === 'LOOKS') {
    ctx.strokeStyle = 'rgba(140,230,255,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(13.5, -4.6, 6.5, 5.5, 0, 0, TAU); ctx.stroke();
  }
}

export function drawWornAura(ctx, g, cam, t) {
  const p = g.p;
  if (p.hiding) return;
  if (p.worn === 'LOOKS') {
    ctx.save();
    ctx.strokeStyle = 'rgba(140,230,255,0.55)'; ctx.setLineDash([9, 9]); ctx.lineWidth = 2;
    ctx.lineDashOffset = -t * 24;
    ctx.beginPath(); ctx.arc(p.x, p.y, 128, 0, TAU); ctx.stroke();
    const grd = ctx.createRadialGradient(p.x, p.y, 20, p.x, p.y, 128);
    grd.addColorStop(0, 'rgba(120,220,255,0)'); grd.addColorStop(1, 'rgba(120,220,255,0.10)');
    ctx.fillStyle = grd; ctx.fill();
    ctx.restore();
  }
  if (p.hearts > 0) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-cam.rot);
    for (let i = 0; i < 3; i++) {
      const alive = i < p.hearts;
      const hx = (i - 1) * 13; const hy = -34 + Math.sin(t * 3 + i) * 2;
      ctx.fillStyle = alive ? '#ff5d7a' : 'rgba(255,255,255,0.15)';
      ctx.shadowColor = '#ff5d7a'; ctx.shadowBlur = alive ? 8 : 0;
      heartPath(ctx, hx, hy, 4.5); ctx.fill();
    }
    ctx.restore();
  }
}

export function drawAcidOverlay(ctx, g, W, H, t) {
  const p = g.p;
  if (!p.inAcid && !(p.acidT > 0.05)) return;
  const k = clamp((p.acidT || 0) / 1.6, 0, 1);
  ctx.fillStyle = `rgba(150,200,20,${0.10 + 0.22 * k})`;
  ctx.fillRect(0, 0, W, H);
  if (k > 0.3) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, 'rgba(90,120,0,0)'); vg.addColorStop(1, `rgba(200,240,40,${0.5 * k})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
}

