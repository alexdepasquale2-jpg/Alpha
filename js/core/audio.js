/* ============================================================================
 * audio.js — tiny WebAudio blip synth. No sound files; everything is
 * oscillators + noise buffers generated on the fly. Muted until the first
 * user gesture (browser autoplay policy) and toggleable from the HUD.
 * ========================================================================== */
CM.audio = (function () {
  'use strict';
  let ctx = null, master = null, enabled = true, ready = false;

  function init() {
    if (ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      ready = true;
    } catch (e) { enabled = false; }
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /** One oscillator note with an exponential decay envelope. */
  function tone(freq, dur, type, vol, slideTo) {
    if (!enabled) return; init(); if (!ready) return; resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol === undefined ? .5 : vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + .02);
  }

  /** Filtered white noise — used for rain-ish hits and explosions. */
  function noise(dur, vol, freq) {
    if (!enabled) return; init(); if (!ready) return; resume();
    const t = ctx.currentTime, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900;
    const g = ctx.createGain(); g.gain.value = vol === undefined ? .35 : vol;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  const sfx = {
    click:  () => tone(520, .06, 'square', .35, 660),
    back:   () => tone(320, .07, 'square', .3, 220),
    merge:  () => { tone(440, .09, 'square', .4, 880); setTimeout(() => tone(660, .12, 'triangle', .4, 1320), 70); },
    build:  () => { tone(180, .12, 'sawtooth', .3, 300); noise(.18, .18, 400); },
    reward: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, .12, 'square', .32), i * 70)); },
    error:  () => tone(150, .16, 'sawtooth', .3, 90),
    hit:    () => { noise(.12, .3, 1400); tone(120, .1, 'square', .25, 60); },
    heal:   () => { tone(660, .1, 'sine', .3, 990); },
    level:  () => { [392, 523, 659, 880, 1046].forEach((f, i) => setTimeout(() => tone(f, .16, 'triangle', .3), i * 80)); },
    tick:   () => tone(880, .03, 'square', .12),
    launch: () => { tone(90, .5, 'sawtooth', .3, 500); noise(.5, .12, 300); }
  };

  return {
    play(name) { const f = sfx[name]; if (f) try { f(); } catch (e) {} },
    setEnabled(v) { enabled = v; if (v) { init(); resume(); } },
    isEnabled() { return enabled; },
    unlock() { init(); resume(); }
  };
})();
