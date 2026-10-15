// Stop interactions: finds nearby stops, exposes interaction points (pump, shop, kiosk,
// diner counter, motel office, stand, bench), handles entry (autosave, safety-net film).
import { World, CHUNK } from '../world/world';
import { chunkSites, Site } from '../world/sites';
import { Rng, hashString } from '../world/prng';
import { stopName } from './stopModels';

export type PointKind = 'pump' | 'shop' | 'kiosk' | 'diner' | 'motel' | 'stand' | 'bench' | 'npc';

export interface Point {
  id: string;
  kind: PointKind;
  site: Site;
  x: number;
  z: number;
  /** direction the player faces when using it (benches) */
  face?: number;
}

const LOCAL: Record<string, [PointKind, number, number][]> = {
  gas: [['pump', -2.4, -6.1], ['pump', 2.4, -6.1], ['shop', 0, 6.6], ['kiosk', 7.5, 4.9]],
  diner: [['diner', 5.8, 1.2]],
  motel: [['motel', -13, -1.2]],
  stand: [['stand', 0, -2.0]],
  overlook: [['bench', -4, 4.4], ['bench', 4, 4.4]],
  bench: [['bench', 0, -0.4]],
  toll: [],
};

export function pointsFor(site: Site): Point[] {
  const loc = LOCAL[site.kind];
  if (!loc) return [];
  const c = Math.cos(site.heading), s = Math.sin(site.heading);
  return loc.map(([kind, lx, lz], i) => ({
    id: `${site.id}#${i}`,
    kind,
    site,
    // local → world: rotate by heading (yaw), model -z faces the road
    x: site.x + lx * c + lz * s,
    z: site.z - lx * s + lz * c,
    face: kind === 'bench' ? site.heading + Math.PI : undefined,
  }));
}

export function siteName(site: Site): string {
  return stopName(site, new Rng(hashString(site.id)));
}

export class Stops {
  current: Site | null = null;
  private visited = new Set<string>();
  points: Point[] = [];
  onEnter: ((s: Site, first: boolean) => void) | null = null;
  onLeave: ((s: Site) => void) | null = null;
  constructor(private world: World) {}

  nearbySites(x: number, z: number): Site[] {
    const c = Math.floor(z / CHUNK);
    const out: Site[] = [];
    for (let i = c - 2; i <= c + 2; i++) for (const s of chunkSites(this.world, i)) if (s.cat === 'stop' || s.kind === 'bench') out.push(s);
    return out;
  }

  update(x: number, z: number) {
    let inside: Site | null = null;
    this.points = [];
    for (const s of this.nearbySites(x, z)) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < 140) this.points.push(...pointsFor(s));
      if (s.cat === 'stop' && s.kind !== 'toll' && d < Math.max(s.clear, 22)) inside = s;
    }
    if (inside && inside !== this.current) {
      const first = !this.visited.has(inside.id);
      this.visited.add(inside.id);
      this.current = inside;
      this.onEnter?.(inside, first);
    } else if (!inside && this.current) {
      this.onLeave?.(this.current);
      this.current = null;
    }
  }

  nearestPoint(x: number, z: number, maxD = 2.4): Point | null {
    let best: Point | null = null;
    let bd = maxD;
    for (const p of this.points) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
