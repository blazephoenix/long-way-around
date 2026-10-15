// Areas kept clear of vegetation: stop pads, landmarks, branch points of interest.
import { World, CHUNK } from './world';
import { chunkSites } from './sites';

export function reservedAt(world: World, x: number, z: number): boolean {
  const c = Math.floor(z / CHUNK);
  for (let i = c - 2; i <= c + 2; i++) {
    for (const s of chunkSites(world, i)) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.clear * s.clear) return true;
    }
  }
  return false;
}
