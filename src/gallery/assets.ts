// Everything the gallery can show. Each entry builds a fresh object standing on y = 0, facing -z.
// An entry with `legacy` shows the old model beside the new one until the new one is approved.
import * as THREE from 'three';
import { PlayerCar } from '../vehicle/cockpit';
import { applyCosmetics } from '../vehicle/cosmeticsDisplay';
import { vehicleModel, truckBack, autoSticker, type VehicleKind } from '../render/vehicleModels';
import { lifeMat } from '../render/lifeModels';
import * as People from '../render/peopleModels';
import { makeAnimal, ANIMAL_KEYS } from '../render/animalModels';
import { vegGeometry } from '../render/vegModels';
import { makeInstancedMat, matVC } from '../render/toon';
import { waterMaterial, waterGeometry, type WaterKind } from '../render/water';
import { discWater, gridWater, stripWater } from '../world/waterGeo';
import { buildSite, matGlow, type PropOut } from '../render/props';
import { ModelBuilder } from '../render/models';
import { mulberry32 } from '../world/prng';
import { World } from '../world/world';
import { chunkSites, type Site } from '../world/sites';
import { BIOMES, VEG_TYPES, type BiomeId } from '../../data/biomes';
import '../stops/stopModels';
import '../render/indiaModels';

export interface Asset {
  group: string;
  name: string;
  /** seed lets an asset show its variants (colours, liveries, looks) */
  build: (seed: number) => THREE.Object3D;
  legacy?: (seed: number) => THREE.Object3D;
  /** camera preset: 'cockpit' puts the camera in the driver's seat */
  view?: 'cockpit';
}

const assets: Asset[] = [];
const add = (a: Asset) => assets.push(a);

// ---------------------------------------------------------------- player car
const GROUND_TO_ROOT = 0.55; // the player car's root sits at wheel-centre height
add({
  group: 'Player car', name: 'Exterior',
  build: () => {
    const car = new PlayerCar();
    car.setInterior(false);
    applyCosmetics(car, {});
    car.root.position.y = GROUND_TO_ROOT;
    return wrap(car.root);
  },
});
add({
  group: 'Player car', name: 'Cockpit', view: 'cockpit',
  build: () => {
    const car = new PlayerCar();
    car.setInterior(true);
    applyCosmetics(car, {});
    car.root.position.y = GROUND_TO_ROOT;
    return wrap(car.root);
  },
});

// ---------------------------------------------------------------- traffic
function vehicle(model: typeof vehicleModel, kind: VehicleKind, seed: number) {
  const vm = model(kind, seed);
  const g = new THREE.Group();
  const body = new THREE.Mesh(vm.body, lifeMat);
  body.castShadow = true;
  g.add(body, new THREE.Mesh(vm.lamps, matGlow));
  if (kind === 'painted') g.add(truckBack(seed));
  if (kind === 'auto') g.add(autoSticker(seed));
  return g;
}
const KIND_NAMES: Record<VehicleKind, string> = {
  car: 'Sedan', hatch: 'Hatchback', van: 'Van', truck: 'Goods truck', painted: 'Painted truck', bus: 'Bus', tractor: 'Tractor with trolley', auto: 'Auto-rickshaw',
};
for (const kind of Object.keys(KIND_NAMES) as VehicleKind[]) {
  add({
    group: 'Traffic', name: KIND_NAMES[kind],
    build: (seed) => vehicle(vehicleModel, kind, seed),
  });
}

// ---------------------------------------------------------------- people and animals
// People from the Quaternius packs: one entry per age and sex, then a crowd.
for (const [name, age, sex] of [['Man', 'adult', 'm'], ['Woman', 'adult', 'f'], ['Teen boy', 'teen', 'm'], ['Teen girl', 'teen', 'f'], ['Boy', 'child', 'm'], ['Girl', 'child', 'f'], ['Old man', 'elder', 'm'], ['Old woman', 'elder', 'f']] as const) {
  add({
    group: 'People', name,
    build: (seed) => People.makePerson(People.randomLook(mulberry32(seed * 31 + name.length), age, sex)),
  });
}
add({
  group: 'People', name: 'Crowd',
  build: (seed) => {
    const g = new THREE.Group();
    const r = mulberry32(seed * 977);
    for (let i = 0; i < 12; i++) {
      const p = People.makePerson(People.randomLook(r));
      p.position.set((i % 6) * 0.9 - 2.25, 0, Math.floor(i / 6) * 1.4);
      g.add(p);
    }
    return g;
  },
});
for (const key of ANIMAL_KEYS) add({ group: 'Animals', name: key, build: () => makeAnimal(key) });

// ---------------------------------------------------------------- vegetation
const SWAY: Partial<Record<string, number>> = { pine: 0.6, broadleaf: 0.8, palm: 1.2, bush: 0.6, grass: 2.5, flowers: 2.5, banana: 1.2, bamboo: 0.8, crop: 1.8, acacia: 0.5 };
const VEG_COLOUR = new Map<string, { color: number; biome: BiomeId }>();
for (const b of Object.values(BIOMES)) for (const v of b.vegetation) if (!VEG_COLOUR.has(v.type)) VEG_COLOUR.set(v.type, { color: v.colors[0], biome: b.id });
for (const t of VEG_TYPES) {
  const info = VEG_COLOUR.get(t);
  add({
    group: 'Vegetation', name: info ? `${t} (${info.biome})` : t,
    build: () => {
      const m = new THREE.InstancedMesh(vegGeometry(t), makeInstancedMat(SWAY[t] ?? 0), 1);
      m.setMatrixAt(0, new THREE.Matrix4());
      m.setColorAt(0, new THREE.Color(info?.color ?? 0x6a8a50));
      m.castShadow = true;
      return m;
    },
  });
}

