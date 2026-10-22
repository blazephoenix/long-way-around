// Toon water. Meshes come from world/waterGeo.ts with a per-vertex depth (aDepth). The vertex
// shader rolls a few long, gentle sine waves over the surface, damped to nothing at the shore. The
// fragment shader paints one base colour per kind of water (sea darkest, lakes lightest, rivers in
// between), lays an animated cel-shaded Voronoi cell pattern over it, adds a banded sky tint at
// grazing angles, and draws white foam at the waterline with lines rolling in to the shore.
//
// The cell pattern (Voronoi F1 minus smooth F1, noise distortion, flow, three-stop colour ramp) is
// adapted from the WaterFloor shader in cortiz2894/stylized-components
// (https://github.com/cortiz2894/stylized-components), MIT License, Copyright (c) 2026 Christian
// Ortiz (Cortiz). See THIRD-PARTY-NOTICES.md.
import * as THREE from 'three';
import { shared } from './toon';
import type { WaterArrays } from '../world/waterGeo';

export type WaterKind = 'lake' | 'river' | 'sea' | 'ocean';

/** Lighting shared by every water material; updateWaterLight() fills it from the sky each frame. */
const light = {
  uSky: { value: new THREE.Color(0xa9c4c8) },
  uLight: { value: 1 },
};

const KIND: Record<WaterKind, { amp: number; flow: [number, number]; foam: number; scale: number; cell: number; cellFlow: [number, number] }> = {
  lake: { amp: 0.07, flow: [0.05, 0.03], foam: 1, scale: 1.4, cell: 0.16, cellFlow: [0.03, -0.05] },
  river: { amp: 0.06, flow: [0.9, 0], foam: 1, scale: 1.8, cell: 0.2, cellFlow: [0.25, 0] },
  sea: { amp: 0.32, flow: [0.25, 0.4], foam: 1, scale: 0.7, cell: 0.09, cellFlow: [0.04, -0.08] },
  ocean: { amp: 0, flow: [0, 0], foam: 0, scale: 0.7, cell: 0.09, cellFlow: [0.04, -0.08] },
};

const wavesGlsl = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform vec2 uFlow;
  float waves(vec2 p) {
    p *= uScale;
    vec2 q = p - uFlow * uTime;
    return sin(dot(q, vec2(0.11, 0.04)) + uTime * 0.9) * 0.5
         + sin(dot(q, vec2(-0.06, 0.13)) + uTime * 1.25) * 0.33
         + sin(dot(q, vec2(0.19, -0.17)) + uTime * 1.9) * 0.17;
  }
