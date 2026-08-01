/* ============================================================================
 * ui.js — DOM helpers + the persistent HUD + toasts + modal dialogs.
 * Scenes build their overlays with `h()` and let this module handle chrome.
 * ========================================================================== */
CM.ui = (function () {
  'use strict';
  const U = CM.util, S = CM.state;

  /* ------------------------------------------------------- element maker */
  /**
   * h('div.panel.magenta', {onclick, style:{}, html, text, ...attrs}, [kids])
   * Class shorthand in the tag string keeps scene code compact.
   */
  function h(tag, props, kids) {
    const parts = tag.split('.');
    const el = document.createElement(parts[0] || 'div');
    if (parts.length > 1) el.className = parts.slice(1).join(' ');
    if (props) for (const k in props) {
      const v = props[k];
      if (v === undefined || v === null) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k === 'cls') el.className += ' ' + v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  /** Big arcade-style button with a caption above it (bottom action bar). */
  function actionBtn(caption, label, cls, onClick) {
    return h('div.act', null, [
      h('div.cap', { text: caption }),
      h('button.btn.notch' + (cls ? '.' + cls : ''), {
        text: label,
        onclick: (e) => { CM.audio.play('click'); onClick(e); }
      })
    ]);
  }

  /* ------------------------------------------------------------- toasts */
  const toastRoot = () => document.getElementById('toasts');
  function toast(msg, kind) {
    const el = h('div.toast' + (kind ? '.' + kind : ''), { text: msg });
    toastRoot().appendChild(el);
    setTimeout(() => el.remove(), 2500);
    while (toastRoot().children.length > 4) toastRoot().firstChild.remove();
  }
  /** Feedback for an action-result object: {ok,msg}. */
  function result(r) {
    if (!r) return false;
    if (r.msg) toast(r.msg, r.ok ? 'good' : 'bad');
    if (!r.ok) CM.audio.play('error');
    return r.ok;
  }
  /** Floating "+120¢" text at a screen position. */
  function float(x, y, text, color) {
    const el = h('div.floaty', { text: text, style: { left: x + 'px', top: y + 'px', color: color || '#ffb020' } });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  /* ------------------------------------------------------------- modals */
  function modal(opts) {
    const root = document.getElementById('modal-root');
    clear(root); root.classList.add('active');
    const close = () => { clear(root); root.classList.remove('active'); if (opts.onClose) opts.onClose(); };
    const buttons = (opts.buttons || [{ label: 'CLOSE' }]).map((b) =>
      h('button.btn' + (b.cls ? '.' + b.cls : ''), {
        text: b.label,
        onclick: () => { CM.audio.play('click'); if (b.onClick) { if (b.onClick() === false) return; } if (!b.keepOpen) close(); }
      }));
    const box = h('div.panel.modal' + (opts.accent ? '.' + opts.accent : ''), null, [
      h('h2', { text: opts.title || '' }),
      opts.bodyEl || h('div', { html: opts.body || '' }),
      h('div.row', null, buttons)
    ]);
    const bg = h('div.modal-bg', {
      onclick: (e) => { if (e.target === bg && opts.dismissable !== false) close(); }
    }, [box]);
    root.appendChild(bg);
    return { close: close, box: box };
  }

  /* ============================================================== HUD == */
  let hudEl = null, refs = {};

  function buildHUD() {
    hudEl = document.getElementById('hud');
    clear(hudEl);

    const port = h('div.hud-portrait');
    port.appendChild(CM.art.portrait(64));

    refs.lvl = h('span', { text: 'LVL 1' });
    refs.xpBar = h('i');
    const lvlBox = h('div.hud-lvl', null, [
      h('div.row', null, [refs.lvl]),
      h('div.meter.xp', null, [refs.xpBar]),
      h('div.meter.energy.seg', null, [refs.enBar = h('i')])
    ]);

    const mkRes = (cls, sym, title) => {
      const val = h('span', { text: '0' });
      const rate = h('span.rate', { text: '' });
      const el = h('div.res.' + cls, { title: title }, [h('div.chip', { text: sym }), val, rate]);
      return { el: el, val: val, rate: rate };
    };
    refs.credits = mkRes('credits', '¢', 'Credits — the crew\'s cash');
    refs.intel   = mkRes('intel', '◈', 'Intel — buys research and outposts');
    refs.chips   = mkRes('chips', '✦', 'Merge chips — refine items');

    refs.legacy = h('div.res.legacy', {
      title: 'Street cred — permanent bonus from retired crews',
      style: { display: 'none', borderColor: 'rgba(154,107,255,.5)' }
    }, [h('div.chip', { text: '\u2605', style: { background: 'radial-gradient(circle at 35% 30%,#d3bcff,#9a6bff)' } }),
        refs.legacyVal = h('span', { text: '0' })]);

    refs.boosts = h('div.res', { style: { display: 'none' } });

    const sound = h('button.btn.sm.ghost', {
      text: S.s.settings.sound ? 'SFX ON' : 'SFX OFF',
      onclick: () => {
        S.s.settings.sound = !S.s.settings.sound;
        CM.audio.setEnabled(S.s.settings.sound);
        sound.textContent = S.s.settings.sound ? 'SFX ON' : 'SFX OFF';
        CM.audio.play('click');
      }
    });
    const menu = h('button.btn.sm.ghost', { text: 'MENU', onclick: openMenu });

    hudEl.appendChild(port);
    hudEl.appendChild(lvlBox);
    hudEl.appendChild(h('div.hud-res', null,
      [refs.credits.el, refs.intel.el, refs.chips.el, refs.legacy, refs.boosts]));
    hudEl.appendChild(h('div.hud-spacer'));
    hudEl.appendChild(sound);
    hudEl.appendChild(menu);
  }

  function updateHUD() {
    if (!hudEl || hudEl.classList.contains('hidden')) return;
    const s = S.s, inc = S.income();
    refs.lvl.textContent = 'LVL ' + s.level;
    refs.xpBar.style.width = (100 * U.clamp(s.xp / S.xpNeeded(s.level), 0, 1)) + '%';
    refs.enBar.style.width = (100 * U.clamp(s.energy / S.energyMax(), 0, 1)) + '%';
    refs.credits.val.textContent = U.fmt(s.credits);
    refs.credits.rate.textContent = inc.credits > 0 ? '+' + U.fmt(inc.credits, 1) + '/s' : '';
    refs.intel.val.textContent = U.fmt(s.intel);
    refs.intel.rate.textContent = inc.intel > 0 ? '+' + U.fmt(inc.intel, 2) + '/s' : '';
    refs.chips.val.textContent = U.fmt(s.chips);
    refs.chips.rate.textContent = inc.chips > 0 ? '+' + U.fmt(inc.chips, 3) + '/s' : '';

    if (s.legacy > 0) { refs.legacy.style.display = ''; refs.legacyVal.textContent = U.fmt(s.legacy); }
    else refs.legacy.style.display = 'none';

    const boosts = S.activeBoosts();
    if (boosts.length) {
      refs.boosts.style.display = '';
      const soonest = Math.min.apply(null, boosts.map((b) => (b.until - Date.now()) / 1000));
      refs.boosts.textContent = '⚡x' + boosts.length + ' ' + U.fmtTime(soonest);
      refs.boosts.title = boosts.map((b) => b.label).join(', ');
    } else refs.boosts.style.display = 'none';
  }

  const showHUD = (on) => { if (hudEl) hudEl.classList.toggle('hidden', !on); };

  /* -------------------------------------------------------------- menu  */
  function openMenu() {
    CM.audio.play('click');
    const s = S.s;
    const body = h('div', null, [
      h('p', { html: 'Playtime <b>' + U.fmtTime(s.stats.playtime) + '</b> · Merges <b>' + U.fmt(s.stats.merges) +
        '</b> · Outposts <b>' + s.buildings.length + '</b>' }),
      h('p', { html: 'Missions won <b>' + s.stats.missionsWon + '</b> · lost <b>' + s.stats.missionsLost +
        '</b> · streak <b>' + s.missions.streak + '</b>' }),
      h('p', { html: 'Lifetime credits <b>' + U.fmt(s.stats.creditsEarned) + '</b> · Best tier <b>T' + s.stats.bestTier + '</b>' }),
      h('p', { text: 'Progress saves automatically to this browser and keeps earning while you are away (up to ' + S.OFFLINE_CAP_H + 'h).' })
    ]);
    if (s.legacy > 0 || s.prestiges > 0) {
      body.appendChild(h('p', { html: 'Street cred <b style="color:#c3a6ff">' + U.fmt(s.legacy) +
        '</b> from <b>' + s.prestiges + '</b> retired crew(s) — income ×' +
        U.fmt(1 + s.legacy * 0.04, 2) + ', combat ×' + U.fmt(1 + s.legacy * 0.02, 2) }));
    }

    modal({
      title: 'CREW TERMINAL', bodyEl: body,
      buttons: [
        { label: 'OPS BOARD', cls: 'gold', onClick: () => { setTimeout(opsBoard, 60); } },
        { label: 'RETIRE CREW', cls: 'magenta', onClick: () => { setTimeout(retireDialog, 60); } },
        { label: 'SAVE DATA', onClick: () => { setTimeout(saveDialog, 60); } },
        { label: 'HOW TO PLAY', onClick: () => { setTimeout(help, 60); } },
        { label: 'WIPE SAVE', cls: 'red', onClick: () => { setTimeout(confirmWipe, 60); } },
        { label: 'RESUME', cls: 'ghost' }
      ]
    });
  }

  /* ------------------------------------------------------- ops board --- */
  /** Full objective list: one live goal per chain plus everything claimed. */
  function opsBoard() {
    const live = S.activeObjectives();
    const box = h('div.list');

    if (!live.length) box.appendChild(h('p', { text: 'Every objective on the board is cleared. Nothing left to prove.' }));

    live.forEach((o) => {
      const pr = S.objProgress(o);
      const col = CM.OBJECTIVES.CHAIN_COLOR[o.chain];
      const bar = h('i', { style: { width: (pr.pct * 100) + '%', background: col, boxShadow: '0 0 10px ' + col } });
      const btn = h('button.btn.sm' + (pr.done ? '.gold' : '.ghost'), { text: pr.done ? 'CLAIM' : U.fmt(pr.cur) + '/' + U.fmt(pr.goal) });
      const row = h('div.row-item' + (pr.done ? '.on' : ''), { style: { borderColor: rgbaish(col) } }, [
        h('div.grow', null, [
          h('div.nm', { text: o.name, style: { color: col } }),
          h('div.sub', { text: o.desc }),
          h('div.meter', { style: { marginTop: '5px' } }, [bar]),
          h('div.sub', { style: { marginTop: '4px' },
            text: 'PAYS  ' + S.costText(o.reward) })
        ]),
        btn
      ]);
      btn.addEventListener('click', () => {
        if (!pr.done) { toast('NOT FINISHED YET', 'bad'); CM.audio.play('error'); return; }
        result(S.claimObjective(o.id));
        opsBoard();
      });
      box.appendChild(row);
    });

    const claimed = CM.OBJECTIVES.LIST.filter((o) => S.objClaimed(o.id)).length;
    box.appendChild(h('div.tiny', { style: { textAlign: 'center', paddingTop: '6px' },
      text: claimed + ' / ' + CM.OBJECTIVES.LIST.length + ' OBJECTIVES CLAIMED' }));

    modal({ title: 'OPS BOARD', accent: 'gold', bodyEl: box, buttons: [{ label: 'CLOSE' }] });
  }
  const rgbaish = (hex) => CM.util.rgba(hex, .5);

  /* --------------------------------------------------------- prestige --- */
  function retireDialog() {
    const s = S.s, gain = S.legacyGain();
    const ready = S.canRetire();
    const body = h('div', null, [
      h('p', { text: 'Retiring burns the whole operation — outposts, stash, tech, level — and buys you street cred that never goes away.' }),
      h('p', { html: 'Each point of street cred is <b>+4% to all income</b> and <b>+2% to loot, damage and toughness</b>, permanently.' }),
      h('p', { html: 'This run has earned <b>' + U.fmt(s.stats.creditsEarned) + '¢</b> → retiring now pays <b style="color:#c3a6ff">' +
        gain + ' street cred</b> (you have ' + U.fmt(s.legacy) + ').' }),
      h('p', { html: ready ? 'You keep: street cred, lifetime stats, claimed objectives and cleared mission heat. You restart at level 1 with a ' +
        U.fmt(500 * (s.legacy + gain)) + '¢ retirement kit.'
        : '<span style="color:#ff4b57">Not yet — you need level ' + S.RETIRE_LEVEL +
          ' (you are ' + s.level + ') and at least 1 street cred of earnings.</span>' })
    ]);
    modal({
      title: 'RETIRE THE CREW', accent: 'magenta', bodyEl: body,
      buttons: [
        ready ? { label: 'RETIRE — +' + gain + ' CRED', cls: 'magenta', onClick: () => {
          const r = S.retire();
          result(r);
          if (r.ok) CM.game.go('base');
        } } : null,
        { label: ready ? 'NOT YET' : 'BACK', cls: 'ghost' }
      ].filter(Boolean)
    });
  }

  /* ------------------------------------------------------ save transfer -- */
  function saveDialog() {
    const ta = h('textarea', {
      spellcheck: 'false',
      style: { width: '100%', height: '130px', background: '#05070f', color: '#9ff0ff',
               border: '1px solid rgba(36,226,255,.4)', borderRadius: '8px', padding: '8px',
               fontFamily: 'inherit', fontSize: '10px', wordBreak: 'break-all' }
    });
    ta.value = S.exportSave();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).catch(() => {});
    modal({
      title: 'SAVE DATA',
      bodyEl: h('div', null, [
        h('p', { text: 'Copied to the clipboard where the browser allows it. Paste a save string here and hit IMPORT to load it — this overwrites the current game.' }),
        ta
      ]),
      buttons: [
        { label: 'IMPORT', cls: 'red', keepOpen: true, onClick: () => {
          const r = S.importSave(ta.value);
          result(r);
          if (r.ok) { const root = document.getElementById('modal-root'); clear(root); root.classList.remove('active'); CM.game.go('base'); }
          return false;
        } },
        { label: 'CLOSE', cls: 'ghost' }
      ]
    });
  }
  function confirmWipe() {
    modal({
      title: 'WIPE THE SAVE?', accent: 'magenta',
      body: '<p>Every outpost, item and tech node is deleted. This cannot be undone.</p>',
      buttons: [
        { label: 'DELETE EVERYTHING', cls: 'red', onClick: () => { S.wipe(); S.save(); CM.game.go('title'); } },
        { label: 'CANCEL' }
      ]
    });
  }
  function help() {
    modal({
      title: 'HOW TO RUN A CREW',
      body: [
        '<p><b>1. BUILD.</b> On the base grid, pick an outpost from the left rail then tap an empty tile. Outposts print credits, intel and chips every second — even while the game is closed.</p>',
        '<p><b>2. MERGE.</b> In the stash, drag one item onto an identical one (same type, same tier) to fuse a stronger version. CRAFT buys fresh tier-1 stock, REFINE spends chips for a permanent +1.</p>',
        '<p><b>3. CREW.</b> Agents can be stationed at an outpost to multiply its output, or put in the strike squad for missions.</p>',
        '<p><b>4. HIT.</b> Missions cost energy and run as turn-based fights using your squad, best weapon and best vehicle. Pick STRIKE / OVERCLOCK / PATCH / SMOKE each round.</p>',
        '<p><b>5. RESEARCH.</b> The progression tree raises the merge tier ceiling and unlocks new outposts. Everything feeds back into the loop.</p>'
      ].join(''),
      buttons: [{ label: 'GOT IT', cls: 'gold' }]
    });
  }

  /* ------------------------------------------------- shared item widgets */
  /** Small square item cell used by the merge board and pickers. */
  function itemCell(item, opts) {
    opts = opts || {};
    if (!item) return h('div.cell.empty', { dataset: { slot: opts.index } });
    const el = h('div.cell.k-' + item.kind, { dataset: { id: item.id, index: opts.index } }, [
      h('img', { src: CM.art.itemIconURL(item.kind, item.tier, 96), alt: '' }),
      h('span.t', { text: 'T' + item.tier }),
      item.plus ? h('span.plus', { text: '+' + item.plus }) : null,
      opts.name === false ? null : h('span.nm', { text: CM.ITEMS.name(item) })
    ]);
    if (item.at) el.appendChild(h('span.plus', { text: '⌂', style: { right: 'auto', left: '3px', bottom: '2px', top: 'auto', color: '#24e2ff' } }));
    return el;
  }
  /** Wide list row for crew / deals screens. */
  function itemRow(item, subtitle, right) {
    return h('div.row-item', { dataset: { id: item.id } }, [
      h('img', { src: CM.art.itemIconURL(item.kind, item.tier, 96) }),
      h('div.grow', null, [
        h('div.nm', { text: CM.ITEMS.name(item) }),
        h('div.sub', { text: subtitle || '' })
      ]),
      right || null
    ]);
  }

  return { h, clear, actionBtn, toast, result, float, modal, buildHUD, updateHUD, showHUD,
           openMenu, help, opsBoard, retireDialog, saveDialog, itemCell, itemRow };
})();

/* toast requests routed through the bus (state.js has no DOM access) */
CM.bus.on('toast', (d) => CM.ui.toast(d.msg, d.kind));
