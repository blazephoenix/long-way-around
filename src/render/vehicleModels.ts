// Traffic vehicles. Vehicle-local: y = 0 is the road, -z forward, x across. Each model is two
// merged geometries: the body (vertex colours) and the lamps (glow material: dark glass by day,
// lit at night), so a vehicle stays at two draw calls plus any sign it carries.
import * as THREE from 'three';
import { ModelBuilder } from './models';
import { signMesh } from './props';
import { arc, arch, beam, Greenhouse, loft, profile, section, skin, wheel, type Cabin, type P2, type P3 } from './carKit';

export type VehicleKind = 'car' | 'hatch' | 'van' | 'truck' | 'bus' | 'tractor' | 'auto' | 'painted';

export interface VehicleModel {
  body: THREE.BufferGeometry;
  lamps: THREE.BufferGeometry;
  length: number;
  width: number;
  speed: [number, number]; // km/h
}

const CAR_COLS = [0xd8d4cc, 0x8a2a2a, 0x2a4a6a, 0x3a3a3a, 0x9aa4ac, 0xe8e2d0, 0x4a6a4a, 0xc89a3a, 0x6a8ab0, 0xf2f2ee];
const GLASS = 0x2c3e50, DARK = 0x2a2a2a, CHROME = 0xbfbab0, RUBBER = 0x1e1e1e;
const HEAD = 0xfff4d0, TAIL = 0xff3a2a, AMBER = 0xf2a030, WINDOW_LIT = 0xffe6a0;

export function vehicleModel(kind: VehicleKind, seed: number): VehicleModel {
  const m = new ModelBuilder();
  const L = new ModelBuilder();
  const col = CAR_COLS[seed % CAR_COLS.length];
  switch (kind) {
    case 'car': return sedan(m, L, col);
    case 'hatch': return hatch(m, L, col);
    case 'van': return van(m, L, col);
    case 'truck':
    case 'painted': return truck(m, L, seed, kind === 'painted');
    case 'bus': return bus(m, L, seed);
    case 'tractor': return tractor(m, L, seed);
    case 'auto': return auto(m, L, seed);
  }
}

/** shared car body: side profile with arches, greenhouse with glass, bumpers, grille and lamps */
function carBody(m: ModelBuilder, L: ModelBuilder, col: number, o: {
  len: number; width: number; sill: number; wheelR: number; wheelZ: [number, number];
  hood: P2[]; tail: P2[]; cabin: Cabin; pillars: number[]; gaps?: { a: number[]; c: number[] };
  head: [number, number, number]; tailLamp: [number, number, number, number];
}) {
  const { len, width, sill, wheelR } = o;
  const zf = -len / 2, zr = len / 2;
  const ar = wheelR + 0.07;
  profile(m, [[zf + 0.05, sill], ...arch(o.wheelZ[0], sill, wheelR, ar), ...arch(o.wheelZ[1], sill, wheelR, ar), [zr - 0.05, sill], ...o.tail, ...o.hood], width, col);
  const gh = new Greenhouse(o.cabin);
  gh.shell(m, col);
  gh.frontRearGlass(m, GLASS);
  gh.sideGlass(m, GLASS, o.pillars, o.gaps);
  const hw = width / 2;
  for (const z of [zf - 0.03, zr + 0.03]) m.box(width + 0.04, 0.18, 0.12, DARK, { p: [0, sill + 0.14, z] });
  m.box(width * 0.45, 0.14, 0.03, DARK, { p: [0, o.head[1], zf - 0.005] });
  m.box(0.5, 0.12, 0.02, 0xf2f2ee, { p: [0, sill + 0.14, zf - 0.1] });
  m.box(0.5, 0.12, 0.02, 0xf2f2ee, { p: [0, sill + 0.36, zr + 0.005] });
  for (const sd of [-1, 1]) {
    m.box(0.14, 0.08, 0.06, DARK, { p: [sd * (o.cabin.hb + 0.08), o.cabin.belt + 0.06, o.cabin.wsBase + 0.1] });
    for (const z of o.pillars) m.box(0.015, 0.025, 0.1, CHROME, { p: [sd * (hw + 0.004), o.cabin.belt - 0.14, z - 0.22] });
    const [hx, hy, hwid] = o.head;
    L.box(hwid, 0.11, 0.04, HEAD, { p: [sd * hx, hy, zf - 0.005] });
    L.box(0.06, 0.05, 0.04, AMBER, { p: [sd * (hx + hwid / 2 + 0.04), hy, zf - 0.005] });
    const [tx, ty, tw, th] = o.tailLamp;
    L.box(tw, th, 0.04, TAIL, { p: [sd * tx, ty, zr + 0.005] });
  }
  for (const z of o.wheelZ) for (const sd of [-1, 1]) wheel(m, sd * (hw - 0.12), wheelR, z, wheelR, 0.2);
}

