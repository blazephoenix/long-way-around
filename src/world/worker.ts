// Generation worker: builds terrain tiles + vegetation off the main thread.
import { World } from './world';
import { buildTile, TileRequest } from './tilegen';
import type { BiomeId } from '../../data/biomes';

let world: World | null = null;

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'init') {
    world = new World(m.seed, (m.onlyBiome as BiomeId) ?? null);
    return;
  }
  if (m.type === 'tile' && world) {
    const req = m.req as TileRequest;
    const r = buildTile(world, req);
    const transfer: Transferable[] = [r.positions.buffer, r.normals.buffer, r.colors.buffer, r.index.buffer, r.colliders.buffer, ...r.vegData.map((d) => d.buffer)];
    // subarrays share buffers: copy to tight arrays before transfer
    const tight = {
      ...r,
      positions: r.positions.slice(),
      normals: r.normals.slice(),
      colors: r.colors.slice(),
    };
    void transfer;
    const water = r.water ? [r.water.positions.buffer, r.water.depth.buffer, r.water.index.buffer] : [];
    (self as unknown as Worker).postMessage({ type: 'tile', key: m.key, gen: m.gen, res: tight }, [tight.positions.buffer, tight.normals.buffer, tight.colors.buffer, r.index.buffer, r.colliders.buffer, ...r.vegData.map((d) => d.buffer), ...water]);
  }
};
