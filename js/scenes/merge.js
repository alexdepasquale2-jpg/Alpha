/* ============================================================================
 * scenes/merge.js — the stash / merge bay.
 *
 * Drag one item onto an identical one (same kind + tier) to fuse the next
 * tier, or tap two cells. CRAFT buys tier-1 stock, UPGRADE spends chips on a
 * permanent +1, SCRAP sells back. The tier ceiling comes from the tech tree.
 * ========================================================================== */
(function () {
  'use strict';
  const U = CM.util, A = CM.art, h = CM.ui.h, S = CM.state, ITEMS = CM.ITEMS;

  const Merge = CM.Scene.extend(function Merge() {
    CM.Scene.call(this, 'merge');
    this.sel = null;      // selected item id
    this.drag = null;     // {id, ghost, fromEl, moved}
    this.filter = null;   // null = show everything, else a chain kind
  });

  /* ================================================================ enter */
  Merge.prototype.enter = function () {
    const self = this;

    this.add(this.backButton('base'));

    const wrap = h('div.inv-wrap');
    this.add(wrap);

    /* ---- header: stash count + tier caps ------------------------------ */
    this.header = h('div', {
      style: { display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap',
               fontSize: '10px', letterSpacing: '.12em', color: '#7d8bb0', paddingTop: '26px' }
    });
    wrap.appendChild(this.header);

    /* ---- toolbar: chain filter + sort + fuse-everything ---------------- */
    this.toolbar = h('div', {
      style: { display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap', padding: '2px' }
    });
    wrap.appendChild(this.toolbar);
    this.rebuildToolbar();

    /* ---- merge-chain progress strip ----------------------------------- */
    this.recipes = h('div.recipes');
    wrap.appendChild(this.recipes);

    /* ---- the grid ------------------------------------------------------ */
    this.grid = h('div.inv-grid');
    wrap.appendChild(this.grid);

    /* ---- bottom bar ---------------------------------------------------- */
    const bar = h('div.actionbar');
    bar.appendChild(CM.ui.actionBtn('FUSE BEST PAIR', 'MERGE', '', () => {
      const r = S.autoMerge(null); CM.ui.result(r); self.rebuild();
    }));
    bar.appendChild(CM.ui.actionBtn('SPEND CHIPS', 'UPGRADE', 'green', () => {
      if (!self.sel) { CM.ui.toast('SELECT AN ITEM FIRST', 'bad'); return; }
      CM.ui.result(S.refine(self.sel)); self.rebuild();
    }));
    bar.appendChild(CM.ui.actionBtn('BUY TIER 1', 'CRAFT', 'gold', () => self.craftDialog()));
    bar.appendChild(CM.ui.actionBtn('SELL BACK', 'SCRAP', 'red', () => {
      if (!self.sel) { CM.ui.toast('SELECT AN ITEM FIRST', 'bad'); return; }
      CM.ui.result(S.scrap(self.sel)); self.sel = null; self.rebuild();
    }));
    this.add(bar);

    /* ---- drag plumbing (pointer events cover mouse + touch) ------------ */
    this._onDown = (e) => self.onDown(e);
    this._onMove = (e) => self.onMove(e);
    this._onUp   = (e) => self.onUp(e);
    this.grid.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);

    this.listen('inv', () => self.rebuild());
    this.listen('state', () => self.refreshHeader());
    this.rebuild();
  };

  Merge.prototype.exit = function () {
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.killGhost();
  };

  /** Filter chips + stash tools. Rebuilt whenever the filter changes. */
  Merge.prototype.rebuildToolbar = function () {
    const self = this;
    CM.ui.clear(this.toolbar);
    const chip = (label, kind) => h('button.btn.sm' + (self.filter === kind ? '.gold' : '.ghost'), {
      text: label,
      onclick: () => { CM.audio.play('click'); self.filter = kind; self.rebuildToolbar(); self.rebuild(); }
    });
    this.toolbar.appendChild(chip('ALL', null));
    ITEMS.KINDS.forEach((k) => this.toolbar.appendChild(chip(ITEMS.CHAINS[k].label, k)));
    this.toolbar.appendChild(h('button.btn.sm', {
      text: 'SORT', title: 'Group the stash by chain, strongest first',
      onclick: () => { CM.audio.play('click'); CM.ui.result(S.sortInv()); self.rebuild(); }
    }));
    this.toolbar.appendChild(h('button.btn.sm.green', {
      text: 'FUSE ALL', title: 'Merge every available pair, repeatedly',
      onclick: () => { CM.ui.result(S.fuseAll(self.filter)); self.rebuild(); }
    }));
  };

  /* =============================================================== render */
  Merge.prototype.rebuild = function () {
    const self = this;
    const inv = S.s.inv, slots = S.invSlots();

    /* responsive column count */
    const w = window.innerWidth;
    const cols = w < 380 ? 4 : w < 560 ? 5 : w < 820 ? 6 : w < 1100 ? 8 : 10;
    this.grid.style.setProperty('--cols', cols);

    CM.ui.clear(this.grid);
    const selItem = this.sel ? S.itemById(this.sel) : null;
    const shown = this.filter ? inv.filter((i) => i.kind === this.filter) : inv;

    shown.forEach((it, i) => {
      const cell = CM.ui.itemCell(it, { index: i });
      if (this.sel === it.id) cell.classList.add('sel');
      else if (selItem && selItem.kind === it.kind && selItem.tier === it.tier) cell.classList.add('match');
      this.grid.appendChild(cell);
    });
    // free slots are only meaningful on the unfiltered board
    if (!this.filter) for (let i = inv.length; i < slots; i++) this.grid.appendChild(h('div.cell.empty'));

    this.refreshHeader();
    this.refreshRecipes();
    void self;
  };

  Merge.prototype.refreshHeader = function () {
    if (!this.header) return;
    const caps = ITEMS.KINDS.map((k) => ITEMS.CHAINS[k].label + ' ≤T' + S.tierCap(k)).join('   ');
    this.header.textContent = 'STASH ' + S.s.inv.length + '/' + S.invSlots() + '   ·   ' + caps;
  };

  /** Shows, per chain, the best item you own and what the next fuse needs. */
  Merge.prototype.refreshRecipes = function () {
    CM.ui.clear(this.recipes);
    const self = this;
    ITEMS.KINDS.forEach((kind) => {
      const owned = S.s.inv.filter((i) => i.kind === kind);
      const counts = {};
      owned.forEach((i) => { counts[i.tier] = (counts[i.tier] || 0) + 1; });
      // the lowest tier with a ready pair, else the best owned tier
      let pairTier = null;
      Object.keys(counts).map(Number).sort((a, b) => b - a).forEach((t) => {
        if (pairTier === null && counts[t] >= 2 && t < S.tierCap(kind)) pairTier = t;
      });
      const bestTier = owned.length ? Math.max.apply(null, owned.map((i) => i.tier)) : 0;
      const showTier = pairTier || Math.max(1, bestTier);
      const ready = pairTier !== null;

      const el = h('div.recipe' + (ready ? '.ready' : ''), {
        title: ITEMS.CHAINS[kind].role,
        onclick: () => { const r = S.autoMerge(kind); CM.ui.result(r); self.rebuild(); }
      }, [
        h('img', { src: A.itemIconURL(kind, showTier, 96) }),
        h('span', { text: '+' }),
        h('img', { src: A.itemIconURL(kind, showTier, 96) }),
        h('span', { text: '→' }),
        h('img', { src: A.itemIconURL(kind, Math.min(showTier + 1, ITEMS.MAX_TIER), 96) }),
        h('span', { text: ready ? 'READY' : (counts[showTier] ? counts[showTier] + '/2' : '0/2') })
      ]);
      self.recipes.appendChild(el);
    });
  };

  /* ================================================================ input */
  const cellOf = (e) => {
    const t = e.target && e.target.closest ? e.target.closest('.cell') : null;
    return t && t.dataset.id ? t : null;
  };

  Merge.prototype.onDown = function (e) {
    const cell = cellOf(e);
    if (!cell) return;
    const id = cell.dataset.id;
    this.drag = { id: id, x0: e.clientX, y0: e.clientY, moved: false, from: cell, over: null };
    CM.audio.play('tick');
  };

  Merge.prototype.onMove = function (e) {
    const d = this.drag; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    if (!d.moved) {
      d.moved = true;
      const it = S.itemById(d.id);
      if (!it) { this.drag = null; return; }
      d.ghost = h('img', {
        src: A.itemIconURL(it.kind, it.tier, 96),
        style: { position: 'fixed', width: '64px', height: '64px', zIndex: 80, pointerEvents: 'none',
                 imageRendering: 'pixelated', filter: 'drop-shadow(0 0 12px rgba(255,255,255,.7))',
                 transform: 'translate(-50%,-50%) scale(1.1)' }
      });
      document.body.appendChild(d.ghost);
      this.ghostEl = d.ghost;
      d.from.style.opacity = '.35';
    }
    e.preventDefault();
    d.ghost.style.left = e.clientX + 'px';
    d.ghost.style.top = e.clientY + 'px';

    // highlight a legal drop target
    d.ghost.style.display = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    d.ghost.style.display = '';
    const target = under && under.closest ? under.closest('.cell') : null;
    if (d.over && d.over !== target) d.over.classList.remove('drop');
    d.over = null;
    if (target && target !== d.from && target.dataset.id) {
      const a = S.itemById(d.id), b = S.itemById(target.dataset.id);
      if (a && b && a.kind === b.kind && a.tier === b.tier) { target.classList.add('drop'); d.over = target; }
    }
  };

  Merge.prototype.onUp = function (e) {
    const d = this.drag; if (!d) return;
    this.drag = null;
    if (d.from) d.from.style.opacity = '';
    if (d.over) d.over.classList.remove('drop');

    if (!d.moved) {                       // ---- tap: select / pair-merge
      const it = S.itemById(d.id);
      if (!it) { this.killGhost(); return; }
      if (this.sel && this.sel !== d.id) {
        const a = S.itemById(this.sel);
        if (a && a.kind === it.kind && a.tier === it.tier) {
          const r = S.merge(this.sel, d.id);
          this.sel = r.ok ? r.item.id : null;
          CM.ui.result(r);
          this.rebuild(); this.popAt(r.index);
          this.killGhost(); return;
        }
      }
      this.sel = this.sel === d.id ? null : d.id;
      this.rebuild();
      this.killGhost();
      return;
    }

    // ---- drag release
    this.killGhost();
    let targetId = null;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const target = under && under.closest ? under.closest('.cell') : null;
    if (target && target.dataset.id && target.dataset.id !== d.id) targetId = target.dataset.id;
    if (!targetId) return;
    const r = S.merge(d.id, targetId);
    CM.ui.result(r);
    this.sel = null;
    this.rebuild();
    if (r.ok) this.popAt(r.index);
  };

  Merge.prototype.popAt = function (idx) {
    if (idx === undefined || idx < 0) return;
    const cell = this.grid.children[idx];
    if (cell) { cell.classList.add('pop'); setTimeout(() => cell.classList.remove('pop'), 360); }
  };

  /** Remove the floating drag image, if one is up. */
  Merge.prototype.killGhost = function () {
    if (this.ghostEl) { this.ghostEl.remove(); this.ghostEl = null; }
  };

  /* ------------------------------------------------------------- craft   */
  Merge.prototype.craftDialog = function () {
    const self = this;
    const list = h('div.list');
    ITEMS.KINDS.forEach((kind) => {
      const cost = ITEMS.craftCost(kind, S.s.crafted[kind]);
      const chain = ITEMS.CHAINS[kind];
      const row = h('div.row-item', null, [
        h('img', { src: A.itemIconURL(kind, 1, 96) }),
        h('div.grow', null, [
          h('div.nm', { text: chain.names[0] + '  ·  ' + chain.label }),
          h('div.sub', { text: chain.role })
        ]),
        h('button.btn.sm.gold', { text: U.fmt(cost) + '¢' })
      ]);
      row.addEventListener('click', () => {
        const r = S.craft(kind);
        CM.ui.result(r);
        self.rebuild();
        if (r.ok) { row.querySelector('.btn').textContent = U.fmt(ITEMS.craftCost(kind, S.s.crafted[kind])) + '¢'; }
      });
      list.appendChild(row);
    });
    CM.ui.modal({
      title: 'CRAFT TIER-1 STOCK', bodyEl: list, accent: 'gold',
      buttons: [{ label: 'DONE' }]
    });
  };

  /* ------------------------------------------------------------- canvas  */
  Merge.prototype.renderBack = function (ctx, w, hgt) {
    ctx.drawImage(A.skyline(w, hgt, 20260801), 0, 0);
    ctx.fillStyle = 'rgba(4,6,14,.74)';
    ctx.fillRect(0, 0, w, hgt);
  };

  CM.scenes = CM.scenes || {};
  CM.scenes.merge = new Merge();
})();