function sedan(m: ModelBuilder, L: ModelBuilder, col: number): VehicleModel {
  carBody(m, L, col, {
    len: 4.3, width: 1.72, sill: 0.22, wheelR: 0.31, wheelZ: [-1.3, 1.3],
    tail: [[2.15, 0.36], [2.15, 0.7], [2.08, 0.85], [1.8, 0.9]],
    hood: [[-0.75, 0.92], [-1.6, 0.88], [-2.05, 0.8], [-2.15, 0.66], [-2.15, 0.36]],
    cabin: { belt: 0.92, roof: 1.42, wsBase: -0.75, wsTop: -0.18, rwTop: 0.95, rwBase: 1.42, hb: 0.84, hr: 0.7 },
    pillars: [0.35], head: [0.58, 0.66, 0.32], tailLamp: [0.6, 0.74, 0.34, 0.12],
  });
  return { body: m.build(), lamps: L.build(), length: 4.3, width: 1.8, speed: [55, 85] };
}

function hatch(m: ModelBuilder, L: ModelBuilder, col: number): VehicleModel {
  carBody(m, L, col, {
    len: 3.7, width: 1.66, sill: 0.22, wheelR: 0.29, wheelZ: [-1.18, 1.15],
    tail: [[1.85, 0.36], [1.85, 0.84]],
    hood: [[-0.98, 0.9], [-1.5, 0.84], [-1.8, 0.74], [-1.85, 0.6], [-1.85, 0.36]],
    cabin: { belt: 0.9, roof: 1.5, wsBase: -0.98, wsTop: -0.3, rwTop: 1.5, rwBase: 1.8, hb: 0.81, hr: 0.7 },
    pillars: [0.15], gaps: { a: [0.1, 0.08], c: [0.22, 0.14] }, head: [0.55, 0.66, 0.3], tailLamp: [0.66, 0.82, 0.13, 0.26],
  });
  return { body: m.build(), lamps: L.build(), length: 3.7, width: 1.8, speed: [55, 85] };
}

function van(m: ModelBuilder, L: ModelBuilder, col: number): VehicleModel {
  carBody(m, L, col, {
    len: 4.8, width: 1.9, sill: 0.28, wheelR: 0.34, wheelZ: [-1.55, 1.6],
    tail: [[2.4, 0.42], [2.4, 1.15]],
    hood: [[-1.6, 1.15], [-2.22, 1.02], [-2.4, 0.86], [-2.4, 0.42]],
    cabin: { belt: 1.15, roof: 2.05, wsBase: -1.6, wsTop: -1.12, rwTop: 2.34, rwBase: 2.4, hb: 0.95, hr: 0.88 },
    pillars: [-0.55, 0.65], gaps: { a: [0.12, 0.1], c: [0.16, 0.12] }, head: [0.66, 0.8, 0.32], tailLamp: [0.8, 0.95, 0.16, 0.34],
  });
  // roof rails and the sliding door's runner
  for (const sd of [-1, 1]) beam(m, [sd * 0.7, 2.08, -0.9], [sd * 0.7, 2.08, 2.1], 0.04, 0.04, DARK);
  m.box(0.01, 0.03, 1.4, DARK, { p: [-0.955, 1.05, 0.1] });
  return { body: m.build(), lamps: L.build(), length: 4.8, width: 1.9, speed: [50, 75] };
}

