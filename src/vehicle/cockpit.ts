// The player's car: exterior model (seen on foot) and a right-hand-drive cockpit
// (traffic keeps left). The dashboard is the HUD: speedometer, fuel gauge, clock, radio.
import * as THREE from 'three';
import { ModelBuilder } from '../render/models';
import { toon, matVC } from '../render/toon';

export const EYE = new THREE.Vector3(0.36, 0.74, 0.16);

export interface DashState {
  kmh: number;
  fuel: number;
  hour: number;
  station: string;
  freq: string;
  lowFuel: boolean;
  reserve: boolean;
  cruise: boolean;
  headlights: boolean;
  units: 'km' | 'mi';
  odometerKm: number;
  night: number;
  film: number;
  money: string;
}

function canvasTex(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, ctx: c.getContext('2d')!, t };
}

class Pendulum {
  angleX = 0;
  angleZ = 0;
  vx = 0;
  vz = 0;
  constructor(public group: THREE.Group, public length: number) {}
  update(dt: number, accFwd: number, accSide: number) {
    const g = 9.81 / this.length;
    this.vx += (-g * Math.sin(this.angleX) - accFwd * 0.9 / this.length) * dt;
    this.vz += (-g * Math.sin(this.angleZ) + accSide * 0.9 / this.length) * dt;
    this.vx *= Math.exp(-1.1 * dt);
    this.vz *= Math.exp(-1.1 * dt);
    this.angleX += this.vx * dt;
    this.angleZ += this.vz * dt;
    this.angleX = THREE.MathUtils.clamp(this.angleX, -1.2, 1.2);
    this.angleZ = THREE.MathUtils.clamp(this.angleZ, -1.2, 1.2);
    this.group.rotation.set(this.angleX, 0, this.angleZ);
  }
}

export class PlayerCar {
  readonly root = new THREE.Group(); // positioned/rotated by physics
  readonly exterior = new THREE.Group();
  readonly cockpit = new THREE.Group();
  readonly hood: THREE.Mesh;
  readonly paintMat = toon({ vertexColors: true, color: 0x2f6f8f });
  readonly paint2Mat = toon({ vertexColors: true, color: 0xf2efe6 });
  readonly seatMat = toon({ color: 0x5a4636 });
  readonly wheelCoverMat = toon({ color: 0x2a2a2a });
  readonly wheels: THREE.Mesh[] = [];
  readonly steering = new THREE.Group();
  readonly wipers: THREE.Group[] = [];
  readonly mirrorRT: THREE.WebGLRenderTarget;
  readonly mirrorCam: THREE.PerspectiveCamera;
  readonly mirrorPlane: THREE.Mesh;
  readonly headlights: THREE.SpotLight[] = [];
  readonly headGlow: THREE.MeshBasicMaterial;
  readonly tailGlow: THREE.MeshBasicMaterial;
  readonly dashTex;
  readonly radioTex;
  readonly hangPoint = new THREE.Group();
  readonly dashSlot = new THREE.Group();
  readonly bumperSlot = new THREE.Group();
  readonly rearSticker = new THREE.Group();
  hanging: Pendulum;
  private bobble: Pendulum;
  private dashTimer = 0;
  wiperPhase = 0;
  wiping = false;

