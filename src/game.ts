// Game: owns the renderer, world, car, player and all systems; runs the frame loop.
import * as THREE from 'three';
import { World, LANE } from './world/world';
import { Streamer } from './world/streamer';
import { Sky } from './render/sky';
import { PostFX } from './render/post';
import { shared, setGradient } from './render/toon';
import { Car, CarInput, KMH } from './vehicle/car';
import { PlayerCar, EYE } from './vehicle/cockpit';
import { Input } from './core/input';
import { Events, GameEvents } from './core/events';
import { Settings, QUALITY, money } from './core/settings';
import { BIOMES, BiomeId } from '../data/biomes';
import { ECON } from '../data/economy';
import { siteExtra, spin, forgetChunk } from './world/siteRender';
import { nightGlow } from './render/props';
import { waterMaterial, updateWaterLight } from './render/water';
import { Player, PlayerData, newPlayerData } from './economy/state';
import { Walker } from './player/walker';
import { Stops, Point, siteName } from './stops/stops';
import { applyCosmetics } from './vehicle/cosmeticsDisplay';
import { writeSave, SaveData } from './save/save';
import { chunkSites, Site } from './world/sites';
import { CHUNK, ROAD_HALF } from './world/world';
import { lines } from '../data/dialogue';
import { Animals } from './life/animals';
import { PhotoCamera } from './camera/photo';
import { Journal } from './journal/journal';
import { RoadLife } from './life/roadlife';
import { Events as LifeEvents } from './life/events';
import { FEATURES } from './core/features';
import { Weather } from './render/weather';
import { lightWindow } from './render/sky';
import type { Candidate } from './camera/scoring';

export interface GameOptions {
  seed: string;
  onlyBiome?: BiomeId | null;
  hour?: number;
  autopilot?: boolean;
}