function truck(m: ModelBuilder, L: ModelBuilder, seed: number, painted: boolean): VehicleModel {
  const cab = painted ? [0xe8a03a, 0x2a8a5a, 0xd8442a, 0x2a5ab8][seed % 4] : [0xd8d4cc, 0x3a6a8a, 0x8a3a2a][seed % 3];
  const deck = painted ? 0xd8b04a : 0x8a7a5a;
  const plank = painted ? 0xb88a2a : 0x6a5a42;
  const tarp = [0x2f5a8a, 0x8a3a2a, 0xb8a070, 0x3a6a4a][seed % 4];
  const BRIGHT = [0xd8442a, 0x2a8a5a, 0x2a5ab8, 0xf2c230, 0xf2f2ee];
  // chassis rails, fuel tank, wheels (front single, rear tandem)
  for (const sx of [-0.5, 0.5]) m.box(0.12, 0.2, 7.4, 0x222222, { p: [sx, 0.78, -0.2] });
  m.box(0.5, 0.42, 0.9, 0x5a5a5a, { p: [-0.95, 0.75, -1.3] });
  wheel(m, -1.0, 0.48, -3.0, 0.48, 0.3);
  wheel(m, 1.0, 0.48, -3.0, 0.48, 0.3);
  for (const z of [1.7, 2.7]) for (const sd of [-1, 1]) wheel(m, sd * 0.98, 0.48, z, 0.48, 0.42);
  // cab: side profile with a front wheel arch and a slightly raked split windshield
  const wsAt = (t: number): [number, number] => [-3.9 + 0.15 * t, 1.65 + 0.9 * t];
  profile(m, [[-4.0, 0.85], ...arch(-3.0, 0.85, 0.48, 0.6), [-2.0, 0.85], [-2.0, 2.7], [-3.6, 2.7], wsAt(1), wsAt(0), [-4.0, 1.6]], 2.3, cab);
  for (const [x0, x1] of [[-1.02, -0.04], [0.04, 1.02]]) {
    const [za, ya] = wsAt(0.08), [zb, yb] = wsAt(0.92);
    skin(m, [[x0, ya, za - 0.006], [x1, ya, za - 0.006], [x1, yb, zb - 0.006], [x0, yb, zb - 0.006]], GLASS, [0, 1.8, -3]);
  }
  for (const sd of [-1, 1]) {
    skin(m, [[sd * 1.152, 1.7, -3.65], [sd * 1.152, 2.45, -3.6], [sd * 1.152, 2.45, -2.75], [sd * 1.152, 1.7, -2.75]], GLASS, [0, 1.8, -3]);
    m.box(0.01, 0.9, 0.02, DARK, { p: [sd * 1.152, 1.25, -2.65] });
    beam(m, [sd * 1.15, 2.3, -3.7], [sd * 1.38, 2.3, -3.75], 0.03, 0.03, DARK);
    m.box(0.06, 0.32, 0.18, DARK, { p: [sd * 1.4, 2.2, -3.75] });
    m.box(0.12, 0.06, 0.5, DARK, { p: [sd * 1.0, 0.95, -2.3] }); // step
  }
  // grille with chrome bars, bumper
  m.box(1.3, 0.48, 0.03, 0x1e1e1e, { p: [0, 1.22, -4.01] });
  for (let i = 0; i < 5; i++) m.box(1.26, 0.03, 0.02, CHROME, { p: [0, 1.04 + i * 0.09, -4.03] });
  m.box(2.36, 0.24, 0.16, painted ? 0xd8442a : DARK, { p: [0, 0.8, -4.05] });
  // name board above the windshield, leaning forward; goods carriers paint theirs and add a row of bulbs
  m.box(2.3, 0.42, 0.06, painted ? 0xf2f2ee : 0xe8e2d0, { p: [0, 2.92, -3.68], r: [-0.28, 0, 0] });
  if (painted) {
    for (const [sx, c] of [[-0.6, 0xd8442a], [0.6, 0x2a5ab8]] as const) m.box(0.75, 0.2, 0.02, c, { p: [sx, 2.92, -3.72], r: [-0.28, 0, 0] });
    m.cyl(0.14, 0.14, 0.03, 12, 0xf2c230, { p: [0, 2.92, -3.72], r: [Math.PI / 2 - 0.28, 0, 0] });
    for (let i = 0; i < 9; i++) m.sphere(0.045, 6, 4, BRIGHT[i % 5], { p: [-1.05 + i * 0.26, 3.15, -3.74] });
    m.box(2.34, 0.15, 2.04, 0xd8442a, { p: [0, 1.0, -3.0] }); // painted skirt band
  } else {
    m.box(1.4, 0.18, 0.02, 0x2a4a6a, { p: [0, 2.92, -3.71], r: [-0.28, 0, 0] });
  }
  // cargo body: deck, high plank sides open at the top, a loft over the cab, tarp over the load
  m.box(2.4, 0.12, 5.6, deck, { p: [0, 1.0, 0.85] });
  for (const sd of [-1, 1]) {
    m.box(0.06, 1.6, 5.6, deck, { p: [sd * 1.17, 1.85, 0.85] });
    for (let i = 0; i < 5; i++) m.box(0.012, 0.03, 5.6, plank, { p: [sd * 1.205, 1.2 + i * 0.32, 0.85] });
    for (const z of [-1.9, -0.5, 0.85, 2.2, 3.6]) m.box(0.03, 1.62, 0.1, plank, { p: [sd * 1.2, 1.85, z] });
    m.box(0.4, 0.5, 0.02, 0x1a1a1a, { p: [sd * 0.98, 0.42, 3.25] }); // mudflaps
  }
  m.box(2.4, 1.95, 0.08, deck, { p: [0, 2.02, -1.9] });
  m.box(2.4, 0.38, 1.2, deck, { p: [0, 2.9, -2.45] }); // loft over the cab
  section(m, [...arc(0, 2.6, 1.12, 0, Math.PI, 12).map(([x, y]): P2 => [x, 2.6 + (y - 2.6) * 0.3])], -1.82, 3.5, tarp);
  for (const z of [-0.6, 0.9, 2.4]) section(m, [...arc(0, 2.6, 1.13, 0, Math.PI, 12).map(([x, y]): P2 => [x, 2.6 + (y - 2.6) * 0.3 + 0.01])], z, z + 0.03, 0x3a3020);
  // tailgate: ribbed panels (goods carriers paint dots and bands on them)
  m.box(2.4, 1.6, 0.06, deck, { p: [0, 1.85, 3.6] });
  for (let i = 0; i < 5; i++) m.box(0.06, 1.6, 0.03, plank, { p: [-0.96 + i * 0.48, 1.85, 3.645] });
  m.box(2.4, 0.06, 0.03, plank, { p: [0, 1.62, 3.645] });
  if (painted) {
    for (let i = 0; i < 4; i++) for (const y of [2.05, 2.3]) m.cyl(0.07, 0.07, 0.02, 10, BRIGHT[(i + (y > 2.1 ? 1 : 0)) % 5], { p: [-0.72 + i * 0.48, y, 3.65], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 4; i++) m.box(0.36, 0.05, 0.02, BRIGHT[(i + 2) % 5], { p: [-0.72 + i * 0.48, 1.4, 3.65] });
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) m.box(0.014, 0.12, 5.6, [0xd8442a, 0x2a8a5a, 0x2a5ab8, 0xf2f2ee][i], { p: [sd * 1.21, 1.1 + i * 0.4, 0.85] });
  }
  // rear crossmember (the slogan strip goes here), under-ride bar, tassels and a black charm
  m.box(2.3, 0.34, 0.06, painted ? 0x8ac0d8 : DARK, { p: [0, 0.8, 3.6] });
  m.box(2.2, 0.1, 0.1, DARK, { p: [0, 0.42, 3.62] });
  for (const sd of [-1, 1]) m.box(0.08, 0.36, 0.06, DARK, { p: [sd * 0.7, 0.58, 3.6] });
  if (painted) {
    for (let i = 0; i < 9; i++) m.cyl(0.02, 0.04, 0.3, 4, [0xd8442a, 0xf2c230, 0x2a8a5a][i % 3], { p: [-1.0 + i * 0.25, 0.22, 3.64] });
    m.cyl(0.004, 0.004, 0.3, 3, 0x1a1a1a, { p: [0.9, 0.22, 3.67] });
    m.box(0.08, 0.12, 0.02, 0x1a1a1a, { p: [0.9, 0.04, 3.67] });
  }
  for (const sd of [-1, 1]) {
    L.cyl(0.11, 0.11, 0.04, 12, HEAD, { p: [sd * 0.85, 0.82, -4.14], r: [Math.PI / 2, 0, 0] });
    L.box(0.12, 0.08, 0.04, AMBER, { p: [sd * 1.05, 1.0, -4.02] });
    L.box(0.24, 0.18, 0.04, TAIL, { p: [sd * 0.98, 0.8, 3.65] });
  }
  return { body: m.build(), lamps: L.build(), length: 8, width: 2.4, speed: [45, 65] };
}

