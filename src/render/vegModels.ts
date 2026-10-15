// Low-poly vegetation and natural props. Parts marked with tint(true) take the
// per-instance colour (biome palette); trunks and stems keep their own colour.
import * as THREE from 'three';
import { ModelBuilder } from './models';
import type { VegType } from '../../data/biomes';

const TRUNK = 0x6b4a32;
const TRUNK_PALE = 0xb8b0a0;

export function vegGeometry(t: VegType): THREE.BufferGeometry {
  const m = new ModelBuilder();
  switch (t) {
    case 'pine': {
      m.cyl(0.16, 0.26, 2.4, 5, TRUNK, { p: [0, 1.2, 0] });
      m.tint(true);
      m.cone(2.1, 3.6, 7, 0xffffff, { p: [0, 3.6, 0] });
      m.cone(1.65, 3.0, 7, 0xeef2ee, { p: [0, 5.4, 0], r: [0, 0.4, 0] });
      m.cone(1.15, 2.6, 7, 0xdde6de, { p: [0, 7.1, 0], r: [0, 0.9, 0] });
      break;
    }
    case 'broadleaf': {
      m.cyl(0.18, 0.3, 3.0, 6, TRUNK, { p: [0, 1.5, 0] });
      m.cyl(0.08, 0.12, 1.6, 4, TRUNK, { p: [0.5, 3.0, 0], r: [0, 0, -0.7] });
      m.tint(true);
      m.ico(1.9, 0, 0xffffff, { p: [0, 4.3, 0], s: [1, 0.85, 1] });
      m.ico(1.4, 0, 0xe6ece4, { p: [1.2, 3.8, 0.4], s: [1, 0.85, 1] });
      m.ico(1.3, 0, 0xf2f2ee, { p: [-0.9, 3.9, -0.7], s: [1, 0.85, 1] });
      break;
    }
    case 'silveroak': {
      m.cyl(0.12, 0.22, 6, 5, TRUNK_PALE, { p: [0, 3, 0] });
      m.tint(true);
      m.ico(1.3, 0, 0xffffff, { p: [0, 6.5, 0], s: [1, 1.6, 1] });
      m.ico(0.9, 0, 0xe0e6dc, { p: [0.3, 8.6, 0], s: [1, 1.4, 1] });
      break;
    }
    case 'palm': {
      let x = 0, y = 0;
      for (let i = 0; i < 5; i++) {
        const ang = 0.08 + i * 0.05;
        m.cyl(0.17 - i * 0.012, 0.2 - i * 0.012, 1.6, 6, 0x8a6d4e, { p: [x + Math.sin(ang) * 0.8, y + 0.8, 0], r: [0, 0, -ang] });
        x += Math.sin(ang) * 1.6;
        y += Math.cos(ang) * 1.6;
      }
      m.tint(true);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        m.box(0.5, 0.06, 3.0, 0xffffff, { p: [x + Math.cos(a) * 1.3, y - 0.25, Math.sin(a) * 1.3], r: [0.35, -a + Math.PI / 2, 0] });
      }
      m.tint(false);
      m.sphere(0.22, 5, 4, 0x6a5232, { p: [x, y - 0.3, 0.15] });
      break;
    }
    case 'bush': {
      m.tint(true);
      m.ico(0.8, 0, 0xffffff, { p: [0, 0.5, 0], s: [1.2, 0.8, 1] });
      m.ico(0.6, 0, 0xe8ece6, { p: [0.6, 0.45, 0.3] });
      break;
    }
    case 'rock': {
      m.tint(true);
      m.dodeca(0.8, 0xffffff, { p: [0, 0.3, 0], s: [1.2, 0.7, 1] });
      break;
    }
    case 'boulder': {
      m.tint(true);
      m.dodeca(1.0, 0xffffff, { p: [0, 0.5, 0], s: [1.3, 0.95, 1.1] });
      m.dodeca(0.6, 0xe6e0da, { p: [0.9, 0.3, 0.4] });
      break;
    }
    case 'grass': {
      m.tint(true);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        m.cone(0.07, 0.6 + (i % 3) * 0.15, 3, 0xffffff, { p: [Math.cos(a) * 0.18, 0.3, Math.sin(a) * 0.18], r: [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25] });
      }
      break;
    }
    case 'flowers': {
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        m.cyl(0.015, 0.015, 0.45, 3, 0x5a8a3a, { p: [Math.cos(a) * 0.25, 0.22, Math.sin(a) * 0.25] });
      }
      m.tint(true);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        m.ico(0.07, 0, 0xffffff, { p: [Math.cos(a) * 0.25, 0.47, Math.sin(a) * 0.25] });
      }
      break;
    }
    case 'euphorbia': {
      m.tint(true);
      m.cyl(0.16, 0.2, 2.0, 6, 0xffffff, { p: [0, 1, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        const r = 0.35 + (i % 2) * 0.1;
        m.cyl(0.08, 0.08, 0.5, 5, 0xffffff, { p: [Math.cos(a) * r * 0.5, 1.0 + i * 0.15, Math.sin(a) * r * 0.5], r: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3] });
        m.cyl(0.1, 0.11, 0.9 + (i % 2) * 0.3, 5, 0xeeeeee, { p: [Math.cos(a) * r, 1.45 + i * 0.15, Math.sin(a) * r] });
      }
      break;
    }
    case 'acacia': {
      m.cyl(0.15, 0.24, 2.4, 5, 0x5c4632, { p: [0, 1.2, 0], r: [0, 0, 0.12] });
      m.cyl(0.08, 0.1, 1.4, 4, 0x5c4632, { p: [0.4, 2.5, 0], r: [0, 0, -0.6] });
      m.cyl(0.08, 0.1, 1.4, 4, 0x5c4632, { p: [-0.2, 2.5, 0.2], r: [0.5, 0, 0.4] });
      m.tint(true);
      m.cyl(2.4, 2.0, 0.6, 7, 0xffffff, { p: [0.2, 3.2, 0] });
      m.cyl(1.4, 1.6, 0.4, 7, 0xe6ecdc, { p: [0.6, 3.6, 0.3] });
      break;
    }
    case 'banana': {
      m.cyl(0.14, 0.18, 1.6, 6, 0x8aa05a, { p: [0, 0.8, 0] });
      m.tint(true);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        m.box(0.55, 0.04, 1.8, 0xffffff, { p: [Math.cos(a) * 0.8, 1.9, Math.sin(a) * 0.8], r: [0.5, -a + Math.PI / 2, 0] });
      }
      break;
    }
    case 'bamboo': {
      m.tint(true);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        const r = 0.3 + (i % 3) * 0.25;
        const h = 6 + (i % 4) * 1.4;
        m.cyl(0.06, 0.07, h, 5, 0xffffff, { p: [Math.cos(a) * r, h / 2, Math.sin(a) * r], r: [Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08] });
      }
      m.ico(1.2, 0, 0xc8dca8, { p: [0, 7.5, 0], s: [1.2, 1.4, 1.2] });
      break;
    }
    case 'tea': {
      // a clipped hedge segment, laid along the contour
      m.tint(true);
      // a square prism with a flat top: 16 triangles, no separate base
      m.cyl(0.6, 0.6, 4.0, 4, 0xffffff, { p: [0, 0.3, 0], r: [Math.PI / 4, 0, Math.PI / 2], s: [1, 1, 0.85] });
      break;
    }
    case 'crop': {
      m.tint(true);
      for (let i = 0; i < 6; i++) {
        m.cone(0.16, 0.9, 4, i % 2 ? 0xffffff : 0xe8e8d8, { p: [(i % 3) * 0.55 - 0.55, 0.45, Math.floor(i / 3) * 0.6 - 0.3] });
      }
      break;
    }
  }
  return m.build();
}
