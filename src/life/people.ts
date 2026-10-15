// People: town pedestrians on sidewalks, staff at stops, and hitchhikers who ride for a few
// kilometres, chat, and leave a tip pinned on the atlas.
import * as THREE from 'three';
import { World, CHUNK, ROAD_HALF, LANE } from '../world/world';
import { chunkSites, townDensity, Site } from '../world/sites';
import { hashInts, hashString, Rng, SYS, mulberry32 } from '../world/prng';
import { makePerson, randomLook, animateWalk, PersonLook } from '../render/lifeModels';
import { HITCHERS, Hitcher } from '../../data/dialogue';
import { BIOMES } from '../../data/biomes';
import { FEATURES } from '../core/features';
import { rareForSite } from './rare';
import { disposeTree } from '../render/models';

interface Walker {
  id: string;
  obj: THREE.Group;
  s: number;
  lat: number;
  dir: number;
  speed: number;
  s0: number;
  s1: number;
  phase: number;
}

export interface Staff {
  id: string;
  role: string;
  site: Site;
  obj: THREE.Group;
  x: number;
  z: number;
  talkN: number;
}

const STAFF_POS: Record<string, [string, number, number, number][]> = {
  // role, local x, local z, facing (radians, 0 = toward road)
  gas: [['attendant', 0.4, -3.6, 0.3]],
  diner: [['cook', 4.6, 0.9, 0.4]],
  motel: [['clerk', -11.8, -1.6, 0.6]],
  stand: [['owner', 0.3, 0.3, 0]],
};

export interface HitchState {
  id: string; // hitcher spot id
  hitcher: Hitcher;
  startOdo: number;
  rideM: number;
  said: number;
  done: boolean;
  tipGiven: boolean;
}

export class People {
  private walkers = new Map<string, Walker>();
  staff = new Map<string, Staff>();
  private timer = 0;
  waiting: { id: string; hitcher: Hitcher; obj: THREE.Group; x: number; z: number; s: number } | null = null;
  riding: HitchState | null = null;
  doneHitch = new Set<string>();
  passenger: THREE.Group | null = null;
  private waveT = 0;

  constructor(private world: World, private scene: THREE.Scene) {}

  dispose() {
    for (const w of this.walkers.values()) { this.scene.remove(w.obj); disposeTree(w.obj); }
    for (const s of this.staff.values()) { this.scene.remove(s.obj); disposeTree(s.obj); }
    if (this.waiting) { this.scene.remove(this.waiting.obj); disposeTree(this.waiting.obj); }
  }

  // -------------------------------------------------------------- spawning
  private lookFor(id: string, role?: string): PersonLook {
    const r = mulberry32(hashInts(this.world.seed, SYS.life, hashString(id)));
    const look = randomLook(r);
    if (role === 'cook') look.outfit = 'apron';
    if (role === 'attendant') { look.top = 0x2a5a8a; look.outfit = 'shirt'; look.head = 'cap'; }
    if (!FEATURES.india && (look.outfit === 'saree' || look.outfit === 'salwar' || look.outfit === 'kurta')) look.outfit = r() < 0.5 ? 'shirt' : 'jacket';
    return look;
  }