function bus(m: ModelBuilder, L: ModelBuilder, seed: number): VehicleModel {
  const c = [0x3a7ab0, 0xd8442a, 0x2a8a6a, 0xe8a03a][seed % 4];
  const zf = -5.25, zr = 5.25, hw = 1.25, sill = 0.38;
  // side profile with wheel arches, then a roof section with rounded shoulders
  profile(m, [[zf, sill], ...arch(-3.4, sill, 0.5, 0.6), ...arch(3.5, sill, 0.5, 0.6), [zr, sill], [zr, 2.85], [zf, 2.85]], 2 * hw, c);
  section(m, [...arc(hw - 0.3, 2.85, 0.3, 0, Math.PI / 2, 4), ...arc(-hw + 0.3, 2.85, 0.3, Math.PI / 2, Math.PI, 4)], zf, zr, c);
  // livery: white band and a darker skirt stripe
  for (const sd of [-1, 1]) {
    m.box(0.012, 0.22, 10.5, 0xf2f2ee, { p: [sd * (hw + 0.004), 1.45, 0] });
    m.box(0.012, 0.08, 10.5, 0x2a2a2a, { p: [sd * (hw + 0.004), 0.62, 0] });
    // window bays: lit panes between pillars (the left side has the door near the front)
    for (let i = 0; i < 9; i++) {
      const z0 = -3.9 + i * 1.02, z1 = z0 + 0.9;
      if (z1 > 4.9) break;
      skin(L, [[sd * (hw + 0.006), 1.72, z0], [sd * (hw + 0.006), 1.72, z1], [sd * (hw + 0.006), 2.62, z1], [sd * (hw + 0.006), 2.62, z0]], WINDOW_LIT, [0, 1.8, 0]);
    }
  }
  // front door on the left (kerb side for traffic keeping left)
  m.box(0.014, 2.0, 0.85, 0x2a2a2a, { p: [-(hw + 0.006), 1.42, -4.55] });
  skin(L, [[-(hw + 0.014), 1.72, -4.92], [-(hw + 0.014), 1.72, -4.18], [-(hw + 0.014), 2.62, -4.18], [-(hw + 0.014), 2.62, -4.92]], WINDOW_LIT, [0, 1.8, 0]);
  // front: split windshield, destination board, grille, bumper; rear window
  for (const [x0, x1] of [[-1.1, -0.04], [0.04, 1.1]]) skin(m, [[x0, 1.45, zf - 0.006], [x1, 1.45, zf - 0.006], [x1, 2.6, zf - 0.006], [x0, 2.6, zf - 0.006]], GLASS, [0, 1.8, 0]);
  m.box(1.6, 0.28, 0.04, 0x1a1a1a, { p: [0, 2.85, zf - 0.02] });
  L.box(1.4, 0.18, 0.02, AMBER, { p: [0, 2.85, zf - 0.045] });
  m.box(1.2, 0.3, 0.03, 0x1e1e1e, { p: [0, 0.95, zf - 0.01] });
  for (const z of [zf - 0.06, zr + 0.06]) m.box(2.52, 0.24, 0.12, DARK, { p: [0, 0.5, z] });
  skin(L, [[-1.0, 1.75, zr + 0.006], [1.0, 1.75, zr + 0.006], [1.0, 2.6, zr + 0.006], [-1.0, 2.6, zr + 0.006]], WINDOW_LIT, [0, 1.8, 0]);
  for (const sd of [-1, 1]) {
    beam(m, [sd * 1.25, 2.3, -5.1], [sd * 1.45, 2.3, -5.35], 0.04, 0.04, DARK);
    m.box(0.06, 0.4, 0.16, DARK, { p: [sd * 1.47, 2.1, -5.35] });
    L.cyl(0.1, 0.1, 0.04, 12, HEAD, { p: [sd * 0.9, 0.9, zf - 0.02], r: [Math.PI / 2, 0, 0] });
    L.box(0.25, 0.2, 0.05, TAIL, { p: [sd * 0.95, 0.9, zr + 0.02] });
  }
  // roof carrier over the rear half
  for (const sd of [-1, 1]) beam(m, [sd * 0.9, 3.2, 0.5], [sd * 0.9, 3.2, 4.8], 0.04, 0.04, DARK);
  for (let z = 0.6; z < 4.8; z += 0.7) m.box(1.84, 0.03, 0.04, DARK, { p: [0, 3.22, z] });
  for (const z of [-3.4, 3.5]) for (const sd of [-1, 1]) wheel(m, sd * 1.06, 0.5, z, 0.5, 0.3);
  return { body: m.build(), lamps: L.build(), length: 10.5, width: 2.5, speed: [40, 60] };
}

