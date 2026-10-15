// Rolling weather by biome (clear, overcast, fog, rain, storm), rain particles, wet roads,
// lightning with thunder, monsoon downpours, and the rare sky events with readable rules:
// rainbows after rain with the sun low behind you, meteor showers on some clear nights,
// aurora on rare clear nights in the pine forest, mist on ghat roads in the early morning.
import * as THREE from 'three';
import type { Game } from '../game';
import { BIOMES, WeatherId } from '../../data/biomes';
import { shared } from './toon';
import { hashInts, Rng, SYS } from '../world/prng';
import { lightWindow } from './sky';

interface Params { ov: number; fog: number; rain: number; storm: number }
const P: Record<WeatherId, Params> = {
  clear: { ov: 0.05, fog: 0, rain: 0, storm: 0 },
  overcast: { ov: 0.75, fog: 0.05, rain: 0, storm: 0 },
  fog: { ov: 0.5, fog: 0.88, rain: 0, storm: 0 },
  rain: { ov: 0.85, fog: 0.15, rain: 0.65, storm: 0 },
  storm: { ov: 1, fog: 0.2, rain: 1, storm: 1 },
};

const rainVert = /* glsl */ `
uniform float uTime; uniform vec3 uCam; uniform float uSlant;
attribute float aEnd;
varying float vA;
void main(){
  vec3 p = position;
  float box = 50.0, hgt = 30.0;
  p.y = mod(p.y - uTime * 22.0, hgt);
  p.xz = mod(p.xz - uCam.xz + box * 0.5, box) - box * 0.5;
  p.x += aEnd * uSlant * 0.06;
  p.y += aEnd * 0.9;
  vec3 world = vec3(uCam.x + p.x, uCam.y - 10.0 + p.y, uCam.z + p.z);
  vA = 1.0 - aEnd * 0.6;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const rainFrag = /* glsl */ `