  update(dt: number, focus: THREE.Vector3) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1.2;
      this.refresh(focus);
    }
    for (const w of this.walkers.values()) {
      w.s += w.dir * w.speed * dt;
      if (w.s > w.s1) w.dir = -1;
      if (w.s < w.s0) w.dir = 1;
      const r = this.world.road(w.s);
      w.obj.position.set(r.x + r.nx * w.lat, this.world.ground(r.x + r.nx * w.lat, r.z + r.nz * w.lat), r.z + r.nz * w.lat);
      w.obj.rotation.y = Math.atan2(-r.tx, -r.tz) + (w.dir < 0 ? Math.PI : 0);
      w.phase += dt * w.speed * 4.2;
      animateWalk(w.obj, w.phase, 1);
    }
    // staff idle sway, hitchhiker waves when you approach
    for (const s of this.staff.values()) s.obj.rotation.z = Math.sin(performance.now() * 0.001 + s.x) * 0.02;
    if (this.waiting) {
      this.waveT += dt;
      const arm = this.waiting.obj.userData.arm as THREE.Object3D | undefined;
      if (arm) arm.rotation.z = -2.4 + Math.sin(this.waveT * 5) * 0.3;
    }
  }

  private refresh(focus: THREE.Vector3) {
    const w = this.world;
    const pc = Math.floor(focus.z / CHUNK);
    const wantW = new Set<string>();
    const wantS = new Set<string>();
    for (let c = pc - 2; c <= pc + 2; c++) {
      const s0 = c * CHUNK;
      // pedestrians in towns
      const town = townDensity(w, s0 + CHUNK / 2);
      if (town > 0) {
        const biome = w.dominantBiome(s0 + CHUNK / 2);
        const n = Math.round(BIOMES[biome].life.pedestrians * town * 1.6);
        const r = new Rng(hashInts(w.seed, SYS.life, c, 77));
        for (let i = 0; i < n; i++) {
          const id = `ped:${c}:${i}`;
          wantW.add(id);
          if (this.walkers.has(id)) continue;
          const side = r.chance(0.5) ? 1 : -1;
          const obj = makePerson(this.lookFor(id));
          this.scene.add(obj);
          const s = s0 + r.range(0, CHUNK);
          this.walkers.set(id, { id, obj, s, lat: side * (ROAD_HALF + r.range(2.2, 3.4)), dir: r.chance(0.5) ? 1 : -1, speed: r.range(0.9, 1.4), s0, s1: s0 + CHUNK, phase: r.range(0, 6) });
        }
      }
      // staff at stops
      for (const site of chunkSites(w, c)) {
        const pos = STAFF_POS[site.kind];
        if (!pos) continue;
        if (Math.hypot(site.x - focus.x, site.z - focus.z) > 260) continue;
        for (const [role, lx, lz, face] of pos) {
          const id = `${site.id}:${role}`;
          wantS.add(id);
          if (this.staff.has(id)) continue;
          const realRole = role === 'owner' && site.variant?.startsWith('tapri') ? 'chaiwala' : role;
          const obj = makePerson(this.lookFor(id, realRole));
          const ca = Math.cos(site.heading), sa = Math.sin(site.heading);
          const x = site.x + lx * ca + lz * sa, z = site.z - lx * sa + lz * ca;
          obj.position.set(x, w.ground(x, z), z);
          obj.rotation.y = site.heading + face;
          this.scene.add(obj);
          this.staff.set(id, { id, role: realRole, site, obj, x, z, talkN: 0 });
        }
      }
      // hitchhiker spots: rare, about one per 15 km
      const hr = new Rng(hashInts(w.seed, SYS.hitch, c));
      if (c > 3 && hr.chance(CHUNK / 15000)) {
        const id = `hitch:${c}`;
        const pool = HITCHERS.filter((h) => FEATURES.india || !h.india);
        const hitcher = pool[hr.int(0, pool.length - 1)];
        const s = s0 + hr.range(30, CHUNK - 30);
        if (!this.doneHitch.has(id) && this.riding?.id !== id && !this.waiting && Math.abs(s - focus.z) < 500) {
          const r = w.road(s);
          const u = ROAD_HALF + 1.6;
          const x = r.x + r.nx * u, z = r.z + r.nz * u;
          const look = this.lookFor(id);
          look.bag = true;
          const obj = makePerson(look);
          // a raised arm for thumbing/waving
          const arm = new THREE.Group();
          arm.position.set(0.27, look.height * 0.78, 0);
          const am = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.11).translate(0, -0.25, 0), new THREE.MeshToonMaterial({ color: look.top }));
          arm.add(am);
          arm.rotation.z = -2.4;
          obj.add(arm);
          obj.userData.arm = arm;
          obj.position.set(x, w.ground(x, z), z);
          obj.rotation.y = Math.atan2(r.tx, r.tz); // facing oncoming traffic (-z travel shows their face to +z drivers)
          this.scene.add(obj);
          this.waiting = { id, hitcher, obj, x, z, s };
        }
      }
    }
    for (const [id, wk] of this.walkers) if (!wantW.has(id)) { this.scene.remove(wk.obj); disposeTree(wk.obj); this.walkers.delete(id); }
    for (const [id, st] of this.staff) if (!wantS.has(id)) { this.scene.remove(st.obj); disposeTree(st.obj); this.staff.delete(id); }
    if (this.waiting && Math.abs(this.waiting.s - focus.z) > 700) {
      this.scene.remove(this.waiting.obj);
      this.waiting = null;
    }
  }

  /** Pedestrians as walker obstacles for traffic and the car. */
  colliders(x: number, z: number, fn: (cx: number, cz: number, r: number) => void) {
    for (const s of this.staff.values()) if (Math.abs(s.z - z) < 10) fn(s.x, s.z, 0.35);
    for (const w of this.walkers.values()) if (Math.abs(w.obj.position.z - z) < 10) fn(w.obj.position.x, w.obj.position.z, 0.35);
    if (this.waiting && Math.abs(this.waiting.z - z) < 10) fn(this.waiting.x, this.waiting.z, 0.35);
  }

  nearestStaff(x: number, z: number, maxD = 2.6): Staff | null {
    let best: Staff | null = null, bd = maxD;
    for (const s of this.staff.values()) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Spot ahead to pin as a hitchhiker's tip: a hidden spot, a lake at the end of a side road, or a landmark. */
  findTip(fromS: number): { id: string; x: number; z: number; label: string } | null {
    const c0 = Math.floor(fromS / CHUNK);
    for (let c = c0 + 2; c < c0 + 60; c++) {
      for (const s of chunkSites(this.world, c)) {
        if (s.kind === 'hidden' || s.kind === 'stepwell' || s.kind === 'waterfall' || s.kind === 'temple' || s.kind === 'teaestate') {
          const rare = this.rareFor(s);
          const label = s.kind === 'hidden' ? `${rare.name}: ${rare.hint.toLowerCase()}` : `${s.kind === 'stepwell' ? 'the stepwell' : s.kind === 'teaestate' ? 'the tea estate' : s.kind === 'waterfall' ? 'the waterfall' : 'the stone temple'} up the road`;
          return { id: `tip:${s.id}`, x: s.x, z: s.z, label };
        }
      }
      const br = this.world.chunkFeatures(c).branch;
      if (br?.poi?.kind === 'lake') return { id: `tip:${br.id}`, x: br.poi.x, z: br.poi.z, label: 'a quiet lake at the end of a side road, best at first light' };
    }
    return null;
  }

  rareFor(site: Site) {
    return rareForSite(site);
  }

  /** Passenger figure in the left seat while a hitchhiker rides. */
  seatPassenger(cockpit: THREE.Group, look: PersonLook | null) {
    if (this.passenger) {
      cockpit.remove(this.passenger);
      this.passenger = null;
    }
    if (!look) return;
    const p = makePerson({ ...look, height: 1.6 });
    p.scale.setScalar(0.95);
    p.position.set(-0.36, -0.75, 0.4);
    for (const l of p.userData.legs as THREE.Object3D[]) l.rotation.x = -1.4;
    cockpit.add(p);
    this.passenger = p;
  }

  lookOf(id: string) {
    return this.lookFor(id);
  }

  static lane = LANE;
}