function tractor(m: ModelBuilder, L: ModelBuilder, seed: number): VehicleModel {
  const red = [0xc8402a, 0x2a5ab8, 0xd86a2a][seed % 3];
  // narrow hood over the engine block, grille, front axle
  profile(m, [[-1.75, 0.8], [-0.3, 0.8], [-0.3, 1.58], [-1.55, 1.52], [-1.75, 1.42]], 0.78, red);
  m.box(0.66, 0.44, 0.02, 0x1e1e1e, { p: [0, 1.15, -1.76] });
  for (let i = 0; i < 4; i++) m.box(0.6, 0.025, 0.02, 0x9a9a9a, { p: [0, 0.98 + i * 0.11, -1.775] });
  m.box(0.6, 0.45, 1.2, 0x3a3a3a, { p: [0, 0.75, -0.9] });
  m.box(1.4, 0.1, 0.12, 0x2a2a2a, { p: [0, 0.42, -1.3] });
  m.cyl(0.04, 0.05, 0.9, 6, 0x1e1e1e, { p: [0.3, 1.95, -1.2] });
  // dash and steering column rising from the back of the hood
  m.box(0.62, 0.5, 0.2, 0x3a3a3a, { p: [0, 1.25, -0.2] });
  beam(m, [0, 1.4, -0.12], [0, 1.85, 0.12], 0.05, 0.05, 0x2a2a2a);
  m.torus(0.17, 0.02, 6, 16, 0x1e1e1e, { p: [0, 1.87, 0.14], r: [-1.1, 0, 0] });
  // transmission housing; the seat sits on a sprung post on top of it, between the rear fenders
  m.box(0.72, 0.8, 1.1, 0x3a3a3a, { p: [0, 0.88, 0.45] });
  m.cyl(0.05, 0.05, 0.22, 8, 0x2a2a2a, { p: [0, 1.39, 0.62] });
  m.box(0.5, 0.09, 0.46, 0x1e1e1e, { p: [0, 1.53, 0.62] });
  m.box(0.5, 0.36, 0.08, 0x1e1e1e, { p: [0, 1.74, 0.86], r: [-0.2, 0, 0] });
  for (const sd of [-1, 1]) {
    wheel(m, sd * 0.72, 0.42, -1.3, 0.42, 0.24, 0xd8d0b0, 12);
    wheel(m, sd * 0.86, 0.78, 0.6, 0.78, 0.42, 0xd8d0b0, 16);
    // fender: an arched band over the tyre with a flat top, joined to the housing by a footboard
    profile(m, [...arc(0.6, 0.78, 0.88, Math.PI * 0.95, Math.PI * 0.05, 10), ...arc(0.6, 0.78, 0.83, Math.PI * 0.05, Math.PI * 0.95, 10)], 0.52, red, sd * 0.86);
    m.box(0.52, 0.04, 0.7, red, { p: [sd * 0.86, 1.64, 0.6] });
    m.box(0.36, 0.04, 0.9, 0x2a2a2a, { p: [sd * 0.5, 0.95, -0.05] });
  }
  // trolley: drawbar, plank bed on one axle, a rounded heap of hay
  beam(m, [0, 0.6, 1.1], [0, 0.6, 1.75], 0.08, 0.08, 0x2a2a2a);
  m.box(2.0, 0.12, 2.9, 0x8a6448, { p: [0, 0.85, 3.2] });
  for (const sd of [-1, 1]) m.box(0.05, 0.5, 2.9, 0x8a6448, { p: [sd * 0.98, 1.15, 3.2] });
  m.box(2.0, 0.5, 0.05, 0x8a6448, { p: [0, 1.15, 4.65] });
  m.box(2.0, 0.5, 0.05, 0x8a6448, { p: [0, 1.15, 1.75] });
  section(m, [...arc(0, 1.3, 0.95, 0, Math.PI, 12).map(([x, y]): P2 => [x, 1.3 + (y - 1.3) * 0.85])], 1.8, 4.6, 0xd8c070);
  for (const sd of [-1, 1]) wheel(m, sd * 1.05, 0.45, 3.2, 0.45, 0.24, 0x8a8a8a, 12);
  for (const sd of [-1, 1]) {
    L.cyl(0.07, 0.07, 0.04, 10, HEAD, { p: [sd * 0.3, 1.35, -1.77], r: [Math.PI / 2, 0, 0] });
    L.box(0.16, 0.1, 0.04, TAIL, { p: [sd * 0.8, 0.95, 4.69] });
  }
  return { body: m.build(), lamps: L.build(), length: 6, width: 2.0, speed: [18, 26] };
}

