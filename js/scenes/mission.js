/* ============================================================================
 * scenes/mission.js — HIT MISSIONS.
 *
 * Two modes in one scene:
 *   select  — pick a contract, see the threat rating vs your squad rating
 *   combat  — turn-based fight: every round you choose STRIKE / OVERCLOCK /
 *             PATCH / SMOKE / BAIL, then the enemy answers.
 *
 * The squad is built from your merged stash: assigned agents fight, your best
 * weapon adds team damage and your best vehicle adds team HP.
 * ========================================================================== */
(function () {
  'use strict';
  const U = CM.util, A = CM.art, h = CM.ui.h, S = CM.state, M = CM.MISSIONS, ITEMS = CM.ITEMS;

  const Mission = CM.Scene.extend(function Mission() {
    CM.Scene.call(this, 'mission');
    this.mode = 'select';
    this.fight = null;
    this.auto = false;
    this.busy = false;
    this.timers = [];
  });

  /* ================================================================ enter */
  Mission.prototype.enter = function (params) {
    this.mode = 'select';
    this.fight = null;
    this.busy = false;
    this.buildSelect();
    if (params && params.contract) this.launch(params.contract);
  };
  Mission.prototype.exit = function () { this.clearTimers(); };
  Mission.prototype.clearTimers = function () { this.timers.forEach(clearTimeout); this.timers.length = 0; };
  Mission.prototype.after = function (ms, fn) { this.timers.push(setTimeout(fn, ms)); };

  /* ============================================================== SELECT */
  Mission.prototype.buildSelect = function () {
    const self = this;
    CM.ui.clear(this.root);
    this.add(this.backButton('base'));

    const rating = this.squadRating();
    const head = h('div', {
      style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)',
               top: 'calc(var(--hud-h) + 6px)', fontSize: '11px', letterSpacing: '.14em',
               color: '#9ff0ff', whiteSpace: 'nowrap', textShadow: '0 0 10px rgba(36,226,255,.7)' },
      text: 'SQUAD RATING ' + U.fmt(rating.score) + '   ·   HP ' + U.fmt(rating.hp) + '   ·   DMG ' + U.fmt(rating.atk) + '/RND'
    });
    this.add(head);

    const list = h('div', {
      style: { position: 'absolute', inset: 'calc(var(--hud-h) + 30px) clamp(8px,4vw,60px) calc(var(--bar-h) + 6px)',
               overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '10px' }
    });
    this.add(list);

    M.CONTRACTS.forEach((c) => {
      const locked = !S.missionUnlocked(c);
      const threat = self.threatOf(c);
      const odds = rating.score / Math.max(1, threat);
      const oddsTxt = odds > 1.8 ? 'EASY' : odds > 1.1 ? 'FAVOURED' : odds > 0.75 ? 'RISKY' : 'SUICIDE';
      const oddsCol = odds > 1.8 ? '#49ff9b' : odds > 1.1 ? '#a8ff8f' : odds > 0.75 ? '#ffb020' : '#ff4b57';
      const done = S.s.missions.done[c.id] || 0;

      const foeIcons = h('div', { style: { display: 'flex', gap: '3px' } },
        c.foes.map((fid) => {
          const f = M.foe(fid);
          return h('img', { src: A.itemIconURL(f.kind, U.clamp(c.tier, 1, 8), 96), title: f.name,
            style: { width: '26px', height: '26px', imageRendering: 'pixelated', filter: 'hue-rotate(' + (fid.length * 27) + 'deg)' } });
        }));

      const card = h('div.panel' + (locked ? '' : c.tier > 5 ? '.magenta' : c.tier > 2 ? '.gold' : ''), {
        style: { padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'center',
                 opacity: locked ? .45 : 1, cursor: 'inherit' },
        onclick: () => {
          if (locked) { CM.ui.toast('REACH LEVEL ' + c.lvl + ' TO UNLOCK', 'bad'); CM.audio.play('error'); return; }
          self.launch(c.id);
        }
      }, [
        h('div', { style: { flex: '1 1 auto', minWidth: 0 } }, [
          h('div', { text: c.name + (done ? '  ×' + done : ''), style: { fontSize: '12px', letterSpacing: '.14em', color: '#eaf6ff' } }),
          h('div', { text: c.district + ' · T' + c.tier + (locked ? ' · LOCKED (LVL ' + c.lvl + ')' : ''),
                     style: { fontSize: '10px', color: '#7d8bb0', margin: '3px 0' } }),
          h('div', { text: c.blurb, style: { fontSize: '10px', color: '#5f6d92', lineHeight: '1.5' } }),
          h('div', { style: { display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap', fontSize: '10px' } }, [
            h('span', { text: '⚡' + c.energy, style: { color: '#24e2ff' } }),
            h('span', { text: '¢' + U.fmt(c.reward.credits), style: { color: '#ffb020' } }),
            h('span', { text: '◈' + U.fmt(c.reward.intel), style: { color: '#7fe6ff' } }),
            h('span', { text: '✦' + U.fmt(c.reward.chips), style: { color: '#ff8fd0' } }),
            h('span', { text: oddsTxt, style: { color: oddsCol, letterSpacing: '.12em' } })
          ])
        ]),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' } }, [
          foeIcons,
          h('div', { text: 'THREAT ' + U.fmt(threat), style: { fontSize: '10px', color: '#7d8bb0' } })
        ])
      ]);
      list.appendChild(card);
    });

    const bar = h('div.actionbar');
    bar.appendChild(CM.ui.actionBtn('MANAGE SQUAD', 'CREW', 'magenta', () => CM.game.go('crew')));
    bar.appendChild(CM.ui.actionBtn('GEAR UP', 'STASH', '', () => CM.game.go('merge')));
    bar.appendChild(CM.ui.actionBtn('RETURN', 'BASE', 'ghost', () => CM.game.go('base')));
    this.add(bar);
  };

  /* --------------------------------------------------------- power maths */
  /** Aggregate the squad's HP / damage from stash + tech multipliers. */
  Mission.prototype.squadRating = function () {
    const m = S.mult();
    const agents = S.squadItems();
    const weapon = S.bestOf('weapon'), vehicle = S.bestOf('vehicle');
    let hp = 0, atk = 0;
    agents.forEach((a) => { const p = ITEMS.power(a); hp += p.hp; atk += p.atk; });
    if (vehicle) hp += ITEMS.power(vehicle).hp;
    if (weapon)  atk += ITEMS.power(weapon).atk;
    hp = Math.round(hp * m.toughness);
    atk = Math.round(atk * m.damage);
    return { hp: hp, atk: atk, score: Math.round(hp * .35 + atk * 2.4), agents: agents, weapon: weapon, vehicle: vehicle };
  };
  Mission.prototype.threatOf = function (c) {
    let hp = 0, atk = 0;
    c.foes.forEach((fid) => { const f = M.foe(fid); hp += c.power * f.hp; atk += c.power * f.atk * 0.10; });
    return Math.round(hp * .35 + atk * 2.4);
  };

  /* ============================================================== LAUNCH */
  Mission.prototype.launch = function (contractId) {
    const c = M.CONTRACTS.find((x) => x.id === contractId);
    if (!c) return;
    if (!S.missionUnlocked(c)) { CM.ui.toast('LOCKED', 'bad'); return; }
    if (S.s.energy < c.energy) { CM.ui.toast('NEED ⚡' + c.energy + ' ENERGY', 'bad'); CM.audio.play('error'); return; }
    const r = this.squadRating();
    if (!r.agents.length) { CM.ui.toast('NO CREW — craft an agent in the STASH', 'bad'); CM.audio.play('error'); return; }

    S.s.energy -= c.energy;
    CM.bus.emit('state');
    CM.audio.play('launch');
    this.clearTimers();
    this.busy = false;

    /* ---- build fighters ------------------------------------------------ */
    const m = S.mult();
    const vehHP = r.vehicle ? ITEMS.power(r.vehicle).hp : 0;
    const wpnATK = r.weapon ? ITEMS.power(r.weapon).atk : 0;
    const shareHP = vehHP / r.agents.length, shareATK = wpnATK / r.agents.length;

    const squad = r.agents.map((a) => {
      const p = ITEMS.power(a);
      const hp = Math.round((p.hp + shareHP) * m.toughness);
      return {
        id: a.id, side: 'p', name: ITEMS.name(a), kind: 'agent', tier: a.tier,
        hp: hp, maxHp: hp, atk: Math.round((p.atk + shareATK) * m.damage), alive: true
      };
    });
    const foes = c.foes.map((fid, i) => {
      const f = M.foe(fid);
      const hp = Math.round(c.power * f.hp);
      return {
        id: 'e' + i, side: 'e', name: f.name, kind: f.kind, color: f.color, tier: U.clamp(c.tier, 1, 8),
        hp: hp, maxHp: hp, atk: Math.round(c.power * f.atk * 0.10), alive: true
      };
    });

    this.fight = {
      c: c, squad: squad, foes: foes, round: 1, cds: {}, over: false,
      overclock: false, smoke: false, log: []
    };
    this.mode = 'combat';
    this.buildCombat();
    this.push('<b>' + c.name + '</b> — ' + c.district + '. ' + c.blurb);
    this.push('Squad deployed: ' + squad.map((s) => s.name).join(', ') +
      (r.weapon ? ' · ' + ITEMS.name(r.weapon) : '') + (r.vehicle ? ' · ' + ITEMS.name(r.vehicle) : ''));
  };

  /* ============================================================= COMBAT  */
  Mission.prototype.buildCombat = function () {
    const self = this, f = this.fight;
    CM.ui.clear(this.root);

    const wrap = h('div.combat');
    this.roundEl = h('div', {
      style: { textAlign: 'center', fontSize: '11px', letterSpacing: '.2em', color: '#ffb020',
               textShadow: '0 0 10px rgba(255,176,32,.7)' }
    });
    wrap.appendChild(this.roundEl);

    const mkSide = (units, align) => {
      const col = h('div.side');
      units.forEach((u) => {
        u.hpBar = h('i');
        u.el = h('div.fighter', { style: align === 'right' ? { flexDirection: 'row-reverse', textAlign: 'right' } : null }, [
          h('img', { src: A.itemIconURL(u.kind, u.tier, 96),
                     // enemies get a hostile colour shift so the two sides never look alike
                     style: u.side === 'e' ? { filter: 'hue-rotate(' + hueOf(u.color) + 'deg) saturate(1.7) contrast(1.15)' } : null }),
          h('div.grow', null, [
            h('div.nm', { text: u.name }),
            h('div.meter.hp', null, [u.hpBar]),
            u.hpText = h('div', { style: { fontSize: '9px', color: '#7d8bb0', marginTop: '2px' } })
          ])
        ]);
        col.appendChild(u.el);
      });
      return col;
    };
    this.fightersEl = h('div.fighters', null, [mkSide(f.squad, 'left'), mkSide(f.foes, 'right')]);
    wrap.appendChild(this.fightersEl);

    this.logEl = h('div.log');
    wrap.appendChild(this.logEl);
    this.add(wrap);

    /* ---- ability bar --------------------------------------------------- */
    const bar = h('div.actionbar');
    this.abilityBtns = {};
    M.ABILITIES.forEach((ab) => {
      const btn = h('button.btn.notch', {
        text: ab.name,
        title: ab.desc + (ab.energy ? ' (⚡' + ab.energy + ')' : ''),
        style: { width: '100%', borderColor: U.rgba(ab.color, .6), color: '#fff',
                 background: 'linear-gradient(180deg,' + U.rgba(ab.color, .24) + ',' + U.rgba(ab.color, .06) + ')',
                 textShadow: '0 0 8px ' + U.rgba(ab.color, .8) },
        onclick: () => self.useAbility(ab.id)
      });
      this.abilityBtns[ab.id] = btn;
      bar.appendChild(h('div.act', null, [
        h('div.cap', { text: ab.energy ? '⚡' + ab.energy : 'FREE' }),
        btn
      ]));
    });
    this.autoBtn = h('button.btn.notch.ghost', {
      text: this.auto ? 'AUTO ON' : 'AUTO',
      onclick: () => {
        self.auto = !self.auto;
        self.autoBtn.textContent = self.auto ? 'AUTO ON' : 'AUTO';
        CM.audio.play('click');
        if (self.auto && !self.busy && !self.fight.over) self.useAbility('strike');
      }
    });
    bar.appendChild(h('div.act', null, [h('div.cap', { text: 'HANDS OFF' }), this.autoBtn]));
    this.add(bar);

    this.refreshCombat();
  };

  Mission.prototype.refreshCombat = function () {
    const f = this.fight; if (!f) return;
    this.roundEl.textContent = 'ROUND ' + f.round + '   ·   ' + f.c.name +
      (f.overclock ? '   ·   OVERCLOCKED' : '') + (f.smoke ? '   ·   SMOKED' : '');
    [].concat(f.squad, f.foes).forEach((u) => {
      const pct = U.clamp(u.hp / u.maxHp, 0, 1);
      u.hpBar.style.width = (pct * 100) + '%';
      u.hpBar.parentNode.classList.toggle('low', pct < .35);
      u.hpText.textContent = Math.max(0, Math.round(u.hp)) + ' / ' + u.maxHp + '  ·  ' + U.fmt(u.atk) + ' dmg';
      u.el.classList.toggle('dead', !u.alive);
    });
    for (const id in this.abilityBtns) {
      const ab = M.ABILITIES.find((a) => a.id === id);
      const cd = f.cds[id] || 0;
      const poor = ab.energy > S.s.energy;
      const btn = this.abilityBtns[id];
      btn.classList.toggle('locked', f.over || this.busy || cd > 0 || poor);
      btn.textContent = cd > 0 ? ab.name + ' ' + cd : ab.name;
    }
  };

  Mission.prototype.push = function (html) {
    if (!this.logEl) return;
    this.logEl.appendChild(h('div', { html: html }));
    this.logEl.scrollTop = this.logEl.scrollHeight;
    while (this.logEl.children.length > 120) this.logEl.firstChild.remove();
  };

  const aliveOf = (arr) => arr.filter((u) => u.alive);

  /** Cheap deterministic hue shift derived from a foe's palette colour. */
  function hueOf(hex) {
    let n = 0; (hex || '#f00').split('').forEach((c) => { n = (n * 31 + c.charCodeAt(0)) % 360; });
    return n;
  }

  /* ---------------------------------------------------------- the round */
  Mission.prototype.useAbility = function (id) {
    const f = this.fight;
    if (!f || f.over || this.busy) return;
    const ab = M.ABILITIES.find((a) => a.id === id);
    if ((f.cds[id] || 0) > 0) return;
    if (ab.energy > S.s.energy) { CM.ui.toast('NOT ENOUGH ENERGY', 'bad'); CM.audio.play('error'); return; }

    if (id === 'retreat') {
      S.grant({ energy: Math.round(f.c.energy * 0.5) });
      this.push('<span class="dmg">You bail out through the service tunnels.</span>');
      this.finish(false, true);
      return;
    }

    if (ab.energy) { S.s.energy -= ab.energy; CM.bus.emit('state'); }
    if (ab.cd) f.cds[id] = ab.cd + 1;     // +1 because it ticks down at round end
    this.busy = true;

    if (id === 'overclock') { f.overclock = true; this.push('<b>OVERCLOCK</b> — coolant dumped, weapons screaming.'); CM.audio.play('reward'); }
    if (id === 'smoke')     { f.smoke = true;     this.push('<b>SMOKE</b> — the block vanishes in white haze.'); CM.audio.play('build'); }
    if (id === 'patch') {
      let healed = 0;
      f.squad.forEach((u) => {
        if (!u.alive) return;
        const amt = Math.round(u.maxHp * 0.30);
        const real = Math.min(amt, u.maxHp - u.hp);
        u.hp += real; healed += real;
      });
      this.push('<span class="heal">PATCH — squad recovers ' + U.fmt(healed) + ' HP.</span>');
      CM.audio.play('heal');
    }
    this.refreshCombat();
    this.after(220, () => this.playerTurn());
  };

  Mission.prototype.playerTurn = function () {
    const f = this.fight;
    const mine = aliveOf(f.squad), foes = aliveOf(f.foes);
    if (!foes.length) return this.finish(true);
    let i = 0;
    const step = () => {
      if (i >= mine.length) { this.after(240, () => this.enemyTurn()); return; }
      const u = mine[i++];
      const live = aliveOf(f.foes);
      if (!live.length) return this.finish(true);
      // focus the weakest enemy so fights resolve cleanly
      const target = live.sort((a, b) => a.hp - b.hp)[0];
      const mul = (f.overclock ? 2.2 : 1) * U.rand(0.88, 1.14);
      const dmg = Math.max(1, Math.round(u.atk * mul));
      target.hp -= dmg;
      u.el.classList.add('act');
      target.el.classList.add('hit');
      CM.audio.play('hit');
      this.push(u.name + ' hits <b>' + target.name + '</b> for <span class="dmg">' + U.fmt(dmg) + '</span>');
      if (target.hp <= 0) { target.alive = false; target.hp = 0; this.push('<span class="win">' + target.name + ' is down.</span>'); }
      this.refreshCombat();
      this.after(170, () => { u.el.classList.remove('act'); target.el.classList.remove('hit'); });
      this.after(260, step);
    };
    step();
  };

  Mission.prototype.enemyTurn = function () {
    const f = this.fight;
    if (aliveOf(f.foes).length === 0) return this.finish(true);
    if (f.smoke) {
      this.push('<span class="heal">The smoke holds — they fire blind and hit nothing.</span>');
      this.after(320, () => this.endRound());
      return;
    }
    const foes = aliveOf(f.foes);
    let i = 0;
    const step = () => {
      if (i >= foes.length) { this.after(220, () => this.endRound()); return; }
      const u = foes[i++];
      const mine = aliveOf(f.squad);
      if (!mine.length) return this.finish(false);
      const target = U.choice(mine);
      const dmg = Math.max(1, Math.round(u.atk * U.rand(0.85, 1.18)));
      target.hp -= dmg;
      u.el.classList.add('act'); target.el.classList.add('hit');
      CM.audio.play('hit');
      this.push('<b>' + u.name + '</b> hits ' + target.name + ' for <span class="dmg">' + U.fmt(dmg) + '</span>');
      if (target.hp <= 0) { target.alive = false; target.hp = 0; this.push('<span class="dmg">' + target.name + ' is down!</span>'); }
      this.refreshCombat();
      this.after(160, () => { u.el.classList.remove('act'); target.el.classList.remove('hit'); });
      this.after(250, step);
    };
    step();
  };

  Mission.prototype.endRound = function () {
    const f = this.fight;
    if (!aliveOf(f.squad).length) return this.finish(false);
    if (!aliveOf(f.foes).length) return this.finish(true);
    f.overclock = false; f.smoke = false;
    for (const k in f.cds) if (f.cds[k] > 0) f.cds[k]--;
    f.round++;
    if (f.round > 40) { this.push('The heat arrives. Everyone scatters.'); return this.finish(false); }
    this.busy = false;
    this.refreshCombat();
    if (this.auto) this.after(360, () => { if (!this.fight.over) this.useAbility(this.pickAuto()); });
  };

  /** Simple auto-battler brain: heal when hurt, overclock when it pays. */
  Mission.prototype.pickAuto = function () {
    const f = this.fight;
    const mine = aliveOf(f.squad);
    const hpPct = U.sum(mine, (u) => u.hp) / Math.max(1, U.sum(f.squad, (u) => u.maxHp));
    if (hpPct < .45 && !(f.cds.patch > 0) && S.s.energy >= 8) return 'patch';
    if (hpPct < .30 && !(f.cds.smoke > 0) && S.s.energy >= 10) return 'smoke';
    if (!(f.cds.overclock > 0) && S.s.energy >= 6) return 'overclock';
    return 'strike';
  };

  /* --------------------------------------------------------------- end  */
  Mission.prototype.finish = function (won, bailed) {
    const f = this.fight;
    if (f.over) return;
    f.over = true; this.busy = true;
    this.clearTimers();
    this.refreshCombat();

    const c = f.c;
    let payout = null;
    if (won) {
      const m = S.mult();
      const streakBonus = 1 + Math.min(0.5, S.s.missions.streak * 0.05);
      payout = {
        credits: Math.round(c.reward.credits * m.loot * streakBonus),
        intel:   Math.round(c.reward.intel   * m.loot * streakBonus),
        chips:   Math.round(c.reward.chips   * m.chips * streakBonus),
        xp:      c.reward.xp
      };
      CM.audio.play('reward');
    }
    S.recordMission(c, won, payout);

    // a clean run can drop a blueprint: a free item near your current tier
    let drop = null;
    if (won && U.chance(0.45)) {
      const kind = U.choice(ITEMS.KINDS);
      const tier = U.clamp(Math.min(c.tier, S.tierCap(kind)), 1, ITEMS.MAX_TIER);
      drop = S.addItem(kind, tier);
    }

    const body = h('div', null, [
      h('p', { text: won ? 'The block is yours. Payout wired to the crew account.'
                         : bailed ? 'You pulled out before it got worse. Half the energy came back.'
                                  : 'The squad is broken and scattered. No payout.' }),
      won ? h('p', { html: 'Credits <b>+' + U.fmt(payout.credits) + '</b> · Intel <b>+' + U.fmt(payout.intel) +
                            '</b> · Chips <b>+' + U.fmt(payout.chips) + '</b> · XP <b>+' + payout.xp + '</b>' }) : null,
      won ? h('p', { html: 'Win streak <b>' + S.s.missions.streak + '</b> (+' +
                            Math.round(Math.min(50, S.s.missions.streak * 5)) + '% loot)' }) : null,
      drop ? h('p', { html: '<b>BLUEPRINT RECOVERED:</b> ' + ITEMS.name(drop) }) : null
    ]);

    const self = this;
    CM.ui.modal({
      title: won ? 'CONTRACT CLEARED' : bailed ? 'PULLED OUT' : 'CONTRACT FAILED',
      accent: won ? 'gold' : 'magenta',
      bodyEl: body, dismissable: false,
      buttons: [
        { label: 'RUN AGAIN', cls: 'gold', onClick: () => { self.mode = 'select'; self.buildSelect(); self.after(60, () => self.launch(c.id)); } },
        { label: 'CONTRACTS', onClick: () => { self.mode = 'select'; self.busy = false; self.buildSelect(); } },
        { label: 'BASE', cls: 'ghost', onClick: () => CM.game.go('base') }
      ]
    });
  };

  /* ------------------------------------------------------------- canvas  */
  Mission.prototype.renderBack = function (ctx, w, hgt) {
    ctx.drawImage(A.skyline(w, hgt, 20260801), 0, 0);
    ctx.fillStyle = this.mode === 'combat' ? 'rgba(10,2,6,.68)' : 'rgba(4,6,14,.60)';
    ctx.fillRect(0, 0, w, hgt);
    if (this.mode === 'combat') {
      // red alert vignette pulsing with the fight
      const p = 0.10 + 0.06 * Math.sin(this.time * 3);
      const g = ctx.createRadialGradient(w / 2, hgt / 2, Math.min(w, hgt) * .2, w / 2, hgt / 2, Math.max(w, hgt) * .7);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,40,60,' + p + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
    }
  };

  CM.scenes = CM.scenes || {};
  CM.scenes.mission = new Mission();
})();