const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpC2 = new THREE.Color();

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly post: PostFX;
  readonly sky: Sky;
  readonly world: World;
  readonly streamer: Streamer;
  readonly car: Car;
  readonly pcar: PlayerCar;
  readonly input: Input;
  readonly events = new Events<GameEvents>();
  settings: Settings;
  hour: number;
  day = 1;
  mode: 'drive' | 'walk' = 'drive';
  lookYaw = 0;
  lookPitch = -0.04;
  paused = false;
  autopilot = false;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;
  private last = 0;
  private shake = 0;
  private frame = 0;
  private lastLookMove = 0;
  private prevVel = new THREE.Vector3();
  private accF = 0;
  private accS = 0;
  readonly fog: THREE.Fog;
  readonly sea: THREE.Mesh;
  private rafId = 0;
  /** systems that want a per-frame tick */
  readonly tickers: ((dt: number) => void)[] = [];
  /** called after the scene is rendered (for UI overlays) */
  readonly lateTickers: ((dt: number) => void)[] = [];
  running = false;
  timeScale = 1;
  weatherDim = 1;
  overcast = 0;
  aurora = 0;
  fogBoost = 0;
  readonly player: Player;
  readonly walker: Walker;
  readonly animals: Animals;
  readonly photo: PhotoCamera;
  readonly journal = new Journal();
  readonly life: RoadLife;
  readonly happenings: LifeEvents;
  weddingNear = false;
  readonly weather: Weather;
  /** extra photo subjects from later systems (traffic, events) */
  readonly extraSubjects: (() => Candidate[])[] = [];
  rainbowDir: THREE.Vector3 | null = null;
  meteors = false;
  flashActive = false;
  kitesActive = false;
  rainAmount = 0;
  windAmount = 0.5;
  readonly stops: Stops;
  /** current interaction prompt, read by the UI */
  prompt = '';
  promptPoint: Point | null = null;
  /** UI callback for opening a stop panel */
  onInteract: ((p: Point) => void) | null = null;
  sitting: Point | null = null;
  weatherName = 'clear';
  indiaOn = false;
  private fade = 1;
  private fadeTarget = 1;
  private skipQueue: number | null = null;
  private atlasTimer = 0;
  private saveTimer = 0;
  private dirtySave = false;
  /** extra save sections from later systems */
  readonly saveHooks: { save: () => Record<string, unknown>; load: (d: SaveData) => void }[] = [];

  constructor(renderer: THREE.WebGLRenderer, input: Input, settings: Settings, opts: GameOptions) {
    this.settings = settings;
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(settings.fov, 16 / 9, 0.08, 3600);
    this.camera.rotation.order = 'YXZ';
    this.camera.layers.enable(1); // far vegetation (skipped by the rear-view mirror)
    this.scene.add(this.camera);
    this.fog = new THREE.Fog(0xaaccdd, 120, 760);
    this.scene.fog = this.fog;
    this.post = new PostFX(16, 9);
    this.sky = new Sky(this.scene);
    this.world = new World(opts.seed, opts.onlyBiome ?? null);
    this.streamer = new Streamer(this.world, this.scene);
    this.car = new Car(this.world);
    this.car.colliders = (x, z, r, fn) => this.streamer.queryColliders(x, z, r, fn);
    this.streamer.extra = siteExtra;
    this.streamer.onChunkRemoved = (_c) => {};
    this.streamer.onChunkDispose = (g) => forgetChunk(g);
    this.pcar = new PlayerCar();
    this.scene.add(this.pcar.root);
    this.input = input;
    this.hour = opts.hour ?? 8.5;
    this.autopilot = !!opts.autopilot;
    this.player = new Player();
    this.walker = new Walker(this.world);
    this.walker.colliders = (x, z, r, fn) => this.streamer.queryColliders(x, z, r, fn);
    this.walker.extra = (x, z, fn) => {
      // the parked car is solid
      const c = this.car;
      for (const off of [-1.1, 0, 1.1]) fn(c.pos.x + c.forward.x * off, c.pos.z + c.forward.z * off, 0.95);
    };
    this.stops = new Stops(this.world);
    this.animals = new Animals(this.world, this.scene);
    this.photo = new PhotoCamera(this);
    this.life = new RoadLife(this);
    this.happenings = new LifeEvents(this);
    this.indiaOn = FEATURES.india;
    this.weather = new Weather(this);
    this.saveHooks.push({
      save: () => ({ journal: this.journal.d, photoState: { repeats: [...this.photo.repeats], day: this.photo.repeatsDay } }),
      load: (d) => {
        if (d.journal) this.journal.d = { ...this.journal.d, ...(structuredClone(d.journal) as typeof this.journal.d) };
        const ps = (d as any).photoState;
        if (ps) { this.photo.repeats = new Map(ps.repeats); this.photo.repeatsDay = ps.day; }
      },
    });
    this.stops.onEnter = (site, first) => this.enterStop(site, first);

    // distant ocean: calm and well below the wave troughs (a near miss flickers at distance);
    // coastal terrain tiles carry their own surf
    const seaGeo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    seaGeo.rotateX(-Math.PI / 2);
    seaGeo.setAttribute('aDepth', new THREE.Float32BufferAttribute(new Float32Array(4).fill(40), 1));
    this.sea = new THREE.Mesh(seaGeo, waterMaterial('ocean', BIOMES.coast.palette.water, BIOMES.coast.palette.waterDeep));
    this.sea.visible = false;
    this.sea.receiveShadow = true;
    this.scene.add(this.sea);

    this.applySettings();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  private onResize = () => this.resize();

  applySettings() {
    const s = this.settings;
    const q = QUALITY[s.quality];
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.input.bindings = s.bindings;
    this.streamer.radius = q.radius;
    if (Math.abs(this.streamer.density - q.density) > 0.01) {
      this.streamer.density = q.density;
      this.streamer.refresh();
    }
    this.streamer.ahead = q.ahead;
    this.sky.sun.shadow.mapSize.set(q.shadow, q.shadow);
    this.sky.sun.shadow.map?.dispose();
    (this.sky.sun.shadow as any).map = null;
    this.post.material.uniforms.uLineFar.value = q.lineFar;
    this.resize();
  }

  resize() {
    const q = QUALITY[this.settings.quality];
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, 1.5, q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }

  /** Put the car on the road at station s (left lane, facing +z). */
  spawnAt(s: number, yawOverride?: number, lateral = LANE) {
    const r = this.world.road(s);
    const x = r.x + r.nx * lateral, z = r.z + r.nz * lateral;
    const yaw = yawOverride ?? Math.atan2(-r.tx, -r.tz);
    this.streamer.ensureChunks(z);
    this.car.place(x, z, yaw);
  }

  start() {
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      this.rafId = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.tick(dt);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Debug: station of the middle of the first segment with this biome. */
  findBiome(id: BiomeId, from = 0): number {
    for (let k = this.world.segIndex(from); k < this.world.segIndex(from) + 400; k++) {
      if (this.world.biomeOfSeg(k) === id) return (this.world.segStart(k) + this.world.segStart(k + 1)) / 2;
    }
    return 0;
  }

  /** Debug: frame a site of a given kind from a nearby viewpoint. */
  lookAtSite(kind: string, dist = 18, height = 3, from = 0, variant?: string) {
    const all = (window as any).__sites;
    for (let c = Math.floor(from / 250); c < Math.floor(from / 250) + 1200; c++) {
      for (const s of all.chunkSites(this.world, c)) {
        if (s.kind !== kind || (variant && !(s.variant ?? '').startsWith(variant))) continue;
        this.autopilot = false;
        this.spawnAt(s.s - 40);
        this.streamer.ensureChunks(s.z);
        const r = this.world.road(s.s);
        // stand on the road side of the site, looking at it
        const toRoadX = r.x - s.x, toRoadZ = r.z - s.z;
        const L = Math.hypot(toRoadX, toRoadZ) || 1;
        let ox = (toRoadX / L) * dist, oz = (toRoadZ / L) * dist;
        if (L < 3) { ox = -r.tx * dist; oz = -r.tz * dist; }
        const cx = s.x + ox + r.tx * dist * 0.4, cz = s.z + oz + r.tz * dist * 0.4;
        const gy = this.world.ground(cx, cz);
        const ty = this.world.ground(s.x, s.z);
        this.car.place(cx + r.nx * 3, cz + r.nz * 3, 0);
        this.debugCam = { abs: true, x: cx, y: gy + height, z: cz, tx: s.x, ty: ty + height * 0.5, tz: s.z } as any;
        return s.id;
      }
    }
    return null;
  }

  /** Test helper: advance the simulation without waiting for frames. */
  simulate(seconds: number, fps = 30) {
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) this.tick(1 / fps, i === n - 1);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose() {
    this.stop();
    this.streamer.dispose();
    this.animals.dispose();
    this.life.dispose();
    this.happenings.dispose();
    this.weather.dispose();
    this.photo.dispose();
    window.removeEventListener('resize', this.onResize);
    this.post.rt.dispose();
    this.pcar.mirrorRT.dispose();
  }

  carInput(): CarInput {
    const inp = this.input;
    const cam = this.cameraRaised;
    if (this.autopilot) return this.autoDrive();
    if (this.mode !== 'drive' || this.paused) return { throttle: 0, brake: 0, steer: 0, handbrake: true };
    return { throttle: inp.throttle(cam), brake: inp.brake(cam), steer: inp.steer(), handbrake: inp.held('handbrake') };
  }

  cameraRaised = false;
  debugCam: { x: number; y: number; z: number; pitch: number; yaw: number } | null = null;

  private autoDrive(): CarInput {
    const c = this.car;
    const fwdZ = Math.sign(-Math.cos(c.yaw)) || 1;
    const s = c.pos.z + fwdZ * (12 + c.speed * 0.6);
    const r = this.world.road(s);
    const lane = fwdZ > 0 ? LANE : -LANE;
    const tx = r.x + r.nx * lane, tz = r.z + r.nz * lane;
    const want = Math.atan2(-(tx - c.pos.x), -(tz - c.pos.z));
    let d = want - c.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const target = 62 / KMH;
    return { throttle: c.speed < target ? 0.7 : 0, brake: c.speed > target + 2 ? 0.3 : 0, steer: THREE.MathUtils.clamp(-d * 3, -1, 1), handbrake: false };
  }

  get biome() {
    return this.world.biomeCfg(this.car.pos.z);
  }

  /** Main per-frame update. */
  tick(dt: number, render = true) {
    this.frame++;
    this.renderer.info.reset();
    this.input.poll();
    const simDt = this.paused ? 0 : dt * this.timeScale;
    shared.time.value += simDt;

    if (!this.paused) {
      this.hour += (simDt * 24) / (this.settings.dayLength * 60);
      if (this.hour >= 24) {
        this.hour -= 24;
        this.day++;
      }
      if (this.mode === 'drive') {
        if (this.input.pressed('cruise')) this.car.toggleCruise();
      }
      this.handleInteract();
      if (this.mode === 'walk' && !this.sitting) {
        const look = this.input.look(simDt, this.cameraRaised, false);
        const fovK = this.camera.fov / this.settings.fov;
        this.walker.update(simDt, this.input.move(), this.input.held('jog', { driving: false, camera: false }), [look[0] * fovK, look[1] * fovK]);
        this.walkEye.copy(this.walker.eye);
        this.walkYaw = this.walker.yaw;
        this.walkPitch = this.walker.pitch;
      } else if (this.sitting) {
        const look = this.input.look(simDt, this.cameraRaised, false);
        this.walkYaw -= look[0];
        this.walkPitch = THREE.MathUtils.clamp(this.walkPitch - look[1], -1.2, 1.2);
      }
      const ci = this.carInput();
      this.car.parked = this.mode !== 'drive' && !this.autopilot;
      // physics at fixed sub-steps for stability
      const steps = Math.max(1, Math.ceil(simDt / (1 / 120)));
      for (let i = 0; i < steps; i++) this.car.update(simDt / steps, ci);
      for (const b of this.car.bumps) {
        this.shake = Math.max(this.shake, b.strength);
        this.events.emit('bump', b);
      }
      this.car.bumps.length = 0;
      // accelerations for trinkets
      if (simDt > 0) {
        const ax = (this.car.vel.x - this.prevVel.x) / simDt, az = (this.car.vel.z - this.prevVel.z) / simDt;
        this.accF += ((ax * this.car.forward.x + az * this.car.forward.z) - this.accF) * Math.min(1, simDt * 8);
        this.accS += ((ax * this.car.right.x + az * this.car.right.z) - this.accS) * Math.min(1, simDt * 8);
        this.prevVel.copy(this.car.vel);
      }
      spin(simDt);
      const fp = this.mode === 'drive' ? this.car.pos : this.walker.pos;
      this.animals.window = lightWindow(this.hour);
      this.animals.weather = this.weatherName;
      this.animals.player.pos.copy(fp);
      this.animals.player.speed = this.mode === 'drive' ? Math.abs(this.car.speed) : Math.hypot(this.walker.vel.x, this.walker.vel.z);
      this.animals.player.onFoot = this.mode === 'walk';
      this.animals.update(simDt, fp, this.camera.position);
      this.life.update(simDt);
      this.happenings.update(simDt);
      this.weather.update(simDt);
      if (this.input.pressed('horn')) this.events.emit('horn', {});
      for (const t of this.tickers) t(simDt);
      this.logAtlas(simDt);
      this.saveTimer += simDt;
      if (this.dirtySave && this.saveTimer > 2) this.save();
    }
    // time-skip fade
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * 3.5);
    if (this.skipQueue !== null && this.fade < 0.03) {
      const target = this.skipQueue;
      this.skipQueue = null;
      if (target >= 24) this.day++;
      this.hour = target % 24;
      this.onSkip?.();
      this.fadeTarget = 1;
    }
    this.post.material.uniforms.uFade.value = this.fade;

    const focus = this.mode === 'drive' ? this.car.pos : this.walker.pos;
    this.stops.update(focus.x, focus.z);
    this.updatePrompt();
    this.updateCarVisual(dt);
    this.updateCamera(dt);
    this.photo.update(this.paused ? 0 : dt);
    this.updateEnvironment(dt);
    const fwdZ = this.mode === 'drive' ? -Math.cos(this.car.yaw) : -Math.cos(this.camera.rotation.y);
    this.streamer.update(this.mode === 'drive' ? this.car.pos : this.camera.position, fwdZ);

    if (render) this.render();
    for (const t of this.lateTickers) t(dt);
    this.input.lateUpdate();
    this.input.endFrame();

    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }

  private updateCarVisual(dt: number) {
    const c = this.car;
    const root = this.pcar.root;
    root.position.copy(c.pos);
    root.rotation.set(c.pitch, c.yaw, -c.roll, 'YXZ');
    this.pcar.animate(dt, c.steerAngle / 0.6, c.wheelSpin, this.accF, this.accS);
    const s = this.settings;
    this.pcar.updateDash(dt, {
      kmh: c.kmh,
      fuel: c.fuel,
      hour: this.hour,
      station: this.radioName,
      freq: this.radioFreq,
      lowFuel: c.fuel < ECON.lowFuel,
      reserve: c.reserve,
      cruise: c.cruise !== null,
      headlights: this.headlightsOn,
      units: s.units,
      odometerKm: c.odometer / 1000,
      night: this.sky.night,
      film: this.player.shots,
      money: money(this.player.money, s),
    });
  }
  radioName = 'OFF';
  radioFreq = '--.-';
  headlightsOn = false;

  /** World position of the eye, whether driving or walking (walking sets it directly). */
  walkEye = new THREE.Vector3();
  walkYaw = 0;
  walkPitch = 0;

  private updateCamera(dt: number) {
    const cam = this.camera;
    const inp = this.input;
    const [dx, dy] = this.paused ? [0, 0] : inp.look(dt, this.cameraRaised, this.mode === 'drive');
    const fovK = cam.fov / this.settings.fov; // slower look when zoomed
    if (this.mode === 'drive') {
      this.lookYaw -= dx * fovK;
      this.lookPitch -= dy * fovK;
      this.lookYaw = THREE.MathUtils.clamp(this.lookYaw, -1.9, 1.9);
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch, -0.9, 0.7);
      if (dx !== 0 || dy !== 0) this.lastLookMove = performance.now();
      // gentle re-centre while cruising and not looking around
      if (!this.cameraRaised && performance.now() - this.lastLookMove > 2500 && this.car.speed > 6) {
        const k = Math.min(1, dt * 0.8);
        this.lookYaw *= 1 - k;
        this.lookPitch += (-0.04 - this.lookPitch) * k;
      }
      const root = this.pcar.root;
      root.updateMatrixWorld();
      tmpV.copy(EYE).applyMatrix4(root.matrixWorld);
      cam.position.copy(tmpV);
      const bob = this.settings.headBob && !this.settings.reduceMotion ? Math.sin(performance.now() * 0.012) * Math.min(1, this.car.kmh / 80) * 0.004 : 0;
      cam.position.y += bob;
      cam.rotation.set(this.car.pitch * 0.6 + this.lookPitch, this.car.yaw + this.lookYaw, -this.car.roll * 0.5, 'YXZ');
    } else {
      cam.position.copy(this.walkEye);
      cam.rotation.set(this.walkPitch, this.walkYaw, 0, 'YXZ');
    }
    if (this.debugCam) {
      const d = this.debugCam as any;
      if (d.abs) {
        cam.position.set(d.x, d.y, d.z);
        cam.lookAt(d.tx, d.ty, d.tz);
      } else {
        cam.position.set(this.car.pos.x + d.x, this.car.pos.y + d.y, this.car.pos.z + d.z);
        cam.rotation.set(d.pitch, d.yaw, 0, 'YXZ');
      }
    }
    if (this.shake > 0.001 && this.settings.shake && !this.settings.reduceMotion) {
      const k = this.shake * 0.02;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
      cam.rotation.z += (Math.random() - 0.5) * k * 0.5;
    }
    this.shake *= Math.exp(-dt * 6);
  }

  private updateEnvironment(_dt: number) {
    const focus = this.mode === 'drive' ? this.car.pos : this.walker.pos;
    const r = this.world.road(focus.z);
    const bl = r.blend;
    const A = BIOMES[bl.a], B = BIOMES[bl.b];
    // fog colour: sky horizon tinted by biome fog colour
    this.sky.update(this.hour, focus, this.fog.color, { overcast: this.overcast, aurora: this.aurora, dim: this.weatherDim });
    tmpC.setHex(A.fog.color).lerp(tmpC2.setHex(B.fog.color), bl.t);
    this.fog.color.lerp(tmpC, 0.35 * (1 - this.sky.night * 0.7));
    const q = QUALITY[this.settings.quality];
    const near = THREE.MathUtils.lerp(A.fog.near, B.fog.near, bl.t);
    const far = THREE.MathUtils.lerp(A.fog.far, B.fog.far, bl.t) * q.fogMul;
    const fb = this.fogBoost;
    this.fog.near = THREE.MathUtils.lerp(near, 4, fb);
    this.fog.far = THREE.MathUtils.lerp(far, 85, fb);
    // toon ramp per biome (dominant)
    const G = bl.t > 0.5 ? B.gradient : A.gradient;
    setGradient(G);
    // ink colour
    const u = this.post.material.uniforms;
    (u.uInk.value as THREE.Color).copy(this.sky.ink).multiplyScalar(bl.t > 0.5 ? B.ink : A.ink);
    (u.uFog.value as THREE.Color).copy(this.fog.color);
    u.uTime.value = shared.time.value;
    u.uLowFuel.value = this.car.fuel < ECON.lowFuel ? 1 - this.car.fuel / ECON.lowFuel : 0;
    // sea follows the player in coastal stretches
    const coastal = bl.a === 'coast' || bl.b === 'coast';
    this.sea.visible = coastal;
    if (coastal) {
      this.sea.position.set(Math.round(focus.x / 50) * 50, -1.2, Math.round(focus.z / 50) * 50);
    }
    nightGlow.value = THREE.MathUtils.smoothstep(this.sky.night, 0.2, 0.8) * 0.9 + 0.1 * this.overcast;
    updateWaterLight(this.sky.sun, this.sky.hemi.intensity, this.sky.horizon);
    // headlights
    this.headlightsOn = this.sky.night > 0.35 || this.fogBoost > 0.3 || this.overcast > 0.8;
    this.pcar.setHeadlights(this.headlightsOn, 30 + this.sky.night * 30);
  }

  // ------------------------------------------------------------ getting in and out
  get focusPos(): THREE.Vector3 {
    return this.mode === 'drive' ? this.car.pos : this.walker.pos;
  }

  exitCar() {
    const c = this.car;
    if (Math.abs(c.speed) > 2.5) {
      this.events.emit('toast', { text: 'Slow down to get out' });
      return;
    }
    c.speed = 0;
    c.vel.set(0, 0, 0);
    c.cruise = null;
    // driver's door is on the right (right-hand drive)
    let x = c.pos.x + c.right.x * 1.5, z = c.pos.z + c.right.z * 1.5;
    if (this.world.waterAt(x, z) !== null) { x = c.pos.x - c.right.x * 1.5; z = c.pos.z - c.right.z * 1.5; }
    this.walker.place(x, z, c.yaw + this.lookYaw);
    this.walker.pitch = this.lookPitch;
    this.mode = 'walk';
    this.walkEye.copy(this.walker.eye);
    this.events.emit('modeChange', { mode: 'walk' });
  }

  enterCar() {
    this.mode = 'drive';
    this.sitting = null;
    this.lookYaw = 0;
    this.lookPitch = -0.04;
    this.events.emit('modeChange', { mode: 'drive' });
  }

  distToCar() {
    return Math.hypot(this.walker.pos.x - this.car.pos.x, this.walker.pos.z - this.car.pos.z);
  }

  private handleInteract() {
    if (!this.input.pressed('interact')) return;
    if (this.extraInteract?.()) return;
    if (this.sitting) {
      this.sitting = null;
      this.timeScale = 1;
      return;
    }
    if (this.mode === 'drive') return this.exitCar();
    const p = this.promptPoint;
    if (p) {
      if (p.kind === 'bench') {
        this.sitting = p;
        const y = this.world.ground(p.x, p.z);
        this.walkEye.set(p.x, y + 1.15, p.z);
        this.walkYaw = p.face ?? this.walkYaw;
        this.walkPitch = -0.02;
        this.timeScale = 8;
        this.events.emit('toast', { text: 'Sitting. Time drifts faster. F to stand.' });
        return;
      }
      this.onInteract?.(p);
      return;
    }
    if (this.distToCar() < 3.6) this.enterCar();
  }
  extraInteract: (() => boolean) | null = null;

  private updatePrompt() {
    let text = '';
    let pt: Point | null = null;
    if (this.mode === 'walk' && !this.sitting) {
      pt = this.stops.nearestPoint(this.walker.pos.x, this.walker.pos.z);
      if (pt) text = this.pointLabel(pt);
      else if (this.distToCar() < 3.6) text = 'Get in the car';
    } else if (this.sitting) text = 'Stand up';
    else if (this.mode === 'drive' && Math.abs(this.car.speed) < 1.5 && this.stops.current) text = 'Get out';
    if (this.extraPrompt) {
      const e = this.extraPrompt();
      if (e) text = e;
    }
    this.prompt = text;
    this.promptPoint = pt;
  }
  extraPrompt: (() => string) | null = null;

  pointLabel(p: Point): string {
    switch (p.kind) {
      case 'pump': {
        const cost = Math.ceil((1 - this.car.fuel) * ECON.fullRefill);
        return cost > 0 ? `Refuel (${money(cost, this.settings)} to fill)` : 'Pump (tank is full)';
      }
      case 'shop': return 'Shop: film and car bits';
      case 'kiosk': return 'Photo kiosk: develop film';
      case 'diner': return p.site.variant?.startsWith('dhaba') ? 'Dhaba: chai or a meal' : 'Diner: coffee';
      case 'motel': return 'Motel: stay the night';
      case 'stand': return p.site.variant?.startsWith('tapri') ? 'Tapri: chai and one-offs' : 'Roadside stand';
      case 'bench': return 'Sit on the bench';
      default: return 'Talk';
    }
  }

  private enterStop(site: Site, first: boolean) {
    this.player.d.stats.stops++;
    if (first) this.events.emit('toast', { text: siteName(site) });
    // safety net: no film and too little money for a roll → a free roll
    const staffed = site.kind === 'gas' || site.kind === 'stand' || site.kind === 'diner' || site.kind === 'motel';
    if (staffed && this.player.shots === 0 && this.player.money < ECON.filmRoll) {
      this.player.addRoll();
      this.player.d.freeRollGiven++;
      this.events.emit('subtitle', { who: site.kind === 'gas' ? 'Attendant' : site.kind === 'diner' ? 'Cook' : site.kind === 'motel' ? 'Desk clerk' : 'Owner', text: lines('freeRoll', site, this) });
    }
    this.save();
  }

  /** Fade out, move the clock, fade in. Day count advances if we pass midnight. */
  skipTo(hour: number) {
    this.skipQueue = hour;
    this.fadeTarget = 0;
  }
  onSkip: (() => void) | null = null;

  refreshCosmetics() {
    applyCosmetics(this.pcar, this.player.d.equipped);
  }

  // ------------------------------------------------------------ atlas + saving
  private logAtlas(dt: number) {
    this.atlasTimer += dt;
    if (this.atlasTimer < 0.5) return;
    this.atlasTimer = 0;
    const p = this.focusPos;
    const lat = this.world.lateral(p.x, p.z);
    if (Math.abs(lat) < ROAD_HALF + 4) this.player.logDrive(p.z);
    const surf = this.world.surfaceAt(p.x, p.z);
    if (surf === 'gravel' || surf === 'dirt') {
      const c = Math.floor(p.z / CHUNK);
      for (let i = c - 13; i <= c + 2; i++) {
        const br = this.world.chunkFeatures(i).branch;
        if (!br) continue;
        const q = this.world.branchQuery(br, p.x, p.z);
        if (q.dist < 6) this.player.logBranch(br.id, q.i);
      }
    }
    // stops and landmarks you pass get pinned to the atlas
    const c = Math.floor(p.z / CHUNK);
    for (let i = c - 1; i <= c + 1; i++)
      for (const s of chunkSites(this.world, i)) {
        if (s.cat === 'building' || s.kind === 'streetlight' || s.kind === 'hidden') continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < (s.cat === 'stop' ? 120 : 220)) this.player.mark({ id: s.id, kind: s.kind, x: s.x, z: s.z, label: s.cat === 'stop' ? siteName(s) : undefined });
      }
    this.player.d.stats.km = this.car.odometer / 1000;
  }

  saveSoon() {
    this.dirtySave = true;
    this.saveTimer = 0;
  }

  snapshot(): SaveData {
    const extra: Record<string, unknown> = {};
    for (const h of this.saveHooks) Object.assign(extra, h.save());
    return {
      version: 1,
      seed: this.world.seedStr,
      savedAt: Date.now(),
      hour: this.hour,
      day: this.day,
      mode: this.mode,
      car: { x: this.car.pos.x, z: this.car.pos.z, yaw: this.car.yaw, fuel: this.car.fuel, odometer: this.car.odometer },
      walker: { x: this.walker.pos.x, z: this.walker.pos.z, yaw: this.walker.yaw },
      player: this.player.d,
      ...extra,
    };
  }

  save() {
    this.dirtySave = false;
    this.saveTimer = 0;
    if (this.autopilot) return Promise.resolve();
    this.events.emit('autosave', {});
    return writeSave(structuredClone(this.snapshot()));
  }

  restore(d: SaveData) {
    this.hour = d.hour;
    this.day = d.day;
    // merge with defaults so a save from an older build (missing fields) still loads
    const base = newPlayerData();
    const p = structuredClone(d.player ?? {}) as Partial<PlayerData>;
    this.player.d = { ...base, ...p, stats: { ...base.stats, ...(p.stats ?? {}) }, equipped: { ...base.equipped, ...(p.equipped ?? {}) } };
    // renamed cosmetic ids from earlier builds
    const RENAMED: Record<string, string> = { 'dash-dome': 'dash-tasbih' };
    this.player.d.owned = this.player.d.owned.map((id) => RENAMED[id] ?? id);
    for (const k of Object.keys(this.player.d.equipped) as (keyof PlayerData['equipped'])[]) { const v = this.player.d.equipped[k]; if (v && RENAMED[v]) this.player.d.equipped[k] = RENAMED[v]; }
    if (!Number.isFinite(this.player.d.money)) this.player.d.money = base.money;
    if (!Number.isFinite(this.player.d.shots)) this.player.d.shots = base.shots;
    const car = d.car ?? { x: 0, z: 0, yaw: 0, fuel: 1, odometer: 0 };
    this.streamer.ensureChunks(car.z);
    this.car.place(car.x, car.z, car.yaw);
    this.car.fuel = Number.isFinite(car.fuel) ? car.fuel : 1;
    this.car.odometer = Number.isFinite(car.odometer) ? car.odometer : 0;
    if (Number.isFinite(d.hour)) this.hour = d.hour; else this.hour = 9;
    if (!Number.isFinite(d.day)) this.day = 1;
    if (d.mode === 'walk' && d.walker) {
      this.walker.place(d.walker.x, d.walker.z, d.walker.yaw);
      this.mode = 'walk';
      this.walkEye.copy(this.walker.eye);
    }
    for (const h of this.saveHooks) h.load(d);
    this.refreshCosmetics();
  }

  private render() {
    const r = this.renderer;
    const inside = this.mode === 'drive' && !this.cameraRaised;
    this.pcar.setInterior(this.mode === 'drive' && !this.debugCam);
    if (this.mode === 'drive' && this.cameraRaised) this.pcar.cockpit.visible = false;
    // rear-view mirror (every other frame)
    if (inside && this.settings.mirror && this.frame % 2 === 0) {
      const mc = this.pcar.mirrorCam;
      const root = this.pcar.root;
      mc.position.set(0, 0.95, -0.2).applyMatrix4(root.matrixWorld);
      mc.rotation.set(0.02, this.car.yaw + Math.PI, 0, 'YXZ');
      mc.updateMatrixWorld();
      this.pcar.cockpit.visible = false;
      this.pcar.exterior.visible = false;
      const fogFar = this.fog.far;
      this.fog.far = Math.min(fogFar, 300);
      r.setRenderTarget(this.pcar.mirrorRT);
      r.render(this.scene, mc);
      this.fog.far = fogFar;
      this.pcar.cockpit.visible = true;
    }
    this.pcar.mirrorPlane.visible = this.settings.mirror;
    this.post.render(r, this.scene, this.camera, null);
  }
}
