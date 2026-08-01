/* ============================================================================
 * scenes/base.js — the rainy outpost grid: the game's home screen.
 *
 * Canvas: a perspective concrete slab of GRID_COLS x GRID_ROWS tiles sitting in
 * the neon skyline, with hexagonal outposts, ambient clutter and income pops.
 * DOM   : left build rail, right crew rail, bottom action bar.
 * ========================================================================== */
(function () {
  'use strict';
  const U = CM.util, A = CM.art, h = CM.ui.h, S = CM.state, BLD = CM.BUILDINGS;

  const Base = CM.Scene.extend(function Base() {
    CM.Scene.call(this, 'base');
    this.sel = null;          // building type queued for placement
    this.selCrew = null;      // agent itemId queued for stationing
    this.hover = null;        // {col,row}
    this.pops = [];           // floating income numbers drawn on canvas
    this.popTimer = 0;
    this.geo = null;
    this.clutterSeeds = null;
    this.rings = [];          // expanding confirmation rings after an action
    this.hoverAge = 0;        // how long the current tile has been targeted
  });

  /* ================================================================ enter */
  Base.prototype.enter = function () {
    const self = this;

    /* ---------------------------------------------- left rail: outposts */
    this.leftRail = h('div.rail.left');
    this.add(h('div.rail-label.left', { text: 'BUILD' }));
    this.add(this.leftRail);

    /* ------------------------------------------------ right rail: crew  */
    this.rightRail = h('div.rail.right');
    this.add(h('div.rail-label.right', { text: 'CREW' }));
    this.add(this.rightRail);

    /* ------------------------------------------------- bottom act bar   */
    const bar = h('div.actionbar');
    bar.appendChild(CM.ui.actionBtn('SHADY DEALS', 'DEALS', 'magenta', () => CM.game.go('deals')));
    bar.appendChild(CM.ui.actionBtn('FRECN CREW', 'CREW', 'gold', () => CM.game.go('crew')));
    bar.appendChild(CM.ui.actionBtn('MERGE BAY', 'STASH', '', () => CM.game.go('merge')));
    bar.appendChild(CM.ui.actionBtn('TURN-BASE', 'HIT MISSION', 'red', () => CM.game.go('mission')));
    bar.appendChild(CM.ui.actionBtn('TECH GRID', 'PROGRESSION', 'green', () => CM.game.go('tech')));
    if (S.hasUnlock('strategy'))
      bar.appendChild(CM.ui.actionBtn('OPS MAP', 'STRATEGY', '', () => CM.game.go('strategy')));
    this.add(bar);

    /* ------------------------------------------- objective ticker -------
       One live goal, top-centre, tappable to open the full ops board. This is
       the game's sense of direction — without it a new player has no idea
       whether to build, merge or fight next.                              */
    this.ticker = h('div.panel', {
      style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)',
               top: 'calc(var(--hud-h) + 4px)', padding: '5px 12px', minWidth: 'min(300px,86vw)',
               maxWidth: '92vw', cursor: 'inherit', display: 'flex', flexDirection: 'column', gap: '4px' },
      onclick: () => { CM.audio.play('click'); CM.ui.opsBoard(); }
    }, [
      this.tickerText = h('div', { style: { fontSize: '10px', letterSpacing: '.12em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }),
      h('div.meter', { style: { height: '5px' } }, [this.tickerBar = h('i')])
    ]);
    this.add(this.ticker);

    /* ------------------------------------------------ hint / selection  */
    this.hint = h('div', {
      style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)',
               bottom: 'calc(var(--bar-h) + 4px)', fontSize: '10px', letterSpacing: '.12em',
               color: '#9ff0ff', textShadow: '0 0 10px rgba(36,226,255,.8)', pointerEvents: 'none',
               whiteSpace: 'nowrap', maxWidth: '96vw', overflow: 'hidden', textOverflow: 'ellipsis',
               background: 'rgba(4,6,14,.72)', padding: '3px 10px', borderRadius: '6px' }
    });
    this.add(this.hint);

    this.rebuildRails();
    this.listen('state', () => self.rebuildRails());
    this.listen('inv', () => self.rebuildRails());
    this.listen('tech', () => { self.rebuildRails(); });
    this.listen('objectives', () => self.updateTicker());
    this.updateTicker();

    // the tutorial's own coach panel covers this exact tip — skip the toast
    // so it does not sit on top of the rail slot the tutorial is spotlighting
    if (!S.s.buildings.length && !CM.tutorial.isActive())
      CM.ui.toast('Pick DATA NODE on the left, then tap a tile', 'good');
  };

  /* ---------------------------------------------------------- rail build */
  Base.prototype.rebuildRails = function () {
    const self = this;

    /* --- build palette ------------------------------------------------- */
    CM.ui.clear(this.leftRail);
    BLD.DEFS.forEach((def) => {
      const locked = def.tech && !S.s.tech[def.tech];
      const cost = BLD.cost(def.id, 1);
      const afford = S.can(cost);
      const el = h('div.slot', {
        title: def.name + ' — ' + def.desc,
        cls: (self.sel === def.id ? 'sel ' : '') + (locked ? '' : def.id === 'node' ? 'cyan' : def.id === 'den' ? 'magenta' : 'gold'),
        style: { opacity: locked ? .35 : afford ? 1 : .6 },
        onclick: () => {
          CM.audio.play('click');
          if (locked) { CM.ui.toast(def.name + ' LOCKED — research it in PROGRESSION', 'bad'); return; }
          self.selCrew = null;
          self.sel = self.sel === def.id ? null : def.id;
          self.rebuildRails();
        }
      }, [
        h('img', { src: A.glyphURL(def.glyph, locked ? '#556' : def.color, 64) }),
        h('span.cost', { text: locked ? 'LOCK' : U.fmt(cost.credits) })
      ]);
      self.leftRail.appendChild(el);
    });

    /* --- crew rail (agents you own) ------------------------------------- */
    CM.ui.clear(this.rightRail);
    const agents = S.s.inv.filter((i) => i.kind === 'agent')
                          .sort((a, b) => b.tier - a.tier).slice(0, 14);
    if (!agents.length) {
      this.rightRail.appendChild(h('div.tiny', { text: 'NO CREW', style: { textAlign: 'center' } }));
    }
    agents.forEach((it) => {
      const inSquad = S.s.squad.indexOf(it.id) >= 0;
      const el = h('div.slot', {
        title: CM.ITEMS.name(it) + (it.at ? ' — stationed' : inSquad ? ' — in squad' : ' — idle'),
        cls: (self.selCrew === it.id ? 'sel ' : '') + (it.at ? 'cyan' : inSquad ? 'gold' : ''),
        onclick: () => {
          CM.audio.play('click');
          self.sel = null;
          self.selCrew = self.selCrew === it.id ? null : it.id;
          self.rebuildRails();
        }
      }, [
        h('img', { src: A.itemIconURL('agent', it.tier, 96) }),
        h('span.tag', { text: 'T' + it.tier })
      ]);
      self.rightRail.appendChild(el);
    });

    this.updateHint();
  };

  Base.prototype.updateHint = function () {
    if (!this.hint) return;
    // the tutorial coach sits in the same spot; give it the room
    this.hint.style.display = CM.tutorial.isActive() ? 'none' : '';
    if (this.sel) {
      const d = BLD.byId(this.sel), c = BLD.cost(this.sel, 1);
      this.hint.textContent = 'PLACING ' + d.name + '  ·  ' + S.costText(c) + '  ·  TAP A TILE';
    } else if (this.selCrew) {
      const it = S.itemById(this.selCrew);
      this.hint.textContent = 'STATIONING ' + (it ? CM.ITEMS.name(it) : '') + '  ·  TAP AN OUTPOST';
    } else {
      const inc = S.income();
      this.hint.textContent = S.s.buildings.length
        ? S.s.buildings.length + ' OUTPOSTS  ·  +' + U.fmt(inc.credits, 1) + '¢/s'
        : 'SELECT AN OUTPOST FROM THE LEFT RAIL';
    }
  };

  /* =============================================================== layout */
  /** Recompute the trapezoid slab geometry for the current viewport. */
  Base.prototype.layout = function (w, hgt) {
    const hud = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-h')) || 64;
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 72;
    const railW = w < 640 ? 54 : 70;
    const topY = hud + hgt * 0.16;
    const botY = hgt - bar - hgt * 0.03;
    const availHalf = (w - railW * 2) / 2;
    this.geo = {
      cx: w / 2, topY: topY, botY: botY,
      topHalf: Math.max(40, availHalf * 0.62),
      botHalf: Math.max(60, availHalf * 1.0),
      cols: S.GRID_COLS, rows: S.GRID_ROWS
    };
    return this.geo;
  };
  /** grid (col,row) -> screen point + depth scale. */
  Base.prototype.project = function (col, row) {
    const g = this.geo, t = (row + 0.5) / g.rows;
    const y = U.lerp(g.topY, g.botY, t);
    const half = U.lerp(g.topHalf, g.botHalf, t);
    const x = g.cx + ((col + 0.5) / g.cols - 0.5) * 2 * half;
    return { x: x, y: y, half: half, scale: U.lerp(0.62, 1, t), tileW: (2 * half) / g.cols };
  };
  /** screen point -> grid cell (or null when off-slab). */
  Base.prototype.unproject = function (px, py) {
    const g = this.geo; if (!g) return null;
    const t = (py - g.topY) / (g.botY - g.topY);
    if (t < 0 || t > 1) return null;
    const half = U.lerp(g.topHalf, g.botHalf, t);
    const u = (px - g.cx) / (2 * half) + 0.5;
    if (u < 0 || u > 1) return null;
    return { col: U.clamp(Math.floor(u * g.cols), 0, g.cols - 1), row: U.clamp(Math.floor(t * g.rows), 0, g.rows - 1) };
  };

  /* =============================================================== update */
  Base.prototype.update = function (dt) {
    // periodic income pops above a random outpost
    this.popTimer -= dt;
    if (this.popTimer <= 0 && S.s.buildings.length && this.geo) {
      this.popTimer = U.rand(0.8, 1.8);
      const b = U.choice(S.s.buildings);
      const y = BLD.yieldsOf(b), bonus = S.buildingBonus(b), m = S.mult();
      const p = this.project(b.col, b.row);
      let label = null, col = '#ffb020';
      if (y.credits) { label = '+' + U.fmt(y.credits * bonus * m.credits * 3, 1) + '¢'; col = '#ffd76a'; }
      else if (y.intel) { label = '+' + U.fmt(y.intel * bonus * m.intel * 3, 2) + '◈'; col = '#7fe6ff'; }
      else if (y.chips) { label = '+' + U.fmt(y.chips * bonus * m.chips * 3, 3) + '✦'; col = '#ff8fd0'; }
      else if (y.energyRegen) { label = '+⚡'; col = '#ffd76a'; }
      if (label) this.pops.push({ x: p.x, y: p.y - p.tileW * 0.9, life: 1, text: label, color: col });
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.life -= dt * 0.75; p.y -= dt * 26;
      if (p.life <= 0) this.pops.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt * 1.8;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
    this.hoverAge += dt;
    this.updateHint();
    this.updateTicker();
  };

  /** Keep the top-centre objective chip in sync with the live goal. */
  Base.prototype.updateTicker = function () {
    if (!this.ticker) return;
    const o = S.focusObjective();
    if (!o) {
      this.tickerText.textContent = 'OPS BOARD CLEARED — TAP FOR STATS';
      this.tickerBar.style.width = '100%';
      this.tickerBar.style.background = '#49ff9b';
      return;
    }
    const pr = S.objProgress(o);
    const col = CM.OBJECTIVES.CHAIN_COLOR[o.chain];
    this.ticker.style.borderColor = U.rgba(col, pr.done ? .95 : .45);
    this.tickerText.innerHTML = (pr.done ? '<b style="color:#ffb020">CLAIM</b>  ' : '') +
      '<span style="color:' + col + '">' + o.name + '</span>  ·  ' + o.desc +
      '  <span style="opacity:.6">' + U.fmt(pr.cur) + '/' + U.fmt(pr.goal) + '</span>';
    this.tickerBar.style.width = (pr.pct * 100) + '%';
    this.tickerBar.style.background = pr.done ? '#ffb020' : col;
    this.tickerBar.style.boxShadow = '0 0 8px ' + col;
  };

  /* =============================================================== render */
  Base.prototype.renderBack = function (ctx, w, hgt) {
    ctx.drawImage(A.skyline(w, hgt, 20260801), 0, 0);
    const g = this.layout(w, hgt);

    /* ---- slab ------------------------------------------------------- */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g.cx - g.topHalf, g.topY); ctx.lineTo(g.cx + g.topHalf, g.topY);
    ctx.lineTo(g.cx + g.botHalf, g.botY); ctx.lineTo(g.cx - g.botHalf, g.botY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, g.topY, 0, g.botY);
    grad.addColorStop(0, '#474d5e'); grad.addColorStop(.5, '#565c70'); grad.addColorStop(1, '#646b81');
    ctx.fillStyle = grad; ctx.fill();
    ctx.clip();

    /* ---- wet sheen + tile lines ------------------------------------- */
    ctx.strokeStyle = 'rgba(20,24,34,.55)'; ctx.lineWidth = 1;
    for (let r = 0; r <= g.rows; r++) {
      const t = r / g.rows, y = U.lerp(g.topY, g.botY, t), half = U.lerp(g.topHalf, g.botHalf, t);
      ctx.beginPath(); ctx.moveTo(g.cx - half, y); ctx.lineTo(g.cx + half, y); ctx.stroke();
    }
    for (let c = 0; c <= g.cols; c++) {
      const u = c / g.cols - 0.5;
      ctx.beginPath();
      ctx.moveTo(g.cx + u * 2 * g.topHalf, g.topY);
      ctx.lineTo(g.cx + u * 2 * g.botHalf, g.botY);
      ctx.stroke();
    }
    // neon reflection puddles
    ctx.globalCompositeOperation = 'lighter';
    ['#ff3fa4', '#24e2ff', '#ffb020'].forEach((c, i) => {
      const px = g.cx + (i - 1) * g.botHalf * .55, py = U.lerp(g.topY, g.botY, .55 + i * .15);
      const rg = ctx.createRadialGradient(px, py, 2, px, py, g.botHalf * .35);
      rg.addColorStop(0, U.rgba(c, .10)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, hgt);
    });
    ctx.globalCompositeOperation = 'source-over';

    /* ---- ambient clutter (stable positions per session) --------------- */
    if (!this.clutterSeeds) {
      this.clutterSeeds = [];
      const rnd = U.seeded(4242);
      for (let i = 0; i < 26; i++) this.clutterSeeds.push({ c: rnd() * g.cols, r: rnd() * g.rows, s: rnd() * 1e6 });
    }
    this.clutterSeeds.forEach((cl) => {
      if (S.buildingAt(Math.floor(cl.c), Math.floor(cl.r))) return;
      const p = this.project(cl.c - .5, cl.r - .5);
      A.clutter(ctx, p.x, p.y, p.tileW * .28, cl.s);
    });
    ctx.restore();

    /* ---- slab edge glow ---------------------------------------------- */
    ctx.save();
    ctx.strokeStyle = 'rgba(140,190,255,.30)'; ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(120,180,255,.6)'; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(g.cx - g.topHalf, g.topY); ctx.lineTo(g.cx + g.topHalf, g.topY);
    ctx.lineTo(g.cx + g.botHalf, g.botY); ctx.lineTo(g.cx - g.botHalf, g.botY);
    ctx.closePath(); ctx.stroke();
    ctx.restore();

    /* ---- targeting indicator ----------------------------------------- */
    this.drawTargeting(ctx);

    /* ---- outposts, painted back-to-front ----------------------------- */
    const list = S.s.buildings.slice().sort((a, b) => a.row - b.row);
    list.forEach((b) => {
      const p = this.project(b.col, b.row);
      const def = BLD.byId(b.type);
      const w2 = p.tileW * 0.86;
      A.drawBuilding(ctx, p.x, p.y + p.tileW * 0.18, w2, def.color, b.level, this.time);
      // stationed-crew marker
      if (b.crew) {
        const it = S.itemById(b.crew);
        if (it) {
          const ic = A.itemIcon('agent', it.tier, 64);
          const s = w2 * .42;
          ctx.drawImage(ic, p.x - w2 * .62, p.y - s * .4, s, s);
        }
      }
      // level pip text
      A.text(ctx, 'L' + b.level, p.x, p.y + p.tileW * 0.30, Math.max(1, p.tileW / 46),
        { align: 'center', color: '#e9f4ff', glow: 6, glowColor: def.color });
    });
  };

  Base.prototype.renderFront = function (ctx) {
    this.pops.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = U.clamp(p.life, 0, 1);
      A.text(ctx, p.text, p.x, p.y, 2, { align: 'center', color: p.color, glow: 10, glowColor: p.color, shadow: true });
      ctx.restore();
    });
  };

  /** The four screen-space corners of a grid tile, in the slab's perspective. */
  Base.prototype.tileQuad = function (col, row) {
    const g = this.geo;
    const t0 = row / g.rows, t1 = (row + 1) / g.rows;
    const h0 = U.lerp(g.topHalf, g.botHalf, t0), h1 = U.lerp(g.topHalf, g.botHalf, t1);
    const y0 = U.lerp(g.topY, g.botY, t0), y1 = U.lerp(g.topY, g.botY, t1);
    const u0 = col / g.cols - .5, u1 = (col + 1) / g.cols - .5;
    return [
      { x: g.cx + u0 * 2 * h0, y: y0 },
      { x: g.cx + u1 * 2 * h0, y: y0 },
      { x: g.cx + u1 * 2 * h1, y: y1 },
      { x: g.cx + u0 * 2 * h1, y: y1 }
    ];
  };

  /**
   * Which already-placed outposts a build at (col,row) would interact with:
   * relays buff orthogonal neighbours, so both directions are worth showing
   * before the player commits credits to a tile.
   */
  Base.prototype.linkedTiles = function (col, row, type) {
    const out = [];
    const orth = (b) => Math.abs(b.col - col) + Math.abs(b.row - row) === 1;
    if (type === 'relay') {
      S.s.buildings.forEach((b) => { if (orth(b)) out.push(b); });
    } else {
      S.s.buildings.forEach((b) => { if (b.type === 'relay' && orth(b)) out.push(b); });
    }
    return out;
  };

  /**
   * The tile reticle. Always on for the targeted tile, colour-coded:
   *   green  a queued build fits here
   *   red    the action cannot happen here
   *   cyan   an existing outpost (tap to inspect)
   *   grey   idle, nothing queued
   * When placing, it also ghosts the building and outlines linked relays.
   */
  Base.prototype.drawTargeting = function (ctx) {
    if (!this.hover || !this.geo) { this.drawRings(ctx); return; }
    const col = this.hover.col, row = this.hover.row;
    const existing = S.buildingAt(col, row);
    const placing = !!this.sel, stationing = !!this.selCrew;

    let mode = 'idle', tint = '#9fb0d4';
    if (placing)         { mode = existing ? 'bad' : 'ok'; }
    else if (stationing) { mode = existing ? 'ok' : 'bad'; }
    else if (existing)   { mode = 'info'; }
    tint = mode === 'ok' ? '#49ff9b' : mode === 'bad' ? '#ff4b57' : mode === 'info' ? '#24e2ff' : '#9fb0d4';

    const quad = this.tileQuad(col, row);
    const p = this.project(col, row);

    /* linked relays / neighbours, drawn first so the target sits on top */
    if (placing && mode === 'ok') {
      this.linkedTiles(col, row, this.sel).forEach((b) => {
        A.targetQuad(ctx, this.tileQuad(b.col, b.row), '#9a6bff',
          { t: this.time, fill: 0.08, brackets: false, dash: true });
      });
    }

    /* ghost of the building about to be dropped */
    if (placing && !existing) {
      ctx.save();
      ctx.globalAlpha = 0.42 + 0.12 * Math.sin(this.time * 4.2);
      A.drawBuilding(ctx, p.x, p.y + p.tileW * 0.18, p.tileW * 0.86,
        BLD.byId(this.sel).color, 1, this.time);
      ctx.restore();
    }

    A.targetQuad(ctx, quad, tint, {
      t: this.time,
      fill: mode === 'idle' ? 0.06 : 0.13,
      crosshair: placing || stationing,
      weight: mode === 'idle' ? 2 : 2.8
    });

    /* coordinate readout under the reticle */
    const label = (col + 1) + '-' + (row + 1);
    A.text(ctx, label, p.x, quad[2].y + 4, Math.max(1, p.tileW / 40),
      { align: 'center', color: tint, glow: 6, glowColor: tint, shadow: true });

    this.drawRings(ctx);
  };

  /** Expanding rings spawned when something is actually placed or stationed. */
  Base.prototype.drawRings = function (ctx) {
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      const q = this.tileQuad(r.col, r.row);
      ctx.save();
      ctx.globalAlpha = r.life;
      A.targetQuad(ctx, expandQuad(q, 1 + (1 - r.life) * 0.8), r.color,
        { t: this.time, fill: false, dash: false, weight: 3 });
      ctx.restore();
    }
  };
  /** Scale a quad about its centre — used for the confirmation ring. */
  function expandQuad(q, k) {
    const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
    const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
    return q.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  }
  /** Kick off a confirmation ring on a tile. */
  Base.prototype.ping = function (col, row, color) {
    this.rings.push({ col: col, row: row, color: color || '#49ff9b', life: 1 });
  };

  /* ============================================================== pointer */
  Base.prototype.pointer = function (type, x, y) {
    if (type === 'move') { this.setHover(this.unproject(x, y)); return; }
    if (type !== 'down') return;
    const cell = this.unproject(x, y);
    // touch devices never fire hover, so the tap itself acquires the target
    this.setHover(cell);
    if (!cell) return;
    const existing = S.buildingAt(cell.col, cell.row);

    // 1) stationing a crew member
    if (this.selCrew) {
      if (!existing) {
        CM.ui.toast('TAP AN OUTPOST TO STATION CREW', 'bad'); CM.audio.play('error');
        this.ping(cell.col, cell.row, '#ff4b57');
        return;
      }
      const r = S.stationCrew(this.selCrew, existing.id);
      CM.ui.result(r);
      if (r.ok) this.ping(cell.col, cell.row, '#ff3fa4');
      this.selCrew = null; this.rebuildRails();
      return;
    }
    // 2) placing a new outpost
    if (this.sel) {
      const r = S.place(this.sel, cell.col, cell.row);
      CM.ui.result(r);
      this.ping(cell.col, cell.row, r.ok ? BLD.byId(this.sel).color : '#ff4b57');
      if (r.ok && !S.can(BLD.cost(this.sel, 1))) this.sel = null;  // out of cash, drop the brush
      this.rebuildRails();
      return;
    }
    // 3) inspecting an existing outpost
    if (existing) { this.ping(cell.col, cell.row, '#24e2ff'); this.openBuilding(existing); }
  };

  /** Move the reticle, resetting its dwell timer when the tile changes. */
  Base.prototype.setHover = function (cell) {
    const same = this.hover && cell && this.hover.col === cell.col && this.hover.row === cell.row;
    if (!same) this.hoverAge = 0;
    this.hover = cell;
  };

  /* ----------------------------------------------------- building dialog */
  Base.prototype.openBuilding = function (b) {
    const self = this;
    const def = BLD.byId(b.type);
    const y = BLD.yieldsOf(b), bonus = S.buildingBonus(b), m = S.mult();
    const next = b.level < BLD.MAX_LEVEL ? BLD.cost(b.type, b.level + 1) : null;
    const crew = b.crew ? S.itemById(b.crew) : null;

    const lines = [];
    if (y.credits) lines.push('Credits <b>+' + U.fmt(y.credits * bonus * m.credits, 2) + '/s</b>');
    if (y.intel)   lines.push('Intel <b>+' + U.fmt(y.intel * bonus * m.intel, 3) + '/s</b>');
    if (y.chips)   lines.push('Chips <b>+' + U.fmt(y.chips * bonus * m.chips, 4) + '/s</b>');
    if (y.energyRegen) lines.push('Energy <b>+' + U.fmt(y.energyRegen, 2) + '/s</b>, cap <b>+' + Math.round(y.energyMax) + '</b>');
    if (y.adjacency) lines.push('Adjacent outposts <b>+' + Math.round(y.adjacency * 100) + '%</b>');

    const body = h('div', null, [
      h('p', { text: def.desc }),
      h('p', { html: 'Level <b>' + b.level + '</b> / ' + BLD.MAX_LEVEL + ' · Output multiplier <b>x' + U.fmt(bonus, 2) + '</b>' }),
      h('p', { html: lines.join(' · ') }),
      h('p', { html: 'Crew: <b>' + (crew ? CM.ITEMS.name(crew) : 'none') + '</b>' + (crew ? '' : ' — station an agent for a big boost') })
    ]);

    CM.ui.modal({
      title: def.name + ' · TILE ' + (b.col + 1) + '-' + (b.row + 1),
      bodyEl: body,
      buttons: [
        next ? { label: 'UPGRADE  ' + S.costText(next), cls: 'gold', keepOpen: true, onClick: () => {
          if (CM.ui.result(S.upgrade(b.id))) { self.openBuilding(b); }
          return false;
        } } : null,
        { label: crew ? 'PULL CREW' : 'STATION CREW', cls: 'magenta', onClick: () => {
          if (crew) { S.unassign(crew.id); CM.ui.toast('CREW PULLED', 'good'); self.rebuildRails(); }
          else setTimeout(() => self.crewPicker(b), 60);
        } },
        { label: 'SALVAGE', cls: 'red', onClick: () => { CM.ui.result(S.demolish(b.id)); self.rebuildRails(); } },
        { label: 'CLOSE', cls: 'ghost' }
      ].filter(Boolean)
    });
  };

  Base.prototype.crewPicker = function (b) {
    const self = this;
    const agents = S.s.inv.filter((i) => i.kind === 'agent');
    const list = h('div.list');
    if (!agents.length) list.appendChild(h('p', { text: 'No crew yet — craft or merge agents in the STASH.' }));
    agents.sort((a, c) => c.tier - a.tier).forEach((it) => {
      const where = it.at ? 'stationed' : (S.s.squad.indexOf(it.id) >= 0 ? 'in squad' : 'idle');
      const row = CM.ui.itemRow(it, where + ' · output x' + U.fmt(1 + 0.25 * it.tier * S.mult().station, 2),
        h('button.btn.sm', { text: 'ASSIGN' }));
      row.addEventListener('click', () => {
        CM.ui.result(S.stationCrew(it.id, b.id));
        self.rebuildRails();
        document.getElementById('modal-root').classList.remove('active');
        CM.ui.clear(document.getElementById('modal-root'));
      });
      list.appendChild(row);
    });
    CM.ui.modal({ title: 'STATION CREW AT ' + BLD.byId(b.type).name, bodyEl: list, accent: 'magenta',
      buttons: [{ label: 'CANCEL', cls: 'ghost' }] });
  };

  CM.scenes = CM.scenes || {};
  CM.scenes.base = new Base();
})();
