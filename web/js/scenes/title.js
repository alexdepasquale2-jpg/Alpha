// Title screen: continue, new run, and the save-slot browser.

import { Scene } from '../core/scene.js';
import { Button, ScrollList } from '../ui/widgets.js';
import { COLORS, text, panel, shadowText, fillRound } from '../ui/theme.js';
import { listSlots, deleteSlot, serverStatus } from '../core/save.js';
import { SEASONS } from '../core/state.js';
import { toast } from '../ui/toast.js';
import { drawMechSilhouette } from '../render/sprites.js';

export class TitleScene extends Scene {
  constructor(game) {
    super(game);
    this.name = 'TitleScene';
    this.mode = 'main';          // 'main' | 'slots'
    this.slots = [];
    this.hasSave = false;
    this.time = 0;

    this.buttons = {
      continue: new Button({ label: 'Continue', kind: 'primary', onTap: () => this._continue() }),
      newRun: new Button({ label: 'New Run', onTap: () => this._newRun() }),
      slots: new Button({ label: 'Load Game', onTap: () => this._openSlots() }),
      back: new Button({ label: 'Back', kind: 'ghost', onTap: () => { this.mode = 'main'; } }),
    };
    this.list = new ScrollList({ rowHeight: 64 });
  }

  async enter() {
    this.slots = await listSlots();
    this.hasSave = this.slots.some((s) => s.slot === 'auto');
    this.buttons.continue.enabled = this.hasSave;
    this.list.setItems(this.slots);
  }

  onResize() { /* layout is computed per-frame from view */ }

  _layout(view) {
    const pad = 20;
    const w = Math.min(view.w - pad * 2, 380);
    const x = (view.w - w) / 2;
    let y = view.h - view.safeBottom - pad - 56;

    if (this.mode === 'main') {
      for (const key of ['slots', 'newRun', 'continue']) {
        this.buttons[key].setRect(x, y, w, 56);
        y -= 66;
      }
    } else {
      this.buttons.back.setRect(x, y, w, 56);
      const top = view.safeTop + 96;
      this.list.setRect(x, top, w, Math.max(120, y - top - 16));
    }
  }

  handleInput(input) {
    this._layout(this.game.view);

    if (this.mode === 'slots') {
      const picked = this.list.handleInput(input);
      if (picked) this._loadSlot(picked);
      return this.buttons.back.tryTap(input.tap);
    }

    const tap = input.tap;
    return ['continue', 'newRun', 'slots'].some((k) => this.buttons[k].tryTap(tap));
  }

  update(dt) {
    this.time += dt;
    for (const b of Object.values(this.buttons)) b.update(dt);
  }

  async _continue() {
    const ok = await this.game.continueGame();
    if (!ok) toast('No save found', 'bad');
  }

  async _newRun() {
    if (this.hasSave) {
      // Only one autosave slot, so be explicit that this overwrites it.
      const confirmed = window.confirm('Start a new run? This overwrites your autosave.');
      if (!confirmed) return;
    }
    await this.game.newGame();
  }

  async _openSlots() {
    this.slots = await listSlots();
    this.list.setItems(this.slots);
    this.mode = 'slots';
  }

  async _loadSlot(entry) {
    const ok = await this.game.continueGame(entry.slot);
    if (!ok) toast(`Could not load "${entry.slot}"`, 'bad');
  }

  back() {
    if (this.mode === 'slots') { this.mode = 'main'; return true; }
    return false;
  }

  render(ctx, view) {
    this._layout(view);

    // Sky-to-soil gradient behind everything.
    const grad = ctx.createLinearGradient(0, 0, 0, view.h);
    grad.addColorStop(0, '#243021');
    grad.addColorStop(0.55, '#1a2316');
    grad.addColorStop(1, '#0e1309');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);

    this._renderSkyline(ctx, view);

    const titleY = view.safeTop + (view.short ? 56 : 92);
    shadowText(ctx, 'IRONFIELD', view.w / 2, titleY, {
      size: Math.min(46, view.w * 0.12), color: COLORS.gold, align: 'center', weight: 800,
    });
    text(ctx, 'farm by day  ·  command by dusk', view.w / 2, titleY + 30, {
      size: 13, color: COLORS.inkDim, align: 'center', weight: 500,
    });

    if (this.mode === 'main') {
      for (const key of ['continue', 'newRun', 'slots']) this.buttons[key].render(ctx);
      if (!serverStatus().available) {
        text(ctx, 'offline — saving to this device only', view.w / 2,
             view.h - view.safeBottom - 8, {
          size: 11, color: COLORS.rust, align: 'center', weight: 500,
        });
      }
    } else {
      this._renderSlots(ctx, view);
      this.buttons.back.render(ctx);
    }
  }

  _renderSkyline(ctx, view) {
    // A row of idle mechs on the horizon, gently bobbing.
    const baseY = view.h * 0.62;
    const shapes = ['harvester', 'tiller', 'silo_cannon', 'scarecrow'];
    ctx.save();
    ctx.globalAlpha = 0.32;
    shapes.forEach((kind, i) => {
      const x = (view.w / (shapes.length + 1)) * (i + 1);
      const bob = Math.sin(this.time * 0.9 + i * 1.7) * 3;
      drawMechSilhouette(ctx, kind, x, baseY + bob, 34, COLORS.greenDeep);
    });
    ctx.restore();

    ctx.fillStyle = '#0e1309';
    ctx.fillRect(0, baseY + 2, view.w, view.h - baseY);
    fillRound(ctx, -20, baseY - 4, view.w + 40, 12, 6, '#1b2416');
  }

  _renderSlots(ctx, view) {
    text(ctx, 'SAVED RUNS', view.w / 2, view.safeTop + 76, {
      size: 12, color: COLORS.inkDim, align: 'center', weight: 700,
    });

    if (!this.slots.length) {
      text(ctx, 'No saved runs yet.', view.w / 2, view.h / 2, {
        size: 14, color: COLORS.inkFaint, align: 'center', weight: 500,
      });
      return;
    }

    this.list.render(ctx, (c, entry, x, y, w, h) => {
      panel(c, x, y, w, h, { r: 12, fill: COLORS.panelDeep });
      const meta = entry.summary ?? {};
      text(c, meta.farmName || entry.slot, x + 12, y + 20, { size: 15, color: COLORS.ink });
      const season = SEASONS[meta.season ?? 0] ?? '—';
      const line = meta.day
        ? `${season} ${meta.day}, Y${meta.year ?? 1}  ·  ${meta.gold ?? 0}g`
        : 'corrupt save';
      text(c, line, x + 12, y + 42, { size: 12, color: COLORS.inkDim, weight: 500 });
      text(c, entry.where, x + w - 12, y + 42, {
        size: 10, color: COLORS.inkFaint, align: 'right', weight: 500,
      });
    });
  }
}
