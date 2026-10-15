// Film camera: viewfinder (zoom 24–85 mm, 0.3 s autofocus, film-look preview),
// capture to 1280×720 JPEG in IndexedDB with metadata and a composition score.
import * as THREE from 'three';
import type { Game } from '../game';
import { PostFX } from '../render/post';
import { lightWindow } from '../render/sky';
import { scorePhoto, Candidate, PhotoScore } from './scoring';
import { chunkSites } from '../world/sites';
import { CHUNK, ROAD_HALF } from '../world/world';
import { SITE_SUBJECT, SUBJECT_BY_ID } from '../../data/subjects';
import { db } from '../save/db';
import { FEATURES } from '../core/features';

export interface PhotoRecord {
  id?: number;
  seed: string;
  created: number;
  day: number;
  hour: number;
  weather: string;
  biome: string;
  pos: [number, number, number];
  heading: number;
  focal: number;
  developed: boolean;
  payout: number;
  stars: number;
  primary: string | null;
  subjects: { defId: string; uid: string; tier: string; score: number; value: number }[];
  notes: string[];
  blob: Blob;
  thumb: Blob;
}

export const W = 1280, H = 720;

export class PhotoCamera {
  raised = false;
  focal = 35;
  focus = 10;
  focusTarget = 10;
  private flash = 0;
  private capRT: THREE.WebGLRenderTarget;
  private outRT: THREE.WebGLRenderTarget;
  private capCam = (() => { const c = new THREE.PerspectiveCamera(50, W / H, 0.08, 3600); c.layers.enable(1); return c; })();
  private busy = false;
  /** uid → shots today (for repeat decay) */
  repeats = new Map<string, number>();
  repeatsDay = 1;
  onShot: ((rec: PhotoRecord, score: PhotoScore) => void) | null = null;
  pending = 0; // undeveloped count (cached for UI)

