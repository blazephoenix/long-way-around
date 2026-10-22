// Chunk + tile streaming. Terrain tiles (with vegetation) are built in a worker around
// the player with LOD rings; road chunks are built on the main thread ahead/behind.
import * as THREE from 'three';
import { World, CHUNK } from './world';
import { TILE, TileResult, TileRequest } from './tilegen';
import { VEG_TYPES, VegType, BIOMES } from '../../data/biomes';
import { matVC, makeInstancedMat } from '../render/toon';
import { vegGeometry } from '../render/vegModels';
import { waterMaterial, waterGeometry } from '../render/water';
import { buildRoadChunk, buildRoadChunkGen, ChunkMeshes, ExtraGen } from './chunkBuild';
import GenWorker from './worker?worker&inline';
import type { ModelBuilder } from '../render/models';
import { disposeTree } from '../render/models';

interface Tile {
  key: string;
  ix: number;
  iz: number;
  lod: number;
  veg: number;
  mesh: THREE.Mesh | null;
  water: THREE.Mesh | null;
  res: TileResult | null;
  pending: boolean;
  wantLod: number;
  wantVeg: number;
}

const CAP: Partial<Record<VegType, number>> = { grass: 30000, crop: 16000, flowers: 8000, bush: 14000, pine: 12000, broadleaf: 12000, tea: 40000 };
const SWAY: Partial<Record<VegType, number>> = { pine: 0.6, broadleaf: 0.8, palm: 1.2, bush: 0.6, grass: 2.5, flowers: 2.5, banana: 1.2, bamboo: 0.8, crop: 1.8, silveroak: 0.7, acacia: 0.5, tea: 0.2 };

export type ChunkExtra = ExtraGen;
void (null as unknown as ModelBuilder);