// ---------------------------------------------------------------- structures (real sites from generated worlds)
const flatWorld = { height: () => 0, road: () => ({ y: 0 }) } as unknown as World;
function siteObject(site: Site) {
  const s: Site = { ...site, x: 0, z: 0, heading: 0, flat: site.flat ? { ...site.flat, y: 0 } : undefined };
  const mb = new ModelBuilder(), glow = new ModelBuilder();
  const out: PropOut = { mb, glow, colliders: [], extras: [] };
  buildSite(flatWorld, s, out);
  const g = new THREE.Group();
  const body = new THREE.Mesh(mb.build(), matVC);
  body.castShadow = body.receiveShadow = true;
  g.add(body, new THREE.Mesh(glow.build(), matGlow), ...out.extras);
  return g;
}
const EXAMPLES: Record<string, number> = { building: 4, tower: 2 };
let siteCache: Map<string, Site> | null = null;
/** one example of every site kind (and variant family), found by scanning each biome's road */
function siteExamples() {
  if (siteCache) return siteCache;
  siteCache = new Map();
  const seen = new Map<string, number>();
  for (const biome of Object.keys(BIOMES) as BiomeId[]) {
    const world = new World('gallery', biome);
    for (let c = 0; c < 160; c++) {
      for (const s of chunkSites(world, c)) {
        if (s.kind === 'hidden') continue;
        // variants are mostly random numbers; keep named families, one per biome for stops,
        // and a few examples of the procedural town blocks
        const family = s.variant?.match(/^[a-z]+/i)?.[0];
        const base = `${s.kind}${family ? ':' + family : ''}${s.cat === 'stop' ? ':' + s.biome : ''}`;
        const n = (seen.get(base) ?? 0) + 1;
        if (n > (EXAMPLES[s.kind] ?? 1)) continue;
        seen.set(base, n);
        siteCache.set(n > 1 ? `${base} #${n}` : base, s);
      }
    }
  }
  return siteCache;
}
for (const [key, site] of [...siteExamples()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const group = site.cat === 'stop' ? 'Stops' : site.cat === 'landmark' ? 'Landmarks' : 'Buildings & roadside';
  add({ group, name: key.includes(site.biome) ? key.replace(/:/g, ' · ') : `${key.replace(/:/g, ' · ')} (${site.biome})`, build: () => siteObject(site) });
}

// ---------------------------------------------------------------- water
// Each water asset sits in a small patch of ground shaped like the real thing (a bowl, a channel, a
// beach), so the depth bands and shoreline foam show as they do in the game.
function groundPatch(size: number, segs: number, height: (x: number, z: number) => number, waterLevel: number) {
  const g = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xc9b98a), grass = new THREE.Color(0x6f9a50), mud = new THREE.Color(0x7a6a52), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = height(x, z);
    pos.setY(i, y);
    const above = y - waterLevel;
    c.copy(above < -0.3 ? mud : above < 0.7 ? sand : grass);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, matVC);
  m.receiveShadow = true;
  return m;
}
function waterScene(kind: WaterKind, biome: BiomeId, size: number, height: (x: number, z: number) => number, water: () => ReturnType<typeof gridWater>) {
  const g = new THREE.Group();
  g.add(groundPatch(size, 72, height, 0));
  const w = water();
  const pal = BIOMES[biome].palette;
  if (w) g.add(new THREE.Mesh(waterGeometry(w), waterMaterial(kind, pal.water, pal.waterDeep)));
  // lift the scene clear of the gallery's ground plane and pads so the water never fights them
  g.position.y = 1.0;
  return g;
}
add({
  group: 'Water', name: 'Lake (forest)',
  build: () => {
    const bowl = (x: number, z: number) => { const r = Math.hypot(x, z * 1.2); return r < 16 ? -4.5 * (1 - (r / 16) ** 2) + 0.8 : 0.8 + (r - 16) * 0.12; };
    return waterScene('lake', 'forest', 44, bowl, () => discWater(0, 0, 18, 0, bowl, 10, 48));
  },
});
add({
  group: 'Water', name: 'River (tropical)',
  build: () => {
    const chan = (x: number, z: number) => { const u = Math.abs(z + Math.sin(x * 0.12) * 2) / 6; return u < 1 ? -2.4 * (1 - u * u) + 0.5 : 0.5 + (u - 1) * 2.2; };
    const rows: number[][] = [];
    for (let x = -20; x <= 20; x += 2) rows.push([x, -7.5, x, 7.5]);
    return waterScene('river', 'tropical', 40, chan, () => stripWater(rows, 6, 0, chan));
  },
});
add({
  group: 'Water', name: 'Coast (sea)',
  build: () => {
    const beach = (x: number, z: number) => -6 + (z + 30) * 0.16 + Math.sin(x * 0.15) * 0.8;
    return waterScene('sea', 'coast', 60, beach, () => gridWater(-30, -30, 60, 40, 0, (i, j) => beach(-30 + i * 1.5, -30 + j * 1.5)));
  },
});

function wrap(o: THREE.Object3D) {
  const g = new THREE.Group();
  g.add(o);
  return g;
}

export const ASSETS = assets;
