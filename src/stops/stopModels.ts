// Stop buildings, styled per biome: timber (forest), coastal, adobe (desert), farm,
// tropical, neon (city). Local space: origin at pad centre, -z faces the road.
import * as THREE from 'three';
import { registerBuilder, signMesh, PropOut } from '../render/props';
import type { ModelBuilder } from '../render/models';
import type { Site } from '../world/sites';
import type { Rng } from '../world/prng';

export interface StopStyle {
  wall: number;
  trim: number;
  roof: number;
  accent: number;
  sign: string;
  signFg: string;
}

export const STYLES: Record<string, StopStyle> = {
  timber: { wall: 0x8a5a3a, trim: 0x5a3a26, roof: 0x3f5a46, accent: 0xe8b04a, sign: '#2f4a3a', signFg: '#f2ead2' },
  coastal: { wall: 0xe8eef0, trim: 0x3a7aa0, roof: 0x3a7aa0, accent: 0xf2c230, sign: '#3a7aa0', signFg: '#ffffff' },
  adobe: { wall: 0xd9a77a, trim: 0x9a5a3a, roof: 0xb8764a, accent: 0x3aa0a0, sign: '#9a4a2a', signFg: '#f7e8c8' },
  farm: { wall: 0xf0e6cc, trim: 0x6a8a4a, roof: 0x8a4a3a, accent: 0xe8a03a, sign: '#4f7a3a', signFg: '#fff6e0' },
  tropical: { wall: 0xf2e0b8, trim: 0x2f7a5a, roof: 0x9a4a30, accent: 0xe8742a, sign: '#2f7a5a', signFg: '#fff6e0' },
  neon: { wall: 0x3a4250, trim: 0x22262e, roof: 0x2a2e36, accent: 0xff4fa0, sign: '#1a1d24', signFg: '#7ff0ff' },
};
const STYLE_OF: Record<string, string> = { forest: 'timber', coast: 'coastal', desert: 'adobe', farm: 'farm', tropical: 'tropical', city: 'neon' };
export function styleFor(site: Site): StopStyle {
  return STYLES[STYLE_OF[site.biome] ?? 'farm'];
}

/** Names are invented. */
const GAS_NAMES = ['Milestone Fuels', 'Bend in the Road', 'Kilometre Zero Fuel', 'Long Haul Pumps', 'Sunrise Filling Station', 'Halfway Fuels', 'Blue Hill Petrol', 'Two Lanes Fuel'];
const DINER_NAMES = ['Night Owl Diner', 'The Slow Spoon', 'Roadside Kitchen', 'Hot Plate Diner', 'Lantern Café', 'The Long Table'];
const MOTEL_NAMES = ['Rest Easy Motel', 'Stay a While Inn', 'The Quiet Lodge', 'Sleepy Mile Motel', 'Half Moon Rooms'];

export function stopName(site: Site, r: Rng): string {
  if (site.kind === 'gas') return r.pick(GAS_NAMES);
  if (site.kind === 'diner') return r.pick(DINER_NAMES);
  if (site.kind === 'motel') return r.pick(MOTEL_NAMES);
  if (site.kind === 'stand') return 'Roadside stand';
  if (site.kind === 'overlook') return 'Scenic overlook';
  return 'Toll plaza';
}

function addSign(out: PropOut, text: string, st: StopStyle, w: number, h: number, x: number, y: number, z: number, glow = false) {
  const s = signMesh(text, w, h, st.sign, st.signFg);
  s.position.set(x, y, z);
  s.rotation.y = Math.PI;
  if (glow) (s.material as THREE.MeshToonMaterial).emissive?.setHex(0x333333);
  out.extras.push(s);
  const s2 = signMesh(text, w, h, st.sign, st.signFg);
  s2.position.set(x, y, z + 0.08);
  out.extras.push(s2);
}

export function buildGas(m: ModelBuilder, g: ModelBuilder, site: Site, r: Rng, out: PropOut) {
  const st = styleFor(site);
  // canopy over the pump island
  for (const x of [-6, 6]) m.box(0.5, 4.6, 0.5, st.trim, { p: [x, 2.3, -5] });
  m.box(16, 0.7, 7, st.roof, { p: [0, 4.9, -5] });
  m.box(16.2, 0.3, 7.2, st.accent, { p: [0, 4.45, -5] });
  g.box(14, 0.08, 5, 0xfff4d8, { p: [0, 4.28, -5] });
  // island + pumps
  m.box(9, 0.25, 1.6, 0xbab4a8, { p: [0, 0.12, -5] });
  for (const x of [-2.4, 2.4]) {
    m.box(0.9, 1.7, 0.6, st.accent, { p: [x, 1.1, -5] });
    m.box(0.7, 0.5, 0.62, 0x2a2a2a, { p: [x, 1.5, -5] });
    g.box(0.5, 0.3, 0.64, 0x9af0b0, { p: [x, 1.5, -5] });
    m.cyl(0.05, 0.05, 1.2, 4, 0x1a1a1a, { p: [x + 0.5, 1.0, -5], r: [0, 0, 0.3] });
  }
  // shop with kiosk window
  m.box(11, 3.6, 6, st.wall, { p: [3, 1.8, 9] });
  m.box(11.6, 0.4, 6.6, st.roof, { p: [3, 3.8, 9] });
  m.box(2.2, 2.4, 0.12, 0x3a2a20, { p: [0, 1.2, 5.95] });
  g.box(3, 1.4, 0.1, 0xffe2a0, { p: [4.5, 1.8, 5.95] });
  g.box(1.6, 1.2, 0.1, 0xffe2a0, { p: [7.5, 1.9, 5.95] });
  m.box(1.4, 1.2, 0.5, 0xd8d0c0, { p: [7.5, 0.6, 5.6] }); // photo kiosk
  // tall price sign by the road
  m.box(0.35, 7, 0.35, 0x5a5f66, { p: [-9, 3.5, -12] });
  addSign(out, stopName(site, r), st, 4.2, 1.5, -9, 7.4, -12.05);
  addSign(out, 'FUEL · FILM · PHOTO\nDEVELOPING', st, 3.2, 1.2, 3, 4.6, 5.9 - 0.06);
}

