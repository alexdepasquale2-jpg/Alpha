// The farm: a tappable plot grid, a tool belt, and the routes out to town,
// the map and bed.

import { Scene } from '../core/scene.js';
import { Camera } from '../render/camera.js';
import { Button, Card, ScrollList } from '../ui/widgets.js';
import { COLORS, text, panel, fillRound, strokeRound, bar } from '../ui/theme.js';
import { drawCrop, drawAnimal } from '../render/sprites.js';
import { drawHud, hudBottom, pill } from '../ui/hud.js';
import { toast } from '../ui/toast.js';
import { emit, EVENTS } from '../core/events.js';
import { CROPS, plantableCrops } from '../data/crops.js';
import { getItem, seedId, sellValue } from '../data/items.js';
import {
  state, itemCount, plotAt, seasonName,
} from '../core/state.js';
import {
  till, plant, water, harvest, fertilize, clearPlot, refillCan, sleep,
  plotStatus, daysUntilHarvest, describeReport, countReady, countUnwatered,
  binValue, ENERGY,
} from './farmSim.js';
import { untendedCount, readyProduceCount, tendAll, collectAll } from './livestock.js';

const CELL = 64;          // world units per plot
const TOOLBAR_H = 76;

export const TOOLS = [
  { id: 'hoe',    icon: '⛏️', label: 'Till',    energy: ENERGY.till },
  { id: 'seed',   icon: '🌱', label: 'Plant',   energy: ENERGY.plant },
  { id: 'can',    icon: '💧', label: 'Water',   energy: ENERGY.water },
  { id: 'hand',   icon: '🧤', label: 'Harvest', energy: ENERGY.harvest },
  { id: 'fert',   icon: '💩', label: 'Feed',    energy: ENERGY.fertilize },
];

export class FarmScene extends Scene {
  constructor(game) {
    super(game);
    this.name = 'FarmScene';
    this.camera = new Camera();
    this.tool = 'hoe';
    this.selectedSeed = null;
    this.panel = null;          // 'seeds' | 'bin' | 'animals' | null
    this.card = new Card();
    this.list = new ScrollList({ rowHeight: 58 });
    this.hover = null;
    this._cameraMoved = false;
    this._buildButtons();
  }

  _buildButtons() {
    this.toolButtons = TOOLS.map((t) => new Button({
      label: t.label, icon: t.icon, id: t.id,
      onTap: () => this._selectTool(t.id),
    }));
    this.nav = {
      sleep: new Button({ label: 'Sleep', icon: '🛏️', kind: 'primary', onTap: () => this._sleep() }),
      town:  new Button({ label: 'Town', icon: '🏘️', onTap: () => this._goTown() }),
      map:   new Button({ label: 'March', icon: '⚔️', kind: 'gold', onTap: () => this._goMap() }),
      bin:   new Button({ label: 'Bin', icon: '📦', onTap: () => this._togglePanel('bin') }),
      close: new Button({ label: 'Close', kind: 'ghost', onTap: () => { this.panel = null; } }),
      pond:  new Button({ label: 'Refill', icon: '🪣', kind: 'ghost', onTap: () => this._refill() }),
    };
  }

  enter() {
    this._updateBounds();
    this._layout(this.game.view);
    this.camera.fitWidth(10);
    // Pick a sensible default seed so the Plant tool is usable immediately.
    this.selectedSeed = this._availableSeeds()[0]?.cropId ?? null;
  }

  onResize(view) {
    this._updateBounds();
    this._layout(view);
    this.camera.fitWidth(10);
  }

  /**
   * Bounds cover the plot grid plus the farmstead strip beneath it (pond and
   * animal pens). Recomputed on resize because winning land adds rows.
   */
  _updateBounds() {
    const { width, height, livestock } = state.farm;
    const penRows = Math.ceil(livestock.length / Math.max(1, Math.floor((width * CELL) / 56)));
    const farmsteadH = 70 + penRows * 46;
    this.camera.setBounds(-24, -24, width * CELL + 48, height * CELL + 48 + farmsteadH);
  }

