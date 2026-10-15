// Photo journal: one page per biome (plus roadside oddities and a hidden page).
// Best photo per subject, hints that teach the spawn rules, milestone unlocks.
import { SUBJECTS, SubjectDef, Page, PAGE_NAMES } from '../../data/subjects';
import { JOURNAL_UNLOCKS, COSMETIC_BY_ID } from '../../data/cosmetics';
import { FEATURES } from '../core/features';
import type { Player } from '../economy/state';

export interface Entry {
  photoId: number;
  score: number;
  stars: number;
  day: number;
}

export interface JournalData {
  entries: Record<string, Entry>;
  awarded: Record<string, number>; // page → milestones awarded (0-4)
  hiddenPages: string[]; // unlocked hidden pages
}

export const MILESTONES = [0.25, 0.5, 0.75, 1];

export class Journal {
  d: JournalData = { entries: {}, awarded: {}, hiddenPages: [] };

  pages(): Page[] {
    const base: Page[] = ['forest', 'coast', 'desert', 'farm', 'tropical', 'city', 'roadside'];
    if (FEATURES.india && this.d.hiddenPages.includes('ghat')) base.push('ghat');
    return base;
  }

  subjectsOn(page: Page): SubjectDef[] {
    return SUBJECTS.filter((s) => s.page === page && (FEATURES.india || !s.india));
  }

  progress(page: Page): number {
    const subs = this.subjectsOn(page);
    if (!subs.length) return 0;
    return subs.filter((s) => this.d.entries[s.id]).length / subs.length;
  }

  totalProgress(): [number, number] {
    let have = 0, all = 0;
    for (const p of this.pages()) {
      const subs = this.subjectsOn(p);
      all += subs.length;
      have += subs.filter((s) => this.d.entries[s.id]).length;
    }
    return [have, all];
  }

  hintFor(s: SubjectDef): string {
    const p = this.progress(s.page);
    if (s.tier === 'rare' && p < 0.25) return 'A rare sight. Fill a quarter of this page to learn where to look.';
    if (s.tier === 'legendary' && p < 0.5) return 'A legendary sight. Fill half of this page to learn the rule.';
    return s.hint;
  }

  /** Record a developed photo. Returns subjects that are new or improved. */
  record(photoId: number, day: number, subjects: { defId: string; score: number }[], stars: number, player: Player): { newOnes: string[]; unlocks: string[] } {
    const newOnes: string[] = [];
    const unlocks: string[] = [];
    for (const s of subjects) {
      if (s.defId.startsWith('gsign') && !this.d.hiddenPages.includes('ghat')) {
        this.d.hiddenPages.push('ghat');
        unlocks.push('A hidden page opens: Ghat road signs');
      }
      const cur = this.d.entries[s.defId];
      if (!cur) newOnes.push(s.defId);
      if (!cur || s.score > cur.score) this.d.entries[s.defId] = { photoId, score: s.score, stars: s.score >= 75 ? 3 : s.score >= 45 ? 2 : 1, day };
    }
    void stars;
    // milestones
    for (const page of this.pages()) {
      const p = this.progress(page);
      const have = this.d.awarded[page] ?? 0;
      let k = have;
      while (k < MILESTONES.length && p >= MILESTONES[k] - 1e-9) {
        const item = JOURNAL_UNLOCKS[page]?.[k];
        if (item && COSMETIC_BY_ID[item] && !player.owns(item)) {
          player.give(item);
          unlocks.push(`${PAGE_NAMES[page]} ${Math.round(MILESTONES[k] * 100)}%: ${COSMETIC_BY_ID[item].name}`);
        } else unlocks.push(`${PAGE_NAMES[page]} ${Math.round(MILESTONES[k] * 100)}% complete`);
        k++;
      }
      this.d.awarded[page] = k;
    }
    return { newOnes, unlocks };
  }
}
