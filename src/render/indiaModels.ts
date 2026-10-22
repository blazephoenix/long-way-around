// India layer models: kilometre stones, ghat signs and hairpin boards, speed breakers, toll plaza,
// cantilevered fishing nets, stepwell, fort wall, banyan shrine, tea estate, dhaba, tapri,
// coconut and sugarcane stands. Proportions follow the scenery references in REFERENCES.md.
import * as THREE from 'three';
import { registerBuilder, signMesh, PropOut } from './props';
import { ModelBuilder } from './models';
import { beam } from './carKit';
import { toon } from './toon';
import type { Site } from '../world/sites';
import type { Rng } from '../world/prng';
import { styleFor, buildDiner, buildStand, stopName, signText } from '../stops/stopModels';
import { cycle } from '../world/prng';

const SAND = 0xd8b88a, SAND2 = 0xc8a070, SAND3 = 0xb8905e;

function stoneFace(text: string, colour: number): THREE.Material {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const g = c.getContext('2d')!;
  const [road, town, dist] = text.split('|');
  g.fillStyle = '#f7f5ee';
  g.fillRect(0, 0, 128, 192);
  g.fillStyle = '#' + colour.toString(16).padStart(6, '0');
  g.beginPath();
  g.arc(64, 64, 64, Math.PI, 0);
  g.lineTo(128, 80);
  g.lineTo(0, 80);
  g.fill();
  g.fillStyle = colour === 0xf2c230 ? '#1a1a1a' : '#ffffff';
  g.textAlign = 'center';
  g.font = '700 22px "IBM Plex Mono", monospace';
  g.fillText(road, 64, 60);
  g.fillStyle = '#1a1a1a';
  let size = 20;
  g.font = `700 ${size}px Mukta, system-ui, sans-serif`;
  while (g.measureText(town).width > 118 && size > 10) { size--; g.font = `700 ${size}px Mukta, system-ui, sans-serif`; }
  g.fillText(town, 64, 116);
  g.font = '700 40px "IBM Plex Mono", monospace';
  g.fillText(dist, 64, 168);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = toon({ map: t });
  mat.userData.own = true;
  return mat;
}

function milestone(_m: ModelBuilder, _g: ModelBuilder, s: Site, _r: Rng, out: PropOut) {
  const grp = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.24, 0);
  shape.lineTo(0.24, 0);
  shape.lineTo(0.24, 0.5);
  shape.absarc(0, 0.5, 0.24, 0, Math.PI, false);
  shape.lineTo(-0.24, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
  geo.translate(0, 0, -0.08);
  // UVs from the front-face position so the painted face maps cleanly
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 0.24) / 0.48, pos.getY(i) / 0.74);
  const mat = stoneFace(s.text ?? 'NH 0|HERE|0', s.color ?? 0xf2c230);
  const body = new THREE.Mesh(geo, mat);
  body.position.y = -0.05;
  grp.add(body);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), toon({ color: 0xc8c4b8 }));
  base.position.y = 0.0;
  grp.add(base);
  out.extras.push(grp);
}

function roadSign(text: string, bg: string, fg: string, w: number, h: number, out: PropOut, m: ModelBuilder, triangle = false) {
  m.box(0.1, 2.2 + (triangle ? 0.9 : 0), 0.1, 0x5a5f66, { p: [0, 1.1 + (triangle ? 0.45 : 0), 0.06] });
  const sm = signMesh(text, w, h, bg, fg);
  sm.position.set(0, 1.9, 0);
  sm.rotation.y = 0;
  out.extras.push(sm);
  const back = signMesh(text, w, h, '#9aa0a6', '#9aa0a6');
  back.position.set(0, 1.9, 0.11);
  back.rotation.y = Math.PI;
  out.extras.push(back);
  if (triangle) {
    // red-bordered warning triangle with a hairpin symbol
    m.shape([[-0.42, 0], [0.42, 0], [0, 0.72]], 0.04, 0xc8302a, { p: [0, 2.55, -0.02] });
    m.shape([[-0.32, 0.06], [0.32, 0.06], [0, 0.6]], 0.05, 0xf7f5ee, { p: [0, 2.55, -0.03] });
    m.add(new THREE.TorusGeometry(0.1, 0.025, 4, 10, Math.PI), 0x1a1a1a, { p: [0, 2.74, -0.06] });
    m.box(0.04, 0.12, 0.02, 0x1a1a1a, { p: [-0.1, 2.68, -0.06] });
    m.box(0.04, 0.12, 0.02, 0x1a1a1a, { p: [0.1, 2.68, -0.06] });
  }
}

registerBuilder('milestone', milestone);
registerBuilder('milestone0', milestone);
registerBuilder('ghatsign', (m, _g, s, _r, out) => roadSign(s.text ?? '', '#f2c230', '#1a1a1a', 2.2, 1.0, out, m));
registerBuilder('hairpin', (m, _g, s, _r, out) => roadSign(s.text ?? '', '#f2c230', '#1a1a1a', 1.5, 0.75, out, m, true));
registerBuilder('breakersign', (m, _g, s, _r, out) => {
  // hand-painted on a white board, a little wonky, placed just after the bump
  m.box(0.09, 1.5, 0.09, 0x6a4a34, { p: [-0.6, 0.75, 0.06] });
  m.box(0.09, 1.5, 0.09, 0x6a4a34, { p: [0.6, 0.75, 0.06] });
  const sm = signMesh(s.text ?? '', 1.5, 0.6, '#f7f3e8', '#b8302a');
  sm.position.set(0, 1.45, 0);
  sm.rotation.z = 0.05;
  out.extras.push(sm);
});
registerBuilder('breaker', (m, _g, s) => {
  void s;
  // yellow-black striped hump across the carriageway (built along local x)
  for (let i = -8; i <= 8; i++) m.box(0.45, 0.1, 1.2, i % 2 ? 0x1a1a1a : 0xf2c230, { p: [i * 0.45, 0.1, 0], r: [0, 0, 0] });
});

