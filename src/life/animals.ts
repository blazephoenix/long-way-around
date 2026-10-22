// Wildlife: seeded spawn points per chunk, readable time/weather rules, simple behaviours
// (wander, graze, perch, circle, surface), and calm-or-flee reactions to the player.
import * as THREE from 'three';
import { World, CHUNK, ROAD_HALF, SEA_LEVEL } from '../world/world';
import { hashInts, Rng, SYS } from '../world/prng';
import { SUBJECTS, SubjectDef, Window } from '../../data/subjects';
import { makeAnimal } from '../render/animalModels';
import type { AnimalRig } from '../render/animalRig';
import { townDensity, chunkSites } from '../world/sites';
import { rareForSite } from './rare';
import { FEATURES } from '../core/features';
import { disposeTree } from '../render/models';

export interface Active {
  uid: string;
  def: SubjectDef;
  obj: THREE.Group;
  home: THREE.Vector3;
  target: THREE.Vector3;
  state: 'idle' | 'walk' | 'flee' | 'gone';
  timer: number;
  phase: number;
  alt: number;
  rng: Rng;
  vel: number;
  heading: number;
  crossing?: boolean;
}

const WILD = SUBJECTS.filter((s) => s.kind === 'wildlife' && s.spawn);

export class Animals {
  readonly active = new Map<string, Active>();
  private timer = 0;
  private world: World;
  private scene: THREE.Scene;
  /** player state for reactions */
  player = { pos: new THREE.Vector3(), speed: 0, onFoot: false };
  window: Window = 'morning';
  weather = 'clear';
  /** M5: allows road-crossing behaviour */
  crossings = true;
  onCross: ((a: Active) => void) | null = null;

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
  }

  dispose() {
    for (const a of this.active.values()) this.scene.remove(a.obj);
    this.active.clear();
  }

  /** Deterministic spawn list for a chunk (positions only depend on the seed). */
  spawnsFor(c: number): { uid: string; def: SubjectDef; pos: THREE.Vector3; alt: number }[] {
    const w = this.world;
    const out: { uid: string; def: SubjectDef; pos: THREE.Vector3; alt: number }[] = [];
    const s0 = c * CHUNK;
    const biome = w.dominantBiome(s0 + CHUNK / 2);
    WILD.forEach((def, di) => {
      if (def.page !== biome) return;
      if (def.india && !FEATURES.india) return;
      const sp = def.spawn!;
      const r = new Rng(hashInts(w.seed, SYS.subject, c, di));
      const n = Math.floor(sp.perChunk) + (r.chance(sp.perChunk % 1) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const p = this.place(def, c, r);
        if (!p) continue;
        const g = sp.group ? r.int(sp.group[0], sp.group[1]) : 1;
        for (let k = 0; k < g; k++) {
          const jitter = k === 0 ? [0, 0] : [r.range(-5, 5), r.range(-5, 5)];
          const x = p[0] + jitter[0], z = p[1] + jitter[1];
          out.push({ uid: `${def.id}:${c}:${i}:${k}`, def, pos: new THREE.Vector3(x, 0, z), alt: p[2] });
        }
      }
    });
    // hidden spots at the end of side roads always hold something rare (in its time window)
    for (const site of chunkSites(w, c)) {
      if (site.kind !== 'hidden') continue;
      const def = rareForSite(site);
      const off = def.spawn!.place === 'air' ? 20 : 0;
      out.push({ uid: `hidden:${site.id}`, def, pos: new THREE.Vector3(site.x + 6, 0, site.z + 4), alt: off });
    }
    return out;
  }

  private place(def: SubjectDef, c: number, r: Rng): [number, number, number] | null {
    const w = this.world;
    const s = c * CHUNK + r.range(10, CHUNK - 10);
    const road = w.road(s);
    const side = r.chance(0.5) ? 1 : -1;
    const at = (u: number): [number, number] => [road.x + road.nx * u, road.z + road.nz * u];
    const dry = (x: number, z: number) => w.waterAt(x, z) === null && w.height(x, z) > SEA_LEVEL + 1;
    switch (def.spawn!.place) {
      case 'meadow': case 'scrub': case 'field': case 'rocks': {
        for (let t = 0; t < 4; t++) {
          const [x, z] = at(side * r.range(18, def.spawn!.place === 'rocks' ? 60 : 140));
          if (dry(x, z)) return [x, z, 0];
        }
        return null;
      }
      case 'trees': {
        const [x, z] = at(side * r.range(9, 40));
        return dry(x, z) ? [x, z, 0] : null;
      }
      case 'roadside': {
        const [x, z] = at(side * r.range(ROAD_HALF + 1.5, ROAD_HALF + 6));
        return dry(x, z) ? [x, z, 0] : null;
      }
      case 'parapet': {
        const [x, z] = at(side * (ROAD_HALF + 1.1));
        return [x, z, 0];
      }
      case 'road': {
        const [x, z] = at(r.range(-0.6, 0.6));
        return [x, z, 0];
      }
      case 'town': {
        if (townDensity(w, s) <= 0) return null;
        const [x, z] = at(side * r.range(ROAD_HALF + 2.5, ROAD_HALF + 5));
        return [x, z, 0];
      }
      case 'air': {
        const [x, z] = at(side * r.range(15, 120));
        return [x, z, r.range(14, 36)];
      }
      case 'lake': {
        const F = w.chunkFeatures(c);
        const L = F.lakes[r.int(0, Math.max(0, F.lakes.length - 1))];
        if (!L) {
          if (!F.river) return null;
          const d = r.range(-60, 60);
          const zr = w.riverZ(F.river, d) + (F.river.width + 1.5) * (r.chance(0.5) ? 1 : -1);
          const rr = w.road(zr);
          return [rr.x + d / rr.cosA, zr, 0];
        }
        const a = r.range(0, Math.PI * 2);
        return [L.x + Math.cos(a) * L.r * 1.02, L.z + Math.sin(a) * L.r * 1.02, 0];
      }
      case 'shore': {
        const seaSide = w.seaSide(w.segIndex(s));
        for (let u = 40; u < 200; u += 6) {
          const [x, z] = at(seaSide * u);
          const h = w.height(x, z);
          if (h > 0.3 && h < 2.5) return [x, z, 0];
        }
        return null;
      }
      case 'offshore': {
        const seaSide = w.seaSide(w.segIndex(s));
        const [x, z] = at(seaSide * r.range(220, 420));
        return w.height(x, z) < -3 ? [x, z, 0] : null;
      }
      case 'lake' as never:
      default:
        return null;
    }
  }

  private allowed(def: SubjectDef) {
    const sp = def.spawn!;
    if (sp.windows && !sp.windows.includes(this.window)) return false;
    if (def.weather && !def.weather.includes(this.weather)) return false;
    return true;
  }

  update(dt: number, focus: THREE.Vector3, camPos: THREE.Vector3) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1.5;
      const pc = Math.floor(focus.z / CHUNK);
      const want = new Set<string>();
      for (let c = pc - 2; c <= pc + 2; c++) {
        for (const sp of this.spawnsFor(c)) {
          if (Math.hypot(sp.pos.x - focus.x, sp.pos.z - focus.z) > 420) continue;
          if (!this.allowed(sp.def)) continue;
          want.add(sp.uid);
          if (!this.active.has(sp.uid)) this.spawn(sp.uid, sp.def, sp.pos, sp.alt);
        }
      }
      for (const [uid, a] of this.active) {
        if (want.has(uid)) continue;
        // despawn quietly when out of sight range
        if (a.obj.position.distanceTo(camPos) > 140 || !this.active.has(uid) || a.state === 'gone') {
          this.scene.remove(a.obj);
          disposeTree(a.obj);
          this.active.delete(uid);
        }
      }
    }
    for (const a of this.active.values()) this.behave(a, dt);
  }

  private spawn(uid: string, def: SubjectDef, pos: THREE.Vector3, alt: number) {
    const obj = makeAnimal(def.model === 'cowlying' && (uid.length + Math.floor(Math.abs(pos.x))) % 2 ? 'buffalolying' : def.model!);
    const rng = new Rng(hashInts(this.world.seed, SYS.life, uid.length, Math.floor(pos.x * 10), Math.floor(pos.z * 10)));
    const y = this.world.ground(pos.x, pos.z);
    obj.position.set(pos.x, y + alt, pos.z);
    obj.rotation.y = rng.range(0, Math.PI * 2);
    obj.userData.uid = uid;
    obj.userData.def = def.id;
    this.scene.add(obj);
    const a: Active = { uid, def, obj, home: new THREE.Vector3(pos.x, y, pos.z), target: new THREE.Vector3(pos.x, y, pos.z), state: 'idle', timer: rng.range(1, 5), phase: rng.range(0, 6), alt, rng, vel: 0, heading: obj.rotation.y };
    if (def.model === 'whale') obj.position.y = -6;
    this.active.set(uid, a);
  }

  /** Fast approach scares animals; slow or on-foot approach keeps them calm. */
  private scared(a: Active): boolean {
    const p = this.player;
    const d = Math.hypot(a.obj.position.x - p.pos.x, a.obj.position.z - p.pos.z);
    if (a.def.model === 'cowlying' || a.def.model === 'whale' || a.def.model === 'seal') return false;
    if (p.onFoot) return d < (p.speed > 2.0 ? 7 : 2.5);
    return d < 26 && p.speed > 22 / 3.6;
  }

  private behave(a: Active, dt: number) {
    this.move(a, dt);
    // pack animals: pick the clip for what the animal is doing, then advance it
    const rig = a.obj.userData.rig as AnimalRig | undefined;
    if (!rig || !a.obj.visible) return;
    const gait = a.obj.userData.gait as string;
    if (gait === 'still') return; // posed once (lying down)
    if (a.state === 'flee') { rig.extra = []; rig.play('Gallop', 0.2); }
    else if (a.state === 'walk') rig.play('Walk', 0.3);
    else if (gait === 'whale') rig.play('Swim');
    // grazers spend about half their standing time with their heads down
    else rig.play(a.obj.userData.grazes && Math.sin(a.phase * 0.21 + a.uid.length) > 0 ? 'Eating' : 'Idle', 0.5);
    rig.update(dt);
  }

  private move(a: Active, dt: number) {
    const o = a.obj;
    const gait = o.userData.gait as string;
    const limbs = o.userData.limbs as THREE.Object3D[];
    const w = this.world;
    a.phase += dt;
    if (gait === 'flyer') {
      // circle the home point, wings flapping, gliding sometimes
      const R = 18 + (a.uid.length % 5) * 4;
      const ang = a.phase * (6 / R);
      const x = a.home.x + Math.cos(ang) * R, z = a.home.z + Math.sin(ang) * R;
      o.position.set(x, a.home.y + a.alt + Math.sin(a.phase * 0.7) * 2, z);
      o.rotation.y = -ang + Math.PI;
      o.rotation.z = 0.25;
      const flap = Math.sin(a.phase * 8) > -0.2 && Math.sin(a.phase * 0.5) > 0 ? Math.sin(a.phase * 12) * 0.6 : 0.1;
      for (const l of limbs) l.rotation.z = flap * (l.userData.side as number);
      return;
    }
    if (gait === 'flutter') {
      const t = a.phase;
      o.position.set(a.home.x + Math.sin(t * 0.7) * 3 + Math.sin(t * 2.3) * 0.5, w.ground(a.home.x, a.home.z) + 0.6 + Math.sin(t * 1.7) * 0.3, a.home.z + Math.cos(t * 0.5) * 3);
      o.rotation.y = t * 0.8;
      for (const l of limbs) l.rotation.z = Math.sin(t * 25) * 0.9 * (l.userData.side as number);
      return;
    }
    if (gait === 'whale') {
      // surface cycle: 30 s period, ~8 s visible
      const cyc = (a.phase % 30) / 30;
      const up = cyc < 0.28 ? Math.sin((cyc / 0.28) * Math.PI) : 0;
      o.position.y = -6 + up * 6.4;
      o.position.x = a.home.x + Math.sin(a.phase * 0.05) * 30;
      o.rotation.x = cyc < 0.28 ? (cyc / 0.28 - 0.5) * 0.4 : 0;
      o.visible = o.position.y > -5;
      return;
    }
    if (gait === 'still' || gait === 'sitter') {
      o.scale.y = 1 + Math.sin(a.phase * 1.8) * 0.015;
      if (gait === 'sitter') o.rotation.y = a.heading + Math.sin(a.phase * 0.3) * 0.6;
      o.position.y = w.ground(o.position.x, o.position.z) + (a.def.spawn?.place === 'parapet' ? 0.6 : 0);
      if (this.scared(a) && gait === 'sitter') this.flee(a);
      if (a.state !== 'flee') return;
    }
    // walkers (quads and ground birds)
    if (a.state !== 'flee' && this.scared(a)) this.flee(a);
    a.timer -= dt;
    if (a.state === 'idle' && a.timer <= 0) {
      a.state = 'walk';
      const rad = gait === 'bird' ? 3 : 14;
      a.target.set(a.home.x + a.rng.range(-rad, rad), 0, a.home.z + a.rng.range(-rad, rad));
      // occasionally a deer or elephant crosses the road
      if (this.crossings && (a.def.id === 'deer' || a.def.id === 'elephant' || a.def.id === 'tiger') && a.rng.chance(a.def.id === 'tiger' ? 0.6 : 0.25)) {
        const r = w.road(a.home.z);
        const u = (a.home.x - r.x) * r.cosA;
        a.target.set(r.x - Math.sign(u) * (ROAD_HALF + 8) * r.nx, 0, r.z - Math.sign(u) * (ROAD_HALF + 8) * r.nz);
        a.crossing = true;
        this.onCross?.(a);
      }
      a.timer = 12;
    }
    if (a.state === 'walk' || a.state === 'flee') {
      const dx = a.target.x - o.position.x, dz = a.target.z - o.position.z;
      const d = Math.hypot(dx, dz);
      const speed = (o.userData.speed as number) * (a.state === 'flee' ? 3.2 : 1);
      if (d < 0.4 || a.timer <= 0) {
        if (a.state === 'flee') { a.state = 'gone'; o.visible = false; return; }
        a.state = 'idle';
        a.timer = a.rng.range(3, 9);
        if (a.crossing) { a.home.set(o.position.x, 0, o.position.z); a.crossing = false; }
      } else {
        const want = Math.atan2(-dx, -dz);
        let dh = want - a.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        a.heading += dh * Math.min(1, dt * 4);
        const step = Math.min(d, speed * dt);
        o.position.x += -Math.sin(a.heading) * step;
        o.position.z += -Math.cos(a.heading) * step;
        o.rotation.y = a.heading;
        a.vel = speed;
      }
    } else a.vel = 0;
    o.position.y = w.ground(o.position.x, o.position.z);
    // limb swing
    const moving = a.state === 'walk' || a.state === 'flee';
    const k = moving ? (a.state === 'flee' ? 14 : 7) : 0;
    for (const l of limbs) {
      if (l.userData.axis === 'x') l.rotation.x = moving ? Math.sin(a.phase * k + (l.userData.phase as number)) * 0.5 : 0;
      else {
        // ground birds keep wings folded, flapping when fleeing
        l.scale.x = a.state === 'flee' ? 1 : 0.35;
        l.rotation.z = a.state === 'flee' ? Math.sin(a.phase * 18) * 0.7 * (l.userData.side as number) : -0.2 * (l.userData.side as number);
      }
    }
    if (a.state === 'flee' && gait === 'bird') o.position.y += Math.min(12, (12 - a.timer) * 2.5);
  }

  private flee(a: Active) {
    a.state = 'flee';
    const p = this.player.pos;
    const dx = a.obj.position.x - p.x, dz = a.obj.position.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    a.target.set(a.obj.position.x + (dx / d) * 40, 0, a.obj.position.z + (dz / d) * 40);
    a.timer = 6;
  }

  /** Subject candidates for photo scoring. */
  subjects(): { uid: string; defId: string; pos: THREE.Vector3; r: number; h: number }[] {
    const out = [];
    for (const a of this.active.values()) {
      if (!a.obj.visible || a.state === 'gone') continue;
      out.push({ uid: a.uid, defId: a.def.id, pos: a.obj.position.clone(), r: a.def.size[0], h: a.def.size[1] });
    }
    return out;
  }
}
