// Structures from off-the-shelf models (credits in THIRD-PARTY-NOTICES.md), baked by
// scripts/prop-assets.mjs to flat-coloured parts in metres. Loaded once at boot (loadPropAssets,
// awaited with the people and animals) so the site builders can use them synchronously.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import windturbineUrl from '../assets/props/windturbine.glb?url';

const URLS = { windturbine: windturbineUrl };
export type PropKey = keyof typeof URLS;

export interface PropPart {
  /** non-indexed geometry with position and linear colour, in the part's own frame */
  geo: THREE.BufferGeometry;
  /** where the part's origin sits in the model (the rotor's hub) */
  at: THREE.Vector3;
}
const parts = new Map<string, PropPart>();
let loading: Promise<void> | null = null;

export function loadPropAssets(fetchBytes: (url: string) => Promise<ArrayBuffer> = (u) => fetch(u).then((r) => r.arrayBuffer())): Promise<void> {
  if (!loading) {
    const loader = new GLTFLoader();
    loading = Promise.all((Object.keys(URLS) as PropKey[]).map(async (k) => {
      const gltf = await loader.parseAsync(await fetchBytes(URLS[k]), '');
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        // the files carry no normals; flat ones for parts drawn on their own (the rotor), or a lit
        // material renders them black
        geo.computeVertexNormals();
        parts.set(`${k}/${m.name}`, { geo, at: m.position.clone() });
      });
    })).then(() => undefined);
  }
  return loading;
}

/** a loaded part, e.g. propPart('windturbine', 'rotor'); undefined before loadPropAssets resolves */
export const propPart = (key: PropKey, part: string) => parts.get(`${key}/${part}`);
