// Procedural models for landmarks, buildings, stops and roadside deco.
// Every model is authored in local space: origin on the ground, -z faces the road.
import * as THREE from 'three';
import { ModelBuilder } from './models';
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

const B: Record<string, Builder> = {
  lookout: (m, g) => {
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) m.box(0.3, 14, 0.3, WOOD_D, { p: [x * 0.8, 7, z * 0.8], r: [z * 0.03, 0, -x * 0.03] });
    for (let y = 3; y < 13; y += 3.3) {
      m.box(3.4, 0.15, 0.15, WOOD, { p: [0, y, -1.6] });
      m.box(3.4, 0.15, 0.15, WOOD, { p: [0, y, 1.6] });
      m.box(0.15, 0.15, 3.4, WOOD, { p: [-1.6, y, 0] });
      m.box(0.15, 0.15, 3.4, WOOD, { p: [1.6, y, 0] });
    }
    m.box(4.2, 0.25, 4.2, WOOD, { p: [0, 14, 0] });
    m.box(4, 1.0, 4, 0xd8cfb8, { p: [0, 14.6, 0] });
    m.box(3.6, 1.0, 3.6, 0x3a4a5a, { p: [0, 15.6, 0] });
    m.cone(3.4, 1.6, 4, 0x7a3a2a, { p: [0, 16.9, 0], r: [0, Math.PI / 4, 0] });
    g.box(3.62, 0.9, 3.62, 0xffd27a, { p: [0, 15.6, 0] });
  },
  cabin: (m, g) => {
    m.box(7, 3.2, 5.5, 0x8a5a3a, { p: [0, 1.6, 0] });
    for (let y = 0.4; y < 3.2; y += 0.55) m.box(7.2, 0.12, 5.7, 0x6a4430, { p: [0, y, 0] });
    m.shape([[-4, 0], [4, 0], [0, 2.6]], 6.4, 0x4a5a4a, { p: [0, 3.2, -3.2] });
    m.box(0.8, 3, 0.8, 0x8a8478, { p: [2.4, 4.2, 1.2] });
    m.box(1.0, 1.8, 0.1, 0x4a3222, { p: [0, 0.9, -2.8] });
    m.box(2.5, 0.2, 2, WOOD, { p: [0, 0.1, -3.6] });
    g.box(0.9, 0.8, 0.1, 0xffd27a, { p: [-2.2, 1.7, -2.78] });
    g.box(0.9, 0.8, 0.1, 0xffd27a, { p: [2.2, 1.7, -2.78] });
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
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) m.cyl(0.15, 0.2, 12, 5, 0x6a6a6a, { p: [x, 6, z] });
    m.box(4.2, 0.1, 0.1, 0x6a6a6a, { p: [0, 5, -2], r: [0, 0, 0.9] });
    m.box(4.2, 0.1, 0.1, 0x6a6a6a, { p: [0, 5, 2], r: [0, 0, -0.9] });
    m.cyl(3.2, 3.2, 4, 14, 0xc9c2b0, { p: [0, 14, 0] });
    m.cone(3.4, 1.6, 14, 0x9a5a3a, { p: [0, 16.8, 0] });
    m.cyl(3.25, 3.25, 0.4, 14, 0x8a8478, { p: [0, 13, 0] });
  },
  motelruin: (m, g) => {
    m.box(18, 3, 6, 0xd9c09a, { p: [0, 1.5, 0] });
    m.box(19, 0.3, 7.5, 0x8a7a62, { p: [0, 3.1, -0.6] });
    for (let i = 0; i < 6; i++) {
      m.box(1, 2, 0.1, i % 2 ? 0x5a8a8a : 0x8a5a4a, { p: [-7.5 + i * 3, 1, -3.05] });
      m.box(1.2, 1, 0.1, 0x2a3440, { p: [-6.2 + i * 3, 1.6, -3.05] });
    }
    m.box(0.3, 7, 0.3, 0x6a6a6a, { p: [-8, 3.5, -6] });
    m.box(4, 2, 0.4, 0xd9573a, { p: [-8, 7, -6] });
    g.box(3.6, 0.4, 0.42, 0x7fe0e0, { p: [-8, 6.6, -6] });
  },
  arch: (m) => {
    m.add(new THREE.TorusGeometry(7, 2.2, 6, 12, Math.PI), 0xb46e4a, { p: [0, 0, 0], s: [1, 1.1, 1] });
    m.dodeca(3, 0xa66545, { p: [-7, 0, 0] });
    m.dodeca(3, 0xa66545, { p: [7, 0, 0] });
  },
  barn: (m, _g, _s, r) => {
    const wall = r.pick([0xb5543a, 0xe8e0cc, 0x8a6a4a]);
    const roof = r.pick([0x5a6a6a, 0x4a5a4a, 0x7a3a2a]);
    m.box(10, 5, 14, wall, { p: [0, 2.5, 0] });
    m.shape([[-5.4, 0], [-4, 2.6], [0, 4.2], [4, 2.6], [5.4, 0]], 14.4, roof, { p: [0, 5, -7.2] });
    m.box(4, 4, 0.2, 0x5a3a2a, { p: [0, 2, -7.05] });
    m.box(4.2, 0.2, 0.25, 0xf2f2f2, { p: [0, 2, -7.1], r: [0, 0, 0.75] });
    m.box(4.2, 0.2, 0.25, 0xf2f2f2, { p: [0, 2, -7.1], r: [0, 0, -0.75] });
    m.cyl(1.5, 1.5, 9, 10, 0xb8b8b0, { p: [8, 4.5, 4] });
    m.sphere(1.5, 10, 6, 0xa0a0a0, { p: [8, 9, 4] });
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
  silo: (m) => {
    for (const [x, z, h] of [[0, 0, 14], [4.2, 0.5, 11], [2, 3.8, 12]]) {
      m.cyl(2, 2, h, 12, 0xbcbcb4, { p: [x, h / 2, z] });
      for (let y = 2; y < h; y += 2) m.cyl(2.05, 2.05, 0.15, 12, 0x9a9a92, { p: [x, y, z] });
      m.sphere(2, 12, 6, 0xa8a8a0, { p: [x, h, z], s: [1, 0.5, 1] });
    }
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
  waterfall: (m, _g, _s, r, out) => {
    for (let i = 0; i < 9; i++) m.dodeca(r.range(4, 6), 0x6f6a5f, { p: [r.range(-8, 8), r.range(4, 16), r.range(4, 9)], s: [1.3, 1, 1] });
    m.box(18, 20, 6, 0x77705f, { p: [0, 10, 8] });
    m.dodeca(2.4, 0x3a8a40, { p: [-6, 20, 6], s: [1.4, 0.5, 1] });
    m.dodeca(2.4, 0x3a8a40, { p: [6, 20.5, 6], s: [1.4, 0.5, 1] });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(5, 20, 1, 10), waterfallMat);
    fall.position.set(0, 10, 4.8);
    fall.rotation.y = Math.PI;
    out.extras.push(fall);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 20).rotateX(-Math.PI / 2), toon({ color: 0x5aa0a8 }));
    pool.position.set(0, 0.25, 1);
    out.extras.push(pool);
    for (let i = 0; i < 6; i++) m.ico(r.range(0.8, 1.4), 0, 0xe8f2f2, { p: [r.range(-2.5, 2.5), 0.8, r.range(1.5, 4)] });
  },
  dino: (m) => {
    const G = 0x6aa04a;
    m.sphere(2.6, 10, 8, G, { p: [0, 3.6, 0], s: [1, 0.8, 1.6] });
    for (const [x, z] of [[-1.3, -2], [1.3, -2], [-1.3, 2], [1.3, 2]]) m.cyl(0.6, 0.7, 3, 8, G, { p: [x, 1.5, z] });
    for (let i = 0; i < 6; i++) m.sphere(0.9 - i * 0.08, 8, 6, G, { p: [0, 4.6 + i * 1.0, -3.6 - i * 0.55] });
    m.sphere(1.0, 8, 6, G, { p: [0, 10.4, -7.0], s: [1, 0.8, 1.4] });
    m.sphere(0.12, 5, 4, 0x1a1a1a, { p: [0.55, 10.6, -7.6] });
    m.sphere(0.12, 5, 4, 0x1a1a1a, { p: [-0.55, 10.6, -7.6] });
    for (let i = 0; i < 6; i++) m.sphere(0.8 - i * 0.12, 7, 5, G, { p: [0, 3.4 - i * 0.3, 3.8 + i * 1.1] });
    for (let i = 0; i < 6; i++) m.cone(0.35, 0.8, 4, 0xe8a03a, { p: [0, 5.3 - i * 0.2, -1.5 + i * 0.9] });
    m.box(4, 0.4, 2, 0xd8cfb8, { p: [3, 0.2, -3] });
  },
  cup: (m) => {
    m.cyl(1.4, 1.6, 2, 10, 0x8a8478, { p: [0, 1, 0] });
    m.cyl(3, 2.2, 4.4, 16, 0xf4f0e6, { p: [0, 4.2, 0] });
    m.cyl(2.85, 2.85, 0.15, 16, 0x6a3a1a, { p: [0, 6.25, 0] });
    m.add(new THREE.TorusGeometry(1.2, 0.35, 6, 12), 0xf4f0e6, { p: [3.1, 4.4, 0], r: [0, 0, 0] });
    m.cyl(3.6, 3.6, 0.3, 16, 0xe8e2d4, { p: [0, 2.0, 0] });
    m.cyl(1.2, 1.2, 0.6, 12, 0xd9573a, { p: [0, 5, -2.6], r: [Math.PI / 2, 0, 0] });
  },
  oldcar: (m) => {
    const rust = 0x9a5a3a;
    m.box(1.8, 0.7, 4, rust, { p: [0, 0.55, 0], r: [0, 0, 0.08] });
    m.box(1.5, 0.6, 2, 0x7a4a2a, { p: [0, 1.15, 0.3], r: [0, 0, 0.08] });
    for (const [x, z] of [[-0.8, -1.3], [0.8, -1.3], [-0.8, 1.3], [0.8, 1.3]]) m.cyl(0.32, 0.32, 0.22, 8, 0x2a2a2a, { p: [x, 0.22, z], r: [0, 0, Math.PI / 2], s: [1, 1, 0.7] });
    m.cone(0.3, 0.8, 4, 0x6f9a50, { p: [0.4, 1.4, -0.4] });
    m.cone(0.2, 0.6, 4, 0x7fa85a, { p: [-0.5, 1.0, 1.5] });
  },
  phonebooth: (m, g) => {
    m.box(1.1, 2.5, 1.1, 0x3a6a8a, { p: [0, 1.25, 0] });
    m.box(0.9, 1.6, 0.05, 0x9ac0d0, { p: [0, 1.4, -0.56] });
    m.box(1.2, 0.2, 1.2, 0x2a4a6a, { p: [0, 2.6, 0] });
    g.box(0.6, 0.18, 0.62, 0xfff2b0, { p: [0, 2.8, 0] });
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
    const w = s.w!, d = s.d!, h = s.h!;
    m.box(w, h, d, s.color!, { p: [0, h / 2 - 0.5, 0] });
    // flat roof with parapet, a rooftop water tank on many houses
    m.box(w + 0.3, 0.5, d + 0.3, s.color2!, { p: [0, h, 0] });
    if (r.chance(0.6)) m.cyl(0.7, 0.7, 1.3, 8, r.pick([0x2a2a2a, 0x3a5a8a, 0xe8e0cc]), { p: [r.range(-w / 4, w / 4), h + 0.9, r.range(-d / 4, d / 4)] });
    const floors = Math.max(1, Math.round(h / 3.2));
    // shopfront: shutter, awning, a painted board
    const shop = s.biome !== 'city' || r.chance(0.7);
    if (shop) {
      m.box(w * 0.7, 2.4, 0.08, r.pick([0x8a8a86, 0x6a7a8a, 0xb8a888]), { p: [0, 1.2, -d / 2 - 0.05] });
      m.box(w * 0.85, 0.12, 1.6, r.pick([0x3a7a6a, 0xc8503a, 0x3a5a9a, 0xe8a03a]), { p: [0, 2.7, -d / 2 - 0.8], r: [-0.18, 0, 0] });
      g.box(w * 0.6, 0.12, 0.08, 0xfff0c0, { p: [0, 2.45, -d / 2 - 0.1] });
    }
    for (let f = shop ? 1 : 0; f < floors; f++) {
      const n = Math.max(1, Math.floor(w / 3));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * (w / n);
        const lit = r.chance(0.45) ? 1 : 0.25;
        g.box(1.1, 1.3, 0.08, lit > 0.5 ? 0xffd890 : 0x404850, { p: [x, f * 3.2 + 1.6, -d / 2 - 0.05] });
      }
      if (r.chance(0.35)) m.box(w * 0.5, 0.1, 0.9, 0x8a8a86, { p: [0, f * 3.2 + 0.4, -d / 2 - 0.45] }); // balcony
    }
  },
  tower: (m, g, s, r) => {
    const w = s.w!, d = s.d!, h = s.h!;
    m.box(w, h, d, s.color!, { p: [0, h / 2 - 1, 0] });
    m.box(w * 0.6, 3, d * 0.6, s.color2!, { p: [0, h + 0.5, 0] });
    for (let y = 4; y < h - 2; y += 3.4) {
      g.box(w * 0.92, 1.4, 0.1, r.chance(0.5) ? 0xffe0a0 : 0x404850, { p: [0, y, -d / 2 - 0.05] });
      g.box(0.1, 1.4, d * 0.92, r.chance(0.5) ? 0xffe0a0 : 0x404850, { p: [w / 2 + 0.05, y, 0] });
      g.box(0.1, 1.4, d * 0.92, r.chance(0.5) ? 0xffe0a0 : 0x404850, { p: [-w / 2 - 0.05, y, 0] });
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

export const waterfallMat = new THREE.ShaderMaterial({
  uniforms: { uTime: shared.time },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    void main(){
      float s = fract(vUv.y * 3.0 + uTime * 1.6 + sin(vUv.x * 18.0) * 0.12);
      vec3 c = mix(vec3(0.55,0.78,0.85), vec3(0.92,0.97,1.0), step(0.75, s));
      gl_FragColor = vec4(c, 1.0);
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
  lookout: 2.2, cabin: 4, lighthouse: 2.8, watertower: 3, motelruin: 0, arch: 0, barn: 6, windmill: 1.2, silo: 2.5,
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
    const w = site.kind === 'motelruin' ? 18 : site.w!;
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
