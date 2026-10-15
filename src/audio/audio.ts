// Procedural audio: engine, tyres by surface, wind, rain and thunder, biome ambience beds,
// spatial animal calls and traffic, and small effects. Everything is synthesised with Web Audio.
import * as THREE from 'three';
import type { Game } from '../game';
import { Radio } from './radio';
import { BIOMES, BiomeId } from '../../data/biomes';

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  amb!: GainNode;
  sfx!: GainNode;
  private muffle!: BiquadFilterNode;
  noise!: AudioBuffer;
  brown!: AudioBuffer;
  radio: Radio | null = null;
  private g: Game | null = null;
  // engine
  private eOsc: OscillatorNode[] = [];
  private eGain!: GainNode;
  private eFilt!: BiquadFilterNode;
  private tyre!: { src: AudioBufferSourceNode; bp: BiquadFilterNode; gain: GainNode; hp: BiquadFilterNode; gGain: GainNode };
  private wind!: { bp: BiquadFilterNode; gain: GainNode };
  private rain!: { gain: GainNode; roof: GainNode };
  private beds: Record<string, GainNode> = {};
  private bedSrc: Record<string, { gain: GainNode; lfo?: OscillatorNode }> = {};
  private callTimer = 0;
  private trafficVoices: { osc: OscillatorNode; gain: GainNode; pan: PannerNode }[] = [];
  private stepTimer = 0;
  private wasDriving = true;

  /** must be called from a user gesture */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext({ latencyHint: 'playback' });
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(c.destination);
    this.music = c.createGain();
    this.music.connect(this.master);
    this.amb = c.createGain();
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.amb.connect(this.muffle).connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.noise = this.makeNoise(false);
    this.brown = this.makeNoise(true);
    this.buildCar();
    this.buildWeather();
    this.buildBeds();
    this.radio = new Radio(this);
    if (this.g) this.bind(this.g);
  }

  private makeNoise(brown: boolean): AudioBuffer {
    const c = this.ctx!;
    const b = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  noiseSrc(brown = false): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = true;
    s.loopStart = Math.random() * 2;
    s.start(0, Math.random() * 2);
    return s;
  }

  private buildCar() {
    const c = this.ctx!;
    this.eGain = c.createGain();
    this.eGain.gain.value = 0;
    this.eFilt = c.createBiquadFilter();
    this.eFilt.type = 'lowpass';
    this.eFilt.frequency.value = 400;
    this.eFilt.Q.value = 2;
    for (const [type, mul, g] of [['sawtooth', 1, 0.5], ['sawtooth', 1.007, 0.4], ['square', 0.5, 0.35]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = 40 * mul;
      (o as any).mul = mul;
      const og = c.createGain(); og.gain.value = 0;
      og.gain.value = g;
      o.connect(og).connect(this.eFilt);
      o.start();
      this.eOsc.push(o);
    }
    const rumble = this.noiseSrc(true);
    const rg = c.createGain(); rg.gain.value = 0;
    rg.gain.value = 0.25;
    rumble.connect(rg).connect(this.eFilt);
    this.eFilt.connect(this.eGain).connect(this.sfx);
    // tyres
    const src = this.noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.8;
    const gain = c.createGain(); gain.gain.value = 0;
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(this.sfx);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const gGain = c.createGain(); gGain.gain.value = 0;
    gGain.gain.value = 0;
    src.connect(hp).connect(gGain).connect(this.sfx);
    this.tyre = { src, bp, gain, hp, gGain };
    // wind
    const ws = this.noiseSrc();
    const wbp = c.createBiquadFilter();
    wbp.type = 'bandpass';
    wbp.Q.value = 0.6;
    const wg = c.createGain(); wg.gain.value = 0;
    wg.gain.value = 0;
    ws.connect(wbp).connect(wg).connect(this.sfx);
    this.wind = { bp: wbp, gain: wg };
  }

  private buildWeather() {
    const c = this.ctx!;
    const s = this.noiseSrc();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    const gain = c.createGain(); gain.gain.value = 0;
    gain.gain.value = 0;
    s.connect(hp).connect(lp).connect(gain).connect(this.amb);
    // rain on the roof: a lower, drummy band heard inside the car
    const roofBp = c.createBiquadFilter();
    roofBp.type = 'bandpass';
    roofBp.frequency.value = 900;
    roofBp.Q.value = 0.7;
    const roof = c.createGain(); roof.gain.value = 0;
    roof.gain.value = 0;
    s.connect(roofBp).connect(roof).connect(this.sfx);
    this.rain = { gain, roof };
  }

  private buildBeds() {
    const c = this.ctx!;
    // continuous layers: wind-in-trees, waves, desert wind, city murmur, insects
    const layer = (name: string, f: (out: GainNode) => void) => {
      const g = c.createGain(); g.gain.value = 0;
      g.gain.value = 0;
      g.connect(this.amb);
      this.beds[name] = g;
      f(g);
    };
    layer('trees', (out) => {
      const s = this.noiseSrc(true);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.08;
      const lg = c.createGain(); lg.gain.value = 0;
      lg.gain.value = 0.35;
      const vg = c.createGain(); vg.gain.value = 0;
      vg.gain.value = 0.6;
      lfo.connect(lg).connect(vg.gain);
      lfo.start();
      s.connect(lp).connect(vg).connect(out);
    });
    layer('waves', (out) => {
      const s = this.noiseSrc();
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const vg = c.createGain(); vg.gain.value = 0;
      vg.gain.value = 0.4;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.11;
      const lg = c.createGain(); lg.gain.value = 0;
      lg.gain.value = 0.38;
      lfo.connect(lg).connect(vg.gain);
      lfo.start();
      s.connect(lp).connect(vg).connect(out);
    });
    layer('desert', (out) => {
      const s = this.noiseSrc();
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      bp.frequency.value = 500;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05;
      const lg = c.createGain(); lg.gain.value = 0;
      lg.gain.value = 300;
      lfo.connect(lg).connect(bp.frequency);
      lfo.start();
      const vg = c.createGain(); vg.gain.value = 0;
      vg.gain.value = 0.5;
      s.connect(bp).connect(vg).connect(out);
    });
    layer('city', (out) => {
      const s = this.noiseSrc(true);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 0.5;
      s.connect(bp).connect(out);
    });
    layer('insects', (out) => {
      // cicada-like shimmer: high noise band, gently pulsed
      const s = this.noiseSrc();
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 5200;
      bp.Q.value = 6;
      const vg = c.createGain(); vg.gain.value = 0;
      vg.gain.value = 0.3;
      const lfo = c.createOscillator();
      lfo.frequency.value = 7;
      const lg = c.createGain(); lg.gain.value = 0;
      lg.gain.value = 0.25;
      lfo.connect(lg).connect(vg.gain);
      lfo.start();
      s.connect(bp).connect(vg).connect(out);
    });
    layer('crickets', (out) => {
      const o = c.createOscillator();
      o.frequency.value = 4400;
      const vg = c.createGain(); vg.gain.value = 0;
      vg.gain.value = 0;
      const lfo = c.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 16;
      const lg = c.createGain(); lg.gain.value = 0;
      lg.gain.value = 0.05;
      lfo.connect(lg).connect(vg.gain);
      const slow = c.createOscillator();
      slow.frequency.value = 0.7;
      const sg = c.createGain(); sg.gain.value = 0;
      sg.gain.value = 0.04;
      slow.connect(sg).connect(vg.gain);
      o.start(); lfo.start(); slow.start();
      o.connect(vg).connect(out);
    });
  }

  private boundTo: Game | null = null;
  bind(g: Game) {
    this.g = g;
    if (!this.ctx || this.boundTo === g) return;
    this.boundTo = g;
    g.events.on('bump', ({ strength }) => this.thud(strength));
    g.events.on('shutter', () => this.shutter());
    g.events.on('horn', (p: any) => this.horn(!!p?.npc));
    g.events.on('modeChange', () => this.door());
    g.events.on('money', ({ delta }) => { if (delta > 0) this.ding(); });
    g.events.on('toll', () => this.beep());
    g.events.on('lightning', ({ delay }) => this.thunder(delay));
    this.radio?.bindGame(g);
  }

  unbind() {
    this.g = null;
    this.radio?.bindGame(null);
  }

  setVolumes(master: number, music: number, amb: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.1);
    this.music.gain.setTargetAtTime(music, t, 0.1);
    this.amb.gain.setTargetAtTime(amb, t, 0.1);
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const g = this.g;
    const c = this.ctx;
    if (!g || !c || c.state !== 'running') return;
    const t = c.currentTime;
    const driving = g.mode === 'drive';
    const inside = driving && !g.cameraRaised;
    const paused = g.paused;
    // muffle the world while inside the car
    this.muffle.frequency.setTargetAtTime(inside ? 1400 : 18000, t, 0.15);
    // listener follows the camera
    const L = c.listener;
    const cp = g.camera.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    if (L.positionX) {
      L.positionX.setTargetAtTime(cp.x, t, 0.05); L.positionY.setTargetAtTime(cp.y, t, 0.05); L.positionZ.setTargetAtTime(cp.z, t, 0.05);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.05); L.forwardY.setTargetAtTime(fwd.y, t, 0.05); L.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    }
    // engine: pitch follows rpm; silent when you're out of the car and away from it
    const car = g.car;
    const near = driving ? 1 : Math.max(0, 1 - g.distToCar() / 25) * 0.5;
    const rpmF = car.rpm / 60;
    for (const o of this.eOsc) o.frequency.setTargetAtTime(rpmF * 0.5 * (o as any).mul, t, 0.05);
    const thr = driving ? Math.max(g.input.throttle(), car.cruise !== null ? 0.4 : 0) : 0;
    this.eFilt.frequency.setTargetAtTime(220 + thr * 700 + rpmF * 2, t, 0.08);
    this.eGain.gain.setTargetAtTime(paused ? 0 : (0.05 + thr * 0.05) * near * (inside ? 1 : 0.6) * (driving || this.wasDriving ? 1 : 1), t, 0.1);
    // tyres + wind with speed
    const sp = Math.abs(car.speed);
    const surf = car.surface;
    const tyreG = paused ? 0 : Math.min(1, sp / 25) * (driving ? 1 : near);
    this.tyre.bp.frequency.setTargetAtTime(surf === 'asphalt' ? 320 + sp * 6 : surf === 'offroad' ? 160 : 260, t, 0.1);
    this.tyre.gain.gain.setTargetAtTime(tyreG * (surf === 'asphalt' ? 0.05 : surf === 'offroad' ? 0.12 : 0.08), t, 0.1);
    this.tyre.gGain.gain.setTargetAtTime(tyreG * (surf === 'gravel' ? 0.07 : surf === 'dirt' ? 0.025 : 0), t, 0.08);
    this.wind.bp.frequency.setTargetAtTime(500 + sp * 30, t, 0.2);
    this.wind.gain.gain.setTargetAtTime(paused ? 0 : driving ? Math.min(0.12, (sp * sp) / 9000) * (inside ? 0.6 : 1.5) : 0.02 * g.windAmount, t, 0.2);
    // rain
    const rain = g.rainAmount;
    this.rain.gain.gain.setTargetAtTime(paused ? 0 : rain * 0.12, t, 0.5);
    this.rain.roof.gain.setTargetAtTime(paused ? 0 : inside ? rain * 0.1 : 0, t, 0.3);
    // biome beds
    const r = g.world.road(g.focusPos.z);
    const w: Record<string, number> = { trees: 0, waves: 0, desert: 0, city: 0, insects: 0, crickets: 0 };
    const night = g.sky.night;
    const add = (b: BiomeId, k: number) => {
      if (b === 'forest') { w.trees += 0.25 * k; }
      if (b === 'coast') { w.waves += 0.35 * k; w.trees += 0.05 * k; }
      if (b === 'desert') { w.desert += 0.12 * k; }
      if (b === 'farm') { w.trees += 0.08 * k; }
      if (b === 'tropical') { w.insects += 0.05 * k * (1 - night * 0.5); w.trees += 0.12 * k; }
      if (b === 'city') { w.city += 0.12 * k; }
      if (b !== 'city' && b !== 'desert') w.crickets += 0.5 * k * night;
    };
    add(r.blend.a, 1 - r.blend.t);
    if (r.blend.t > 0) add(r.blend.b, r.blend.t);
    for (const k in this.beds) this.beds[k].gain.setTargetAtTime(paused ? 0 : w[k] * (1 - rain * 0.5), t, 0.8);
    // one-shot birds and spatial calls
    this.callTimer -= dt;
    if (!paused && this.callTimer <= 0) {
      this.callTimer = 1.5 + Math.random() * 4;
      this.ambientCall(r.blend.t > 0.5 ? r.blend.b : r.blend.a, night, rain);
    }
    // footsteps on foot
    if (!driving && !paused) {
      const v = Math.hypot(g.walker.vel.x, g.walker.vel.z);
      this.stepTimer -= dt * v;
      if (v > 0.4 && this.stepTimer <= 0) {
        this.stepTimer = 0.75;
        this.step(g.world.surfaceAt(g.walker.pos.x, g.walker.pos.z));
      }
    }
    this.wasDriving = driving;
    if (g.weddingNear && !paused) {
      const p = (g.happenings as any).procession?.group.position as THREE.Vector3 | undefined;
      if (p) this.band(dt, p);
    }
    this.updateTraffic(t);
    this.radio?.update(dt);
  }

  private ambientCall(b: BiomeId, night: number, rain: number) {
    const g = this.g!;
    if (rain > 0.6) return;
    // a nearby animal calls (spatial), otherwise a generic biome bird
    const animals = [...g.animals.active.values()].filter((a) => a.obj.visible && a.obj.position.distanceTo(g.camera.position) < 120);
    if (animals.length && Math.random() < 0.6) {
      const a = animals[Math.floor(Math.random() * animals.length)];
      const call = CALL[a.def.model ?? ''];
      if (call) return this.play(call, a.obj.position);
    }
    if (night > 0.6) return;
    if (b === 'forest' || b === 'farm' || b === 'tropical') this.play(b === 'tropical' ? 'whistle' : 'chirp', this.randomAround(40));
    if (b === 'coast' && Math.random() < 0.5) this.play('gull', this.randomAround(60));
    if (b === 'city' && Math.random() < 0.3) this.play('beep', this.randomAround(120));
    void BIOMES;
  }

  private randomAround(r: number) {
    const p = this.g!.camera.position;
    const a = Math.random() * Math.PI * 2;
    return new THREE.Vector3(p.x + Math.cos(a) * r, p.y + 6, p.z + Math.sin(a) * r);
  }

  private panner(pos: THREE.Vector3): PannerNode {
    const c = this.ctx!;
    const p = c.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 8;
    p.rolloffFactor = 1;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    p.connect(this.amb);
    return p;
  }

  /** Synthesised calls. */
  play(kind: string, pos: THREE.Vector3) {
    const c = this.ctx!;
    const t = c.currentTime + 0.02;
    const out = this.panner(pos);
    const tone = (f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, start = 0) => {
      const o = c.createOscillator();
      o.type = type;
      const gg = c.createGain(); gg.gain.value = 0;
      o.frequency.setValueAtTime(f0, t + start);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + start + dur);
      gg.gain.setValueAtTime(0, t + start);
      gg.gain.linearRampToValueAtTime(vol, t + start + 0.01);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(gg).connect(out);
      o.start(t + start);
      o.stop(t + start + dur + 0.05);
    };
    switch (kind) {
      case 'chirp': { const n = 2 + Math.floor(Math.random() * 4); const f = 2600 + Math.random() * 1600; for (let i = 0; i < n; i++) tone(f, f * (0.8 + Math.random() * 0.5), 0.07, 'sine', 0.05, i * 0.11); break; }
      case 'whistle': { const f = 1400 + Math.random() * 900; tone(f, f * 1.5, 0.25, 'sine', 0.05); tone(f * 1.5, f, 0.3, 'sine', 0.05, 0.3); break; }
      case 'gull': tone(1300, 800, 0.35, 'sawtooth', 0.025); tone(1250, 760, 0.3, 'sawtooth', 0.02, 0.45); break;
      case 'hoot': tone(420, 380, 0.35, 'sine', 0.12); tone(400, 360, 0.6, 'sine', 0.12, 0.5); break;
      case 'caw': tone(700, 520, 0.22, 'sawtooth', 0.04); tone(680, 500, 0.22, 'sawtooth', 0.04, 0.32); break;
      case 'croak': tone(260, 180, 0.4, 'sawtooth', 0.05); break;
      case 'bark': tone(900, 400, 0.12, 'square', 0.04); break;
      case 'low': tone(140, 110, 1.0, 'sawtooth', 0.04); break;
      case 'trumpet': tone(500, 900, 0.5, 'sawtooth', 0.06); tone(900, 700, 0.6, 'sawtooth', 0.05, 0.5); break;
      case 'peacock': tone(900, 1300, 0.25, 'square', 0.03); tone(1300, 1200, 0.4, 'square', 0.03, 0.3); break;
      case 'coo': tone(380, 340, 0.3, 'sine', 0.05); tone(360, 320, 0.4, 'sine', 0.05, 0.35); break;
      case 'meow': tone(600, 900, 0.15, 'sawtooth', 0.02); tone(900, 500, 0.3, 'sawtooth', 0.02, 0.15); break;
      case 'chatter': for (let i = 0; i < 5; i++) tone(1100 + Math.random() * 400, 800, 0.06, 'square', 0.02, i * 0.09); break;
      case 'beep': tone(440, 440, 0.15, 'square', 0.015); tone(550, 550, 0.15, 'square', 0.015, 0.18); break;
      case 'growl': tone(110, 70, 1.2, 'sawtooth', 0.05); break;
      case 'spout': { const s = this.noiseSrc(); const gg = c.createGain(); gg.gain.value = 0; gg.gain.setValueAtTime(0.12, t); gg.gain.exponentialRampToValueAtTime(0.001, t + 1.5); s.connect(gg).connect(out); s.stop(t + 1.6); break; }
    }
  }

  private updateTraffic(t: number) {
    const g = this.g!;
    const c = this.ctx!;
    const vs = g.life.traffic.vehicles
      .map((v) => ({ v, d: v.obj.position.distanceTo(g.camera.position) }))
      .filter((x) => x.d < 160)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    while (this.trafficVoices.length < 3) {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      const gain = c.createGain(); gain.gain.value = 0;
      gain.gain.value = 0;
      const pan = this.panner(new THREE.Vector3());
      osc.connect(lp).connect(gain).connect(pan);
      osc.start();
      this.trafficVoices.push({ osc, gain, pan });
    }
    this.trafficVoices.forEach((tv, i) => {
      const x = vs[i];
      if (!x || g.paused) { tv.gain.gain.setTargetAtTime(0, t, 0.3); return; }
      const p = x.v.obj.position;
      tv.pan.positionX.setTargetAtTime(p.x, t, 0.05);
      tv.pan.positionY.setTargetAtTime(p.y + 1, t, 0.05);
      tv.pan.positionZ.setTargetAtTime(p.z, t, 0.05);
      const big = x.v.kind === 'truck' || x.v.kind === 'bus' || x.v.kind === 'painted' || x.v.kind === 'tractor';
      tv.osc.frequency.setTargetAtTime((big ? 38 : 55) + x.v.speed * (big ? 1.2 : 2), t, 0.1);
      tv.gain.gain.setTargetAtTime(0.06, t, 0.2);
    });
  }

  // ------------------------------------------------------------------ effects
  private env(node: AudioNode, vol: number, dur: number, attack = 0.005) {
    const c = this.ctx!;
    const g = c.createGain(); g.gain.value = 0;
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g).connect(this.sfx);
    return t;
  }
  thud(strength: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(90, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.25);
    const t = this.env(o, 0.25 * (0.4 + strength), 0.3);
    o.start(t);
    o.stop(t + 0.35);
  }
  shutter() {
    if (!this.ctx) return;
    const s = this.noiseSrc();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    s.connect(hp);
    const t = this.env(hp, 0.25, 0.06, 0.001);
    s.stop(t + 0.08);
    const s2 = this.noiseSrc();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    s2.connect(bp);
    const g = this.ctx.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0, t + 0.09);
    g.gain.linearRampToValueAtTime(0.18, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    bp.connect(g).connect(this.sfx);
    s2.stop(t + 0.2);
  }
  horn(npc: boolean) {
    if (!this.ctx) return;
    const c = this.ctx;
    for (const f of npc ? [520, 650] : [392, 494]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      o.connect(lp);
      const t = this.env(lp, npc ? 0.025 : 0.06, npc ? 0.25 : 0.45, 0.01);
      o.start(t);
      o.stop(t + 0.5);
    }
  }
  door() {
    if (!this.ctx) return;
    const s = this.noiseSrc(true);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    s.connect(lp);
    const t = this.env(lp, 0.5, 0.18, 0.002);
    s.stop(t + 0.2);
  }
  ding() {
    if (!this.ctx) return;
    const c = this.ctx;
    for (const [f, d] of [[1318, 0], [1760, 0.09]]) {
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0;
      const t = c.currentTime + d;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.7);
    }
  }
  beep() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1800;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    o.connect(lp);
    const t = this.env(lp, 0.03, 0.18, 0.002);
    o.start(t);
    o.stop(t + 0.2);
  }
  private bandT = 0;
  private bandStep = 0;
  /** a little brass band and drum when a wedding procession is near */
  private band(dt: number, pos: THREE.Vector3) {
    this.bandT -= dt;
    if (this.bandT > 0) return;
    this.bandT = 0.32;
    const c = this.ctx!;
    const out = this.panner(pos);
    const t = c.currentTime + 0.02;
    const tune = [67, 69, 71, 72, 71, 69, 67, 64, 62, 64, 67, 67, 69, 71, 69, 67];
    const n = tune[this.bandStep % tune.length];
    this.bandStep++;
    for (const [mul, type, v] of [[1, 'square', 0.03], [0.5, 'sawtooth', 0.02]] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = 440 * Math.pow(2, (n - 69) / 12) * mul;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1600;
      const gg = c.createGain(); gg.gain.value = 0;
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(v, t + 0.03);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(lp).connect(gg).connect(out);
      o.start(t);
      o.stop(t + 0.32);
    }
    if (this.bandStep % 2 === 0) {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      const gg = c.createGain(); gg.gain.value = 0;
      gg.gain.setValueAtTime(0.25, t);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(gg).connect(out);
      o.start(t);
      o.stop(t + 0.22);
    }
  }
  thunder(delay: number) {
    if (!this.ctx) return;
    const c = this.ctx;
    const s = this.noiseSrc(true);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = c.createGain(); g.gain.value = 0;
    const t = c.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    s.connect(lp).connect(g).connect(this.amb);
    s.stop(t + 5);
  }
  private step(surface: string) {
    const c = this.ctx!;
    const s = this.noiseSrc();
    const f = c.createBiquadFilter();
    f.type = surface === 'gravel' ? 'highpass' : 'lowpass';
    f.frequency.value = surface === 'gravel' ? 2200 : surface === 'asphalt' ? 900 : 500;
    s.connect(f);
    const t = this.env(f, surface === 'gravel' ? 0.06 : 0.08, 0.09, 0.003);
    s.stop(t + 0.1);
  }
}

const CALL: Record<string, string> = {
  owl: 'hoot', crow: 'caw', heron: 'croak', gull: 'gull', hawk: 'whistle', deer: 'bark', elk: 'low', cow: 'low', horse: 'low',
  fox: 'bark', coyote: 'bark', elephant: 'trumpet', peacock: 'peacock', pigeon: 'coo', cat: 'meow', monkey: 'chatter', parrot: 'chatter',
  kingfisher: 'chirp', whale: 'spout', tiger: 'growl', camel: 'low', blackbuck: 'bark',
};
