/* ============================================================================
 * scenes/title.js — the neon title / hub screen.
 *
 * Canvas: rainy skyline, a glowing perspective grid running into the city,
 * the pixel-art CYBER MERGER logo and the big pixel hand pointing at CLICK.
 * DOM   : DEALS / CREW / MAP column, MISSIONS panel, REWARDS odometer + graph.
 * ========================================================================== */
(function () {
  'use strict';
  const U = CM.util, A = CM.art, h = CM.ui.h, S = CM.state;

  const Title = CM.Scene.extend(function Title() {
    CM.Scene.call(this, 'title', { hud: false });
    this.scroll = 0;
    this.pulse = 0;
    this.bars = [];
  });

  /* --------------------------------------------------------------- enter */
  Title.prototype.enter = function () {
    const self = this;
    this.scroll = 0;

    /* ---- left column: DEALS / CREW / MAP -------------------------------- */
    const navBtn = (label, iconEl, scene, accent) =>
      h('div.panel' + (accent ? '.' + accent : ''), {
        style: { padding: '8px 10px', display: 'flex', flexDirection: 'column',
                 alignItems: 'center', gap: '4px', cursor: 'inherit', minWidth: '86px' },
        onclick: () => { CM.audio.play('click'); CM.game.go(scene); }
      }, [
        h('div', { text: label, style: { fontSize: '12px', letterSpacing: '.16em' } }),
        iconEl
      ]);

    const icon = (src) => h('img', { src: src, style: { width: '44px', height: '44px', imageRendering: 'pixelated' } });

    this.add(h('div', {
      style: { position: 'absolute', left: 'clamp(6px,2vw,22px)', top: '38%',
               display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 3 }
    }, [
      navBtn('DEALS', icon(A.glyphURL('chip', '#ff3fa4', 64)), 'deals', 'magenta'),
      navBtn('CREW',  icon(A.itemIconURL('agent', 2, 96)), 'crew'),
      navBtn('MAP',   icon(A.glyphURL('node', '#24e2ff', 64)), 'base')
    ]));

    /* ---- right column: MISSIONS panel with animated dots ---------------- */
    this.dotEls = [];
    const clusters = [0, 1, 2].map((i) => {
      const grid = h('div.dots');
      const cells = [];
      for (let k = 0; k < 9; k++) { const d = h('i'); cells.push(d); grid.appendChild(d); }
      this.dotEls.push(cells);
      return grid;
    });
    this.missionMeter = h('i');
    this.add(h('div.panel.magenta', {
      style: { position: 'absolute', right: 'clamp(6px,2vw,22px)', top: '34%', padding: '10px 12px',
               display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', zIndex: 3,
               cursor: 'inherit' },
      onclick: () => { CM.audio.play('click'); CM.game.go('mission'); }
    }, [
      h('div', { text: 'MISSIONS', style: { fontSize: '12px', letterSpacing: '.16em' } })
    ].concat(clusters).concat([
      h('div.meter.seg', { style: { width: '76px' } }, [this.missionMeter])
    ])));

    /* ---- centre: the CLICK button --------------------------------------- */
    this.clickBtn = h('button.btn.notch.red', {
      text: 'CLICK',
      style: { fontSize: 'clamp(16px,4vw,26px)', padding: '14px 46px', letterSpacing: '.3em' },
      onclick: () => {
        CM.audio.unlock(); CM.audio.play('reward');
        S.s.seenTitle = true; S.save();
        CM.game.go('base');
      }
    });
    this.add(h('div', {
      style: { position: 'absolute', left: '50%', bottom: 'clamp(76px,14vh,120px)',
               transform: 'translateX(-50%)', zIndex: 4 }
    }, [this.clickBtn]));

    /* ---- bottom: REWARDS odometer --------------------------------------- */
    this.odo = h('div', {
      style: { fontSize: 'clamp(14px,3.4vw,26px)', letterSpacing: '.18em', color: '#f4f7ff',
               padding: '4px 10px', borderRadius: '6px', background: 'rgba(6,8,16,.9)',
               border: '1px solid rgba(255,75,87,.5)', boxShadow: '0 0 18px rgba(255,75,87,.35)' }
    });
    this.add(h('div', {
      style: { position: 'absolute', left: 'clamp(6px,3vw,26px)', bottom: '14px', zIndex: 4,
               display: 'flex', alignItems: 'center', gap: '10px' }
    }, [
      h('div', { text: 'REWARDS', style: { fontSize: 'clamp(12px,2.6vw,20px)', letterSpacing: '.14em' } }),
      this.odo
    ]));

    /* ---- corner: continue hint + reset ---------------------------------- */
    this.add(h('div', {
      style: { position: 'absolute', right: '10px', bottom: '12px', zIndex: 4, display: 'flex', gap: '8px' }
    }, [
      h('button.btn.sm.ghost', { text: 'HOW TO PLAY', onclick: () => { CM.audio.play('click'); CM.ui.help(); } })
    ]));

    /* seed the bottom-right bar graph with a rising curve */
    this.bars = [];
    for (let i = 0; i < 14; i++) this.bars.push(Math.pow(i / 13, 2.2));
    void self;
  };

  /* -------------------------------------------------------------- update */
  Title.prototype.update = function (dt) {
    this.scroll = (this.scroll + dt * 0.55) % 1;
    this.pulse += dt;

    // animated mission dots — a slow "radar sweep" through each cluster
    const t = this.time * 3;
    this.dotEls.forEach((cells, ci) => {
      cells.forEach((c, i) => {
        const on = ((i + ci * 3 + Math.floor(t)) % 9) < 4;
        c.classList.toggle('on', on);
      });
    });
    if (this.missionMeter) this.missionMeter.style.width = (40 + 60 * (0.5 + 0.5 * Math.sin(this.time * 1.6))) + '%';

    // odometer keeps ticking with idle income so the hub feels alive
    if (this.odo) this.odo.textContent = U.odometer(S.s.rewardsCounter, 13).split('').join(' ');
  };

  /* ------------------------------------------------------------- render */
  Title.prototype.renderBack = function (ctx, w, hgt) {
    // ---- city backdrop
    ctx.drawImage(A.skyline(w, hgt, 20260801), 0, 0);

    // ---- perspective grid corridor running into the city
    const vpX = w / 2, topY = hgt * 0.44, botY = hgt * 0.94;
    const topHalf = w * 0.055, botHalf = w * 0.42;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // floor wash
    const g = ctx.createLinearGradient(0, topY, 0, botY);
    g.addColorStop(0, 'rgba(40,70,190,.30)');
    g.addColorStop(.45, 'rgba(90,40,150,.22)');
    g.addColorStop(1, 'rgba(20,20,60,.05)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(vpX - topHalf, topY); ctx.lineTo(vpX + topHalf, topY);
    ctx.lineTo(vpX + botHalf, botY); ctx.lineTo(vpX - botHalf, botY);
    ctx.closePath(); ctx.fill();

    // glowing pool at the vanishing point
    const pool = ctx.createRadialGradient(vpX, topY + hgt * .04, 2, vpX, topY + hgt * .04, w * .16);
    pool.addColorStop(0, 'rgba(120,220,255,.55)'); pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pool; ctx.fillRect(0, 0, w, hgt);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,80,140,.55)';
    ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = 12; ctx.lineWidth = 1.4;
    // horizontal rungs, spaced by a perspective curve and scrolling toward us
    for (let i = 0; i < 16; i++) {
      const k = (i + this.scroll) / 16;
      const p = Math.pow(k, 2.1);                       // perspective compression
      const y = U.lerp(topY, botY, p);
      const half = U.lerp(topHalf, botHalf, p);
      ctx.globalAlpha = 0.25 + 0.7 * p;
      ctx.beginPath(); ctx.moveTo(vpX - half, y); ctx.lineTo(vpX + half, y); ctx.stroke();
    }
    // converging rails
    ctx.globalAlpha = .75;
    for (let c = -6; c <= 6; c++) {
      ctx.beginPath();
      ctx.moveTo(vpX + topHalf * (c / 6), topY);
      ctx.lineTo(vpX + botHalf * (c / 6), botY);
      ctx.stroke();
    }
    ctx.restore();
  };

  Title.prototype.renderFront = function (ctx, w, hgt) {
    /* ---- pixel logo ------------------------------------------------- */
    const maxW = Math.min(w * 0.74, 620);
    const scale = Math.max(2, Math.floor(Math.min(maxW / A.textWidth('MERGER', 1), hgt * 0.105 / 7)));
    const y1 = hgt * 0.055, y2 = y1 + 8 * scale;
    const wobble = Math.sin(this.pulse * 1.7) * 2;

    A.text(ctx, 'CYBER',  w / 2, y1, scale, { align: 'center', color: '#ffe9c9', glow: 26 + wobble, glowColor: '#ff3c2f', shadow: true });
    A.text(ctx, 'MERGER', w / 2, y2, scale, { align: 'center', color: '#ffe9c9', glow: 26 + wobble, glowColor: '#ff3c2f', shadow: true });

    const sub = Math.max(1, Math.min(Math.floor(scale * 0.30), Math.floor(w * 0.60 / A.textWidth('IDLE MERGER SIMULATOR', 1))));
    A.text(ctx, 'IDLE MERGER SIMULATOR', w / 2, y2 + 9 * scale, sub,
      { align: 'center', color: '#9ff0ff', glow: 12, glowColor: '#24e2ff' });

    /* ---- big pixel hand cursor pointing at the CLICK button ---------- */
    const hx = w * 0.12, hy = hgt - 108 + Math.sin(this.pulse * 2.4) * 6;
    drawHand(ctx, hx, hy, Math.max(2, Math.floor(w / 220)));

    /* ---- bottom-right bar graph ------------------------------------- */
    const bw = Math.min(w * 0.42, 260), bh = Math.min(hgt * 0.16, 110);
    const bx = w - bw - 12, by = hgt - bh - 44;
    ctx.save();
    ctx.shadowColor = '#ff4b57'; ctx.shadowBlur = 12;
    this.bars.forEach((v, i) => {
      const barW = bw / this.bars.length * 0.62;
      const gap = bw / this.bars.length;
      const anim = U.clamp(v + Math.sin(this.pulse * 2 + i * .5) * 0.02, 0.02, 1);
      ctx.fillStyle = i > this.bars.length - 4 ? '#ff6b74' : '#e33b46';
      ctx.fillRect(bx + i * gap, by + bh - anim * bh, barW, anim * bh);
    });
    ctx.restore();
  };

  /** Chunky white pixel hand (index finger up) — the reference's mascot. */
  function drawHand(ctx, x, y, s) {
    const rows = [
      '..XX........',
      '.X..X.......',
      '.X..X.XX....',
      '.X..X.X.X...',
      '.X..XXX.X.X.',
      '.X......X.X.',
      '.X........X.',
      '..X.......X.',
      '..X.......X.',
      '...X.....X..',
      '....XXXXX...'
    ];
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,.65)'; ctx.shadowBlur = 14;
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== 'X') continue;
      ctx.fillStyle = '#0a0d16'; ctx.fillRect(x + c * s + s, y + r * s + s, s, s);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + c * s, y + r * s, s, s);
    }
    ctx.restore();
  }

  CM.scenes = CM.scenes || {};
  CM.scenes.title = new Title();
})();
