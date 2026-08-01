/* ============================================================================
 * main.js — bootstrap, canvas plumbing, the game loop and the scene manager.
 *
 * Draw order every frame:
 *   scene.renderBack()  →  rain  →  scene.renderFront()  →  lightning flash
 * ========================================================================== */
CM.game = (function () {
  'use strict';
  const U = CM.util, S = CM.state;

  const game = {
    canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
    scene: null, rain: null, running: false, last: 0, fade: 0
  };

  /* ============================================================== resize */
  function resize() {
    const c = game.canvas;
    game.dpr = Math.min(window.devicePixelRatio || 1, 2);
    game.w = window.innerWidth;
    game.h = window.innerHeight;
    c.width = Math.round(game.w * game.dpr);
    c.height = Math.round(game.h * game.dpr);
    c.style.width = game.w + 'px';
    c.style.height = game.h + 'px';
    game.ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    CM.art.invalidate();                    // skyline is size-dependent
    game.rain.resize(game.w, game.h);
    if (game.scene) game.scene.resize(game.w, game.h);
  }

  /* ======================================================= scene manager */
  function go(name, params) {
    const next = CM.scenes[name];
    if (!next) { console.warn('no scene', name); return; }
    if (game.scene) game.scene._exit();
    game.scene = next;
    game.fade = 1;
    next._enter(params);
    CM.ui.updateHUD();
    S.save();
  }

  /* ============================================================== input */
  function bindInput() {
    const c = game.canvas;
    const pt = (e) => ({ x: e.clientX, y: e.clientY });
    c.addEventListener('pointerdown', (e) => {
      CM.audio.unlock();
      const p = pt(e);
      if (game.scene) game.scene.pointer('down', p.x, p.y, e);
      c.setPointerCapture && e.pointerId !== undefined && c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      const p = pt(e);
      if (game.scene) game.scene.pointer('move', p.x, p.y, e);
    });
    const up = (e) => { const p = pt(e); if (game.scene) game.scene.pointer('up', p.x, p.y, e); };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      if (game.scene) game.scene.pointer('wheel', e.clientX, e.clientY, e);
      e.preventDefault();
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 180));

    // keyboard shortcuts for desktop play
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const map = { '1': 'base', '2': 'merge', '3': 'crew', '4': 'mission', '5': 'tech', '6': 'deals' };
      if (map[e.key]) go(map[e.key]);
      if (e.key === 'Escape') go('base');
      if (e.key === 'm') { CM.ui.result(S.autoMerge(null)); }
      if (e.key === 'M') { CM.ui.result(S.fuseAll(null)); }   // shift+M: fuse everything
      if (e.key === 'o' || e.key === 'O') CM.ui.opsBoard();
    });

    // Persist when backgrounded, and pay out the gap on return: rAF is throttled
    // (often stopped outright) while hidden, so the main tick earns nothing there.
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); S.save(); return; }
      if (!hiddenAt) return;
      const away = (Date.now() - hiddenAt) / 1000;
      hiddenAt = 0;
      game.last = performance.now();          // stop a huge dt on the next frame
      const got = S.grantOffline(away);
      if (got && got.credits > 1) {
        CM.ui.toast('WELCOME BACK — +' + U.fmt(got.credits) + '¢ while away', 'gold');
      }
    });
    window.addEventListener('beforeunload', () => S.save());
    window.addEventListener('pagehide', () => S.save());
  }

  /* =============================================================== loop  */
  function frame(now) {
    if (!game.running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - game.last) / 1000 || 0);
    game.last = now;

    S.tick(dt);
    game.rain.update(dt);
    if (game.scene) game.scene._update(dt);

    const ctx = game.ctx;
    ctx.clearRect(0, 0, game.w, game.h);
    if (game.scene) game.scene.renderBack(ctx, game.w, game.h);
    if (S.s.settings.rain) game.rain.render(ctx);
    if (game.scene) game.scene.renderFront(ctx, game.w, game.h);
    game.rain.renderFlash(ctx);

    // brief white wash when switching scenes
    if (game.fade > 0) {
      game.fade = Math.max(0, game.fade - dt * 3.2);
      ctx.fillStyle = 'rgba(8,12,24,' + (game.fade * 0.8) + ')';
      ctx.fillRect(0, 0, game.w, game.h);
    }

    CM.ui.updateHUD();
  }

  /* =============================================================== boot  */
  function boot() {
    game.canvas = document.getElementById('world');
    game.ctx = game.canvas.getContext('2d');
    game.rain = new CM.Rain({ density: 1 });

    const offline = S.load();
    CM.audio.setEnabled(S.s.settings.sound);

    CM.ui.buildHUD();
    bindInput();
    resize();

    game.running = true;
    game.last = performance.now();
    requestAnimationFrame(frame);

    go('title');
    document.getElementById('boot').remove();

    // welcome-back report for offline earnings
    if (offline && offline.credits + offline.intel > 0) {
      setTimeout(() => {
        CM.ui.modal({
          title: 'WHILE YOU WERE GONE', accent: 'gold',
          body: '<p>The crew kept working for <b>' + U.fmtTime(offline.seconds) + '</b>.</p>' +
                '<p>Credits <b>+' + U.fmt(offline.credits) + '</b> · Intel <b>+' + U.fmt(offline.intel) +
                '</b> · Chips <b>+' + U.fmt(offline.chips) + '</b></p>' +
                '<p style="opacity:.7">Offline pays at half rate and banks up to ' + S.OFFLINE_CAP_H + ' hours.</p>',
          buttons: [{ label: 'GOOD', cls: 'gold' }]
        });
      }, 500);
    } else if (S.s.stats.playtime < 5) {
      setTimeout(CM.ui.help, 700);
    }
  }

  game.go = go;
  game.resize = resize;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return game;
})();
