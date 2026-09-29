// Canvas renderer. Reads the sim, never writes to it.

import { LAWS } from './laws.js';
import { clamp, lerp, pointIn, circleRect, dist } from './geom.js';
import { GV, TV, tierOf, lawsCarried } from './core.js';
import { launchVelocity } from './sim.js';
import { APPETITE_SKY, drawAppetiteBack, drawAppetiteWorld, drawAcid, drawWornBody, drawWornAura, drawAcidOverlay, heartPath } from './render_appetite.js';

const TAU = Math.PI * 2;
const VIEW_H = 540; // logical height before zoom

const C = {
  void: '#07040d', deep: '#12081b', flesh: '#3a1832', fleshHi: '#6d2f58', grip: '#4a2039', gripHi: '#e58aa9',
  slick: '#2b2a57', slickHi: '#8f92ff', tongue: '#8c3b5b', tongueHi: '#d97595', tooth: '#efe2c8', toothShade: '#b9a98c',
  hall: '#122335', hallHi: '#3f7c96', gum: '#7b2a45',
  ui: '#eaf4ff', uiAccent: '#2f7dff', dog: '#d9a066', dogDark: '#a8703f', ear: '#e7b98a',
};

// ----- one-time offscreen textures -----
let noiseTex = null;
function makeNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const d = x.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  return c;
}

const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16); const pb = parseInt(b.slice(1), 16);
  const r = lerp(pa >> 16, pb >> 16, t) | 0; const g = lerp((pa >> 8) & 255, (pb >> 8) & 255, t) | 0; const bl = lerp(pa & 255, pb & 255, t) | 0;
  return `rgb(${r},${g},${bl})`;
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

export function draw(ctx, g, cam, fx, view) {
  if (!noiseTex) noiseTex = makeNoise();
  const W = view.w; const H = view.h;
  const S = Math.min(H / VIEW_H, W / 800) * cam.zoom;
  const t = g.t;
  const tier = tierOf(g.notice);
  const R = Math.hypot(W, H) / (2 * S) + 160; // cull radius in world units
  const w1 = g.wing === 1;
  const inHall = w1 && cam.x > 3300;

  drawBackground(ctx, g, cam, W, H, S, t, tier, inHall);

  ctx.save();
  const sh = fx.shake;
  ctx.translate(W / 2 + (sh ? (Math.random() - 0.5) * sh : 0), H / 2 + (sh ? (Math.random() - 0.5) * sh : 0));
  ctx.rotate(cam.rot + fx.sway);
  ctx.scale(S, S);
  ctx.translate(-cam.x, -cam.y);

  const vis = (r) => circleRect(cam.x, cam.y, R, r);

  if (w1) drawDecor(ctx, g, vis, t);
  drawScars(ctx, g, vis, t);
  drawSolids(ctx, g, cam, R, t);
  if (w1) {
    drawCurtains(ctx, g, vis, t);
    drawGateAndDoor(ctx, g, t);
    drawMolars(ctx, g, t);
  } else {
    drawAppetiteWorld(ctx, g, cam, R, t);
  }
  drawTeeth(ctx, g, t);
  drawVeinsAndHoles(ctx, g, cam, t);
  if (w1) {
    drawPanes(ctx, g, t);
    drawEye(ctx, g, cam, t);
  }
  drawPickups(ctx, g, cam, t);
  if (w1) {
    drawWarden(ctx, g, cam, t);
    drawMites(ctx, g, t);
    drawPlank(ctx, g);
  }
  drawWindows(ctx, g, t);
  drawBubbles(ctx, g, t);
  drawAim(ctx, g);
  drawDog(ctx, g, cam, fx, t);
  if (!w1) {
    drawAcid(ctx, g, cam, R, t);
    drawWornAura(ctx, g, cam, t);
  }
  drawMenus(ctx, g, cam, t);
  drawProj(ctx, g, t);
  drawRipGauge(ctx, g, cam, t);
  drawParticles(ctx, fx, cam);
  ctx.restore();

  drawOverlay(ctx, g, cam, fx, W, H, S, t, tier);
}

/* ------------------------------------------------------------------ */
/* background and mood                                                  */
/* ------------------------------------------------------------------ */

function drawBackground(ctx, g, cam, W, H, S, t, tier, inHall) {
  const w2 = g.wing === 2;
  const k = w2 ? 0 : clamp((cam.x - 3200) / 500, 0, 1);
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  if (w2) {
    grd.addColorStop(0, APPETITE_SKY[0]);
    grd.addColorStop(1, APPETITE_SKY[1]);
  } else {
    grd.addColorStop(0, mix('#0d0716', '#07131f', k));
    grd.addColorStop(1, mix('#22092a', '#0e2233', k));
  }
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // ribs of appetite: huge arcs sliding by
  ctx.save();
  ctx.lineWidth = 34 * S;
  for (let i = 0; i < 7; i++) {
    const par = 0.10 + (i % 3) * 0.05;
    const bx = ((i * 520 - cam.x * par * S) % (W + 900)) - 300;
    const breathe = Math.sin(t * 0.8 + i) * 6;
    ctx.strokeStyle = `rgba(${g.wing === 2 ? '190,110,40' : inHall ? '60,120,150' : '120,50,90'},${0.07 + (i % 2) * 0.03})`;
    ctx.beginPath();
    ctx.ellipse(bx, H * 1.05, 380 * S * (1 + breathe / 300), (H * 0.95) - (cam.y * par * 0.2), 0, Math.PI, TAU);
    ctx.stroke();
  }
  ctx.restore();

  if (g.wing === 2) drawAppetiteBack(ctx, cam, W, H, S, t);

  // idea-stuff motes
  ctx.fillStyle = g.wing === 2 ? 'rgba(240,210,120,0.35)' : 'rgba(255,190,220,0.35)';
  for (let i = 0; i < 46; i++) {
    const px = ((i * 197.3 + t * (6 + (i % 5) * 3) - cam.x * 0.35 * S) % (W + 40) + W + 40) % (W + 40) - 20;
    const py = ((i * 89.7 + Math.sin(t * 0.4 + i) * 30 - cam.y * 0.25 * S) % (H + 40) + H + 40) % (H + 40) - 20;
    ctx.fillRect(px, py, 2, 2);
  }

  // horizon eye (rooms A and B): the tell for Notice
  if (!inHall) {
    const lid = [0.02, 0.16, 0.5, 1][tier] + (tier === 1 ? Math.sin(t * 5) * 0.03 : 0);
    const ex = W * 0.5 + Math.sin(t * 0.2) * 20 - (cam.x % 4000) * 0.01;
    const ey = H * 0.16;
    const ew = Math.min(W * 0.34, 340);
    drawEyeShape(ctx, ex, ey, ew, lid, 0, 0, tier);
  }
}

