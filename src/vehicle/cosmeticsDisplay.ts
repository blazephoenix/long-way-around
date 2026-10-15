// Applies equipped cosmetics to the player's car (cockpit + exterior).
import * as THREE from 'three';
import { ModelBuilder } from '../render/models';
import { toon } from '../render/toon';
import { signMesh } from '../render/props';
import { COSMETIC_BY_ID, Slot } from '../../data/cosmetics';
import type { PlayerCar } from './cockpit';

const mat = toon({ vertexColors: true });

function clearGroup(g: THREE.Group) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

function mesh(mb: ModelBuilder) {
  const m = new THREE.Mesh(mb.build(), mat);
  return m;
}

/** Small dashboard figures, built at ~10 cm scale. */
function dashModel(id: string): THREE.Object3D | null {
  const m = new ModelBuilder();
  switch (id) {
    case 'dash-dog':
      m.box(0.06, 0.04, 0.08, 0xc89a5a, { p: [0, 0.02, 0] });
      m.sphere(0.03, 8, 6, 0xc89a5a, { p: [0, 0.07, -0.04] });
      m.box(0.012, 0.03, 0.02, 0x6a4a2a, { p: [0.025, 0.08, -0.04] });
      m.box(0.012, 0.03, 0.02, 0x6a4a2a, { p: [-0.025, 0.08, -0.04] });
      break;
    case 'dash-plant':
      m.cyl(0.03, 0.025, 0.04, 8, 0xc8643a, { p: [0, 0.02, 0] });
      for (let i = 0; i < 5; i++) m.cone(0.012, 0.05, 4, 0x5aa04a, { p: [Math.cos(i) * 0.012, 0.06, Math.sin(i) * 0.012], r: [Math.cos(i) * 0.4, 0, Math.sin(i) * 0.4] });
      break;
    case 'dash-cat':
      m.sphere(0.03, 8, 6, 0x2a2a2a, { p: [0, 0.03, 0], s: [1, 1.2, 1] });
      m.sphere(0.022, 8, 6, 0x2a2a2a, { p: [0, 0.075, -0.005] });
      m.cone(0.008, 0.02, 4, 0x2a2a2a, { p: [0.012, 0.098, -0.005] });
      m.cone(0.008, 0.02, 4, 0x2a2a2a, { p: [-0.012, 0.098, -0.005] });
      m.sphere(0.004, 4, 3, 0xe8c84a, { p: [0.008, 0.078, -0.025] });
      m.sphere(0.004, 4, 3, 0xe8c84a, { p: [-0.008, 0.078, -0.025] });
      break;
    case 'dash-owl':
      m.sphere(0.035, 8, 6, 0x8a6448, { p: [0, 0.04, 0], s: [1, 1.3, 1] });
      m.sphere(0.01, 6, 4, 0xf2e2a0, { p: [0.014, 0.06, -0.03] });
      m.sphere(0.01, 6, 4, 0xf2e2a0, { p: [-0.014, 0.06, -0.03] });
      break;
    case 'dash-shell':
      m.cone(0.035, 0.03, 9, 0xf2d8c8, { p: [0, 0.015, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.5] });
      break;
    case 'dash-cactus':
      m.cyl(0.025, 0.02, 0.03, 8, 0xc8643a, { p: [0, 0.015, 0] });
      m.cyl(0.012, 0.012, 0.07, 6, 0x5a8a4a, { p: [0, 0.06, 0] });
      m.cyl(0.008, 0.008, 0.03, 6, 0x5a8a4a, { p: [0.016, 0.07, 0] });
      break;
    case 'dash-ganesha':
      // a small seated figure on a lotus base, rendered simply and respectfully
      m.cyl(0.04, 0.045, 0.015, 10, 0xd8a03a, { p: [0, 0.008, 0] });
      m.sphere(0.03, 8, 6, 0xe8a83a, { p: [0, 0.04, 0], s: [1, 0.9, 0.9] });
      m.sphere(0.022, 8, 6, 0xe8a83a, { p: [0, 0.08, -0.004] });
      m.cyl(0.005, 0.008, 0.035, 5, 0xe8a83a, { p: [0.004, 0.064, -0.024], r: [0.3, 0, 0.2] });
      m.sphere(0.012, 6, 4, 0xe8a83a, { p: [0.022, 0.085, 0], s: [0.5, 1, 1] });
      m.sphere(0.012, 6, 4, 0xe8a83a, { p: [-0.022, 0.085, 0], s: [0.5, 1, 1] });
      m.cone(0.01, 0.018, 6, 0xd84a2a, { p: [0, 0.105, 0] });
      break;
    case 'dash-buddha':
      m.cyl(0.04, 0.045, 0.015, 10, 0xb8943a, { p: [0, 0.008, 0] });
      m.sphere(0.034, 8, 6, 0xd8b04a, { p: [0, 0.03, 0], s: [1.2, 0.6, 0.9] });
      m.sphere(0.024, 8, 6, 0xd8b04a, { p: [0, 0.06, 0], s: [1, 1.1, 0.9] });
      m.sphere(0.016, 8, 6, 0xd8b04a, { p: [0, 0.095, 0] });
      m.sphere(0.006, 5, 4, 0xb8943a, { p: [0, 0.112, 0] });
      break;
    case 'dash-cross':
      m.box(0.04, 0.012, 0.012, 0x8a6448, { p: [0, 0.008, 0] });
      m.box(0.012, 0.09, 0.012, 0x8a6448, { p: [0, 0.055, 0] });
      m.box(0.05, 0.012, 0.012, 0x8a6448, { p: [0, 0.075, 0] });
      break;
    case 'dash-tasbih': {
      // a loop of wooden beads lying on the dash, with a short tassel
      for (let i = 0; i < 33; i++) {
        const a = (i / 33) * Math.PI * 2;
        m.sphere(0.0055, 6, 4, i % 11 === 0 ? 0x2a6a5a : 0x7a4a2a, { p: [Math.cos(a) * 0.04, 0.006, Math.sin(a) * 0.028] });
      }
      m.cyl(0.003, 0.006, 0.03, 6, 0x2a6a5a, { p: [0.05, 0.006, 0], r: [0, 0, Math.PI / 2] });
      break;
    }
    case 'dash-khanda':
      m.box(0.04, 0.01, 0.02, 0x3a4a6a, { p: [0, 0.005, 0] });
      m.torus(0.022, 0.004, 5, 14, 0x2a4a8a, { p: [0, 0.045, 0] });
      m.box(0.008, 0.07, 0.004, 0xc8ccd4, { p: [0, 0.05, 0] });
      m.torus(0.03, 0.003, 4, 10, 0x2a4a8a, { p: [0, 0.035, 0], r: [0, 0, Math.PI * 0.9] }, Math.PI * 0.55);
      break;
    case 'dash-bat':
      m.box(0.016, 0.07, 0.006, 0xe8d8a8, { p: [0, 0.035, 0], r: [0, 0, 0.3] });
      m.cyl(0.004, 0.004, 0.03, 5, 0x3a3a3a, { p: [-0.012, 0.085, 0], r: [0, 0, 0.3] });
      m.sphere(0.008, 6, 4, 0xc82a2a, { p: [0.03, 0.008, 0] });
      break;
    case 'dash-auto':
      m.box(0.05, 0.035, 0.07, 0x2a6a3a, { p: [0, 0.03, 0] });
      m.box(0.05, 0.02, 0.07, 0xf2c230, { p: [0, 0.055, 0] });
      m.cyl(0.008, 0.008, 0.006, 6, 0x1a1a1a, { p: [0, 0.008, -0.03], r: [0, 0, Math.PI / 2] });
      m.cyl(0.008, 0.008, 0.06, 6, 0x1a1a1a, { p: [0, 0.008, 0.025], r: [0, 0, Math.PI / 2] });
      break;
    case 'dash-kite':
      m.box(0.06, 0.06, 0.003, 0xe84a6a, { p: [0, 0.05, 0], r: [0, 0, Math.PI / 4] });
      m.box(0.003, 0.08, 0.003, 0x6a4a2a, { p: [0, 0.05, -0.002] });
      break;
    default:
      return null;
  }
  return mesh(m);
}

