// Scene stack. The top scene updates and receives input; everything below it
// still renders (so a shop panel can float over the farm) but is frozen.

export class Scene {
  constructor(game) {
    this.game = game;
    /** When true, scenes underneath are not drawn at all. */
    this.opaque = true;
    this.name = this.constructor.name;
  }

  /* eslint-disable no-unused-vars */
  enter(params = {}) {}
  exit() {}
  /** Fixed timestep. Only the top scene is updated. */
  update(dt, tick) {}
  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx, view, alpha) {}
  /** Only the top scene gets input. Return true to mark the event handled. */
  handleInput(input) { return false; }
  /** Android back / Escape. Return true if the scene handled it. */
  back() { return false; }
  /* eslint-enable no-unused-vars */
}

export class SceneStack {
  constructor(game) {
    this.game = game;
    this.stack = [];
  }

  get top() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  push(scene, params = {}) {
    this.stack.push(scene);
    scene.enter(params);
    return scene;
  }

  pop() {
    const scene = this.stack.pop();
    scene?.exit();
    return scene ?? null;
  }

  /** Replace the whole stack — the normal way to change context. */
  replace(scene, params = {}) {
    while (this.stack.length) this.pop();
    return this.push(scene, params);
  }

  /** Pop back to the named scene, or clear to it if not present. */
  popTo(name) {
    while (this.stack.length > 1 && this.top?.name !== name) this.pop();
    return this.top;
  }

  update(dt, tick) {
    this.top?.update(dt, tick);
  }

  render(ctx, view, alpha) {
    // Draw from the lowest scene that everything above it doesn't obscure.
    let first = this.stack.length - 1;
    while (first > 0 && !this.stack[first].opaque) first--;
    for (let i = first; i < this.stack.length; i++) {
      this.stack[i].render(ctx, view, alpha);
    }
  }

  handleInput(input) {
    return this.top?.handleInput(input) ?? false;
  }

  back() {
    if (this.top?.back()) return true;
    if (this.stack.length > 1) { this.pop(); return true; }
    return false;
  }
}
