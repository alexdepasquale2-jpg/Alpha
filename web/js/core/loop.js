// Fixed-timestep update with an interpolated render.
//
// Gameplay logic must never see a variable dt: the battle simulation is
// deterministic and a phone that drops frames would otherwise desync it from
// the same battle replayed on a desktop. Render gets an `alpha` in [0,1) to
// smooth between the last two logic states.

export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_SECONDS = 1 / TICK_HZ;

// If the tab was backgrounded, don't try to catch up on ten minutes of ticks.
const MAX_FRAME_MS = 250;

export class Loop {
  /**
   * @param {(dt:number, tick:number)=>void} update fixed-step logic
   * @param {(alpha:number, frameMs:number)=>void} render
   */
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.tick = 0;
    this.accumulator = 0;
    this.lastTime = 0;
    this.rafId = 0;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._frame = this._frame.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    document.addEventListener('visibilitychange', this._onVisibility);
    this.rafId = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  _onVisibility() {
    // Coming back from background: reset the clock so the accumulator doesn't
    // dump a burst of ticks the instant we're visible again.
    if (!document.hidden) {
      this.lastTime = performance.now();
      this.accumulator = 0;
    }
  }

  _frame(now) {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this._frame);

    const frameMs = Math.min(now - this.lastTime, MAX_FRAME_MS);
    this.lastTime = now;
    this.accumulator += frameMs;

    let steps = 0;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.tick++;
      this.update(TICK_SECONDS, this.tick);
      // Hard ceiling: a pathologically slow update must not spiral.
      if (++steps > 5) { this.accumulator = 0; break; }
    }

    this.render(this.accumulator / TICK_MS, frameMs);

    this._fpsAccum += frameMs;
    this._fpsFrames++;
    if (this._fpsAccum >= 500) {
      this.fps = Math.round((this._fpsFrames * 1000) / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }
}
