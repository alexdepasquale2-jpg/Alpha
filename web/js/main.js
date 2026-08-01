// Bootstrap: canvas sizing, the scene stack, the loop, and the boot save load.

import { Loop } from './core/loop.js';
import { Input } from './core/input.js';
import { SceneStack } from './core/scene.js';
import { emit, on, EVENTS } from './core/events.js';
import * as saves from './core/save.js';
import { getState, setState, createNewGame } from './core/state.js';
import { initToasts, toast } from './ui/toast.js';
import { COLORS } from './ui/theme.js';
import { TitleScene } from './scenes/title.js';
import { WorldScene } from './world/worldScene.js';

export const AUTOSAVE_SLOT = 'auto';

class Game {
  constructor() {
    this.canvas = document.getElementById('stage');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.input = new Input(this.canvas);
    this.scenes = new SceneStack(this);
    this.view = { w: 0, h: 0, dpr: 1, safeTop: 0, safeBottom: 0, safeLeft: 0, safeRight: 0 };
    this.loop = new Loop((dt, tick) => this.update(dt, tick), (alpha) => this.render(alpha));
    this._resize = this._resize.bind(this);
  }

  get state() { return getState(); }

  async boot() {
    initToasts();
    this._wireSeasonRollover();
    this._resize();
    window.addEventListener('resize', this._resize);
    window.visualViewport?.addEventListener('resize', this._resize);
    window.addEventListener('orientationchange', () => setTimeout(this._resize, 120));

    // Escape / Android back maps to the scene stack.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.scenes.back(); }
    });

    // Best-effort save when the player swipes the tab away. `visibilitychange`
    // is the only event mobile browsers reliably deliver before killing a page.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state && !this.state.world.currentAssault) {
        this.save().catch(() => {});
      }
    });

    // Widgets that need a dedicated finger (the thumbstick, the action
    // button) take ownership of a pointer at press time. Delegating to the top
    // scene keeps that decision where the widgets are.
    this.input.claimHandler = (pointer) => this.scenes.top?.claimPointer?.(pointer) ?? null;

    this.scenes.replace(new TitleScene(this));
    this.loop.start();

    document.getElementById('boot')?.classList.add('hidden');
    setTimeout(() => document.getElementById('boot')?.remove(), 500);
  }

  /**
   * The army retires at the end of every season. Wired once at boot rather
   * than inside the farm scene, so it fires no matter where the day rolled
   * over from.
   */
  _wireSeasonRollover() {
    on(EVENTS.SEASON_CHANGED, async ({ season, year }) => {
      const { retireArmy } = await import('./battle/assault.js');
      const { SEASONS } = await import('./core/state.js');
      const retired = retireArmy();
      if (retired) {
        const models = retired.squads.reduce((sum, s) => sum + s.count, 0);
        toast(`${SEASONS[season]} Y${year}. ${models} veteran(s) stood down.`, 'gold', 4000);
      }
    });
  }

  /** Start a brand-new run and hand control to the farm. */
  async newGame(opts = {}) {
    setState(createNewGame(opts));
    const { initNewRun } = await import('./farm/farmSim.js');
    initNewRun(this.state);
    this.scenes.replace(new WorldScene(this));
    await this.save();
  }

  /** Resume the autosave. Returns false if there was nothing to resume. */
  async continueGame(slot = AUTOSAVE_SLOT) {
    const loaded = await saves.load(slot);
    if (!loaded) return false;
    this.scenes.replace(new WorldScene(this));
    return true;
  }

  async save(slot = AUTOSAVE_SLOT) {
    if (!this.state) return { ok: false };
    return saves.save(this.state, slot);
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(this.canvas.clientWidth || window.innerWidth);
    const h = Math.round(this.canvas.clientHeight || window.innerHeight);

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;

    const probe = getComputedStyle(document.documentElement);
    const px = (name) => parseFloat(probe.getPropertyValue(name)) || 0;

    Object.assign(this.view, {
      w, h, dpr,
      safeTop: px('--safe-top'),
      safeBottom: px('--safe-bottom'),
      safeLeft: px('--safe-left'),
      safeRight: px('--safe-right'),
      // Portrait is the design target; landscape still plays, just letterboxed
      // by the scenes that care.
      portrait: h >= w,
      short: h < 620,
    });

    this.scenes.stack.forEach((scene) => scene.onResize?.(this.view));
  }

  update(dt, tick) {
    this.scenes.handleInput(this.input);
    this.scenes.update(dt, tick);
    this.input.endFrame();
    if (this.state) this.state.meta.playtimeMs += dt * 1000;
  }

  render(alpha) {
    const { ctx, view } = this;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, view.w, view.h);
    this.scenes.render(ctx, view, alpha);
  }
}

const game = new Game();
window.game = game;   // handy in devtools; also what the smoke test pokes at

game.boot().catch((err) => {
  console.error('[boot] failed', err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.classList.add('failed');
    boot.classList.remove('hidden');
    boot.querySelector('.boot-sub').textContent = err.message || 'failed to start';
  }
});

export { game, emit, EVENTS, toast };
