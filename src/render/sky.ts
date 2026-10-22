// Sky dome (gradient, sun disc, moon, stars, the Milky Way), flat-shaded cloud billboards,
// and the time-of-day lighting rig that drives fog, ink colour and lights.
import * as THREE from 'three';
import { shared } from './toon';

export type LightWindow = 'night' | 'dawn' | 'golden' | 'morning' | 'midday' | 'afternoon' | 'blue';

interface Key {
  h: number;
  zenith: number;
  horizon: number;
  sun: number;
  sunI: number;
  hemi: number;
  ink: number;
}

const KEYS: Key[] = [
  { h: 0, zenith: 0x081028, horizon: 0x1a2646, sun: 0x8aa0d8, sunI: 0.42, hemi: 0.42, ink: 0x0a0f2c },
  { h: 4.7, zenith: 0x0f1a40, horizon: 0x2f3762, sun: 0x8aa0d8, sunI: 0.36, hemi: 0.42, ink: 0x0e1434 },
  { h: 5.5, zenith: 0x34477e, horizon: 0xdc9a86, sun: 0xffa888, sunI: 0.35, hemi: 0.5, ink: 0x2a2140 },
  { h: 6.2, zenith: 0x5c7fbc, horizon: 0xf4bf90, sun: 0xffbe86, sunI: 1.0, hemi: 0.62, ink: 0x4a2c1a },
  { h: 7.3, zenith: 0x5e95d6, horizon: 0xe6dcc8, sun: 0xffdcae, sunI: 1.35, hemi: 0.75, ink: 0x3a2a20 },
  { h: 9, zenith: 0x4e8fdc, horizon: 0xbcdaf0, sun: 0xfff3e0, sunI: 1.55, hemi: 0.85, ink: 0x23211f },
  { h: 13, zenith: 0x4689dc, horizon: 0xc0def2, sun: 0xffffff, sunI: 1.6, hemi: 0.9, ink: 0x201f1e },
  { h: 16, zenith: 0x4e8cd6, horizon: 0xc8dcec, sun: 0xfff0d8, sunI: 1.5, hemi: 0.85, ink: 0x2a2520 },
  { h: 17.1, zenith: 0x6a92c8, horizon: 0xf3c48e, sun: 0xffb874, sunI: 1.25, hemi: 0.72, ink: 0x4e2e18 },
  { h: 17.9, zenith: 0x4e5c9c, horizon: 0xf0906c, sun: 0xff8a5c, sunI: 0.75, hemi: 0.58, ink: 0x4a2618 },
  { h: 18.5, zenith: 0x22336e, horizon: 0x5c6aa8, sun: 0x9fb0e8, sunI: 0.3, hemi: 0.5, ink: 0x14205a },
  { h: 19.4, zenith: 0x0c1534, horizon: 0x24305a, sun: 0x8aa0d8, sunI: 0.4, hemi: 0.42, ink: 0x0c1232 },
  { h: 24, zenith: 0x081028, horizon: 0x1a2646, sun: 0x8aa0d8, sunI: 0.42, hemi: 0.42, ink: 0x0a0f2c },
];

const cA = new THREE.Color();
const cB = new THREE.Color();
function lerpHex(a: number, b: number, t: number, out: THREE.Color) {
  cA.setHex(a);
  cB.setHex(b);
  return out.copy(cA).lerp(cB, t);
}

export function lightWindow(h: number): LightWindow {
  if (h >= 5.0 && h < 6.2) return 'dawn';
  if (h >= 6.2 && h < 7.4) return 'golden';
  if (h >= 7.4 && h < 11) return 'morning';
  if (h >= 11 && h < 14.5) return 'midday';
  if (h >= 14.5 && h < 16.9) return 'afternoon';
  if (h >= 16.9 && h < 18.1) return 'golden';
  if (h >= 18.1 && h < 18.9) return 'blue';
  return 'night';
}
/** Start hours of each window in order, used by "skip to next light window". */
export const WINDOW_STARTS = [5.0, 6.2, 7.4, 11, 14.5, 16.9, 18.1, 18.9];

