// Photo payout rules (pure, shared by the game and the economy simulation).
import { ECON, Rarity } from '../../data/economy';

/** Money for one subject in a photo. score 0..100, repeats = earlier shots of this individual today. */
export function subjectValue(rarity: Rarity, score: number, repeats: number, seedFrac = 0.5): number {
  if (score < ECON.minScore) return 0;
  const [lo, hi] = ECON.rarity[rarity];
  const q = ECON.qualityFloor + (1 - ECON.qualityFloor) * Math.pow(Math.min(1, score / 100), ECON.qualityCurve);
  // seedFrac spreads value within the band for different species of the same tier
  const v = lo + (hi - lo) * (q * 0.9 + seedFrac * 0.1);
  return v * Math.pow(ECON.repeatDecay, repeats);
}

export interface Shot {
  primary: number; // value of the best subject
  extras: number[]; // values of the other subjects
}

export function photoPayout(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  let total = sorted[0];
  for (let i = 1; i <= ECON.maxExtraSubjects && i < sorted.length; i++) total += sorted[i] * ECON.extraSubjectBonus;
  return Math.round(total);
}