  _layout(view) {
    const top = hudBottom(view);
    const bottom = view.h - view.safeBottom - TOOLBAR_H - 62;
    this.camera.setViewport(0, top, view.w, Math.max(120, bottom - top));

    // Tool belt.
    const pad = 8;
    const n = this.toolButtons.length;
    const bw = (view.w - pad * (n + 1)) / n;
    const by = view.h - view.safeBottom - TOOLBAR_H;
    this.toolButtons.forEach((b, i) => b.setRect(pad + i * (bw + pad), by, bw, 56));

    // Nav row above the tool belt.
    const navY = by - 56;
    const navKeys = ['sleep', 'town', 'map', 'bin'];
    const nw = (view.w - pad * (navKeys.length + 1)) / navKeys.length;
    navKeys.forEach((key, i) => this.nav[key].setRect(pad + i * (nw + pad), navY, nw, 48));

    // Panel overlay geometry.
    const pw = Math.min(view.w - 24, 420);
    this.panelRect = { x: (view.w - pw) / 2, y: top + 20, w: pw, h: view.h - top - 140 };
    this.list.setRect(this.panelRect.x + 12, this.panelRect.y + 52,
                      this.panelRect.w - 24, this.panelRect.h - 122);
    this.nav.close.setRect(this.panelRect.x + 12,
                           this.panelRect.y + this.panelRect.h - 58,
                           this.panelRect.w - 24, 46);
    this.nav.pond.setRect(view.w - 108, this.camera.viewport.y + 8, 96, 40);
  }

  /* ---- input ------------------------------------------------------------ */

  handleInput(input) {
    const view = this.game.view;
    this._layout(view);

    if (this.card.visible) return this.card.handleInput(input, view);

    if (this.panel) {
      const picked = this.list.handleInput(input);
      if (picked) this._onPanelPick(picked);
      return this.nav.close.tryTap(input.tap);
    }

    // A pan should never also register as a plot tap.
    this._cameraMoved = this.camera.handleInput(input);

    const tap = input.tap;
    if (tap) {
      for (const b of this.toolButtons) if (b.tryTap(tap)) return true;
      for (const key of ['sleep', 'town', 'map', 'bin', 'pond']) {
        if (this.nav[key].tryTap(tap)) return true;
      }
      if (this.camera.containsScreen(tap.x, tap.y) && !this._cameraMoved) {
        this._tapPlot(tap);
        return true;
      }
    }

    const held = input.takeLongPress();
    if (held && this.camera.containsScreen(held.x, held.y)) {
      this._inspectPlot(held);
      return true;
    }
    return false;
  }

  _plotAtScreen(point) {
    const world = this.camera.screenToWorld(point.x, point.y);
    const gx = Math.floor(world.x / CELL);
    const gy = Math.floor(world.y / CELL);
    return plotAt(gx, gy);
  }

  _selectTool(id) {
    this.tool = id;
    if (id === 'seed') {
      const seeds = this._availableSeeds();
      if (!seeds.length) {
        toast('No seeds for this season — buy some in town.', 'bad');
        this.tool = 'hoe';
        return;
      }
      // Opening the picker on select saves a tap in the common case.
      if (!this.selectedSeed || !seeds.some((s) => s.cropId === this.selectedSeed)) {
        this.selectedSeed = seeds[0].cropId;
      }
      this._togglePanel('seeds');
    }
  }

  _tapPlot(point) {
    const plot = this._plotAtScreen(point);
    if (!plot) return;

    let result;
    switch (this.tool) {
      case 'hoe':  result = till(plot.x, plot.y); break;
      case 'can':  result = water(plot.x, plot.y); break;
      case 'fert': result = fertilize(plot.x, plot.y); break;
      case 'hand':
        result = plot.withered ? clearPlot(plot.x, plot.y) : harvest(plot.x, plot.y);
        break;
      case 'seed':
        if (!this.selectedSeed) { this._togglePanel('seeds'); return; }
        result = plant(plot.x, plot.y, this.selectedSeed);
        break;
      default: return;
    }

    if (!result.ok) {
      toast(result.reason, 'bad', 1500);
      return;
    }
    if (this.tool === 'hand' && result.crop) {
      const q = result.quality ? ['', '⭐', '✨'][result.quality] : '';
      toast(`+${result.qty} ${result.crop.name}${q} → bin`, 'gold', 1400);
    }
    if (this.tool === 'seed' && itemCount(seedId(this.selectedSeed)) === 0) {
      toast(`Last ${CROPS[this.selectedSeed].name} seed planted.`);
    }
  }

