// Occasional India-layer moments: the kite festival sky, a wedding procession at night,
// and toll plazas whose booms lift with a beep (nothing is charged).
import * as THREE from 'three';
import type { Game } from '../game';
import { CHUNK, LANE } from '../world/world';
import { chunkStops, townDensity } from '../world/sites';
import { booms } from '../world/siteRender';
import { hashInts, SYS, Rng } from '../world/prng';
import { makePerson, randomLook } from '../render/lifeModels';
import { ModelBuilder } from '../render/models';
import { toon } from '../render/toon';
import { matGlow } from '../render/props';
import { FEATURES } from '../core/features';
import { lightWindow } from '../render/sky';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { disposeTree } from '../render/models';

/** Collapse a group of vertex-coloured meshes into one toon mesh and one glow mesh (fewer draw calls). */
function mergeGroup(root: THREE.Group): THREE.Group {
  root.updateMatrixWorld(true);
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.attributes.color) {
      const c = (m.material as THREE.MeshToonMaterial).color ?? new THREE.Color(1, 1, 1);
      const arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const gi = g.index ? g.toNonIndexed() : g;
    (m.material === matGlow ? glow : solid).push(gi);
  });
  const out = new THREE.Group();
  if (solid.length) out.add(new THREE.Mesh(mergeGeometries(solid)!, toon({ vertexColors: true })));
  if (glow.length) out.add(new THREE.Mesh(mergeGeometries(glow)!, matGlow));
  return out;
}

const KITE_COLS = [0xe84a6a, 0xf2c230, 0x2a8a5a, 0x2a5ab8, 0xe8742a, 0x8a3aa8, 0xf2f2ee, 0xd8302a];

export class Events {
  private kites: THREE.InstancedMesh;
  private kiteData: { x: number; z: number; h: number; ph: number }[] = [];
  private procession: { group: THREE.Group; s: number; people: THREE.Group[]; until: number } | null = null;
  private lastDay = -1;
  private tollBeeped = new Set<string>();
  private kitesToday = false;
  private weddingNight = -1;

