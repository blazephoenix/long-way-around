// Procedural models for landmarks, buildings, stops and roadside deco.
// Every model is authored in local space: origin on the ground, -z faces the road.
import * as THREE from 'three';
import { ModelBuilder } from './models';
import { arch, beam, Greenhouse, profile, wheel } from './carKit';
import { waterLight, waterMaterial, waterGeometry } from './water';
import { discWater } from '../world/waterGeo';
import { BIOMES } from '../../data/biomes';
import { toon, shared } from './toon';
import type { Site } from '../world/sites';
import type { World } from '../world/world';
import { Rng, hashString } from '../world/prng';

export const nightGlow = { value: 0 };

/** Windows/lamps that light up at night: vertex colour × uniform glow. */
export const matGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
matGlow.onBeforeCompile = (sh) => {
  sh.uniforms.uNight = nightGlow;
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uNight;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(vec3(0.16,0.2,0.26) * (0.6 + 0.4 * vColor.r), diffuseColor.rgb, uNight);');
};

export interface PropOut {
  mb: ModelBuilder; // toon, vertex coloured
  glow: ModelBuilder; // night glow
  colliders: number[];
  extras: THREE.Object3D[]; // animated or textured objects
}

const signCache = new Map<string, THREE.Material>();
export function signMaterial(text: string, bg = '#f2ead2', fg = '#2a2a2a', w = 512, h = 192, font = '700 64px Mukta, system-ui, sans-serif'): THREE.Material {
  const key = text + bg + fg + w + h + font;
  const hit = signCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = text.split('\n');
  let size = parseInt(font.match(/(\d+)px/)![1]);
  let f = font;
  // shrink to fit
  for (;;) {
    g.font = f;
    const wMax = Math.max(...lines.map((l) => g.measureText(l).width));
    if (wMax < w - 40 && size * lines.length * 1.15 < h - 30) break;
    size -= 4;
    f = font.replace(/\d+px/, size + 'px');
    if (size < 14) break;
  }
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.12));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = toon({ map: t });
  signCache.set(key, m);
  return m;
}

export function signMesh(text: string, w: number, h: number, bg?: string, fg?: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(text, bg, fg, 512, Math.round(512 * (h / w))));
  return m;
}

// ------------------------------------------------------------------ models
type Builder = (m: ModelBuilder, g: ModelBuilder, s: Site, r: Rng, out: PropOut) => void;

const STONE = 0x9a948a;
const WOOD = 0x8a6448;
const WOOD_D = 0x6a4a34;

/** outline of a wall panel (outerW by outerH) with a cusped arch opening, for ModelBuilder.shape */
export function cuspedArch(outerW: number, openW: number, spring: number, outerH = spring + openW * 0.75 + 0.6, cusps = 7): [number, number][] {
  const r = openW / 2;
  const pts: [number, number][] = [[-outerW / 2, 0], [-r, 0], [-r, spring]];
  for (let k = 1; k < 24; k++) {
    const a = Math.PI - (k / 24) * Math.PI;
    const c = 1 - 0.08 * Math.abs(Math.sin(a * cusps));
    pts.push([Math.cos(a) * r * c, spring + Math.sin(a) * r * c * 1.15]);
  }
  pts.push([r, spring], [r, 0], [outerW / 2, 0], [outerW / 2, outerH], [-outerW / 2, outerH]);
  return pts;
}

