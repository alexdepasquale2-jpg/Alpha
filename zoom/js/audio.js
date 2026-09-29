// All sound is synthesized: no assets. Radio-alien: noise, sub-bass, cheap bells.

export class Sound {
  constructor() {
    this.ctx = null;
    this.beat = 0;
    this.mood = { tier: 0, hiding: false };
  }

  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 9000;
    this.master.connect(this.lp); this.lp.connect(ctx.destination);
    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the ocean's hum
    this.hum = [50, 50.7, 75.2].map((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.0;
      const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 220;
      o.connect(lf); lf.connect(g); g.connect(this.master); o.start();
      return { o, g };
    });
    this.static = ctx.createBufferSource(); this.static.buffer = this.noiseBuf; this.static.loop = true;
    this.staticG = ctx.createGain(); this.staticG.gain.value = 0;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2400; sf.Q.value = 0.6;
    this.static.connect(sf); sf.connect(this.staticG); this.staticG.connect(this.master); this.static.start();
  }

  setMood(tier, hiding, dt, notice) {
    this.mood = { tier, hiding };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.lp.frequency.setTargetAtTime(hiding ? 500 : 9000, now, 0.25);
    const base = [0.05, 0.08, 0.12, 0.16][tier];
    this.hum.forEach((h, i) => h.g.gain.setTargetAtTime(base * (i === 2 ? 0.7 : 1) * (hiding ? 0.6 : 1), now, 0.3));
    this.hum[0].o.frequency.setTargetAtTime(50 + notice * 0.25, now, 0.4);
    this.staticG.gain.setTargetAtTime([0.006, 0.014, 0.03, 0.05][tier] * (hiding ? 0.3 : 1), now, 0.3);
    // heartbeat: quicker as Notice climbs, slower when ZOOM is bored
    this.beat -= dt;
    if (this.beat <= 0) {
      const bpm = hiding ? 34 : 46 + notice * 0.9;
      this.beat = 60 / bpm;
      this.thump(hiding ? 0.12 : 0.12 + tier * 0.06, 52);
      setTimeout(() => this.thump(0.06 + tier * 0.03, 46), 150);
    }
  }

  tone(f0, f1, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx; const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, type = 'bandpass', f0 = 1200, f1 = f0, vol = 0.3, delay = 0, q = 1) {
    if (!this.ctx) return;
    const c = this.ctx; const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  thump(vol = 0.2, f = 55) { this.tone(f * 1.6, f * 0.7, 0.18, 'sine', vol); }

  play(name, d = {}) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump': this.tone(300, 520, 0.09, 'square', 0.04); break;
      case 'mantle': this.tone(200, 400, 0.12, 'triangle', 0.08); break;
      case 'plant': this.tone(70, 190, 0.7, 'sawtooth', 0.09); this.noise(0.6, 'bandpass', 300, 1800, 0.05); break;
      case 'ripCancel': this.tone(190, 60, 0.15, 'sawtooth', 0.06); break;
      case 'tearStart': this.noise(0.5, 'bandpass', 900, 2600, 0.1, 0, 4); break;
      case 'rip':
        this.noise(0.5, 'bandpass', 1400, 200, d.perfect ? 0.5 : 0.65, 0, 2);
        this.tone(130, 38, 0.5, 'sawtooth', 0.35);
        this.noise(0.12, 'highpass', 3000, 3000, 0.25);
        if (d.perfect) this.tone(880, 1320, 0.25, 'sine', 0.1, 0.05);
        break;
      case 'throw': this.noise(0.18, 'highpass', 800, 3000, 0.16); break;
      case 'jam': this.thump(0.4, 90); this.noise(0.12, 'lowpass', 1200, 300, 0.3); break;
      case 'write': this.tone(660, 990, 0.4, 'sine', 0.16); this.tone(220, 50, 0.4, 'square', 0.08); this.noise(0.3, 'bandpass', 3000, 800, 0.18); break;
      case 'miss': this.thump(0.3, 70); break;
      case 'pickup': this.tone(520, 780, 0.1, 'triangle', 0.1); break;
      case 'swap': this.tone(400, 300, 0.06, 'square', 0.05); break;
      case 'stash': this.tone(300, 200, 0.18, 'triangle', 0.1); break;
      case 'hurt': this.thump(0.55, 80); this.noise(0.2, 'lowpass', 900, 200, 0.4); break;
      case 'bark': this.tone(720, 380, 0.11, 'sawtooth', 0.14); this.noise(0.09, 'bandpass', 1500, 900, 0.1); this.tone(680, 340, 0.1, 'sawtooth', 0.1, 0.13); break;
      case 'hide': this.tone(300, 80, 0.5, 'sine', 0.1); break;
      case 'unhide': this.tone(120, 300, 0.25, 'sine', 0.06); break;
      case 'squish': this.noise(0.1, 'lowpass', 800, 200, 0.3); this.tone(200, 60, 0.12, 'square', 0.08); break;
      case 'smash': this.noise(0.35, 'highpass', 1500, 4500, 0.4); this.tone(900, 90, 0.3, 'triangle', 0.2); break;
      case 'bite': this.noise(0.1, 'highpass', 2000, 3500, 0.3); break;
      case 'accept': this.tone(660, 660, 0.12, 'square', 0.12); this.tone(880, 880, 0.2, 'square', 0.12, 0.13); break;
      case 'menuSpawn': this.tone(880, 880, 0.08, 'sine', 0.08); this.tone(1100, 1100, 0.1, 'sine', 0.08, 0.1); break;
      case 'crumble': this.noise(0.5, 'lowpass', 900, 100, 0.4); break;
      case 'gateClose': this.thump(0.3, 60); this.noise(0.08, 'highpass', 2500, 2500, 0.2); break;
      case 'doorOpen': this.tone(110, 40, 1.1, 'sawtooth', 0.3); this.noise(0.9, 'bandpass', 500, 90, 0.4); break;
      case 'wardenAlert': this.tone(180, 320, 0.4, 'sawtooth', 0.12); break;
      case 'teethGrow': case 'footTeeth': this.noise(0.14, 'highpass', 2500, 5000, 0.14); break;
      case 'creak': this.tone(60, 40, 3.4, 'sawtooth', 0.1); this.noise(3, 'bandpass', 200, 100, 0.12, 0, 6); break;
      case 'roll': this.tone(70, 30, 1.4, 'sawtooth', 0.3); this.noise(1.2, 'lowpass', 600, 60, 0.5); break;
      case 'inhale': this.noise(5.5, 'bandpass', 300, 1200, 0.2, 0, 1); break;
      case 'chaseStart': this.tone(48, 32, 2.6, 'sawtooth', 0.4); this.tone(72, 36, 2.6, 'sawtooth', 0.25); break;
      case 'eyeOpen': this.tone(90, 45, 1.2, 'sawtooth', 0.3); break;
      case 'staticGlow': this.noise(0.6, 'highpass', 4000, 4000, 0.2); break;
      case 'crack': this.noise(0.4, 'highpass', 800, 3000, 0.5); this.tone(300, 60, 0.4, 'square', 0.15); break;
      case 'chew': this.noise(0.3, 'bandpass', 700, 300, 0.3, 0, 3); break;
      case 'offer': this.tone(1200, 1800, 0.3, 'sine', 0.12); break;
      case 'chaseEnd': this.tone(400, 90, 2.4, 'sine', 0.16); break;
      case 'digest': this.tone(200, 35, 2.4, 'sawtooth', 0.4); this.noise(2.2, 'lowpass', 700, 80, 0.45); break;
      case 'spit': this.noise(0.25, 'bandpass', 900, 300, 0.4); this.thump(0.5, 80); break;
      case 'fall': this.tone(500, 100, 0.35, 'triangle', 0.1); break;
      case 'end': this.tone(220, 110, 4, 'sine', 0.2); this.tone(330, 165, 4, 'sine', 0.12); break;
      case 'scarFirst': this.tone(110, 220, 1, 'sine', 0.1); break;
      default: break;
    }
  }
}