  constructor(private g: Game) {
    const geo = new ModelBuilder()
      .shape([[0, 0.6], [0.45, 0], [0, -0.75], [-0.45, 0]], 0.02, 0xffffff)
      .box(0.03, 1.4, 0.01, 0xffffff, { p: [0, -1.45, 0] })
      .build();
    this.kites = new THREE.InstancedMesh(geo, toon({ vertexColors: true, side: THREE.DoubleSide }), 60);
    this.kites.count = 0;
    this.kites.frustumCulled = false;
    this.kites.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(60 * 3), 3);
    for (let i = 0; i < 60; i++) {
      this.kites.setColorAt(i, new THREE.Color(KITE_COLS[i % KITE_COLS.length]));
      this.kiteData.push({ x: (Math.random() - 0.5) * 260, z: (Math.random() - 0.5) * 260, h: 22 + Math.random() * 45, ph: Math.random() * 6 });
    }
    g.scene.add(this.kites);
    g.life.extraObstacles.push(() => this.obstacles());
    g.extraSubjects.push(() => this.subjects());
  }

  dispose() {
    this.g.scene.remove(this.kites);
    if (this.procession) this.g.scene.remove(this.procession.group);
  }

  update(dt: number) {
    const g = this.g;
    if (!FEATURES.india) return;
    const focus = g.focusPos;
    const biome = g.world.dominantBiome(focus.z);
    // one roll per in-game day for kites (clear days over farmland and towns)
    if (g.day !== this.lastDay) {
      this.lastDay = g.day;
      this.kitesToday = new Rng(hashInts(g.world.seed, SYS.india, g.day, 21)).chance(0.22);
    }
    const win = lightWindow(g.hour);
    const daytime = win !== 'night' && win !== 'blue' && win !== 'dawn';
    const kites = this.kitesToday && daytime && g.weatherName === 'clear' && (biome === 'farm' || biome === 'city' || townDensity(g.world, focus.z) > 0);
    g.kitesActive = kites;
    this.kites.count = kites ? 48 : 0;
    if (kites) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const t = performance.now() * 0.001;
      for (let i = 0; i < 48; i++) {
        const k = this.kiteData[i];
        const p = new THREE.Vector3(focus.x + k.x + Math.sin(t * 0.3 + k.ph) * 3, focus.y + k.h + Math.sin(t * 0.7 + k.ph) * 2, focus.z + k.z);
        q.setFromEuler(new THREE.Euler(Math.sin(t + k.ph) * 0.25, k.ph, Math.sin(t * 1.3 + k.ph) * 0.3));
        m.compose(p, q, new THREE.Vector3(2.6, 2.6, 2.6));
        this.kites.setMatrixAt(i, m);
      }
      this.kites.instanceMatrix.needsUpdate = true;
    }
    this.updateWedding(dt, win);
    this.updateTolls(dt);
  }

  // ------------------------------------------------------------ wedding procession
  private updateWedding(dt: number, win: string) {
    const g = this.g;
    const night = win === 'night' && g.hour > 19 && g.hour < 23.5;
    if (this.procession) {
      const P = this.procession;
      P.s += 0.7 * dt;
      const r = g.world.road(P.s);
      P.group.position.set(r.x + r.nx * LANE, r.y, r.z);
      P.group.rotation.y = Math.atan2(-r.tx, -r.tz);
      const t = performance.now() * 0.004;
      P.people.forEach((p, i) => {
        p.position.y = Math.abs(Math.sin(t + i)) * 0.06;
        p.rotation.y = Math.sin(t * 0.5 + i) * 0.3;
      });
      g.weddingNear = P.group.position.distanceTo(g.camera.position) < 90;
      if (P.s > P.until || !night || Math.abs(P.s - g.focusPos.z) > 600) {
        g.scene.remove(P.group);
        disposeTree(P.group);
        this.procession = null;
        g.weddingNear = false;
      }
      return;
    }
    if (!night || this.weddingNight === g.day) return;
    // look for a town ahead; a modest chance per night
    const z = g.focusPos.z;
    const ahead = Math.sign(-Math.cos(g.mode === 'drive' ? g.car.yaw : g.walker.yaw)) || 1;
    for (let c = Math.floor(z / CHUNK) + ahead; Math.abs(c * CHUNK - z) < 500; c += ahead) {
      if (townDensity(g.world, c * CHUNK + CHUNK / 2) <= 0) continue;
      this.weddingNight = g.day;
      if (!new Rng(hashInts(g.world.seed, SYS.india, g.day, c)).chance(0.35)) return;
      this.spawnProcession(c * CHUNK + 60);
      return;
    }
  }

  private spawnProcession(s: number) {
    const g = this.g;
    const group = new THREE.Group();
    const people: THREE.Group[] = [];
    const r = Math.random;
    // a light-bearer row, the band, dancers, and the groom on a decorated horse
    for (let i = 0; i < 14; i++) {
      const look = randomLook(r);
      if (i < 4) { look.outfit = 'shirt'; look.top = 0xd8302a; look.head = 'cap'; }
      const p = makePerson(look);
      const row = Math.floor(i / 3), col = (i % 3) - 1;
      p.position.set(col * 1.0, 0, -row * 1.6);
      if (i < 4) {
        // brass instruments
        const b = new ModelBuilder().cone(0.12, 0.5, 8, 0xd8b04a, { p: [0.15, 1.3, -0.35], r: [-1.3, 0, 0] }).build();
        p.add(new THREE.Mesh(b, toon({ vertexColors: true })));
      } else if (i % 3 === 0) {
        // light-bearers carry lamps on poles
        const pole = new ModelBuilder().cyl(0.03, 0.03, 1.4, 4, 0x8a8a86, { p: [0.3, 1.6, 0] }).build();
        p.add(new THREE.Mesh(pole, toon({ vertexColors: true })));
        const lamp = new ModelBuilder().sphere(0.18, 8, 6, 0xffe0a0, { p: [0.3, 2.4, 0] }).build();
        p.add(new THREE.Mesh(lamp, matGlow));
      }
      group.add(p);
      people.push(p);
    }
    const horse = new ModelBuilder();
    horse.sphere(1, 8, 6, 0xf2efe6, { p: [0, 1.3, 0], s: [0.4, 0.4, 0.95] });
    horse.cyl(0.18, 0.25, 0.8, 6, 0xf2efe6, { p: [0, 1.7, -0.8], r: [-0.6, 0, 0] });
    horse.sphere(1, 7, 5, 0xf2efe6, { p: [0, 2.1, -1.15], s: [0.16, 0.16, 0.3] });
    for (const [x, z] of [[0.2, -0.6], [-0.2, -0.6], [0.2, 0.6], [-0.2, 0.6]]) horse.cyl(0.06, 0.07, 1.0, 5, 0xf2efe6, { p: [x, 0.5, z] });
    horse.box(0.9, 0.08, 1.1, 0xc8302a, { p: [0, 1.72, 0] });
    horse.box(0.95, 0.4, 0.05, 0xd8b04a, { p: [0, 1.5, -0.5] });
    const hm = new THREE.Mesh(horse.build(), toon({ vertexColors: true }));
    hm.position.set(0, 0, -9);
    group.add(hm);
    const groom = makePerson({ skin: 0x9e6c46, top: 0xf2e6c8, bottom: 0xf2e6c8, hair: 0x1a1412, outfit: 'kurta', head: 'turban', height: 1.0 });
    groom.scale.setScalar(1);
    groom.position.set(0, 1.0, -9);
    for (const l of groom.userData.legs as THREE.Object3D[]) l.rotation.x = -0.9;
    group.add(groom);
    // strings of lights overhead
    const lights = new ModelBuilder();
    for (let i = 0; i < 20; i++) lights.sphere(0.07, 5, 4, [0xffe0a0, 0xff9a5a, 0xa0e0ff][i % 3], { p: [Math.sin(i) * 1.6, 2.6 + Math.sin(i * 0.7) * 0.2, -i * 0.5] });
    group.add(new THREE.Mesh(lights.build(), matGlow));
    const merged = mergeGroup(group);
    g.scene.add(merged);
    this.procession = { group: merged, s, people: [], until: s + 220 };
  }

  private obstacles() {
    if (!this.procession) return [];
    const p = this.procession.group.position;
    return [{ x: p.x, z: p.z - 5, r: 3.2, speed: 0.7, kind: 'procession' as const }];
  }

  private subjects() {
    if (!this.procession) return [];
    const p = this.procession.group.position;
    return [{ uid: `wedding:${this.g.day}`, defId: 'wedding', pos: new THREE.Vector3(p.x, p.y, p.z - 4), r: 3, h: 2.6 }];
  }

  // ------------------------------------------------------------ toll plazas
  private updateTolls(dt: number) {
    const g = this.g;
    const near: { site: ReturnType<typeof chunkStops>[number] }[] = [];
    const c = Math.floor(g.focusPos.z / CHUNK);
    for (let i = c - 2; i <= c + 2; i++) for (const s of chunkStops(g.world, i)) if (s.kind === 'toll') near.push({ site: s });
    for (const b of booms) {
      const lane = b.userData.boom as number;
      const wp = new THREE.Vector3();
      b.getWorldPosition(wp);
      // who is approaching in this lane? (lane -1 = traffic heading +z, i.e. the left lane)
      const dir = lane < 0 ? 1 : -1;
      let open = false;
      const check = (x: number, z: number) => {
        const d = (wp.z - z) * dir;
        const lat = g.world.lateral(x, z);
        if (d > -6 && d < 32 && Math.sign(lat || 1) === (dir > 0 ? 1 : -1)) open = true;
      };
      if (g.mode === 'drive') check(g.car.pos.x, g.car.pos.z);
      for (const v of g.life.traffic.vehicles) check(v.obj.position.x, v.obj.position.z);
      const target = open ? lane * 1.3 : 0;
      b.rotation.z += (target - b.rotation.z) * Math.min(1, dt * 3);
      if (open && g.mode === 'drive') {
        const key = `${Math.round(wp.x)}:${Math.round(wp.z)}`;
        const d = (wp.z - g.car.pos.z) * dir;
        if (d > 0 && d < 30 && !this.tollBeeped.has(key)) {
          this.tollBeeped.add(key);
          g.events.emit('toll', {});
          g.events.emit('toast', { text: 'Beep. The boom lifts. Nothing charged. Happy journey.' });
        }
      }
    }
    if (this.tollBeeped.size > 50) this.tollBeeped.clear();
    void near;
  }
}