// ---------------------------------------------------------------- toll plaza (spans the road)
registerBuilder('toll', (m, g, s, _r, out) => {
  void s;
  // local x runs across the road: lanes at about ±1.85
  m.box(14, 0.6, 10, 0xe8e2d4, { p: [0, 6.2, 0] });
  m.box(14.2, 0.25, 10.2, 0x2f6a9a, { p: [0, 5.85, 0] });
  g.box(13, 0.06, 9, 0xfff4d8, { p: [0, 5.7, 0] });
  for (const x of [-6.5, 0, 6.5]) {
    m.box(0.6, 6, 0.6, 0xc8c4b8, { p: [x, 3, -4] });
    m.box(0.6, 6, 0.6, 0xc8c4b8, { p: [x, 3, 4] });
  }
  // centre island with two booths
  m.box(1.4, 0.25, 10, 0xd8d4c8, { p: [0, 0.12, 0] });
  m.box(1.2, 2.4, 2, 0xf2efe6, { p: [0, 1.4, -1.5] });
  m.box(1.2, 2.4, 2, 0xf2efe6, { p: [0, 1.4, 1.5] });
  g.box(1.22, 0.8, 1.2, 0xffe2a0, { p: [0, 1.7, -1.5] });
  g.box(1.22, 0.8, 1.2, 0xffe2a0, { p: [0, 1.7, 1.5] });
  const sign = signMesh('TOLL PLAZA\nHAVE A GOOD JOURNEY', 7, 1.2, '#2f6a9a', '#ffffff');
  sign.position.set(0, 7.3, 5.05);
  out.extras.push(sign);
  // boom barriers per lane (animated)
  for (const lane of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(lane * 0.7, 1.1, lane * -1.5);
    const arm = new THREE.Mesh(new ModelBuilder().box(3.0, 0.1, 0.1, 0xc8302a, { p: [lane * 1.5, 0, 0] }).box(0.6, 0.11, 0.11, 0xf2f2ee, { p: [lane * 0.8, 0, 0] }).box(0.6, 0.11, 0.11, 0xf2f2ee, { p: [lane * 2.0, 0, 0] }).build(), toon({ vertexColors: true }));
    piv.add(arm);
    piv.userData.boom = lane;
    out.extras.push(piv);
  }
});

// ---------------------------------------------------------------- coast: cantilevered fishing nets
registerBuilder('fishingnets', (m, _g, _s, r) => {
  // a row of three: teak frames ~10 m tall, nets ~20 m across, stone counterweights on ropes
  for (let k = -1; k <= 1; k++) {
    const ox = k * 14 + r.range(-1, 1);
    // walkway out over the water (+z is seaward)
    m.box(1.2, 0.15, 7, 0x8a6448, { p: [ox, 1.2, 3] });
    for (let i = 0; i < 4; i++) m.cyl(0.08, 0.1, 3, 5, 0x6a4a34, { p: [ox + (i % 2 ? 0.5 : -0.5), -0.3, 1 + Math.floor(i / 2) * 4] });
    // main boom tilted seaward
    const tilt = 0.55;
    const L = 12;
    m.cyl(0.12, 0.18, L, 6, 0x7a5638, { p: [ox, 1.2 + Math.cos(tilt) * L * 0.45, 5 + Math.sin(tilt) * L * 0.5], r: [tilt, 0, 0] });
    const tipY = 1.2 + Math.cos(tilt) * L * 0.95, tipZ = 5 + Math.sin(tilt) * L;
    // four spars carrying the net
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ex = ox + dx * 5, ez = tipZ + 4 + dz * 4, ey = 1.0;
      const mx = (ox + ex) / 2, my = (tipY + ey) / 2, mz = (tipZ + ez) / 2;
      const len = Math.hypot(ex - ox, ey - tipY, ez - tipZ);
      const dir = new THREE.Vector3(ex - ox, ey - tipY, ez - tipZ).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const e = new THREE.Euler().setFromQuaternion(q);
      m.cyl(0.05, 0.06, len, 4, 0xa88a5a, { p: [mx, my, mz], r: [e.x, e.y, e.z] });
    }
    // the net: a shallow mesh hanging under the spar ends
    for (let i = -4; i <= 4; i++) {
      m.box(10, 0.03, 0.03, 0x3a3a3a, { p: [ox, 0.9 - Math.cos((i / 4) * 1.2) * 0.8, tipZ + 4 + i] });
      m.box(0.03, 0.03, 8, 0x3a3a3a, { p: [ox + i * 1.2, 0.5, tipZ + 4] });
    }
    // counterweight stones on ropes at the landward end
    for (let i = 0; i < 5; i++) {
      m.cyl(0.01, 0.01, 1.2 + i * 0.3, 3, 0xc8b48a, { p: [ox - 0.4 + i * 0.2, 0.9 - i * 0.15, 0.4] });
      m.dodeca(0.15, 0x8a8a86, { p: [ox - 0.4 + i * 0.2, 0.2 - i * 0.3, 0.4] });
    }
  }
});