const B: Record<string, Builder> = {
  lookout: (m, g) => {
    // a Forest Department watchtower: a whitewashed two-storey block, an outside stair up to an open
    // deck behind a low parapet, and a flat roof on four pillars over the deck
    const WHITE = 0xe8e4d8, GREY = 0xb8b4a8, DARK = 0x3a3a38;
    m.box(3.4, 5, 3.4, WHITE, { p: [0, 2.5, 0] });
    m.box(1.0, 2.0, 0.06, DARK, { p: [-0.6, 1.0, -1.72] });
    m.box(0.8, 0.7, 0.06, DARK, { p: [0.8, 3.6, -1.72] });
    m.box(3.8, 0.2, 3.8, GREY, { p: [0, 5.1, 0] });
    for (const [x, z, w, d] of [[0, 1.82, 3.8, 0.14], [-1.82, 0, 0.14, 3.8], [0, -1.82, 3.8, 0.14]] as const) m.box(w, 0.9, d, WHITE, { p: [x, 5.65, z] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.28, 2.6, 0.28, WHITE, { p: [sx * 1.75, 6.5, sz * 1.75] });
    m.box(4.4, 0.25, 4.4, GREY, { p: [0, 7.9, 0] });
    // the stair climbs the +x side from the front to the deck
    for (let i = 0; i < 14; i++) m.box(1.0, 0.18, 0.34, GREY, { p: [2.25, 0.2 + i * 0.355, -2.4 + i * 0.3] });
    beam(m, [2.25, 0, -2.6], [2.25, 4.9, 1.6], 0.9, 0.2, GREY);
    for (const z of [-2.4, -0.6, 1.2]) m.box(0.2, 0.2 + (z + 2.4) * 1.18, 0.2, WHITE, { p: [2.25, 0.1 + ((z + 2.4) * 1.18) / 2, z] });
    beam(m, [2.72, 1.1, -2.5], [2.72, 6.0, 1.6], 0.04, 0.04, 0x8a8e92);
    g.box(0.3, 0.2, 0.3, 0xffd27a, { p: [0, 7.7, 0] });
  },
  cabin: (m, g, _s, r) => {
    // a Khasi hill cottage: a timber frame on a stone plinth with lime-washed panels between the
    // posts, painted window frames, a tin roof with a deep overhang, front steps, a stovepipe
    const LIME = 0xeeeae0, TIMBER = 0x5a3a26, STONE = 0x8a8a84;
    const roof = r.pick([0x9a3a2a, 0x3a6a4a, 0x2a4a7a]), frame = r.pick([0x2a6a8a, 0x3a7a4a, 0x9a3a2a]);
    m.box(7.6, 0.7, 6.0, STONE, { p: [0, 0.35, 0] });
    m.box(7, 2.8, 5.4, LIME, { p: [0, 2.1, 0] });
    for (const z of [-2.72, 2.72]) {
      for (let i = 0; i <= 5; i++) m.box(0.16, 2.8, 0.06, TIMBER, { p: [-3.5 + i * 1.4, 2.1, z] });
      for (const y of [0.75, 1.9, 3.45]) m.box(7.04, 0.14, 0.06, TIMBER, { p: [0, y, z] });
    }
    for (const x of [-3.52, 3.52]) for (const y of [0.75, 1.9, 3.45]) m.box(0.06, 0.14, 5.44, TIMBER, { p: [x, y, 0] });
    for (const x of [-2.1, 2.1]) {
      m.box(1.0, 1.0, 0.08, frame, { p: [x, 2.45, -2.74] });
      g.box(0.8, 0.8, 0.1, 0xffd27a, { p: [x, 2.45, -2.74] });
    }
    m.box(1.0, 2.0, 0.08, frame, { p: [0, 1.75, -2.74] });
    m.box(0.8, 1.85, 0.1, 0x4a3222, { p: [0, 1.72, -2.75] });
    m.shape([[-4.3, 0], [4.3, 0], [0, 2.3]], 7.0, roof, { p: [0, 3.5, -3.5] });
    for (let i = 0; i < 9; i++) m.box(0.03, 0.03, 7.0, 0x000000, { p: [-3.8 + i * 0.95, 3.5 + 2.3 * (1 - Math.abs(-3.8 + i * 0.95) / 4.3) + 0.02, 0] });
    for (let i = 0; i < 3; i++) m.box(1.6, 0.18, 0.4, STONE, { p: [0, 0.09 + i * 0.18, -3.4 + i * 0.35] });
    m.cyl(0.1, 0.1, 2.4, 8, 0x5a5a5a, { p: [2.6, 4.6, 1.4] });
    m.cone(0.25, 0.3, 8, 0x5a5a5a, { p: [2.6, 5.9, 1.4] });
  },
  lighthouse: (m, g, s) => {
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const y0 = i * 3, r0 = 2.6 - i * 0.22, r1 = 2.6 - (i + 1) * 0.22;
      m.cyl(r1, r0, 3, 12, i % 2 ? 0xc8403a : 0xf4f0e6, { p: [0, y0 + 1.5, 0] });
    }
    m.cyl(1.9, 1.9, 0.3, 12, 0x2a2a2a, { p: [0, 18.2, 0] });
    m.cyl(2.1, 2.1, 0.1, 12, 0x2a2a2a, { p: [0, 18.9, 0] });
    m.cyl(1.0, 1.0, 1.6, 8, 0x3a4a5a, { p: [0, 19.2, 0] });
    m.cone(1.3, 1.4, 8, 0xc8403a, { p: [0, 20.7, 0] });
    g.cyl(0.85, 0.85, 1.4, 8, 0xfff2b0, { p: [0, 19.2, 0] });
    m.box(5, 2.6, 4, 0xf4f0e6, { p: [4.5, 1.3, 1] });
    m.shape([[-2.8, 0], [2.8, 0], [0, 1.6]], 4.4, 0xc8403a, { p: [4.5, 2.6, -1.2] });
    void s;
  },
  pier: (m) => {
    for (let i = 0; i < 14; i++) {
      m.box(3.2, 0.2, 2.1, WOOD, { p: [0, 1.2, i * 2.2] });
      m.cyl(0.15, 0.15, 7, 5, WOOD_D, { p: [-1.5, -1.5, i * 2.2] });
      m.cyl(0.15, 0.15, 7, 5, WOOD_D, { p: [1.5, -1.5, i * 2.2] });
    }
    m.box(0.1, 0.8, 30, WOOD_D, { p: [-1.55, 1.7, 14] });
    m.box(0.1, 0.8, 30, WOOD_D, { p: [1.55, 1.7, 14] });
    m.box(2.4, 2.2, 2.4, 0xe8e0cc, { p: [0, 2.4, 29] });
    m.cone(2, 1, 4, 0x4f6f8f, { p: [0, 4, 29], r: [0, Math.PI / 4, 0] });
  },
  seastack: (m, _g, _s, r) => {
    const n = r.int(2, 4);
    for (let k = 0; k < n; k++) {
      const ox = r.range(-12, 12), oz = r.range(-12, 12);
      const h = r.range(14, 30);
      for (let y = -8; y < h; y += 4) {
        const sc = 3.4 - (y / h) * 1.2 + r.range(-0.3, 0.3);
        m.dodeca(sc, 0x8f7f6a, { p: [ox + r.range(-0.4, 0.4), y, oz + r.range(-0.4, 0.4)], s: [1, 1.2, 1] });
      }
      m.dodeca(2.4, 0x6f9a52, { p: [ox, h + 0.5, oz], s: [1, 0.35, 1] });
    }
  },
  watertower: (m) => {
    // a village overhead tank: a concrete drum on six columns braced by two ring beams with a painted
    // band, a railed gallery round the drum, a caged ladder up one column
    const CON = 0xd8d0b8, BAND = 0xc86a50;
    m.cyl(3.4, 3.6, 0.3, 16, 0xa8a49a, { p: [0, 0.15, 0] });
    const cols: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cols.push([Math.cos(a) * 2.6, Math.sin(a) * 2.6]);
      m.box(0.45, 10.2, 0.45, CON, { p: [Math.cos(a) * 2.6, 5.1, Math.sin(a) * 2.6], r: [0, -a, 0] });
    }
    for (const y of [3.6, 7.2]) for (let i = 0; i < 6; i++) {
      const [ax, az] = cols[i], [bx, bz] = cols[(i + 1) % 6];
      beam(m, [ax, y, az], [bx, y, bz], 0.4, 0.35, BAND);
    }
    m.cyl(3.4, 2.7, 0.9, 16, CON, { p: [0, 10.6, 0] });
    m.cyl(3.8, 3.8, 0.2, 16, CON, { p: [0, 11.1, 0] });
    m.cyl(3.82, 3.82, 0.12, 16, BAND, { p: [0, 11.0, 0] });
    m.cyl(2.8, 2.8, 3.4, 16, CON, { p: [0, 12.9, 0] });
    m.cyl(2.85, 2.85, 0.25, 16, BAND, { p: [0, 14.6, 0] });
    m.cyl(2.2, 2.85, 0.4, 16, CON, { p: [0, 14.9, 0] });
    m.box(1.6, 0.8, 0.05, 0xf2efe6, { p: [0, 13.2, -2.82] });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      m.box(0.05, 1.0, 0.05, 0x2a3a5a, { p: [Math.cos(a) * 3.65, 11.7, Math.sin(a) * 3.65] });
    }
    m.torus(3.65, 0.03, 4, 32, 0x2a3a5a, { p: [0, 12.2, 0], r: [Math.PI / 2, 0, 0] });
    const [lx, lz] = cols[0];
    for (const s of [-0.22, 0.22]) m.box(0.05, 11, 0.05, 0x5a5f66, { p: [lx + 0.45, 5.5, lz + s] });
    for (let y = 0.4; y < 11; y += 0.4) m.box(0.04, 0.04, 0.44, 0x5a5f66, { p: [lx + 0.45, y, lz] });
  },
  motelruin: (m, g, _s, r) => {
    // an abandoned haveli: a two-storey facade with faded paint and fresco panels, a cusped arch round
    // a studded wooden door, wall niches, two jharokha balconies on brackets, a broken parapet, and
    // one corner fallen into rubble
    const OCHRE = 0xd8a878, OCHRE2 = 0xc89868, TRIM = 0xe8d8b8, DOOR = 0x4a3020;
    // the right end has fallen: it stands only part way up, with a jagged top
    m.box(11, 7, 6, OCHRE, { p: [-1.5, 3.5, 0] });
    m.box(3, 4.2, 6, OCHRE, { p: [5.5, 2.1, 0] });
    for (let i = 0; i < 5; i++) m.box(0.6, r.range(0.3, 1.6), r.range(1, 5), OCHRE, { p: [4.3 + i * 0.6, 4.2 + 0.3, r.range(-1.5, 1.5)] });
    m.box(11.2, 0.25, 6.2, TRIM, { p: [-1.5, 3.6, 0] });
    m.box(3.1, 0.25, 6.2, TRIM, { p: [5.5, 3.6, 0] });
    for (let i = 0; i < 6; i++) m.box(r.range(0.8, 1.8), r.range(0.5, 1.2), 0.02, [0xb87858, 0x7a9a8a, 0xc8a050][i % 3], { p: [-6 + i * 2.4, r.range(1.5, 2.8), -3.01] });
    // gateway: a cusped arch in a raised frame, the door inside it
    m.box(4.2, 5.4, 0.3, OCHRE2, { p: [0, 2.7, -3.1] });
    m.shape(cuspedArch(3.2, 2.4, 3.0, 4.6), 0.32, TRIM, { p: [0, 0, -3.27] });
    m.box(2.2, 3.4, 0.1, DOOR, { p: [0, 1.7, -3.05] });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) m.sphere(0.05, 4, 3, 0x9a8a6a, { p: [-0.75 + i * 0.5, 0.4 + j * 0.55, -3.11] });
    for (const x of [-4.5, -2.6, 2.6, 4.5]) m.box(0.6, 0.9, 0.1, 0x6a4a3a, { p: [x, 1.6, -3.02] }); // niches
    // a jharokha on the standing side, an empty window frame where the other one fell
    m.box(1.0, 1.2, 0.1, 0x3a3030, { p: [3.2, 5.2, -3.02] });
    for (const x of [-4.4]) {
      m.box(2.2, 1.6, 0.8, OCHRE2, { p: [x, 5.0, -3.4] });
      m.box(1.6, 1.0, 0.1, 0x3a3030, { p: [x, 5.1, -3.82] });
      m.box(2.6, 0.15, 1.1, TRIM, { p: [x, 5.9, -3.5] });
      m.sphere(0.9, 10, 5, TRIM, { p: [x, 5.95, -3.4], s: [1.2, 0.6, 0.6] });
      for (const s of [-0.7, 0, 0.7]) m.box(0.15, 0.5, 0.6, TRIM, { p: [x + s, 4.0, -3.3] });
    }
    // broken parapet with merlons, the fallen corner, rubble
    for (let i = 0; i < 11; i++) if (r.chance(0.8)) m.box(0.6, 0.6, 0.3, OCHRE, { p: [-6.6 + i * 1.0, 7.3, -2.85] });
    for (let i = 0; i < 10; i++) m.box(r.range(0.3, 0.8), r.range(0.2, 0.5), r.range(0.3, 0.7), r.pick([OCHRE, OCHRE2, 0x9a8a72]), { p: [r.range(4.5, 7.5), 0.2, r.range(-4.5, -3.3)], r: [0, r.range(0, 3), 0] });
    g.box(0.5, 0.4, 0.06, 0x404850, { p: [0, 5.2, -3.2] });
  },
  arch: (m) => {
    // a chhatri on a rise: a stepped sandstone plinth, four pillars with cusped arches between them,
    // a frieze, a deep chhajja, a drum and a dome with a kalash on top
    const STONE = 0xd8b080, STONE2 = 0xc8a070, PALE = 0xe8d0a0;
    m.box(6.2, 0.6, 6.2, STONE2, { p: [0, 0.3, 0] });
    m.box(5.2, 0.6, 5.2, STONE, { p: [0, 0.9, 0] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      m.box(0.45, 2.6, 0.45, PALE, { p: [sx * 1.9, 2.5, sz * 1.9] });
      m.box(0.6, 0.25, 0.6, STONE, { p: [sx * 1.9, 3.7, sz * 1.9] });
    }
    for (const [x, z, ry] of [[0, -1.9, 0], [0, 1.9, 0], [-1.9, 0, Math.PI / 2], [1.9, 0, Math.PI / 2]] as const) m.shape(cuspedArch(3.35, 2.2, 0.9, 2.4), 0.2, PALE, { p: [x, 1.2, z - (ry ? 0 : 0.1)], r: [0, ry, 0] });
    m.box(4.4, 0.4, 4.4, STONE, { p: [0, 4.0, 0] });
    m.cyl(3.9, 2.9, 0.35, 4, STONE2, { p: [0, 4.35, 0], r: [0, Math.PI / 4, 0] });
    m.box(3.4, 0.5, 3.4, PALE, { p: [0, 4.75, 0] });
    m.add(new THREE.SphereGeometry(1.75, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), PALE, { p: [0, 5.0, 0], s: [1, 1.15, 1] });
    for (let i = 0; i < 12; i++) m.box(0.06, 0.9, 0.06, STONE, { p: [Math.cos((i / 12) * Math.PI * 2) * 1.55, 5.35, Math.sin((i / 12) * Math.PI * 2) * 1.55], r: [Math.sin((i / 12) * Math.PI * 2) * 0.6, 0, -Math.cos((i / 12) * Math.PI * 2) * 0.6] });
    m.sphere(0.25, 8, 6, STONE, { p: [0, 7.1, 0] });
    m.cyl(0.08, 0.12, 0.6, 6, STONE, { p: [0, 7.5, 0] });
    m.sphere(0.12, 6, 4, STONE, { p: [0, 7.85, 0] });
  },
  barn: (m, _g, _s, r) => {
    // a brick kiln: a tall square chimney tapering in stages, banded with steel and climbed by a
    // ladder, rising from a low earthen kiln mound, with stacks of fresh bricks drying round it
    const SOOT = 0x8a7e70, BRICK = 0xa04a32, BRICK2 = 0xb8603e;
    const stages = [[3.0, 2.6, 7], [2.6, 2.2, 7], [2.2, 1.8, 7], [1.8, 1.45, 7], [1.45, 1.2, 4]];
    let y = 0;
    stages.forEach(([b, t, h], i) => {
      m.cyl(t / Math.SQRT2, b / Math.SQRT2, h, 4, i % 2 ? SOOT : 0x9a8a78, { p: [0, y + h / 2, 0], r: [0, Math.PI / 4, 0] });
      m.cyl(b / Math.SQRT2 + 0.03, b / Math.SQRT2 + 0.03, 0.12, 4, 0x3a3a38, { p: [0, y + 0.06, 0], r: [0, Math.PI / 4, 0] });
      if (i < 3) m.box(b * 0.5, 1.2, 0.02, BRICK, { p: [0.2, y + 2.5, -b / 2 - 0.01] }); // bare brick where the plaster fell
      y += h;
    });
    for (const s of [-0.25, 0.25]) m.box(0.05, 7, 0.05, 0x3a3a38, { p: [s, 3.5, -1.62] });
    for (let k = 0.4; k < 7; k += 0.45) m.box(0.5, 0.04, 0.04, 0x3a3a38, { p: [0, k, -1.62] });
    m.sphere(1, 16, 6, 0x8a6a4a, { p: [0, 0, 0], s: [8, 1.3, 5.5] });
    for (let i = 0; i < 8; i++) {
      const a = 0.4 + i * 0.32, rr = 11 + (i % 2) * 1.5;
      m.box(1.8, r.range(0.9, 1.4), 0.9, i % 2 ? BRICK : BRICK2, { p: [Math.cos(a) * rr, 0.55, Math.sin(a) * rr], r: [0, -a, 0] });
    }
  },
  windmill: (m, _g, _s, _r, out) => {
    // a modern three-blade wind turbine, as seen across many Indian farm plains
    m.cyl(0.6, 1.1, 34, 10, 0xf2f2ee, { p: [0, 17, 0] });
    m.box(1.4, 1.4, 3.4, 0xf2f2ee, { p: [0, 34.5, 0.4] });
    const rotor = new ModelBuilder();
    rotor.sphere(0.8, 8, 6, 0xf2f2ee, { s: [1, 1, 1.4] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      rotor.box(0.7, 15, 0.18, 0xf6f6f2, { p: [Math.sin(a) * 7.5, Math.cos(a) * 7.5, 0], r: [0, 0, -a] });
    }
    const mesh = new THREE.Mesh(rotor.build(), toon({ vertexColors: true }));
    mesh.position.set(0, 34.5, -1.6);
    mesh.userData.spin = 0.9;
    mesh.castShadow = true;
    out.extras.push(mesh);
  },
  silo: (m, _g, _s, r) => {
    // stacks of straw: two tall round stacks with plastered skirts and thatch caps, and a long loaf
    // heap beside them, as kept in farmyards across the plains
    const STRAW = 0xd8b868, STRAW2 = 0xc8a050, MUD = 0x9a7a52;
    for (const [x, z, h] of [[0, 0, 5.5], [3.6, 1.2, 4.6]] as const) {
      m.cyl(2.25, 2.4, 1.0, 14, MUD, { p: [x, 0.5, z] });
      m.cyl(1.6, 2.3, h - 1.8, 14, STRAW, { p: [x, 1 + (h - 1.8) / 2, z] });
      m.cone(1.75, 1.6, 14, STRAW2, { p: [x, h - 0.0, z] });
      m.sphere(0.25, 6, 4, MUD, { p: [x, h + 0.75, z] });
    }
    m.sphere(1, 14, 8, STRAW2, { p: [-1.5, 0, 4.2], s: [4.5, 2.1, 1.8] });
    for (let i = 0; i < 5; i++) m.box(r.range(0.5, 1.2), 0.05, r.range(0.3, 0.8), STRAW, { p: [r.range(-4, 5), 0.03, r.range(-2.5, 6)], r: [0, r.range(0, 3), 0] });
  },
  temple: (m, g, _s, r) => {
    // a small, tended stone shrine: swept plinth, lamps lit, flowers at the door
    const stone = r.pick([0xb8ab94, 0xa89c88, 0xc4b498]);
    m.box(9, 1, 9, 0x9a8f7c, { p: [0, 0.5, 0] });
    m.box(7, 0.4, 7, stone, { p: [0, 1.2, 0] });
    m.box(5, 4, 5, stone, { p: [0, 3.4, 0] });
    for (let i = 0; i < 5; i++) {
      const w = 5.2 - i * 0.9;
      m.box(w, 1.1, w, i % 2 ? stone : 0xa89a82, { p: [0, 5.9 + i * 1.1, 0] });
    }
    m.sphere(0.6, 8, 6, 0xc9a24a, { p: [0, 11.6, 0] });
    m.box(1.6, 2.6, 0.2, 0x3a2a20, { p: [0, 2.7, -2.55] });
    for (const x of [-1.6, 1.6]) {
      m.cyl(0.25, 0.3, 4, 8, stone, { p: [x, 3.4, -3.1] });
      m.cyl(0.15, 0.2, 0.3, 6, 0x9a6a3a, { p: [x * 0.8, 1.55, -4] });
      g.cone(0.08, 0.22, 5, 0xffb84a, { p: [x * 0.8, 1.82, -4] });
    }
    // marigold garland across the door
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      m.sphere(0.11, 5, 4, i % 2 ? 0xf29a2a : 0xf2c22a, { p: [-0.9 + t * 1.8, 4.0 - Math.sin(t * Math.PI) * 0.3, -2.7] });
    }
    // flag pole
    m.cyl(0.05, 0.06, 5, 5, 0x6a5a4a, { p: [3.8, 3.5, -3.8] });
    m.shape([[0, 0], [1.4, -0.4], [0, -0.8]], 0.02, 0xe8742a, { p: [3.85, 5.9, -3.8] });
  },
  waterfall: (m, _g, s, r, out) => {
    for (let i = 0; i < 9; i++) m.dodeca(r.range(4, 6), 0x6f6a5f, { p: [r.range(-8, 8), r.range(4, 16), r.range(4, 9)], s: [1.3, 1, 1] });
    m.box(18, 20, 6, 0x77705f, { p: [0, 10, 8] });
    m.dodeca(2.4, 0x3a8a40, { p: [-6, 20, 6], s: [1.4, 0.5, 1] });
    m.dodeca(2.4, 0x3a8a40, { p: [6, 20.5, 6], s: [1.4, 0.5, 1] });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(5, 20, 1, 10), waterfallMat);
    fall.position.set(0, 10, 4.8);
    fall.rotation.y = Math.PI;
    out.extras.push(fall);
    // plunge pool in the toon water, a basin a metre and a half deep with foam round its rim
    const basin = (x: number, z: number) => { const d = Math.hypot(x, z - 1) / 6.5; return 0.25 - 1.5 * (1 - Math.min(1, d) ** 2) + Math.max(0, d - 1) * 2; };
    const pw = discWater(0, 1, 7, 0.25, basin, 8, 32);
    const pal = BIOMES[s.biome].palette;
    if (pw) out.extras.push(new THREE.Mesh(waterGeometry(pw), waterMaterial('lake', pal.water, pal.waterDeep)));
    for (let i = 0; i < 6; i++) m.ico(r.range(0.8, 1.4), 0, 0xe8f2f2, { p: [r.range(-2.5, 2.5), 0.8, r.range(1.5, 4)] });
  },
  dino: (m, _g, _s, _r, out) => {
    // a dinosaur statue of the kind that stands at Balasinor's fossil park, on a stone plinth
    const G = 0x6a8a4a;
    m.box(5.4, 0.35, 13, 0xb8b0a0, { p: [0, 0.17, -1.2] });
    m.sphere(2.6, 10, 8, G, { p: [0, 3.6, 0], s: [1, 0.8, 1.6] });
    for (const [x, z] of [[-1.3, -2], [1.3, -2], [-1.3, 2], [1.3, 2]]) m.cyl(0.6, 0.7, 3, 8, G, { p: [x, 1.5, z] });
    for (let i = 0; i < 6; i++) m.sphere(0.9 - i * 0.08, 8, 6, G, { p: [0, 4.6 + i * 1.0, -3.6 - i * 0.55] });
    m.sphere(1.0, 8, 6, G, { p: [0, 10.4, -7.0], s: [1, 0.8, 1.4] });
    m.sphere(0.12, 5, 4, 0x1a1a1a, { p: [0.55, 10.6, -7.6] });
    m.sphere(0.12, 5, 4, 0x1a1a1a, { p: [-0.55, 10.6, -7.6] });
    for (let i = 0; i < 6; i++) m.sphere(0.8 - i * 0.12, 7, 5, G, { p: [0, 3.4 - i * 0.3, 3.8 + i * 1.1] });
    for (let i = 0; i < 6; i++) m.cone(0.35, 0.8, 4, 0xe8a03a, { p: [0, 5.3 - i * 0.2, -1.5 + i * 0.9] });
    for (const x of [3.2, 5.0]) m.box(0.12, 1.6, 0.12, 0x5a5f66, { p: [x, 0.8, -5.5] });
    const board = signMesh('BALASINOR\nDINOSAUR FOSSIL PARK', 2.4, 1.0, '#2f5a3a', '#f2ead2');
    board.position.set(4.1, 1.9, -5.57);
    board.rotation.y = Math.PI;
    out.extras.push(board);
  },
  cup: (m) => {
    // a giant kulhad: an unglazed clay chai cup, wider at the lip, on a brick plinth, chai inside and
    // a few puffs of steam
    const CLAY = 0xb8643a, CLAY2 = 0xa45634;
    m.box(4.6, 0.9, 4.6, 0xa04a32, { p: [0, 0.45, 0] });
    m.box(4.8, 0.12, 4.8, 0xd8d0c0, { p: [0, 0.96, 0] });
    m.cyl(1.75, 1.75, 0.25, 20, CLAY2, { p: [0, 1.15, 0] });
    m.cyl(2.4, 1.7, 4.0, 20, CLAY, { p: [0, 3.2, 0] });
    for (const y of [2.0, 3.0, 4.0]) { const rr = 1.7 + ((y - 1.2) / 4.0) * 0.7 + 0.015; m.cyl(rr, rr, 0.05, 20, CLAY2, { p: [0, y, 0] }); }
    m.torus(2.38, 0.09, 6, 24, CLAY2, { p: [0, 5.2, 0], r: [Math.PI / 2, 0, 0] });
    m.cyl(2.3, 2.3, 0.05, 20, 0xc8945a, { p: [0, 5.05, 0] });
    for (const [x, y, s] of [[0.3, 5.9, 0.55], [-0.4, 6.6, 0.45], [0.2, 7.2, 0.35]]) m.sphere(s, 8, 6, 0xf0eee8, { p: [x, y, 0], s: [1.3, 1, 1.3] });
  },
  oldcar: (m) => {
    // an abandoned 1950s-style sedan: rounded humped bonnet, round headlamps either side of a chrome
    // grille, a short rounded boot; dusty paint with rust patches, one tyre flat, weeds round it
    const dust = 0xd8d2c2, rust = 0x9a5a3a, chrome = 0xa8a49a, glass = 0x5a6670;
    const sill = 0.3, wy = 0.32, wz = 1.35;
    profile(m, [[-2.05, sill], ...arch(-wz, sill, wy, 0.42), ...arch(wz, sill, wy, 0.42), [2.05, sill], [2.15, 0.46], [2.15, 0.72], [2.06, 0.86], [1.78, 0.95], [1.38, 0.98],
      [-0.8, 0.99], [-1.3, 0.98], [-1.75, 0.92], [-2.06, 0.8], [-2.18, 0.62], [-2.18, 0.46]], 1.7, dust);
    const gh = new Greenhouse({ belt: 0.98, roof: 1.56, wsBase: -0.8, wsTop: -0.3, rwTop: 0.85, rwBase: 1.38, hb: 0.8, hr: 0.7 });
    gh.shell(m, dust);
    gh.frontRearGlass(m, glass);
    gh.sideGlass(m, glass, [0.28]);
    // round headlamps on the wings, the grille between them, chrome bumpers
    for (const s of [-1, 1]) {
      m.cyl(0.12, 0.12, 0.08, 12, chrome, { p: [s * 0.62, 0.74, -2.15], r: [Math.PI / 2, 0, 0] });
      m.cyl(0.09, 0.09, 0.02, 12, 0x8a9096, { p: [s * 0.62, 0.74, -2.2], r: [Math.PI / 2, 0, 0] });
      m.box(0.2, 0.08, 0.04, 0xd88a3a, { p: [s * 0.62, 0.55, -2.19] }); // indicator
    }
    m.box(0.8, 0.28, 0.04, 0x3a3a38, { p: [0, 0.66, -2.19] });
    for (let i = 0; i < 5; i++) m.box(0.78, 0.025, 0.02, chrome, { p: [0, 0.55 + i * 0.055, -2.21] });
    for (const z of [-2.24, 2.22]) m.box(1.74, 0.12, 0.1, chrome, { p: [0, 0.42, z] });
    m.box(0.5, 0.12, 0.02, 0xe8e2c8, { p: [0, 0.3, -2.25] });
    for (const s of [-1, 1]) m.box(0.12, 0.16, 0.03, 0x8a2a20, { p: [s * 0.65, 0.68, 2.16] });
    // rust and dirt
    m.box(0.9, 0.012, 0.6, rust, { p: [0.2, 1.0, -1.4], r: [0.04, 0, 0] });
    m.box(0.012, 0.25, 0.7, rust, { p: [0.856, 0.45, 0.4] });
    m.box(0.012, 0.2, 0.5, rust, { p: [-0.856, 0.42, -1.0] });
    m.box(0.012, 0.18, 0.5, 0x8a7a62, { p: [-0.856, 0.5, 1.4] });
    // wheels: front right is flat, so it sits low and bulges
    for (const [x, z] of [[-0.76, -wz], [0.76, -wz], [-0.76, wz], [0.76, wz]]) {
      const flat = x > 0 && z < 0;
      wheel(m, x, flat ? 0.24 : wy, z, wy, 0.2, 0x9a968a, 12);
      if (flat) m.box(0.22, 0.06, 0.5, 0x1e1e1e, { p: [x, 0.03, z] });
    }
    // weeds growing round it
    for (const [x, z, h] of [[0.95, -0.9, 0.6], [-0.95, 1.7, 0.45], [0.2, 2.35, 0.5], [-1.0, -1.9, 0.4], [1.05, 1.1, 0.35]]) {
      m.cone(0.22, h, 5, 0x6f9a50, { p: [x, h / 2, z] });
      m.cone(0.16, h * 0.8, 5, 0x7fa85a, { p: [x + 0.15, h * 0.4, z + 0.1] });
    }
  },
  phonebooth: (m, g, _s, _r, out) => {
    // an STD-ISD-PCO booth: a small yellow cabin with a glass door and a phone on a shelf inside,
    // the lettering on a red board along the top
    m.box(1.3, 2.3, 1.3, 0xf2c230, { p: [0, 1.15, 0] });
    m.box(0.9, 1.8, 0.04, 0x2a2a2a, { p: [0, 1.05, -0.66] });
    m.box(0.76, 1.66, 0.05, 0x6a8a9a, { p: [0, 1.05, -0.67] });
    m.box(0.5, 0.06, 0.3, 0x8a6448, { p: [0, 1.1, -0.3] });
    m.box(0.22, 0.12, 0.18, 0xc8302a, { p: [0, 1.19, -0.3] });
    m.box(1.45, 0.12, 1.45, 0xc8302a, { p: [0, 2.36, 0] });
    g.box(0.5, 0.15, 0.5, 0xfff2b0, { p: [0, 2.5, 0] });
    for (const z of [-0.67, 0.67]) {
      const b = signMesh('STD · ISD · PCO', 1.3, 0.36, '#c8302a', '#f7e8c8');
      b.position.set(0, 2.0, z);
      if (z < 0) b.rotation.y = Math.PI;
      out.extras.push(b);
    }
  },
  oddsign: (_m, _g, s, r, out) => {
    const texts = ['LAST GOOD VIEW\nFOR 3 KM', 'HONEY · TOMATOES\n· ADVICE', 'SLOW DOWN\nDUCKS THINKING', 'THIS ROCK IS\nVERY OLD', "YOU'RE DOING\nFINE", "WORLD'S OKAYEST\nPICKLES", 'NOTHING HERE\n(PROMISE)', 'TURN BACK FOR\nBETTER CLOUDS'];
    const t = texts[r.int(0, texts.length - 1)];
    const grp = new THREE.Group();
    const board = signMesh(t, 3.2, 1.3, r.pick(['#f2ead2', '#f7d65a', '#e9f0e4']), r.pick(['#2a2a2a', '#7a2a1a', '#1d3a5a']));
    board.position.set(0, 2.1, -0.06);
    board.rotation.y = Math.PI;
    const back = new ModelBuilder();
    back.box(3.3, 1.4, 0.1, 0x8a6448, { p: [0, 2.1, 0] });
    back.box(0.14, 2.6, 0.14, WOOD_D, { p: [-1.2, 1.1, 0.1] });
    back.box(0.14, 2.6, 0.14, WOOD_D, { p: [1.2, 1.1, 0.1] });
    grp.add(new THREE.Mesh(back.build(), toon({ vertexColors: true })), board);
    grp.userData.local = true;
    out.extras.push(grp);
    void s;
  },
  building: (m, g, s, r) => {
    // an Indian street-front building: painted walls with a ledge at each floor, a chajja (concrete
    // sunshade) over every window, balconies with railings, AC units; a shop below with a ribbed
    // rolling shutter, an awning and a painted board; a parapet, stair room and water tank above
    const w = s.w!, d = s.d!, h = s.h!;
    const wall = s.color!, trim = s.color2!;
    const fz = -d / 2; // front face
    m.box(w, h, d, wall, { p: [0, h / 2 - 0.5, 0] });
    const floors = Math.max(1, Math.round(h / 3.2));
    for (let f = 1; f < floors; f++) m.box(w + 0.1, 0.18, 0.2, trim, { p: [0, f * 3.2 - 0.4, fz - 0.05] });
    // roof: slab, parapet with a rail, a stair room, a ribbed black tank, sometimes a dish
    const top = h - 0.5;
    m.box(w + 0.3, 0.2, d + 0.3, trim, { p: [0, top + 0.1, 0] });
    for (const sd of [-1, 1]) {
      m.box(w + 0.3, 0.9, 0.12, wall, { p: [0, top + 0.6, (sd * (d + 0.18)) / 2] });
      m.box(0.12, 0.9, d + 0.3, wall, { p: [(sd * (w + 0.18)) / 2, top + 0.6, 0] });
    }
    const sx = r.range(-w / 4, w / 4), sz = r.range(0, d / 4);
    m.box(2.6, 2.4, 2.4, wall, { p: [sx, top + 1.3, sz] });
    m.box(2.8, 0.15, 2.6, trim, { p: [sx, top + 2.55, sz] });
    if (r.chance(0.8)) {
      const tx = sx + (sx > 0 ? -2.2 : 2.2), tz = sz - 0.5;
      m.cyl(0.6, 0.6, 1.2, 10, 0x1e1e1e, { p: [tx, top + 0.8, tz] });
      for (const y of [0.45, 0.8, 1.15]) m.cyl(0.62, 0.62, 0.05, 10, 0x2e2e2e, { p: [tx, top + y, tz] });
    }
    if (r.chance(0.35)) m.cyl(0.45, 0.2, 0.08, 10, 0xe8e6e0, { p: [sx + 1.0, top + 2.9, sz - 1.3], r: [-0.9, 0, 0] });
    // ground floor: shop (shutter, awning, painted board with lettering strokes) or plain wall
    const shop = s.biome !== 'city' || r.chance(0.7);
    if (shop) {
      const sw = w * 0.8;
      m.box(sw, 2.4, 0.08, r.pick([0x8a8a86, 0x6a7a8a, 0xb8a888]), { p: [0, 1.2, fz - 0.05] });
      for (let k = 0; k < 8; k++) m.box(sw, 0.03, 0.02, 0x5a5a56, { p: [0, 0.25 + k * 0.28, fz - 0.1] });
      const board = r.pick([0xf2c230, 0xc8302a, 0x2a5ab8, 0x2a8a4a, 0xf2efe6]);
      m.box(w * 0.92, 0.9, 0.1, board, { p: [0, 3.0, fz - 0.12] });
      const ink = board === 0xf2c230 || board === 0xf2efe6 ? 0x1a1a1a : 0xf7f3e8;
      for (let k = 0, n = Math.max(3, Math.floor(w / 1.4)); k < n; k++) m.box(r.range(0.35, 0.8), 0.32, 0.02, ink, { p: [-w * 0.38 + (k + 0.5) * ((w * 0.76) / n), 3.02, fz - 0.18] });
      m.box(sw, 0.08, 1.2, r.pick([0x3a7a6a, 0xc8503a, 0x3a5a9a, 0xe8a03a]), { p: [0, 2.45, fz - 0.65], r: [-0.2, 0, 0] });
      g.box(sw * 0.8, 0.1, 0.08, 0xfff0c0, { p: [0, 2.3, fz - 0.12] });
    }
    // upper floors: windows with sunshades, balconies with railings, AC units
    for (let f = shop ? 1 : 0; f < floors; f++) {
      const y = f * 3.2 + 1.1;
      const n = Math.max(1, Math.floor(w / 3));
      const balcony = r.chance(0.55);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * (w / n);
        const lit = r.chance(0.45);
        g.box(1.1, 1.3, 0.08, lit ? 0xffd890 : 0x404850, { p: [x, y, fz - 0.05] });
        m.box(1.5, 0.08, 0.5, trim, { p: [x, y + 0.82, fz - 0.27] });
        if (r.chance(0.25)) m.box(0.8, 0.5, 0.35, 0xe8e6e0, { p: [x + 0.95, y - 0.6, fz - 0.2] });
      }
      if (balcony) {
        const bw = Math.min(w * 0.55, 4.5);
        m.box(bw, 0.12, 1.0, trim, { p: [0, y - 0.95, fz - 0.5] });
        m.box(bw, 0.05, 0.05, 0x3a3a3a, { p: [0, y - 0.05, fz - 0.98] });
        for (let k = 0; k <= 6; k++) m.box(0.03, 0.85, 0.03, 0x3a3a3a, { p: [-bw / 2 + (k * bw) / 6, y - 0.47, fz - 0.98] });
      }
    }
  },
  tower: (m, g, s, r) => {
    // a residential high-rise: a podium, lit window bands, stacked balconies up two columns of the
    // front, a lift machine room and water tanks on the roof
    const w = s.w!, d = s.d!, h = s.h!;
    m.box(w, h, d, s.color!, { p: [0, h / 2 - 1, 0] });
    m.box(w + 2, 4, d + 2, s.color2!, { p: [0, 1, 0] });
    m.box(w * 0.4, 3, d * 0.4, s.color2!, { p: [0, h + 0.5, 0] });
    for (const x of [-w * 0.3, w * 0.3]) m.cyl(0.9, 0.9, 1.8, 10, 0x1e1e1e, { p: [x, h - 0.1, d * 0.25] });
    for (let y = 4; y < h - 2; y += 3.4) {
      g.box(w * 0.92, 1.4, 0.1, r.chance(0.5) ? 0xffe0a0 : 0x404850, { p: [0, y, -d / 2 - 0.05] });
      g.box(0.1, 1.4, d * 0.92, r.chance(0.5) ? 0xffe0a0 : 0x404850, { p: [w / 2 + 0.05, y, 0] });
      g.box(0.1, 1.4, d * 0.92, r.chance(0.5) ? 0xffe0a0 : 0x404850, { p: [-w / 2 - 0.05, y, 0] });
      for (const x of [-w * 0.27, w * 0.27]) {
        m.box(w * 0.3, 0.15, 1.2, s.color!, { p: [x, y - 1.0, -d / 2 - 0.6] });
        m.box(w * 0.3, 0.9, 0.06, 0x8a9aa6, { p: [x, y - 0.5, -d / 2 - 1.17] });
      }
    }
    if (r.chance(0.5)) g.box(0.4, 0.4, 0.4, 0xff4a3a, { p: [0, h + 2.4, 0] });
  },
  streetlight: (m, g) => {
    m.cyl(0.08, 0.11, 6, 6, 0x5a5f66, { p: [0, 3, 0] });
    m.box(0.08, 0.08, 1.6, 0x5a5f66, { p: [0, 5.9, -0.8] });
    m.box(0.35, 0.12, 0.6, 0x4a4f56, { p: [0, 5.85, -1.5] });
    g.box(0.3, 0.06, 0.5, 0xfff0c8, { p: [0, 5.77, -1.5] });
  },
  bench: (m, _g, _s, _r, out) => {
    m.box(2, 0.1, 0.5, WOOD, { p: [0, 0.5, 0] });
    m.box(2, 0.5, 0.08, WOOD, { p: [0, 0.8, 0.25] });
    m.box(0.1, 0.5, 0.5, WOOD_D, { p: [-0.9, 0.25, 0] });
    m.box(0.1, 0.5, 0.5, WOOD_D, { p: [0.9, 0.25, 0] });
    for (let i = -3; i <= 3; i++) m.box(0.12, 1, 0.12, WOOD_D, { p: [i * 1.5, 0.5, -3] });
    m.box(9, 0.1, 0.1, WOOD, { p: [0, 0.95, -3] });
    m.box(0.12, 1.6, 0.12, WOOD_D, { p: [3.5, 0.8, 0.4] });
    const sign = signMesh('VIEWPOINT', 1.4, 0.45, '#3a6a4a', '#f2ead2');
    sign.position.set(3.5, 1.7, 0.33);
    sign.rotation.y = Math.PI;
    sign.userData.local = true;
    out.extras.push(sign);
  },
  hidden: () => {},
};

