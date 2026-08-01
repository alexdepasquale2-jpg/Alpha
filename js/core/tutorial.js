/* ============================================================================
 * tutorial.js — the optional guided run-through.
 *
 * Entirely opt-in: offered once on a fresh save, declinable, restartable from
 * MENU -> TUTORIAL, and abandonable at any point with SKIP. It never blocks
 * input — it is a coach panel plus a spotlight ring, not a modal cage, so a
 * player who ignores it can still do anything they like.
 *
 * Each step either auto-advances when its `done()` predicate goes true, or
 * waits for NEXT. NEXT is always available, so nobody can get stuck on a step
 * whose condition they cannot meet.
 * ========================================================================== */
CM.tutorial = (function () {
  'use strict';
  const S = CM.state;
  const h = () => CM.ui.h;      // ui.js loads after this file at parse time

  const REWARD = { credits: 2500, chips: 12, xp: 60 };

  /* -------------------------------------------------------------- steps -- */
  /*  scene   : which screen the step is about (spotlight only shows there)
   *  spot    : CSS selector for the element to ring
   *  done    : auto-advance predicate
   *  manual  : informational step, waits for NEXT                            */
  const STEPS = [
    {
      id: 'enter', title: 'WELCOME TO THE CITY', scene: 'title',
      text: 'You run a crew in a rainy neon town. Tap the red CLICK button to walk in.',
      spot: 'button.btn.red',
      done: () => CM.game.scene && CM.game.scene.name !== 'title'
    },
    {
      id: 'pick', title: 'PICK AN OUTPOST', scene: 'base',
      text: 'Income comes from outposts. Tap DATA NODE — the top icon in the BUILD rail on the left.',
      spot: '.rail.left .slot',
      done: () => CM.scenes.base.sel === 'node' || S.s.buildings.length > 0
    },
    {
      id: 'place', title: 'DEPLOY IT', scene: 'base',
      text: 'Now tap a tile on the slab. The targeting outline turns GREEN where the outpost fits and RED where it does not.',
      done: () => S.s.buildings.length > 0
    },
    {
      id: 'income', title: 'IT PAYS WHILE YOU SLEEP', scene: 'base',
      text: 'That node prints credits every second — even with the game closed. Tap the outpost any time to upgrade it.',
      spot: '.res.credits', manual: true
    },
    {
      id: 'stash', title: 'OPEN THE STASH', scene: 'base',
      text: 'Your gear lives in the merge bay. Tap STASH on the bottom bar.',
      spot: '.actionbar .act:nth-child(3) .btn',
      done: () => CM.game.scene && CM.game.scene.name === 'merge'
    },
    {
      id: 'merge', title: 'FUSE TWO OF A KIND', scene: 'merge',
      text: 'Drag one Rust Scooter onto the other one. Two identical items fuse into the next tier up.',
      done: () => S.s.stats.merges > 0
    },
    {
      id: 'merge2', title: 'THAT IS THE WHOLE GAME', scene: 'merge',
      text: 'Every fuse is a big jump in power. FUSE ALL chains every available merge at once, and CRAFT buys fresh tier-1 stock.',
      spot: '.inv-wrap .btn.sm.green', manual: true
    },
    {
      id: 'mission', title: 'PUT THEM TO WORK', scene: 'base',
      text: 'Agents fight for you. Head back to the base and tap HIT MISSION.',
      spot: '.actionbar .act:nth-child(4) .btn',
      done: () => CM.game.scene && CM.game.scene.name === 'mission'
    },
    {
      id: 'fight', title: 'TAKE THE FIRST CONTRACT', scene: 'mission',
      text: 'Pick CORNER SHAKEDOWN and win it. Each round you choose STRIKE, OVERCLOCK, PATCH or SMOKE — or flip AUTO on.',
      done: () => S.s.stats.missionsWon > 0
    },
    {
      id: 'tech', title: 'RAISE THE CEILING', scene: 'base',
      text: 'Merging stops at tier 4 until you research further. Open PROGRESSION and buy a node.',
      spot: '.actionbar .act:nth-child(5) .btn',
      done: () => CM.game.scene && CM.game.scene.name === 'tech'
    },
    {
      id: 'wrap', title: 'THAT IS THE LOOP', scene: null,
      text: 'Build for income, merge for power, hit for payouts, research to go further. The ticker at the top of the base always shows your next goal.',
      manual: true
    }
  ];

  /* ------------------------------------------------------------- runtime -- */
  let idx = 0, active = false, shownStep = -1;
  let panel = null, spot = null, titleEl = null, textEl = null, countEl = null, nextBtn = null;

  function isActive() { return active; }
  function step() { return STEPS[idx] || null; }

  /* ---------------------------------------------------------------- DOM -- */
  function buildPanel() {
    const H = h();
    countEl = H('span.coach-count');
    titleEl = H('span.coach-title');
    textEl = H('div.coach-text');
    nextBtn = H('button.btn.sm.gold', { text: 'NEXT', onclick: () => { CM.audio.play('click'); advance(); } });

    panel = H('div.panel.coach', null, [
      H('div.coach-head', null, [countEl, titleEl]),
      textEl,
      H('div.coach-btns', null, [
        H('button.btn.sm.ghost', { text: 'SKIP TUTORIAL', onclick: () => { CM.audio.play('back'); stop(false); } }),
        nextBtn
      ])
    ]);
    spot = H('div.coach-spot');
    document.body.appendChild(panel);
    document.body.appendChild(spot);
  }
  function destroyPanel() {
    if (panel) { panel.remove(); panel = null; }
    if (spot) { spot.remove(); spot = null; }
    shownStep = -1;
  }

  /* ------------------------------------------------------------ controls -- */
  function start(fromStep) {
    if (!panel) buildPanel();
    idx = fromStep || 0;
    active = true;
    shownStep = -1;
    S.s.tutorial.active = true;
    S.s.tutorial.offered = true;
    S.s.tutorial.step = idx;
    S.save();
    render();
  }
  function stop(completed) {
    active = false;
    destroyPanel();
    S.s.tutorial.active = false;
    S.s.tutorial.step = idx;
    if (completed) {
      S.s.tutorial.done = true;
      if (!S.s.tutorial.rewarded) {
        S.s.tutorial.rewarded = true;
        S.grant(REWARD);
        CM.audio.play('reward');
        CM.ui.modal({
          title: 'TUTORIAL COMPLETE', accent: 'gold',
          body: '<p>You know the loop. Here is a starter payout.</p><p>Credits <b>+' +
                CM.util.fmt(REWARD.credits) + '</b> · Chips <b>+' + REWARD.chips +
                '</b> · XP <b>+' + REWARD.xp + '</b></p>' +
                '<p style="opacity:.7">You can replay this any time from MENU.</p>',
          buttons: [{ label: 'GET TO WORK', cls: 'gold' }]
        });
      }
    } else {
      CM.ui.toast('TUTORIAL SKIPPED — restart it from MENU', 'good');
    }
    S.save();
  }
  function advance() {
    idx++;
    if (idx >= STEPS.length) { stop(true); return; }
    S.s.tutorial.step = idx;
    CM.audio.play('tick');
    render();
  }

  /* -------------------------------------------------------------- render -- */
  function render() {
    const st = step();
    if (!st || !panel) return;
    countEl.textContent = 'STEP ' + (idx + 1) + '/' + STEPS.length;
    titleEl.textContent = st.title;
    textEl.textContent = st.text;
    nextBtn.textContent = st.manual ? 'NEXT' : 'SKIP STEP';
    panel.classList.toggle('manual', !!st.manual);
    shownStep = idx;
  }

  /** Do two client rects overlap at all? */
  function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  /**
   * Move the spotlight ring onto this step's element, if it is on screen, and
   * keep the coach panel out of its way — the panel lives at the bottom, but
   * step 1 points at the title screen's CLICK button which is also down there,
   * so it flips to the top whenever the two would collide.
   */
  function positionSpot() {
    const st = step();
    if (!spot) return;
    const sceneName = CM.game.scene ? CM.game.scene.name : null;
    const wrongScene = st && st.scene && st.scene !== sceneName;
    const el = st && st.spot && !wrongScene ? document.querySelector(st.spot) : null;
    if (!el) { spot.style.display = 'none'; panel.classList.remove('top'); return; }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { spot.style.display = 'none'; panel.classList.remove('top'); return; }
    const pad = 6;
    spot.style.display = '';
    spot.style.left = (r.left - pad) + 'px';
    spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';

    // measure with the panel in its default place, then flip if it clashes
    const wasTop = panel.classList.contains('top');
    const pr = panel.getBoundingClientRect();
    const clash = overlaps(r, pr);
    if (!wasTop && clash) panel.classList.add('top');
    // un-flip only when the bottom slot is clearly free again, so it cannot
    // oscillate between the two positions frame to frame
    else if (wasTop && r.bottom < window.innerHeight - pr.height - 40) panel.classList.remove('top');
  }

  /** Called once per frame from the main loop. */
  function update() {
    if (!active) return;
    const st = step();
    if (!st) { stop(true); return; }
    if (shownStep !== idx) render();
    if (!st.manual && st.done && st.done()) { advance(); return; }
    positionSpot();
  }

  /* ------------------------------------------------------------- offering -- */
  /** Ask once, on a genuinely fresh save. Never nags again either way. */
  function offerIfNew() {
    const t = S.s.tutorial;
    if (t.offered || t.done) return false;
    t.offered = true;
    S.save();
    CM.ui.modal({
      title: 'FIRST JOB?', accent: 'gold', dismissable: false,
      body: '<p>CYBER MERGER has a few systems talking to each other. Want a two-minute walkthrough of the loop?</p>' +
            '<p style="opacity:.7">It never blocks you — skip it whenever, or restart it later from MENU.</p>',
      buttons: [
        { label: 'RUN TUTORIAL', cls: 'gold', onClick: () => start(0) },
        { label: 'I KNOW THE DRILL', cls: 'ghost', onClick: () => CM.ui.help() }
      ]
    });
    return true;
  }

  return { STEPS, start, stop, advance, update, isActive, offerIfNew, step, REWARD };
})();
