/* ============================================================================
 * scenes/strategy.js — STRATEGY OPS: the deeper hex-territory planner.
 *
 * Unlocked by the WAR ROOM tech node. You lay out a settlement on a hex map,
 * SIMULATE a number of turns, ANALYZE the yields, then PLAY the plan to
 * convert its output into credits / intel / chips for the main crew.
 * ========================================================================== */
(function () {
  'use strict';
  const U = CM.util, A = CM.art, h = CM.ui.h, S = CM.state;

  /* --------------------------------------------------------- definitions */
  const TERRAIN = {
    plains:   { name: 'Plains',   color: '#3f6b4a', yield: { food: 2 } },
    forest:   { name: 'Forest',   color: '#25502f', yield: { wood: 2 } },
    hills:    { name: 'Hills',    color: '#6a5f45', yield: { stone: 2 } },
    mountain: { name: 'Mountain', color: '#4b4c58', yield: { ore: 2 } },
    water:    { name: 'Water',    color: '#1d3f66', yield: { food: 1 } },
    ruins:    { name: 'Ruins',    color: '#5a3a56', yield: { gold: 1 } }
  };
  const RES = ['food', 'wood', 'stone', 'ore', 'gold'];
  const RES_COLOR = { food: '#49ff9b', wood: '#c98f4a', stone: '#9fb0d4', ore: '#ff7a2f', gold: '#ffb020' };

  const STRUCTS = [
    { id: 'farm',     name: 'FARM',     glyph: 'node',   color: '#49ff9b', cost: { wood: 10 },              add: { food: 3 },  desc: '+3 food on this tile' },
    { id: 'camp',     name: 'LUMBER',   glyph: 'relay',  color: '#c98f4a', cost: { wood: 8, food: 5 },      add: { wood: 3 },  desc: '+3 wood on this tile' },
    { id: 'quarry',   name: 'QUARRY',   glyph: 'den',    color: '#9fb0d4', cost: { wood: 18 },              add: { stone: 3 }, desc: '+3 stone on this tile' },
    { id: 'mine',     name: 'MINE',     glyph: 'vault',  color: '#ff7a2f', cost: { wood: 20, stone: 12 },   add: { ore: 3 },   desc: '+3 ore on this tile' },
    { id: 'granary',  name: 'GRANARY',  glyph: 'chip',   color: '#8dffb6', cost: { wood: 30, stone: 20 },   globalMult: { food: 0.25 }, desc: 'All food +25%' },
    { id: 'barracks', name: 'BARRACKS', glyph: 'target', color: '#ff4b57', cost: { wood: 40, ore: 20 },     upkeep: { food: 2 }, power: 12, desc: '+12 power, eats 2 food/turn' },
    { id: 'wall',     name: 'WALL',     glyph: 'wrench', color: '#7d8bb0', cost: { stone: 40 },             defense: 10, desc: '+10 defense' },
    { id: 'research', name: 'RESEARCH', glyph: 'bolt',   color: '#24e2ff', cost: { stone: 30, ore: 20 },    add: { gold: 2 }, science: 6, desc: '+2 gold, +6 science' }
  ];
  const struct = (id) => STRUCTS.find((s) => s.id === id);

  const MAP_R = 3;                   // hex radius -> 37 tiles
  const PLAY_COOLDOWN = 8 * 60 * 1000;

  /* ------------------------------------------------------- map creation */
  function generate(seed) {
    const rnd = U.seeded(seed);
    const tiles = [];
    for (let q = -MAP_R; q <= MAP_R; q++) {
      for (let r = Math.max(-MAP_R, -q - MAP_R); r <= Math.min(MAP_R, -q + MAP_R); r++) {
        const n = rnd();
        let t = 'plains';
        if (n > 0.86) t = 'ruins';
        else if (n > 0.70) t = 'mountain';
        else if (n > 0.52) t = 'hills';
        else if (n > 0.30) t = 'forest';
        else if (n > 0.22) t = 'water';
        tiles.push({ q: q, r: r, t: t, b: null });
      }
    }
    return {
      seed: seed, tiles: tiles,
      res: { food: 40, wood: 60, stone: 30, ore: 10, gold: 0 },
      turns: 0, lastSim: null, lastPlay: 0
    };
  }

  /* ================================================================ scene */
  const Strat = CM.Scene.extend(function Strat() {
    CM.Scene.call(this, 'strategy');
    this.sel = null;         // structure id queued for placement
    this.hover = null;
    this.cam = { x: 0, y: 0, size: 34 };
  });

  Strat.prototype.enter = function () {
    const self = this;
    if (!S.s.strategy) S.s.strategy = generate(Math.floor(Math.random() * 1e9));
    this.map = S.s.strategy;

    this.add(this.backButton('base'));

    /* ---- resource bars -------------------------------------------------- */
    this.resBar = h('div', {
      style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)',
               top: 'calc(var(--hud-h) + 4px)', display: 'flex', gap: '6px', flexWrap: 'wrap',
               justifyContent: 'center', maxWidth: '92vw' }
    });
    this.add(this.resBar);

    /* ---- right build panel --------------------------------------------- */
    this.panel = h('div.panel', {
      style: { position: 'absolute', right: '8px', top: 'calc(var(--hud-h) + 42px)',
               bottom: 'calc(var(--bar-h) + 6px)', width: 'min(190px,42vw)', padding: '8px',
               overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }
    });
    this.add(this.panel);

    /* ---- bottom bar ---------------------------------------------------- */
    const bar = h('div.actionbar');
    bar.appendChild(CM.ui.actionBtn('NEW TERRAIN', 'GENERATE', 'ghost', () => self.generateNew()));
    bar.appendChild(CM.ui.actionBtn('RUN 20 TURNS', 'SIMULATE', 'green', () => self.simulate(20)));
    bar.appendChild(CM.ui.actionBtn('YIELD REPORT', 'ANALYZE', '', () => self.analyze()));
    bar.appendChild(CM.ui.actionBtn('SAVE PLAN', 'EXPORT', 'ghost', () => self.exportPlan()));
    bar.appendChild(CM.ui.actionBtn('CASH OUT', 'PLAY', 'gold', () => self.play()));
    this.add(bar);

    this.rebuild();
  };

  Strat.prototype.rebuild = function () {
    const self = this;
    /* resources */
    CM.ui.clear(this.resBar);
    RES.forEach((k) => {
      this.resBar.appendChild(h('div.res', {
        style: { borderColor: U.rgba(RES_COLOR[k], .45) }
      }, [
        h('div.chip', { style: { background: RES_COLOR[k] }, text: k[0].toUpperCase() }),
        h('span', { text: U.fmt(this.map.res[k]) })
      ]));
    });
    this.resBar.appendChild(h('div.res', null, [h('span', { text: 'TURN ' + this.map.turns })]));

    /* build panel */
    CM.ui.clear(this.panel);
    this.panel.appendChild(h('div.panel-title', { text: 'STRUCTURES' }));
    STRUCTS.forEach((st) => {
      const afford = RES.every((k) => (st.cost[k] || 0) <= this.map.res[k]);
      const row = h('div.row-item', {
        style: { padding: '6px', opacity: afford ? 1 : .5,
                 borderColor: self.sel === st.id ? '#fff' : undefined, cursor: 'inherit' },
        onclick: () => { CM.audio.play('click'); self.sel = self.sel === st.id ? null : st.id; self.rebuild(); }
      }, [
        h('img', { src: A.glyphURL(st.glyph, st.color, 64), style: { width: '26px', height: '26px' } }),
        h('div.grow', null, [
          h('div.nm', { text: st.name, style: { fontSize: '10px' } }),
          h('div.sub', { text: Object.keys(st.cost).map((k) => k[0].toUpperCase() + st.cost[k]).join(' ') }),
          h('div.sub', { text: st.desc, style: { fontSize: '9px' } })
        ])
      ]);
      self.panel.appendChild(row);
    });
    this.panel.appendChild(h('div.tiny', {
      style: { marginTop: '6px', lineHeight: '1.6' },
      text: 'Pick a structure, then tap a hex. SIMULATE to run turns, PLAY to wire the profits back to the crew.'
    }));
  };

  /* --------------------------------------------------------------- hexes */
  Strat.prototype.layout = function (w, hgt) {
    const panelW = Math.min(190, w * 0.42) + 20;
    const availW = w - panelW - 20, availH = hgt - 190;
    const size = U.clamp(Math.min(availW / (MAP_R * 3 + 3), availH / (MAP_R * 2 + 2.4)), 16, 46);
    this.cam.size = size;
    this.cam.x = (w - panelW) / 2;
    this.cam.y = hgt * 0.5 + 6;
  };
  Strat.prototype.hexToPx = function (q, r) {
    const s = this.cam.size;
    return { x: this.cam.x + s * 1.5 * q, y: this.cam.y + s * Math.sqrt(3) * (r + q / 2) };
  };
  Strat.prototype.pxToHex = function (x, y) {
    const s = this.cam.size;
    const px = (x - this.cam.x) / s, py = (y - this.cam.y) / s;
    const q = (2 / 3) * px;
    const r = (-1 / 3) * px + (Math.sqrt(3) / 3) * py;
    // cube rounding
    let cx = q, cz = r, cy = -cx - cz;
    let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
    const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return this.map.tiles.find((t) => t.q === rx && t.r === rz) || null;
  };

  Strat.prototype.renderBack = function (ctx, w, hgt) {
    ctx.drawImage(A.skyline(w, hgt, 20260801), 0, 0);
    ctx.fillStyle = 'rgba(3,6,14,.76)'; ctx.fillRect(0, 0, w, hgt);
    this.layout(w, hgt);

    const s = this.cam.size;
    this.map.tiles.forEach((t) => {
      const p = this.hexToPx(t.q, t.r);
      const def = TERRAIN[t.t];
      ctx.save();
      flatHex(ctx, p.x, p.y, s * 0.94);
      ctx.fillStyle = def.color; ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = this.hover === t ? '#ffffff' : 'rgba(10,14,24,.85)';
      if (this.hover === t) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 12; }
      ctx.stroke();
      ctx.restore();

      if (t.b) {
        const st = struct(t.b);
        const ic = A.glyph(st.glyph, st.color, 64);
        ctx.drawImage(ic, p.x - s * .55, p.y - s * .55, s * 1.1, s * 1.1);
      } else if (s > 22) {
        // yield pips so empty terrain still reads at a glance
        const y = def.yield, k = Object.keys(y)[0];
        A.text(ctx, k[0].toUpperCase() + y[k], p.x, p.y - 4, Math.max(1, Math.round(s / 22)),
          { align: 'center', color: 'rgba(230,245,255,.75)' });
      }
    });

    // title
    A.text(ctx, 'STRATEGY OPS', this.cam.x, hgt - 148, Math.max(1, Math.round(s / 14)),
      { align: 'center', color: '#9ff0ff', glow: 10, glowColor: '#24e2ff' });
  };

  function flatHex(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  /* ---------------------------------------------------------------- input */
  Strat.prototype.pointer = function (type, x, y) {
    if (type === 'move') { this.hover = this.pxToHex(x, y); return; }
    if (type !== 'down') return;
    const t = this.pxToHex(x, y);
    if (!t) return;
    if (!this.sel) {
      if (t.b) {                                   // tap a structure to remove it (50% refund)
        const st = struct(t.b);
        for (const k in st.cost) this.map.res[k] += Math.floor(st.cost[k] * .5);
        t.b = null; CM.ui.toast('DEMOLISHED ' + st.name, 'good'); CM.audio.play('back');
        this.rebuild(); S.save();
      } else {
        CM.ui.toast(TERRAIN[t.t].name + ' — pick a structure on the right', 'good');
      }
      return;
    }
    const st = struct(this.sel);
    if (t.b) { CM.ui.toast('TILE OCCUPIED', 'bad'); CM.audio.play('error'); return; }
    if (t.t === 'water' && st.id !== 'farm') { CM.ui.toast('CANNOT BUILD ON WATER', 'bad'); CM.audio.play('error'); return; }
    for (const k in st.cost) if (this.map.res[k] < st.cost[k]) {
      CM.ui.toast('NEED MORE ' + k.toUpperCase(), 'bad'); CM.audio.play('error'); return;
    }
    for (const k in st.cost) this.map.res[k] -= st.cost[k];
    t.b = st.id;
    CM.audio.play('build');
    this.rebuild();
    S.save();
  };

  /* ----------------------------------------------------------- mechanics */
  /** Per-turn yields for the current layout. */
  Strat.prototype.yields = function () {
    const out = { food: 0, wood: 0, stone: 0, ore: 0, gold: 0 };
    let power = 0, defense = 0, science = 0;
    const globalMult = { food: 1, wood: 1, stone: 1, ore: 1, gold: 1 };

    this.map.tiles.forEach((t) => {
      if (t.b) {
        const st = struct(t.b);
        if (st.globalMult) for (const k in st.globalMult) globalMult[k] += st.globalMult[k];
      }
    });
    this.map.tiles.forEach((t) => {
      const ty = TERRAIN[t.t].yield;
      for (const k in ty) out[k] += ty[k];
      if (!t.b) return;
      const st = struct(t.b);
      if (st.add) for (const k in st.add) out[k] += st.add[k];
      if (st.upkeep) for (const k in st.upkeep) out[k] -= st.upkeep[k];
      power += st.power || 0; defense += st.defense || 0; science += st.science || 0;
    });
    RES.forEach((k) => { out[k] = out[k] * globalMult[k]; });
    return { res: out, power: power, defense: defense, science: science };
  };

  Strat.prototype.simulate = function (turns) {
    const y = this.yields();
    const before = Object.assign({}, this.map.res);
    for (let i = 0; i < turns; i++) {
      RES.forEach((k) => { this.map.res[k] = Math.max(0, this.map.res[k] + y.res[k]); });
    }
    this.map.turns += turns;
    this.map.lastSim = { turns: turns, y: y, gained: RES.reduce((o, k) => (o[k] = this.map.res[k] - before[k], o), {}) };
    CM.audio.play('reward');
    this.rebuild(); S.save();
    CM.ui.toast('SIMULATED ' + turns + ' TURNS', 'good');
  };

  Strat.prototype.analyze = function () {
    const y = this.yields();
    const built = this.map.tiles.filter((t) => t.b).length;
    const score = this.score(y);
    const rows = RES.map((k) =>
      '<span style="color:' + RES_COLOR[k] + '">' + k.toUpperCase() + '</span> ' +
      (y.res[k] >= 0 ? '+' : '') + U.fmt(y.res[k], 1) + '/turn').join(' · ');
    CM.ui.modal({
      title: 'YIELD ANALYSIS',
      body:
        '<p>' + rows + '</p>' +
        '<p>Structures <b>' + built + '</b> · Power <b>' + y.power + '</b> · Defense <b>' + y.defense +
        '</b> · Science <b>' + y.science + '</b></p>' +
        '<p>Operation score <b style="color:#ffb020">' + U.fmt(score) + '</b> — this is what PLAY converts into crew resources.</p>' +
        (y.res.food < 0 ? '<p style="color:#ff4b57">Food is negative: barracks will starve. Add farms or a granary.</p>' : '') +
        '<p>Stockpile: ' + RES.map((k) => k + ' ' + U.fmt(this.map.res[k])).join(', ') + '</p>',
      buttons: [{ label: 'CLOSE' }]
    });
  };

  /** A single number describing how good the plan is. */
  Strat.prototype.score = function (y) {
    y = y || this.yields();
    const stock = RES.reduce((a, k) => a + this.map.res[k] * (k === 'gold' ? 4 : 1), 0);
    const flow = RES.reduce((a, k) => a + Math.max(0, y.res[k]) * (k === 'gold' ? 4 : 1), 0);
    return Math.round(stock * 0.6 + flow * 12 + y.power * 8 + y.defense * 5 + y.science * 10);
  };

  Strat.prototype.play = function () {
    const now = Date.now();
    const left = this.map.lastPlay + PLAY_COOLDOWN - now;
    if (left > 0) { CM.ui.toast('OPERATION COOLING DOWN — ' + U.fmtTime(left / 1000), 'bad'); CM.audio.play('error'); return; }
    const sc = this.score();
    if (sc < 200) { CM.ui.toast('PLAN TOO THIN — BUILD AND SIMULATE FIRST', 'bad'); CM.audio.play('error'); return; }

    const m = S.mult();
    const payout = {
      credits: Math.round(sc * 6 * Math.pow(1.35, S.s.level - 1) * m.credits / 10),
      intel:   Math.round(sc * 0.05 * m.intel),
      chips:   Math.round(sc * 0.008 * m.chips),
      xp:      Math.round(sc * 0.05)
    };
    S.grant(payout);
    this.map.lastPlay = now;
    // spend the stockpile — the operation consumed it
    RES.forEach((k) => { this.map.res[k] = Math.floor(this.map.res[k] * 0.35); });
    CM.audio.play('reward');
    this.rebuild(); S.save();
    CM.ui.modal({
      title: 'OPERATION EXECUTED', accent: 'gold',
      body: '<p>Score <b>' + U.fmt(sc) + '</b> converted into crew assets.</p>' +
            '<p>Credits <b>+' + U.fmt(payout.credits) + '</b> · Intel <b>+' + U.fmt(payout.intel) +
            '</b> · Chips <b>+' + U.fmt(payout.chips) + '</b> · XP <b>+' + payout.xp + '</b></p>' +
            '<p>Stockpile spent. Next operation available in ' + U.fmtTime(PLAY_COOLDOWN / 1000) + '.</p>',
      buttons: [{ label: 'BACK TO BASE', cls: 'gold', onClick: () => CM.game.go('base') }, { label: 'STAY' }]
    });
  };

  Strat.prototype.generateNew = function () {
    const self = this;
    CM.ui.modal({
      title: 'GENERATE NEW TERRAIN',
      body: '<p>This rolls a fresh hex map. Every structure you placed is lost, stockpiles reset.</p>',
      buttons: [
        { label: 'GENERATE', cls: 'red', onClick: () => {
          S.s.strategy = generate(Math.floor(Math.random() * 1e9));
          self.map = S.s.strategy; self.sel = null; self.rebuild(); S.save();
          CM.audio.play('build');
        } },
        { label: 'CANCEL', cls: 'ghost' }
      ]
    });
  };

  /** Dump the plan as JSON — clipboard first, textarea fallback. */
  Strat.prototype.exportPlan = function () {
    const y = this.yields();
    const data = JSON.stringify({
      seed: this.map.seed, turns: this.map.turns, res: this.map.res,
      score: this.score(y), yields: y,
      layout: this.map.tiles.filter((t) => t.b).map((t) => ({ q: t.q, r: t.r, terrain: t.t, build: t.b }))
    }, null, 2);
    const ta = h('textarea', {
      style: { width: '100%', height: '200px', background: '#05070f', color: '#9ff0ff',
               border: '1px solid rgba(36,226,255,.4)', borderRadius: '8px', padding: '8px',
               fontFamily: 'inherit', fontSize: '10px' }
    });
    ta.value = data;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data).catch(() => {});
    CM.ui.modal({
      title: 'EXPORT PLAN',
      bodyEl: h('div', null, [h('p', { text: 'Copied to the clipboard where the browser allows it.' }), ta]),
      buttons: [{ label: 'CLOSE' }]
    });
  };

  CM.scenes = CM.scenes || {};
  CM.scenes.strategy = new Strat();
})();
