// Keyboard, gamepad and touch, folded into one plain object the sim reads.

const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyK', 'KeyZ'], grip: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyJ'],
  rip: ['KeyE', 'KeyL'], thr: ['KeyF', 'KeyI'], hide: ['KeyC', 'ArrowDown', 'KeyS'],
  swap: ['KeyQ', 'KeyU'], bark: ['KeyB'],
};

export function createInput() {
  const down = new Set();
  const touch = { mx: 0, my: 0, held: new Set() };
  const api = { touchActive: false, onFirst: null };

  const isDown = (name) => KEYS[name].some((c) => down.has(c));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    api.onFirst?.(e);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => { down.clear(); touch.held.clear(); touch.mx = touch.my = 0; });

  // ---------------- touch ----------------
  const layer = document.getElementById('touch');
  const stickBase = document.getElementById('stick-base');
  const stickKnob = document.getElementById('stick-knob');
  let stickId = null;
  let origin = null;
  const RADIUS = 56;

  function showTouch() {
    if (api.touchActive) return;
    api.touchActive = true;
    layer.classList.add('on');
  }

  window.addEventListener('touchstart', showTouch, { passive: true });
  if (window.matchMedia?.('(pointer: coarse)').matches) showTouch();

  layer?.addEventListener('pointerdown', (e) => {
    showTouch();
    api.onFirst?.(e);
    const btn = e.target.closest('[data-btn]');
    if (btn) {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
      touch.held.add(btn.dataset.btn);
      btn.classList.add('held');
      return;
    }
    if (e.clientX < window.innerWidth * 0.5 && stickId === null) {
      stickId = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      stickBase.style.left = `${e.clientX}px`; stickBase.style.top = `${e.clientY}px`;
      stickKnob.style.left = `${e.clientX}px`; stickKnob.style.top = `${e.clientY}px`;
      stickBase.classList.add('on'); stickKnob.classList.add('on');
      try { layer.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    }
  });
  layer?.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - origin.x; let dy = e.clientY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
    touch.mx = Math.abs(dx) / RADIUS < 0.18 ? 0 : dx / RADIUS;
    touch.my = Math.abs(dy) / RADIUS < 0.25 ? 0 : dy / RADIUS;
    stickKnob.style.left = `${origin.x + dx}px`; stickKnob.style.top = `${origin.y + dy}px`;
  });
  const endPointer = (e) => {
    if (e.pointerId === stickId) {
      stickId = null; touch.mx = touch.my = 0;
      stickBase.classList.remove('on'); stickKnob.classList.remove('on');
    }
    const btn = e.target.closest?.('[data-btn]');
    if (btn) { touch.held.delete(btn.dataset.btn); btn.classList.remove('held'); }
  };
  layer?.addEventListener('pointerup', endPointer);
  layer?.addEventListener('pointercancel', endPointer);
  layer?.addEventListener('contextmenu', (e) => e.preventDefault());

  function pad() {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch { /* blocked by the embedding page */ }
    for (const p of pads) {
      if (!p) continue;
      const b = (i) => !!p.buttons[i]?.pressed;
      const ax = p.axes[0] || 0; const ay = p.axes[1] || 0;
      return {
        mx: Math.abs(ax) > 0.2 ? ax : 0, my: Math.abs(ay) > 0.3 ? ay : 0,
        jump: b(0), grip: b(7) || b(5), rip: b(2), thr: b(1), hide: b(3), swap: b(4), bark: b(11),
      };
    }
    return null;
  }

  api.read = () => {
    const gp = pad();
    const kx = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
    const ky = (isDown('down') ? 1 : 0) - (isDown('up') ? 1 : 0);
    const th = (n) => touch.held.has(n);
    const out = {
      mx: kx || touch.mx || gp?.mx || 0,
      my: ky || touch.my || gp?.my || 0,
      jump: isDown('jump') || th('jump') || !!gp?.jump,
      grip: isDown('grip') || th('grip') || !!gp?.grip,
      rip: isDown('rip') || th('rip') || !!gp?.rip,
      thr: isDown('thr') || th('thr') || !!gp?.thr,
      hide: isDown('hide') || th('hide') || !!gp?.hide,
      swap: isDown('swap') || th('swap') || !!gp?.swap,
      bark: isDown('bark') || th('bark') || !!gp?.bark,
    };
    // Up on a stick or key should never count as "hide"
    return out;
  };
  api.pressed = (code) => down.has(code);
  return api;
}
