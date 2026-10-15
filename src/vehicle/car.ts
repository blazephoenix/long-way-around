// Forgiving arcade car: four terrain raycasts, spring/damper body, speed-sensitive
// steering, high grip, auto-stabilised (never flips), soft collisions, cruise control.
import * as THREE from 'three';
import type { World, Surface } from '../world/world';
import { ECON } from '../../data/economy';

export const KMH = 3.6;
const WHEELBASE = 2.6;
const TRACK = 1.55;
const RIDE = 0.55;

export const SURFACE_TOP: Record<Surface, number> = {
  asphalt: 110 / KMH,
  gravel: 80 / KMH,
  dirt: 70 / KMH,
  offroad: 66 / KMH, // 60% of asphalt
};
export const SURFACE_BURN: Record<Surface, number> = { asphalt: 1, gravel: 1.3, dirt: 1.5, offroad: 2 };
export const RESERVE_TOP = 25 / KMH;

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

export interface BumpEvent {
  strength: number;
}

export class Car {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3(); // world xz velocity
  yaw = Math.PI; // facing +z
  speed = 0; // signed forward speed
  steerAngle = 0;
  bodyY = 0;
  bodyVY = 0;
  pitch = 0;
  pitchV = 0;
  roll = 0;
  rollV = 0;
  rpm = 800;
  gear = 1;
  cruise: number | null = null;
  surface: Surface = 'asphalt';
  fuel = 1; // 0..1
  odometer = 0;
  reserve = false;
  bumps: BumpEvent[] = [];
  wheelSpin = 0;
  readonly forward = new THREE.Vector3();
  readonly right = new THREE.Vector3();
  inWater = false;
  /** set while nobody is driving: the car holds still (handbrake on, in gear) */
  parked = false;
  private world: World;
  /** collider query provided by the streamer */
  colliders: ((x: number, z: number, r: number, fn: (cx: number, cz: number, cr: number) => void) => void) | null = null;
  extraColliders: ((x: number, z: number, fn: (cx: number, cz: number, cr: number) => void) => void) | null = null;

  constructor(world: World) {
    this.world = world;
  }

  place(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.bodyY = this.world.ground(x, z) + RIDE;
    this.pos.y = this.bodyY;
    this.bodyVY = 0;
    this.pitch = this.roll = 0;
    this.cruise = null;
  }

  get kmh() {
    return Math.abs(this.speed) * KMH;
  }

  toggleCruise() {
    if (this.cruise !== null) this.cruise = null;
    else if (this.speed > 3) this.cruise = this.speed;
  }