export function buildDiner(m: ModelBuilder, g: ModelBuilder, site: Site, r: Rng, out: PropOut) {
  const st = styleFor(site);
  m.box(14, 3.8, 8, st.wall, { p: [0, 1.9, 6] });
  m.box(14.6, 0.5, 8.6, st.roof, { p: [0, 4.0, 6] });
  for (let i = 0; i < 5; i++) g.box(2, 1.4, 0.1, 0xffdca0, { p: [-5 + i * 2.5, 2.0, 1.95] });
  m.box(1.4, 2.4, 0.12, st.trim, { p: [5.8, 1.2, 1.95] });
  m.box(14.2, 0.35, 1.4, st.accent, { p: [0, 3.2, 1.3], r: [-0.25, 0, 0] });
  for (const x of [-4, 0, 4]) {
    m.cyl(0.6, 0.6, 0.08, 10, 0xe8e0cc, { p: [x, 0.8, -3] });
    m.cyl(0.06, 0.06, 0.8, 5, 0x5a5f66, { p: [x, 0.4, -3] });
  }
  addSign(out, stopName(site, r), st, 6, 1.6, 0, 5.4, 2.0);
}

export function buildMotel(m: ModelBuilder, g: ModelBuilder, site: Site, r: Rng, out: PropOut) {
  const st = styleFor(site);
  m.box(22, 3.2, 6, st.wall, { p: [0, 1.6, 9] });
  m.box(22.8, 0.35, 8, st.roof, { p: [0, 3.35, 8.3] });
  for (let i = 0; i < 7; i++) {
    m.box(1, 2.1, 0.12, st.trim, { p: [-9 + i * 3, 1.05, 5.95] });
    g.box(1.1, 0.9, 0.1, r.chance(0.6) ? 0xffd890 : 0x404850, { p: [-7.6 + i * 3, 1.8, 5.95] });
  }
  m.box(5, 3.4, 5, st.wall, { p: [-13, 1.7, 2] }); // office
  g.box(2.4, 1.2, 0.1, 0xffe2a0, { p: [-13, 1.9, -0.55] });
  m.box(0.35, 6.5, 0.35, 0x5a5f66, { p: [10, 3.25, -10] });
  addSign(out, stopName(site, r) + '\nVACANCY', st, 4.2, 2, 10, 7, -10.05);
}

export function buildOverlook(m: ModelBuilder, _g: ModelBuilder, site: Site, _r: Rng, out: PropOut) {
  // the view is away from the road (+z); railing along the far edge
  for (let i = -4; i <= 4; i++) m.box(0.14, 1.0, 0.14, 0x6a4a34, { p: [i * 2.2, 0.5, 6.5] });
  m.box(18, 0.12, 0.12, 0x8a6448, { p: [0, 1.0, 6.5] });
  m.box(18, 0.1, 0.1, 0x8a6448, { p: [0, 0.6, 6.5] });
  for (const x of [-4, 4]) {
    m.box(2, 0.1, 0.5, 0x8a6448, { p: [x, 0.5, 4.5] });
    m.box(2, 0.45, 0.08, 0x8a6448, { p: [x, 0.78, 4.2] });
    m.box(0.1, 0.5, 0.5, 0x6a4a34, { p: [x - 0.9, 0.25, 4.5] });
    m.box(0.1, 0.5, 0.5, 0x6a4a34, { p: [x + 0.9, 0.25, 4.5] });
  }
  m.box(0.14, 1.4, 0.14, 0x6a4a34, { p: [8, 0.7, 3] });
  const st = styleFor(site);
  const s = signMesh('SCENIC\nOVERLOOK', 1.6, 0.9, '#3a6a4a', '#f2ead2');
  s.position.set(8, 1.7, 2.92);
  s.rotation.y = Math.PI;
  out.extras.push(s);
  void st;
}

export function buildStand(m: ModelBuilder, g: ModelBuilder, site: Site, r: Rng, out: PropOut) {
  const st = styleFor(site);
  for (const [x, z] of [[-2, -1], [2, -1], [-2, 1.5], [2, 1.5]]) m.box(0.15, 2.6, 0.15, 0x6a4a34, { p: [x, 1.3, z] });
  m.box(5, 0.12, 3.4, r.pick([0xd9573a, 0x3a7a6a, 0xe8a03a, 0x3a5a9a]), { p: [0, 2.7, 0.2], r: [0.12, 0, 0] });
  m.box(4.2, 1.0, 0.8, 0x8a6448, { p: [0, 0.5, -1] });
  for (let i = 0; i < 6; i++) m.box(0.6, 0.35, 0.5, i % 2 ? 0xe8742a : 0x7fae4a, { p: [-1.6 + i * 0.64, 1.2, -1] });
  g.sphere(0.12, 6, 4, 0xffd890, { p: [0, 2.4, -0.6] });
  addSign(out, 'ROADSIDE\nSTAND', st, 1.8, 0.8, -3.6, 1.4, -2.2);
  m.box(0.1, 1.2, 0.1, 0x6a4a34, { p: [-3.6, 0.6, -2.15] });
}

registerBuilder('gas', buildGas);
registerBuilder('diner', buildDiner);
registerBuilder('motel', buildMotel);
registerBuilder('overlook', buildOverlook);
registerBuilder('stand', buildStand);
