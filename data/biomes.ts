// Data-driven biome definitions. Adding a biome is a data change: add a config here,
// give it adjacency weights, and reference it from at least one neighbour.
// Palettes are drawn from scenery references (see REFERENCES.md): clean daylight colour,
// no blanket sepia/yellow grade on any region.

export type BiomeId = 'forest' | 'coast' | 'desert' | 'farm' | 'tropical' | 'city';
export const BIOME_IDS: BiomeId[] = ['forest', 'coast', 'desert', 'farm', 'tropical', 'city'];

export type VegType =
  | 'pine' | 'broadleaf' | 'palm' | 'bush' | 'rock' | 'grass' | 'flowers'
  | 'euphorbia' | 'acacia' | 'banana' | 'bamboo' | 'tea' | 'crop' | 'boulder' | 'silveroak';
export const VEG_TYPES: VegType[] = [
  'pine', 'broadleaf', 'palm', 'bush', 'rock', 'grass', 'flowers',
  'euphorbia', 'acacia', 'banana', 'bamboo', 'tea', 'crop', 'boulder', 'silveroak',
];

export type TerrainKind = 'rolling' | 'coast' | 'mesa' | 'farm' | 'steep' | 'flat';
export type StationId = 'lofi' | 'ambient' | 'night' | 'raga' | 'static';
export type WeatherId = 'clear' | 'overcast' | 'fog' | 'rain' | 'storm';

export interface VegSpec {
  type: VegType;
  /** instances per hectare */
  density: number;
  scale: [number, number];
  colors: number[];
  /** fraction of area noise mask (0 = everywhere, 0.5 = patchy) */
  patchy?: number;
  /** minimum lateral distance from road centre */
  minRoad?: number;
  /** maximum slope (0..1) */
  maxSlope?: number;
  collide?: number; // collider radius multiplier, 0 = none
}

export interface BiomeConfig {
  id: BiomeId;
  name: string;
  /** main-road shape */
  road: {
    baseElev: number;
    hillAmp: number;
    hillLen: number;
    curveAmp: number;
    curveLen: number;
    curveAmp2: number;
    curveLen2: number;
    centerLine: number;
    edgeLine: number;
    asphalt: number;
    shoulder: number;
  };
  terrain: { kind: TerrainKind; amp: number; scale: number; corridor: number };
  palette: {
    ground: number[]; // low → high variation
    ground2: number; // secondary patches (fields, sand, moss)
    rock: number;
    cliff: number;
    beach: number;
    water: number;
    waterDeep: number;
  };
  /** toon ramp: brightness of each band, 3-4 steps */
  gradient: number[];
  fog: { color: number; near: number; far: number };
  vegetation: VegSpec[];
  lakes: number; // chance per chunk
  rivers: number; // chance per chunk
  life: { traffic: number; pedestrians: number; animals: number };
  weather: Record<WeatherId, number>;
  radio: StationId;
  adjacency: Partial<Record<BiomeId, number>>;
  /** stop style keyword used by stop builders */
  stopStyle: 'timber' | 'coastal' | 'adobe' | 'farm' | 'tropical' | 'neon';
  /** ink tint multiplier (outline colour shifts slightly per biome) */
  ink: number;
}