function auto(m: ModelBuilder, L: ModelBuilder, seed: number): VehicleModel {
  // three-wheeled auto-rickshaw: a wide rounded front cowl with a colour band under the windshield,
  // the front wheel ahead of it under its own mudguard (headlamp on top), a flat-topped canvas
  // hood, open sides, and a passenger tub at the back with a canvas back and a small oval window
  const [lower, band, hoodCol] = ([[0x2a7a3a, 0xf2c230, 0xf2c230], [0x1e1e1e, 0xf2c230, 0x1e1e1e], [0x1e1e1e, 0xf2c230, 0xf2c230], [0x2a7a3a, 0xf2c230, 0x1e1e1e]] as const)[seed % 4];
  const SEAT = 0x2a2422, METAL = 0x2a2a2a;
  const BAND_Y = 0.84;
  // cowl: one cross-section lofted from a squashed, narrow front to full size at the driver
  const cowl: P2[] = [[-0.4, 0.34], [0.4, 0.34], [0.55, 0.48], [0.61, 0.66], [0.63, BAND_Y], [0.63, 1.0], [-0.63, 1.0], [-0.63, BAND_Y], [-0.61, 0.66], [-0.55, 0.48]];
  loft(m, cowl, [{ z: -1.0, sx: 0.45, sy: 0.8 }, { z: -0.97, sx: 0.72, sy: 0.92 }, { z: -0.92, sx: 0.9, sy: 0.98 }, { z: -0.84, sx: 1 }, { z: -0.58, sx: 1 }], 0.34, (y) => (y > BAND_Y ? band : lower), [lower, METAL]);
  m.box(0.15, 0.4, 0.03, METAL, { p: [0, 0.6, -1.0] }); // centre strip with the air vent
  for (let i = 0; i < 4; i++) m.box(0.11, 0.012, 0.02, 0x555555, { p: [0, 0.5 + i * 0.05, -1.017] });
  // windshield: black frame with a centre divider, wiper; canvas hood overhangs it as a visor
  const ws = (x: number, t: number): P3 => [x, 1.0 + 0.5 * t, -0.8 + 0.06 * t];
  skin(m, [ws(-0.58, 0.04), ws(0.58, 0.04), ws(0.58, 0.96), ws(-0.58, 0.96)], GLASS, [0, 1.2, 0.5]);
  for (const x of [-0.6, 0, 0.6]) beam(m, ws(x, 0), ws(x, 1), x === 0 ? 0.025 : 0.045, 0.04, 0x1a1a1a);
  beam(m, ws(-0.6, 1), ws(0.6, 1), 0.04, 0.04, 0x1a1a1a);
  beam(m, ws(0.05, 0.08), ws(0.4, 0.5), 0.015, 0.015, 0x1a1a1a);
  const canopy: P2[] = [[-0.66, 1.5], [0.66, 1.5], ...arc(0.52, 1.66, 0.14, 0, Math.PI / 2, 4), ...arc(-0.52, 1.66, 0.14, Math.PI / 2, Math.PI, 4)];
  section(m, canopy, -0.92, 1.32, hoodCol);
  // driver: seat on the engine cover, handlebar on its column
  m.box(0.5, 0.3, 0.42, METAL, { p: [0, 0.5, -0.12] });
  m.box(0.48, 0.08, 0.36, SEAT, { p: [0, 0.69, -0.12] });
  beam(m, [0, 0.95, -0.6], [0, 1.08, -0.48], 0.04, 0.04, METAL);
  m.box(0.64, 0.03, 0.03, METAL, { p: [0, 1.09, -0.47] });
  for (const sd of [-1, 1]) m.box(0.1, 0.04, 0.04, 0x111111, { p: [sd * 0.3, 1.09, -0.47] });
  // floor and passenger tub: thin side panels with the rear wheel arch, rear panel, bench
  m.box(1.24, 0.06, 1.95, METAL, { p: [0, 0.33, 0.35] });
  for (const sd of [-1, 1]) {
    profile(m, [[0.6, 0.3], ...arch(0.95, 0.3, 0.2, 0.25, 8), [1.34, 0.3], [1.34, 0.86], [0.8, 0.86], [0.62, 0.62]], 0.03, lower, sd * 0.635);
    profile(m, [[0.76, 0.76], [1.345, 0.76], [1.345, 0.87], [0.8, 0.87]], 0.035, band, sd * 0.64);
    profile(m, [...arc(0.95, 0.2, 0.29, Math.PI * 0.95, Math.PI * 0.1, 8), ...arc(0.95, 0.2, 0.25, Math.PI * 0.1, Math.PI * 0.95, 8)], 0.07, METAL, sd * 0.66);
    beam(m, [sd * 0.63, 0.62, 0.62], [sd * 0.63, 1.5, 0.62], 0.03, 0.03, 0x9a9a9a); // grab pole
    // canvas sides over the bench
    skin(m, [[sd * 0.655, 0.87, 0.8], [sd * 0.655, 0.87, 1.32], [sd * 0.655, 1.5, 1.32], [sd * 0.655, 1.5, 0.78]], hoodCol, [0, 1.1, 1.0]);
    beam(m, [sd * 0.62, 1.32, -0.79], [sd * 0.78, 1.36, -0.84], 0.02, 0.02, METAL); // mirror arm
    m.sphere(0.05, 8, 6, 0x111111, { p: [sd * 0.8, 1.37, -0.85] });
  }
  m.box(1.3, 0.56, 0.03, lower, { p: [0, 0.58, 1.33] });
  m.box(1.32, 0.11, 0.035, band, { p: [0, 0.815, 1.34] });
  m.box(0.7, 0.26, 0.02, METAL, { p: [0, 0.55, 1.35] }); // engine grille
  m.box(1.32, 0.08, 0.1, band, { p: [0, 0.3, 1.37] }); // bumper
  m.box(1.2, 0.3, 0.45, METAL, { p: [0, 0.5, 0.78] });
  m.box(1.18, 0.1, 0.44, SEAT, { p: [0, 0.7, 0.78] });
  m.box(1.18, 0.48, 0.09, SEAT, { p: [0, 1.0, 1.06], r: [-0.12, 0, 0] });
  // canvas back with a small oval window
  skin(m, [[-0.655, 0.87, 1.32], [0.655, 0.87, 1.32], [0.655, 1.5, 1.32], [-0.655, 1.5, 1.32]], hoodCol, [0, 1.1, 0.5]);
  skin(m, arc(0, 1.38, 1, 0, Math.PI * 2, 16).slice(0, 16).map(([x, y]): P3 => [x * 0.22, 1.38 + (y - 1.38) * 0.07, 1.326]), GLASS, [0, 1.1, 0.5]);
  // front wheel in a fork under a round mudguard with the headlamp on top; two rear wheels
  wheel(m, 0, 0.2, -1.15, 0.2, 0.12, 0x9a9a9a, 12);
  profile(m, [...arc(-1.15, 0.2, 0.27, Math.PI * 0.08, Math.PI * 0.92, 8), ...arc(-1.15, 0.2, 0.24, Math.PI * 0.92, Math.PI * 0.08, 8)], 0.2, lower);
  beam(m, [0, 0.2, -1.15], [0, 0.6, -0.97], 0.1, 0.04, METAL);
  m.cyl(0.09, 0.09, 0.1, 12, METAL, { p: [0, 0.52, -1.26], r: [Math.PI / 2, 0, 0] });
  for (const sd of [-1, 1]) wheel(m, sd * 0.56, 0.2, 0.95, 0.2, 0.13, 0x9a9a9a, 12);
  L.cyl(0.07, 0.07, 0.02, 12, HEAD, { p: [0, 0.52, -1.315], r: [Math.PI / 2, 0, 0] });
  for (const sd of [-1, 1]) {
    L.box(0.1, 0.05, 0.03, AMBER, { p: [sd * 0.42, 0.8, -0.945] });
    L.box(0.1, 0.14, 0.03, TAIL, { p: [sd * 0.52, 0.6, 1.355] });
  }
  return { body: m.build(), lamps: L.build(), length: 2.6, width: 1.35, speed: [30, 45] };
}

