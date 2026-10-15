// Generative radio: lo-fi drive, ambient, night station, raga station (India layer) and static.
// Every station is scheduled ahead from seeded patterns that keep varying, so nothing loops.
import type { Audio } from './audio';
import type { Game } from '../game';
import { mulberry32, hashInts } from '../world/prng';
import { BIOMES } from '../../data/biomes';
import { FEATURES } from '../core/features';
import { COMMENTARY } from '../../data/radio';

export type StationId = 'lofi' | 'ambient' | 'night' | 'raga' | 'static';
export const STATIONS: { id: StationId; name: string; freq: string; india?: boolean }[] = [
  { id: 'lofi', name: 'LO-FI DRIVE', freq: '88.4' },
  { id: 'ambient', name: 'SLOW AIR', freq: '93.1' },
  { id: 'night', name: 'NIGHT OWL', freq: '101.7' },
  { id: 'raga', name: 'SUR SANDHYA', freq: '104.5', india: true },
  { id: 'static', name: 'STATIC', freq: '--.-' },
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// chord shapes (semitones from root)
const MAJ7 = [0, 4, 7, 11], MIN7 = [0, 3, 7, 10], DOM7 = [0, 4, 7, 10], MAJ9 = [0, 4, 7, 11, 14], MIN9 = [0, 3, 7, 10, 14], SUS = [0, 5, 7, 10];
// progressions as [degree offset, shape]
const PROGS: [number, number[]][][] = [
  [[2, MIN7], [7, DOM7], [0, MAJ7], [9, MIN7]],
  [[0, MAJ9], [5, MAJ7], [4, MIN7], [9, MIN9]],
  [[9, MIN7], [5, MAJ7], [0, MAJ7], [7, SUS]],
  [[0, MAJ7], [9, MIN7], [2, MIN9], [7, DOM7]],
  [[5, MAJ9], [4, MIN7], [2, MIN7], [0, MAJ7]],
  [[4, MIN7], [9, MIN7], [2, MIN7], [7, DOM7]],
];

// Raga material: scale steps (semitones from Sa), aroha/avaroha, resting notes. Chosen by time of day.
interface Raga { name: string; aroha: number[]; avaroha: number[]; rest: number[]; }
const RAGAS: Record<string, Raga> = {
  bhairav: { name: 'Bhairav', aroha: [0, 1, 4, 5, 7, 8, 11, 12], avaroha: [12, 11, 8, 7, 5, 4, 1, 0], rest: [8, 1, 0] },
  bilawal: { name: 'Bilawal', aroha: [0, 2, 4, 5, 7, 9, 11, 12], avaroha: [12, 11, 9, 7, 5, 4, 2, 0], rest: [9, 4, 0] },
  bhimpalasi: { name: 'Bhimpalasi', aroha: [-2, 0, 3, 5, 7, 10, 12], avaroha: [12, 10, 9, 7, 5, 3, 2, 0], rest: [5, 0, 12] },
  marwa: { name: 'Marwa', aroha: [0, 1, 4, 6, 9, 11, 12], avaroha: [12, 11, 9, 6, 4, 1, 0], rest: [1, 9, 0] },
  yaman: { name: 'Yaman', aroha: [-1, 2, 4, 6, 9, 11, 12], avaroha: [12, 11, 9, 7, 6, 4, 2, 0], rest: [4, 11, 0] },
  malkauns: { name: 'Malkauns', aroha: [0, 3, 5, 8, 10, 12], avaroha: [12, 10, 8, 5, 3, 0], rest: [5, 0, 12] },
};
export function ragaFor(hour: number): Raga {
  if (hour >= 4 && hour < 7.5) return RAGAS.bhairav; // dawn
  if (hour >= 7.5 && hour < 11) return RAGAS.bilawal; // morning
  if (hour >= 11 && hour < 16.5) return RAGAS.bhimpalasi; // afternoon
  if (hour >= 16.5 && hour < 19) return RAGAS.marwa; // sunset
  if (hour >= 19 && hour < 22.5) return RAGAS.yaman; // evening
  return RAGAS.malkauns; // late night
}

export class Radio {
  station: StationId = 'lofi';
  private out: GainNode;
  private duck: GainNode;
  private next = 0; // next beat time
  private beat = 0;
  private rng = mulberry32(12345);
  private key = 50;
  private prog = PROGS[0];
  private wobble: OscillatorNode;
  private wobbleGain: GainNode;
  private staticGain: GainNode;
  private game: Game | null = null;
  private interval: number;
  private bpm = 78;
  private section = 0;
  private lastNote = 0;
  private droneT = 0;
  private commentaryCooldown = 60;
  private melodyPrev = 0;
  private tuneT = 0;

  constructor(private a: Audio) {
    const c = a.ctx!;
    this.out = c.createGain();
    this.out.gain.value = 2.6;
    this.duck = c.createGain();
    this.out.connect(this.duck).connect(a.music);
    // tape wobble: a slow LFO feeding every voice's detune
    this.wobble = c.createOscillator();
    this.wobble.frequency.value = 0.35;
    this.wobbleGain = c.createGain();
    this.wobbleGain.gain.value = 7;
    this.wobble.connect(this.wobbleGain);
    this.wobble.start();
    // static bed (tuning noise, low fuel crackle, the static station)
    const s = a.noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 0.4;
    this.staticGain = c.createGain();
    this.staticGain.gain.value = 0;
    s.connect(bp).connect(this.staticGain).connect(this.duck);
    this.interval = window.setInterval(() => this.schedule(), 60);
  }

  bindGame(g: Game | null) {
    this.game = g;
    if (g) {
      const b = BIOMES[g.world.dominantBiome(g.focusPos.z)];
      this.setStation(b.radio === 'raga' && !FEATURES.india ? 'lofi' : (b.radio as StationId));
      this.rng = mulberry32(hashInts(g.world.seed, 13, Date.now() & 0xffff));
    }
  }

  available() {
    return STATIONS.filter((s) => FEATURES.india || !s.india);
  }

  cycle() {
    const list = this.available();
    const i = list.findIndex((s) => s.id === this.station);
    this.setStation(list[(i + 1) % list.length].id);
  }

  setStation(id: StationId) {
    this.station = id;
    const c = this.a.ctx!;
    this.next = c.currentTime + 0.4;
    this.beat = 0;
    this.section = 0;
    this.tuneT = 0.6; // a short burst of tuning static
    this.newProgression();
    this.bpm = id === 'lofi' ? 72 + Math.floor(this.rng() * 12) : id === 'night' ? 60 + Math.floor(this.rng() * 8) : id === 'raga' ? 70 : 60;
    const st = STATIONS.find((s) => s.id === id)!;
    if (this.game) {
      this.game.radioName = st.name + (id === 'raga' ? ' · ' + ragaFor(this.game.hour).name.toUpperCase() : '');
      this.game.radioFreq = st.freq;
    }
  }

  private newProgression() {
    this.prog = PROGS[Math.floor(this.rng() * PROGS.length)];
    if (this.rng() < 0.3) this.key = 48 + Math.floor(this.rng() * 7);
  }

  update(dt: number) {
    const g = this.game;
    const c = this.a.ctx!;
    const t = c.currentTime;
    const low = g ? g.car.fuel < 0.15 : false;
    const cam = g?.cameraRaised ?? false;
    const outside = g ? g.mode === 'walk' : false;
    // duck in the viewfinder; quieter outside the car; low fuel detunes and softens
    const target = (cam ? 0.55 : 1) * (outside ? 0.35 : 1) * (low ? 0.7 : 1) * (g?.paused ? 0.4 : 1);
    this.duck.gain.setTargetAtTime(target, t, 0.2);
    this.wobbleGain.gain.setTargetAtTime(this.station === 'lofi' ? 7 : 3, t, 1);
    this.tuneT = Math.max(0, this.tuneT - dt);
    const st = this.station === 'static' ? 0.035 : 0;
    this.staticGain.gain.setTargetAtTime(st + (low ? 0.012 : 0) + this.tuneT * 0.08, t, 0.05);
    this.lowFuelDetune = low ? -18 : 0;
    if (g && this.station === 'raga') {
      const nm = 'SUR SANDHYA · ' + ragaFor(g.hour).name.toUpperCase();
      if (g.radioName !== nm) g.radioName = nm;
    }
    // cricket commentary drifting through static (India layer)
    if (this.station === 'static' && FEATURES.india && g && !g.paused) {
      this.commentaryCooldown -= dt;
      if (this.commentaryCooldown <= 0) {
        this.commentaryCooldown = 40 + this.rng() * 50;
        if (this.rng() < 0.6) this.commentary();
      }
    }
  }
  private lowFuelDetune = 0;

  // -------------------------------------------------------------- scheduling
  private schedule() {
    const c = this.a.ctx;
    if (!c || c.state !== 'running') return;
    const horizon = c.currentTime + 0.35;
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < horizon) {
      const spb = 60 / this.bpm;
      switch (this.station) {
        case 'lofi': this.lofiBeat(this.next, spb); break;
        case 'ambient': this.ambientBeat(this.next, spb); break;
        case 'night': this.nightBeat(this.next, spb); break;
        case 'raga': this.ragaBeat(this.next, spb); break;
        case 'static': break;
      }
      this.beat++;
      this.next += this.station === 'lofi' || this.station === 'night' ? spb / 2 : spb; // 8th-note grid for groovy stations
    }
  }

  // -------------------------------------------------------------- voices
  private voice(freq: number, t: number, dur: number, vol: number, kind: 'keys' | 'bass' | 'pad' | 'bell' | 'flute' | 'pluck', glideFrom?: number) {
    const c = this.a.ctx!;
    const g = c.createGain(); g.gain.value = 0;
    g.connect(this.out);
    const oscs: OscillatorNode[] = [];
    const mk = (type: OscillatorType, mul: number, det: number, v: number) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime((glideFrom ?? freq) * mul, t);
      if (glideFrom) o.frequency.exponentialRampToValueAtTime(freq * mul, t + Math.min(0.35, dur * 0.4));
      o.detune.value = det + this.lowFuelDetune;
      this.wobbleGain.connect(o.detune);
      const og = c.createGain(); og.gain.value = 0;
      og.gain.value = v;
      o.connect(og).connect(g);
      oscs.push(o);
      return o;
    };
    let atk = 0.01, rel = dur;
    if (kind === 'keys') { mk('sine', 1, 0, 0.7); mk('triangle', 2, 4, 0.12); mk('sine', 3, -3, 0.06); atk = 0.008; }
    if (kind === 'bass') { mk('sine', 1, 0, 0.9); mk('triangle', 1, 0, 0.2); atk = 0.02; }
    if (kind === 'pad') { mk('sawtooth', 1, -8, 0.18); mk('sawtooth', 1, 8, 0.18); mk('triangle', 0.5, 0, 0.3); atk = Math.min(2.5, dur * 0.35); }
    if (kind === 'bell') { mk('sine', 1, 0, 0.6); mk('sine', 2.76, 0, 0.2); mk('sine', 5.4, 0, 0.08); atk = 0.003; }
    if (kind === 'pluck') { mk('triangle', 1, 0, 0.6); mk('sine', 2, 0, 0.2); atk = 0.004; }
    if (kind === 'flute') {
      const o = mk('sine', 1, 0, 0.75);
      mk('triangle', 2, 0, 0.06);
      // vibrato that blooms after the attack
      const vib = c.createOscillator();
      vib.frequency.value = 5.2;
      const vg = c.createGain(); vg.gain.value = 0;
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(dur, 0.9));
      vib.connect(vg).connect(o.frequency);
      vib.start(t);
      vib.stop(t + dur + 0.5);
      // breath
      const n = this.a.noiseSrc();
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq * 2;
      bp.Q.value = 3;
      const ng = c.createGain(); ng.gain.value = 0;
      ng.gain.value = 0.15;
      n.connect(bp).connect(ng).connect(g);
      n.stop(t + dur + 0.6);
      atk = 0.08;
    }
    let filt: BiquadFilterNode | null = null;
    if (kind === 'pad') {
      filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(500, t);
      filt.frequency.linearRampToValueAtTime(1200, t + dur * 0.6);
      g.disconnect();
      g.connect(filt).connect(this.out);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    if (kind === 'pad' || kind === 'flute') {
      g.gain.setValueAtTime(vol, t + Math.max(atk, dur - 0.6));
      g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
    } else g.gain.exponentialRampToValueAtTime(0.0001, t + rel);
    for (const o of oscs) { o.start(t); o.stop(t + dur + 0.6); }
    setTimeout(() => { try { for (const o of oscs) this.wobbleGain.disconnect(o.detune); } catch { /* already gone */ } }, (t - c.currentTime + dur + 1) * 1000);
  }

  private drum(kind: 'kick' | 'snare' | 'hat' | 'brush' | 'ride' | 'crackle', t: number, vol: number) {
    const c = this.a.ctx!;
    const g = c.createGain(); g.gain.value = 0;
    g.connect(this.out);
    if (kind === 'kick') {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.3);
      return;
    }
    const n = this.a.noiseSrc();
    const f = c.createBiquadFilter();
    if (kind === 'snare') { f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.8; }
    if (kind === 'hat') { f.type = 'highpass'; f.frequency.value = 7000; }
    if (kind === 'brush') { f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.5; }
    if (kind === 'ride') { f.type = 'highpass'; f.frequency.value = 5000; }
    if (kind === 'crackle') { f.type = 'highpass'; f.frequency.value = 3000; }
    const dur = kind === 'snare' ? 0.16 : kind === 'brush' ? 0.22 : kind === 'ride' ? 0.4 : kind === 'crackle' ? 0.01 : 0.05;
    const atk = kind === 'brush' ? 0.06 : 0.001;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g);
    n.stop(t + dur + 0.05);
  }

  // -------------------------------------------------------------- stations
  private chordAt(bar: number) {
    return this.prog[bar % this.prog.length];
  }

  private lofiBeat(t: number, spb: number) {
    const r = this.rng;
    const step = this.beat % 8; // 8th notes in a bar of 4/4
    const bar = Math.floor(this.beat / 8);
    if (step === 0 && bar % 16 === 0 && bar > 0) { this.newProgression(); this.section = (this.section + 1) % 4; }
    const swing = step % 2 === 1 ? spb * 0.09 : 0;
    const tt = t + swing;
    const [deg, shape] = this.chordAt(bar);
    const root = this.key + deg;
    const breakdown = this.section === 3;
    // drums: soft kick on 1 and the "and" of 3, snare on 2 and 4, lazy hats
    if (!breakdown) {
      if (step === 0 || (step === 5 && r() < 0.7)) this.drum('kick', tt, 0.5);
      if (step === 2 || step === 6) this.drum('snare', tt, 0.12);
      if (r() < 0.8) this.drum('hat', tt, step % 2 ? 0.03 : 0.05);
    }
    if (r() < 0.3) this.drum('crackle', t + r() * spb * 0.5, 0.05);
    // keys: chord stab at bar start, sometimes again on the "and" of 2
    if (step === 0 || (step === 3 && r() < 0.35)) {
      const inv = Math.floor(r() * 2) * 12;
      shape.forEach((iv, i) => this.voice(midi(root + iv + (i === 0 ? inv : 12)), tt + i * 0.012, spb * 3.5, 0.045, 'keys'));
    }
    // bass on 1 and 3
    if (step === 0 || step === 4) this.voice(midi(root - 12 + (step === 4 && r() < 0.4 ? 7 : 0)), tt, spb * 1.6, 0.16, 'bass');
    // sparse melody from the chord's pentatonic, more in some sections
    const melodyP = this.section === 1 ? 0.28 : this.section === 2 ? 0.16 : 0.07;
    if (r() < melodyP && step !== 7) {
      const pent = [0, 2, 4, 7, 9];
      const n = this.key + 12 + pent[Math.floor(r() * 5)] + (r() < 0.3 ? 12 : 0);
      this.voice(midi(n), tt, spb * (0.6 + r() * 1.2), 0.04, 'bell');
    }
  }

  private ambientBeat(t: number, spb: number) {
    const r = this.rng;
    const b = this.beat;
    // new pad chord every 12 beats (~12 s), modal and slow
    if (b % 12 === 0) {
      if (b % 48 === 0) this.newProgression();
      const [deg, shape] = this.chordAt(Math.floor(b / 12));
      const root = this.key + deg - 12;
      for (const iv of shape.slice(0, 3)) this.voice(midi(root + iv + 12), t, spb * 13, 0.05, 'pad');
      this.voice(midi(this.key - 24), t, spb * 13, 0.06, 'pad');
    }
    if (r() < 0.12) {
      const lyd = [0, 2, 4, 6, 7, 9, 11];
      this.voice(midi(this.key + 24 + lyd[Math.floor(r() * 7)]), t + r() * 0.5, 3.5, 0.03, 'bell');
    }
  }

  private nightBeat(t: number, spb: number) {
    const r = this.rng;
    const step = this.beat % 8;
    const bar = Math.floor(this.beat / 8);
    if (step === 0 && bar % 12 === 0 && bar > 0) this.newProgression();
    const swing = step % 2 === 1 ? spb * 0.16 : 0;
    const tt = t + swing;
    const [deg, shape] = this.chordAt(bar);
    const root = this.key - 2 + deg;
    if (step === 2 || step === 6) this.drum('brush', tt, 0.07);
    if (step % 2 === 0 || r() < 0.3) this.drum('ride', tt, 0.015);
    if (step % 2 === 0) {
      // walking upright bass, soft
      const walk = [0, 7, 5, 4, 3, 7, 10, 12];
      this.voice(midi(root - 24 + walk[(bar * 4 + step / 2) % walk.length]), tt, spb * 0.95, 0.13, 'bass');
    }
    if (step === 0 && r() < 0.75) shape.slice(0, 4).forEach((iv, i) => this.voice(midi(root + iv + 12), tt + i * 0.03, spb * 3, 0.035, 'keys'));
    if (r() < 0.07) this.voice(midi(root + 24 + [0, 3, 7, 10, 14][Math.floor(r() * 5)]), tt, spb * 1.5, 0.03, 'keys');
  }

  private ragaBeat(t: number, spb: number) {
    const g = this.game;
    if (!g) return;
    const r = this.rng;
    const raga = ragaFor(g.hour);
    const sa = 50; // D3 as Sa
    // tanpura: Pa (or Ma/Ni) – Sa' – Sa' – Sa, one pluck per beat, every cycle
    const tp = this.beat % 4;
    const first = raga.aroha.includes(7) || raga.avaroha.includes(7) ? 7 - 12 : raga.aroha.includes(5) ? 5 - 12 : 11 - 12;
    const notes = [first, 0, 0, -12];
    this.voice(midi(sa + notes[tp]), t, spb * 4.2, 0.05, 'pluck');
    // alap for the first 32 beats after tuning in, then a light keherwa on tabla-like drums
    const alap = this.beat < 32;
    if (!alap) {
      const kh = ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na'];
      const bol = kh[this.beat % 8];
      this.tabla(bol, t, sa);
      if (r() < 0.25) this.tabla('ti', t + spb / 2, sa);
    }
    // melody: phrases moving up by aroha, down by avaroha, resting on the raga's resting notes
    this.droneT -= spb;
    if (this.droneT <= 0) {
      const up = r() < 0.5;
      const scale = up ? raga.aroha : raga.avaroha;
      let idx = scale.indexOf(this.melodyPrev);
      if (idx < 0) idx = up ? 0 : 0;
      idx = Math.max(0, Math.min(scale.length - 1, idx + (r() < 0.75 ? 1 : 2)));
      let note = scale[idx];
      const resting = r() < 0.25;
      if (resting) note = raga.rest[Math.floor(r() * raga.rest.length)];
      const dur = spb * (resting ? 3 + r() * 3 : alap ? 1.5 + r() * 2 : 0.8 + r() * 1.4);
      const glide = r() < 0.35 ? midi(sa + 12 + this.melodyPrev) : undefined; // meend
      this.voice(midi(sa + 12 + note), t, dur, alap ? 0.06 : 0.05, 'flute', glide);
      this.melodyPrev = note;
      this.droneT = dur + (r() < 0.2 ? spb * (1 + r() * 2) : 0);
    }
  }

  private tabla(bol: string, t: number, sa: number) {
    const c = this.a.ctx!;
    const g = c.createGain(); g.gain.value = 1;
    g.connect(this.out);
    const ring = (f: number, dur: number, v: number) => {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(f, t);
      const og = c.createGain(); og.gain.value = 0;
      og.gain.setValueAtTime(v, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
      const o2 = c.createOscillator();
      o2.frequency.setValueAtTime(f * 2.01, t);
      const og2 = c.createGain(); og2.gain.value = 0;
      og2.gain.setValueAtTime(v * 0.3, t);
      og2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.5);
      o2.connect(og2).connect(g);
      o2.start(t);
      o2.stop(t + dur);
    };
    const bayan = (v: number) => {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(70, t);
      o.frequency.linearRampToValueAtTime(95, t + 0.12); // the rising "ghe" slide
      const og = c.createGain(); og.gain.value = 0;
      og.gain.setValueAtTime(v, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 0.5);
    };
    const dayanF = midi(sa + 12);
    if (bol === 'dha' || bol === 'dhi') { bayan(0.22); ring(dayanF, 0.35, 0.08); }
    if (bol === 'ge') bayan(0.2);
    if (bol === 'na') ring(dayanF, 0.4, 0.09);
    if (bol === 'ti') ring(dayanF * 1.5, 0.08, 0.05);
    if (bol === 'ka') this.drum('snare', t, 0.04);
  }

  private commentary() {
    const g = this.game;
    if (!g) return;
    const line = COMMENTARY[Math.floor(this.rng() * COMMENTARY.length)];
    g.events.emit('subtitle', { who: 'Radio (faint)', text: line, ms: 5500 });
    // a voice-like babble under the static: formant-filtered noise with syllable rhythm, then a crowd swell
    const c = this.a.ctx!;
    const t = c.currentTime;
    const n = this.a.noiseSrc();
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 700;
    f1.Q.value = 4;
    const amp = c.createGain(); amp.gain.value = 0;
    amp.gain.value = 0;
    for (let i = 0; i < 22; i++) {
      const tt = t + i * 0.16 + this.rng() * 0.04;
      amp.gain.setValueAtTime(0, tt);
      amp.gain.linearRampToValueAtTime(0.05 + this.rng() * 0.03, tt + 0.04);
      amp.gain.linearRampToValueAtTime(0, tt + 0.13);
      f1.frequency.setValueAtTime(500 + this.rng() * 700, tt);
    }
    n.connect(f1).connect(amp).connect(this.duck);
    n.stop(t + 4);
    const crowd = this.a.noiseSrc(true);
    const cg = c.createGain(); cg.gain.value = 0;
    cg.gain.setValueAtTime(0, t + 3);
    cg.gain.linearRampToValueAtTime(0.06, t + 3.6);
    cg.gain.linearRampToValueAtTime(0, t + 6);
    crowd.connect(cg).connect(this.duck);
    crowd.stop(t + 6.2);
  }

  dispose() {
    clearInterval(this.interval);
  }
}