// ---------------------------------------------------------------- desert: stepwell
registerBuilder('stepwell', (m, _g, _s, r) => {
  // inverted pyramid of tiers with zigzag flights on three sides, a pillared pavilion on the fourth
  const D = 7.5;
  const levels = 9;
  for (let i = 0; i < levels; i++) {
    const half = 9.5 - i * 0.95;
    const y = -(i * D) / levels;
    const t = 0.95;
    const col = i % 2 ? SAND : SAND2;
    // three stepped sides (back side open for the pavilion)
    m.box(half * 2, D / levels, t, col, { p: [0, y - D / levels / 2, half - t / 2] });
    m.box(t, D / levels, half * 2, col, { p: [half - t / 2, y - D / levels / 2, 0] });
    m.box(t, D / levels, half * 2, col, { p: [-half + t / 2, y - D / levels / 2, 0] });
    // diamond-pattern flights: little triangular stair blocks along each tier
    for (let k = -3; k <= 3; k++) {
      m.shape([[-0.5, 0], [0.5, 0], [0, 0.35]], 0.3, SAND3, { p: [k * half * 0.28, y, half - t - 0.2] });
      m.shape([[-0.5, 0], [0.5, 0], [0, 0.35]], 0.3, SAND3, { p: [half - t - 0.2, y, k * half * 0.28], r: [0, Math.PI / 2, 0] });
      m.shape([[-0.5, 0], [0.5, 0], [0, 0.35]], 0.3, SAND3, { p: [-half + t - 0.1, y, k * half * 0.28], r: [0, Math.PI / 2, 0] });
    }
  }
  // water at the bottom
  m.box(2.4, 0.1, 2.4, 0x3f7f8a, { p: [0, -D + 0.1, 0] });
  // pavilion: pillared corridor of three storeys on the -z side
  for (let f = 0; f < 3; f++) {
    const y = -D + f * 3;
    m.box(19, 0.3, 2.4, SAND2, { p: [0, y + 2.9, -9.2] });
    for (let i = -4; i <= 4; i++) m.box(0.35, 2.7, 0.35, SAND, { p: [i * 2.1, y + 1.45, -8.4] });
  }
  m.box(19.5, 1.0, 2.6, SAND3, { p: [0, 0.6, -9.2] });
  // low rim wall
  for (const [x, z, w, d] of [[0, 10, 20, 0.5], [10, 0, 0.5, 20], [-10, 0, 0.5, 20]]) m.box(w, 0.8, d, SAND2, { p: [x, 0.4, z] });
  void r;
});

// ---------------------------------------------------------------- desert: old fort wall on a mesa
registerBuilder('fortwall', (m) => {
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = -0.8 + (i / (N - 1)) * 1.6;
    const x = Math.sin(a) * 14, z = Math.cos(a) * 14 - 8;
    m.box(3.4, 5, 1.4, SAND2, { p: [x, 2.5, z], r: [0, a, 0] });
    for (let k = -1; k <= 1; k++) m.box(0.6, 0.8, 1.4, SAND, { p: [x + Math.cos(a) * k * 1.1, 5.4, z - Math.sin(a) * k * 1.1], r: [0, a, 0] });
  }
  for (const a of [-0.95, 0, 0.95]) {
    const x = Math.sin(a) * 14, z = Math.cos(a) * 14 - 8;
    m.cyl(2.2, 2.5, 7, 10, SAND3, { p: [x, 3.5, z] });
    for (let k = 0; k < 8; k++) m.box(0.5, 0.8, 0.5, SAND, { p: [x + Math.cos((k / 8) * Math.PI * 2) * 2, 7.4, z + Math.sin((k / 8) * Math.PI * 2) * 2] });
  }
  // gate arch in the middle tower
  m.box(2, 3, 0.5, 0x5a3a26, { p: [0, 1.5, 14 - 8 - 2.6] });
});

// ---------------------------------------------------------------- farmland: banyan with a roadside shrine
registerBuilder('banyan', (m, g, _s, r) => {
  m.cyl(1.2, 1.8, 5, 9, 0x7a6a58, { p: [0, 2.5, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    m.cyl(0.35, 0.5, 4, 6, 0x7a6a58, { p: [Math.cos(a) * 2.5, 5.5, Math.sin(a) * 2.5], r: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7] });
  }
  // aerial roots
  for (let i = 0; i < 16; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(3, 7.5), h = r.range(4.5, 7);
    m.cyl(0.08, 0.12, h, 4, 0x8a7a66, { p: [Math.cos(a) * d, h / 2, Math.sin(a) * d] });
  }
  // canopy
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    m.ico(r.range(2.6, 3.6), 0, i % 2 ? 0x3f6a34 : 0x4a7a3a, { p: [Math.cos(a) * r.range(3, 6), r.range(7.5, 9), Math.sin(a) * r.range(3, 6)], s: [1.2, 0.7, 1.2] });
  }
  m.ico(4, 0, 0x45723a, { p: [0, 9.5, 0], s: [1.4, 0.6, 1.4] });
  // sacred threads tied around the trunk
  for (let i = 0; i < 3; i++) m.add(new THREE.TorusGeometry(1.45 + i * 0.03, 0.03, 4, 18), [0xc8302a, 0xe8a03a, 0xf2f2ee][i], { p: [0, 1.3 + i * 0.15, 0], r: [Math.PI / 2, 0, 0] });
  // small whitewashed platform and shrine, with lamps
  m.box(5, 0.5, 5, 0xe8e4dc, { p: [0, 0.25, -3.2] });
  m.box(1, 1.1, 0.9, 0xf2efe6, { p: [0, 1.05, -4.6] });
  m.cone(0.7, 0.6, 4, 0xc8502a, { p: [0, 1.9, -4.6], r: [0, Math.PI / 4, 0] });
  m.box(0.5, 0.5, 0.05, 0xd8442a, { p: [0, 1.0, -5.06] });
  for (const x of [-0.7, 0.7]) {
    m.cyl(0.07, 0.09, 0.08, 6, 0x9a6a3a, { p: [x, 0.55, -5.3] });
    g.cone(0.04, 0.1, 5, 0xffb84a, { p: [x, 0.65, -5.3] });
  }
  for (let i = 0; i < 6; i++) m.sphere(0.1, 5, 4, i % 2 ? 0xf29a2a : 0xf2c22a, { p: [-0.5 + i * 0.2, 0.55, -5.0] });
});

