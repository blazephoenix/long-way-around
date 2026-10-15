// Traffic on the main road: lane-following vehicles in both directions (traffic keeps left),
// keeping distance, easing past slow obstacles, waiting for animals, overtaking a stopped player.
import * as THREE from 'three';
import { World, LANE, ROAD_HALF } from '../world/world';
import { vehicleModel, VehicleKind, lifeMat, truckBack, autoSticker } from '../render/lifeModels';
import { matGlow } from '../render/props';
import { BIOMES } from '../../data/biomes';
import { FEATURES } from '../core/features';
import { disposeTree } from '../render/models';

export interface Vehicle {
  id: number;
  kind: VehicleKind;
  s: number;
  dir: 1 | -1;
  speed: number; // m/s
  cruise: number; // m/s
  lat: number; // current lateral offset
  latTarget: number;
  length: number;
  obj: THREE.Group;
  waited: number;
  honked: boolean;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  speed: number; // along +z (signed)
  kind: 'player' | 'animal' | 'procession';
}

const MIX: Record<string, [VehicleKind, number][]> = {
  forest: [['car', 4], ['hatch', 3], ['van', 1], ['truck', 1.5], ['bus', 0.6]],
  coast: [['car', 4], ['hatch', 3], ['van', 1.5], ['bus', 0.8], ['truck', 0.8]],
  desert: [['truck', 3], ['car', 2], ['van', 1]],
  farm: [['car', 2], ['hatch', 2], ['tractor', 2], ['truck', 1.5], ['bus', 0.6]],
  tropical: [['car', 3], ['hatch', 3], ['bus', 1.2], ['truck', 1]],
  city: [['car', 4], ['hatch', 4], ['bus', 1.6], ['van', 1.5], ['truck', 0.5]],
};

