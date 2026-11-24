// audio.js — every sound in SOLMAR HEAT is synthesized with WebAudio at
// run time; the game ships no audio files. A tiny song engine steps three
// procedural radio stations (a bass-and-pluck island groove, a synthwave
// arpeggio and a lo-fi chord loop) through oscillators, while one-shot
// voices cover the engine, sirens, gunfire, pickups and UI blips.
//
// Nothing plays until the first user gesture: browsers refuse an
// AudioContext before one, so main.js calls unlock() from its first click
// or keypress. Every method is safe to call before unlock (it no-ops).

const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.radioGain = null;
    this.station = 0;            // 0 off, 1 Isla FM, 2 Neon Waves, 3 Lo-Key
    this.step = 0;
    this.nextStepAt = 0;
    this.radioTimer = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Engine: two detuned saws through a lowpass, gain follows throttle.
    this.engineOsc = [this.ctx.createOscillator(), this.ctx.createOscillator()];
    this.engineGain = this.ctx.createGain();
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass'; engineFilter.frequency.value = 420;
    this.engineGain.gain.value = 0;
    for (const osc of this.engineOsc) {
      osc.type = 'sawtooth'; osc.frequency.value = 55;
      osc.connect(engineFilter); osc.start();
    }
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    // Siren: a triangle whose frequency an LFO sweeps between two tones.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 800;
    const sirenLfo = this.ctx.createOscillator();
    const sirenLfoGain = this.ctx.createGain();
    sirenLfo.frequency.value = 0.55; sirenLfoGain.gain.value = 160;
    sirenLfo.connect(sirenLfoGain); sirenLfoGain.connect(this.sirenOsc.frequency);
    sirenLfo.start(); this.sirenOsc.start();
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);

    // Radio bus.
    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.value = 0;
    this.radioGain.connect(this.master);
    this.radioTimer = window.setInterval(() => this.scheduleRadio(), 90);
  }

  // --- continuous voices -------------------------------------------------
  setEngine(on, rpm01, speed01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 52 + rpm01 * 130 + speed01 * 40;
    this.engineOsc[0].frequency.setTargetAtTime(freq, t, 0.06);
    this.engineOsc[1].frequency.setTargetAtTime(freq * 1.5 + 3, t, 0.06);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + rpm01 * 0.05 : 0, t, 0.09);
  }

  setSiren(level01) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(level01 * 0.028, this.ctx.currentTime, 0.2);
  }

  setStation(n) {
    this.station = n;
    if (this.radioGain && this.ctx) {
      this.radioGain.gain.setTargetAtTime(n === 0 ? 0 : 0.16, this.ctx.currentTime, 0.1);
    }
    return ['Radio off', 'Isla FM', 'Neon Waves', 'Lo-Key 98.1'][n] || 'Radio off';
  }

  // --- one shots -----------------------------------------------------------
  blip(freq = 880, dur = 0.07, gain = 0.12, type = 'square') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  pickup() { this.blip(660, 0.09, 0.14, 'sine'); setTimeout(() => this.blip(990, 0.12, 0.14, 'sine'), 60); }
  cash() { this.blip(1180, 0.06, 0.1, 'triangle'); setTimeout(() => this.blip(1560, 0.1, 0.1, 'triangle'), 50); }
  success() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 0.13, 'triangle'), i * 90)); }
  fail() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 0.12, 'sawtooth'), i * 110)); }
  star() { [880, 1108, 1318, 1760].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 0.1, 'sine'), i * 55)); }

  shot(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = kind === 'brute' ? 0.22 : 0.11;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = kind === 'brute' ? 900 : 2400;
    const g = this.ctx.createGain(); g.gain.value = kind === 'brute' ? 0.5 : 0.3;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  thud() { this.blip(72, 0.16, 0.3, 'sine'); }
  crash(intensity = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 0.28;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.4 * Math.min(1, intensity);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
    this.thud();
  }

  // --- the radio sequencer --------------------------------------------------
  // Sixteenth-note steps. Each station is a chord progression plus a lead
  // pattern, all derived from the step counter so no state can drift.
  scheduleRadio() {
    if (!this.ctx || this.station === 0) return;
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextStepAt < ahead) {
      if (this.nextStepAt < this.ctx.currentTime - 0.05) this.nextStepAt = this.ctx.currentTime + 0.02;
      this.playStep(this.step, this.nextStepAt);
      const bpm = [0, 96, 112, 78][this.station];
      this.nextStepAt += 60 / bpm / 4;
      this.step++;
    }
  }

  radioNote(midi, at, dur, gain, type = 'triangle') {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.value = NOTE(midi);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g); g.connect(this.radioGain);
    osc.start(at); osc.stop(at + dur + 0.03);
  }

  playStep(step, at) {
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;
    if (this.station === 1) {           // Isla FM: Am7 – Fmaj7 – Cmaj7 – G6
      const roots = [45, 41, 36, 43];
      const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
      const chord = chords[bar];
      if (s16 % 4 === 0) this.radioNote(roots[bar] - 12, at, 0.34, 0.5, 'sine');
      if (s16 % 2 === 0) this.radioNote(chord[s16 / 2 % 3], at, 0.16, 0.16, 'triangle');
      if (s16 === 14) this.radioNote(chord[1] + 12, at, 0.2, 0.12, 'sine');
    } else if (this.station === 2) {    // Neon Waves: driving synthwave arp
      const roots = [38, 38, 41, 36];   // D – D – F – C
      const scale = [0, 3, 5, 7, 10, 12, 10, 7];
      this.radioNote(roots[bar] + scale[s16 % 8] + 12, at, 0.11, 0.13, 'sawtooth');
      if (s16 % 8 === 0) this.radioNote(roots[bar], at, 0.4, 0.4, 'square');
    } else if (this.station === 3) {    // Lo-Key: slow jazzy sevenths
      const chords = [[50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 59], [45, 48, 52, 55]];
      if (s16 === 0) chords[bar].forEach((n) => this.radioNote(n, at, 1.4, 0.07, 'sine'));
      if (s16 === 7 || s16 === 11) this.radioNote(chords[bar][s16 % 4] + 12, at, 0.3, 0.06, 'sine');
      if (s16 % 4 === 2) this.radioNote(chords[bar][0] - 12, at, 0.3, 0.25, 'sine');
    }
  }
}