  constructor() {
    this.root.add(this.exterior, this.cockpit);
    // ---------------- exterior
    const paint = new ModelBuilder();
    paint.box(1.78, 0.62, 4.2, 0xffffff, { p: [0, 0.02, 0] }); // lower body
    paint.box(1.74, 0.12, 1.1, 0xffffff, { p: [0, 0.38, -1.5], r: [0.08, 0, 0] }); // hood top
    paint.box(1.74, 0.14, 0.9, 0xffffff, { p: [0, 0.38, 1.65], r: [-0.05, 0, 0] }); // boot
    const body = new THREE.Mesh(paint.build(), this.paintMat);
    body.castShadow = true;
    this.exterior.add(body);
    const roof = new ModelBuilder();
    roof.box(1.56, 0.08, 1.9, 0xffffff, { p: [0, 1.0, 0.25] });
    roof.box(0.08, 0.6, 0.08, 0xffffff, { p: [0.74, 0.68, -0.62], r: [-0.55, 0, 0] });
    roof.box(0.08, 0.6, 0.08, 0xffffff, { p: [-0.74, 0.68, -0.62], r: [-0.55, 0, 0] });
    roof.box(0.08, 0.62, 0.1, 0xffffff, { p: [0.74, 0.68, 1.15], r: [0.4, 0, 0] });
    roof.box(0.08, 0.62, 0.1, 0xffffff, { p: [-0.74, 0.68, 1.15], r: [0.4, 0, 0] });
    roof.box(0.06, 0.62, 0.08, 0xffffff, { p: [0.75, 0.68, 0.3] });
    roof.box(0.06, 0.62, 0.08, 0xffffff, { p: [-0.75, 0.68, 0.3] });
    const roofM = new THREE.Mesh(roof.build(), this.paint2Mat);
    roofM.castShadow = true;
    this.exterior.add(roofM);
    const trim = new ModelBuilder();
    // glass (dark, slightly blue)
    trim.box(1.5, 0.6, 0.05, 0x2c3e50, { p: [0, 0.68, -0.6], r: [-0.55, 0, 0] });
    trim.box(1.5, 0.56, 0.05, 0x2c3e50, { p: [0, 0.68, 1.12], r: [0.42, 0, 0] });
    trim.box(0.04, 0.5, 1.6, 0x34495e, { p: [0.77, 0.68, 0.28] });
    trim.box(0.04, 0.5, 1.6, 0x34495e, { p: [-0.77, 0.68, 0.28] });
    // bumpers, grille, lamps housings
    trim.box(1.82, 0.22, 0.2, 0x3a3a3a, { p: [0, -0.18, -2.12] });
    trim.box(1.82, 0.22, 0.2, 0x3a3a3a, { p: [0, -0.18, 2.12] });
    trim.box(0.9, 0.2, 0.06, 0x222222, { p: [0, 0.12, -2.11] });
    trim.box(1.0, 0.16, 0.04, 0xf2f2f2, { p: [0, -0.02, 2.13] }); // number plate
    trim.box(1.0, 0.16, 0.04, 0xf2f2f2, { p: [0, -0.06, -2.24] });
    trim.box(0.12, 0.04, 0.2, 0x222222, { p: [0.93, 0.5, -0.55] }); // side mirrors
    trim.box(0.12, 0.04, 0.2, 0x222222, { p: [-0.93, 0.5, -0.55] });
    trim.box(0.14, 0.12, 0.18, 0x222222, { p: [0.95, 0.56, -0.55] });
    trim.box(0.14, 0.12, 0.18, 0x222222, { p: [-0.95, 0.56, -0.55] });
    const trimM = new THREE.Mesh(trim.build(), matVC);
    trimM.castShadow = true;
    this.exterior.add(trimM);
    this.headGlow = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    this.tailGlow = new THREE.MeshBasicMaterial({ color: 0x8a2a20 });
    for (const sx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), this.headGlow);
      hl.position.set(sx, 0.16, -2.11);
      this.exterior.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), this.tailGlow);
      tl.position.set(sx, 0.16, 2.11);
      this.exterior.add(tl);
    }
    const wheelGeo = new ModelBuilder()
      .cyl(0.33, 0.33, 0.24, 12, 0x222222, { r: [0, 0, Math.PI / 2] })
      .cyl(0.2, 0.2, 0.25, 8, 0xb8b8b8, { r: [0, 0, Math.PI / 2] })
      .box(0.26, 0.05, 0.3, 0x8a8a8a, {})
      .build();
    for (const [x, z] of [[-0.82, -1.3], [0.82, -1.3], [-0.82, 1.3], [0.82, 1.3]]) {
      const w = new THREE.Mesh(wheelGeo, matVC);
      w.position.set(x, -0.22, z);
      w.castShadow = true;
      this.wheels.push(w);
      this.exterior.add(w);
    }
    this.bumperSlot.position.set(0, -0.32, -2.25);
    this.exterior.add(this.bumperSlot);
    this.rearSticker.position.set(0, 0.68, 1.16);
    this.rearSticker.rotation.x = 0.42;
    this.exterior.add(this.rearSticker);

    // ---------------- cockpit (only visible from the driver's seat)
    const ck = new ModelBuilder();
    // dashboard
    ck.box(1.62, 0.22, 0.55, 0x5a5148, { p: [0, 0.24, -0.66] });
    ck.box(1.62, 0.05, 0.62, 0x4a423a, { p: [0, 0.36, -0.66], r: [0.1, 0, 0] });
    ck.box(0.5, 0.02, 0.08, 0x3e3731, { p: [0.36, 0.535, -0.66], r: [0.25, 0, 0] }); // gauge visor
    ck.box(0.5, 0.17, 0.04, 0x2a2622, { p: [0.36, 0.45, -0.66] });
    ck.box(0.3, 0.38, 0.4, 0x4a423a, { p: [0, 0.08, -0.32] }); // console
    // pillars, header, roof liner
    ck.box(0.06, 0.82, 0.08, 0x6a6157, { p: [0.77, 0.7, -0.6], r: [0.75, 0, 0.05] });
    ck.box(0.06, 0.82, 0.08, 0x6a6157, { p: [-0.77, 0.7, -0.6], r: [0.75, 0, -0.05] });
    ck.box(1.56, 0.06, 0.12, 0xb8ae9a, { p: [0, 1.12, -0.28] });
    ck.box(1.56, 0.04, 1.7, 0xd2c8b4, { p: [0, 1.15, 0.55] });
    // doors / sills
    ck.box(0.08, 0.3, 1.6, 0x6a6157, { p: [0.8, 0.28, 0.25] });
    ck.box(0.08, 0.3, 1.6, 0x6a6157, { p: [-0.8, 0.28, 0.25] });
    ck.box(0.12, 0.05, 1.2, 0x6a6560, { p: [0.75, 0.44, 0.2] });
    ck.box(0.12, 0.05, 1.2, 0x6a6560, { p: [-0.75, 0.44, 0.2] });
    // vents
    ck.box(0.12, 0.04, 0.02, 0x2a2622, { p: [-0.12, 0.31, -0.385] });
    ck.box(0.12, 0.04, 0.02, 0x2a2622, { p: [0.1, 0.31, -0.385] });
    // radio knob
    ck.cyl(0.022, 0.022, 0.03, 10, 0xbfbab0, { p: [0.14, 0.235, -0.39], r: [Math.PI / 2, 0, 0] });
    ck.cyl(0.022, 0.022, 0.03, 10, 0xbfbab0, { p: [-0.14, 0.235, -0.39], r: [Math.PI / 2, 0, 0] });
    const ckM = new THREE.Mesh(ck.build(), matVC);
    this.cockpit.add(ckM);
    // seats (covers are cosmetics)
    const seats = new ModelBuilder();
    seats.box(0.5, 0.12, 0.5, 0xffffff, { p: [0.36, -0.05, 0.45] });
    seats.box(0.5, 0.7, 0.12, 0xffffff, { p: [0.36, 0.3, 0.75], r: [-0.15, 0, 0] });
    seats.box(0.5, 0.12, 0.5, 0xffffff, { p: [-0.36, -0.05, 0.45] });
    seats.box(0.5, 0.7, 0.12, 0xffffff, { p: [-0.36, 0.3, 0.75], r: [-0.15, 0, 0] });
    const seatM = new THREE.Mesh(seats.build(), this.seatMat);
    this.cockpit.add(seatM);
    // hood seen through the windshield (paint colour)
    const hb = new ModelBuilder();
    hb.box(1.74, 0.06, 1.6, 0xffffff, { p: [0, 0.38, -1.5], r: [0.09, 0, 0] });
    hb.box(0.06, 0.03, 1.4, 0xdcdcdc, { p: [0.4, 0.43, -1.5], r: [0.09, 0, 0] });
    hb.box(0.06, 0.03, 1.4, 0xdcdcdc, { p: [-0.4, 0.43, -1.5], r: [0.09, 0, 0] });
    this.hood = new THREE.Mesh(hb.build(), this.paintMat);
    this.cockpit.add(this.hood);

    // steering wheel (rotates with input)
    const sw = new ModelBuilder();
    sw.add(new THREE.TorusGeometry(0.17, 0.02, 6, 22), 0x2a2a2a, {}, false);
    sw.box(0.32, 0.03, 0.02, 0x3a3a3a, {});
    sw.box(0.03, 0.16, 0.02, 0x3a3a3a, { p: [0, -0.08, 0] });
    sw.cyl(0.05, 0.05, 0.05, 10, 0x444444, { r: [Math.PI / 2, 0, 0] });
    const swMesh = new THREE.Mesh(sw.build(), matVC);
    const swCover = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.026, 6, 22), this.wheelCoverMat);
    swCover.visible = false;
    swCover.name = 'wheelCover';
    this.steering.add(swMesh, swCover);
    this.steering.position.set(0.36, 0.3, -0.26);
    this.steering.rotation.set(-0.5, 0, 0, 'YXZ');
    const swAxis = new THREE.Group();
    swAxis.add(this.steering);
    this.cockpit.add(swAxis);
    // column
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 8), toon({ color: 0x2a2a2a }));
    col.position.set(0.36, 0.25, -0.4);
    col.rotation.x = -0.5 - Math.PI / 2 + Math.PI;
    this.cockpit.add(col);

    // gauges (backlit canvas)
    this.dashTex = canvasTex(512, 192);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.1725), new THREE.MeshBasicMaterial({ map: this.dashTex.t, toneMapped: false }));
    dash.position.set(0.36, 0.45, -0.637);
    dash.rotation.x = -0.05;
    this.cockpit.add(dash);
    this.radioTex = canvasTex(256, 96);
    const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.075), new THREE.MeshBasicMaterial({ map: this.radioTex.t, toneMapped: false }));
    radio.position.set(0, 0.235, -0.388);
    radio.rotation.set(-0.1, 0.25, 0);
    this.cockpit.add(radio);

    // rear-view mirror with its own low-res render
    this.mirrorRT = new THREE.WebGLRenderTarget(256, 96, { type: THREE.UnsignedByteType });
    this.mirrorRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.mirrorCam = new THREE.PerspectiveCamera(32, 256 / 96, 0.5, 400);
    const mframe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.03), toon({ color: 0x222222 }));
    const mplane = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.08), new THREE.MeshBasicMaterial({ map: this.mirrorRT.texture }));
    mplane.position.z = 0.017;
    mplane.scale.x = -1; // mirror image
    this.mirrorPlane = mplane;
    const mirror = new THREE.Group();
    mirror.add(mframe, mplane);
    mirror.position.set(0.02, 0.9, -0.42);
    mirror.rotation.set(-0.08, 0.2, 0);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), toon({ color: 0x222222 }));
    stem.position.set(0.02, 0.97, -0.42);
    this.cockpit.add(mirror, stem);
    // hanging items swing from below the mirror
    this.hangPoint.position.set(0.02, 0.84, -0.42);
    this.cockpit.add(this.hangPoint);
    this.hanging = new Pendulum(this.hangPoint, 0.16);
    // dashboard trinket (bobbles on a spring)
    this.dashSlot.position.set(-0.3, 0.39, -0.55);
    this.cockpit.add(this.dashSlot);
    this.bobble = new Pendulum(this.dashSlot, 0.06);

    // wipers
    for (const sx of [-0.45, 0.25]) {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.015, 0.015), toon({ color: 0x1a1a1a }));
      arm.position.x = 0.31;
      g.add(arm);
      g.position.set(sx, 0.47, -0.82);
      g.rotation.set(-0.95, 0, 0, 'XYZ');
      this.wipers.push(g);
      this.cockpit.add(g);
    }

    // headlights
    for (const sx of [-0.62, 0.62]) {
      const L = new THREE.SpotLight(0xfff0d0, 0, 70, 0.45, 0.6, 1.2);
      L.position.set(sx, 0.2, -2.1);
      L.target.position.set(sx * 1.5, -1.2, -22);
      L.castShadow = false;
      this.root.add(L, L.target);
      this.headlights.push(L);
    }
  }

  setInterior(inside: boolean) {
    this.cockpit.visible = inside;
    this.exterior.visible = !inside;
  }

  setPaint(c1: number, c2: number) {
    this.paintMat.color.setHex(c1);
    this.paint2Mat.color.setHex(c2);
  }

  setHeadlights(on: boolean, intensity = 40) {
    for (const L of this.headlights) L.intensity = on ? intensity : 0;
    this.headGlow.color.setHex(on ? 0xfffbe8 : 0xd8d4c8);
    this.tailGlow.color.setHex(on ? 0xff3a2a : 0x8a2a20);
  }

  /** animate wheel, wipers, trinkets */
  animate(dt: number, steer: number, wheelSpin: number, accFwd: number, accSide: number) {
    this.steering.rotation.z = -steer * 4.2; // wheel turns ~240°
    for (const w of this.wheels) w.rotation.x = -wheelSpin;
    this.wheels[0].rotation.y = this.wheels[1].rotation.y = -steer;
    this.hanging.update(dt, accFwd, accSide);
    this.bobble.update(dt, accFwd * 1.6, accSide * 1.6);
    this.dashSlot.rotation.x *= 0.25;
    this.dashSlot.rotation.z *= 0.25;
    if (this.wiping || this.wiperPhase > 0) {
      this.wiperPhase += dt * 3.2;
      if (this.wiperPhase >= Math.PI * 2) this.wiperPhase = this.wiping ? this.wiperPhase - Math.PI * 2 : 0;
    }
    const a = (1 - Math.cos(this.wiperPhase)) * 0.5; // 0 parked, 1 fully up
    for (const w of this.wipers) w.rotation.y = 0;
    this.wipers[0].rotation.z = a * 1.7;
    this.wipers[1].rotation.z = a * 1.7;
  }

  updateDash(dt: number, s: DashState) {
    this.dashTimer -= dt;
    if (this.dashTimer > 0) return;
    this.dashTimer = 1 / 12;
    const { ctx, c, t } = this.dashTex;
    const W = c.width, H = c.height;
    const night = s.night;
    ctx.fillStyle = '#121313';
    ctx.fillRect(0, 0, W, H);
    const glow = night > 0.4 ? '#ffd08a' : '#f3ede0';
    // speedometer
    const cx = 120, cy = 108, R = 82;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a3a38';
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
    const maxV = s.units === 'km' ? 140 : 90;
    const v = s.units === 'km' ? s.kmh : s.kmh * 0.6214;
    ctx.fillStyle = glow;
    ctx.strokeStyle = glow;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k <= maxV; k += maxV / 7) {
      const a = Math.PI * 0.8 + (k / maxV) * Math.PI * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
      ctx.lineTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
      ctx.stroke();
      ctx.fillText(String(Math.round(k)), cx + Math.cos(a) * (R - 28), cy + Math.sin(a) * (R - 28));
    }
    const na = Math.PI * 0.8 + Math.min(1, v / maxV) * Math.PI * 1.4;
    ctx.strokeStyle = '#e8643c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (R - 10), cy + Math.sin(na) * (R - 10));
    ctx.stroke();
    ctx.fillStyle = glow;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(String(Math.round(v)), cx, cy + 34);
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(s.units === 'km' ? 'km/h' : 'mph', cx, cy + 54);
    // fuel gauge
    const fx = 330, fy = 120;
    ctx.strokeStyle = '#3a3a38';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(fx, fy, 52, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = s.lowFuel ? '#e8a33c' : '#9fc88a';
    ctx.beginPath();
    ctx.arc(fx, fy, 52, Math.PI * 1.15, Math.PI * (1.15 + 0.7 * Math.max(0.001, s.fuel)));
    ctx.stroke();
    ctx.fillStyle = glow;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('E', fx - 50, fy + 4);
    ctx.fillText('F', fx + 50, fy + 4);
    ctx.fillText('⛽', fx, fy - 10);
    if (s.lowFuel) {
      ctx.fillStyle = s.reserve ? '#e8643c' : '#e8a33c';
      ctx.beginPath();
      ctx.arc(fx, fy + 22, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(s.reserve ? 'RESERVE' : 'LOW', fx, fy + 42);
    }
    // clock + odometer
    const hh = Math.floor(s.hour), mm = Math.floor((s.hour - hh) * 60);
    ctx.fillStyle = glow;
    ctx.font = '700 26px ui-monospace, monospace';
    ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 450, 46);
    ctx.font = '500 13px ui-monospace, monospace';
    const odo = s.units === 'km' ? s.odometerKm : s.odometerKm * 0.6214;
    ctx.fillText(`${odo.toFixed(1)} ${s.units}`, 450, 78);
    ctx.fillText(`${s.money}`, 450, 104);
    ctx.fillText(`film ${s.film}`, 450, 128);
    if (s.cruise) {
      ctx.fillStyle = '#7fd0a0';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillText('CRUISE', 450, 160);
    }
    if (s.headlights) {
      ctx.fillStyle = '#6fa8e8';
      ctx.fillText('◐ LIGHTS', 330, 168);
    }
    t.needsUpdate = true;

    // radio display
    const r = this.radioTex;
    r.ctx.fillStyle = '#0f1a14';
    r.ctx.fillRect(0, 0, 256, 96);
    r.ctx.fillStyle = s.lowFuel ? '#6fb08a' : '#8ff0b4';
    r.ctx.font = '700 30px ui-monospace, monospace';
    r.ctx.textAlign = 'center';
    r.ctx.textBaseline = 'middle';
    r.ctx.fillText(s.freq, 128, 32);
    r.ctx.font = '600 20px ui-monospace, monospace';
    r.ctx.fillText(s.station, 128, 70);
    r.t.needsUpdate = true;
  }
}
