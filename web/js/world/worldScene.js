// The world. One walkable space containing the farm, the road, and Coldbrook —
// this replaces the old farm and town menu screens entirely.
//
// Navigation is spatial: you walk to a plot to work it, into a shop to trade,
// up to a person to talk, and out to the mustering ground to march. Panels
// still exist for things that are genuinely lists (stock, seeds, the bin), but
// you reach them by standing somewhere, not by tapping a menu.

import { Scene } from '../core/scene.js';
import { Card, ScrollList, Button } from '../ui/widgets.js';
import { COLORS, text, panel, fillRound, strokeRound, bar, wrapText } from '../ui/theme.js';
import { Joystick, ActionButton, drawInteractHint } from '../ui/joystick.js';
import { drawHud, hudBottom, pill } from '../ui/hud.js';
import { toast } from '../ui/toast.js';
import { on, EVENTS } from '../core/events.js';
import {
  state, itemCount, plotAt, seasonName, addItem,
} from '../core/state.js';
import { CROPS, plantableCrops } from '../data/crops.js';
import { getItem, seedId, sellValue, itemName } from '../data/items.js';
import { UNITS } from '../data/units.js';
import { NPCS } from '../data/npcs.js';
import {
  till, plant, water, harvest, fertilize, clearPlot, refillCan, sleep,
  plotStatus, daysUntilHarvest, describeReport, countReady, countUnwatered,
  binValue,
} from '../farm/farmSim.js';
import {
  ANIMALS, tendAll, collectAll, untendedCount, readyProduceCount,
} from '../farm/livestock.js';
import { roster, giveGift, talkTo, canGift } from '../town/relationships.js';
import { todaysFestival, attend, describeToday } from '../town/festivals.js';
import { stockFor, purchase, SHOP_BLURB } from '../town/shop.js';
import {
  T, TILE, drawTile, drawTallTile, drawWall, refreshSeasonTint, tileHash,
} from './tiles.js';
import {
  buildOverworld, buildInterior, exitPositionFor, refreshFarmTiles,
  refreshFarmBuildings, plotCoordsAt, plotTile, TOWN_BUILDINGS,
} from './worldMap.js';
import { Player, Npc, DIR, drawPerson } from './entities.js';
import { drawCrop, drawAnimal, drawMech, drawHeart } from '../render/sprites.js';

const TILES_ACROSS = 13;        // how much world fits across a phone screen
// Two tiles, so you can talk across a shop counter — the shopkeeper stands
// directly behind it and you stand directly in front.
const INTERACT_RANGE = 2.2;

export class WorldScene extends Scene {
  constructor(game) {
    super(game);
    this.name = 'WorldScene';

    this.maps = {};
    this.map = null;
    this.player = null;
    this.npcs = [];
    this.camera = { x: 0, y: 0, zoom: 2 };
    this.time = 0;
    this.transition = 0;

    this.joystick = new Joystick();
    this.actionBtn = new ActionButton();
    this.secondaryBtn = new ActionButton();
    this.interaction = null;
    this.secondary = null;

    this.card = new Card();
    this.list = new ScrollList({ rowHeight: 62 });
    this.panelKind = null;       // 'shop' | 'seeds' | 'bin' | null
    this.panelShop = null;
    this.closeBtn = new Button({ label: 'Close', kind: 'ghost', onTap: () => this._closePanel() });
    this.seedBtn = new Button({ label: '', kind: 'gold', onTap: () => this._openSeeds() });

    this.selectedSeed = null;
  }

  /* ---- lifecycle --------------------------------------------------------- */

  enter() {
    refreshSeasonTint(state.meta.season);

    this.maps.overworld = buildOverworld();
    this.map = this.maps.overworld;
    this.player = new Player(this.map.spawn.x, this.map.spawn.y);
    this._populateTown();

    this.selectedSeed = this._availableSeeds()[0]?.cropId ?? null;

    // The world reflects state changes that happen elsewhere (a won parcel adds
    // farmland; a bought building appears), so listen rather than poll.
    this._unsubs = [
      on(EVENTS.TERRITORY_CLAIMED, () => this._syncFarm()),
      on(EVENTS.SEASON_CHANGED, ({ season }) => refreshSeasonTint(season)),
    ];
  }

  exit() {
    for (const off of this._unsubs ?? []) off();
    this._unsubs = [];
  }

  /** Called when re-entering from the map or a battle. */
  resume() {
    this._syncFarm();
    refreshSeasonTint(state.meta.season);
  }

  _syncFarm() {
    const over = this.maps.overworld;
    if (!over) return;
    refreshFarmTiles(over);
    refreshFarmBuildings(over);
  }

  _populateTown() {
    // Each shopkeeper wanders the square in front of their own building, so you
    // meet them outdoors as well as behind their counter.
    //
    // Read from the *built* buildings, not TOWN_BUILDINGS: the door position is
    // computed during construction and only exists on the map's copies.
    this.npcs = this.map.buildings
      .filter((b) => b.npc)
      .map((b, i) => new Npc(b.npc, b.doorX, b.doorY + 2, {
        roam: { x: Math.max(5, b.x - 2), y: b.doorY + 1, w: b.w + 4, h: 3 },
        seed: 1000 + i,
      }));
  }

  /* ---- map transitions ---------------------------------------------------- */

  _enterDoor(door) {
    if (door.to === 'overworld') {
      const from = this.map.id;
      this.map = this.maps.overworld;
      const spot = exitPositionFor(this.map, from);
      this.player.setTile(spot.x, spot.y);
      this.player.facing = DIR.DOWN;
    } else {
      if (!this.maps[door.to]) this.maps[door.to] = buildInterior(door.to);
      const target = this.maps[door.to];
      if (!target) return;
      this.map = target;
      this.player.setTile(target.spawn.x, target.spawn.y);
      this.player.facing = DIR.UP;
    }
    this.transition = 1;
    this._closePanel();
  }

  get inInterior() {
    return !!this.map?.interior;
  }

  /* ---- input -------------------------------------------------------------- */

  /** Called by Input at press time so the stick and button can coexist. */
  claimPointer(p) {
    if (this.panelKind || this.card.visible) return null;
    const view = this.game.view;
    this.actionBtn.layout(view);
    this._layoutSecondary(view);
    this.joystick.layout(view, 92);

    if (this.actionBtn.enabled && this.actionBtn.contains(p.x, p.y)) return 'action';
    if (this.secondaryBtn.enabled && this.secondaryBtn.contains(p.x, p.y)) return 'action2';
    if (this.joystick.contains(p.x, p.y)) return 'stick';
    return null;
  }