function hangModel(id: string): THREE.Object3D | null {
  const m = new ModelBuilder();
  const string = (len: number) => m.cyl(0.0015, 0.0015, len, 3, 0x3a3a3a, { p: [0, -len / 2, 0] });
  switch (id) {
    case 'hang-pine':
      string(0.08);
      m.cone(0.03, 0.08, 3, 0x3a8a4a, { p: [0, -0.12, 0], r: [Math.PI, 0, 0], s: [1, 1, 0.15] });
      break;
    case 'hang-beads':
    case 'hang-rudraksha':
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        m.sphere(id === 'hang-rudraksha' ? 0.009 : 0.008, 6, 4, id === 'hang-rudraksha' ? 0x7a3a22 : 0xb8844a, { p: [Math.sin(a) * 0.035, -0.04 - Math.cos(a) * 0.035 - 0.035, 0] });
      }
      if (id === 'hang-rudraksha') m.cone(0.008, 0.03, 5, 0xc8402a, { p: [0, -0.125, 0], r: [Math.PI, 0, 0] });
      break;
    case 'hang-lantern':
      string(0.06);
      m.box(0.035, 0.05, 0.035, 0x6a4a2a, { p: [0, -0.09, 0] });
      m.box(0.028, 0.035, 0.036, 0xffd27a, { p: [0, -0.09, 0] });
      break;
    case 'hang-feather':
      string(0.05);
      m.box(0.012, 0.1, 0.003, 0xb8c0c8, { p: [0, -0.1, 0], r: [0, 0, 0.15] });
      break;
    case 'hang-tassel':
      string(0.06);
      m.sphere(0.012, 6, 4, 0xd8a03a, { p: [0, -0.07, 0] });
      for (let i = 0; i < 6; i++) m.cyl(0.002, 0.002, 0.06, 3, 0xc8402a, { p: [Math.cos(i) * 0.006, -0.11, Math.sin(i) * 0.006] });
      break;
    case 'hang-eye':
      string(0.07);
      m.cyl(0.022, 0.022, 0.006, 12, 0x2a5ab8, { p: [0, -0.1, 0], r: [Math.PI / 2, 0, 0] });
      m.cyl(0.014, 0.014, 0.007, 12, 0xf2f2f2, { p: [0, -0.1, 0], r: [Math.PI / 2, 0, 0] });
      m.cyl(0.008, 0.008, 0.008, 10, 0x6ab0e8, { p: [0, -0.1, 0], r: [Math.PI / 2, 0, 0] });
      m.cyl(0.004, 0.004, 0.009, 8, 0x1a1a1a, { p: [0, -0.1, 0], r: [Math.PI / 2, 0, 0] });
      break;
    case 'hang-bell':
      string(0.06);
      m.cone(0.018, 0.03, 8, 0xc8a03a, { p: [0, -0.08, 0] });
      break;
    case 'hang-shells':
      for (let i = 0; i < 5; i++) m.cone(0.01, 0.014, 6, 0xf2e2d2, { p: [0, -0.02 - i * 0.022, 0] });
      break;
    default:
      return null;
  }
  return mesh(m);
}