export function sunDirection(h: number, out = new THREE.Vector3()): THREE.Vector3 {
  const th = ((h - 6) / 12) * Math.PI;
  return out.set(Math.cos(th), Math.sin(th) * 0.92, -0.38).normalize();
}
export function moonDirection(h: number, out = new THREE.Vector3()): THREE.Vector3 {
  const th = ((h - 18.4) / 12) * Math.PI;
  return out.set(Math.cos(th) * 0.9, Math.max(0.12, Math.sin(th) * 0.8), 0.42).normalize();
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGround, uSunDir, uMoonDir, uSunCol;
uniform float uStars, uTime, uMilky, uOvercast, uSunVis;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.55));
  col = mix(col, uGround, smoothstep(0.0, -0.25, h));
  // sun halo + hard-edged comic disc
  float sd = dot(d, uSunDir);
  col += uSunCol * pow(max(sd,0.0), 24.0) * 0.35 * uSunVis;
  col = mix(col, vec3(1.0,0.97,0.88), smoothstep(0.99935,0.9995,sd) * uSunVis * (1.0-uOvercast*0.85));
  // moon
  float md = dot(d, uMoonDir);
  float moon = smoothstep(0.99955,0.9997,md);
  col = mix(col, vec3(0.93,0.94,0.98), moon * uStars * (1.0-uOvercast));
  col += vec3(0.5,0.6,0.85) * pow(max(md,0.0), 60.0) * 0.12 * uStars;
  // stars
  if (h > 0.0 && uStars > 0.01) {
    vec3 p = d * 260.0;
    vec3 c = floor(p);
    float r = hash(c);
    if (r > 0.992) {
      vec3 f = fract(p) - 0.5;
      float s = smoothstep(0.16, 0.0, length(f));
      float tw = 0.7 + 0.3 * sin(uTime * (2.0 + r * 9.0) + r * 40.0);
      col += vec3(s * tw) * uStars * smoothstep(0.0, 0.25, h) * (1.0 - uOvercast);
    }
  }
  // the Milky Way on dark clear nights in the hills: a pale band rising out of the northern horizon
  // over the zenith, mottled into star clouds, split by a dark dust lane, thick with faint stars
  if (uMilky > 0.01 && h > 0.0) {
    vec3 n = normalize(vec3(1.0, 0.25, 0.0)); // band plane holds due north, tilted off the zenith
    float x = dot(d, n);
    float along = atan(dot(d, normalize(cross(n, vec3(0.0, 1.0, 0.0)))), d.y);
    float clouds = 0.55 + 0.45 * sin(along * 7.0 + 1.3) * sin(along * 17.0 + x * 40.0);
    float lane = x - 0.03 * sin(along * 5.0);
    float glow = exp(-x * x / 0.012) * clouds * (1.0 - 0.75 * exp(-lane * lane / 0.0006));
    vec3 q = d * 420.0;
    float r2 = hash(floor(q));
    float dust = r2 > 0.93 ? smoothstep(0.22, 0.0, length(fract(q) - 0.5)) : 0.0;
    vec3 mc = mix(vec3(0.55, 0.6, 0.75), vec3(0.85, 0.8, 0.7), clouds);
    col += (mc * glow * 0.32 + vec3(dust) * exp(-x * x / 0.03) * 0.5) * smoothstep(0.02, 0.2, h) * uMilky * (1.0 - uOvercast);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const cloudVert = /* glsl */ `
attribute vec4 aCloud; // seed, scale, shade, unused
varying vec2 vUv;
varying float vSeed;
uniform float uTime;
void main(){
  vUv = uv;
  vSeed = aCloud.x;
  vec3 center = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
  center.x += mod(uTime * (3.0 + aCloud.x * 3.0), 3000.0) - 1500.0;
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  mv.xy += position.xy * aCloud.y * vec2(1.0, 0.55);
  gl_Position = projectionMatrix * mv;
}`;

const cloudFrag = /* glsl */ `
uniform vec3 uLit, uShade;
uniform float uAlpha;
varying vec2 vUv;
varying float vSeed;
float hash(float n){ return fract(sin(n)*43758.5453); }
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  p.y *= 1.8;
  float m = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2((hash(vSeed*13.1+fi)-0.5)*1.25, (hash(vSeed*7.7+fi*3.1)-0.3)*0.55);
    float r = 0.28 + hash(vSeed*3.3+fi*1.7)*0.32;
    m = max(m, 1.0 - length(p - c)/r);
  }
  if (m <= 0.0 || p.y < -0.42) discard;
  float shade = step(p.y, -0.12 + 0.08*sin(p.x*5.0+vSeed*10.0));
  vec3 col = mix(uLit, uShade, shade);
  gl_FragColor = vec4(col, uAlpha);
  #include <colorspace_fragment>
}`;

export class Sky {
  readonly dome: THREE.Mesh;
  readonly clouds: THREE.InstancedMesh;
  readonly sun = new THREE.DirectionalLight(0xffffff, 1.5);
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a5a40, 0.8);
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly cloudUniforms: Record<string, THREE.IUniform>;
  readonly ink = new THREE.Color();
  readonly horizon = new THREE.Color();
  readonly zenith = new THREE.Color();
  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  sunElevation = 0;
  hour = 9;
  /** 0 = full day, 1 = full night */
  night = 0;
  overcast = 0;

  constructor(scene: THREE.Scene) {
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color(0x3a4a3a) },
      uSunDir: { value: new THREE.Vector3() },
      uMoonDir: { value: new THREE.Vector3() },
      uSunCol: { value: new THREE.Color() },
      uStars: { value: 0 },
      uTime: shared.time,
      uMilky: { value: 0 },
      uOvercast: { value: 0 },
      uSunVis: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // clouds
    const N = 34;
    this.cloudUniforms = {
      uTime: shared.time,
      uLit: { value: new THREE.Color(0xffffff) },
      uShade: { value: new THREE.Color(0xc8d0e0) },
      uAlpha: { value: 1 },
    };
    const cm = new THREE.ShaderMaterial({
      uniforms: this.cloudUniforms,
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      depthWrite: false,
      transparent: true,
      fog: false,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    const attr = new Float32Array(N * 4);
    this.clouds = new THREE.InstancedMesh(geo, cm, N);
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4;
      const r = 900 + ((i * 37) % 11) * 110;
      m.makeTranslation(Math.cos(a) * r, 380 + ((i * 53) % 7) * 45, Math.sin(a) * r);
      this.clouds.setMatrixAt(i, m);
      attr[i * 4] = (i * 0.618) % 1;
      attr[i * 4 + 1] = 260 + ((i * 29) % 9) * 40;
    }
    geo.setAttribute('aCloud', new THREE.InstancedBufferAttribute(attr, 4));
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -9;
    scene.add(this.clouds);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.add(this.hemi);
  }

  setCloudCover(cover: number) {
    this.clouds.count = Math.round(8 + cover * 26);
  }

  update(hour: number, focus: THREE.Vector3, fogColor: THREE.Color, opts: { overcast: number; milkyWay: number; dim: number }) {
    this.hour = hour;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = (hour - a.h) / (b.h - a.h);
    const ov = opts.overcast;
    this.overcast = ov;
    lerpHex(a.zenith, b.zenith, t, this.zenith);
    lerpHex(a.horizon, b.horizon, t, this.horizon);
    const grey = new THREE.Color().copy(this.horizon).lerp(new THREE.Color(0x8a939c), 0.7).multiplyScalar((0.55 + 0.35 * (1 - this.night)) * (1 - ov * 0.25));
    this.zenith.lerp(grey, ov * 0.9);
    this.horizon.lerp(grey, ov * 0.8);
    (this.uniforms.uZenith.value as THREE.Color).copy(this.zenith);
    (this.uniforms.uHorizon.value as THREE.Color).copy(this.horizon);
    const sunCol = lerpHex(a.sun, b.sun, t, new THREE.Color());
    (this.uniforms.uSunCol.value as THREE.Color).copy(sunCol);
    lerpHex(a.ink, b.ink, t, this.ink);

    sunDirection(hour, this.sunDir);
    moonDirection(hour, this.moonDir);
    this.sunElevation = this.sunDir.y;
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (this.uniforms.uMoonDir.value as THREE.Vector3).copy(this.moonDir);
    this.night = 1 - THREE.MathUtils.smoothstep(this.sunDir.y, -0.12, 0.08);
    this.uniforms.uStars.value = THREE.MathUtils.smoothstep(this.night, 0.4, 1);
    this.uniforms.uMilky.value = opts.milkyWay;
    this.uniforms.uOvercast.value = ov;
    this.uniforms.uSunVis.value = THREE.MathUtils.smoothstep(this.sunDir.y, -0.05, 0.02);

    // key light follows the sun by day, the moon by night
    const useSun = this.sunDir.y > -0.02;
    const dir = useSun ? this.sunDir : this.moonDir;
    const sunI = THREE.MathUtils.lerp(a.sunI, b.sunI, t) * (1 - ov * 0.65) * opts.dim;
    this.sun.color.copy(sunCol);
    this.sun.intensity = sunI * (useSun ? THREE.MathUtils.smoothstep(this.sunDir.y, -0.02, 0.06) : 1);
    this.sun.position.copy(focus).addScaledVector(dir, 200);
    this.sun.target.position.copy(focus);
    const hemiI = THREE.MathUtils.lerp(a.hemi, b.hemi, t) * opts.dim;
    this.hemi.intensity = hemiI * (1 + ov * 0.15);
    this.hemi.color.copy(this.zenith).lerp(new THREE.Color(0xffffff), 0.45);
    this.hemi.groundColor.copy(this.horizon).multiplyScalar(0.45);

    fogColor.copy(this.horizon);
    this.dome.position.copy(focus);
    this.clouds.position.set(focus.x, 0, focus.z);
    const lit = this.cloudUniforms.uLit.value as THREE.Color;
    lit.copy(this.horizon).lerp(new THREE.Color(0xffffff), 0.55 * (1 - this.night)).lerp(sunCol, 0.2);
    lit.lerp(new THREE.Color(0xb0b4bc), ov * 0.5);
    (this.cloudUniforms.uShade.value as THREE.Color).copy(lit).multiplyScalar(0.78).lerp(this.zenith, 0.25);
    this.cloudUniforms.uAlpha.value = 1;
  }
}