  _inspectPlot(point) {
    const plot = this._plotAtScreen(point);
    if (!plot) return;
    const lines = [`Soil quality ${'★'.repeat(plot.soil)}${'☆'.repeat(3 - plot.soil)}`];
    if (plot.cropId) {
      const crop = CROPS[plot.cropId];
      lines.push(crop.name);
      if (plot.withered) lines.push('Withered — clear it with the glove.');
      else {
        const left = daysUntilHarvest(plot);
        lines.push(left > 0 ? `${left} day(s) to harvest` : 'Ready to harvest');
        lines.push(plot.watered ? 'Watered today' : `Dry for ${plot.dryDays} day(s)`);
        lines.push(`Sells for ${sellValue(crop.id)}g`);
      }
    } else {
      lines.push(plot.tilled ? 'Tilled and empty' : 'Untilled ground');
    }
    this.card.show({
      title: `Plot ${plot.x + 1}, ${plot.y + 1}`,
      body: lines.join('\n'),
      buttons: [{ label: 'OK', kind: 'primary', onTap: () => this.card.hide() }],
    });
  }

  _togglePanel(which) {
    this.panel = this.panel === which ? null : which;
    if (this.panel === 'seeds') this.list.setItems(this._availableSeeds());
    if (this.panel === 'bin') this.list.setItems(state.farm.shippingBin.slice());
  }

  _availableSeeds() {
    return plantableCrops(state.farm.unlockedCrops, state.meta.season, state.world.biomesUnlocked)
      .map((crop) => ({ cropId: crop.id, crop, held: itemCount(seedId(crop.id)) }))
      .filter((entry) => entry.held > 0);
  }

  _onPanelPick(entry) {
    if (this.panel === 'seeds') {
      this.selectedSeed = entry.cropId;
      this.tool = 'seed';
      this.panel = null;
      toast(`Planting ${entry.crop.name}`);
    }
  }