export class Traffic {
  vehicles: Vehicle[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  obstacles: Obstacle[] = [];
  onHorn: ((v: Vehicle) => void) | null = null;

  constructor(private world: World, private scene: THREE.Scene) {}

  dispose() {
    for (const v of this.vehicles) this.scene.remove(v.obj);
    this.vehicles = [];
  }

  private pickKind(biome: string): VehicleKind {
    const mix = [...(MIX[biome] ?? MIX.forest)];
    if (FEATURES.india) {
      mix.push(['painted', biome === 'desert' || biome === 'farm' ? 2.5 : 1.2]);
      if (biome === 'city' || biome === 'farm' || biome === 'coast') mix.push(['auto', biome === 'city' ? 4 : 1.5]);
    }
    let tot = 0;
    for (const m of mix) tot += m[1];
    let r = Math.random() * tot;
    for (const m of mix) if ((r -= m[1]) <= 0) return m[0];
    return 'car';
  }

  private spawn(s: number, dir: 1 | -1) {
    const biome = this.world.dominantBiome(s);
    const kind = this.pickKind(biome);
    const seed = Math.floor(Math.random() * 1000);
    const vm = vehicleModel(kind, seed);
    const obj = new THREE.Group();
    const body = new THREE.Mesh(vm.body, lifeMat);
    body.castShadow = true;
    obj.add(body, new THREE.Mesh(vm.lamps, matGlow));
    if (kind === 'painted') obj.add(truckBack(seed));
    if (kind === 'auto' && seed % 2 === 0) obj.add(autoSticker(seed));
    this.scene.add(obj);
    const cruise = (vm.speed[0] + Math.random() * (vm.speed[1] - vm.speed[0])) / 3.6;
    const v: Vehicle = { id: this.nextId++, kind, s, dir, speed: cruise, cruise, lat: dir * LANE, latTarget: dir * LANE, length: vm.length, obj, waited: 0, honked: false };
    this.vehicles.push(v);
    this.place(v);
  }

  private place(v: Vehicle) {
    const r = this.world.road(v.s);
    v.obj.position.set(r.x + r.nx * v.lat, r.y + 0.05, r.z + r.nz * v.lat);
    const yaw = Math.atan2(-r.tx, -r.tz) + (v.dir < 0 ? Math.PI : 0);
    v.obj.rotation.set(Math.atan(r.grade) * v.dir, yaw, 0, "YXZ");
  }

  update(dt: number, playerZ: number, density: number) {
    // spawn just beyond view so cars never pop in close
    const biome = this.world.dominantBiome(playerZ);
    const perKm = BIOMES[biome].life.traffic * density;
    const target = Math.round(perKm * 1.2 * 2);
    // fill an empty road quickly (start of a drive, after a teleport), out in the haze
    let fills = 0;
    while (this.vehicles.length < target * 0.5 && fills++ < 6) {
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const s = playerZ + (Math.random() < 0.5 ? 1 : -1) * (220 + Math.random() * 380);
      if (!this.vehicles.some((o) => o.dir === dir && Math.abs(o.s - s) < 40)) this.spawn(s, dir);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.vehicles.length < target) {
      this.spawnTimer = 0.6 + Math.random();
      const ahead = Math.random() < 0.5;
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const s = playerZ + (ahead ? 1 : -1) * (520 + Math.random() * 80);
      if (!this.vehicles.some((o) => o.dir === dir && Math.abs(o.s - s) < 40)) this.spawn(s, dir);
    }
    // update
    for (const v of this.vehicles) {
      let want = v.cruise;
      // gap to whatever is ahead in my lane
      let gap = Infinity;
      let aheadSpeed = 0;
      for (const o of this.vehicles) {
        if (o === v || o.dir !== v.dir || Math.abs(o.lat - v.lat) > 1.6) continue;
        const d = (o.s - v.s) * v.dir;
        if (d > 0 && d < gap) { gap = d - (o.length + v.length) / 2; aheadSpeed = o.speed; }
      }
      let blockedByPlayer = false;
      for (const ob of this.obstacles) {
        const r = this.world.road(ob.z);
        const lat = (ob.x - r.x) * r.cosA;
        if (Math.abs(lat - v.lat) > ob.r + 1.3) continue;
        const d = (ob.z - v.s) * v.dir - v.length / 2 - ob.r;
        if (ob.kind === 'animal' && d > -2 && d < 40) {
          // ease around a resting cow or buffalo on the shoulder side, slowly
          const edge = v.dir * (ROAD_HALF + 0.4);
          if (Math.abs(lat - edge) > ob.r + 1.2) {
            v.latTarget = edge;
            want = Math.min(want, 3.5);
            continue;
          }
        }
        if (d > -1 && d < gap) {
          gap = d;
          aheadSpeed = Math.max(0, ob.speed * v.dir);
          blockedByPlayer = ob.kind === 'player';
          if (ob.kind === 'animal' && d < 40) aheadSpeed = 0;
        }
      }
      const safe = 6 + v.speed * 1.4;
      if (gap < safe) want = Math.min(want, aheadSpeed * (gap < safe * 0.5 ? 0.6 : 1));
      if (gap < 3) want = 0;
      // overtake a stopped/slow player after a polite wait, if the other lane is clear
      if (blockedByPlayer && gap < 25 && aheadSpeed < 3) {
        v.waited += dt;
        if (v.waited > 4 && v.kind !== 'tractor') {
          const clear = !this.vehicles.some((o) => o.dir !== v.dir && Math.abs(o.s - v.s) < 120);
          if (clear) {
            v.latTarget = -v.dir * LANE * 0.9;
            if (!v.honked) { v.honked = true; this.onHorn?.(v); }
          }
        }
      } else if (Math.abs(v.latTarget - v.dir * LANE) > 0.1 && gap > 30 && !this.obstacles.some((ob) => ob.kind === 'animal' && Math.abs(ob.z - v.s) < 30)) {
        v.waited = 0;
        // pull back into lane once past
        if (!this.obstacles.some((ob) => ob.kind === 'player' && Math.abs(ob.z - v.s) < 14)) v.latTarget = v.dir * LANE;
      }
      if (Math.abs(v.latTarget - v.dir * LANE) > 0.1) want = Math.max(want, Math.min(v.cruise, 9));
      v.speed += THREE.MathUtils.clamp(want - v.speed, -6 * dt, 2.2 * dt);
      v.speed = Math.max(0, v.speed);
      v.lat += THREE.MathUtils.clamp(v.latTarget - v.lat, -1.5 * dt, 1.5 * dt);
      v.s += v.speed * v.dir * dt;
      this.place(v);
    }
    // recycle far vehicles
    this.vehicles = this.vehicles.filter((v) => {
      if (Math.abs(v.s - playerZ) > 700) {
        this.scene.remove(v.obj);
        disposeTree(v.obj);
        return false;
      }
      return true;
    });
  }

  /** Vehicles as soft colliders for the player car and walker. */
  colliders(x: number, z: number, fn: (cx: number, cz: number, r: number) => void) {
    for (const v of this.vehicles) {
      const p = v.obj.position;
      if (Math.abs(p.z - z) > 20) continue;
      const fx = -Math.sin(v.obj.rotation.y), fz = -Math.cos(v.obj.rotation.y);
      const n = Math.max(1, Math.round(v.length / 2.2));
      for (let i = 0; i < n; i++) {
        const t = (i / Math.max(1, n - 1) - 0.5) * (v.length - 2);
        fn(p.x + fx * t, p.z + fz * t, 1.1);
      }
    }
  }

  nearRoadAhead(z: number) {
    return this.vehicles.filter((v) => Math.abs(v.s - z) < 120);
  }

  static roadHalf = ROAD_HALF;
}