/** Original painted slogans for the back of goods carriers ("please honk" tradition). */
export const TRUCK_SLOGANS = [
  'HONK SOFTLY\nI AM LISTENING',
  'AMMA SAYS\nDRIVE SLOW',
  'MAA SAYS\nKEEP DISTANCE',
  'AAI SAYS\nUSE DIPPER AT NIGHT',
  'SLOW IS ALSO\nA SPEED',
  'TOOT TOOT\nTHEN OVERTAKE',
  'SEE YOU\nAT THE NEXT DHABA',
  'GOOD ROADS\nGOOD DAYS',
];

export function truckBack(seed: number): THREE.Mesh {
  // painted on the rear crossmember as one line, the way the slogans sit on real goods carriers
  const s = signMesh(TRUCK_SLOGANS[seed % TRUCK_SLOGANS.length].replace('\n', ' '), 1.5, 0.24, ['#f2c230', '#f7f3e8', '#e8f0e4'][seed % 3], ['#c8302a', '#1d3a8a', '#1a6a3a'][seed % 3]);
  s.position.set(0, 0.8, 3.635);
  return s;
}

const AUTO_STICKERS = ['THREE WHEELS\nONE HEART', 'RUNS ON CHAI', 'SLOWLY SLOWLY\nSAFELY', 'DRIVER LOVES\nFILTER COFFEE', 'SMILE, YOU ARE\nIN TRAFFIC'];
export function autoSticker(seed: number): THREE.Mesh {
  const s = signMesh(AUTO_STICKERS[seed % AUTO_STICKERS.length], 0.9, 0.36, '#f7f3e8', '#1d3a8a');
  s.position.set(0, 1.12, 1.335);
  return s;
}