  _refill() {
    refillCan();
    toast('Watering can refilled.');
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
      await this.game.save();

      // A festival today gets mentioned in the morning card, not buried.
      const { describeToday } = await import('../town/festivals.js');
      const festival = describeToday();
      const body = describeReport(report) + (festival ? `\n\n🎪 ${festival}` : '');

      this.card.show({
        title: `${seasonName()} ${state.meta.day}, Year ${state.meta.year}`,
        body,
        buttons: festival
          ? [
              { label: 'Get up', kind: 'ghost', onTap: () => this.card.hide() },
              { label: 'To town', kind: 'primary', onTap: () => { this.card.hide(); this._goTown(); } },
            ]
          : [{ label: 'Get up', kind: 'primary', onTap: () => this.card.hide() }],
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

  async _goTown() {
    const { TownScene } = await import('../town/townScene.js');
    this.game.scenes.push(new TownScene(this.game));
  }

  async _goMap() {
    const { MapScene } = await import('../map/mapScene.js');
    this.game.scenes.push(new MapScene(this.game));
  }

  update(dt) {
    for (const b of this.toolButtons) b.update(dt);
    for (const b of Object.values(this.nav)) b.update(dt);
  }

  /* ---- render ----------------------------------------------------------- */

  render(ctx, view) {
    this._layout(view);
    this._renderGround(ctx, view);

    this.camera.apply(ctx);
    this._renderPlots(ctx);
    this._renderFarmstead(ctx);
    this.camera.restore(ctx);

    this._renderCounters(ctx, view);
    drawHud(ctx, view, state);
    this._renderToolbar(ctx, view);
    this.nav.pond.render(ctx);

    if (this.panel) this._renderPanel(ctx, view);
    this.card.render(ctx, view);
  }

  _renderGround(ctx, view) {
    const v = this.camera.viewport;
    const grad = ctx.createLinearGradient(0, v.y, 0, v.y + v.h);
    grad.addColorStop(0, '#22301c');
    grad.addColorStop(1, '#161e12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, v.y, view.w, v.h);
  }

  _renderPlots(ctx) {
    const { width, height, plots } = state.farm;

    for (const plot of plots) {
      const x = plot.x * CELL;
      const y = plot.y * CELL;
      const status = plotStatus(plot);

      let fill = '#33452a';                       // wild grass
      if (plot.tilled) fill = plot.watered ? COLORS.soilWet : COLORS.soilTilled;
      if (status === 'withered') fill = '#3d3226';

      fillRound(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 6, fill);

      // Tilled furrows read as "worked ground" at a glance.
      if (plot.tilled) {
        ctx.strokeStyle = 'rgba(0,0,0,.22)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x + 6, y + (CELL / 4) * i);
          ctx.lineTo(x + CELL - 6, y + (CELL / 4) * i);
          ctx.stroke();
        }
      }

      if (plot.soil > 1) {
        for (let i = 0; i < plot.soil - 1; i++) {
          fillRound(ctx, x + 6 + i * 7, y + 6, 5, 5, 2, COLORS.gold);
        }
      }

      if (plot.cropId) {
        const crop = CROPS[plot.cropId];
        drawCrop(ctx, crop.art, x + CELL / 2, y + CELL - 10, CELL * 0.62,
                 plot.stage, crop.stages, crop.color, plot.withered);
      }

      if (status === 'ready') {
        strokeRound(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 6, COLORS.gold, 2);
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320);
        ctx.globalAlpha = 0.3 + pulse * 0.4;
        fillRound(ctx, x + CELL - 16, y + 6, 10, 10, 5, COLORS.gold);
        ctx.globalAlpha = 1;
      } else if (plot.cropId && !plot.watered && CROPS[plot.cropId].water > 0 && !plot.withered) {
        fillRound(ctx, x + CELL - 16, y + 6, 10, 10, 5, COLORS.rust);
      }
    }

    // Fence around the whole plot block.
    ctx.strokeStyle = '#54452e';
    ctx.lineWidth = 3;
    strokeRound(ctx, -6, -6, width * CELL + 12, height * CELL + 12, 8, '#54452e', 3);
  }

  _renderFarmstead(ctx) {
    const { width, height, livestock } = state.farm;
    const baseY = height * CELL + 26;

    // Pond sits below the field, inside the camera bounds so it never clips.
    ctx.fillStyle = COLORS.water;
    ctx.beginPath();
    ctx.ellipse(width * CELL - 54, baseY - 18, 44, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'pond', width * CELL - 54, baseY - 18, {
      size: 10, color: 'rgba(255,255,255,.75)', align: 'center', weight: 600,
    });

    livestock.forEach((animal, i) => {
      const per = Math.max(1, Math.floor((width * CELL) / 56));
      const ax = (i % per) * 56 + 28;
      const ay = baseY + 40 + Math.floor(i / per) * 46;
      drawAnimal(ctx, animal.kindId, ax, ay, 40);
      if (animal.produceReady) {
        fillRound(ctx, ax + 14, ay - 46, 10, 10, 5, COLORS.gold);
      }
      if (!animal.fedToday) {
        fillRound(ctx, ax - 22, ay - 46, 10, 10, 5, COLORS.rust);
      }
    });
  }

  _renderCounters(ctx, view) {
    const y = this.camera.viewport.y + 8;
    let x = 12;
    const ready = countReady();
    const dry = countUnwatered();
    const unfed = untendedCount();
    const produce = readyProduceCount();

    if (ready) x += pill(ctx, x, y, `${ready} ready`, { color: COLORS.gold }) + 6;
    if (dry) x += pill(ctx, x, y, `${dry} dry`, { color: COLORS.rust }) + 6;
    if (produce) x += pill(ctx, x, y, `${produce} to collect`, { color: COLORS.green }) + 6;
    if (unfed) pill(ctx, x, y, `${unfed} unfed`, { color: COLORS.rust });

    // Watering can gauge, bottom-left of the field view.
    const can = state.farm.wateringCan;
    const gy = this.camera.viewport.y + this.camera.viewport.h - 22;
    bar(ctx, 12, gy, 88, 8, can.water / can.capacity, { fill: COLORS.water, edge: COLORS.panelEdge });
    text(ctx, `💧 ${can.water}/${can.capacity}`, 106, gy + 4, {
      size: 11, color: COLORS.inkDim, weight: 500,
    });
  }

  _renderToolbar(ctx, view) {
    const y = view.h - view.safeBottom - TOOLBAR_H - 62;
    ctx.fillStyle = 'rgba(14,19,9,.94)';
    ctx.fillRect(0, y, view.w, view.h - y);
    ctx.fillStyle = COLORS.panelEdge;
    ctx.fillRect(0, y, view.w, 1);

    for (const key of ['sleep', 'town', 'map', 'bin']) this.nav[key].render(ctx);

    this.toolButtons.forEach((b) => {
      b.kind = b.id === this.tool ? 'primary' : 'normal';
      const cost = TOOLS.find((t) => t.id === b.id)?.energy ?? 0;
      b.enabled = state.meta.energy >= cost;
      b.render(ctx);
      if (b.id === 'seed' && this.selectedSeed) {
        text(ctx, CROPS[this.selectedSeed].name, b.x + b.w / 2, b.y + b.h - 8, {
          size: 9, color: COLORS.gold, align: 'center', weight: 700, maxWidth: b.w - 6,
        });
      }
    });

    const value = binValue();
    if (value > 0) {
      text(ctx, `bin: ${value}g`, view.w / 2, y - 10, {
        size: 11, color: COLORS.gold, align: 'center', weight: 600,
      });
    }
  }

  _renderPanel(ctx, view) {
    const r = this.panelRect;
    ctx.fillStyle = 'rgba(6,10,5,.6)';
    ctx.fillRect(0, 0, view.w, view.h);
    panel(ctx, r.x, r.y, r.w, r.h);

    if (this.panel === 'seeds') {
      text(ctx, 'SEED POUCH', r.x + 16, r.y + 28, { size: 13, color: COLORS.gold });
      if (!this.list.items.length) {
        text(ctx, `No seeds sown-able in ${seasonName()}.`, r.x + r.w / 2, r.y + 100, {
          size: 13, color: COLORS.inkFaint, align: 'center', weight: 500,
        });
      }
      this.list.render(ctx, (c, entry, x, y, w, h) => {
        const selected = entry.cropId === this.selectedSeed;
        fillRound(c, x, y, w, h, 10, selected ? '#33482a' : COLORS.panelDeep);
        if (selected) strokeRound(c, x, y, w, h, 10, COLORS.green, 2);
        drawCrop(c, entry.crop.art, x + 26, y + h - 10, 34,
                 entry.crop.stages - 1, entry.crop.stages, entry.crop.color);
        text(c, entry.crop.name, x + 50, y + 18, { size: 14, color: COLORS.ink });
        text(c, `${entry.crop.growDays}d${entry.crop.regrowDays ? ` · regrows ${entry.crop.regrowDays}d` : ''}`,
             x + 50, y + 38, { size: 11, color: COLORS.inkDim, weight: 500 });
        text(c, `×${entry.held}`, x + w - 12, y + 20, {
          size: 14, color: COLORS.gold, align: 'right',
        });
        text(c, `${sellValue(entry.cropId)}g`, x + w - 12, y + 40, {
          size: 11, color: COLORS.inkDim, align: 'right', weight: 500,
        });
      });
    }

    if (this.panel === 'bin') {
      text(ctx, 'SHIPPING BIN', r.x + 16, r.y + 28, { size: 13, color: COLORS.gold });
      text(ctx, `${binValue()}g overnight`, r.x + r.w - 16, r.y + 28, {
        size: 13, color: COLORS.gold, align: 'right',
      });
      if (!this.list.items.length) {
        text(ctx, 'Empty. Harvest something.', r.x + r.w / 2, r.y + 100, {
          size: 13, color: COLORS.inkFaint, align: 'center', weight: 500,
        });
      }
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

    this.nav.close.render(ctx);
  }

  back() {
    if (this.card.visible) { this.card.hide(); return true; }
    if (this.panel) { this.panel = null; return true; }
    return false;
  }
}

// Convenience actions the town/HUD can trigger without importing livestock.
export function tendEverything() {
  const tended = tendAll();
  const collected = collectAll();
  if (tended || collected.length) {
    emit(EVENTS.TOAST, { message: `Tended ${tended}, collected ${collected.length}.` });
  }
  return { tended, collected };
}