  _layoutSecondary(view) {
    this.secondaryBtn.r = view.short ? 28 : 32;
    this.secondaryBtn.x = view.w - view.safeRight - this.secondaryBtn.r - 26;
    this.secondaryBtn.y = this.actionBtn.y - this.actionBtn.r - this.secondaryBtn.r - 12;
  }

  handleInput(input) {
    const view = this.game.view;
    if (this.card.visible) return this.card.handleInput(input, view);

    if (this.panelKind) {
      this._layoutPanel(view);
      const picked = this.list.handleInput(input);
      if (picked) { this._onPanelPick(picked); return true; }
      return this.closeBtn.tryTap(input.tap);
    }

    // The seed chip is the one persistent HUD control.
    const tap = input.tap;
    if (tap && this.seedBtn.visible && this.seedBtn.tryTap(tap)) return true;
    return false;
  }

  update(dt) {
    this.time += dt;
    this.transition = Math.max(0, this.transition - dt * 3);

    const view = this.game.view;
    this.actionBtn.layout(view);
    this._layoutSecondary(view);
    this.joystick.layout(view, 92);

    const input = this.game.input;
    const frozen = this.panelKind || this.card.visible;

    const axis = frozen ? { x: 0, y: 0, mag: 0 } : this.joystick.update(input, dt);
    this.player.update(dt, axis, this.map);

    for (const npc of this.npcs) {
      if (!this.inInterior) npc.update(dt, this.map);
    }

    this._updateCamera(view, dt);

    if (!frozen) {
      this.interaction = this._findInteraction();
      this.secondary = this._findSecondary();

      if (this.interaction) this.actionBtn.set(this.interaction.icon, this.interaction.label);
      else this.actionBtn.clear();
      if (this.secondary) this.secondaryBtn.set(this.secondary.icon, '');
      else this.secondaryBtn.clear();

      if (this.actionBtn.update(input, dt) && this.interaction) this.interaction.run();
      if (this.secondaryBtn.update(input, dt) && this.secondary) this.secondary.run();
    } else {
      this.actionBtn.clear();
      this.secondaryBtn.clear();
      this.joystick.update(input, dt);
    }

    this.closeBtn.update(dt);
    this.seedBtn.update(dt);
  }

  _updateCamera(view, dt) {
    // Outdoors, show a fixed slice of world. Indoors, fill the screen width so
    // a small room doesn't sit in a black frame.
    const across = this.inInterior ? this.map.w : TILES_ACROSS;
    this.camera.zoom = Math.max(1.1, Math.min(3.2, view.w / (across * TILE)));

    const { zoom } = this.camera;
    const halfW = view.w / 2 / zoom;
    const halfH = view.h / 2 / zoom;
    const mapW = this.map.w * TILE;
    const mapH = this.map.h * TILE;

    let tx = this.player.x;
    let ty = this.player.y;
    // Small maps centre; large ones clamp so you never see past the edge.
    tx = mapW < halfW * 2 ? mapW / 2 : Math.max(halfW, Math.min(mapW - halfW, tx));
    ty = mapH < halfH * 2 ? mapH / 2 : Math.max(halfH, Math.min(mapH - halfH, ty));

    // Ease toward the target so stepping does not jitter the whole screen.
    const k = 1 - Math.pow(0.0001, dt);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
  }

  /* ---- interaction -------------------------------------------------------- */

  _findInteraction() {
    const p = this.player;
    const front = p.facingTile();

    // Standing on a doorway is the most common thing you'll want to act on.
    const under = this.map.doorAt(p.tileX, p.tileY) ?? this.map.doorAt(front.x, front.y);
    if (under) {
      return {
        icon: under.to === 'overworld' ? '🚪' : '🚪',
        label: under.to === 'overworld' ? 'Leave' : under.label,
        run: () => this._enterDoor(under),
      };
    }

    // A person in front of you, or close enough to lean over to.
    const npc = this._nearestNpc();
    if (npc) {
      return { icon: '💬', label: NPCS[npc.id]?.name ?? 'Talk', run: () => this._talk(npc.id) };
    }

    const obj = this._objectNear(front, p);
    if (obj?.action) {
      switch (obj.action) {
        case 'bin':
          return { icon: '📦', label: 'Ship', run: () => this._openBin() };
        case 'sleep':
          return { icon: '🛏️', label: 'Sleep', run: () => this._sleep() };
        case 'march':
          return { icon: '⚔️', label: 'March', run: () => this._march() };
        case 'read':
          return { icon: '📖', label: 'Read', run: () => this._readSign(obj) };
        case 'tend':
          return { icon: '🌾', label: 'Tend', run: () => this._tendAnimals() };
        default:
          break;
      }
    }

    // Water: refill the can from the pond.
    if (this._isWaterNear(front) || this._isWaterNear({ x: p.tileX, y: p.tileY })) {
      const can = state.farm.wateringCan;
      if (can.water < can.capacity) {
        return { icon: '🪣', label: 'Refill', run: () => this._refill() };
      }
    }

    // Farm plots: one button that always does the obviously right thing.
    const coords = plotCoordsAt(front.x, front.y) ?? plotCoordsAt(p.tileX, p.tileY);
    if (coords) return this._plotInteraction(coords);

    return null;
  }

  _plotInteraction(coords) {
    const plot = plotAt(coords.x, coords.y);
    if (!plot) return null;
    const status = plotStatus(plot);
    const act = (fn, successNote) => () => {
      const res = fn(coords.x, coords.y);
      if (!res.ok) { toast(res.reason, 'bad', 1400); return; }
      if (successNote) successNote(res);
    };

    switch (status) {
      case 'withered':
        return { icon: '🧤', label: 'Clear', run: act(clearPlot) };
      case 'ready':
        return {
          icon: '🧤', label: 'Harvest',
          run: act(harvest, (res) => {
            const q = res.quality ? ['', '⭐', '✨'][res.quality] : '';
            toast(`+${res.qty} ${res.crop.name}${q} → bin`, 'gold', 1400);
          }),
        };
      case 'growing':
        return { icon: '💧', label: 'Water', run: act(water) };
      case 'growing-wet':
        return { icon: '🌱', label: 'Growing', run: () => this._inspectPlot(plot) };
      case 'tilled': {
        if (!this.selectedSeed || itemCount(seedId(this.selectedSeed)) < 1) {
          return { icon: '🌱', label: 'No seed', run: () => this._openSeeds() };
        }
        return {
          icon: '🌱', label: CROPS[this.selectedSeed].name,
          run: act(() => plant(coords.x, coords.y, this.selectedSeed)),
        };
      }
      default:
        return { icon: '⛏️', label: 'Till', run: act(till) };
    }
  }

