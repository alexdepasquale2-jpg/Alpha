/* ============================================================================
 * scenes/scene.js — the tiny scene base class every screen extends.
 *
 * A scene owns:
 *   • an optional DOM overlay root (`this.root`) auto-added/removed on enter/exit
 *   • canvas draw hooks: renderBack (under rain) and renderFront (over rain)
 *   • pointer hooks for the canvas layer (DOM handles its own clicks)
 * ========================================================================== */
CM.Scene = (function () {
  'use strict';
  const h = CM.ui.h;

  function Scene(name, opts) {
    opts = opts || {};
    this.name = name;
    this.showHUD = opts.hud !== false;
    this.root = null;
    this.time = 0;
    this._unsubs = [];
  }

  Scene.prototype._enter = function (params) {
    this.time = 0;
    this.root = h('div.scene.fade-in');
    document.getElementById('overlay').appendChild(this.root);
    CM.ui.showHUD(this.showHUD);
    this.enter(params || {});
  };
  Scene.prototype._exit = function () {
    this._unsubs.forEach((fn) => fn()); this._unsubs.length = 0;
    this.exit();
    if (this.root) { this.root.remove(); this.root = null; }
  };
  Scene.prototype._update = function (dt) { this.time += dt; this.update(dt); };

  /** Subscribe to a bus event for the lifetime of this scene only. */
  Scene.prototype.listen = function (ev, fn) { this._unsubs.push(CM.bus.on(ev, fn)); };
  /** Append DOM to the scene overlay. */
  Scene.prototype.add = function (el) { this.root.appendChild(el); return el; };

  /* ------- default no-op hooks; subclasses override what they need ----- */
  Scene.prototype.enter = function () {};
  Scene.prototype.exit = function () {};
  Scene.prototype.update = function () {};
  Scene.prototype.renderBack = function () {};   // beneath the rain
  Scene.prototype.renderFront = function () {};  // above the rain
  Scene.prototype.pointer = function () {};      // (type,x,y,ev) on the canvas
  Scene.prototype.resize = function () {};

  /** Convenience: standard "◀ BACK" button positioned top-left of the scene. */
  Scene.prototype.backButton = function (to, label) {
    const self = this;
    return h('button.btn.sm.ghost', {
      text: label || '< BASE',
      style: { position: 'absolute', left: '8px', top: 'calc(var(--hud-h) + 4px)', zIndex: 5 },
      onclick: function () { CM.audio.play('back'); CM.game.go(to || 'base'); }
    });
  };

  /** Helper for subclasses: `CM.Scene.extend(ctor)` wires up the prototype. */
  Scene.extend = function (ctor) {
    ctor.prototype = Object.create(Scene.prototype);
    ctor.prototype.constructor = ctor;
    return ctor;
  };

  return Scene;
})();