/** The falling sheet of a waterfall: streaks in the water palette flowing down, foam at the foot. */
export const waterfallMat = new THREE.ShaderMaterial({
  uniforms: { uTime: shared.time, uLight: waterLight.uLight },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float uTime; uniform float uLight; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main(){
      float n = vn(vec2(vUv.x * 14.0, vUv.y * 2.5 + uTime * 2.4));
      vec3 col = mix(vec3(0.24, 0.5, 0.56), vec3(0.5, 0.76, 0.8), step(0.42, n));
      col = mix(col, vec3(0.93, 0.97, 0.97), step(0.7, n));
      col = mix(col, vec3(0.95, 0.98, 0.98), step(vUv.y, 0.1 + 0.04 * sin(vUv.x * 21.0 + uTime * 3.0)));
      gl_FragColor = vec4(col * uLight, 1.0);
      #include <colorspace_fragment>
    }`,
});

export function hasBuilder(kind: string) {
  return kind in B;
}
export function registerBuilder(kind: string, b: Builder) {
  B[kind] = b;
}

const COLLIDE: Record<string, number> = {
  lookout: 2.6, cabin: 4, lighthouse: 2.8, watertower: 3, motelruin: 0, arch: 2.8, barn: 6, windmill: 1.2, silo: 4,
  temple: 4.5, dino: 3, cup: 3.2, oldcar: 2, phonebooth: 0.8, building: 0, tower: 0, streetlight: 0.3, oddsign: 0.4,
  toll: 1.0, banyan: 2.2, milestone: 0.3, milestone0: 0.3, ghatsign: 0.15, hairpin: 0.15,
};

const tmpM = new THREE.Matrix4();

/** Build one site into the chunk's shared builders. */
export function buildSite(world: World, site: Site, out: PropOut) {
  const b = B[site.kind];
  if (!b) return;
  const rng = new Rng(hashString(site.id));
  const y = site.pit ? site.flat!.y : site.kind === 'seastack' ? 0 : site.kind === 'pier' || site.kind === 'fishingnets' ? Math.max(0, world.height(site.x, site.z)) : site.kind === 'breaker' || site.kind === 'toll' ? world.road(site.z).y : world.height(site.x, site.z);
  const xf = { p: [site.x, y, site.z] as [number, number, number], r: [0, site.heading, 0] as [number, number, number] };
  // build straight into the chunk's builders with this site's transform as the base
  out.mb.setBase(xf);
  out.glow.setBase(xf);
  const extras: THREE.Object3D[] = [];
  b(out.mb, out.glow, site, rng, { mb: out.mb, glow: out.glow, colliders: [], extras });
  out.mb.setBase(null);
  out.glow.setBase(null);
  tmpM.makeRotationY(site.heading).setPosition(site.x, y, site.z);
  for (const e of extras) {
    e.applyMatrix4(tmpM);
    out.extras.push(e);
  }
  // colliders
  const cr = COLLIDE[site.kind];
  if (site.kind === 'building' || site.kind === 'tower' || site.kind === 'motelruin') {
    // approximate rectangles with a row of circles along the width
    const w = site.kind === 'motelruin' ? 14 : site.w!;
    const d = site.kind === 'motelruin' ? 6 : site.d!;
    const r = d / 2;
    const n = Math.max(1, Math.ceil(w / d));
    const ca = Math.cos(site.heading), sa = Math.sin(site.heading);
    for (let i = 0; i < n; i++) {
      const lx = -w / 2 + r + (i * (w - d)) / Math.max(1, n - 1);
      out.colliders.push(site.x + lx * ca, site.z - lx * sa, r);
    }
  } else if (cr) out.colliders.push(site.x, site.z, cr);
}