  /** Optional small button: fertilizer on a tilled plot. */
  _findSecondary() {
    const p = this.player;
    const front = p.facingTile();
    const coords = plotCoordsAt(front.x, front.y) ?? plotCoordsAt(p.tileX, p.tileY);
    if (!coords) return null;
    const plot = plotAt(coords.x, coords.y);
    if (!plot?.tilled || plot.soil >= 3) return null;
    if (itemCount('fertilizer') < 1) return null;
    return {
      icon: '💩',
      run: () => {
        const res = fertilize(coords.x, coords.y);
        if (!res.ok) toast(res.reason, 'bad', 1400);
        else toast(`Soil improved to ${'★'.repeat(res.soil)}`, 'gold', 1400);
      },
    };
  }

  /**
   * Objects are found under the player, in front of them, or in any adjacent
   * tile. Large props like the tent and the bed are several tiles across, and
   * demanding you face one exact tile of them reads as the button being broken.
   */
  _objectNear(front, p) {
    const candidates = [
      [front.x, front.y],
      [p.tileX, p.tileY],
      [p.tileX + 1, p.tileY], [p.tileX - 1, p.tileY],
      [p.tileX, p.tileY + 1], [p.tileX, p.tileY - 1],
    ];
    for (const [x, y] of candidates) {
      const obj = this.map.objectAt(x, y);
      if (obj?.action) return obj;
    }
    return null;
  }

