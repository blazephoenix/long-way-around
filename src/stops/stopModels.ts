// Stop buildings, styled per biome: timber (forest), coastal, adobe (desert), farm,
// tropical, neon (city). Local space: origin at pad centre, -z faces the road.
import * as THREE from 'three';
import { registerBuilder, signMesh, PropOut } from '../render/props';
import type { ModelBuilder } from '../render/models';
import { beam } from '../render/carKit';
import { stopIndex, type Site } from '../world/sites';
import { cycle, type Rng } from '../world/prng';

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

// Real names: fuel brands and dealer names on the pumps, well-known highway dhabas, highway
// restaurant chains, and the bird-named highway tourist complexes. Each kind walks its list in a
// fixed order along the road (stopIndex). Diners, dhabas and motels share placement cells, so their
// indices skip; with 11-name lists a repeat needs two of a kind exactly 11 cells (~90 km) apart.
export interface FuelBrand { name: string; accent: number; trim: number }
const FUEL_BRANDS: FuelBrand[] = [
  { name: 'IndianOil', accent: 0xe8742a, trim: 0x1d2f6a },
  { name: 'Bharat Petroleum', accent: 0xf2c230, trim: 0x1d4a9a },
  { name: 'HP', accent: 0x1d4aa0, trim: 0xd8302a },
  { name: 'Jio-bp', accent: 0x2a8a4a, trim: 0xf2c230 },
  { name: 'Shell', accent: 0xf2c230, trim: 0xd8302a },
];
const DEALERS = ['Sharma Filling Station', 'Shree Balaji Fuels', 'Guru Nanak Service Station', 'Kisan Seva Kendra', 'Jai Hind Service Station', 'Gill Filling Station', 'Om Sai Petroleum', 'Highway Fuel Point', 'Agarwal Auto Fuels', 'New Punjab Filling Station', 'Lakshmi Petroleum', 'Royal Fuel Centre'];
const DHABAS = ['Amrik Sukhdev Dhaba', 'Gulshan Dhaba', 'Pehalwan Dhaba', 'Puran Singh Ka Vishal Dhaba', 'Kesar Da Dhaba', 'Bharawan Da Dhaba', 'Brothers Dhaba', 'Haveli', 'Sethi Dhaba', 'Garam Dharam Dhaba', 'Sher-e-Punjab Dhaba'];
const DINERS = ["Haldiram's", 'Sagar Ratna', 'Bikanervala', 'A2B Adyar Ananda Bhavan', 'Saravana Bhavan', 'Kamat', 'MTR', 'Highway King', 'Pind Balluchi', "Vasudev Adiga's", 'Moti Mahal'];
const MOTELS = ['Blue Jay Tourist Complex', 'Skylark Tourist Complex', 'Magpie Tourist Complex', 'Kingfisher Tourist Complex', 'Parakeet Tourist Complex', 'Dabchick Tourist Complex', 'Jungle Babbler Tourist Complex', 'Myna Tourist Complex', 'Karna Lake Resort', 'Oasis Tourist Complex', 'Red Bishop Tourist Complex'];

export function fuelBrand(site: Site): FuelBrand {
  return cycle(FUEL_BRANDS, stopIndex(site));
}

export function stopName(site: Site, _r?: Rng): string {
  const i = stopIndex(site);
  if (site.kind === 'gas') return `${cycle(DEALERS, i)} (${fuelBrand(site).name})`;
  if (site.kind === 'diner') return site.variant?.startsWith('dhaba') ? cycle(DHABAS, i) : cycle(DINERS, i);
  if (site.kind === 'motel') return cycle(MOTELS, i);
  if (site.kind === 'stand') return 'Roadside stand';
  if (site.kind === 'overlook') return 'Scenic overlook';
  return 'Toll plaza';
}

