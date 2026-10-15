// India layer models: kilometre stones, ghat signs and hairpin boards, speed breakers, toll plaza,
// cantilevered fishing nets, stepwell, fort wall, banyan shrine, tea estate, dhaba, tapri,
// coconut and sugarcane stands. Proportions follow the scenery references in REFERENCES.md.
import * as THREE from 'three';
import { registerBuilder, signMesh, PropOut } from './props';
import { ModelBuilder } from './models';
import { toon } from './toon';
import type { Site } from '../world/sites';
import type { Rng } from '../world/prng';
import { styleFor, buildDiner, buildStand } from '../stops/stopModels';

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
  const names = ['KURINJI HILLS\nTEA ESTATE', 'MISTY RIDGE\nTEA ESTATE', 'NEELA VALLEY\nTEA ESTATE'];
  const sm = signMesh(names[Math.floor(r.float() * names.length)], 3.2, 1.3, '#2f6a4a', '#f2ead2');
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
function buildDhaba(m: ModelBuilder, g: ModelBuilder, site: Site, r: Rng, out: PropOut) {
  // open-fronted kitchen under a tin roof, charpais in front, a tandoor glowing at night
  m.box(14, 3.2, 6, 0xe8dcc0, { p: [0, 1.6, 7] });
  m.box(15, 0.15, 10, 0x8a9aa2, { p: [0, 3.4, 4.5], r: [0.06, 0, 0] });
  for (const x of [-7, -2.3, 2.3, 7]) m.box(0.25, 3.2, 0.25, 0x6a4a34, { p: [x, 1.6, 0.2] });
  g.box(10, 1.2, 0.1, 0xffd890, { p: [0, 1.8, 3.95] });
  // charpais: wooden frames with woven rope tops
  for (let i = 0; i < 4; i++) {
    const x = -5 + i * 3.3, z = -3.5 + (i % 2) * 1.2;
    m.box(1.0, 0.08, 2.0, 0x8a6448, { p: [x, 0.5, z] });
    for (let k = 0; k < 5; k++) m.box(0.9, 0.02, 0.04, 0xd8c8a0, { p: [x, 0.55, z - 0.8 + k * 0.4] });
    for (const [dx, dz] of [[-0.45, -0.95], [0.45, -0.95], [-0.45, 0.95], [0.45, 0.95]]) m.box(0.07, 0.5, 0.07, 0x6a4a34, { p: [x + dx, 0.25, z + dz] });
  }
  // tandoor
  m.cyl(0.55, 0.7, 1.0, 10, 0xb8764a, { p: [5.8, 0.5, 2.6] });
  g.cyl(0.3, 0.3, 0.05, 10, 0xff8a3a, { p: [5.8, 1.02, 2.6] });
  // steel water drum and a few glasses
  m.cyl(0.35, 0.35, 0.9, 10, 0xc8ccd0, { p: [-6.5, 0.45, 2.2] });
  const names = ['PIND RASOI\nDHABA', 'HIGHWAY RASOI', 'APNA GHAR\nDHABA', 'SHAM-E-SAFAR\nDHABA'];
  const st = styleFor(site);
  void st;
  const sign = signMesh(names[Math.floor(r.float() * names.length)], 6, 1.6, '#c8302a', '#f7e8c8');
  sign.position.set(0, 4.3, 0.1);
  sign.rotation.y = Math.PI;
  out.extras.push(sign);
}

