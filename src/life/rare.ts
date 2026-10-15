// The rare subject that lives at a hidden spot (biome-dependent, fixed per spot).
import { SUBJECTS, SubjectDef } from '../../data/subjects';
import { FEATURES } from '../core/features';
import { hashString } from '../world/prng';
import type { Site } from '../world/sites';

export function rareForSite(site: Site): SubjectDef {
  const pool = SUBJECTS.filter((s) => s.page === site.biome && s.kind === 'wildlife' && s.spawn && (s.tier === 'rare' || s.tier === 'legendary') && (FEATURES.india || !s.india));
  if (!pool.length) return SUBJECTS.find((s) => s.id === 'owl')!;
  return pool[hashString(site.id) % pool.length];
}