function bumperModel(id: string): THREE.Object3D | null {
  if (id !== 'bumper-nimbu') return null;
  const m = new ModelBuilder();
  m.cyl(0.002, 0.002, 0.25, 3, 0xe8e2d4, { p: [0, -0.12, 0] });
  m.sphere(0.035, 8, 6, 0xd8d24a, { p: [0, -0.06, 0], s: [1, 1.2, 1] });
  for (let i = 0; i < 5; i++) m.cone(0.012, 0.07, 5, 0x3a8a3a, { p: [0, -0.12 - i * 0.025, 0], r: [Math.PI, i * 1.2, 0.2] });
  m.sphere(0.03, 8, 6, 0xd8d24a, { p: [0, -0.26, 0], s: [1, 1.2, 1] });
  return mesh(m);
}

const STICKER_TEXT: Record<string, string> = {
  'sticker-prayers': "On the road thanks to\nAmma's prayers",
  'sticker-slow': 'Slow is also a speed',
  'sticker-chai': 'Will stop for chai',
};

export function applyCosmetics(car: PlayerCar, eq: Partial<Record<Slot, string>>) {
  const paint = COSMETIC_BY_ID[eq.paint ?? 'paint-lake'];
  car.setPaint(paint.colors![0], paint.colors![1]);
  // dashboard
  clearGroup(car.dashSlot);
  if (eq.dash) {
    const o = dashModel(eq.dash);
    if (o) car.dashSlot.add(o);
  }
  // hanging
  clearGroup(car.hangPoint);
  if (eq.hang) {
    const o = hangModel(eq.hang);
    if (o) car.hangPoint.add(o);
  }
  // seats
  const seat = eq.seat ? COSMETIC_BY_ID[eq.seat] : null;
  if (seat?.colors) {
    car.seatMat.color.setHex(seat.colors[0]);
    car.seatMat.map = null;
  } else {
    car.seatMat.color.setHex(0x5a4636);
    car.seatMat.map = null;
  }
  car.seatMat.needsUpdate = true;
  // wheel
  const wheel = eq.wheel ? COSMETIC_BY_ID[eq.wheel] : null;
  const cover = car.steering.getObjectByName('wheelCover') as THREE.Mesh;
  cover.visible = !!wheel;
  if (wheel?.colors) {
    car.wheelCoverMat.color.setHex(0xffffff);
    car.wheelCoverMat.map = stripeTex(wheel.colors[0], wheel.colors[1], wheel.id);
    car.wheelCoverMat.needsUpdate = true;
  }
  // bumper + sticker
  clearGroup(car.bumperSlot);
  if (eq.bumper) {
    const o = bumperModel(eq.bumper);
    if (o) car.bumperSlot.add(o);
  }
  clearGroup(car.rearSticker);
  if (eq.sticker && STICKER_TEXT[eq.sticker]) {
    const s = signMesh(STICKER_TEXT[eq.sticker], 0.9, 0.22, '#f7f3e8', '#b8302a');
    s.position.z = 0.04;
    car.rearSticker.add(s);
  }
}

const texCache = new Map<string, THREE.Texture>();
function stripeTex(a: number, b: number, key: string): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const ca = '#' + a.toString(16).padStart(6, '0'), cb = '#' + b.toString(16).padStart(6, '0');
  g.fillStyle = ca;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = cb;
  if (key.includes('floral')) for (let i = 0; i < 8; i++) { g.beginPath(); g.arc((i * 23) % 64, (i * 37) % 64, 5, 0, 7); g.fill(); }
  else if (key.includes('beads')) for (let x = 0; x < 64; x += 8) for (let y = 0; y < 64; y += 8) { g.beginPath(); g.arc(x + 4, y + 4, 3, 0, 7); g.fill(); }
  else if (key.includes('plaid')) { for (let i = 0; i < 64; i += 16) { g.fillRect(i, 0, 5, 64); g.fillRect(0, i, 64, 5); } }
  else for (let i = 0; i < 64; i += 16) g.fillRect(0, i, 64, 7);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}