export const BIOMES: Record<BiomeId, BiomeConfig> = {
  forest: {
    id: 'forest',
    name: 'Pine forest & lakes',
    road: {
      baseElev: 70, hillAmp: 6, hillLen: 900, curveAmp: 45, curveLen: 620, curveAmp2: 12, curveLen2: 260,
      centerLine: 0xf2efe4, edgeLine: 0xf2efe4, asphalt: 0x4a4d52, shoulder: 0x6b6a55,
    },
    terrain: { kind: 'rolling', amp: 30, scale: 1 / 420, corridor: 70 },
    palette: {
      ground: [0x4f7a45, 0x5f8a4c, 0x76955a, 0x8a9a6a],
      ground2: 0x3f6a48,
      rock: 0x8a8a86,
      cliff: 0x77746c,
      beach: 0xb9ad8a,
      water: 0x3f7f9a,
      waterDeep: 0x2b5c78,
    },
    gradient: [0.42, 0.68, 0.88, 1.0],
    fog: { color: 0xa9c4c8, near: 120, far: 760 },
    vegetation: [
      { type: 'pine', density: 26, scale: [0.8, 1.6], colors: [0x2f5d3f, 0x356b45, 0x29513a], patchy: 0.25, minRoad: 7, maxSlope: 0.9, collide: 0.5 },
      { type: 'broadleaf', density: 3, scale: [0.8, 1.2], colors: [0x5f8f3e, 0x6e9a45], patchy: 0.5, minRoad: 8, collide: 0.5 },
      { type: 'rock', density: 4, scale: [0.5, 1.6], colors: [0x8d8b85, 0x7d7b78], minRoad: 6, collide: 0.9 },
      { type: 'bush', density: 10, scale: [0.6, 1.2], colors: [0x4b7a40, 0x58884a], minRoad: 5.5 },
      { type: 'grass', density: 40, scale: [0.7, 1.3], colors: [0x6f9a50, 0x7fa85a], minRoad: 5 },
      { type: 'flowers', density: 6, scale: [0.8, 1.2], colors: [0xe8d27a, 0xc9a0dc, 0xf0f0f0], patchy: 0.4, minRoad: 5 },
    ],
    lakes: 0.45,
    rivers: 0.12,
    life: { traffic: 1.2, pedestrians: 0, animals: 1.0 },
    weather: { clear: 0.45, overcast: 0.2, fog: 0.15, rain: 0.15, storm: 0.05 },
    radio: 'ambient',
    adjacency: { coast: 0.3, farm: 0.3, tropical: 0.4 },
    stopStyle: 'timber',
    ink: 1.0,
  },
  coast: {
    id: 'coast',
    name: 'Coastal highway',
    road: {
      baseElev: 26, hillAmp: 7, hillLen: 1300, curveAmp: 95, curveLen: 950, curveAmp2: 10, curveLen2: 320,
      centerLine: 0xf2efe4, edgeLine: 0xf2efe4, asphalt: 0x52545a, shoulder: 0xb5a882,
    },
    terrain: { kind: 'coast', amp: 28, scale: 1 / 380, corridor: 50 },
    palette: {
      ground: [0x6d9a52, 0x7ea65a, 0x92ad66, 0xa7b277],
      ground2: 0xc9bb8e,
      rock: 0x9a9184,
      cliff: 0x8f7f6a,
      beach: 0xe3d3a6,
      water: 0x2f8fa6,
      waterDeep: 0x1f6488,
    },
    gradient: [0.45, 0.72, 0.92, 1.0],
    fog: { color: 0xb8d4dc, near: 160, far: 900 },
    vegetation: [
      { type: 'palm', density: 6, scale: [0.85, 1.25], colors: [0x4f8a3c, 0x5b9446], patchy: 0.45, minRoad: 7, collide: 0.35 },
      { type: 'bush', density: 9, scale: [0.6, 1.1], colors: [0x5f8c45, 0x6f9a4c], minRoad: 5.5 },
      { type: 'grass', density: 36, scale: [0.7, 1.2], colors: [0x88a85c, 0x9db36a], minRoad: 5 },
      { type: 'rock', density: 5, scale: [0.6, 2.0], colors: [0x9a9184, 0x857d72], minRoad: 6, collide: 0.9 },
      { type: 'broadleaf', density: 3, scale: [0.9, 1.3], colors: [0x4f7f3a], patchy: 0.5, minRoad: 8, collide: 0.5 },
    ],
    lakes: 0.05,
    rivers: 0.08,
    life: { traffic: 2.5, pedestrians: 0.2, animals: 0.6 },
    weather: { clear: 0.5, overcast: 0.2, fog: 0.12, rain: 0.13, storm: 0.05 },
    radio: 'lofi',
    adjacency: { tropical: 0.45, forest: 0.25, city: 0.3 },
    stopStyle: 'coastal',
    ink: 1.0,
  },
  desert: {
    id: 'desert',
    name: 'Desert mesas',
    road: {
      baseElev: 55, hillAmp: 3, hillLen: 2400, curveAmp: 160, curveLen: 3600, curveAmp2: 4, curveLen2: 600,
      centerLine: 0xe8c547, edgeLine: 0xf2efe4, asphalt: 0x56524f, shoulder: 0xc9a77a,
    },
    terrain: { kind: 'mesa', amp: 46, scale: 1 / 520, corridor: 60 },
    palette: {
      ground: [0xd3b083, 0xc99f70, 0xdcbf94, 0xe2c9a0],
      ground2: 0xb88a5c,
      rock: 0xb46e4a,
      cliff: 0xa65f40,
      beach: 0xe8d2a8,
      water: 0x4f93a8,
      waterDeep: 0x3b7690,
    },
    gradient: [0.5, 0.75, 0.93, 1.0],
    fog: { color: 0xd9d6cc, near: 220, far: 1100 },
    vegetation: [
      { type: 'acacia', density: 1.6, scale: [0.8, 1.3], colors: [0x7f8f4a, 0x6f8445], patchy: 0.4, minRoad: 8, collide: 0.4 },
      { type: 'euphorbia', density: 2.5, scale: [0.6, 1.3], colors: [0x5f8a4f, 0x6f9455], patchy: 0.5, minRoad: 6, collide: 0.5 },
      { type: 'bush', density: 6, scale: [0.4, 0.9], colors: [0x9a9a5c, 0x8c8a55], minRoad: 5.5 },
      { type: 'rock', density: 4, scale: [0.6, 2.2], colors: [0xb46e4a, 0xa66545], minRoad: 6, collide: 0.9 },
      { type: 'boulder', density: 0.5, scale: [1.5, 3.5], colors: [0xb87250], patchy: 0.6, minRoad: 12, collide: 1 },
      { type: 'grass', density: 8, scale: [0.6, 1.0], colors: [0xc9b77a, 0xbfa96c], minRoad: 5 },
    ],
    lakes: 0.0,
    rivers: 0.0,
    life: { traffic: 0.4, pedestrians: 0, animals: 0.4 },
    weather: { clear: 0.78, overcast: 0.1, fog: 0.02, rain: 0.06, storm: 0.04 },
    radio: 'lofi',
    adjacency: { farm: 1 },
    stopStyle: 'adobe',
    ink: 0.95,
  },
  farm: {
    id: 'farm',
    name: 'Farmland hills',
    road: {
      baseElev: 40, hillAmp: 9, hillLen: 1100, curveAmp: 70, curveLen: 1200, curveAmp2: 8, curveLen2: 400,
      centerLine: 0xf2efe4, edgeLine: 0xf2efe4, asphalt: 0x4f5156, shoulder: 0x9a8a62,
    },
    terrain: { kind: 'farm', amp: 18, scale: 1 / 600, corridor: 50 },
    palette: {
      ground: [0x7fa64f, 0x8fb257, 0x9fb862, 0xa9bd6c],
      ground2: 0xe0c44a, // mustard-flower fields
      rock: 0x948c7c,
      cliff: 0x8a7a62,
      beach: 0xc9b98e,
      water: 0x4a8aa0,
      waterDeep: 0x356f86,
    },
    gradient: [0.45, 0.72, 0.9, 1.0],
    fog: { color: 0xc3d3d6, near: 180, far: 950 },
    vegetation: [
      { type: 'broadleaf', density: 7, scale: [0.9, 1.6], colors: [0x557f38, 0x618a3e, 0x4a7a34], patchy: 0.5, minRoad: 8, collide: 0.5 },
      { type: 'palm', density: 1.2, scale: [0.9, 1.2], colors: [0x5b8a40], patchy: 0.6, minRoad: 8, collide: 0.35 },
      { type: 'crop', density: 30, scale: [0.8, 1.2], colors: [0x9fbf55, 0xc8b04a], patchy: 0.5, minRoad: 9 },
      { type: 'bush', density: 5, scale: [0.6, 1.1], colors: [0x5f8c45], minRoad: 5.5 },
      { type: 'grass', density: 30, scale: [0.7, 1.2], colors: [0x8fb05a, 0x9cb865], minRoad: 5 },
      { type: 'flowers', density: 5, scale: [0.8, 1.2], colors: [0xf2d54a, 0xffffff], patchy: 0.4, minRoad: 5 },
    ],
    lakes: 0.15,
    rivers: 0.1,
    life: { traffic: 1.0, pedestrians: 0.15, animals: 0.7 },
    weather: { clear: 0.55, overcast: 0.2, fog: 0.1, rain: 0.12, storm: 0.03 },
    radio: 'lofi',
    adjacency: { desert: 0.3, city: 0.25, forest: 0.3, coast: 0.15 },
    stopStyle: 'farm',
    ink: 1.0,
  },
  tropical: {
    id: 'tropical',
    name: 'Tropical forest',
    road: {
      baseElev: 85, hillAmp: 10, hillLen: 900, curveAmp: 34, curveLen: 330, curveAmp2: 10, curveLen2: 160,
      centerLine: 0xf2efe4, edgeLine: 0xf2efe4, asphalt: 0x45484c, shoulder: 0xa4583a, // laterite red
    },
    terrain: { kind: 'steep', amp: 46, scale: 1 / 360, corridor: 45 },
    palette: {
      ground: [0x2f7a3a, 0x3a8a40, 0x4c9a46, 0x5aa04a],
      ground2: 0x9a4b30, // laterite soil
      rock: 0x56684a,
      cliff: 0x8a4a33,
      beach: 0xbfa77a,
      water: 0x3a8a8a,
      waterDeep: 0x266a70,
    },
    gradient: [0.4, 0.66, 0.88, 1.0],
    fog: { color: 0xb3cbbf, near: 90, far: 620 },
    vegetation: [
      { type: 'broadleaf', density: 42, scale: [1.0, 1.9], colors: [0x2f6f32, 0x3a7d36, 0x2a6430, 0x448a3a], patchy: 0.15, minRoad: 7, collide: 0.5 },
      { type: 'palm', density: 3, scale: [0.9, 1.3], colors: [0x3f8a3a], patchy: 0.5, minRoad: 7, collide: 0.35 },
      { type: 'banana', density: 5, scale: [0.8, 1.2], colors: [0x5aa24a, 0x6aac4f], patchy: 0.5, minRoad: 6 },
      { type: 'bamboo', density: 4, scale: [0.8, 1.3], colors: [0x7fae4a, 0x6f9f45], patchy: 0.55, minRoad: 7, collide: 0.6 },
      { type: 'bush', density: 30, scale: [0.7, 1.4], colors: [0x3f8a3c, 0x4a9442], minRoad: 5.5 },
      { type: 'tea', density: 2000, scale: [0.95, 1.1], colors: [0x4f9a3a, 0x5aa040, 0x56a23c], minRoad: 14, maxSlope: 1.0 },
      { type: 'silveroak', density: 4, scale: [0.9, 1.2], colors: [0x4a7a3a], minRoad: 14, collide: 0.4 },
      { type: 'grass', density: 30, scale: [0.8, 1.4], colors: [0x5aa04a, 0x66aa50], minRoad: 5 },
    ],
    lakes: 0.15,
    rivers: 0.3,
    life: { traffic: 1.2, pedestrians: 0.05, animals: 1.0 },
    weather: { clear: 0.3, overcast: 0.25, fog: 0.15, rain: 0.22, storm: 0.08 },
    radio: 'ambient',
    adjacency: { coast: 0.5, forest: 0.5 },
    stopStyle: 'tropical',
    ink: 1.0,
  },
  city: {
    id: 'city',
    name: 'City & towns',
    road: {
      baseElev: 22, hillAmp: 2.5, hillLen: 1500, curveAmp: 40, curveLen: 1400, curveAmp2: 4, curveLen2: 500,
      centerLine: 0xf2efe4, edgeLine: 0xf2efe4, asphalt: 0x47494e, shoulder: 0x8d8b86,
    },
    terrain: { kind: 'flat', amp: 6, scale: 1 / 500, corridor: 40 },
    palette: {
      ground: [0x8a9a6a, 0x93a070, 0x9aa577, 0xa2aa80],
      ground2: 0x9d9a92,
      rock: 0x8d8b86,
      cliff: 0x7d7a74,
      beach: 0xc9bb8e,
      water: 0x4a7f98,
      waterDeep: 0x386a82,
    },
    gradient: [0.45, 0.7, 0.9, 1.0],
    fog: { color: 0xc4c9cc, near: 140, far: 820 },
    vegetation: [
      { type: 'broadleaf', density: 3, scale: [0.9, 1.4], colors: [0x557f38, 0x618a3e], patchy: 0.5, minRoad: 14, collide: 0.5 },
      { type: 'bush', density: 4, scale: [0.6, 1.0], colors: [0x5f8c45], minRoad: 12 },
      { type: 'grass', density: 12, scale: [0.7, 1.1], colors: [0x8fa05a], minRoad: 12 },
    ],
    lakes: 0.0,
    rivers: 0.05,
    life: { traffic: 5, pedestrians: 2.0, animals: 0.3 },
    weather: { clear: 0.55, overcast: 0.22, fog: 0.08, rain: 0.12, storm: 0.03 },
    radio: 'night',
    adjacency: { farm: 0.5, coast: 0.5 },
    stopStyle: 'neon',
    ink: 1.05,
  },
};