export class Streamer {
  readonly world: World;
  readonly scene: THREE.Scene;
  private worker: Worker;
  private tiles = new Map<string, Tile>();
  private inflight = 0;
  private gen = 0;
  private chunks = new Map<number, ChunkMeshes>();
  private veg = new Map<VegType, THREE.InstancedMesh>();
  private vegFar = new Map<VegType, THREE.InstancedMesh>();
  private vegDirty = false;
  private collDirty = false;
  private grid = new Map<number, number[]>(); // collider spatial hash
  private staticColliders = new Map<number, number[]>(); // per chunk
  radius = 3;
  density = 1;
  ahead = 1500;
  behind = 650;
  onChunkBuilt: ((c: number, group: THREE.Group) => void) | null = null;
  onChunkRemoved: ((c: number) => void) | null = null;
  onChunkDispose: ((g: THREE.Group) => void) | null = null;
  extra: ChunkExtra | null = null;
  readyTiles = 0;

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.scene = scene;
    this.worker = new GenWorker();
    this.worker.postMessage({ type: 'init', seed: world.seedStr, onlyBiome: world.onlyBiome });
    this.worker.onmessage = (e) => this.onTile(e.data);
    const mat = new Map<number, THREE.Material>();
    for (const t of VEG_TYPES) {
      const sway = SWAY[t] ?? 0;
      let m = mat.get(sway);
      if (!m) mat.set(sway, (m = makeInstancedMat(sway)));
      // near set casts shadows; the far set doesn't, uses the species' lighter geometry where it has
      // one, and lives on layer 1 so the mirror skips it
      for (const far of [false, true]) {
        const cap = Math.ceil((CAP[t] ?? 6000) * (far ? 0.7 : 0.6));
        const im = new THREE.InstancedMesh(vegGeometry(t, far), m, cap);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = !far && t !== 'grass' && t !== 'flowers' && t !== 'crop' && t !== 'tea';
        im.receiveShadow = true;
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        im.name = 'veg-' + t + (far ? '-far' : '');
        if (far) im.layers.set(1);
        (far ? this.vegFar : this.veg).set(t, im);
        scene.add(im);
      }
    }
  }

  dispose() {
    this.worker.terminate();
    for (const t of this.tiles.values()) {
      if (t.mesh) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); }
      if (t.water) { this.scene.remove(t.water); t.water.geometry.dispose(); }
    }
    for (const c of this.chunks.values()) { this.onChunkDispose?.(c.group); this.disposeGroup(c.group); }
    for (const im of [...this.veg.values(), ...this.vegFar.values()]) { this.scene.remove(im); im.dispose(); (im.material as THREE.Material).dispose(); }
  }

  private disposeGroup(g: THREE.Group) {
    this.scene.remove(g);
    disposeTree(g);
  }

  private onTile(m: { key: string; gen: number; res: TileResult }) {
    if (m.gen === this.gen) this.inflight = Math.max(0, this.inflight - 1);
    const t = this.tiles.get(m.key);
    if (!t || m.gen !== this.gen) return;
    t.pending = false;
    const r = m.res;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(r.colors, 3));
    g.setIndex(new THREE.BufferAttribute(r.index, 1));
    g.computeBoundingSphere();
    if (t.mesh) {
      t.mesh.geometry.dispose();
      t.mesh.geometry = g;
    } else {
      t.mesh = new THREE.Mesh(g, matVC);
      t.mesh.receiveShadow = true;
      t.mesh.name = 'tile';
      this.scene.add(t.mesh);
    }
    this.setWater(t, r);
    t.lod = r.lod;
    t.veg = r.veg;
    t.res = r;
    this.vegDirty = true;
    this.collDirty = true;
    this.readyTiles++;
  }

  private setWater(t: Tile, r: TileResult) {
    if (t.water) {
      this.scene.remove(t.water);
      t.water.geometry.dispose();
      t.water = null;
    }
    if (!r.water) return;
    const pal = BIOMES.coast.palette;
    t.water = new THREE.Mesh(waterGeometry(r.water), waterMaterial('sea', pal.water, pal.waterDeep));
    t.water.name = 'sea';
    this.scene.add(t.water);
  }

  private request(t: Tile) {
    t.pending = true;
    this.inflight++;
    const req: TileRequest = { ix: t.ix, iz: t.iz, lod: t.wantLod, veg: t.wantVeg, density: this.density };
    this.worker.postMessage({ type: 'tile', key: t.key, gen: this.gen, req });
  }

  /** Force regeneration (quality change). */
  refresh() {
    this.gen++;
    this.inflight = 0;
    for (const t of this.tiles.values()) { t.pending = false; t.lod = -1; }
  }

  /** Called each frame with the player's position and travel direction (sign of z). */
  update(pos: THREE.Vector3, dirZ: number) {
    // ---- tiles
    const cx = Math.floor(pos.x / TILE), cz = Math.floor(pos.z / TILE);
    {
      const ns = new Set<string>();
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const ix = cx + dx, iz = cz + dz;
          const ox = Math.max(0, Math.abs(pos.x - (ix + 0.5) * TILE) - TILE / 2);
          const oz = Math.max(0, Math.abs(pos.z - (iz + 0.5) * TILE) - TILE / 2);
          if (Math.hypot(ox, oz) < 120) ns.add(ix + ',' + iz);
        }
      const key = [...ns].sort().join('|');
      if (key !== this.nearKey) { this.nearKey = key; this.nearSet = ns; this.vegDirty = true; }
    }
    const R = this.radius;
    const want = new Set<string>();
    const queue: Tile[] = [];
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const ix = cx + dx, iz = cz + dz;
        const key = ix + ',' + iz;
        want.add(key);
        // ring by distance from the player to the tile, not tile index
        const ox = Math.max(0, Math.abs(pos.x - (ix + 0.5) * TILE) - TILE / 2);
        const oz = Math.max(0, Math.abs(pos.z - (iz + 0.5) * TILE) - TILE / 2);
        const d = Math.max(ox, oz);
        const lod = d < 140 ? 0 : d < 400 ? 1 : 2;
        const veg = d < 200 ? 2 : d < 460 ? 1 : 0;
        let t = this.tiles.get(key);
        if (!t) {
          t = { key, ix, iz, lod: -1, veg: -1, mesh: null, water: null, res: null, pending: false, wantLod: lod, wantVeg: veg };
          this.tiles.set(key, t);
        }
        t.wantLod = lod;
        t.wantVeg = veg;
        if (!t.pending && (t.lod !== lod || t.veg !== veg)) queue.push(t);
      }
    for (const [key, t] of this.tiles) {
      if (!want.has(key)) {
        if (t.mesh) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); }
        if (t.water) { this.scene.remove(t.water); t.water.geometry.dispose(); }
        this.tiles.delete(key);
        this.vegDirty = true;
        this.collDirty = true;
      }
    }
    queue.sort((a, b) => {
      const da = Math.hypot((a.ix + 0.5) * TILE - pos.x, (a.iz + 0.5) * TILE - pos.z) + (a.mesh ? 400 : 0);
      const db = Math.hypot((b.ix + 0.5) * TILE - pos.x, (b.iz + 0.5) * TILE - pos.z) + (b.mesh ? 400 : 0);
      return da - db;
    });
    for (const t of queue) {
      if (this.inflight >= 2) break;
      this.request(t);
    }

    // ---- road chunks
    const c0 = Math.floor((pos.z - (dirZ >= 0 ? this.behind : this.ahead)) / CHUNK);
    const c1 = Math.floor((pos.z + (dirZ >= 0 ? this.ahead : this.behind)) / CHUNK);
    for (const [c, ch] of this.chunks) {
      if (c < c0 - 1 || c > c1 + 1) {
        this.onChunkDispose?.(ch.group);
        this.disposeGroup(ch.group);
        this.chunks.delete(c);
        this.staticColliders.delete(c);
        this.collDirty = true;
        this.onChunkRemoved?.(c);
      }
    }
    // build the nearest missing chunk, a slice at a time within a small per-frame budget
    const pc = Math.floor(pos.z / CHUNK);
    if (this.job && (this.job.c < c0 - 1 || this.job.c > c1 + 1 || this.chunks.has(this.job.c))) this.job = null;
    if (!this.job) {
      let best: number | null = null;
      for (let c = c0; c <= c1; c++) if (!this.chunks.has(c) && (best === null || Math.abs(c - pc) < Math.abs(best - pc))) best = c;
      if (best !== null) this.job = { c: best, it: buildRoadChunkGen(this.world, best, this.extra ?? undefined) };
    }
    if (this.job) {
      const t0 = performance.now();
      // the chunk under the player is urgent; everything else gets ~4 ms per frame
      const budget = Math.abs(this.job.c - pc) <= 1 ? 40 : 4;
      while (performance.now() - t0 < budget) {
        const r = this.job.it.next();
        if (r.done) {
          this.addChunk(this.job.c, r.value);
          this.job = null;
          break;
        }
      }
    }

    if (this.vegDirty) this.rebuildVeg();
    if (this.collDirty) this.rebuildColliders();
  }

  private job: { c: number; it: Generator<void, ChunkMeshes> } | null = null;

  buildChunk(c: number) {
    if (this.job?.c === c) this.job = null;
    this.addChunk(c, buildRoadChunk(this.world, c, this.extra ?? undefined));
  }

  private addChunk(c: number, ch: ChunkMeshes) {
    this.chunks.set(c, ch);
    this.scene.add(ch.group);
    this.staticColliders.set(c, ch.colliders);
    this.collDirty = true;
    this.onChunkBuilt?.(c, ch.group);
  }

  hasChunk(c: number) {
    return this.chunks.has(c);
  }

  /** Synchronously ensure chunks around a position exist (spawn/teleport). */
  ensureChunks(z: number) {
    const pc = Math.floor(z / CHUNK);
    for (let c = pc - 1; c <= pc + 2; c++) if (!this.chunks.has(c)) this.buildChunk(c);
  }

  get tilesPending() {
    let n = 0;
    for (const t of this.tiles.values()) if (!t.mesh) n++;
    return n;
  }

  private nearX = 0;
  private nearZ = 0;
  private nearSet = new Set<string>();
  private nearKey = '';
  private rebuildVeg() {
    this.vegDirty = false;
    const counts = new Map<THREE.InstancedMesh, number>();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (const t of this.tiles.values()) {
      const r = t.res;
      if (!r) continue;
      // tiles within ~120 m of the player are near (their trees cast shadows)
      const near = this.nearSet.has(t.key);
      for (let k = 0; k < r.vegTypes.length; k++) {
        const type = r.vegTypes[k];
        const im = (near ? this.veg : this.vegFar).get(type)!;
        const cap = im.instanceMatrix.count;
        const d = r.vegData[k];
        let n = counts.get(im) ?? 0;
        const arr = im.instanceMatrix.array as Float32Array;
        const ca = im.instanceColor!.array as Float32Array;
        for (let i = 0; i < d.length && n < cap; i += 8) {
          q.setFromAxisAngle(up, d[i + 3]);
          p.set(d[i], d[i + 1], d[i + 2]);
          s.setScalar(d[i + 4]);
          m.compose(p, q, s);
          m.toArray(arr, n * 16);
          ca[n * 3] = d[i + 5]; ca[n * 3 + 1] = d[i + 6]; ca[n * 3 + 2] = d[i + 7];
          n++;
        }
        counts.set(im, n);
      }
    }
    for (const im of [...this.veg.values(), ...this.vegFar.values()]) {
      im.count = counts.get(im) ?? 0;
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor!.needsUpdate = true;
    }
  }

  private rebuildColliders() {
    this.collDirty = false;
    this.grid.clear();
    const add = (x: number, z: number, r: number) => {
      const k = Streamer.cell(Math.floor(x / 16), Math.floor(z / 16));
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(x, z, r);
    };
    for (const t of this.tiles.values()) {
      const c = t.res?.colliders;
      if (!c) continue;
      for (let i = 0; i < c.length; i += 3) add(c[i], c[i + 1], c[i + 2]);
    }
    for (const arr of this.staticColliders.values()) for (let i = 0; i < arr.length; i += 3) add(arr[i], arr[i + 1], arr[i + 2]);
  }

  private static cell(ix: number, iz: number) {
    return ix * 92821 + iz * 68917;
  }

  /** Visit colliders near (x,z). */
  queryColliders(x: number, z: number, radius: number, fn: (cx: number, cz: number, r: number) => void) {
    const x0 = Math.floor((x - radius - 4) / 16), x1 = Math.floor((x + radius + 4) / 16);
    const z0 = Math.floor((z - radius - 4) / 16), z1 = Math.floor((z + radius + 4) / 16);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const a = this.grid.get(Streamer.cell(ix, iz));
        if (!a) continue;
        for (let i = 0; i < a.length; i += 3) fn(a[i], a[i + 1], a[i + 2]);
      }
  }

  /** Add a dynamic collider list for a chunk (stops, landmarks). */
  setChunkColliders(c: number, arr: number[]) {
    this.staticColliders.set(c, arr);
    this.collDirty = true;
  }
}