  _isWaterNear(tile) {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = this.map.get(tile.x + dx, tile.y + dy);
      if (t === T.WATER || t === T.SHALLOW) return true;
    }
    return false;
  }

  _nearestNpc() {
    const pool = this.inInterior ? this.map.npcs : this.npcs;
    let best = null;
    let bestD = INTERACT_RANGE * TILE;
    for (const npc of pool) {
      const nx = npc.static ? npc.x * TILE + TILE / 2 : npc.x;
      const ny = npc.static ? npc.y * TILE + TILE / 2 : npc.y;
      const d = Math.hypot(nx - this.player.x, ny - this.player.y);
      if (d < bestD) { bestD = d; best = npc; }
    }
    return best;
  }

  /* ---- actions ------------------------------------------------------------ */

  _refill() {
    refillCan();
    toast('Watering can refilled.');
  }

  _inspectPlot(plot) {
    const crop = CROPS[plot.cropId];
    const left = daysUntilHarvest(plot);
    this.card.show({
      title: crop.name,
      body: `${left > 0 ? `${left} day(s) to harvest` : 'Ready'}\n`
          + `Watered today\nSoil ${'★'.repeat(plot.soil)}${'☆'.repeat(3 - plot.soil)}\n`
          + `Sells for ${sellValue(crop.id)}g`,
      buttons: [{ label: 'OK', kind: 'primary', onTap: () => this.card.hide() }],
    });
  }

  _readSign(obj) {
    this.card.show({
      title: obj.label,
      body: obj.text ?? '',
      buttons: [{ label: 'Close', kind: 'ghost', onTap: () => this.card.hide() }],
    });
  }

  _tendAnimals() {
    const tended = tendAll();
    const collected = collectAll();
    if (!tended && !collected.length) { toast('Everyone is fed and nothing is ready.', 'bad'); return; }
    const parts = [];
    if (tended) parts.push(`tended ${tended}`);
    if (collected.length) parts.push(`collected ${collected.length}`);
    toast(parts.join(', '), 'gold');
  }

  async _march() {
    const { MapScene } = await import('../map/mapScene.js');
    this.game.scenes.push(new MapScene(this.game));
  }

  async _sleep() {
    const ready = countReady();
    const dry = countUnwatered();
    const unfed = untendedCount();
    const warnings = [];
    if (ready) warnings.push(`${ready} crop(s) ready to harvest`);
    if (dry) warnings.push(`${dry} plot(s) still dry`);
    if (unfed) warnings.push(`${unfed} animal(s) unfed`);

    const doSleep = async () => {
      this.card.hide();
      const report = sleep();
      refreshSeasonTint(state.meta.season);
      await this.game.save();

      const festival = describeToday();
      const body = describeReport(report) + (festival ? `\n\n🎪 ${festival}` : '');
      this.card.show({
        title: `${seasonName()} ${state.meta.day}, Year ${state.meta.year}`,
        body,
        buttons: [{ label: 'Get up', kind: 'primary', onTap: () => this.card.hide() }],
      });
    };

    if (warnings.length) {
      this.card.show({
        title: 'Turn in already?',
        body: `${warnings.join('\n')}\n\nSleep anyway?`,
        buttons: [
          { label: 'Not yet', kind: 'ghost', onTap: () => this.card.hide() },
          { label: 'Sleep', kind: 'primary', onTap: doSleep },
        ],
      });
    } else {
      await doSleep();
    }
  }

  /* ---- people ------------------------------------------------------------- */

  _talk(npcId) {
    const res = talkTo(npcId);
    const npc = NPCS[npcId];
    const entry = roster().find((r) => r.id === npcId);
    const shop = this._shopOf(npcId);

    const buttons = [{ label: 'Bye', kind: 'ghost', onTap: () => this.card.hide() }];
    if (canGift(npcId)) {
      buttons.push({
        label: 'Gift', kind: 'normal',
        onTap: () => { this.card.hide(); this._openGift(npcId); },
      });
    }
    if (shop) {
      buttons.push({
        label: 'Trade', kind: 'primary',
        onTap: () => { this.card.hide(); this._openShop(shop); },
      });
    }

    const next = entry?.nextReward;
    this.card.show({
      title: `${npc.name} — ${npc.role}`,
      body: `"${res.line}"\n\n${'❤'.repeat(entry?.hearts ?? 0)}${'·'.repeat(10 - (entry?.hearts ?? 0))}  `
          + `${entry?.hearts ?? 0}/10\n`
          + (next ? `At ${(entry?.hearts ?? 0) + 1} hearts: ${next.text}` : 'You could not be closer.'),
      buttons,
    });
  }

  _shopOf(npcId) {
    if (this.inInterior) {
      const here = this.map.npcs.find((n) => n.id === npcId);
      if (here?.shop) return here.shop;
    }
    // Outdoors, a shopkeeper will still sell to you at their stall front.
    return TOWN_BUILDINGS.find((b) => b.npc === npcId)?.shop ?? null;
  }

  _openGift(npcId) {
    this.giftTarget = npcId;
    this.panelKind = 'gift';
    this.list.rowHeight = 56;
    this.list.setItems(
      Object.entries(state.farm.inventory)
        .filter(([itemId, qty]) => qty > 0 && !itemId.startsWith('seed:'))
        .map(([itemId, qty]) => ({ itemId, qty, item: getItem(itemId) }))
        .filter((row) => row.item),
    );
  }

  /* ---- panels ------------------------------------------------------------- */

  _openShop(shopId) {
    this.panelKind = 'shop';
    this.panelShop = shopId;
    this.list.rowHeight = 66;
    this.list.setItems(stockFor(shopId));
  }

  _openSeeds() {
    this.panelKind = 'seeds';
    this.list.rowHeight = 58;
    this.list.setItems(this._availableSeeds());
  }

  _openBin() {
    this.panelKind = 'bin';
    this.list.rowHeight = 56;
    this.list.setItems(state.farm.shippingBin.slice());
  }

  _closePanel() {
    this.panelKind = null;
    this.panelShop = null;
    this.giftTarget = null;
  }

  _availableSeeds() {
    return plantableCrops(state.farm.unlockedCrops, state.meta.season, state.world.biomesUnlocked)
      .map((crop) => ({ cropId: crop.id, crop, held: itemCount(seedId(crop.id)) }))
      .filter((entry) => entry.held > 0);
  }

  _onPanelPick(entry) {
    if (this.panelKind === 'seeds') {
      this.selectedSeed = entry.cropId;
      this._closePanel();
      toast(`Planting ${entry.crop.name}`);
      return;
    }

    if (this.panelKind === 'gift') {
      const res = giveGift(this.giftTarget, entry.itemId);
      const npc = NPCS[this.giftTarget];
      this._closePanel();
      if (!res.ok) { toast(res.reason, 'bad'); return; }
      const face = { loved: '💖', liked: '🙂', neutral: '😐', disliked: '😒' }[res.reaction];
      this.card.show({
        title: `${npc.name} ${face}`,
        body: `"${res.line}"\n\n${res.points > 0 ? '+' : ''}${res.points} affection`,
        buttons: [{ label: 'Close', kind: 'primary', onTap: () => this.card.hide() }],
      });
      return;
    }

    if (this.panelKind === 'shop') {
      const res = purchase(entry, { onFarmChanged: () => this._syncFarm() });
      if (res.kind === 'info') {
        const unit = res.unit;
        this.card.show({
          title: unit.name,
          body: `${unit.role} · ${unit.cost}g for ×${unit.size}\n`
              + `${unit.hp} hp · ${unit.dps} dps · range ${unit.range} · armour ${unit.armor}\n\n`
              + `${unit.desc}\n\nStrong vs: ${unit.counters}\nWeak to: ${unit.counteredBy}`,
          buttons: [{ label: 'Close', kind: 'ghost', onTap: () => this.card.hide() }],
        });
        return;
      }
      toast(res.message, res.ok ? 'gold' : 'bad', 1800);
      this.list.setItems(stockFor(this.panelShop));
    }
  }

  /* ---- rendering ---------------------------------------------------------- */

  render(ctx, view) {
    ctx.fillStyle = this.inInterior ? '#0f0c08' : COLORS.bg;
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.translate(view.w / 2, view.h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    const bounds = this._visibleTiles(view);
    this._renderGround(ctx, bounds);
    this._renderPlots(ctx, bounds);
    this._renderSprites(ctx, bounds);

    ctx.restore();

    if (this.inInterior) this._renderVignette(ctx, view);
    this._renderHud(ctx, view);

    if (this.panelKind) this._renderPanel(ctx, view);
    else {
      this.joystick.render(ctx);
      this.actionBtn.render(ctx);
      this.secondaryBtn.render(ctx);
    }

    this.card.render(ctx, view);

    if (this.transition > 0) {
      ctx.fillStyle = `rgba(6,10,5,${this.transition})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  _visibleTiles(view) {
    const halfW = view.w / 2 / this.camera.zoom;
    const halfH = view.h / 2 / this.camera.zoom;
    // Not clamped to the map: interiors paint wall past their own edge, and
    // outdoors the camera never reaches the border anyway.
    return {
      x0: Math.floor((this.camera.x - halfW) / TILE) - 1,
      y0: Math.floor((this.camera.y - halfH) / TILE) - 2,
      x1: Math.ceil((this.camera.x + halfW) / TILE) + 1,
      y1: Math.ceil((this.camera.y + halfH) / TILE) + 2,
    };
  }

  _renderGround(ctx, b) {
    const interior = this.inInterior;
    for (let ty = b.y0; ty <= b.y1; ty++) {
      for (let tx = b.x0; tx <= b.x1; tx++) {
        const px = tx * TILE;
        const py = ty * TILE;

        // Beyond the edge of a room, keep laying wall so a small interior sits
        // inside a building rather than in a void.
        if (!this.map.inBounds(tx, ty)) {
          if (interior) drawWall(ctx, px, py, this.map.wallStyle);
          continue;
        }

        const tile = this.map.get(tx, ty);
        if (tile === T.WALL) {
          if (interior) drawWall(ctx, px, py, this.map.wallStyle);
          // Outdoors a WALL tile is a building footprint; the building sprite
          // covers it, so just lay grass underneath.
          else drawTile(ctx, T.GRASS, tx, ty, px, py, this.time);
          continue;
        }
        if (tile === T.TREE || tile === T.ROCK || tile === T.FENCE) {
          // Base terrain now; the standing part is drawn in the sorted pass.
          drawTile(ctx, interior ? T.WOOD : T.GRASS, tx, ty, px, py, this.time);
          continue;
        }
        drawTile(ctx, tile, tx, ty, px, py, this.time);
      }
    }
  }

  _renderPlots(ctx, b) {
    if (this.inInterior) return;
    const { width, height } = state.farm;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const t = plotTile(px, py);
        if (t.x < b.x0 || t.x > b.x1 || t.y < b.y0 || t.y > b.y1) continue;
        const plot = plotAt(px, py);
        if (!plot) continue;

        const sx = t.x * TILE;
        const sy = t.y * TILE;

        if (plot.tilled) {
          drawTile(ctx, plot.watered ? T.SOIL_WET : T.SOIL, t.x, t.y, sx, sy, this.time);
        }

        // Soil-quality pips.
        for (let i = 0; i < plot.soil - 1; i++) {
          fillRound(ctx, sx + 3 + i * 5, sy + 3, 3, 3, 1, COLORS.gold);
        }

        if (plot.cropId) {
          const crop = CROPS[plot.cropId];
          drawCrop(ctx, crop.art, sx + TILE / 2, sy + TILE - 4, TILE * 0.78,
                   plot.stage, crop.stages, crop.color, plot.withered);
        }

        const status = plotStatus(plot);
        if (status === 'ready') {
          const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
          ctx.globalAlpha = 0.35 + pulse * 0.45;
          strokeRound(ctx, sx + 1, sy + 1, TILE - 2, TILE - 2, 4, COLORS.gold, 2);
          ctx.globalAlpha = 1;
        } else if (plot.cropId && !plot.watered && !plot.withered
                   && (CROPS[plot.cropId]?.water ?? 0) > 0) {
          fillRound(ctx, sx + TILE - 8, sy + 3, 5, 5, 2, COLORS.rust);
        }
      }
    }
  }

  /**
   * Everything with height, drawn back-to-front by its base Y so the player can
   * walk behind trees, buildings and fences.
   */
  _renderSprites(ctx, b) {
    const sprites = [];

    for (let ty = b.y0; ty <= b.y1; ty++) {
      for (let tx = b.x0; tx <= b.x1; tx++) {
        const tile = this.map.get(tx, ty);
        if (tile === T.TREE || tile === T.ROCK || tile === T.FENCE) {
          sprites.push({
            y: ty * TILE + TILE,
            draw: () => drawTallTile(ctx, tile, tx, ty, tx * TILE, ty * TILE),
          });
        }
      }
    }

    if (!this.inInterior) {
      for (const building of this.map.buildings) {
        if (building.y > b.y1 || building.y + building.h < b.y0) continue;
        sprites.push({
          y: (building.y + building.h) * TILE,
          draw: () => this._drawBuilding(ctx, building),
        });
      }
    }

    for (const obj of this.map.objects) {
      sprites.push({
        y: (obj.y + (obj.h ?? 1)) * TILE,
        draw: () => this._drawObject(ctx, obj),
      });
    }

    for (const decor of this.map.decor ?? []) {
      sprites.push({
        y: (decor.y + 1) * TILE,
        draw: () => this._drawDecor(ctx, decor),
      });
    }

    if (this.inInterior) {
      for (const npc of this.map.npcs) {
        sprites.push({
          y: npc.y * TILE + TILE,
          draw: () => {
            const def = NPCS[npc.id] ?? {};
            drawPerson(ctx, npc.x * TILE + TILE / 2, npc.y * TILE + TILE, DIR.DOWN, 0, {
              shirt: def.color ?? '#8a7f6a', trousers: '#3b3a34',
              hair: '#3a2a1c', skin: '#d8a982',
            });
          },
        });
      }
      this._pushLivestockSprites(sprites, ctx);
    } else {
      for (const npc of this.npcs) {
        sprites.push({ y: npc.y, draw: () => npc.render(ctx) });
      }
    }

    sprites.push({ y: this.player.y, draw: () => this.player.render(ctx) });

    sprites.sort((a, b2) => a.y - b2.y);
    for (const s of sprites) s.draw();

    // Name tag above whatever the action button is pointing at.
    if (this.interaction && !this.panelKind) {
      drawInteractHint(ctx, this.player.x, this.player.y - 44, this.interaction.label);
    }
  }

  _pushLivestockSprites(sprites, ctx) {
    const pen = this.map.livestockPen;
    if (!pen) return;
    const animals = state.farm.livestock.filter((a) => ANIMALS[a.kindId]?.building === pen);
    animals.forEach((animal, i) => {
      const ax = (2 + (i % 4) * 2.4) * TILE;
      const ay = (4 + Math.floor(i / 4) * 2) * TILE;
      sprites.push({
        y: ay + TILE,
        draw: () => {
          drawAnimal(ctx, ANIMALS[animal.kindId].kind, ax, ay + TILE, 38);
          if (animal.produceReady) fillRound(ctx, ax + 12, ay - 4, 8, 8, 4, COLORS.gold);
          if (!animal.fedToday) fillRound(ctx, ax - 18, ay - 4, 8, 8, 4, COLORS.rust);
        },
      });
    });
  }

  _drawBuilding(ctx, b) {
    const x = b.x * TILE;
    const y = b.y * TILE;
    const w = b.w * TILE;
    const h = b.h * TILE;
    const roofH = TILE * 1.6;

    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(x + 6, y + h - 6, w, 10);

    // Facade.
    ctx.fillStyle = '#6b5942';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(x, y + h - 10, w, 10);
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 1;
    for (let i = 1; i < b.w; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * TILE + 0.5, y);
      ctx.lineTo(x + i * TILE + 0.5, y + h);
      ctx.stroke();
    }

    // Roof, overhanging both sides.
    ctx.fillStyle = b.roof ?? '#7a4b32';
    ctx.beginPath();
    ctx.moveTo(x - 10, y + roofH);
    ctx.lineTo(x + w / 2, y - roofH * 0.5);
    ctx.lineTo(x + w + 10, y + roofH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.fillRect(x - 10, y + roofH - 5, w + 20, 6);

    // Windows either side of the door.
    ctx.fillStyle = '#d8b45a';
    const winY = y + h - TILE * 1.6;
    for (const wx of [x + TILE * 0.8, x + w - TILE * 1.8]) {
      ctx.fillRect(wx, winY, TILE * 0.9, TILE * 0.7);
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.strokeRect(wx, winY, TILE * 0.9, TILE * 0.7);
    }

    // Door.
    const dx = b.doorX * TILE;
    const dy = y + h - TILE;
    ctx.fillStyle = '#3d2c1c';
    ctx.fillRect(dx + 3, dy - TILE * 0.4, TILE - 6, TILE * 1.4);
    ctx.fillStyle = '#c8a24e';
    ctx.beginPath();
    ctx.arc(dx + TILE - 9, dy + TILE * 0.3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Hanging sign.
    if (b.name) {
      const sw = Math.max(64, b.name.length * 7);
      const sx = x + w / 2 - sw / 2;
      const sy = y + h - TILE * 2.5;
      fillRound(ctx, sx, sy, sw, 18, 4, '#3d2c1c');
      text(ctx, b.name, x + w / 2, sy + 9, {
        size: 10, color: COLORS.gold, align: 'center', weight: 700, maxWidth: sw - 6,
      });
    }
  }

  _drawObject(ctx, obj) {
    const x = obj.x * TILE;
    const y = obj.y * TILE;
    const w = (obj.w ?? 1) * TILE;
    const h = (obj.h ?? 1) * TILE;

    switch (obj.kind) {
      case 'bin': {
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h - 4, w * 0.45, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b4f33';
        ctx.fillRect(x + 4, y + 6, w - 8, h - 12);
        ctx.fillStyle = '#87673f';
        ctx.fillRect(x + 4, y + 2, w - 8, 10);
        ctx.strokeStyle = 'rgba(0,0,0,.3)';
        ctx.strokeRect(x + 4, y + 6, w - 8, h - 12);
        const value = binValue();
        if (value > 0) {
          text(ctx, `${value}g`, x + w / 2, y - 6, {
            size: 11, color: COLORS.gold, align: 'center', weight: 700,
          });
        }
        break;
      }
      case 'well':
        ctx.fillStyle = '#57544d';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#243d4f';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w * 0.3, h * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b4f33';
        ctx.fillRect(x + 4, y - 22, 5, 34);
        ctx.fillRect(x + w - 9, y - 22, 5, 34);
        ctx.fillStyle = '#8a4a30';
        ctx.fillRect(x - 2, y - 30, w + 4, 10);
        break;

      case 'warcamp': {
        // A tent, a banner, and the standing stones of a mustering ground.
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h - 4, w * 0.5, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5d6a4a';
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y - 18);
        ctx.lineTo(x + w + 2, y + h - 6);
        ctx.lineTo(x - 2, y + h - 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2a2018';
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + 6);
        ctx.lineTo(x + w * 0.72, y + h - 6);
        ctx.lineTo(x + w * 0.28, y + h - 6);
        ctx.closePath();
        ctx.fill();

        const sway = Math.sin(this.time * 1.6) * 3;
        ctx.fillStyle = '#6b563a';
        ctx.fillRect(x + w - 6, y - 44, 4, 52);
        ctx.fillStyle = COLORS.rust;
        ctx.beginPath();
        ctx.moveTo(x + w - 2, y - 44);
        ctx.lineTo(x + w + 24 + sway, y - 36);
        ctx.lineTo(x + w - 2, y - 26);
        ctx.closePath();
        ctx.fill();

        drawMech(ctx, 'harvester', x + 8, y + h - 8, 30, { team: 'ally', facing: -1 });
        break;
      }

      case 'sign':
        ctx.fillStyle = '#6b563a';
        ctx.fillRect(x + w / 2 - 3, y, 6, h);
        fillRound(ctx, x - 16, y - 22, w + 32, 22, 4, '#7d6142');
        strokeRound(ctx, x - 16, y - 22, w + 32, 22, 4, '#3d2c1c', 2);
        text(ctx, obj.label, x + w / 2, y - 11, {
          size: 10, color: '#2a2018', align: 'center', weight: 700,
        });
        break;

      case 'bed':
        ctx.fillStyle = '#6b4f33';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.fillStyle = '#b8c4cf';
        ctx.fillRect(x + 5, y + 5, w - 10, h * 0.55);
        ctx.fillStyle = '#e8e2cf';
        ctx.fillRect(x + 7, y + 7, w - 14, h * 0.2);
        break;

      case 'trough':
        ctx.fillStyle = '#6b4f33';
        ctx.fillRect(x + 2, y + 8, w - 4, h - 12);
        ctx.fillStyle = '#a58a4c';
        ctx.fillRect(x + 5, y + 11, w - 10, h - 20);
        break;

      default:
        break;
    }
  }

  _drawDecor(ctx, d) {
    const x = d.x * TILE;
    const y = d.y * TILE;
    switch (d.kind) {
      case 'crate':
        ctx.fillStyle = '#7d6142';
        ctx.fillRect(x + 3, y + 4, TILE - 6, TILE - 8);
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.strokeRect(x + 3, y + 4, TILE - 6, TILE - 8);
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 4); ctx.lineTo(x + TILE - 3, y + TILE - 4);
        ctx.stroke();
        break;
      case 'plant':
        ctx.fillStyle = '#7a4b32';
        ctx.fillRect(x + 9, y + 18, TILE - 18, 11);
        ctx.fillStyle = '#4f7a35';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + 13, 10, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'hay':
        ctx.fillStyle = '#a58a4c';
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2, y + TILE * 0.6, 14, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.22)';
        ctx.beginPath();
        ctx.ellipse(x + TILE / 2, y + TILE * 0.6, 8, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'anvil':
        ctx.fillStyle = '#3d3a36';
        ctx.fillRect(x + 6, y + 18, TILE - 12, 8);
        ctx.fillRect(x + 10, y + 12, TILE - 20, 8);
        break;
      case 'forge':
        ctx.fillStyle = '#4a4038';
        ctx.fillRect(x + 3, y + 6, TILE - 6, TILE - 8);
        ctx.fillStyle = '#d8703a';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE * 0.6,
                6 + Math.sin(this.time * 5) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'scrap':
        ctx.fillStyle = '#57606a';
        for (let i = 0; i < 4; i++) {
          const r = tileHash(d.x, d.y, i);
          ctx.fillRect(x + 4 + r * 18, y + 10 + i * 4, 12, 5);
        }
        break;
      case 'mech':
        drawMech(ctx, 'harvester', x + TILE / 2, y + TILE, 30, { team: 'ally', facing: 1 });
        break;
      case 'board':
        ctx.fillStyle = '#6b4f33';
        ctx.fillRect(x + 2, y + 4, TILE - 4, TILE - 8);
        ctx.fillStyle = '#e8e2cf';
        for (let i = 0; i < 3; i++) ctx.fillRect(x + 6 + (i % 2) * 11, y + 8 + i * 6, 9, 5);
        break;
      case 'table':
        ctx.fillStyle = '#7d6142';
        ctx.fillRect(x - 4, y + 8, TILE + 8, TILE - 14);
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(x - 4, y + TILE - 8, TILE + 8, 4);
        break;
      default:
        break;
    }
  }

  _renderVignette(ctx, view) {
    // Interiors get a soft edge so the small room doesn't float in black.
    const g = ctx.createRadialGradient(
      view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.35,
      view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  /* ---- HUD ----------------------------------------------------------------- */

  _renderHud(ctx, view) {
    drawHud(ctx, view, state);

    const y = hudBottom(view) + 8;
    let x = 12;
    const ready = countReady();
    const dry = countUnwatered();
    const produce = readyProduceCount();
    const unfed = untendedCount();

    if (this.inInterior) {
      x += pill(ctx, x, y, this.map.name ?? 'Inside', { color: COLORS.ink }) + 6;
    } else {
      if (ready) x += pill(ctx, x, y, `${ready} ready`, { color: COLORS.gold }) + 6;
      if (dry) x += pill(ctx, x, y, `${dry} dry`, { color: COLORS.rust }) + 6;
      if (produce) x += pill(ctx, x, y, `${produce} to collect`, { color: COLORS.green }) + 6;
      if (unfed) pill(ctx, x, y, `${unfed} unfed`, { color: COLORS.rust });
    }

    // Watering can gauge.
    const can = state.farm.wateringCan;
    const gy = view.h - view.safeBottom - 30;
    bar(ctx, 12, gy, 84, 8, can.water / can.capacity, {
      fill: COLORS.water, edge: COLORS.panelEdge,
    });
    text(ctx, `💧 ${can.water}/${can.capacity}`, 102, gy + 4, {
      size: 11, color: COLORS.inkDim, weight: 500,
    });

    // Selected-seed chip: the only persistent control on screen.
    const seeds = this._availableSeeds();
    this.seedBtn.visible = seeds.length > 0 && !this.inInterior;
    if (this.seedBtn.visible) {
      const label = this.selectedSeed ? CROPS[this.selectedSeed].name : 'Seed';
      this.seedBtn.label = `🌱 ${label}`;
      this.seedBtn.setRect(12, view.h - view.safeBottom - 76, 140, 38);
      this.seedBtn.render(ctx);
      const held = this.selectedSeed ? itemCount(seedId(this.selectedSeed)) : 0;
      text(ctx, `×${held}`, 160, view.h - view.safeBottom - 57, {
        size: 12, color: COLORS.inkDim, weight: 600,
      });
    }
  }

  /* ---- panel rendering ----------------------------------------------------- */

  _layoutPanel(view) {
    const pw = Math.min(view.w - 24, 460);
    this.panelRect = {
      x: (view.w - pw) / 2,
      y: view.safeTop + 70,
      w: pw,
      h: view.h - view.safeTop - view.safeBottom - 150,
    };
    this.list.setRect(this.panelRect.x + 12, this.panelRect.y + 58,
                      this.panelRect.w - 24, this.panelRect.h - 128);
    this.closeBtn.setRect(this.panelRect.x + 12,
                          this.panelRect.y + this.panelRect.h - 58,
                          this.panelRect.w - 24, 46);
  }

  _renderPanel(ctx, view) {
    this._layoutPanel(view);
    const r = this.panelRect;
    ctx.fillStyle = 'rgba(6,10,5,.66)';
    ctx.fillRect(0, 0, view.w, view.h);
    panel(ctx, r.x, r.y, r.w, r.h);

    const titles = {
      shop: (NPCS[this._npcForShop(this.panelShop)]?.name ?? 'Counter').toUpperCase(),
      seeds: 'SEED POUCH',
      bin: 'SHIPPING BIN',
      gift: `A GIFT FOR ${(NPCS[this.giftTarget]?.name ?? '').toUpperCase()}`,
    };
    text(ctx, titles[this.panelKind] ?? '', r.x + 16, r.y + 26, { size: 14, color: COLORS.gold });

    const subtitle = {
      shop: SHOP_BLURB[this.panelShop] ?? '',
      seeds: `Plantable in ${seasonName()}.`,
      bin: `${binValue()}g overnight`,
      gift: this.giftTarget
        ? `Loves: ${(NPCS[this.giftTarget]?.loves ?? []).map(itemName).join(', ')}`
        : '',
    }[this.panelKind] ?? '';
    text(ctx, subtitle, r.x + 16, r.y + 46, {
      size: 11, color: COLORS.inkDim, weight: 500, maxWidth: r.w - 32,
    });

    if (!this.list.items.length) {
      const empty = {
        shop: 'Nothing in stock.',
        seeds: `No seeds you can sow in ${seasonName()}.`,
        bin: 'Empty. Harvest something.',
        gift: 'Nothing in your pack to give.',
      }[this.panelKind];
      text(ctx, empty ?? '', r.x + r.w / 2, r.y + r.h / 2 - 20, {
        size: 13, color: COLORS.inkFaint, align: 'center', weight: 500,
      });
    } else if (this.panelKind === 'seeds') {
      this._renderSeedRows(ctx);
    } else if (this.panelKind === 'bin') {
      this._renderBinRows(ctx);
    } else if (this.panelKind === 'gift') {
      this._renderGiftRows(ctx);
    } else {
      this._renderShopRows(ctx);
    }

    this.closeBtn.render(ctx);
  }

  _npcForShop(shopId) {
    return TOWN_BUILDINGS.find((b) => b.shop === shopId)?.npc ?? null;
  }

  _renderSeedRows(ctx) {
    this.list.render(ctx, (c, entry, x, y, w, h) => {
      const selected = entry.cropId === this.selectedSeed;
      fillRound(c, x, y, w, h, 10, selected ? '#33482a' : COLORS.panelDeep);
      if (selected) strokeRound(c, x, y, w, h, 10, COLORS.green, 2);
      drawCrop(c, entry.crop.art, x + 26, y + h - 10, 34,
               entry.crop.stages - 1, entry.crop.stages, entry.crop.color);
      text(c, entry.crop.name, x + 50, y + 18, { size: 14, color: COLORS.ink });
      text(c, `${entry.crop.growDays}d${entry.crop.regrowDays ? ` · regrows ${entry.crop.regrowDays}d` : ''}`,
           x + 50, y + 38, { size: 11, color: COLORS.inkDim, weight: 500 });
      text(c, `×${entry.held}`, x + w - 12, y + 20, { size: 14, color: COLORS.gold, align: 'right' });
      text(c, `${sellValue(entry.cropId)}g`, x + w - 12, y + 40, {
        size: 11, color: COLORS.inkDim, align: 'right', weight: 500,
      });
    });
  }

  _renderBinRows(ctx) {
    this.list.render(ctx, (c, entry, x, y, w, h) => {
      const item = getItem(entry.itemId);
      fillRound(c, x, y, w, h, 10, COLORS.panelDeep);
      const q = ['', ' ⭐', ' ✨'][entry.quality] ?? '';
      text(c, `${item?.icon ?? '•'} ${item?.name ?? entry.itemId}${q}`, x + 12, y + 20,
           { size: 14, color: COLORS.ink });
      text(c, `×${entry.qty}`, x + 12, y + 40, { size: 11, color: COLORS.inkDim, weight: 500 });
      text(c, `${sellValue(entry.itemId, entry.quality) * entry.qty}g`, x + w - 12, y + h / 2, {
        size: 14, color: COLORS.gold, align: 'right',
      });
    });
  }

  _renderGiftRows(ctx) {
    const npc = NPCS[this.giftTarget];
    this.list.render(ctx, (c, entry, x, y, w, h) => {
      fillRound(c, x, y, w, h, 10, COLORS.panelDeep);
      const loved = npc.loves.includes(entry.itemId);
      const liked = npc.likes.includes(entry.itemId);
      const disliked = npc.dislikes.includes(entry.itemId);
      text(c, `${entry.item.icon ?? '•'} ${entry.item.name}`, x + 12, y + h / 2 - 8,
           { size: 14, color: COLORS.ink });
      text(c, `×${entry.qty}`, x + 12, y + h / 2 + 12,
           { size: 11, color: COLORS.inkDim, weight: 500 });
      const tag = loved ? 'loves it' : liked ? 'likes it' : disliked ? 'dislikes it' : '';
      if (tag) {
        text(c, tag, x + w - 12, y + h / 2, {
          size: 11, align: 'right', weight: 600,
          color: loved ? COLORS.gold : liked ? COLORS.green : COLORS.rust,
        });
      }
    });
  }

  _renderShopRows(ctx) {
    const gold = state.meta.gold;
    this.list.render(ctx, (c, entry, x, y, w, h) => {
      fillRound(c, x, y, w, h, 10, COLORS.panelDeep);

      switch (entry.kind) {
        case 'seed': {
          const crop = entry.crop;
          c.globalAlpha = entry.inSeason ? 1 : 0.45;
          drawCrop(c, crop.art, x + 24, y + h - 10, 32, crop.stages - 1, crop.stages, crop.color);
          text(c, crop.name, x + 48, y + 18, { size: 14, color: COLORS.ink });
          text(c, entry.inSeason
                ? `${crop.growDays}d · sells ${crop.sellPrice}g`
                : `out of season (${crop.seasons.map((s) => seasonName(s)).join('/')})`,
               x + 48, y + 36, { size: 10, color: COLORS.inkDim, weight: 500 });
          if (entry.held) {
            text(c, `have ${entry.held}`, x + 48, y + 52,
                 { size: 10, color: COLORS.green, weight: 500 });
          }
          text(c, `${entry.price}g`, x + w - 12, y + h / 2, {
            size: 15, color: gold >= entry.price ? COLORS.gold : COLORS.inkFaint, align: 'right',
          });
          c.globalAlpha = 1;
          break;
        }
        case 'animal':
          drawAnimal(c, entry.animal.kind, x + 28, y + h - 12, 34);
          text(c, entry.animal.name, x + 56, y + 18, { size: 14, color: COLORS.ink });
          text(c, entry.animal.desc, x + 56, y + 36, {
            size: 10, color: COLORS.inkDim, weight: 500, maxWidth: w - 130,
          });
          text(c, `${entry.housed}/${entry.capacity} housed`, x + 56, y + 52, {
            size: 10, color: entry.room ? COLORS.green : COLORS.rust, weight: 600,
          });
          text(c, `${entry.price}g`, x + w - 12, y + h / 2, {
            size: 15, align: 'right',
            color: gold >= entry.price && entry.room ? COLORS.gold : COLORS.inkFaint,
          });
          break;

        case 'info':
          drawMech(c, entry.unit.id, x + 28, y + h - 10, h * 0.6, { team: 'ally', facing: -1 });
          text(c, entry.unit.name, x + 56, y + 18, { size: 14, color: COLORS.ink });
          text(c, `${entry.unit.role} · ${entry.unit.hp}hp · ${entry.unit.dps}dps`,
               x + 56, y + 36, { size: 10, color: COLORS.inkDim, weight: 500 });
          text(c, 'tap for details', x + 56, y + 52,
               { size: 9, color: COLORS.inkFaint, weight: 500 });
          text(c, `${entry.price}g`, x + w - 12, y + h / 2 - 8,
               { size: 14, color: COLORS.gold, align: 'right' });
          text(c, 'bought at the front', x + w - 12, y + h / 2 + 12, {
            size: 9, color: COLORS.inkFaint, align: 'right', weight: 500,
          });
          break;

        case 'upgrade':
        case 'building':
          text(c, `${entry.label}${entry.level > 0 ? ` (lv ${entry.level})` : ''}`,
               x + 12, y + 20, { size: 14, color: COLORS.ink });
          text(c, entry.desc, x + 12, y + 40, {
            size: 10, color: COLORS.inkDim, weight: 500, maxWidth: w - 110,
          });
          text(c, `${entry.price}g`, x + w - 12, y + h / 2, {
            size: 15, color: gold >= entry.price ? COLORS.gold : COLORS.inkFaint, align: 'right',
          });
          break;

        case 'buy':
        case 'sell': {
          const selling = entry.kind === 'sell';
          text(c, `${entry.item.icon} ${entry.item.name}`, x + 12, y + 20,
               { size: 14, color: COLORS.ink });
          text(c, selling ? `you have ${entry.held}` : (entry.item.desc ?? ''), x + 12, y + 40, {
            size: 10, color: COLORS.inkDim, weight: 500, maxWidth: w - 110,
          });
          text(c, `${selling ? '+' : ''}${entry.price}g`, x + w - 12, y + h / 2, {
            size: 15, align: 'right',
            color: selling ? COLORS.green : (gold >= entry.price ? COLORS.gold : COLORS.inkFaint),
          });
          break;
        }

        case 'research': {
          const node = entry.node;
          c.globalAlpha = entry.owned ? 0.5 : 1;
          text(c, node.name, x + 12, y + 18, {
            size: 14, color: entry.owned ? COLORS.green : COLORS.ink,
          });
          text(c, node.desc, x + 12, y + 38, {
            size: 10, color: COLORS.inkDim, weight: 500, maxWidth: w - 110,
          });
          const items = Object.entries(node.items ?? {})
            .map(([id, q]) => `${q} ${itemName(id)}`).join(', ');
          text(c, items, x + 12, y + 54, { size: 9, color: COLORS.inkFaint, weight: 500 });
          text(c, entry.owned ? '✓ known' : `${node.gold}g`, x + w - 12, y + h / 2, {
            size: 14, align: 'right',
            color: entry.owned ? COLORS.green : entry.affordable ? COLORS.gold : COLORS.inkFaint,
          });
          c.globalAlpha = 1;
          break;
        }

        default:
          break;
      }
    });
  }

  back() {
    if (this.card.visible) { this.card.hide(); return true; }
    if (this.panelKind) { this._closePanel(); return true; }
    if (this.inInterior) {
      const door = this.map.doors.find((d) => d.to === 'overworld');
      if (door) { this._enterDoor(door); return true; }
    }
    return false;
  }
}
