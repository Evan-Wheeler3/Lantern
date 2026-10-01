// Procedural Web Audio: no samples. Everything is synthesised from oscillators and
// noise, positioned with HRTF panners and sent into a convolution reverb whose
// impulse response is generated to match a large flooded stone nave (~5 s RT60,
// dark high end, sparse early reflections off the piers).
import { settings } from '../core/Settings.js';

function makeNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function makeBrownBuffer(ctx, seconds = 4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

// Stone cathedral impulse response: early reflections + exponentially decaying,
// progressively low-passed stereo noise tail.
function makeCathedralIR(ctx, seconds = 5.2) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const env = Math.exp(-t * 1.35) * Math.min(1, t * 60);
      const cutoff = Math.max(0.04, 0.55 * Math.exp(-t * 0.9)); // high end dies first
      lp += cutoff * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * env * 1.6;
    }
    // early reflections (piers, water, walls)
    const taps = [0.011, 0.019, 0.027, 0.041, 0.053, 0.067, 0.083, 0.097, 0.121];
    for (const tap of taps) {
      const idx = Math.floor((tap + (ch ? 0.0031 : 0)) * rate);
      if (idx < len) d[idx] += (Math.random() > 0.5 ? 1 : -1) * 0.5 * Math.exp(-tap * 12);
    }
  }
  return buf;
}

export class AudioSystem {
  constructor(events) {
    this.events = events;
    this.ctx = null;
    this.started = false;
    this.listener = null;
    this._crackleTimer = 0;
    this._pending = [];

    events.on('drip', (d) => this.drip(d));
    events.on('footstep', (f) => this.footstep(f));
    events.on('focus', (on) => this.shutter(on));
    events.on('blastStart', () => this.blastStart());
    events.on('blastEnd', () => this.blastStop());
    events.on('burnout', () => { this.blastStop(); this.sputter(); });
    events.on('rekindled', () => this.whoosh(0.5, 300));
    events.on('pump', () => this.pump());
    events.on('beaconLit', (b) => this.kindle(b.pos));
    events.on('allLit', () => this.rumble());
    events.on('hurt', () => this.hit());
    events.on('monsterGrowl', (m) => this.growl(m));
    events.on('monsterFrozen', (m) => this.freeze(m));
    events.on('monsterKilled', (m) => this.burnAway(m));
    events.on('died', () => this.sting(false));
    events.on('won', () => this.sting(true));
  }

  // Must be called from a user gesture.
  start() {
    if (this.started) {
      this.ctx?.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.started = true;

    this.noise = makeNoiseBuffer(ctx, 2);
    this.brown = makeBrownBuffer(ctx, 6);

    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    // gentle bus compression keeps drips + steps from spiking
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.connect(this.master);
    this.bus = comp;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeCathedralIR(ctx);
    this.reverbGain = ctx.createGain();
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(comp);
    this.dry = ctx.createGain();
    this.dry.connect(comp);

    this.listener = ctx.listener;
    this._startDrone();
    this._startFlameHiss();
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const a = settings.audio;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.master, t, 0.1);
    this.reverbGain.gain.setTargetAtTime(a.reverb * 1.4, t, 0.1);
    this.droneGain?.gain.setTargetAtTime(a.drone * 0.22, t, 0.5);
    this.hissGain?.gain.setTargetAtTime(a.crackle * 0.03, t, 0.1);
  }

  _send(node, wet = 0.5, dry = 1) {
    const d = this.ctx.createGain();
    d.gain.value = dry;
    const w = this.ctx.createGain();
    w.gain.value = wet;
    node.connect(d).connect(this.dry);
    node.connect(w).connect(this.reverb);
  }

