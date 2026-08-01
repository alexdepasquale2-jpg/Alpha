/* ============================================================================
 * state.js — the single source of truth.
 *
 * Owns: resources, the outpost grid, the merge stash, tech, crew assignments,
 * boosts, mission history and the save file. Scenes never mutate the save
 * directly — they call the action methods here, which emit bus events so any
 * open UI refreshes itself.
 * ========================================================================== */
CM.state = (function () {
  'use strict';
  const U = CM.util, ITEMS = CM.ITEMS, BLD = CM.BUILDINGS, TECH = CM.TECH;

  const SAVE_KEY = 'cybermerger.save.v1';
  const GRID_COLS = 7, GRID_ROWS = 9;
  const OFFLINE_CAP_H = 8;          // hours of offline income banked
  const OFFLINE_RATE  = 0.5;        // …at half speed

  /* ------------------------------------------------------------ new game */
  function blank() {
    return {
      v: 1,
      created: Date.now(),
      lastSeen: Date.now(),
      seenTitle: false,

      credits: 120, intel: 0, chips: 0,
      energy: 60, level: 1, xp: 0,

      buildings: [],                 // {id,type,level,col,row,crew:itemId|null}
      inv: [],                       // item objects; `at` = buildingId when stationed
      squad: [],                     // itemIds (agents) assigned to the strike team
      tech: { boot: true },
      crafted: { vehicle: 0, weapon: 0, agent: 0 },

      boosts: [],                    // {id,label,mult:{},until}
      deals: { offers: [], refreshAt: 0, rerolls: 0 },
      missions: { done: {}, streak: 0, lastId: null },

      strategy: null,                // lazily created by scenes/strategy.js

      stats: { merges: 0, builds: 0, missionsWon: 0, missionsLost: 0,
               creditsEarned: 0, playtime: 0, bestTier: 1 },
      settings: { sound: true, rain: true },
      rewardsCounter: 0              // the odometer on the title screen
    };
  }

  let S = blank();

  /* =====================================================================
   *  SAVE / LOAD
   * =================================================================== */
  function save() {
    S.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (!raw) { S = blank(); grantStarterKit(); return null; }
    try {
      const d = JSON.parse(raw);
      S = Object.assign(blank(), d);
      // defensive merges for saves written by older builds
      S.stats    = Object.assign(blank().stats, d.stats || {});
      S.settings = Object.assign(blank().settings, d.settings || {});
      S.missions = Object.assign(blank().missions, d.missions || {});
      S.deals    = Object.assign(blank().deals, d.deals || {});
      S.crafted  = Object.assign(blank().crafted, d.crafted || {});
      S.inv      = (d.inv || []).filter(Boolean);
      S.buildings = (d.buildings || []).filter(Boolean);
      return offlineReport();
    } catch (e) {
      console.warn('save corrupt, starting fresh', e);
      S = blank(); grantStarterKit(); return null;
    }
  }
  function wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    S = blank(); grantStarterKit(); CM.bus.emit('state'); CM.bus.emit('inv');
  }
  function grantStarterKit() {
    S.inv.push(ITEMS.make('vehicle', 1));
    S.inv.push(ITEMS.make('vehicle', 1));
    S.inv.push(ITEMS.make('weapon', 1));
    S.inv.push(ITEMS.make('weapon', 1));
    S.inv.push(ITEMS.make('agent', 1));
    S.squad = [S.inv[S.inv.length - 1].id];
  }

  /** Bank offline income; returns a summary object for the welcome-back modal. */
  function offlineReport() {
    const dt = U.clamp((Date.now() - (S.lastSeen || Date.now())) / 1000, 0, OFFLINE_CAP_H * 3600);
    if (dt < 60) return null;
    const inc = income();
    const got = {
      seconds: dt,
      credits: inc.credits * dt * OFFLINE_RATE,
      intel:   inc.intel   * dt * OFFLINE_RATE,
      chips:   inc.chips   * dt * OFFLINE_RATE
    };
    S.credits += got.credits; S.intel += got.intel; S.chips += got.chips;
    S.energy = U.clamp(S.energy + inc.energyRegen * dt, 0, energyMax());
    S.stats.creditsEarned += got.credits;
    S.rewardsCounter += got.credits;
    return got;
  }

  /* =====================================================================
   *  DERIVED VALUES  (tech + boost multipliers, income, caps)
   * =================================================================== */
  /** Aggregate multiplicative bonuses from unlocked tech and active boosts. */
  function mult() {
    const m = { credits: 1, intel: 1, chips: 1, loot: 1, damage: 1, toughness: 1, station: 1 };
    TECH.NODES.forEach((n) => {
      if (!S.tech[n.id] || !n.effects.mult) return;
      for (const k in n.effects.mult) m[k] = (m[k] || 1) * n.effects.mult[k];
    });
    const now = Date.now();
    S.boosts.forEach((b) => {
      if (b.until && b.until < now) return;
      for (const k in b.mult) m[k] = (m[k] || 1) * b.mult[k];
    });
    return m;
  }
  /** Aggregate additive bonuses from unlocked tech. */
  function adds() {
    const a = { energyMax: 0, invSlots: 0, squadSlots: 0, dealSlots: 0 };
    TECH.NODES.forEach((n) => {
      if (!S.tech[n.id] || !n.effects.add) return;
      for (const k in n.effects.add) a[k] = (a[k] || 0) + n.effects.add[k];
    });
    return a;
  }
  function hasUnlock(id) {
    return TECH.NODES.some((n) => S.tech[n.id] && n.effects.unlock === id);
  }
  /** Highest merge tier currently allowed for a chain. */
  function tierCap(kind) {
    let cap = 3;
    TECH.NODES.forEach((n) => {
      if (!S.tech[n.id] || !n.effects.tierCap) return;
      n.effects.tierCap.forEach((tc) => { if (tc.kind === kind) cap = Math.max(cap, tc.tier); });
    });
    return Math.min(cap, ITEMS.MAX_TIER);
  }
  const invSlots   = () => 24 + adds().invSlots;
  const squadSlots = () => 3 + adds().squadSlots;
  const dealSlots  = () => 3 + adds().dealSlots;
  function energyMax() {
    let e = 100 + adds().energyMax;
    S.buildings.forEach((b) => { const y = BLD.yieldsOf(b); if (y.energyMax) e += y.energyMax; });
    return Math.round(e);
  }
  const xpNeeded = (lvl) => Math.floor(100 * Math.pow(1.34, (lvl || S.level) - 1));

  /** Is a building orthogonally adjacent to (col,row)? */
  function adjacent(a, b) {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
  }
  /** Per-building output multiplier from relays + a stationed crew member. */
  function buildingBonus(b) {
    let m = 1;
    S.buildings.forEach((o) => {
      if (o === b || o.type !== 'relay' || !adjacent(o, b)) return;
      m += BLD.yieldsOf(o).adjacency || 0;
    });
    if (b.crew) {
      const it = itemById(b.crew);
      if (it) m += 0.25 * it.tier * (1 + (it.plus || 0) * .2) * mult().station;
    }
    return m;
  }

  /** Total per-second resource generation. */
  function income() {
    const m = mult();
    const out = { credits: 0, intel: 0, chips: 0, energyRegen: 0.25 };
    S.buildings.forEach((b) => {
      const y = BLD.yieldsOf(b), bb = buildingBonus(b);
      if (y.credits) out.credits += y.credits * bb;
      if (y.intel)   out.intel   += y.intel   * bb;
      if (y.chips)   out.chips   += y.chips   * bb;
      if (y.energyRegen) out.energyRegen += y.energyRegen;
    });
    out.credits *= m.credits; out.intel *= m.intel; out.chips *= m.chips;
    return out;
  }

  /* =====================================================================
   *  TICK
   * =================================================================== */
  let dirty = 0;
  function tick(dt) {
    const inc = income();
    const gained = inc.credits * dt;
    S.credits += gained;
    S.intel   += inc.intel * dt;
    S.chips   += inc.chips * dt;
    S.energy   = U.clamp(S.energy + inc.energyRegen * dt, 0, energyMax());
    S.stats.creditsEarned += gained;
    S.stats.playtime += dt;
    S.rewardsCounter += gained;

    // prune finished boosts
    const now = Date.now();
    for (let i = S.boosts.length - 1; i >= 0; i--) {
      if (S.boosts[i].until && S.boosts[i].until < now) {
        CM.bus.emit('toast', { msg: S.boosts[i].label + ' expired', kind: 'bad' });
        S.boosts.splice(i, 1);
      }
    }
    dirty += dt;
    if (dirty > 8) { dirty = 0; save(); }
  }

  /* =====================================================================
   *  RESOURCE HELPERS
   * =================================================================== */
  function can(cost) {
    for (const k in cost) if ((S[k] || 0) < cost[k]) return false;
    return true;
  }
  function pay(cost) {
    if (!can(cost)) return false;
    for (const k in cost) S[k] -= cost[k];
    CM.bus.emit('state');
    return true;
  }
  function grant(g) {
    for (const k in g) {
      if (k === 'xp') { addXP(g[k]); continue; }
      S[k] = (S[k] || 0) + g[k];
      if (k === 'credits') { S.stats.creditsEarned += g[k]; S.rewardsCounter += g[k]; }
    }
    if (S.energy > energyMax()) S.energy = energyMax();
    CM.bus.emit('state');
  }
  function addXP(n) {
    S.xp += n;
    let leveled = false;
    while (S.xp >= xpNeeded(S.level)) {
      S.xp -= xpNeeded(S.level); S.level++; leveled = true;
      S.energy = energyMax();
    }
    if (leveled) {
      CM.audio.play('level');
      CM.bus.emit('toast', { msg: 'LEVEL ' + S.level + ' — energy refilled', kind: 'gold' });
      CM.bus.emit('level');
    }
  }
  function costText(cost) {
    const ic = { credits: '¢', intel: '◈', chips: '✦', energy: '⚡' };
    return Object.keys(cost).map((k) => (ic[k] || k) + U.fmt(cost[k])).join('  ');
  }

  /* =====================================================================
   *  INVENTORY / MERGE ACTIONS
   * =================================================================== */
  const itemById = (id) => S.inv.find((i) => i.id === id);
  const invCount = () => S.inv.length;

  function addItem(kind, tier, plus) {
    if (S.inv.length >= invSlots()) return null;
    const it = ITEMS.make(kind, tier, plus);
    S.inv.push(it);
    if (it.tier > S.stats.bestTier) S.stats.bestTier = it.tier;
    CM.bus.emit('inv');
    return it;
  }

  function craft(kind) {
    const cost = { credits: ITEMS.craftCost(kind, S.crafted[kind]) };
    if (S.inv.length >= invSlots()) return { ok: false, msg: 'STASH FULL — scrap or merge something' };
    if (!can(cost)) return { ok: false, msg: 'NOT ENOUGH CREDITS (' + costText(cost) + ')' };
    pay(cost);
    S.crafted[kind]++;
    const it = addItem(kind, 1);
    CM.audio.play('build');
    return { ok: true, item: it, msg: 'CRAFTED ' + ITEMS.name(it) };
  }

  /** Merge two items of the same kind+tier into one of the next tier. */
  function merge(idA, idB) {
    const a = itemById(idA), b = itemById(idB);
    if (!a || !b || a === b) return { ok: false, msg: 'PICK TWO ITEMS' };
    if (a.kind !== b.kind || a.tier !== b.tier) return { ok: false, msg: 'ITEMS MUST MATCH' };
    if (a.tier >= tierCap(a.kind))
      return { ok: false, msg: 'TIER ' + (a.tier + 1) + ' LOCKED — research it in PROGRESSION' };

    unassign(a.id); unassign(b.id);
    const merged = ITEMS.make(a.kind, a.tier + 1, Math.max(a.plus || 0, b.plus || 0));
    S.inv.splice(S.inv.indexOf(b), 1);
    const idx = S.inv.indexOf(a);          // slot the merged item lands in
    S.inv[idx] = merged;
    S.stats.merges++;
    if (merged.tier > S.stats.bestTier) {
      S.stats.bestTier = merged.tier;
      CM.bus.emit('toast', { msg: 'NEW TIER UNLOCKED: ' + ITEMS.name(merged), kind: 'gold' });
    }
    grant({ chips: Math.max(1, Math.round(merged.tier * 0.6)), xp: merged.tier * 3 });
    CM.audio.play('merge');
    CM.bus.emit('inv');
    return { ok: true, item: merged, index: idx, msg: 'MERGED → ' + ITEMS.name(merged) };
  }

  /** Auto-merge: find the highest-tier matching pair and fuse it. */
  function autoMerge(kind) {
    const seen = {};
    let best = null;
    S.inv.forEach((it) => {
      if (kind && it.kind !== kind) return;
      if (it.tier >= tierCap(it.kind)) return;
      const k = it.kind + it.tier;
      if (seen[k]) { if (!best || it.tier > best.a.tier) best = { a: seen[k], b: it }; }
      else seen[k] = it;
    });
    if (!best) return { ok: false, msg: 'NO MERGEABLE PAIR' };
    return merge(best.a.id, best.b.id);
  }

  function refine(id) {
    const it = itemById(id);
    if (!it) return { ok: false, msg: 'NOTHING SELECTED' };
    const cost = { chips: ITEMS.refineCost(it) };
    if (!can(cost)) return { ok: false, msg: 'NEED ' + costText(cost) };
    pay(cost);
    it.plus = (it.plus || 0) + 1;
    CM.audio.play('reward');
    CM.bus.emit('inv');
    return { ok: true, msg: ITEMS.name(it) + ' REFINED' };
  }

  function scrap(id) {
    const it = itemById(id);
    if (!it) return { ok: false, msg: 'NOTHING SELECTED' };
    unassign(id);
    S.inv.splice(S.inv.indexOf(it), 1);
    const v = ITEMS.scrapValue(it);
    grant({ credits: v, chips: it.tier >= 4 ? Math.floor(it.tier / 2) : 0 });
    CM.bus.emit('inv');
    return { ok: true, msg: 'SCRAPPED FOR ' + U.fmt(v) + '¢' };
  }

  /* =====================================================================
   *  CREW ASSIGNMENT
   * =================================================================== */
  function unassign(itemId) {
    S.buildings.forEach((b) => { if (b.crew === itemId) b.crew = null; });
    const i = S.squad.indexOf(itemId);
    if (i >= 0) S.squad.splice(i, 1);
    const it = itemById(itemId); if (it) it.at = null;
  }
  function stationCrew(itemId, buildingId) {
    const it = itemById(itemId);
    if (!it || it.kind !== 'agent') return { ok: false, msg: 'ONLY CREW CAN BE STATIONED' };
    const b = S.buildings.find((x) => x.id === buildingId);
    if (!b) return { ok: false, msg: 'NO SUCH OUTPOST' };
    unassign(itemId);
    if (b.crew) { const prev = itemById(b.crew); if (prev) prev.at = null; }
    b.crew = itemId; it.at = buildingId;
    CM.bus.emit('inv'); CM.bus.emit('state');
    return { ok: true, msg: ITEMS.name(it) + ' STATIONED' };
  }
  function toggleSquad(itemId) {
    const it = itemById(itemId);
    if (!it || it.kind !== 'agent') return { ok: false, msg: 'ONLY CREW JOIN THE SQUAD' };
    const i = S.squad.indexOf(itemId);
    if (i >= 0) { S.squad.splice(i, 1); CM.bus.emit('inv'); return { ok: true, msg: 'REMOVED FROM SQUAD' }; }
    if (S.squad.length >= squadSlots()) return { ok: false, msg: 'SQUAD FULL (' + squadSlots() + ')' };
    unassign(itemId);
    S.squad.push(itemId);
    CM.bus.emit('inv'); CM.bus.emit('state');
    return { ok: true, msg: ITEMS.name(it) + ' JOINED THE SQUAD' };
  }
  /** Squad members, falling back to the strongest idle agents if empty. */
  function squadItems() {
    let list = S.squad.map(itemById).filter(Boolean);
    if (!list.length) {
      list = S.inv.filter((i) => i.kind === 'agent')
                  .sort((a, b) => ITEMS.rating(b) - ITEMS.rating(a))
                  .slice(0, squadSlots());
    }
    return list;
  }
  const bestOf = (kind) => S.inv.filter((i) => i.kind === kind)
                                .sort((a, b) => ITEMS.rating(b) - ITEMS.rating(a))[0] || null;

  /* =====================================================================
   *  BUILDINGS
   * =================================================================== */
  const buildingAt = (col, row) => S.buildings.find((b) => b.col === col && b.row === row);

  function place(type, col, row) {
    const def = BLD.byId(type);
    if (!def) return { ok: false, msg: 'UNKNOWN OUTPOST' };
    if (def.tech && !S.tech[def.tech]) return { ok: false, msg: def.name + ' LOCKED — see PROGRESSION' };
    if (buildingAt(col, row)) return { ok: false, msg: 'TILE OCCUPIED' };
    if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return { ok: false, msg: 'OFF GRID' };
    const c = BLD.cost(type, 1);
    if (!can(c)) return { ok: false, msg: 'NEED ' + costText(c) };
    pay(c);
    const b = { id: U.uid('b'), type: type, level: 1, col: col, row: row, crew: null, born: performance.now() };
    S.buildings.push(b);
    S.stats.builds++;
    grant({ xp: 6 });
    CM.audio.play('build');
    CM.bus.emit('state');
    return { ok: true, building: b, msg: def.name + ' DEPLOYED' };
  }
  function upgrade(id) {
    const b = S.buildings.find((x) => x.id === id);
    if (!b) return { ok: false, msg: 'NO OUTPOST' };
    if (b.level >= BLD.MAX_LEVEL) return { ok: false, msg: 'MAX LEVEL' };
    const c = BLD.cost(b.type, b.level + 1);
    if (!can(c)) return { ok: false, msg: 'NEED ' + costText(c) };
    pay(c);
    b.level++;
    grant({ xp: 4 * b.level });
    CM.audio.play('build');
    CM.bus.emit('state');
    return { ok: true, msg: BLD.byId(b.type).name + ' → LVL ' + b.level };
  }
  function demolish(id) {
    const i = S.buildings.findIndex((x) => x.id === id);
    if (i < 0) return { ok: false, msg: 'NO OUTPOST' };
    const b = S.buildings[i];
    if (b.crew) { const it = itemById(b.crew); if (it) it.at = null; }
    let refund = 0;
    for (let l = 1; l <= b.level; l++) refund += BLD.cost(b.type, l).credits || 0;
    refund = Math.floor(refund * 0.6);
    S.buildings.splice(i, 1);
    grant({ credits: refund });
    CM.bus.emit('state');
    return { ok: true, msg: 'SALVAGED FOR ' + U.fmt(refund) + '¢' };
  }

  /* =====================================================================
   *  TECH
   * =================================================================== */
  function techAvailable(node) {
    return node.req.every((r) => S.tech[r]);
  }
  function research(id) {
    const n = TECH.byId(id);
    if (!n) return { ok: false, msg: 'UNKNOWN NODE' };
    if (S.tech[id]) return { ok: false, msg: 'ALREADY ONLINE' };
    if (!techAvailable(n)) return { ok: false, msg: 'PREREQUISITES MISSING' };
    if (!can(n.cost)) return { ok: false, msg: 'NEED ' + costText(n.cost) };
    pay(n.cost);
    S.tech[id] = true;
    grant({ xp: 25 });
    CM.audio.play('reward');
    CM.bus.emit('tech'); CM.bus.emit('state');
    return { ok: true, msg: n.name + ' ONLINE' };
  }

  /* =====================================================================
   *  BOOSTS
   * =================================================================== */
  function addBoost(label, multObj, seconds) {
    S.boosts.push({ id: U.uid('bo'), label: label, mult: multObj, until: Date.now() + seconds * 1000 });
    CM.bus.emit('state');
  }
  const activeBoosts = () => S.boosts.filter((b) => !b.until || b.until > Date.now());

  /* =====================================================================
   *  MISSIONS
   * =================================================================== */
  function missionUnlocked(m) { return S.level >= m.lvl; }
  function recordMission(m, won, payout) {
    if (won) {
      S.stats.missionsWon++;
      S.missions.streak++;
      S.missions.done[m.id] = (S.missions.done[m.id] || 0) + 1;
      grant(payout);
    } else {
      S.stats.missionsLost++;
      S.missions.streak = 0;
    }
    S.missions.lastId = m.id;
    save();
    CM.bus.emit('state');
  }

  /* ------------------------------------------------------------ exports */
  return {
    SAVE_KEY, GRID_COLS, GRID_ROWS, OFFLINE_CAP_H,
    get s() { return S; },
    blank, save, load, wipe, tick,
    mult, adds, income, energyMax, xpNeeded, hasUnlock, tierCap,
    invSlots, squadSlots, dealSlots, buildingBonus,
    can, pay, grant, addXP, costText,
    itemById, invCount, addItem, craft, merge, autoMerge, refine, scrap,
    unassign, stationCrew, toggleSquad, squadItems, bestOf,
    buildingAt, place, upgrade, demolish,
    techAvailable, research,
    addBoost, activeBoosts,
    missionUnlocked, recordMission
  };
})();