/** a name split over two lines for a sign, at the word nearest the middle */
export function signText(name: string): string {
  if (name.length < 14) return name.toUpperCase();
  const words = name.toUpperCase().split(' ');
  let best = 1, bestD = Infinity;
  for (let k = 1; k < words.length; k++) {
    const d = Math.abs(words.slice(0, k).join(' ').length - words.slice(k).join(' ').length);
    if (d < bestD) { bestD = d; best = k; }
  }
  return words.slice(0, best).join(' ') + '\n' + words.slice(best).join(' ');
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
  // a fuel station after the roadside ones: a thin canopy on slim round columns with a painted
  // fascia and lit soffit, tall slim dispensers on a kerbed island with bollards and a rack of red
  // fire buckets, an air pump, a price totem by the road, and the shop with a water tank on its roof
  const brand = fuelBrand(site);
  const st = { ...styleFor(site), accent: brand.accent, trim: brand.trim, sign: '#' + brand.trim.toString(16).padStart(6, '0'), signFg: '#ffffff' };
  const WHITE = 0xeeeae2, DARK = 0x2a2a2a;
  // canopy
  for (const x of [-6, 6]) for (const z of [-7.5, -2.5]) m.cyl(0.2, 0.2, 5.2, 10, WHITE, { p: [x, 2.6, z] });
  m.box(16, 0.35, 8, 0xd8d4cc, { p: [0, 5.35, -5] });
  m.box(16.3, 0.7, 0.12, st.accent, { p: [0, 5.3, -9.05] });
  m.box(16.3, 0.7, 0.12, st.accent, { p: [0, 5.3, -0.95] });
  for (const s of [-1, 1]) m.box(0.12, 0.7, 8.2, st.accent, { p: [s * 8.1, 5.3, -5] });
  m.box(16.32, 0.12, 8.32, st.trim, { p: [0, 5.0, -5] });
  for (const x of [-5, -1.7, 1.7, 5]) for (const z of [-7, -3]) g.box(1.6, 0.04, 0.5, 0xfff4d8, { p: [x, 5.15, z] });
  // island: kerb, dispensers, bollards, fire buckets
  m.box(9, 0.22, 1.6, 0xbab4a8, { p: [0, 0.11, -5] });
  m.box(9.1, 0.06, 1.7, 0xf2c230, { p: [0, 0.03, -5] });
  for (const x of [-2.4, 2.4]) {
    m.box(0.85, 2.0, 0.5, st.accent, { p: [x, 1.22, -5] });
    m.box(0.87, 0.35, 0.52, WHITE, { p: [x, 2.05, -5] });
    m.box(0.6, 0.45, 0.53, DARK, { p: [x, 1.55, -5] });
    g.box(0.5, 0.3, 0.55, 0x9af0b0, { p: [x, 1.6, -5] });
    for (const s of [-1, 1]) {
      m.box(0.08, 0.25, 0.12, DARK, { p: [x + s * 0.47, 1.1, -5] }); // nozzle holsters
      beam(m, [x + s * 0.47, 1.0, -5], [x + s * 0.6, 0.35, -5.3], 0.03, 0.03, 0x1a1a1a); // hoses
    }
  }
  for (const x of [-4.3, 4.3]) {
    m.cyl(0.12, 0.12, 0.8, 8, 0xf2c230, { p: [x, 0.62, -5] });
    m.cyl(0.125, 0.125, 0.15, 8, DARK, { p: [x, 0.7, -5] });
  }
  m.box(1.2, 0.06, 0.25, 0x5a5f66, { p: [0, 1.0, -5.0] });
  for (const x of [-0.45, -0.15, 0.15, 0.45]) {
    m.cyl(0.12, 0.1, 0.25, 8, 0xd8302a, { p: [x, 1.15, -5.0] });
    m.cyl(0.1, 0.1, 0.02, 8, 0xd8c8a0, { p: [x, 1.27, -5.0] });
  }
  for (const s of [-0.5, 0.5]) m.box(0.05, 1.0, 0.05, 0x5a5f66, { p: [s, 0.5, -5.0] });
  // air pump on its post near the exit
  m.box(0.14, 1.1, 0.14, WHITE, { p: [7.4, 0.55, -2] });
  m.box(0.4, 0.5, 0.25, 0x2a5ab8, { p: [7.4, 1.25, -2] });
  m.cyl(0.12, 0.12, 0.04, 10, WHITE, { p: [7.4, 1.3, -2.14], r: [Math.PI / 2, 0, 0] });
  // price totem by the road: name at the top, three price panels below
  m.box(1.5, 6.2, 0.4, st.accent, { p: [-9, 3.1, -12] });
  m.box(1.56, 0.25, 0.46, st.trim, { p: [-9, 6.25, -12] });
  for (let i = 0; i < 3; i++) {
    m.box(1.2, 0.55, 0.02, WHITE, { p: [-9, 3.6 - i * 0.75, -12.21] });
    m.box(0.5, 0.3, 0.025, 0x1a1a1a, { p: [-8.8, 3.6 - i * 0.75, -12.215] });
    g.box(0.44, 0.2, 0.03, 0xff6a3a, { p: [-8.8, 3.6 - i * 0.75, -12.22] });
  }
  addSign(out, signText(cycle(DEALERS, stopIndex(site))), st, 1.4, 1.1, -9, 5.1, -12.25);
  addSign(out, brand.name.toUpperCase(), { ...st, sign: '#' + brand.accent.toString(16).padStart(6, '0'), signFg: '#' + brand.trim.toString(16).padStart(6, '0') }, 1.4, 0.5, -9, 6.0, -12.25);
  for (const z of [-9.13, -0.87]) {
    const fb = signMesh(brand.name.toUpperCase(), 4, 0.6, '#' + brand.accent.toString(16).padStart(6, '0'), '#ffffff');
    fb.position.set(0, 5.3, z);
    if (z < -5) fb.rotation.y = Math.PI;
    out.extras.push(fb);
  }
  // shop with kiosk window, a rooftop water tank and ladder
  m.box(11, 3.6, 6, st.wall, { p: [3, 1.8, 9] });
  m.box(11.6, 0.4, 6.6, st.roof, { p: [3, 3.8, 9] });
  m.box(2.2, 2.4, 0.12, 0x3a2a20, { p: [0, 1.2, 5.95] });
  g.box(3, 1.4, 0.1, 0xffe2a0, { p: [4.5, 1.8, 5.95] });
  g.box(1.6, 1.2, 0.1, 0xffe2a0, { p: [7.5, 1.9, 5.95] });
  m.box(1.4, 1.2, 0.5, 0xd8d0c0, { p: [7.5, 0.6, 5.6] }); // photo kiosk
  m.cyl(0.55, 0.55, 1.0, 12, 0x1e1e1e, { p: [6.5, 4.5, 10] });
  for (const s of [-0.22, 0.22]) m.box(0.05, 4.2, 0.05, 0x8a8e92, { p: [8.8 + s, 2.1, 12.1] });
  for (let i = 0; i < 9; i++) m.box(0.44, 0.04, 0.05, 0x8a8e92, { p: [8.8, 0.4 + i * 0.45, 12.1] });
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
  addSign(out, signText(stopName(site, r)), st, 6, 1.6, 0, 5.4, 2.0);
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
  addSign(out, signText(stopName(site, r)), st, 4.2, 2, 10, 7, -10.05);
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