  _panner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.5;
    p.rolloffFactor = 1.1;
    p.maxDistance = 60;
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else p.setPosition(x, y, z);
    return p;
  }

  // -------------------------------------------------------------- drone
  _startDrone() {
    const ctx = this.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 0.7;
    lp.connect(this.droneGain);
    this._send(this.droneGain, 0.8, 0.7);

    // detuned low fifths, slowly beating
    const freqs = [36.7, 36.95, 55.0, 73.2, 110.3];
    for (const [i, f] of freqs.entries()) {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.35 : 0.2 / i;
      o.connect(g).connect(lp);
      o.start();
    }
    // the cathedral "breathing": brown noise through a resonant band
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 95;
    bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.value = 0.9;
    src.connect(bp).connect(ng).connect(lp);
    src.start();
    // slow filter swell
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.037;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 70;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
  }

  // -------------------------------------------------------------- flame
  _startFlameHiss() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.6;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    src.connect(bp).connect(this.hissGain);
    this._send(this.hissGain, 0.15, 1);
    src.start();
  }

  _crackle(intensity) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 4200;
    bp.Q.value = 2 + Math.random() * 4;
    const g = ctx.createGain();
    const dur = 0.004 + Math.random() * 0.025;
    const amp = settings.audio.crackle * intensity * (0.08 + Math.random() * 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g);
    this._send(g, 0.25, 1);
    src.start(t, Math.random() * 1.5, dur + 0.02);
  }

  // -------------------------------------------------------------- drips
  drip(d) {
    if (!this.ctx || settings.audio.drips <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const pan = this._panner(d.x, d.y, d.z);
    const out = ctx.createGain();
    out.gain.value = settings.audio.drips * (d.onWater ? 0.55 : 0.35);
    out.connect(pan);
    this._send(pan, 0.9, 0.6);

    if (d.onWater) {
      // bubble resonance: a sine that chirps UP (that's what makes a "plink")
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = 700 + Math.random() * 900;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.8 + Math.random() * 0.8), t + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.6, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.12);
    }
    // impact tick
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = d.onWater ? 2500 : 1200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(d.onWater ? 0.25 : 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(hp).connect(ng).connect(out);
    n.start(t, Math.random(), 0.05);
  }

  // -------------------------------------------------------------- footsteps
  footstep(f) {
    if (!this.ctx || settings.audio.footsteps <= 0) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const vol = settings.audio.footsteps * (0.45 + Math.min(f.speed, 4) * 0.12);
    const out = ctx.createGain();
    out.gain.value = vol;
    const pan = ctx.createStereoPanner();
    pan.pan.value = f.side ? 0.25 : -0.25;
    out.connect(pan);
    this._send(pan, f.wet ? 0.55 : 0.4, 1);

    if (f.wet) {
      // two-stage slosh: leg pushes water, then the splash settles
      for (const [delay, freq, q, len, amp] of [[0, 520, 0.9, 0.22, 0.9], [0.07, 1300, 1.2, 0.3, 0.45], [0.16, 380, 0.7, 0.35, 0.35]]) {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(freq * (0.8 + Math.random() * 0.4), t + delay);
        bp.frequency.exponentialRampToValueAtTime(freq * 0.55, t + delay + len);
        bp.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + delay);
        g.gain.exponentialRampToValueAtTime(amp, t + delay + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + delay + len);
        src.connect(bp).connect(g).connect(out);
        src.start(t + delay, Math.random() * 1.4, len + 0.05);
      }
      // a few droplets falling back
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        const tt = t + 0.12 + Math.random() * 0.25;
        const f0 = 900 + Math.random() * 1400;
        o.frequency.setValueAtTime(f0, tt);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.6, tt + 0.03);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.06, tt + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
        o.connect(g).connect(out);
        o.start(tt);
        o.stop(tt + 0.07);
      }
    } else {
      // stone: short scuff + low thud
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900 + Math.random() * 300;
      bp.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random(), 0.12);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.5, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  // ------------------------------------------------------------ gameplay sounds
  _noiseSrc(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  // Off-hand blast: a held roar of air through the flame.
  blastStart() {
    if (!this.ctx || this._blast) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this._noiseSrc(true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.15);
    lp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * settings.audio.crackle + 0.05, t + 0.06);
    src.connect(lp).connect(g);
    this._send(g, 0.5, 1);
    src.start(t, Math.random());
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const og = ctx.createGain();
    og.gain.value = 0.12;
    const olp = ctx.createBiquadFilter();
    olp.type = 'lowpass';
    olp.frequency.value = 160;
    o.connect(olp).connect(og).connect(g);
    o.start(t);
    this._blast = { src, o, g, lp };
  }

  blastStop() {
    if (!this._blast) return;
    const { src, o, g, lp } = this._blast;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    src.stop(t + 0.3);
    o.stop(t + 0.3);
    this._blast = null;
  }

  sputter() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (let k = 0; k < 6; k++) {
      const t = t0 + k * (0.06 + Math.random() * 0.08);
      const s = this._noiseSrc();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 600 + Math.random() * 900; bp.Q.value = 2;
      const g = this.ctx.createGain();
      this._env(g, t, 0.004, 0.35 / (k + 1), 0.08);
      s.connect(bp).connect(g);
      this._send(g, 0.4, 1);
      s.start(t, Math.random(), 0.12);
    }
  }

  // Space: pumping oil into the wick — a squeak and a glug.
  pump() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const f0 = 180 + Math.random() * 60;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.12);
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.25, 0.14);
    o.connect(g);
    this._send(g, 0.2, 1);
    o.start(t); o.stop(t + 0.2);
  }

  whoosh(amp = 0.6, from = 200, at = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const s = this._noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(from * 8, t + 0.5);
    const g = ctx.createGain();
    this._env(g, t, 0.15, amp, 0.9);
    s.connect(bp).connect(g);
    if (at) { const p = this._panner(at.x, at.y, at.z); g.connect(p); this._send(p, 0.8, 1); } else this._send(g, 0.6, 1);
    s.start(t, Math.random(), 1.3);
  }

  kindle(pos) {
    if (!this.ctx) return;
    this.whoosh(0.9, 150, pos);
    const ctx = this.ctx, t = ctx.currentTime + 0.3;
    // a low consonant chord that hangs in the reverb
    for (const f of [73.4, 110, 146.8, 220]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      this._env(g, t, 0.4, 0.08, 3.5);
      o.connect(g);
      this._send(g, 1.0, 0.6);
      o.start(t); o.stop(t + 4.2);
    }
  }

  rumble() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.05;
    const s = this.ctx.createBufferSource();
    s.buffer = this.brown;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 140;
    const g = ctx.createGain();
    this._env(g, t, 0.6, 1.2, 3.5);
    s.connect(lp).connect(g);
    this._send(g, 0.9, 1);
    s.start(t, 0, 4.5);
  }

  hit() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.005;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const g = ctx.createGain();
    this._env(g, t, 0.005, 0.9, 0.5);
    o.connect(g);
    this._send(g, 0.6, 1);
    o.start(t); o.stop(t + 0.6);
    // the flame chokes: a hiss that falls away
    const s = this._noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2500;
    const hg = ctx.createGain();
    this._env(hg, t, 0.01, 0.3, 0.6);
    s.connect(hp).connect(hg);
    this._send(hg, 0.4, 1);
    s.start(t, Math.random(), 0.8);
  }

  // Positional growl: formant-filtered brown noise + a dragging sub tone.
  growl(m) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const p = this._panner(m.x, 1.4, m.z);
    p.refDistance = 2.5;
    this._send(p, 0.9, 1);
    const dur = 0.9 + Math.random() * 0.8;
    const s = ctx.createBufferSource();
    s.buffer = this.brown;
    for (const [f, q, a] of [[m.type === 'crawler' ? 520 : 320, 6, 1.0], [m.type === 'crawler' ? 1300 : 900, 8, 0.5]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(f, t);
      bp.frequency.linearRampToValueAtTime(f * 0.7, t + dur);
      const g = ctx.createGain();
      this._env(g, t, dur * 0.4, 1.6 * a, dur * 0.6);
      s.connect(bp).connect(g).connect(p);
    }
    s.start(t, Math.random() * 3, dur + 0.1);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(m.type === 'crawler' ? 62 : 44, t);
    o.frequency.linearRampToValueAtTime(m.type === 'crawler' ? 50 : 36, t + dur);
    const og = ctx.createGain();
    this._env(og, t, dur * 0.5, 0.25, dur * 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220;
    o.connect(lp).connect(og).connect(p);
    o.start(t); o.stop(t + dur + 0.1);
  }

  freeze(m) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const p = this._panner(m.x, 1.4, m.z);
    this._send(p, 1.0, 1);
    for (const f of [1567, 2349, 3136]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.3);
      const g = ctx.createGain();
      this._env(g, t, 0.02, 0.12, 1.4);
      o.connect(g).connect(p);
      o.start(t); o.stop(t + 1.6);
    }
  }

  burnAway(m) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const p = this._panner(m.x, 1.4, m.z);
    this._send(p, 0.9, 1);
    const s = this._noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const g = ctx.createGain();
    this._env(g, t, 0.02, 1.2, 1.3);
    s.connect(bp).connect(g).connect(p);
    s.start(t, Math.random(), 1.5);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 1.1);
    const og = ctx.createGain();
    this._env(og, t, 0.03, 0.2, 1.1);
    o.connect(og).connect(p);
    o.start(t); o.stop(t + 1.3);
  }

  sting(won) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.1;
    const notes = won ? [146.8, 220, 293.7, 440] : [110, 103.8, 82.4, 55];
    notes.forEach((f, k) => {
      const o = ctx.createOscillator();
      o.type = won ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = won ? 1800 : 400;
      const g = ctx.createGain();
      this._env(g, t + k * 0.35, 0.3, 0.12, 4);
      o.connect(lp).connect(g);
      this._send(g, 1.0, 0.7);
      o.start(t + k * 0.35); o.stop(t + k * 0.35 + 4.5);
    });
    if (!won) this.droneGain?.gain.setTargetAtTime(0.02, ctx.currentTime, 2);
  }

  // metallic clack when the shutters move
  shutter(on) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    for (const [i, freq] of (on ? [1400, 2100] : [1100, 1700]).entries()) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = freq * (0.95 + Math.random() * 0.1);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 8;
      const g = ctx.createGain();
      const tt = t + i * 0.06;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.12, tt + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
      o.connect(bp).connect(g);
      this._send(g, 0.5, 0.8);
      o.start(tt);
      o.stop(tt + 0.1);
    }
  }

  update(dt, time, engine) {
    if (!this.ctx) return;
    this.applyVolumes();
    // listener follows the camera
    const cam = engine.services.camera;
    if (cam && this.listener) {
      const e = cam.matrixWorld.elements;
      const l = this.listener;
      if (l.positionX) {
        const t = this.ctx.currentTime;
        l.positionX.setValueAtTime(e[12], t); l.positionY.setValueAtTime(e[13], t); l.positionZ.setValueAtTime(e[14], t);
        l.forwardX.setValueAtTime(-e[8], t); l.forwardY.setValueAtTime(-e[9], t); l.forwardZ.setValueAtTime(-e[10], t);
        l.upX.setValueAtTime(e[4], t); l.upY.setValueAtTime(e[5], t); l.upZ.setValueAtTime(e[6], t);
      } else {
        l.setPosition(e[12], e[13], e[14]);
        l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
      }
    }
    // crackle rate follows the flame's agitation
    const lantern = engine.services.lantern;
    const agitation = lantern ? Math.abs(lantern.flicker - 1) * 3 + 0.4 : 1;
    this._crackleTimer -= dt;
    if (this._crackleTimer <= 0) {
      this._crackleTimer = (0.03 + Math.random() * 0.35) / agitation;
      if (settings.audio.crackle > 0) {
        this._crackle(Math.min(agitation, 1.5));
        if (Math.random() < 0.25) this._crackle(0.6);
      }
    }
  }
}