function drawEyeShape(ctx, x, y, w, lid, lookX, lookY, tier) {
  const h = Math.max(2, w * 0.36 * lid);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = tier >= 2 ? 0.9 : 0.6;
  const lidPath = new Path2D();
  lidPath.moveTo(-w / 2, 0);
  lidPath.quadraticCurveTo(0, -h * 1.5, w / 2, 0);
  lidPath.quadraticCurveTo(0, h * 1.5, -w / 2, 0);
  lidPath.closePath();
  ctx.fillStyle = '#1a0d14';
  ctx.fill(lidPath);
  ctx.save();
  ctx.clip(lidPath);
  const ir = w * 0.17;
  const gx = lookX * w * 0.12; const gy = lookY * h * 0.4;
  const ig = ctx.createRadialGradient(gx, gy, 2, gx, gy, ir);
  ig.addColorStop(0, '#fff2b0'); ig.addColorStop(0.5, '#ff9a3c'); ig.addColorStop(1, '#7a1d1a');
  ctx.fillStyle = ig;
  ctx.beginPath(); ctx.arc(gx, gy, ir, 0, TAU); ctx.fill();
  ctx.fillStyle = '#050205';
  ctx.beginPath(); ctx.ellipse(gx, gy, ir * (tier >= 2 ? 0.16 : 0.32), ir * 0.86, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#ff9a3c';
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.stroke(lidPath);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* world                                                                */
/* ------------------------------------------------------------------ */

function drawDecor(ctx, g, vis, t) {
  // hanging tissue over the corridor and the tongue's dark
  ctx.save();
  ctx.strokeStyle = 'rgba(160,70,110,0.28)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 26; i++) {
    const x = 1200 + i * 46;
    const len = 50 + ((i * 37) % 70);
    ctx.beginPath();
    ctx.moveTo(x, i > 9 ? 90 : -140);
    ctx.quadraticCurveTo(x + Math.sin(t + i) * 8, (i > 9 ? 90 : -140) + len / 2, x + Math.sin(t * 1.2 + i) * 10, (i > 9 ? 90 : -140) + len);
    ctx.stroke();
  }
  ctx.restore();
  // pool
  if (vis({ x: -300, y: 580, w: 900, h: 40 })) {
    ctx.fillStyle = 'rgba(120,255,200,0.16)';
    ctx.fillRect(-120, 588, 340, 14);
    ctx.fillStyle = 'rgba(180,255,230,0.35)';
    for (let i = 0; i < 8; i++) ctx.fillRect(-100 + i * 42 + Math.sin(t * 2 + i) * 6, 590 + Math.sin(t * 3 + i) * 2, 16, 2);
  }
}

function drawScars(ctx, g, vis, t) {
  for (const s of g.L.scars) {
    const z = s.zone;
    if (!vis(z)) continue;
    const open = !s.needsOpen || s.open;
    if (!open) continue;
    ctx.save();
    ctx.fillStyle = '#05020a';
    ctx.beginPath();
    ctx.ellipse(z.x + z.w / 2, z.y + z.h / 2 + 6, z.w / 2 + 8, z.h / 2 + 14, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = s.noHide ? '#ff6b6b' : 'rgba(255,170,200,0.55)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // old stitches
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,200,220,0.25)';
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(z.x + z.w / 2 + i * 12, z.y - 14);
      ctx.lineTo(z.x + z.w / 2 + i * 12 + 4, z.y - 4);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSolids(ctx, g, cam, R, t) {
  const exhale = g.breathEx;
  const ph = g.t % 3.8;
  for (const s of g.L.solids) {
    if (s.on === false) continue;
    if (s.ref === 'gate' || s.ref === 'door' || s.ref === 'molar' || s.ref === 'plank' || s.ref === 'glass' || s.ref === 'crumble' || s.ref === 'sphincter') continue;
    if (!circleRect(cam.x, cam.y, R, s)) continue;
    const hall = g.wing === 1 && s.x >= 3500 && s.tag !== 'floorB';
    let fill = g.wing === 2 ? '#3d2214' : C.flesh; let rim = g.wing === 2 ? '#a5622d' : C.fleshHi;
    if (s.kind === 'grip') { fill = hall ? '#173047' : g.wing === 2 ? '#523019' : C.grip; rim = hall ? C.hallHi : g.wing === 2 ? '#f0b060' : C.gripHi; }
    if (s.kind === 'slick') { fill = C.slick; rim = C.slickHi; }
    if (s.kind === 'breath') {
      const k = exhale ? 1 - clamp((ph - 1.9) / 0.6, 0, 1) : 0;
      fill = mix('#2a1428', '#5a2450', k);
      rim = exhale ? mix('#b96c93', '#f8b6cf', k) : '#6a3f5f';
    }
    if (s.tag === 'tongue') { fill = C.tongue; rim = C.tongueHi; }
    if (s.tag === 'lump' || s.ref === 'sleeper') { fill = C.gum; rim = '#d9738f'; }
    if (s.tag === 'knuckle' || s.tag === 'step' || s.tag === 'sideledge') { fill = '#4a2140'; rim = '#e58aa9'; }

    let inset = 0;
    if (s.kind === 'breath' && !exhale) inset = 5;
    rr(ctx, s.x + inset, s.y, s.w - inset * 2, s.h, 7);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = rim; ctx.stroke();

    // handholds: little serifs along the climbable faces
    if (s.kind === 'grip' || s.kind === 'breath' || s.kind === 'slick') {
      ctx.strokeStyle = s.kind === 'breath' && !exhale ? 'rgba(180,120,160,0.35)' : rim;
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      const tall = s.h > s.w;
      if (tall) {
        const y0 = Math.max(s.y + 14, cam.y - R); const y1 = Math.min(s.y + s.h - 10, cam.y + R);
        for (let y = Math.ceil(y0 / 28) * 28; y < y1; y += 28) {
          const o = (y / 28) % 2 ? 0 : 3;
          ctx.beginPath(); ctx.moveTo(s.x + inset, y); ctx.lineTo(s.x + inset - 7 - o, y + 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s.x + s.w - inset, y); ctx.lineTo(s.x + s.w - inset + 7 + o, y + 2); ctx.stroke();
        }
      } else if (s.w > 200) {
        const x0 = Math.max(s.x + 14, cam.x - R); const x1 = Math.min(s.x + s.w - 10, cam.x + R);
        for (let x = Math.ceil(x0 / 36) * 36; x < x1; x += 36) {
          ctx.beginPath(); ctx.moveTo(x, s.y + s.h); ctx.lineTo(x + 2, s.y + s.h + (s.h > 40 ? 0 : 6)); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, s.y); ctx.lineTo(x + 2, s.y - 5); ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
    }
    // tastebuds on the tongue
    if (s.tag === 'tongue') {
      ctx.fillStyle = C.tongueHi;
      for (let x = s.x + 10; x < s.x + s.w - 6; x += 22) {
        ctx.beginPath(); ctx.arc(x + Math.sin(x) * 3, s.y - 1 + Math.sin(t * 1.4 + x * 0.05) * 1.2, 4.5, Math.PI, TAU); ctx.fill();
      }
    }
    if (s.tag === 'lump') {
      ctx.fillStyle = C.tooth;
      ctx.fillRect(s.x + 6, s.y + 8, s.w - 12, 4);
    }
  }
}

function drawCurtains(ctx, g, vis, t) {
  for (const c of g.L.curtains) {
    if (!vis(c)) continue;
    ctx.save();
    ctx.fillStyle = 'rgba(10,26,44,0.78)';
    ctx.strokeStyle = 'rgba(80,150,180,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + c.w, c.y);
    for (let y = c.y + c.h; y >= c.y; y -= 40) ctx.lineTo(c.x + c.w + Math.sin(t * 1.3 + y * 0.02) * 6, y);
    for (let y = c.y; y <= c.y + c.h; y += 40) ctx.lineTo(c.x + Math.sin(t * 1.3 + y * 0.02 + 1) * 6, y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawTeethRow(ctx, x, y, w, h, dir, grow, t) {
  // triangles growing out of a surface. dir: 'up'|'down'|'left'|'right'
  const n = Math.max(2, Math.round((dir === 'up' || dir === 'down' ? w : h) / 10));
  ctx.fillStyle = C.tooth; ctx.strokeStyle = C.toothShade; ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const len = 14 * grow * (0.75 + 0.25 * Math.sin(i * 2.1 + t * 6));
    ctx.beginPath();
    if (dir === 'up') { const bx = x + f * w; ctx.moveTo(bx - 4, y + h); ctx.lineTo(bx, y + h - len); ctx.lineTo(bx + 4, y + h); }
    else if (dir === 'down') { const bx = x + f * w; ctx.moveTo(bx - 4, y); ctx.lineTo(bx, y + len); ctx.lineTo(bx + 4, y); }
    else if (dir === 'left') { const by = y + f * h; ctx.moveTo(x + w, by - 4); ctx.lineTo(x + w - len, by); ctx.lineTo(x + w, by + 4); }
    else { const by = y + f * h; ctx.moveTo(x, by - 4); ctx.lineTo(x + len, by); ctx.lineTo(x, by + 4); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

function drawTeeth(ctx, g, t) {
  for (const th of g.teeth) {
    const r = th.rect;
    const grow = clamp(th.t / 0.6, 0, 1);
    const fade = th.life !== Infinity && th.life < 0.5 ? th.life / 0.5 : 1;
    ctx.save(); ctx.globalAlpha = fade;
    ctx.fillStyle = C.gum;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const dir = r.w >= r.h ? (th.face === 'bottom' ? 'down' : (th.face === 'foot' && r.y < 0 ? 'up' : th.face === 'bottom' ? 'down' : 'up')) : (th.face === 'left' ? 'left' : 'right');
    drawTeethRow(ctx, r.x, r.y, r.w, r.h, footDir(th, dir), grow, t);
    ctx.restore();
  }
}
function footDir(th, dir) {
  if (th.face === 'foot') return dir;
  return dir;
}

function drawGateAndDoor(ctx, g, t) {
  const D = g.L.door;
  // the clenched door: two rows of teeth and a glowing seam
  if (D.on !== false) {
    ctx.fillStyle = '#4a1b3a'; ctx.fillRect(D.x, D.y, D.w, D.h);
    drawTeethRow(ctx, D.x, D.y, D.w, 30, 'down', 1.6, t);
    drawTeethRow(ctx, D.x, D.y + D.h - 30, D.w, 30, 'up', 1.6, t);
    ctx.strokeStyle = C.gripHi; ctx.lineWidth = 2; ctx.strokeRect(D.x, D.y, D.w, D.h);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(D.x, D.y, D.w, D.h);
    drawTeethRow(ctx, D.x, D.y - 6, D.w, 24, 'down', 1.2, t);
    drawTeethRow(ctx, D.x, D.y + D.h - 18, D.w, 24, 'up', 1.2, t);
  }
  // the throat gate
  const G = g.L.gate;
  ctx.save();
  const closed = G.rect.on !== false;
  const gap = closed ? 0 : (G.jammed ? 84 : 84);
  const topH = (G.h - gap) / 2;
  ctx.fillStyle = '#5a1f42';
  ctx.fillRect(G.x, G.y, G.w, topH);
  ctx.fillRect(G.x, G.y + G.h - topH, G.w, topH);
  drawTeethRow(ctx, G.x, G.y, G.w, topH, 'down', 1.4, t);
  drawTeethRow(ctx, G.x, G.y + G.h - topH, G.w, topH, 'up', 1.4, t);
  ctx.strokeStyle = C.gripHi; ctx.lineWidth = 2;
  ctx.strokeRect(G.x, G.y, G.w, topH); ctx.strokeRect(G.x, G.y + G.h - topH, G.w, topH);
  if (G.jammed) {
    ctx.shadowColor = LAWS.WONT_CLOSE.color; ctx.shadowBlur = 16;
    ctx.fillStyle = LAWS.WONT_CLOSE.color;
    rr(ctx, G.x + 6, G.y + G.h / 2 - 12, G.w - 12, 24, 6); ctx.fill();
  } else if (!G.rect.on === false || closed) {
    // an empty socket the shape of the Law
    ctx.strokeStyle = 'rgba(125,255,179,0.5)'; ctx.setLineDash([4, 4]);
    rr(ctx, G.x + 6, G.y + G.h / 2 - 12, G.w - 12, 24, 6); ctx.stroke();
  }
  ctx.restore();
}

function drawMolars(ctx, g, t) {
  for (const m of g.L.molars) {
    const r = m.rect;
    if (m.cracked) {
      ctx.fillStyle = '#05020a';
      ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2 + 4, r.w / 2, r.h / 2 + 2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.tooth; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h); ctx.lineTo(r.x + 4, r.y + 10); ctx.lineTo(r.x + 14, r.y + 22); ctx.moveTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x + r.w - 6, r.y + 8); ctx.lineTo(r.x + r.w - 16, r.y + 20); ctx.stroke();
      continue;
    }
    ctx.fillStyle = C.tooth; ctx.strokeStyle = C.toothShade; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h);
    ctx.quadraticCurveTo(r.x - 4, r.y + 6, r.x + 12, r.y + 2);
    ctx.lineTo(r.x + r.w - 12, r.y + 2);
    ctx.quadraticCurveTo(r.x + r.w + 4, r.y + 6, r.x + r.w, r.y + r.h);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (m.chewed) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(r.x + 10, r.y + 20, r.w - 20, 6);
    }
    if (m.known && m.hollow) {
      ctx.strokeStyle = '#6fd6ff'; ctx.lineWidth = 2; ctx.shadowColor = '#6fd6ff'; ctx.shadowBlur = 10 + Math.sin(t * 4) * 4;
      ctx.beginPath(); ctx.moveTo(r.x + 14, r.y + 6); ctx.lineTo(r.x + 22, r.y + 22); ctx.lineTo(r.x + 18, r.y + 34); ctx.lineTo(r.x + 28, r.y + 46); ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}

function drawVeinShape(ctx, v, t, jitter) {
  const law = LAWS[v.law];
  const pulse = 1 + Math.sin(t * 4 + v.x) * 0.12;
  ctx.save();
  ctx.translate(v.x + (jitter ? (Math.random() - 0.5) * jitter : 0), v.y + (jitter ? (Math.random() - 0.5) * jitter : 0));
  ctx.shadowColor = law.color; ctx.shadowBlur = 18 * pulse;
  ctx.fillStyle = law.color;
  ctx.globalAlpha = 0.9;
  const big = v.law === 'LOOKS';
  ctx.beginPath();
  if (v.law === 'HEARTS') { heartPath(ctx, 0, 0, 12 * pulse); }
  else if (v.law === 'LEAVES') { ctx.rect(-11, -17 * pulse, 22, 34 * pulse); }
  else if (v.law === 'BORED') { ctx.ellipse(0, 2, 17 * pulse, 12, 0, 0, TAU); }
  else if (big) { ctx.ellipse(0, 0, 20 * pulse, 30 * pulse, 0, 0, TAU); }
  else { ctx.moveTo(-14, -7); ctx.lineTo(4, -13 * pulse); ctx.lineTo(15, -3); ctx.lineTo(9, 12 * pulse); ctx.lineTo(-8, 10); ctx.closePath(); }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(0, 2); ctx.lineTo(-2, 8); ctx.stroke();
  ctx.restore();
}

function drawVeinsAndHoles(ctx, g, cam, t) {
  for (const v of g.L.veins) {
    if (Math.abs(v.x - cam.x) > 1200) continue;
    if (v.taken) {
      ctx.save();
      ctx.fillStyle = '#05020a';
      ctx.beginPath(); ctx.ellipse(v.x, v.y, 12, 17, 0.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,200,0.45)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      continue;
    }
    const jit = g.rip && g.rip.vein === v ? (g.rip.phase === 'tear' ? 4 : 1.5) : 0;
    drawVeinShape(ctx, v, t, jit);
    // the "USEFUL" arrows when a Menu owns you
    if (g.menuMode) {
      ctx.fillStyle = C.uiAccent;
      const by = v.y - 44 + Math.sin(t * 6) * 4;
      ctx.beginPath(); ctx.moveTo(v.x - 9, by - 12); ctx.lineTo(v.x + 9, by - 12); ctx.lineTo(v.x, by); ctx.closePath(); ctx.fill();
    }
  }
}

function drawPanes(ctx, g, t) {
  for (const pn of g.L.panes) {
    ctx.save();
    ctx.translate(pn.x, pn.y);
    ctx.fillStyle = '#0a141d'; ctx.strokeStyle = pn.blind > 0 ? '#665' : pn.ignore > 0 ? '#6fd6ff' : '#9ad0e6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill(); ctx.stroke();
    // iris looking along its sweep
    const open = pn.blind > 0 ? 0.1 : 1;
    ctx.fillStyle = pn.on ? '#ff6a3c' : '#d7f3ff';
    ctx.beginPath(); ctx.ellipse(Math.cos(pn.ang) * 7, Math.sin(pn.ang) * 7, 9, 9 * open + 1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(Math.cos(pn.ang) * 10, Math.sin(pn.ang) * 10, 3, 0, TAU); ctx.fill();
    ctx.restore();
    if (pn.blind <= 0 && g.chase.state !== 'hunt' && g.chase.state !== 'opening') {
      // faint sight cone
      const len = 700;
      const grd = ctx.createRadialGradient(pn.x, pn.y, 10, pn.x, pn.y, len);
      const a = pn.on ? 0.42 : 0.17;
      grd.addColorStop(0, `rgba(160,230,255,${a})`); grd.addColorStop(1, 'rgba(160,230,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.moveTo(pn.x, pn.y);
      for (let i = 0; i <= 8; i++) {
        const ang = pn.ang - pn.half + (i / 8) * pn.half * 2;
        const d = rayDist(g, pn.x, pn.y, ang, len);
        ctx.lineTo(pn.x + Math.cos(ang) * d, pn.y + Math.sin(ang) * d);
      }
      ctx.closePath(); ctx.fill();
    }
  }
  // the frame: a piece of ZOOM's eye, hanging on the pillar
  const f = g.L.veins.find((v) => v.id === 'frame');
  if (f && !f.taken && Math.abs(f.x - ctxCamX) < 1400) {
    ctx.save();
    ctx.strokeStyle = '#9ad0e6'; ctx.lineWidth = 4;
    rr(ctx, f.x - 10, f.y - 46, 22, 92, 6); ctx.stroke();
    ctx.restore();
  }
}
let ctxCamX = 0;

function rayDist(g, x, y, ang, max) {
  const dx = Math.cos(ang); const dy = Math.sin(ang);
  for (let d = 12; d < max; d += 14) {
    const px = x + dx * d; const py = y + dy * d;
    for (const s of g.L.solids) if (s.on !== false && pointIn(s, px, py)) return d;
    for (const c of g.L.curtains) if (pointIn(c, px, py)) return d;
  }
  return max;
}

function drawEye(ctx, g, cam, t) {
  if (cam.x < 3300) return;
  const c = g.chase;
  const lid = c.state === 'idle' ? 0.03 : c.lid;
  const E = c.E;
  ctx.save();
  ctx.translate(0, 0);
  const look = c.state === 'idle' ? [0, 1] : [Math.cos(c.ang), Math.sin(c.ang)];
  ctx.save();
  ctx.translate(E.x, E.y + 6);
  drawEyeShapeWorld(ctx, lid, look, c.seen, t);
  ctx.restore();
  // the beam
  if (c.state === 'hunt' || c.state === 'opening') {
    if (c.lid > 0.9) {
      const half = 0.12; const len = 2600;
      const grd = ctx.createRadialGradient(E.x, E.y, 20, E.x, E.y, 1300);
      const a = c.seen ? 0.42 : 0.22;
      grd.addColorStop(0, `rgba(255,170,70,${a})`); grd.addColorStop(1, 'rgba(255,120,50,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.moveTo(E.x, E.y);
      for (let i = 0; i <= 14; i++) {
        const ang = c.ang - half + (i / 14) * half * 2;
        const d = rayDistBubble(g, E.x, E.y, ang, len);
        ctx.lineTo(E.x + Math.cos(ang) * d, E.y + Math.sin(ang) * d);
      }
      ctx.closePath(); ctx.fill();
      if (c.offer) {
        ctx.strokeStyle = 'rgba(255,220,120,0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(c.offer.x, c.offer.y, 18 + Math.sin(t * 9) * 3, 0, TAU); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function rayDistBubble(g, x, y, ang, max) {
  const dx = Math.cos(ang); const dy = Math.sin(ang);
  for (let d = 12; d < max; d += 16) {
    const px = x + dx * d; const py = y + dy * d;
    for (const s of g.L.solids) if (s.on !== false && pointIn(s, px, py)) return d;
    for (const c of g.L.curtains) if (pointIn(c, px, py)) return d;
    for (const b of g.bubbles) if (dist(px, py, b.x, b.y) < b.r * 0.8) return d;
  }
  return max;
}

function drawEyeShapeWorld(ctx, lid, look, seen, t) {
  const w = 300;
  const h = Math.max(2, 120 * lid);
  const lidPath = new Path2D();
  lidPath.moveTo(-w / 2, 0);
  lidPath.quadraticCurveTo(0, -h, w / 2, 0);
  lidPath.quadraticCurveTo(0, h, -w / 2, 0);
  lidPath.closePath();
  ctx.fillStyle = '#1b0d14'; ctx.fill(lidPath);
  ctx.save(); ctx.clip(lidPath);
  const gx = look[0] * 40; const gy = clamp(look[1], 0, 1) * 36;
  const ig = ctx.createRadialGradient(gx, gy, 6, gx, gy, 62);
  ig.addColorStop(0, '#fff0a8'); ig.addColorStop(0.5, seen ? '#ff5a2a' : '#ff9a3c'); ig.addColorStop(1, '#6d1416');
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(gx, gy, 62, 0, TAU); ctx.fill();
  ctx.fillStyle = '#040104'; ctx.beginPath(); ctx.ellipse(gx, gy, seen ? 6 : 14, 52, 0, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,150,60,0.7)'; ctx.lineWidth = 3; ctx.stroke(lidPath);
}

function drawPickups(ctx, g, cam, t) {
  ctxCamX = cam.x;
  for (const pk of g.pickups) {
    const law = LAWS[pk.law];
    ctx.save();
    ctx.translate(pk.x, pk.y + Math.sin(t * 3 + pk.x) * 2);
    ctx.shadowColor = law.color; ctx.shadowBlur = 14;
    ctx.fillStyle = law.color;
    if (pk.law === 'STATIC') {
      for (let i = 0; i < 10; i++) { ctx.globalAlpha = 0.4 + Math.random() * 0.6; ctx.fillRect((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, 5, 3); }
    } else { ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(2, -9); ctx.lineTo(10, -2); ctx.lineTo(5, 8); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
}

function drawWarden(ctx, g, cam, t) {
  const w = g.L.warden;
  if (Math.abs(w.x - cam.x) > 1000) return;
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.scale(w.dir >= 0 ? 1 : -1, 1);
  const asleep = w.state === 'sleep';
  const alert = w.state === 'alert' || w.state === 'recover';
  const bob = asleep ? Math.sin(t * 1.4) * 1.5 : Math.sin(t * 10) * (alert ? 2.5 : 1);
  ctx.translate(0, bob);
  // ribcage of a body
  ctx.fillStyle = '#1e0d22'; ctx.strokeStyle = w.stun > 0 ? '#ffd66b' : '#8d4a7a'; ctx.lineWidth = 2;
  rr(ctx, -21, -18, 42, 34, 10); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#8d4a7a';
  for (let i = -12; i <= 12; i += 8) { ctx.beginPath(); ctx.moveTo(i, -14); ctx.lineTo(i + 2, 10); ctx.stroke(); }
  // jaw
  const open = w.harmless ? 12 : alert ? 8 + Math.sin(t * 20) * 3 : 3;
  ctx.fillStyle = '#3a1230';
  ctx.beginPath(); ctx.moveTo(6, 2); ctx.lineTo(24, 4 + open); ctx.lineTo(10, 14 + open); ctx.closePath(); ctx.fill();
  drawTeethRow(ctx, 8, 2, 16, 8, 'down', 0.7, t);
  // lantern eye
  ctx.fillStyle = alert ? '#ff4a3a' : asleep ? '#553' : '#ffdc7a';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = asleep ? 0 : 12;
  ctx.beginPath(); ctx.arc(10, -8, 4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawMites(ctx, g, t) {
  for (const m of g.L.mites) {
    if (!m.alive) continue;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(m.dir >= 0 ? 1 : -1, 1);
    ctx.fillStyle = m.harmless ? '#6a5a6a' : '#c8d86a';
    ctx.strokeStyle = '#2a1a1a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { const l = Math.sin(t * 20 + i * 2) * 2; ctx.moveTo(i * 4, 3); ctx.lineTo(i * 4 + l - 2, 8); }
    ctx.stroke();
    ctx.fillStyle = '#b02020'; ctx.beginPath(); ctx.arc(6, -1, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawPlank(ctx, g) {
  const pl = g.L.plank;
  if (pl.on === false) return;
  ctx.save();
  ctx.fillStyle = 'rgba(234,244,255,0.9)'; ctx.strokeStyle = C.uiAccent; ctx.lineWidth = 2;
  rr(ctx, pl.x, pl.y, pl.w, pl.h + 2, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.uiAccent; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
  ctx.fillText('USEFUL', pl.x + pl.w / 2, pl.y - 4);
  ctx.restore();
}

function drawWindows(ctx, g, t) {
  for (const w of g.windows) {
    const k = clamp(w.t / 1.2, 0, 1);
    ctx.save();
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.clip();
    ctx.fillStyle = `rgba(100,210,255,${0.09 * k})`; ctx.fillRect(w.x - w.r, w.y - w.r, w.r * 2, w.r * 2);
    ctx.strokeStyle = `rgba(140,230,255,${0.65 * k})`; ctx.lineWidth = 1.5;
    for (const s of g.L.solids) {
      if (s.on === false) continue;
      if (!circleRect(w.x, w.y, w.r, s)) continue;
      ctx.strokeRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6);
    }
    // hidden things show
    for (const sc of g.L.scars) {
      const z = sc.zone;
      ctx.strokeStyle = `rgba(255,240,150,${0.9 * k})`; ctx.setLineDash([4, 3]);
      ctx.strokeRect(z.x, z.y, z.w, z.h); ctx.setLineDash([]);
    }
    for (const m of g.L.molars) {
      if (!m.hollow) continue;
      const r = m.rect; ctx.fillStyle = `rgba(255,240,150,${0.35 * k})`; ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = `rgba(140,230,255,${0.8 * k})`; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

function drawBubbles(ctx, g, t) {
  for (const b of g.bubbles) {
    const k = clamp(b.t / 0.8, 0, 1);
    ctx.save();
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.clip();
    ctx.fillStyle = `rgba(200,200,215,${0.5 * k})`; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#111';
      ctx.globalAlpha = 0.7 * k;
      ctx.fillRect(b.x - b.r + Math.random() * b.r * 2, b.y - b.r + Math.random() * b.r * 2, 4 + Math.random() * 8, 2);
    }
    ctx.restore();
  }
}

function drawProj(ctx, g, t) {
  for (const pr of g.proj) {
    const law = LAWS[pr.law];
    ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.age * 12);
    ctx.shadowColor = law.color; ctx.shadowBlur = 12; ctx.fillStyle = law.color;
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(2, -8); ctx.lineTo(9, -2); ctx.lineTo(4, 7); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawAim(ctx, g) {
  if (!g.aim || !g.p.mouth) return;
  const a = g.aim;
  const power = a.t < 0.2 ? 0.3 : a.power;
  let [vx, vy] = launchVelocity(g, power, a.elev);
  let x = g.p.x; let y = g.p.y;
  const G = GV[g.k];
  ctx.save();
  ctx.fillStyle = LAWS[g.p.mouth].color;
  for (let i = 0; i < 40; i++) {
    for (let s = 0; s < 3; s++) {
      vx += G[0] * 1500 / 90; vy += G[1] * 1500 / 90;
      x += vx / 90; y += vy / 90;
    }
    if (g.L.solids.some((sd) => sd.on !== false && pointIn(sd, x, y))) break;
    ctx.globalAlpha = 0.85 - i / 60;
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawRipGauge(ctx, g, cam, t) {
  const r = g.rip;
  if (!r) return;
  const law = LAWS[r.vein.law];
  ctx.save();
  ctx.translate(r.vein.x, r.vein.y - 46);
  ctx.rotate(-cam.rot);
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke();
  if (r.phase === 'plant') {
    ctx.strokeStyle = law.color;
    ctx.beginPath(); ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(r.t / law.plant, 0, 1)); ctx.stroke();
  } else {
    const c = -Math.PI / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, 22, c - law.sweet / 2, c + law.sweet / 2); ctx.stroke();
    const a = r.mark;
    ctx.fillStyle = law.color; ctx.shadowColor = law.color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 22, Math.sin(a) * 22, 5.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* the dog                                                              */
/* ------------------------------------------------------------------ */

function chunk(ctx, color, s = 1) {
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(-6 * s, -3 * s); ctx.lineTo(1 * s, -6 * s); ctx.lineTo(7 * s, -1 * s); ctx.lineTo(3 * s, 5 * s); ctx.lineTo(-4 * s, 4 * s); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawDog(ctx, g, cam, fx, t) {
  const p = g.p;
  if (g.digest && g.digest.t > 1.4) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-cam.rot);
  if (p.hiding) {
    // only the eyes show in the dark
    ctx.fillStyle = '#fff6d0';
    ctx.shadowColor = '#fff6d0'; ctx.shadowBlur = 8;
    const blink = Math.sin(t * 0.9) > 0.96 ? 0.2 : 1;
    ctx.beginPath(); ctx.ellipse(-4, -2, 2.4, 3 * blink, 0, 0, TAU); ctx.ellipse(5, -2, 2.4, 3 * blink, 0, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  if (p.inv > 0 && Math.floor(t * 20) % 2) ctx.globalAlpha = 0.45;
  ctx.rotate(fx.dogAng);
  ctx.scale(fx.dogFace, 1);
  const moving = p.grounded ? Math.abs(p.vx * TV[g.k][0] + p.vy * TV[g.k][1]) : 0;
  const gait = Math.sin(p.anim * 14);
  const lean = p.grip ? 0 : clamp(moving / 300, 0, 1) * 0.12;
  ctx.rotate(lean);
  const squat = g.rip ? 3 : 0;
  ctx.translate(0, squat);
  // haul rope + chunk dragged behind
  if (p.haul) {
    const hc = LAWS[p.haul].color;
    ctx.strokeStyle = 'rgba(200,120,150,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, 3); ctx.quadraticCurveTo(-24, 8, -34, 8); ctx.stroke();
    ctx.save(); ctx.translate(-38, 6); chunk(ctx, hc, 1.4); ctx.restore();
  }
  // tail
  ctx.strokeStyle = C.dogDark; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-19, -4 + Math.sin(t * 14) * 2, -17, -11); ctx.stroke();
  // legs
  ctx.strokeStyle = C.dogDark; ctx.lineWidth = 3.2;
  const legs = [[-8, 1], [-3, 0.5], [6, 0], [10, 0.7]];
  legs.forEach(([lx, ph], i) => {
    const sw = p.grounded || p.grip ? Math.sin(p.anim * 14 + ph * 3 + i * 1.6) * (p.grip ? 4 : clamp(moving / 40, 0, 1) * 5) : 3;
    ctx.beginPath(); ctx.moveTo(lx, 5); ctx.lineTo(lx + sw, 10); ctx.stroke();
  });
  // body
  ctx.fillStyle = C.dog;
  ctx.beginPath(); ctx.ellipse(0, 1, 13, 7.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = C.dogDark;
  ctx.beginPath(); ctx.ellipse(-2, 5, 9, 2.5, 0, 0, TAU); ctx.fill();
  // head
  ctx.fillStyle = C.dog;
  ctx.beginPath(); ctx.arc(11, -4, 7, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(17.5, -2, 4.5, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2a1410'; ctx.beginPath(); ctx.arc(21, -3, 1.5, 0, TAU); ctx.fill();
  // ears: enormous
  ctx.fillStyle = C.ear; ctx.strokeStyle = C.dogDark; ctx.lineWidth = 1;
  const flap = p.grounded ? 0 : -0.25;
  ctx.save(); ctx.translate(8, -9); ctx.rotate(-0.15 + flap);
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-1, -15); ctx.lineTo(5, -1); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(13, -9); ctx.rotate(0.25 + flap);
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(3, -14); ctx.lineTo(5, -1); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  // eye: huge and offended
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(13.5, -5, 3, 3.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(14.4, -5, 1.7, 0, TAU); ctx.fill();
  drawWornBody(ctx, p, t);
  // mouth Law
  if (p.mouth) {
    ctx.save(); ctx.translate(21, 1 + (g.aim ? -3 : 0)); chunk(ctx, LAWS[p.mouth].color, 1.2); ctx.restore();
  }
  if (g.rip) {
    ctx.strokeStyle = LAWS[g.rip.vein.law].color; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(24, -3 + i * 3); ctx.lineTo(29 + Math.random() * 4, -5 + i * 4); ctx.stroke(); }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Menus                                                                */
/* ------------------------------------------------------------------ */

function drawMenus(ctx, g, cam, t) {
  for (const m of g.menus) {
    ctx.save();
    ctx.translate(m.x, m.y + Math.sin(t * 2 + m.x) * 3);
    ctx.rotate(-cam.rot);
    const w = m.accepted ? 78 : 96; const h = m.accepted ? 44 : 34;
    ctx.fillStyle = C.ui; ctx.strokeStyle = C.uiAccent; ctx.lineWidth = 2;
    ctx.shadowColor = C.uiAccent; ctx.shadowBlur = 10;
    rr(ctx, -w / 2, -h / 2, w, h, 4); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.uiAccent; ctx.fillRect(-w / 2, -h / 2, w, 8);
    ctx.fillStyle = '#0a2a66'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    if (m.accepted) {
      ctx.fillText('OBJECTIVES', 0, -h / 2 + 7);
      ctx.fillText(`[ ] BE USEFUL ${'x'.repeat(3 - m.hp)}`, 0, 4);
      ctx.fillText('(bite to quit)', 0, 15);
      if (m.hp < 3) { ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-20, -12); ctx.lineTo(-6, 4); ctx.lineTo(10, -6); ctx.lineTo(24, 12); ctx.stroke(); }
    } else {
      ctx.fillText(m.text || 'OBJECTIVE', 0, -h / 2 + 7);
      ctx.fillText(m.kind === 'arrow' ? '→  →  →' : '[ ] RIP 3 LAWS', 0, 8);
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* particles + overlay                                                  */
/* ------------------------------------------------------------------ */

function drawParticles(ctx, fx, cam) {
  for (const q of fx.parts) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    if (q.text) {
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(-cam.rot);
      ctx.fillStyle = q.color; ctx.font = `bold ${q.size}px monospace`; ctx.textAlign = 'center';
      ctx.fillText(q.text, 0, 0); ctx.restore();
    } else {
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
  }
  ctx.globalAlpha = 1;
}

function drawOverlay(ctx, g, cam, fx, W, H, S, t, tier) {
  // vignette by tier
  const cols = ['0,0,0', '30,8,50', '90,8,26', '150,10,30'];
  const strength = [0.5, 0.58, 0.68, 0.75][tier];
  const pulse = tier >= 2 ? 0.08 * Math.sin(t * (tier === 3 ? 9 : 5)) : 0;
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.34 - pulse * 0.5), W / 2, H / 2, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, `rgba(${cols[tier]},0)`);
  vg.addColorStop(1, `rgba(${cols[tier]},${strength + pulse})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  // hiding / static bubble: the world goes dull and small
  const inBub = g.bubbles.some((b) => dist(g.p.x, g.p.y, b.x, b.y) < b.r);
  if (g.p.hiding || inBub) {
    const grd = ctx.createRadialGradient(W / 2, H / 2, 40 * S, W / 2, H / 2, (g.p.hiding ? 300 : 130) * S);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(0,0,0,${g.p.hiding ? 0.72 : 0.95})`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  }
  if (g.sag > 0 && !g.p.hiding) { ctx.fillStyle = `rgba(20,40,90,${Math.min(0.16, g.sag / 60)})`; ctx.fillRect(0, 0, W, H); }

  // radio static: stronger as ZOOM gets interested
  const na = [0.035, 0.06, 0.1, 0.14][tier];
  ctx.save();
  ctx.globalAlpha = na; ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(noiseTex, 0, 0, 128, 128, -Math.random() * 128, -Math.random() * 128, W + 256, H + 256);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

  // digestion
  if (g.digest) {
    const k = clamp(g.digest.t / 1.4, 0, 1) * (g.digest.t > 2.2 ? clamp(1 - (g.digest.t - 2.2) / 0.6, 0, 1) : 1);
    ctx.fillStyle = `rgba(90,10,40,${k * 0.96})`; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(255,190,200,${k * 0.6})`;
    for (let i = 0; i < 24; i++) ctx.fillRect((i * 97 + t * 40) % W, (i * 53 + t * 90) % H, 3, 3);
  }

  // Menu mode: the game turns into a quest tracker
  if (g.menuMode) {
    ctx.save();
    ctx.fillStyle = 'rgba(234,244,255,0.92)'; ctx.strokeStyle = C.uiAccent; ctx.lineWidth = 2;
    rr(ctx, 14, 14, 220, 92, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.uiAccent; ctx.fillRect(14, 14, 220, 16);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
    ctx.fillText('QUEST LOG (NEW!)', 22, 26);
    ctx.fillStyle = '#0a2a66';
    ctx.fillText('[ ] RIP 3 TEETH   0/3', 22, 48);
    ctx.fillText('[ ] CARRY 2 LAWS   ' + lawsCarried(g) + '/2', 22, 66);
    ctx.fillText('[ ] BE USEFUL  ★★★', 22, 84);
    ctx.font = '9px monospace'; ctx.fillText('bite the panel to quit your job', 22, 99);
    ctx.restore();
  }

  if (g.wing === 2) drawAcidOverlay(ctx, g, W, H, t);
  drawHud(ctx, g, W, H, t);

  if (g.line) {
    const a = clamp(g.lineT / 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.font = `italic ${Math.round(clamp(W / 46, 13, 20))}px Georgia, serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(g.line, W / 2 + 1, H - 34 + 1);
    ctx.fillStyle = '#ffd9e6'; ctx.fillText(g.line, W / 2, H - 34);
    ctx.restore();
  }

  if (g.end) {
    const k = clamp(g.end.t / 2.5, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${k})`; ctx.fillRect(0, 0, W, H);
  }

  if (fx.debug) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(6, 6, 300, 118);
    ctx.fillStyle = '#9f9'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    const c = g.chase;
    const lines = [
      `notice ${g.notice.toFixed(1)} tier ${tier} floor ${g.floor} sag ${g.sag.toFixed(1)}`,
      `pos ${g.p.x.toFixed(0)},${g.p.y.toFixed(0)} k=${g.k} grip=${g.p.grip} gnd=${g.p.grounded}`,
      `chase ${c.state} t=${c.t.toFixed(1)} pin=${c.pin.toFixed(2)} seen=${c.seen}`,
      `holes ${g.stats.holes} leash ${g.stats.leash} digests ${g.stats.digests}`,
      `mouth ${g.p.mouth} haul ${g.p.haul}`,
    ];
    lines.forEach((l, i) => ctx.fillText(l, 12, 22 + i * 14));
  }
}

function drawHud(ctx, g, W, H, t) {
  const p = g.p;
  ctx.save();
  ctx.font = '11px monospace'; ctx.textAlign = 'left';
  const slot = (label, id, x, y) => {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, x, y, 200, 22, 4); ctx.fill();
    ctx.strokeStyle = id ? LAWS[id].color : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText(label, x + 7, y + 15);
    if (id) {
      ctx.fillStyle = LAWS[id].color; ctx.fillText(LAWS[id].name, x + 52, y + 15);
    } else { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillText('—', x + 52, y + 15); }
  };
  const x0 = W - 214; const y0 = 12;
  slot('MOUTH', p.mouth, x0, y0);
  slot('HAUL', p.haul, x0, y0 + 26);
  if (g.wing === 2 || p.worn) {
    slot('WORN', p.worn, x0, y0 + 52);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, x0, y0 + 78, 200, 22, 4); ctx.fill();
    ctx.strokeStyle = p.hearts > 0 ? '#ff5d7a' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText('HEARTS', x0 + 7, y0 + 93);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < p.hearts ? '#ff5d7a' : 'rgba(255,255,255,0.16)';
      heartPath(ctx, x0 + 72 + i * 18, y0 + 89, 5); ctx.fill();
    }
  }
  ctx.restore();
}