function buildTapri(m: ModelBuilder, g: ModelBuilder, site: Site, r: Rng, out: PropOut) {
  const kind = site.variant!.startsWith('coconut') ? 'coconut' : site.variant!.startsWith('sugarcane') ? 'sugarcane' : 'tapri';
  if (kind === 'tapri') {
    // tarp roof on poles, a stove with a kettle, steel glasses, a bench
    for (const [x, z] of [[-1.6, -1], [1.6, -1], [-1.6, 1.4], [1.6, 1.4]]) m.box(0.1, 2.3, 0.1, 0x6a5a4a, { p: [x, 1.15, z] });
    m.box(3.8, 0.06, 3, r.pick([0x2a5ab8, 0xe8742a, 0x2a8a5a]), { p: [0, 2.35, 0.2], r: [0.08, 0, 0] });
    m.box(2.4, 0.9, 0.7, 0x8a6448, { p: [0, 0.45, -0.9] });
    m.cyl(0.18, 0.2, 0.15, 8, 0x3a3a3a, { p: [-0.5, 0.97, -0.9] });
    g.cyl(0.12, 0.12, 0.02, 8, 0x5ab8ff, { p: [-0.5, 1.05, -0.9] });
    m.sphere(0.16, 8, 6, 0xc8ccd0, { p: [-0.5, 1.2, -0.9], s: [1, 0.8, 1] });
    m.cyl(0.03, 0.03, 0.18, 4, 0xc8ccd0, { p: [-0.33, 1.25, -0.9], r: [0, 0, -0.8] });
    for (let i = 0; i < 6; i++) m.cyl(0.035, 0.03, 0.09, 6, 0xd8dce0, { p: [0.2 + i * 0.1, 0.95, -0.95] });
    m.box(2, 0.08, 0.4, 0x6a4a34, { p: [0, 0.45, -2.6] });
    const sm = signMesh('CHAI\nCUTTING ½', 1.2, 0.6, '#f2c230', '#1a1a1a');
    sm.position.set(1.2, 1.9, -1.05);
    sm.rotation.y = Math.PI;
    out.extras.push(sm);
  } else if (kind === 'coconut') {
    // a hand cart piled with green tender coconuts, and a stool
    m.box(2.2, 0.6, 1.2, 0x8a6448, { p: [0, 0.8, -0.6] });
    for (const x of [-0.9, 0.9]) m.cyl(0.4, 0.4, 0.08, 10, 0x3a3a3a, { p: [x, 0.4, -0.6], r: [0, 0, Math.PI / 2] });
    for (let i = 0; i < 14; i++) m.sphere(0.18, 6, 5, i % 3 ? 0x5a9a3a : 0x7aaa4a, { p: [-0.8 + (i % 7) * 0.26, 1.25 + Math.floor(i / 7) * 0.22, -0.6 + ((i * 7) % 3 - 1) * 0.2] });
    m.box(0.5, 0.45, 0.5, 0x6a4a34, { p: [1.6, 0.22, 0] });
    const sm = signMesh('TENDER\nCOCONUT', 1.2, 0.6, '#2a8a5a', '#ffffff');
    sm.position.set(0, 1.9, -1.25);
    sm.rotation.y = Math.PI;
    out.extras.push(sm);
    m.box(0.06, 1.2, 0.06, 0x6a4a34, { p: [0, 1.4, -1.2] });
  } else {
    // sugarcane juice cart: a crusher wheel, a bundle of canes, glasses
    m.box(2.4, 0.9, 1.2, 0xe8e2d0, { p: [0, 0.75, -0.6] });
    for (const x of [-1, 1]) m.cyl(0.4, 0.4, 0.08, 10, 0x3a3a3a, { p: [x, 0.4, -0.6], r: [0, 0, Math.PI / 2] });
    m.cyl(0.5, 0.5, 0.15, 14, 0x3a3a3a, { p: [-0.6, 1.6, -0.6], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 9; i++) m.cyl(0.03, 0.03, 2.4, 4, i % 2 ? 0x8aa04a : 0x7a8a3a, { p: [0.8 + (i % 3) * 0.08, 1.4, -0.4 + Math.floor(i / 3) * 0.08], r: [0, 0, 0.15] });
    for (let i = 0; i < 4; i++) m.cyl(0.04, 0.035, 0.12, 6, 0xc8d870, { p: [-0.1 + i * 0.12, 1.26, -0.95] });
    const sm = signMesh('GANNE KA RAS\nSUGARCANE JUICE', 1.6, 0.6, '#f2c230', '#2a5a2a');
    sm.position.set(0, 2.3, -1.25);
    sm.rotation.y = Math.PI;
    out.extras.push(sm);
    m.box(0.06, 1.6, 0.06, 0x6a4a34, { p: [0, 1.5, -1.2] });
  }
}

registerBuilder('diner', (m, g, site, r, out) => (site.variant?.startsWith('dhaba') ? buildDhaba(m, g, site, r, out) : buildDiner(m, g, site, r, out)));
registerBuilder('stand', (m, g, site, r, out) => (site.variant && /^(tapri|coconut|sugarcane)/.test(site.variant) ? buildTapri(m, g, site, r, out) : buildStand(m, g, site, r, out)));