// ---------------------------------------------------------------- tropical: tea estate
registerBuilder('teaestate', (m, _g, s, r, out) => {
  // a sign at the estate road and a few silver oaks; the bushes come from the vegetation layer
  m.box(0.12, 2, 0.12, 0x5a5f66, { p: [-1.4, 1, 0] });
  m.box(0.12, 2, 0.12, 0x5a5f66, { p: [1.4, 1, 0] });
  // real estates of the Nilgiris and Munnar, walked in order along the road so neighbours differ
  const names = ['KOLUKKUMALAI\nTEA ESTATE', 'GLENDALE\nTEA ESTATE', 'KORAKUNDAH\nTEA ESTATE', 'CHAMRAJ\nTEA ESTATE', 'LOCKHART\nTEA ESTATE', 'THIASHOLA\nTEA ESTATE', 'KANNAN DEVAN\nHILLS'];
  const sm = signMesh(cycle(names, Math.floor(s.s / 1000)), 3.2, 1.3, '#2f6a4a', '#f2ead2');
  sm.position.set(0, 2.2, -0.08);
  sm.rotation.y = Math.PI;
  out.extras.push(sm);
  for (let i = 0; i < 4; i++) {
    const x = r.range(-25, 25), z = r.range(10, 50);
    m.cyl(0.12, 0.2, 9, 5, 0xb8b0a0, { p: [x, 4.5, z] });
    m.ico(1.3, 0, 0x4a7a3a, { p: [x, 9.2, z], s: [1, 1.7, 1] });
  }
  void s;
});

// ---------------------------------------------------------------- dhaba (diner variant) and stand variants
const STEEL = 0xc8ccd0, WOOD = 0x8a6448, WOOD_DARK = 0x6a4a34, ROPE = 0xd8c8a0, TIN = 0x9aa4aa;