`;

const vert = /* glsl */ `
  attribute float aDepth;
  uniform float uAmp;
  varying vec3 vWp;
  varying float vDepth;
  #include <common>
  #include <fog_pars_vertex>
  ${wavesGlsl}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    wp.y += waves(wp.xz) * uAmp * smoothstep(0.0, 2.5, aDepth);
    vWp = wp.xyz;
    vDepth = aDepth;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  uniform vec3 uBase;
  uniform float uFoam;
  uniform float uCell;
  uniform vec2 uCellFlow;
  uniform vec3 uSky;
  uniform float uLight;
  varying vec3 vWp;
  varying float vDepth;
  #include <common>
  #include <fog_pars_fragment>
  ${wavesGlsl}

  // ---- cel-shaded Voronoi cells, adapted from cortiz2894/stylized-components WaterFloor (MIT)
  const float CELL_SPEED = 0.55;
  const float CELL_SMOOTH = 0.46;
  const float EDGE_THRESHOLD = 0.09;
  const float EDGE_SOFTNESS = 0.035;
  const float MID_POS = 0.31;
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * h * k / 6.0;
  }
  vec2 cellPt(vec2 seed) {
    return 0.5 + 0.5 * sin(uTime * CELL_SPEED + 6.2831 * seed);
  }
  float voronoiF1(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float md = 8.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 n = vec2(float(x), float(y));
        md = min(md, length(n + cellPt(hash2(i + n)) - f));
      }
    return md;
  }
  float voronoiSF1(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float res = 8.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 n = vec2(float(x), float(y));
        res = smin(res, length(n + cellPt(hash2(i + n)) - f), CELL_SMOOTH);
      }
    return res;
  }
  float nHash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(nHash(i), nHash(i + vec2(1.0, 0.0)), f.x), mix(nHash(i + vec2(0.0, 1.0)), nHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 2; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
  // ----

  void main() {
    float dist = distance(cameraPosition, vWp);
    vec3 base = uBase;
    vec3 mid = mix(base, base * 1.35 + 0.08, 0.45);
    vec3 high = mix(vec3(1.0), base, 0.15);
    // cell pattern: 0 inside cells, 1 on the edges; faded out far away where it would alias
    vec2 distort = vec2(fbm(vWp.xz * uCell * 3.8 + vec2(uTime * 0.11, 0.0)) - 0.5) * 0.26;
    vec2 uv = vWp.xz * uCell + uCellFlow * uTime + distort;
    float edge = voronoiF1(uv) - voronoiSF1(uv);
    float c = smoothstep(EDGE_THRESHOLD - EDGE_SOFTNESS, EDGE_THRESHOLD + EDGE_SOFTNESS, edge);
    c *= 1.0 - smoothstep(120.0, 260.0, dist);
    float seg0 = clamp(c / MID_POS, 0.0, 1.0);
    float seg1 = clamp((c - MID_POS) / (1.0 - MID_POS), 0.0, 1.0);
    vec3 col = mix(mix(base, mid, seg0), mix(mid, high, seg1), step(MID_POS, c));
    // sky in the water at grazing angles, in two bands
    vec3 V = normalize(cameraPosition - vWp);
    float fr = pow(1.0 - max(V.y, 0.0), 5.0);
    col = mix(col, uSky, 0.3 * step(0.25, fr) + 0.2 * step(0.6, fr));
    col *= uLight;
    // foam: a ragged edge at the waterline, and lines rolling in over the shallows (near only)
    float wob = vnoise(vWp.xz * 0.45 + uTime * 0.15) - 0.5;
    float edgeFoam = step(vDepth + wob * 0.22, 0.18);
    float roll = sin(vDepth * 9.0 - uTime * 1.7 + wob * 4.0);
    float lines = step(0.82, roll) * (1.0 - smoothstep(0.35, 1.3, vDepth)) * (1.0 - smoothstep(70.0, 180.0, dist));
    float foam = max(edgeFoam, lines) * uFoam;
    col = mix(col, vec3(0.95, 0.97, 0.95) * mix(0.35, 1.0, uLight), foam);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const mats = new Map<string, THREE.ShaderMaterial>();

/** Base colour per kind, from the biome's water colours (sRGB hex): sea dark, river mid, lake light. */
function baseColour(kind: WaterKind, water: number, deep: number): THREE.Color {
  const w = new THREE.Color(water), d = new THREE.Color(deep);
  switch (kind) {
    case 'sea':
    case 'ocean': return d;
    case 'river': return w.lerp(d, 0.5);
    case 'lake': return w.lerp(new THREE.Color(0xffffff), 0.12);
  }
}

/** Material for one kind of water in one biome palette (its water and deep-water colours). */
export function waterMaterial(kind: WaterKind, water: number, deep: number): THREE.ShaderMaterial {
  const key = `${kind}:${water}:${deep}`;
  let m = mats.get(key);
  if (m) return m;
  const k = KIND[kind];
  m = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    fog: true,
    side: THREE.DoubleSide,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...light,
      uTime: shared.time,
      uBase: { value: baseColour(kind, water, deep) },
      uFoam: { value: k.foam },
      uAmp: { value: k.amp },
      uScale: { value: k.scale },
      uCell: { value: k.cell },
      uCellFlow: { value: new THREE.Vector2(...k.cellFlow) },
      uFlow: { value: new THREE.Vector2(...k.flow) },
    },
  });
  mats.set(key, m);
  return m;
}

/** Wrap water arrays into a geometry the water material can draw. */
export function waterGeometry(w: WaterArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(w.positions, 3));
  g.setAttribute('aDepth', new THREE.BufferAttribute(w.depth, 1));
  g.setIndex(new THREE.BufferAttribute(w.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** Feed the sky's key light into every water material (call once per frame). */
export function updateWaterLight(sun: THREE.DirectionalLight, hemiIntensity: number, horizon: THREE.Color) {
  light.uSky.value.copy(horizon);
  light.uLight.value = THREE.MathUtils.clamp(0.28 + sun.intensity * 0.32 + hemiIntensity * 0.3, 0.25, 1.15);
}
