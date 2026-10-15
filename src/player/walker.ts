// On-foot controller: capsule on the terrain heightfield, walk/jog, soft collisions.
import * as THREE from 'three';
import type { World } from '../world/world';

export const EYE_H = 1.62;
const R = 0.35;
const WALK = 12 / 3.6;
const JOG = 22 / 3.6;

export class Walker {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  bob = 0;
  moving = 0;
  colliders: ((x: number, z: number, r: number, fn: (cx: number, cz: number, cr: number) => void) => void) | null = null;
  extra: ((x: number, z: number, fn: (cx: number, cz: number, cr: number) => void) => void) | null = null;
  constructor(private world: World) {}

  place(x: number, z: number, yaw: number) {
    this.pos.set(x, this.world.ground(x, z), z);
    this.yaw = yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
  }

  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE_H + Math.sin(this.bob) * 0.03 * this.moving, this.pos.z);
  }

  update(dt: number, move: [number, number], jog: boolean, look: [number, number]) {
    this.yaw -= look[0];
    this.pitch = THREE.MathUtils.clamp(this.pitch - look[1], -1.45, 1.45);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = move[0], my = move[1];
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    const speed = jog ? JOG : WALK;
    const tx = (fx * my + rx * mx) * speed;
    const tz = (fz * my + rz * mx) * speed;
    const k = Math.min(1, dt * 10);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    // don't wade into deep water
    const water = this.world.waterAt(nx, nz);
    const gNew = this.world.ground(nx, nz);
    if (water !== null && gNew < water - 0.6) { nx = this.pos.x; nz = this.pos.z; this.vel.set(0, 0, 0); }
    // very steep: slide back gently
    const gOld = this.world.ground(this.pos.x, this.pos.z);
    if (gNew - gOld > 0.9 * Math.hypot(nx - this.pos.x, nz - this.pos.z) + 0.02 && gNew - gOld > 0) {
      nx = this.pos.x + (nx - this.pos.x) * 0.35;
      nz = this.pos.z + (nz - this.pos.z) * 0.35;
    }
    const push = (cx: number, cz: number, cr: number) => {
      const dx = nx - cx, dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      const rr = R + cr;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * rr;
        nz = cz + (dz / d) * rr;
      }
    };
    this.colliders?.(nx, nz, 1, push);
    this.extra?.(nx, nz, push);
    this.pos.x = nx;
    this.pos.z = nz;
    const g = this.world.ground(nx, nz);
    this.pos.y += (g - this.pos.y) * Math.min(1, dt * 18);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.moving = Math.min(1, sp / WALK);
    this.bob += dt * (jog ? 11 : 7.5) * this.moving;
  }
}