  constructor(private g: Game) {
    this.capRT = PostFX.makeRT(W, H);
    this.outRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType });
    this.outRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.refreshPending();
  }

  dispose() {
    this.capRT.dispose();
    this.outRT.dispose();
  }

  async refreshPending() {
    const all = (await db.all<PhotoRecord>('photos')) ?? [];
    this.pending = all.filter((p) => !p.developed && p.seed === this.g.world.seedStr).length;
  }

  static fovFor(mm: number) {
    return (2 * Math.atan(12 / mm) * 180) / Math.PI;
  }

  update(dt: number) {
    const g = this.g;
    const inp = g.input;
    const ctx = { driving: g.mode === 'drive', camera: this.raised };
    const want = !g.paused && !g.sitting ? inp.held('camera', ctx) : false;
    if (want !== this.raised) {
      this.raised = want;
      g.cameraRaised = want;
      g.events.emit('viewfinder', { up: want });
    }
    const u = g.post.material.uniforms;
    if (this.raised) {
      if (inp.pressed('zoomIn', ctx)) this.focal = Math.min(85, this.focal + (this.focal < 50 ? 5 : 7));
      if (inp.pressed('zoomOut', ctx)) this.focal = Math.max(24, this.focal - (this.focal <= 50 ? 5 : 7));
      g.camera.fov += (PhotoCamera.fovFor(this.focal) - g.camera.fov) * Math.min(1, dt * 12);
      g.camera.updateProjectionMatrix();
      // autofocus on the centre: settles in about 0.3 s
      this.focusTarget = this.centreDistance();
      const k = 1 - Math.exp(-dt / 0.08);
      this.focus += (this.focusTarget - this.focus) * k;
      const miss = Math.abs(this.focus - this.focusTarget) / Math.max(1, this.focusTarget);
      u.uFocusMiss.value = Math.min(1, miss * 2.5);
      u.uFilm.value = 1;
      u.uBlur.value = g.mode === 'drive' ? Math.max(0, (g.car.kmh - 30) / 70) * 0.6 : 0;
      if (inp.pressed('shoot', ctx)) this.shoot();
    } else {
      if (Math.abs(g.camera.fov - g.settings.fov) > 0.01) {
        g.camera.fov += (g.settings.fov - g.camera.fov) * Math.min(1, dt * 12);
        g.camera.updateProjectionMatrix();
      }
      u.uFilm.value = 0;
      u.uFocusMiss.value = 0;
      u.uBlur.value = 0;
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    u.uFlash.value = this.flash * 0.7;
    if (g.day !== this.repeatsDay) {
      this.repeats.clear();
      this.repeatsDay = g.day;
    }
  }

  get focused() {
    return Math.abs(this.focus - this.focusTarget) / Math.max(1, this.focusTarget) < 0.08;
  }

  /** Distance to whatever is under the centre of the frame. */
  centreDistance(): number {
    const cam = this.g.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    // subjects near the middle of the frame win the focus (a wide central AF zone)
    let best = Infinity;
    for (const s of this.g.animals.subjects()) {
      const c = s.pos.clone().add(new THREE.Vector3(0, s.h * 0.5, 0));
      const t = c.clone().sub(cam.position).dot(dir);
      if (t < 0.5 || t > 300) continue;
      const v = c.clone().project(cam);
      if (Math.abs(v.x) < 0.45 && Math.abs(v.y) < 0.5 && !this.blocked(cam.position, c)) best = Math.min(best, t);
    }
    if (best < Infinity) return best;
    const hit = this.march(cam.position, dir, 600);
    return hit ?? 600;
  }

  /** March a ray against terrain and colliders, return distance or null. */
  march(o: THREE.Vector3, dir: THREE.Vector3, maxD: number): number | null {
    const w = this.g.world;
    let t = 0.5;
    let step = 0.6;
    const p = new THREE.Vector3();
    while (t < maxD) {
      p.copy(o).addScaledVector(dir, t);
      if (p.y < w.height(p.x, p.z)) return t;
      let hitTree = false;
      if (t < 160)
        this.g.streamer.queryColliders(p.x, p.z, 0, (cx, cz, cr) => {
          if (!hitTree && (p.x - cx) ** 2 + (p.z - cz) ** 2 < cr * cr * 1.4 && p.y < w.height(cx, cz) + 9) hitTree = true;
        });
      if (hitTree) return t;
      t += step;
      step = Math.min(8, step * 1.08);
    }
    return null;
  }

  /** Line-of-sight test used for visibility raycasts. */
  blocked = (a: THREE.Vector3, b: THREE.Vector3): boolean => {
    const w = this.g.world;
    const d = b.clone().sub(a);
    const L = d.length();
    if (L < 0.5) return false;
    d.divideScalar(L);
    const n = Math.min(160, Math.ceil(L / 2.5));
    const p = new THREE.Vector3();
    for (let i = 1; i < n; i++) {
      const t = (i / n) * L;
      if (t > L - 1.2) break;
      p.copy(a).addScaledVector(d, t);
      if (p.y < w.height(p.x, p.z) - 0.05) return true;
      let hit = false;
      this.g.streamer.queryColliders(p.x, p.z, 0, (cx, cz, cr) => {
        if (!hit && (p.x - cx) ** 2 + (p.z - cz) ** 2 < cr * cr * 0.9 && p.y < w.height(cx, cz) + 8.5 && p.y > w.height(cx, cz) + 0.3) hit = true;
      });
      if (hit) return true;
    }
    return false;
  };

  /** Is water (lake or sea) visible in the lower part of the frame? */
  waterInFrame(cam: THREE.PerspectiveCamera): boolean {
    const w = this.g.world;
    for (const [x, y] of [[0, -0.2], [-0.5, -0.4], [0.5, -0.4], [0, -0.6], [-0.3, 0], [0.3, 0]]) {
      const dir = new THREE.Vector3(x, y, 0.5).unproject(cam).sub(cam.position).normalize();
      if (dir.y > -0.002) continue;
      let t = 1, step = 1;
      while (t < 900) {
        const px = cam.position.x + dir.x * t, py = cam.position.y + dir.y * t, pz = cam.position.z + dir.z * t;
        const wl = w.waterAt(px, pz);
        if (wl !== null && py < wl + 0.05) return true;
        if (py < w.height(px, pz)) break;
        t += step;
        step = Math.min(10, step * 1.12);
      }
    }
    return false;
  }

  private inFrame(cam: THREE.PerspectiveCamera, p: THREE.Vector3) {
    const v = p.clone().project(cam);
    return v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && p.clone().applyMatrix4(cam.matrixWorldInverse).z < 0;
  }

  candidates(cam: THREE.PerspectiveCamera): Candidate[] {
    const g = this.g;
    const out: Candidate[] = g.animals.subjects().map((s) => ({ uid: s.uid, defId: s.defId, pos: s.pos, r: s.r, h: s.h }));
    for (const extra of g.extraSubjects) out.push(...extra());
    const pc = Math.floor(cam.position.z / CHUNK);
    let towers = 0, lights = 0;
    const towerPos = new THREE.Vector3();
    let teaVisible = false;
    for (let c = pc - 4; c <= pc + 4; c++) {
      for (const s of chunkSites(g.world, c)) {
        const sid = s.kind === 'ghatsign' ? `gsign${s.variant}` : SITE_SUBJECT[s.kind];
        const y = g.world.height(s.x, s.z);
        if (s.kind === 'tower' && this.inFrame(cam, new THREE.Vector3(s.x, y + (s.h ?? 30) * 0.5, s.z))) { towers++; towerPos.set(s.x, y + (s.h ?? 30) * 0.6, s.z); }
        if (s.kind === 'streetlight' && this.inFrame(cam, new THREE.Vector3(s.x, y + 5, s.z)) && cam.position.distanceTo(new THREE.Vector3(s.x, y, s.z)) < 90) lights++;
        if (!sid) continue;
        const def = SUBJECT_BY_ID[sid];
        if (def.india && !FEATURES.india) continue;
        const pos = new THREE.Vector3(s.x, s.kind === 'seastack' ? 0 : y, s.z);
        if (s.kind === 'teaestate' && this.inFrame(cam, pos.clone().add(new THREE.Vector3(0, 2, 0)))) teaVisible = true;
        out.push({ uid: s.id, defId: sid, pos, r: def.size[0], h: def.size[1] });
      }
      const F = g.world.chunkFeatures(c);
      if (F.river) {
        const trop = g.world.dominantBiome(F.river.s) === 'tropical';
        const d = trop ? 70 : 0;
        const zr = g.world.riverZ(F.river, d);
        const r = g.world.road(zr);
        out.push({ uid: `bridge:${c}`, defId: trop ? 'ropebridge' : 'bridge', pos: new THREE.Vector3(r.x + d / r.cosA, trop ? F.river.level + 1 : r.y - 1, zr), r: trop ? 2 : ROAD_HALF + 1, h: 2.5 });
      }
    }
    // sky subjects
    const hour = g.hour;
    const win = lightWindow(hour);
    const biome = g.world.dominantBiome(cam.position.z);
    const sky = (defId: string, dir: THREE.Vector3, uid = `${defId}:${g.day}`) => {
      const def = SUBJECT_BY_ID[defId];
      if (def.india && !FEATURES.india) return;
      out.push({ uid, defId, pos: cam.position, r: 0, h: 0, sky: true, dir: dir.clone().normalize() });
    };
    const sun = g.sky.sunDir;
    if ((win === 'golden' && hour > 12) || (win === 'blue' && sun.y > -0.06)) {
      if (biome === 'coast' && this.waterInFrame(cam)) sky('sunset-sea', sun);
      if (biome === 'desert') sky('sunset-desert', sun);
    }
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    if (g.aurora > 0.3 && biome === 'forest') {
      const north = new THREE.Vector3(0, 0.3, 1);
      // the lake version replaces the plain one, so one shot doesn't pay twice
      sky(this.waterInFrame(cam) ? 'aurora-lake' : 'aurora', north);
    }
    if (g.rainbowDir) {
      sky(teaVisible ? 'rainbow-tea' : 'rainbow', g.rainbowDir);
    }
    if (g.meteors && look.y > 0.15) sky('meteors', look);
    if (g.flashActive && look.y > -0.05) sky('lightning', look);
    if (g.kitesActive && look.y > 0.05) sky('kites', look);
    if ((win === 'blue' || win === 'night') && towers >= 2) sky('skyline', towerPos.clone().sub(cam.position));
    if (win === 'night' && lights >= 3) sky('streetlights', look, `streetlights:${pc}:${g.day}`);
    return out;
  }

  async shoot() {
    const g = this.g;
    if (this.busy) return;
    if (!g.player.useShot()) {
      g.events.emit('toast', { text: 'Out of film. Shops and some stands sell rolls.' });
      return;
    }
    this.busy = true;
    this.flash = 1;
    g.events.emit('shutter', {});
    let saved = false;
    const repeatSnapshot: Map<string, number> | null = new Map(this.repeats);
    try {
      const cam = this.capCam;
      cam.position.copy(g.camera.position);
      cam.quaternion.copy(g.camera.quaternion);
      cam.fov = PhotoCamera.fovFor(this.focal);
      cam.aspect = W / H;
      cam.near = g.camera.near;
      cam.far = g.camera.far;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      // score before rendering (same instant)
      const win = lightWindow(g.hour);
      const rainbowInFrame = !!g.rainbowDir && this.inFrame(cam, cam.position.clone().addScaledVector(g.rainbowDir, 800));
      const score = scorePhoto(this.candidates(cam), {
        camera: cam,
        focusDist: this.focus,
        speedKmh: g.mode === 'drive' ? g.car.kmh : 0,
        window: win,
        weather: g.weatherName,
        flash: g.flashActive,
        rainbowInFrame,
        repeats: (uid) => this.repeats.get(uid) ?? 0,
        blocked: this.blocked,
      });
      for (const s of score.subjects) this.repeats.set(s.uid, (this.repeats.get(s.uid) ?? 0) + 1);
      // render with film look into the capture target
      const u = g.post.material.uniforms;
      const prev = { film: u.uFilm.value, flash: u.uFlash.value, fade: u.uFade.value, miss: u.uFocusMiss.value, blur: u.uBlur.value };
      u.uFilm.value = 1;
      u.uFlash.value = 0;
      u.uFade.value = 1;
      u.uFocusMiss.value = Math.min(1, (Math.abs(this.focus - this.focusTarget) / Math.max(1, this.focusTarget)) * 2.5);
      const cockpitVis = g.pcar.cockpit.visible;
      g.pcar.cockpit.visible = false;
      g.post.render(g.renderer, g.scene, cam, this.outRT, this.capRT);
      g.pcar.cockpit.visible = cockpitVis;
      Object.assign(u, {});
      u.uFilm.value = prev.film; u.uFlash.value = prev.flash; u.uFade.value = prev.fade; u.uFocusMiss.value = prev.miss; u.uBlur.value = prev.blur;
      const px = new Uint8Array(W * H * 4);
      g.renderer.readRenderTargetPixels(this.outRT, 0, 0, W, H, px);
      g.renderer.setRenderTarget(null);
      const { full, thumb } = await encode(px);
      const rec: PhotoRecord = {
        seed: g.world.seedStr,
        created: Date.now(),
        day: g.day,
        hour: g.hour,
        weather: g.weatherName,
        biome: g.world.dominantBiome(cam.position.z),
        pos: [cam.position.x, cam.position.y, cam.position.z],
        heading: g.camera.rotation.y,
        focal: this.focal,
        developed: false,
        payout: score.payout,
        stars: score.stars,
        primary: score.primary?.defId ?? null,
        subjects: score.subjects.map((s) => ({ defId: s.defId, uid: s.uid, tier: s.tier, score: s.score, value: Math.round(s.value) })),
        notes: score.notes,
        blob: full,
        thumb,
      };
      const id = await db.put('photos', rec);
      if (typeof id === 'number') rec.id = id;
      this.pending++;
      this.onShot?.(rec, score);
      saved = true;
    } catch (e) {
      console.warn('photo not saved', e);
      g.events.emit('toast', { text: 'That frame didn\'t save. The film is back in the camera.' });
    } finally {
      this.busy = false;
      if (!saved) {
        g.player.d.shots++;
        if (repeatSnapshot) this.repeats = repeatSnapshot;
      }
    }
  }
}

/** Flip rows (GL is bottom-up), encode JPEG + a small thumbnail. */
async function encode(px: Uint8Array): Promise<{ full: Blob; thumb: Blob }> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const row = W * 4;
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
  ctx.putImageData(img, 0, 0);
  const full = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
  const t = document.createElement('canvas');
  t.width = 320;
  t.height = 180;
  t.getContext('2d')!.drawImage(c, 0, 0, 320, 180);
  const thumb = await new Promise<Blob>((r) => t.toBlob((b) => r(b!), 'image/jpeg', 0.82));
  return { full, thumb };
}
