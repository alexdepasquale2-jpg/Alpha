/* ============================================================================
 * scenes/deals.js — SHADY DEALS: the black-market shop + a quick crate game.
 *
 * Offers reroll on a timer (or instantly for credits). Stock scales with your
 * level and your unlocked tier caps, so the shop stays relevant all game.
 * ========================================================================== */
(function () {
  'use strict';
  const U = CM.util, A = CM.art, h = CM.ui.h, S = CM.state, ITEMS = CM.ITEMS;

  const REFRESH_MS = 3 * 60 * 1000;

  const Deals = CM.Scene.extend(function Deals() {
    CM.Scene.call(this, 'deals');
  });

  /* ============================================================ generate */
  /** Roll a fresh set of offers sized by the dealSlots tech bonus. */
  function roll() {
    const d = S.s.deals;
    d.offers = [];
    d.rerolls = 0;
    d.refreshAt = Date.now() + REFRESH_MS;
    const n = S.dealSlots();
    for (let i = 0; i < n; i++) d.offers.push(makeOffer(i));
    S.save();
  }

  function makeOffer(i) {
    const lvl = S.s.level;
    const r = Math.random();
    const base = 140 * Math.pow(1.55, lvl * 0.55);

    // 1) hardware — an item at or just under your current cap
    if (r < 0.42 || i === 0) {
      const kind = U.choice(ITEMS.KINDS);
      const cap = S.tierCap(kind);
      const tier = U.clamp(U.randInt(Math.max(1, cap - 2), cap), 1, ITEMS.MAX_TIER);
      const mult = Math.pow(2.15, tier - 1);
      return {
        id: U.uid('of'), type: 'item', kind: kind, tier: tier,
        label: ITEMS.name({ kind: kind, tier: tier, plus: 0 }),
        desc: ITEMS.CHAINS[kind].role + ' · tier ' + tier,
        cost: { credits: Math.round(base * mult * U.rand(.8, 1.3)) },
        rarity: tier >= 5 ? 'gold' : tier >= 3 ? '' : 'ghost'
      };
    }
    // 2) a timed income boost
    if (r < 0.62) {
      const kinds = [
        { k: 'credits', label: 'HOT WIRE', m: 2.0, s: 300, col: 'gold' },
        { k: 'intel',   label: 'WIRETAP',  m: 2.5, s: 300, col: '' },
        { k: 'chips',   label: 'PART RUN', m: 3.0, s: 240, col: 'magenta' }
      ];
      const b = U.choice(kinds);
      const mm = {}; mm[b.k] = b.m;
      return {
        id: U.uid('of'), type: 'boost', label: b.label + ' ×' + b.m,
        desc: b.k.toUpperCase() + ' income ×' + b.m + ' for ' + U.fmtTime(b.s),
        boost: { mult: mm, seconds: b.s },
        cost: { credits: Math.round(base * 2.2 * U.rand(.9, 1.2)) },
        rarity: b.col
      };
    }
    // 3) merge chips in bulk
    if (r < 0.78) {
      const amt = Math.max(3, Math.round(4 * Math.pow(1.5, lvl * 0.4) * U.rand(.8, 1.4)));
      return {
        id: U.uid('of'), type: 'chips', label: 'CHIP CACHE ×' + U.fmt(amt),
        desc: 'Merge chips — spend them refining items.',
        chips: amt, cost: { credits: Math.round(base * 3.0 * U.rand(.85, 1.25)) },
        rarity: 'magenta'
      };
    }
    // 4) intel dump bought with credits
    if (r < 0.9) {
      const amt = Math.max(6, Math.round(9 * Math.pow(1.45, lvl * 0.45) * U.rand(.8, 1.4)));
      return {
        id: U.uid('of'), type: 'intel', label: 'DATA DUMP ×' + U.fmt(amt),
        desc: 'Raw intel — the currency of research.',
        intel: amt, cost: { credits: Math.round(base * 2.6 * U.rand(.85, 1.25)) },
        rarity: ''
      };
    }
    // 5) energy top-up bought with intel
    const amt = Math.round(S.energyMax() * 0.6);
    return {
      id: U.uid('of'), type: 'energy', label: 'STIM PACK ⚡' + amt,
      desc: 'Instant energy for back-to-back hit missions.',
      energy: amt, cost: { intel: Math.max(4, Math.round(6 * Math.pow(1.4, lvl * 0.4))) },
      rarity: 'gold'
    };
  }

  /* =============================================================== enter */
  Deals.prototype.enter = function () {
    const self = this;
    if (!S.s.deals.offers.length || Date.now() > S.s.deals.refreshAt) roll();

    this.add(this.backButton('base'));

    this.timerEl = h('div', {
      style: { position: 'absolute', left: '50%', transform: 'translateX(-50%)',
               top: 'calc(var(--hud-h) + 6px)', fontSize: '11px', letterSpacing: '.14em', color: '#ff8fd0',
               whiteSpace: 'nowrap', textShadow: '0 0 10px rgba(255,63,164,.7)' }
    });
    this.add(this.timerEl);

    this.list = h('div', {
      style: { position: 'absolute', inset: 'calc(var(--hud-h) + 30px) clamp(8px,4vw,60px) calc(var(--bar-h) + 6px)',
               overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '10px' }
    });
    this.add(this.list);

    const bar = h('div.actionbar');
    bar.appendChild(CM.ui.actionBtn('NEW STOCK', 'REROLL', 'magenta', () => self.reroll()));
    bar.appendChild(CM.ui.actionBtn('BACK ALLEY', 'CRACK A CRATE', 'gold', () => self.crateGame()));
    bar.appendChild(CM.ui.actionBtn('RETURN', 'BASE', 'ghost', () => CM.game.go('base')));
    this.add(bar);

    this.listen('state', () => self.rebuild());
    this.rebuild();
  };

  Deals.prototype.update = function () {
    if (!this.timerEl) return;
    const left = Math.max(0, S.s.deals.refreshAt - Date.now()) / 1000;
    if (left <= 0) { roll(); this.rebuild(); }
    this.timerEl.textContent = 'SHADY DEALS  ·  NEW STOCK IN ' + U.fmtTime(left);
  };

  /* ============================================================== render */
  Deals.prototype.rebuild = function () {
    const self = this;
    CM.ui.clear(this.list);
    S.s.deals.offers.forEach((o) => {
      const afford = S.can(o.cost);
      const icon = o.type === 'item'
        ? h('img', { src: A.itemIconURL(o.kind, o.tier, 96), style: { width: '44px', height: '44px', imageRendering: 'pixelated' } })
        : h('img', { src: A.glyphURL(o.type === 'boost' ? 'bolt' : o.type === 'chips' ? 'chip' : o.type === 'energy' ? 'vault' : 'den',
                     o.rarity === 'gold' ? '#ffb020' : o.rarity === 'magenta' ? '#ff3fa4' : '#24e2ff', 64),
                     style: { width: '44px', height: '44px' } });

      const card = h('div.panel' + (o.rarity && o.rarity !== 'ghost' ? '.' + o.rarity : ''), {
        style: { padding: '10px 12px', display: 'flex', gap: '12px', alignItems: 'center',
                 opacity: o.sold ? .35 : 1, cursor: 'inherit' },
        onclick: () => self.buy(o)
      }, [
        icon,
        h('div', { style: { flex: '1 1 auto', minWidth: 0 } }, [
          h('div', { text: o.label, style: { fontSize: '12px', letterSpacing: '.12em', color: '#eaf6ff' } }),
          h('div', { text: o.desc, style: { fontSize: '10px', color: '#7d8bb0', marginTop: '3px' } })
        ]),
        h('button.btn.sm' + (afford && !o.sold ? '.gold' : '.ghost'), {
          text: o.sold ? 'SOLD' : S.costText(o.cost)
        })
      ]);
      self.list.appendChild(card);
    });

    const cost = rerollCost();
    this.list.appendChild(h('div.tiny', {
      style: { textAlign: 'center', padding: '6px' },
      text: 'REROLL COSTS ' + U.fmt(cost) + '¢  ·  DEAL SLOTS ' + S.dealSlots() + ' (raise with BLACK MARKET tech)'
    }));
  };

  const rerollCost = () => Math.round(120 * Math.pow(1.9, S.s.deals.rerolls) * Math.pow(1.35, S.s.level - 1));

  Deals.prototype.reroll = function () {
    const cost = { credits: rerollCost() };
    if (!S.pay(cost)) { CM.ui.toast('NEED ' + S.costText(cost), 'bad'); CM.audio.play('error'); return; }
    const rr = S.s.deals.rerolls + 1;
    roll();
    S.s.deals.rerolls = rr;
    CM.audio.play('build');
    this.rebuild();
  };

  /* ================================================================= buy */
  Deals.prototype.buy = function (o) {
    if (o.sold) return;
    if (!S.can(o.cost)) { CM.ui.toast('NEED ' + S.costText(o.cost), 'bad'); CM.audio.play('error'); return; }
    if (o.type === 'item' && S.s.inv.length >= S.invSlots()) {
      CM.ui.toast('STASH FULL', 'bad'); CM.audio.play('error'); return;
    }
    S.pay(o.cost);
    o.sold = true;

    switch (o.type) {
      case 'item':   S.addItem(o.kind, o.tier); CM.ui.toast('ACQUIRED ' + o.label, 'good'); break;
      case 'boost':  S.addBoost(o.label, o.boost.mult, o.boost.seconds); CM.ui.toast(o.label + ' ACTIVE', 'gold'); break;
      case 'chips':  S.grant({ chips: o.chips }); CM.ui.toast('+' + U.fmt(o.chips) + ' CHIPS', 'good'); break;
      case 'intel':  S.grant({ intel: o.intel }); CM.ui.toast('+' + U.fmt(o.intel) + ' INTEL', 'good'); break;
      case 'energy': S.grant({ energy: o.energy }); CM.ui.toast('+' + o.energy + ' ENERGY', 'good'); break;
    }
    CM.audio.play('reward');
    S.save();
    this.rebuild();
  };

  /* ========================================================= crate game */
  /** Three crates, one pick. A cheap gamble that always returns something. */
  Deals.prototype.crateGame = function () {
    const self = this;
    const cost = { credits: Math.round(200 * Math.pow(1.4, S.s.level - 1)) };
    if (!S.can(cost)) { CM.ui.toast('NEED ' + S.costText(cost), 'bad'); CM.audio.play('error'); return; }

    const row = h('div', { style: { display: 'flex', gap: '12px', justifyContent: 'center', margin: '10px 0' } });
    const note = h('p', { text: 'Pick a crate. The fixer keeps the change either way.' });
    let done = false;

    const prizes = U.shuffle([weightedPrize(), weightedPrize(), weightedPrize()]);

    [0, 1, 2].forEach((i) => {
      const crate = h('div.slot.gold', {
        style: { width: '84px', height: '84px' },
        onclick: () => {
          if (done) return;
          done = true;
          S.pay(cost);
          const p = prizes[i];
          crate.classList.add('sel');
          CM.ui.clear(crate);
          crate.appendChild(h('img', { src: p.icon }));
          note.textContent = p.text;
          p.apply();
          CM.audio.play(p.good ? 'reward' : 'error');
          self.rebuild();
        }
      }, [h('img', { src: A.glyphURL('chip', '#ffb020', 64) })]);
      row.appendChild(crate);
    });

    CM.ui.modal({
      title: 'CRACK A CRATE  ·  ' + S.costText(cost), accent: 'gold',
      bodyEl: h('div', null, [note, row]),
      buttons: [{ label: 'WALK AWAY' }]
    });
  };

  function weightedPrize() {
    const r = Math.random(), lvl = S.s.level;
    const base = 260 * Math.pow(1.6, lvl * 0.55);
    if (r < 0.30) {
      const amt = Math.round(base * U.rand(.3, .7));
      return { good: false, text: 'Dust and a few loose credits: +' + U.fmt(amt) + '¢',
        icon: A.glyphURL('chip', '#6b7794', 64), apply: () => S.grant({ credits: amt }) };
    }
    if (r < 0.62) {
      const amt = Math.round(base * U.rand(1.4, 2.6));
      return { good: true, text: 'Clean cash: +' + U.fmt(amt) + '¢',
        icon: A.glyphURL('vault', '#ffb020', 64), apply: () => S.grant({ credits: amt }) };
    }
    if (r < 0.84) {
      const amt = Math.max(4, Math.round(6 * Math.pow(1.5, lvl * 0.4)));
      return { good: true, text: 'A bag of merge chips: +' + U.fmt(amt) + '✦',
        icon: A.glyphURL('chip', '#ff3fa4', 64), apply: () => S.grant({ chips: amt }) };
    }
    const kind = U.choice(ITEMS.KINDS);
    const tier = U.clamp(S.tierCap(kind) - U.randInt(0, 1), 1, ITEMS.MAX_TIER);
    return {
      good: true, text: 'Hardware! ' + ITEMS.name({ kind: kind, tier: tier, plus: 0 }),
      icon: A.itemIconURL(kind, tier, 96),
      apply: () => { if (!S.addItem(kind, tier)) CM.ui.toast('STASH FULL — prize lost', 'bad'); }
    };
  }

  /* ------------------------------------------------------------- canvas */
  Deals.prototype.renderBack = function (ctx, w, hgt) {
    ctx.drawImage(A.skyline(w, hgt, 20260801), 0, 0);
    ctx.fillStyle = 'rgba(12,3,10,.66)';
    ctx.fillRect(0, 0, w, hgt);
    // slow magenta scanline sweep for back-alley mood
    const y = (this.time * 60) % (hgt + 200) - 100;
    const g = ctx.createLinearGradient(0, y - 90, 0, y + 90);
    g.addColorStop(0, 'rgba(255,63,164,0)'); g.addColorStop(.5, 'rgba(255,63,164,.07)'); g.addColorStop(1, 'rgba(255,63,164,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, hgt);
  };

  CM.scenes = CM.scenes || {};
  CM.scenes.deals = new Deals();
})();