/** charpai: a wooden frame on four turned legs with a woven rope top; `along` lays it along x */
function charpai(m: ModelBuilder, x: number, z: number, along: boolean, plank: boolean) {
  const L = 1.9, W = 0.9, y = 0.45;
  const [lx, lz] = along ? [L, W] : [W, L];
  m.box(lx - 0.08, 0.02, lz - 0.08, ROPE, { p: [x, y + 0.02, z] });
  for (let k = 1; k < 5; k++) {
    m.box(lx - 0.1, 0.012, 0.025, 0xb8a070, { p: [x, y + 0.035, z - lz / 2 + (k * lz) / 5] });
    m.box(0.025, 0.012, lz - 0.1, 0xb8a070, { p: [x - lx / 2 + (k * lx) / 5, y + 0.035, z] });
  }
  for (const s of [-1, 1]) {
    m.box(lx, 0.07, 0.06, WOOD, { p: [x, y, z + (s * lz) / 2] });
    m.box(0.06, 0.07, lz, WOOD, { p: [x + (s * lx) / 2, y, z] });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl(0.045, 0.035, y, 6, WOOD_DARK, { p: [x + (sx * lx) / 2, y / 2, z + (sz * lz) / 2] });
  // a plank laid across the middle serves as the table
  if (plank) m.box(along ? 0.32 : 1.3, 0.04, along ? 1.3 : 0.32, 0x9a7450, { p: [x, y + 0.3, z] });
  if (plank) for (const s of [-0.45, 0.45]) m.box(0.06, 0.28, 0.06, WOOD_DARK, { p: [x + (along ? 0 : s), y + 0.15, z + (along ? s : 0)] });
}

/** plastic chair, facing +z or -z */
function chair(m: ModelBuilder, x: number, z: number, face: number, colour: number) {
  m.box(0.44, 0.04, 0.42, colour, { p: [x, 0.45, z] });
  m.box(0.44, 0.42, 0.04, colour, { p: [x, 0.68, z - face * 0.2], r: [face * 0.12, 0, 0] });
  for (const sx of [-0.19, 0.19]) for (const sz of [-0.18, 0.18]) m.box(0.035, 0.45, 0.035, colour, { p: [x + sx, 0.22, z + sz] });
}

function buildDhaba(m: ModelBuilder, g: ModelBuilder, site: Site, r: Rng, out: PropOut) {
  // a low painted kitchen block with a name hoarding on the roof and an open front: the cooking
  // counter inside, a tandoor by the way in, steel tables and plastic chairs under a tin awning
  // hung with string lights, charpais out front, a steel water cooler at the side
  const wall = r.pick([0xf2ead2, 0xe8c27a, 0x8ac8c0, 0xf0b8a0, 0xd8e0a8]);
  const band = r.pick([0xc8302a, 0x2a6a4a, 0x2a4a8a, 0xd86a2a]);
  const W = 12, H = 3.2, z0 = 5, z1 = 10, zc = (z0 + z1) / 2, D = z1 - z0;
  // kitchen block: back and side walls, piers either side of a wide opening, a lintel over it
  m.box(W, H, 0.25, wall, { p: [0, H / 2, z1] });
  for (const s of [-1, 1]) {
    m.box(0.25, H, D, wall, { p: [(s * W) / 2, H / 2, zc] });
    m.box(1.6, H, 0.25, wall, { p: [s * (W / 2 - 0.8), H / 2, z0] });
    m.box(1.62, 0.9, 0.02, band, { p: [s * (W / 2 - 0.8), 0.45, z0 - 0.135] });
    m.box(0.02, 0.9, D + 0.25, band, { p: [s * (W / 2 + 0.135), 0.45, zc] });
  }
  m.box(W - 3.2, 0.7, 0.25, wall, { p: [0, H - 0.35, z0] });
  m.box(W - 3.2, 0.1, 0.02, band, { p: [0, H - 0.72, z0 - 0.135] });
  m.box(W - 0.3, 0.12, D, 0x9a948a, { p: [0, 0.06, zc] });
  m.box(W - 0.4, H - 0.2, 0.02, 0x6a5a4a, { p: [0, H / 2, z1 - 0.14] }); // smoke-darkened back wall inside
  // flat roof with a parapet and a black water tank
  m.box(W + 0.3, 0.2, D + 0.3, 0xd8d2c4, { p: [0, H + 0.1, zc] });
  for (const s of [-1, 1]) {
    m.box(W + 0.3, 0.45, 0.12, wall, { p: [0, H + 0.42, zc + (s * (D + 0.2)) / 2] });
    m.box(0.12, 0.45, D + 0.3, wall, { p: [(s * (W + 0.2)) / 2, H + 0.42, zc] });
  }
  m.cyl(0.6, 0.6, 1.1, 12, 0x1e1e1e, { p: [W / 2 - 1.3, H + 0.75, z1 - 1.0] });
  m.cyl(0.45, 0.6, 0.1, 12, 0x1e1e1e, { p: [W / 2 - 1.3, H + 1.35, z1 - 1.0] });
  // hoarding on a steel frame along the roof's front edge
  for (const x of [-3.2, 0, 3.2]) m.box(0.1, 2.5, 0.1, 0x5a5f66, { p: [x, H + 1.45, z0 + 0.64] }); // behind the board, touching it
  m.box(7, 2.2, 0.08, 0x3a3f46, { p: [0, H + 1.65, z0 + 0.55] });
  const sign = signMesh(signText(stopName(site)), 6.8, 2.0, '#c8302a', '#f7e8c8');
  sign.position.set(0, H + 1.65, z0 + 0.5);
  sign.rotation.y = Math.PI;
  out.extras.push(sign);
  // cooking counter in the opening: steel top, big pots, a kadhai on a burner, plates on a shelf
  m.box(6.4, 0.9, 0.8, 0xc8c2b4, { p: [0.4, 0.45, z0 + 0.6] });
  m.box(6.5, 0.05, 0.85, 0x7a7a7a, { p: [0.4, 0.92, z0 + 0.6] });
  for (let i = 0; i < 4; i++) {
    m.cyl(0.27, 0.24, 0.45, 12, STEEL, { p: [-2.2 + i * 0.75, 1.17, z0 + 0.6] });
    m.cyl(0.29, 0.29, 0.03, 12, 0xa8acb0, { p: [-2.2 + i * 0.75, 1.41, z0 + 0.6] });
  }
  m.cyl(0.16, 0.16, 0.12, 10, 0x2a2a2a, { p: [2.6, 1.0, z0 + 0.6] });
  m.cyl(0.45, 0.18, 0.18, 12, 0x2a2a2a, { p: [2.6, 1.15, z0 + 0.6] });
  g.cyl(0.14, 0.14, 0.02, 10, 0xff8a3a, { p: [2.6, 1.07, z0 + 0.6] });
  m.box(5, 0.05, 0.35, WOOD, { p: [0, 1.85, z1 - 0.35] });
  for (let i = 0; i < 8; i++) m.cyl(0.13, 0.13, 0.02, 10, STEEL, { p: [-2.2 + i * 0.55, 2.0, z1 - 0.3], r: [Math.PI / 2 - 0.25, 0, 0] });
  g.box(1.4, 0.06, 0.06, 0xf4fbff, { p: [-2, H - 0.25, zc] }); // tube lights
  g.box(1.4, 0.06, 0.06, 0xf4fbff, { p: [2, H - 0.25, zc] });
  // tandoor: a clay drum in a cement plinth, its mouth glowing (the order point is beside it)
  m.box(1.25, 0.6, 1.25, 0xd8d0c0, { p: [5.8, 0.3, 2.6] });
  m.cyl(0.5, 0.58, 0.45, 12, 0xb8764a, { p: [5.8, 0.82, 2.6] });
  m.cyl(0.26, 0.26, 0.02, 12, 0x2a1a12, { p: [5.8, 1.05, 2.6] });
  g.cyl(0.18, 0.18, 0.025, 10, 0xff8a3a, { p: [5.8, 1.06, 2.6] });
  // tin awning sloping toward the road on slim poles, string lights along its edge
  m.box(W + 1, 0.05, 4.8, TIN, { p: [0, 2.82, 2.6], r: [-0.08, 0, 0] });
  for (let i = 0; i < 12; i++) m.box(0.04, 0.03, 4.8, 0x7a8488, { p: [-6.2 + i * 1.13, 2.86, 2.6], r: [-0.08, 0, 0] });
  for (const x of [-6.3, -2.1, 2.1, 6.3]) m.cyl(0.05, 0.05, 2.45, 6, 0x7a7f86, { p: [x, 1.22, 0.4] });
  const BULBS = [0xff6a5a, 0xffd25a, 0x6ad2ff, 0x8aff8a, 0xffffff];
  for (let i = 0; i <= 26; i++) {
    const x = -6.3 + i * (12.6 / 26), seg = ((x + 6.3) % 4.2) / 4.2;
    g.sphere(0.05, 6, 4, BULBS[i % BULBS.length], { p: [x, 2.48 - Math.sin(seg * Math.PI) * 0.14, 0.36] });
  }
  // steel tables with plastic chairs under the awning
  const chairCol = r.pick([0xe8e8e2, 0xc8302a, 0x2a5ab8]);
  for (const x of [-4.4, -1.2, 2.0]) {
    m.box(1.2, 0.04, 0.7, STEEL, { p: [x, 0.75, 2.6] });
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.3, 0.3]) m.box(0.035, 0.75, 0.035, 0x9a9ea2, { p: [x + sx, 0.37, 2.6 + sz] });
    for (const sx of [-0.3, 0.3]) {
      chair(m, x + sx, 2.0, -1, chairCol);
      chair(m, x + sx, 3.2, 1, chairCol);
    }
  }
  // charpais out front, some with a plank table across
  charpai(m, -4.6, -2.4, false, true);
  charpai(m, -1.6, -2.9, true, false);
  charpai(m, 1.6, -2.4, false, true);
  charpai(m, 4.4, -3.1, true, true);
  // steel water cooler with taps on a stand at the side
  m.box(0.9, 0.9, 0.55, STEEL, { p: [-6.9, 1.2, 3.2] });
  for (const sx of [-0.25, 0, 0.25]) m.cyl(0.02, 0.02, 0.1, 4, 0x8a8e92, { p: [-6.9 + sx, 0.95, 2.9], r: [Math.PI / 2, 0, 0] });
  for (const sx of [-0.4, 0.4]) for (const sz of [-0.22, 0.22]) m.box(0.04, 0.75, 0.04, 0x5a5f66, { p: [-6.9 + sx, 0.37, 3.2 + sz] });
}