uniform float uAlpha; uniform vec3 uCol;
varying float vA;
void main(){ gl_FragColor = vec4(uCol, uAlpha * vA); }`;

const bowFrag = /* glsl */ `
varying vec2 vUv;
uniform float uAlpha;
void main(){
  // vUv.y runs across the band: red outside → violet inside
  float t = vUv.y;
  vec3 c = t < 0.17 ? vec3(0.62,0.35,0.85) : t < 0.33 ? vec3(0.35,0.45,0.95) : t < 0.5 ? vec3(0.35,0.8,0.45) : t < 0.67 ? vec3(0.98,0.9,0.35) : t < 0.83 ? vec3(0.98,0.6,0.25) : vec3(0.95,0.3,0.3);
  float edge = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.88, t);
  gl_FragColor = vec4(c, uAlpha * edge * 0.75);
  #include <colorspace_fragment>
}`;

export class Weather {
  cur: WeatherId = 'clear';
  target: WeatherId = 'clear';
  private t = 1; // blend 0→1 toward target
  private nextChange = 3; // in-game hours until next roll
  private params: Params = { ...P.clear };
  private rain: THREE.LineSegments;
  private rainMat: THREE.ShaderMaterial;
  private bow: THREE.Mesh;
  private bowMat: THREE.ShaderMaterial;
  private bolt: THREE.Line;
  private meteors: THREE.Line[] = [];
  private flashT = 0;
  private nextFlash = 8;
  private afterRain = 0; // in-game hours since rain stopped
  private rainedHard = false;
  private nightRolled = -1;
  private aurora = false;
  private meteorNight = false;
  private nextMeteor = 3;
  wet = 0;

  constructor(private g: Game) {
    const N = 3000;
    const pos = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 50, y = Math.random() * 30, z = Math.random() * 50;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.time, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uSlant: { value: 1 }, uCol: { value: new THREE.Color(0xc8d4e0) } },
      vertexShader: rainVert,
      fragmentShader: rainFrag,
      transparent: true,
      depthWrite: false,
    });
    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    g.scene.add(this.rain);

    const R = 820;
    this.bowMat = new THREE.ShaderMaterial({ uniforms: { uAlpha: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: bowFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const ring = new THREE.RingGeometry(R - 34, R, 96, 1, 0, Math.PI);
    // remap UVs: v across the band (outer = 1)
    const p = ring.attributes.position, uv = ring.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setY(i, (Math.hypot(p.getX(i), p.getY(i)) - (R - 34)) / 34);
    this.bow = new THREE.Mesh(ring, this.bowMat);
    this.bow.frustumCulled = false;
    this.bow.visible = false;
    this.bow.renderOrder = -8;
    g.scene.add(this.bow);

    const bg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
    this.bolt = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: 0xf2f4ff, fog: false }));
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    g.scene.add(this.bolt);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, fog: false }));
      m.visible = false;
      m.frustumCulled = false;
      g.scene.add(m);
      this.meteors.push(m);
    }
    g.saveHooks.push({
      save: () => ({ weather: { cur: this.cur, target: this.target, t: this.t, next: this.nextChange } }),
      load: (d) => {
        const w = (d as any).weather;
        if (w) { this.cur = w.cur; this.target = w.target; this.t = w.t; this.nextChange = w.next; }
      },
    });
    g.onSkip = () => { this.nextChange = Math.min(this.nextChange, 0.01); };
  }

  dispose() {
    this.g.scene.remove(this.rain, this.bow, this.bolt, ...this.meteors);
  }

  /** force a weather (debug / tests) */
  set(w: WeatherId) {
    this.cur = this.target = w;
    this.t = 1;
    this.nextChange = 4;
  }

  update(dt: number) {
    const g = this.g;
    const hours = (dt * 24) / (g.settings.dayLength * 60);
    const biome = g.world.dominantBiome(g.focusPos.z);
    // roll the next weather from the biome's table
    this.nextChange -= hours;
    if (this.nextChange <= 0 && this.t >= 1) {
      const table = BIOMES[biome].weather;
      const ids = Object.keys(table) as WeatherId[];
      const r = new Rng(hashInts(g.world.seed, SYS.weather, g.day, Math.floor(g.hour * 4)));
      let next = r.weighted(ids, ids.map((k) => table[k]));
      // the monsoon: tropical rain arrives as a proper downpour more often
      if (biome === 'tropical' && next === 'rain' && r.chance(0.5)) next = 'storm';
      this.cur = this.target;
      this.target = next;
      this.t = 0;
      this.nextChange = 2 + r.float() * 3;
    }
    if (this.t < 1) this.t = Math.min(1, this.t + dt / 40);
    const a = P[this.cur], b = P[this.target];
    const k = this.t * this.t * (3 - 2 * this.t);
    const p = this.params;
    p.ov = a.ov + (b.ov - a.ov) * k;
    p.fog = a.fog + (b.fog - a.fog) * k;
    p.rain = a.rain + (b.rain - a.rain) * k;
    p.storm = a.storm + (b.storm - a.storm) * k;
    const name: WeatherId = k > 0.5 ? this.target : this.cur;
    g.weatherName = name;

    // ghat mist: low cloud rolls over tropical roads in the early morning
    const win = lightWindow(g.hour);
    const mist = biome === 'tropical' && (win === 'dawn' || (win === 'golden' && g.hour < 12)) ? 0.45 : 0;
    g.overcast = p.ov;
    g.fogBoost = Math.max(p.fog, mist) * (g.settings.quality === 'low' ? 0.9 : 1);
    g.weatherDim = 1 - p.ov * 0.5;
    g.rainAmount = p.rain;
    g.windAmount = 0.4 + p.ov * 0.6;
    g.sky.setCloudCover(p.ov);
    shared.wind.value = (0.5 + p.ov * 0.9 + p.storm) * (g.settings.reduceMotion ? 0.3 : 1);

    // wet roads linger after the rain
    this.wet += ((p.rain > 0.1 ? 1 : 0) - this.wet) * Math.min(1, dt * (p.rain > 0.1 ? 0.2 : 0.02));
    shared.wet.value = this.wet;

    // rain particles follow the camera
    this.rain.visible = p.rain > 0.02;
    (this.rainMat.uniforms.uCam.value as THREE.Vector3).copy(g.camera.position);
    this.rainMat.uniforms.uAlpha.value = p.rain * 0.55;
    this.rainMat.uniforms.uSlant.value = 1 + p.storm * 3;
    g.pcar.wiping = p.rain > 0.15 && g.mode === 'drive';

    // rainbow rule: shortly after real rain, with the sun low and behind you
    if (p.rain > 0.4) { this.rainedHard = true; this.afterRain = 0; }
    else if (this.rainedHard) this.afterRain += hours;
    if (this.afterRain > 1.2) this.rainedHard = false;
    const sun = g.sky.sunDir;
    const bowOK = this.rainedHard && p.rain < 0.25 && sun.y > 0.02 && sun.y < 0.5 && g.overcast < 0.9;
    const bowChance = hashInts(g.world.seed, SYS.weather, g.day, 77) % 100 < (biome === 'tropical' ? 90 : 65);
    this.bowMat.uniforms.uAlpha.value += ((bowOK && bowChance ? 1 : 0) - this.bowMat.uniforms.uAlpha.value) * Math.min(1, dt * 0.3);
    const bowA = this.bowMat.uniforms.uAlpha.value as number;
    this.bow.visible = bowA > 0.02;
    if (this.bow.visible) {
      const anti = sun.clone().multiplyScalar(-1);
      this.bow.position.copy(g.camera.position).addScaledVector(anti, 900);
      this.bow.lookAt(g.camera.position);
      // keep the arc upright
      this.bow.up.set(0, 1, 0);
      const el = Math.asin(Math.max(-1, Math.min(1, anti.y)));
      const az = Math.atan2(anti.x, anti.z);
      const apex = (42 * Math.PI) / 180 + el;
      g.rainbowDir = bowA > 0.3 ? new THREE.Vector3(Math.sin(az) * Math.cos(apex), Math.sin(apex), Math.cos(az) * Math.cos(apex)) : null;
    } else g.rainbowDir = null;

    // lightning during storms
    this.flashT = Math.max(0, this.flashT - dt);
    g.flashActive = this.flashT > 0.05;
    if (p.storm > 0.6) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.nextFlash = 6 + Math.random() * 14;
        this.strike();
      }
    }
    this.bolt.visible = this.flashT > 0.2;
    if (!g.settings.reduceMotion) g.post.material.uniforms.uFlash.value = Math.max(g.post.material.uniforms.uFlash.value as number, this.flashT > 0.2 ? 0.35 : 0);

    // night sky events, rolled once per night
    const night = g.sky.night > 0.8;
    if (night && this.nightRolled !== g.day) {
      this.nightRolled = g.day;
      const r = new Rng(hashInts(g.world.seed, SYS.weather, g.day, 99));
      this.aurora = r.chance(0.18);
      this.meteorNight = r.chance(0.25);
    }
    const clearNight = night && p.ov < 0.3;
    g.aurora += ((this.aurora && clearNight && biome === 'forest' ? 1 : 0) - g.aurora) * Math.min(1, dt * 0.2);
    g.meteors = this.meteorNight && clearNight;
    if (g.meteors) {
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0) {
        this.nextMeteor = 1.5 + Math.random() * 4;
        const m = this.meteors.find((x) => !x.visible);
        if (m) {
          const c = g.camera.position;
          const a = Math.random() * Math.PI * 2;
          const s = new THREE.Vector3(c.x + Math.cos(a) * 600, c.y + 350 + Math.random() * 200, c.z + Math.sin(a) * 600);
          const d = new THREE.Vector3(Math.random() - 0.5, -0.4, Math.random() - 0.5).normalize().multiplyScalar(120);
          (m.geometry as THREE.BufferGeometry).setFromPoints([s, s.clone().add(d)]);
          m.visible = true;
          m.userData.t = 0.8;
        }
      }
    }
    for (const m of this.meteors) {
      if (!m.visible) continue;
      m.userData.t -= dt;
      (m.material as THREE.LineBasicMaterial).opacity = Math.max(0, m.userData.t / 0.8);
      if (m.userData.t <= 0) m.visible = false;
    }
    void win;
  }

  private strike() {
    const g = this.g;
    const c = g.camera.position;
    const a = Math.random() * Math.PI * 2;
    const dist = 250 + Math.random() * 700;
    const gx = c.x + Math.cos(a) * dist, gz = c.z + Math.sin(a) * dist;
    const gy = g.world.height(gx, gz);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      pts.push(new THREE.Vector3(gx + (Math.random() - 0.5) * 30 * (1 - t), gy + 420 * (1 - t), gz + (Math.random() - 0.5) * 30 * (1 - t)));
    }
    (this.bolt.geometry as THREE.BufferGeometry).setFromPoints(pts);
    this.flashT = 0.4;
    g.events.emit('lightning', { delay: dist / 343 });
  }
}