  update(dt: number, inp: CarInput) {
    const w = this.world;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.forward.set(fx, 0, fz);
    this.right.set(rx, 0, rz);

    this.surface = w.surfaceAt(this.pos.x, this.pos.z);
    this.reserve = this.fuel <= 0;
    let top = SURFACE_TOP[this.surface];
    if (this.reserve) top = Math.min(top, RESERVE_TOP);

    // decompose velocity
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vL = this.vel.x * rx + this.vel.z * rz;
    if (this.parked) {
      // bleed off any leftover motion quickly, then stay put (no creep on slopes)
      const k = Math.exp(-8 * dt);
      vF *= k;
      vL *= k;
      if (Math.abs(vF) < 0.05) vF = 0;
      if (Math.abs(vL) < 0.05) vL = 0;
      this.cruise = null;
      inp = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    }

    // cruise control: brake cancels, throttle above cruise just accelerates
    let throttle = inp.throttle;
    if (inp.brake > 0.1 || inp.handbrake) this.cruise = null;
    if (this.cruise !== null) {
      const target = Math.min(this.cruise, top);
      const err = target - vF;
      throttle = Math.max(throttle, THREE.MathUtils.clamp(err * 0.6, 0, 1));
    }

    // engine: strong low-end, tapering to zero at top speed
    let acc = 0;
    if (throttle > 0) {
      if (vF < -0.5) acc += 9 * throttle; // braking out of reverse
      else acc += throttle * 5.2 * Math.max(0, 1 - Math.pow(Math.max(vF, 0) / top, 2.2));
    }
    if (inp.brake > 0) {
      if (vF > 0.4) acc -= 10 * inp.brake;
      else acc -= 4.5 * inp.brake * Math.max(0, 1 - Math.max(-vF, 0) / (24 / KMH));
    }
    if (inp.handbrake) acc -= Math.sign(vF) * Math.min(Math.abs(vF) / dt, 5.5);
    // over top speed (e.g. leaving asphalt): ease down
    if (Math.abs(vF) > top) acc -= Math.sign(vF) * Math.min(3.5, (Math.abs(vF) - top) * 1.5);
    // rolling + aero drag
    const rollRes = this.surface === 'asphalt' ? 0.18 : this.surface === 'offroad' ? 0.6 : 0.4;
    acc -= Math.sign(vF) * (rollRes + 0.0009 * vF * vF);
    if (throttle === 0 && inp.brake === 0 && Math.abs(vF) < 0.25) { vF = 0; acc = 0; }
    // slope: gravity along the car's forward axis
    if (!this.parked) acc -= 9.81 * Math.sin(this.pitch) * 0.8;
    else acc = 0;
    const nvF = vF + acc * dt;
    if (inp.brake > 0 && vF > 0 && nvF < 0 && throttle === 0) vF = 0; // stop, then reverse on next press
    else vF = nvF;

    // steering: speed-sensitive, smoothed
    const maxSteer = 0.6 / (1 + Math.abs(vF) * 0.21);
    const target = inp.steer * maxSteer;
    this.steerAngle += (target - this.steerAngle) * Math.min(1, dt * (inp.steer === 0 ? 6 : 4));
    let yawRate = (vF * Math.tan(this.steerAngle)) / WHEELBASE;
    if (inp.handbrake && Math.abs(vF) > 6) yawRate *= 1.45;
    this.yaw -= yawRate * dt;

    // lateral grip (handbrake lets the rear step out)
    const grip = inp.handbrake ? 1.8 : this.surface === 'asphalt' ? 14 : 9;
    vL *= Math.exp(-grip * dt);

    // recompose with new heading
    const nfx = -Math.sin(this.yaw), nfz = -Math.cos(this.yaw);
    const nrx = Math.cos(this.yaw), nrz = -Math.sin(this.yaw);
    this.vel.set(nfx * vF + nrx * vL, 0, nfz * vF + nrz * vL);
    this.speed = vF;
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.pos.x = nx;
    this.pos.z = nz;
    this.odometer += moved;
    // fuel: full tank lasts about ECON.tankKm on asphalt
    if (this.fuel > 0) this.fuel = Math.max(0, this.fuel - (moved / (ECON.tankKm * 1000)) * SURFACE_BURN[this.surface]);

    this.collide();

    // suspension: four wheel heights
    const hw = TRACK / 2, hl = WHEELBASE / 2;
    const bump = this.surface === 'offroad' ? 0.05 : this.surface === 'asphalt' ? 0 : 0.025;
    const t = performance.now() * 0.001;
    const g = (lx: number, lz: number) => {
      const x = this.pos.x + nrx * lx + nfx * lz;
      const z = this.pos.z + nrz * lx + nfz * lz;
      let h = w.ground(x, z);
      if (bump) h += bump * (Math.sin(x * 2.1 + t * 0.1) * Math.cos(z * 1.7) + Math.sin(x * 5.3 + z * 4.1) * 0.5);
      return h;
    };
    const hFL = g(-hw, hl), hFR = g(hw, hl), hRL = g(-hw, -hl), hRR = g(hw, -hl);
    const avg = (hFL + hFR + hRL + hRR) / 4;
    const targetY = avg + RIDE;
    // spring-damper
    const k = 140, c = 20;
    this.bodyVY += (k * (targetY - this.bodyY) - c * this.bodyVY - 0) * dt;
    this.bodyY += this.bodyVY * dt;
    if (this.bodyY < targetY - 0.25) { this.bodyY = targetY - 0.25; this.bodyVY = Math.max(0, this.bodyVY); }
    // never sink below ground, and catch big drops softly
    if (this.bodyY > targetY + 1.5) { this.bodyVY -= 9.81 * dt; }
    this.pos.y = this.bodyY;
    const tPitch = Math.atan2((hFL + hFR) / 2 - (hRL + hRR) / 2, WHEELBASE) - acc * 0.006;
    const tRoll = Math.atan2((hFL + hRL) / 2 - (hFR + hRR) / 2, TRACK) + yawRate * vF * 0.0035;
    this.pitchV += (90 * (tPitch - this.pitch) - 14 * this.pitchV) * dt;
    this.rollV += (90 * (tRoll - this.roll) - 14 * this.rollV) * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.pitchV * dt, -0.45, 0.45);
    this.roll = THREE.MathUtils.clamp(this.roll + this.rollV * dt, -0.35, 0.35);

    // water: gently refuse deep water (sea, lakes)
    const water = w.waterAt(this.pos.x, this.pos.z);
    this.inWater = water !== null && avg < water - 0.3;
    if (this.inWater) {
      this.vel.multiplyScalar(Math.exp(-3 * dt));
      // nudge back toward the road
      const r = w.road(this.pos.z);
      const dx = r.x - this.pos.x;
      this.pos.x += Math.sign(dx) * 4 * dt;
      this.speed *= Math.exp(-3 * dt);
    }

    // engine rpm for audio
    const gearTop = [0, 6, 11, 17, 24, 40];
    let gear = 1;
    while (gear < 5 && Math.abs(vF) > gearTop[gear]) gear++;
    this.gear = gear;
    const lo = gearTop[gear - 1], hi = gearTop[gear];
    const frac = THREE.MathUtils.clamp((Math.abs(vF) - lo) / (hi - lo), 0, 1);
    const tRpm = 900 + frac * 3200 + throttle * 600;
    this.rpm += (tRpm - this.rpm) * Math.min(1, dt * 5);
    this.wheelSpin += (vF / 0.33) * dt;
  }

  private collide() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const centers = [[1.15, 0.95], [-1.15, 0.95]] as const;
    let hit = 0;
    const check = (cx: number, cz: number, cr: number) => {
      for (const [off, r] of centers) {
        const px = this.pos.x + fx * off, pz = this.pos.z + fz * off;
        const dx = px - cx, dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        const R = r + cr;
        if (d2 < R * R && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          const push = R - d;
          this.pos.x += nx * push;
          this.pos.z += nz * push;
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            this.vel.x -= nx * vn * 1.25;
            this.vel.z -= nz * vn * 1.25;
            hit = Math.max(hit, -vn);
          }
        }
      }
    };
    this.colliders?.(this.pos.x, this.pos.z, 3, check);
    this.extraColliders?.(this.pos.x, this.pos.z, check);
    if (hit > 0.5) {
      this.vel.multiplyScalar(0.7);
      this.speed = this.vel.x * fx + this.vel.z * fz;
      this.cruise = null;
      this.bumps.push({ strength: Math.min(1, hit / 10) });
    }
  }
}