/** cycle-style cart wheel: rim, tyre, hub and spokes, axle along x */
function cartWheel(m: ModelBuilder, x: number, z: number, rad: number) {
  m.torus(rad, 0.035, 6, 18, 0x2a2a2a, { p: [x, rad, z], r: [0, Math.PI / 2, 0] });
  m.cyl(0.05, 0.05, 0.1, 8, 0x8a8a8a, { p: [x, rad, z], r: [0, 0, Math.PI / 2] });
  for (let k = 0; k < 6; k++) m.box(0.015, rad * 2 - 0.05, 0.015, 0xa8a8a8, { p: [x, rad, z], r: [(k * Math.PI) / 6, 0, 0] });
}

function buildTapri(m: ModelBuilder, g: ModelBuilder, site: Site, r: Rng, out: PropOut) {
  const kind = site.variant!.startsWith('coconut') ? 'coconut' : site.variant!.startsWith('sugarcane') ? 'sugarcane' : 'tapri';
  if (kind === 'tapri') {
    // tea stall: a tin roof (part covered by a tarp) on bamboo poles over a wooden counter; tea
    // boiling in a wide pan on a stove, a blue water drum with a tap, glass jars of rusks and
    // biscuits, strips of snack packets hanging from the roof edge, a bench and a stool
    const BAMBOO = 0xb89a5a;
    for (const [x, z] of [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.3], [1.7, 1.3]]) {
      m.cyl(0.05, 0.055, 2.4, 6, BAMBOO, { p: [x, 1.2, z] });
      for (const y of [0.6, 1.3, 2.0]) m.cyl(0.062, 0.062, 0.04, 6, 0x9a7c44, { p: [x, y, z] });
    }
    m.box(4, 0.04, 3.1, TIN, { p: [0, 2.4, 0.05], r: [-0.1, 0, 0] });
    for (let i = 0; i < 9; i++) m.box(0.035, 0.025, 3.1, 0x7a8488, { p: [-1.8 + i * 0.45, 2.43, 0.05], r: [-0.1, 0, 0] });
    m.box(2.6, 0.03, 2.2, r.pick([0x2a5ab8, 0xe8742a, 0x2a8a5a]), { p: [0.6, 2.47, 0.5], r: [-0.1, 0, 0.03] });
    // counter: plank top over a boarded front
    m.box(2.4, 0.86, 0.7, WOOD, { p: [0, 0.43, -0.9] });
    m.box(2.5, 0.05, 0.78, 0x9a7450, { p: [0, 0.885, -0.9] });
    for (let i = 0; i < 4; i++) m.box(0.02, 0.8, 0.01, WOOD_DARK, { p: [-0.9 + i * 0.6, 0.43, -1.255] });
    // stove and the pan of tea, a steel kettle beside it
    m.box(0.4, 0.12, 0.35, 0x2a2a2a, { p: [-0.6, 0.97, -0.85] });
    g.cyl(0.13, 0.13, 0.02, 10, 0x5ab8ff, { p: [-0.6, 1.04, -0.85] });
    m.cyl(0.24, 0.2, 0.18, 12, 0xb8bcc0, { p: [-0.6, 1.14, -0.85] });
    m.cyl(0.22, 0.22, 0.01, 12, 0xc8945a, { p: [-0.6, 1.22, -0.85] });
    m.cyl(0.12, 0.15, 0.22, 10, STEEL, { p: [-0.05, 1.02, -0.75] });
    m.cyl(0.025, 0.025, 0.18, 4, STEEL, { p: [0.1, 1.08, -0.75], r: [0, 0, -0.9] });
    // steel glasses, glass jars with coloured lids
    for (let i = 0; i < 6; i++) m.cyl(0.035, 0.03, 0.09, 6, 0xd8dce0, { p: [0.25 + i * 0.09, 0.955, -1.1] });
    for (let i = 0; i < 4; i++) {
      const x = 0.3 + i * 0.22;
      m.cyl(0.08, 0.08, 0.2, 8, 0xd8e8e8, { p: [x, 1.01, -0.75] });
      m.cyl(0.065, 0.065, 0.12, 8, [0xd8a050, 0xc87a3a, 0xe8c87a, 0xb8603a][i], { p: [x, 0.98, -0.75] });
      m.cyl(0.085, 0.085, 0.03, 8, [0xc8302a, 0xf2c230, 0x2a8a5a, 0x2a5ab8][i], { p: [x, 1.12, -0.75] });
    }
    // blue water drum with a tap at the end of the counter
    m.cyl(0.28, 0.28, 0.75, 12, 0x2a5ab8, { p: [1.55, 0.375, -0.75] });
    m.cyl(0.02, 0.02, 0.1, 4, 0x8a8e92, { p: [1.55, 0.2, -1.05], r: [Math.PI / 2, 0, 0] });
    // snack packets in strips hanging from the front edge of the roof
    const PACK = [0xe8302a, 0xf2c230, 0x2a8a5a, 0x2a5ab8, 0xe8742a, 0xc83a8a];
    for (let s = 0; s < 6; s++)
      for (let k = 0; k < 5; k++) m.box(0.13, 0.15, 0.02, PACK[(s + k) % PACK.length], { p: [-1.5 + s * 0.24, 2.12 - k * 0.17, -1.42] });
    // bench to one side, a plastic stool
    m.box(0.36, 0.06, 1.8, 0x7a5a3a, { p: [2.7, 0.45, -0.5] });
    for (const z of [-1.2, 0.2]) m.box(0.3, 0.42, 0.06, WOOD_DARK, { p: [2.7, 0.21, z] });
    m.cyl(0.16, 0.19, 0.42, 8, 0xc8302a, { p: [-2.3, 0.21, -1.5] });
    const sm = signMesh('CHAI\nCUTTING ½', 1.0, 0.5, '#f2c230', '#1a1a1a');
    sm.position.set(0.9, 1.95, -1.42);
    sm.rotation.y = Math.PI;
    out.extras.push(sm);
  } else if (kind === 'coconut') {
    // tender-coconut cart: a wooden handcart on two cycle wheels heaped with green coconuts, a
    // chopping block with a cut one and a machete, a stool, and a big umbrella over it all
    m.box(2.0, 0.1, 1.1, WOOD, { p: [0, 0.85, -0.6] });
    for (const s of [-1, 1]) {
      m.box(2.0, 0.18, 0.05, WOOD_DARK, { p: [0, 0.98, -0.6 + s * 0.53] });
      m.box(0.05, 0.18, 1.1, WOOD_DARK, { p: [s * 0.98, 0.98, -0.6] });
      cartWheel(m, s * 0.62, -0.6, 0.36);
      beam(m, [s * 0.4, 0.86, -0.05], [s * 0.4, 0.78, 0.9], 0.05, 0.05, WOOD_DARK); // handles
    }
    beam(m, [0, 0.82, -1.1], [0, 0, -1.2], 0.06, 0.06, WOOD_DARK); // prop leg
    const GREENS = [0x5a9a3a, 0x6aa848, 0x4f8a34, 0x7aaa4a];
    let n = 0;
    for (const [cols, rows, y] of [[6, 3, 1.04], [5, 2, 1.28], [3, 1, 1.5]] as const)
      for (let i = 0; i < cols; i++)
        for (let j = 0; j < rows; j++)
          m.sphere(0.15, 7, 5, GREENS[n++ % 4], { p: [-0.75 + (i + (6 - cols) / 2) * 0.3, y, -0.6 + (j - (rows - 1) / 2) * 0.3], s: [1, 1.15, 1] });
    m.cyl(0.25, 0.28, 0.45, 10, 0x7a5a3a, { p: [1.45, 0.22, -0.9] });
    m.sphere(0.15, 7, 5, 0x6aa848, { p: [1.45, 0.6, -0.9], s: [1, 1.15, 1] });
    m.cyl(0.07, 0.07, 0.01, 8, 0xf2f0e6, { p: [1.45, 0.77, -0.9] });
    m.box(0.04, 0.015, 0.34, 0x9a9ea2, { p: [1.3, 0.46, -0.75], r: [0, 0.6, 0] });
    m.cyl(0.16, 0.19, 0.4, 8, 0x2a5ab8, { p: [-1.6, 0.2, -1.4] });
    beam(m, [-0.85, 0.85, -0.2], [-0.85, 2.5, -0.2], 0.04, 0.04, 0x5a5f66);
    m.cone(1.4, 0.45, 8, r.pick([0xe8302a, 0xf2c230, 0x2a5ab8]), { p: [-0.85, 2.65, -0.2] });
    const sm = signMesh('TENDER\nCOCONUT', 1.2, 0.6, '#2a8a5a', '#ffffff');
    sm.position.set(0, 1.9, -1.25);
    sm.rotation.y = Math.PI;
    out.extras.push(sm);
    m.box(0.06, 1.2, 0.06, WOOD_DARK, { p: [0, 1.4, -1.2] });
  } else {
    // sugarcane-juice cart: a painted handcart carrying the crusher (steel rollers in an iron frame
    // turned by a big spoked flywheel), a spout over a steel tray, glasses of juice, a painted canopy
    // edged with bells on two poles, cane stalks leaning on the side, a bucket of crushed stalks
    const paint = r.pick([0xf2c230, 0x2a8a5a, 0xe8742a]);
    m.box(2.4, 0.12, 1.2, paint, { p: [0, 0.82, -0.6] });
    m.box(2.4, 0.4, 1.16, 0xe8e2d0, { p: [0, 0.56, -0.6] });
    m.box(2.42, 0.08, 1.18, paint, { p: [0, 0.4, -0.6] });
    for (const s of [-1, 1]) {
      cartWheel(m, s * 0.66, -0.6, 0.36);
      beam(m, [s * 1.1, 0.9, -1.15], [s * 1.1, 2.45, -1.15], 0.05, 0.05, 0x5a5f66);
    }
    m.box(0.6, 0.6, 0.5, 0x2a2a2a, { p: [-0.4, 1.18, -0.55] });
    for (const sx of [-0.15, 0, 0.15]) m.cyl(0.07, 0.07, 0.35, 8, STEEL, { p: [-0.4 + sx, 1.62, -0.55] });
    m.cyl(0.28, 0.28, 0.06, 12, 0x3a3a3a, { p: [-0.4, 1.83, -0.55] });
    m.torus(0.55, 0.04, 6, 20, 0x2a2a2a, { p: [-0.85, 1.32, -0.55], r: [0, Math.PI / 2, 0] });
    for (let k = 0; k < 6; k++) m.box(0.03, 1.08, 0.03, 0x3a3a3a, { p: [-0.85, 1.32, -0.55], r: [(k * Math.PI) / 6, 0, 0] });
    m.cyl(0.03, 0.03, 0.3, 6, 0x9a9ea2, { p: [-0.98, 1.6, -0.55], r: [0, 0, Math.PI / 2] }); // crank handle
    m.box(0.12, 0.04, 0.3, STEEL, { p: [-0.4, 0.95, -0.95], r: [0.4, 0, 0] }); // spout
    m.box(0.7, 0.04, 0.4, STEEL, { p: [0.25, 0.9, -0.9] });
    for (let i = 0; i < 4; i++) m.cyl(0.04, 0.035, 0.12, 6, 0xc8d870, { p: [0.0 + i * 0.15, 0.98, -0.95] });
    m.box(2.8, 0.05, 1.6, paint, { p: [0, 2.48, -0.6] });
    for (let i = 0; i < 9; i++) m.sphere(0.04, 6, 4, 0xd8b048, { p: [-1.3 + i * 0.325, 2.4, -1.42] });
    // cane stalks stood on end, leaning on the cart's far end
    for (let i = 0; i < 12; i++) m.cyl(0.025, 0.03, 2.3, 5, i % 3 ? 0x8aa04a : 0x6a4a5a, { p: [1.4 + (i % 4) * 0.05, 1.14, -0.85 + Math.floor(i / 4) * 0.08], r: [0, 0, 0.1] });
    m.cyl(0.22, 0.18, 0.4, 10, 0x5a5f66, { p: [1.6, 0.2, -1.4] });
    m.cyl(0.2, 0.2, 0.06, 10, 0xd8d0a0, { p: [1.6, 0.38, -1.4] });
    const sm = signMesh('GANNE KA RAS\nSUGARCANE JUICE', 1.6, 0.6, '#f2c230', '#2a5a2a');
    sm.position.set(0.5, 2.15, -1.45);
    sm.rotation.y = Math.PI;
    out.extras.push(sm);
  }
}

registerBuilder('diner', (m, g, site, r, out) => (site.variant?.startsWith('dhaba') ? buildDhaba(m, g, site, r, out) : buildDiner(m, g, site, r, out)));
registerBuilder('stand', (m, g, site, r, out) => (site.variant && /^(tapri|coconut|sugarcane)/.test(site.variant) ? buildTapri(m, g, site, r, out) : buildStand(m, g, site, r, out)));
