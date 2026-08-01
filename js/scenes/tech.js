/* ============================================================================
 * scenes/tech.js — the progression / tech tree.
 *
 * The DAG from data/tech.js is drawn on the world canvas: glowing arrows
 * between nodes, hexagons for the live ones, dim slabs for the locked ones.
 * Drag to pan, wheel/pinch to zoom, tap a node to research it.
 * ========================================================================== */
(function () {
  'use strict';
  const U = CM.util, A = CM.art, h = CM.ui.h, S = CM.state, T = CM.TECH;

  const Tech = CM.Scene.extend(function Tech() {
    CM.Scene.call(this, 'tech');
    this.cam = { x: 0, y: 0, z: 1 };
    this.sel = null;
    this.drag = null;
    this.fitted = false;
    this.pinch = null;
  });

  const SPACING_X = 150, SPACING_Y = 128, NODE_R = 34;

  /* ================================================================ enter */
  Tech.prototype.enter = function () {
    const self = this;
    this.fitted = false;

    this.add(this.backButton('base'));

    /* ---- status strip -------------------------------------------------- */
    this.status = h('div.panel', {
      style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)',
               top: 'calc(var(--hud-h) + 4px)', padding: '6px 14px', fontSize: '10px',
               letterSpacing: '.14em', color: '#9ff0ff', whiteSpace: 'nowrap' }
    });
    this.add(this.status);

    /* ---- detail card (fills when a node is selected) ------------------- */
    this.card = h('div.panel', {
      style: { position: 'absolute', right: '10px', bottom: 'calc(var(--bar-h) + 8px)',
               width: 'min(300px,68vw)', padding: '12px', display: 'none' }
    });
    this.add(this.card);

    /* ---- bottom bar ---------------------------------------------------- */
    const bar = h('div.actionbar');
    bar.appendChild(CM.ui.actionBtn('RESEARCH NODE', 'UPGRADE', 'gold', () => self.research()));
    bar.appendChild(CM.ui.actionBtn('MERGE BAY', 'CRAFT', '', () => CM.game.go('merge')));
    bar.appendChild(CM.ui.actionBtn('RECENTRE', 'FIT VIEW', 'ghost', () => { self.fitted = false; }));
    this.add(bar);

    this.listen('state', () => self.refresh());
    this.listen('tech', () => self.refresh());
    this.refresh();
  };

  Tech.prototype.refresh = function () {
    const s = S.s;
    const owned = T.NODES.filter((n) => s.tech[n.id]).length;
    this.status.textContent =
      'LVL ' + s.level + '   ·   NODES ' + owned + '/' + T.NODES.length +
      '   ·   CAPS  W' + S.tierCap('weapon') + ' V' + S.tierCap('vehicle') + ' C' + S.tierCap('agent');
    this.renderCard();
  };

  Tech.prototype.renderCard = function () {
    const n = this.sel ? T.byId(this.sel) : null;
    if (!n) { this.card.style.display = 'none'; return; }
    this.card.style.display = '';
    CM.ui.clear(this.card);
    const owned = !!S.s.tech[n.id];
    const avail = S.techAvailable(n);
    const color = T.KIND_COLOR[n.kind];
    this.card.style.borderColor = U.rgba(color, .5);
    this.card.appendChild(h('div.panel-title', { text: n.name, style: { color: color } }));
    this.card.appendChild(h('div', { text: n.desc, style: { fontSize: '11px', lineHeight: '1.6', color: '#9fb0d4' } }));
    this.card.appendChild(h('div', {
      style: { marginTop: '8px', fontSize: '11px', letterSpacing: '.1em',
               color: owned ? '#49ff9b' : avail ? '#ffb020' : '#ff4b57' },
      text: owned ? 'ONLINE' : avail ? 'COST  ' + (Object.keys(n.cost).length ? S.costText(n.cost) : 'FREE')
                                     : 'LOCKED — needs ' + n.req.map((r) => T.byId(r).name).join(', ')
    }));
  };

  /* =============================================================== layout */
  Tech.prototype.fit = function (w, hgt) {
    const gw = (T.COLS - 1) * SPACING_X, gh = (T.ROWS - 1) * SPACING_Y;
    const pad = 90;
    const z = Math.min((w - pad) / (gw + NODE_R * 3), (hgt - pad - 150) / (gh + NODE_R * 3));
    this.cam.z = U.clamp(z, 0.34, 1.25);
    this.cam.x = w / 2 - (gw / 2) * this.cam.z;
    this.cam.y = (hgt * 0.5 + 12) - (gh / 2) * this.cam.z;
    this.fitted = true;
  };
  const nodePos = (n) => ({ x: n.col * SPACING_X, y: n.row * SPACING_Y });
  Tech.prototype.toScreen = function (p) { return { x: this.cam.x + p.x * this.cam.z, y: this.cam.y + p.y * this.cam.z }; };

  /* =============================================================== render */
  Tech.prototype.renderBack = function (ctx, w, hgt) {
    if (!this.fitted) this.fit(w, hgt);

    /* ---- deep-space grid background --------------------------------- */
    ctx.fillStyle = '#050810'; ctx.fillRect(0, 0, w, hgt);
    const g = ctx.createRadialGradient(w / 2, hgt / 2, 10, w / 2, hgt / 2, Math.max(w, hgt) * .7);
    g.addColorStop(0, 'rgba(20,50,90,.55)'); g.addColorStop(1, 'rgba(2,4,10,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);

    const step = 40 * this.cam.z;
    ctx.strokeStyle = 'rgba(40,90,140,.16)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = this.cam.x % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, hgt); }
    for (let y = this.cam.y % step; y < hgt; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    /* ---- links ------------------------------------------------------- */
    T.NODES.forEach((n) => {
      const to = this.toScreen(nodePos(n));
      n.req.forEach((rid) => {
        const r = T.byId(rid); if (!r) return;
        const from = this.toScreen(nodePos(r));
        const live = !!S.s.tech[rid];
        const done = !!S.s.tech[n.id];
        arrow(ctx, from, to, NODE_R * this.cam.z,
              done ? '#ffffff' : live ? '#24e2ff' : '#2b3550',
              done ? .95 : live ? .8 : .22, this.cam.z);
      });
    });

    /* ---- nodes ------------------------------------------------------- */
    T.NODES.forEach((n) => {
      const p = this.toScreen(nodePos(n));
      const r = NODE_R * this.cam.z;
      if (p.x < -r * 3 || p.x > w + r * 3 || p.y < -r * 3 || p.y > hgt + r * 3) return;
      drawNode(ctx, p.x, p.y, r, n, !!S.s.tech[n.id], S.techAvailable(n), this.sel === n.id, this.time);
    });
  };

  /** Glowing arrow between two node centres, trimmed to the node radius. */
  function arrow(ctx, a, b, r, color, alpha, z) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const x0 = a.x + ux * r, y0 = a.y + uy * r;
    const x1 = b.x - ux * r * 1.15, y1 = b.y - uy * r * 1.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, 2.4 * z);
    ctx.shadowColor = color; ctx.shadowBlur = 10 * z;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const hw = 7 * z;
    ctx.beginPath();
    ctx.moveTo(x1 + ux * hw, y1 + uy * hw);
    ctx.lineTo(x1 - uy * hw * .7 - ux * hw * .3, y1 + ux * hw * .7 - uy * hw * .3);
    ctx.lineTo(x1 + uy * hw * .7 - ux * hw * .3, y1 - ux * hw * .7 - uy * hw * .3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawNode(ctx, x, y, r, n, owned, avail, selected, t) {
    const color = T.KIND_COLOR[n.kind];
    const dim = !owned && !avail;
    ctx.save();

    // plate: hexagon when live, slab when still locked (matches the reference)
    ctx.beginPath();
    if (owned || avail) {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
    } else {
      U.roundRect(ctx, x - r * .82, y - r * .82, r * 1.64, r * 1.64, r * .22);
    }

    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    if (owned) { g.addColorStop(0, U.rgba(color, .55)); g.addColorStop(1, U.rgba(color, .16)); }
    else if (avail) { g.addColorStop(0, 'rgba(60,72,105,.9)'); g.addColorStop(1, 'rgba(22,28,46,.95)'); }
    else { g.addColorStop(0, 'rgba(32,38,56,.9)'); g.addColorStop(1, 'rgba(14,18,30,.95)'); }
    ctx.fillStyle = g; ctx.fill();

    ctx.lineWidth = Math.max(1.2, r * .075);
    ctx.strokeStyle = dim ? 'rgba(110,125,160,.5)' : color;
    if (!dim) { ctx.shadowColor = color; ctx.shadowBlur = (owned ? 20 : 10) * (selected ? 1.6 : 1); }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // icon
    const ic = A.glyph(n.icon || 'chip', dim ? '#6b7794' : color, 64);
    const s = r * 1.05;
    ctx.globalAlpha = dim ? .5 : 1;
    ctx.drawImage(ic, x - s / 2, y - s / 2 - r * .10, s, s);
    ctx.globalAlpha = 1;

    // label — scaled so neighbouring node names never collide
    const budget = SPACING_X * (r / NODE_R) * 0.94;
    const label = n.short || n.name;
    const sc = U.clamp(Math.floor(budget / (label.length * 6)), 1, 3);
    A.text(ctx, label, x, y + r * .62, sc,
      { align: 'center', color: dim ? '#8492b5' : '#eaf6ff', glow: dim ? 0 : 8, glowColor: color, shadow: true });

    // selection ring / "researchable" pulse
    if (selected) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(x, y, r * 1.28, 0, 7); ctx.stroke();
    } else if (avail && !owned) {
      const pulse = .5 + .5 * Math.sin(t * 3 + n.col + n.row);
      ctx.strokeStyle = U.rgba('#ffb020', .25 + .5 * pulse); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * (1.2 + .08 * pulse), 0, 7); ctx.stroke();
    }
    ctx.restore();
  }

  /* ================================================================ input */
  Tech.prototype.pointer = function (type, x, y, e) {
    if (type === 'down') { this.drag = { x: x, y: y, cx: this.cam.x, cy: this.cam.y, moved: false }; return; }
    if (type === 'move') {
      const d = this.drag; if (!d) return;
      if (Math.hypot(x - d.x, y - d.y) > 6) d.moved = true;
      this.cam.x = d.cx + (x - d.x); this.cam.y = d.cy + (y - d.y);
      return;
    }
    if (type === 'up') {
      const d = this.drag; this.drag = null;
      if (!d || d.moved) return;
      const hit = this.hitTest(x, y);
      if (hit) {
        CM.audio.play('click');
        this.sel = hit.id;
        this.refresh();
      } else { this.sel = null; this.refresh(); }
      return;
    }
    if (type === 'wheel') {
      const before = this.cam.z;
      this.cam.z = U.clamp(this.cam.z * (e.deltaY > 0 ? 0.9 : 1.11), 0.3, 1.8);
      // keep the cursor anchored while zooming
      this.cam.x = x - (x - this.cam.x) * (this.cam.z / before);
      this.cam.y = y - (y - this.cam.y) * (this.cam.z / before);
    }
  };

  Tech.prototype.hitTest = function (x, y) {
    const r = NODE_R * this.cam.z;
    for (let i = 0; i < T.NODES.length; i++) {
      const p = this.toScreen(nodePos(T.NODES[i]));
      if (Math.hypot(p.x - x, p.y - y) <= r * 1.1) return T.NODES[i];
    }
    return null;
  };

  Tech.prototype.research = function () {
    if (!this.sel) { CM.ui.toast('TAP A NODE FIRST', 'bad'); return; }
    const r = S.research(this.sel);
    CM.ui.result(r);
    this.refresh();
  };

  CM.scenes = CM.scenes || {};
  CM.scenes.tech = new Tech();
})();
