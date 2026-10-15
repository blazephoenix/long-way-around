// All economy constants in one place. Tune here; tests/economy.sim.test.ts reports the balance.
export const ECON = {
  startMoney: 100,
  startRolls: 1,
  shotsPerRoll: 24,
  maxRolls: 5,
  tankKm: 20,
  fullRefill: 60, // cost of 0 → 100%
  filmRoll: 15,
  coffee: 10,
  motel: 30,
  cuttingChai: 5, // half-price chai at a tapri stand
  gasSpacing: [4000, 7000] as [number, number],
  lowFuel: 0.15,
  rarity: {
    common: [5, 15],
    uncommon: [15, 35],
    rare: [40, 120],
    legendary: [150, 300],
  } as Record<'common' | 'uncommon' | 'rare' | 'legendary', [number, number]>,
  /** payout = min + (max-min) * (floor + (1-floor) * quality^curve) */
  qualityCurve: 2.0,
  qualityFloor: 0.18,
  /** extra subjects in frame add this fraction of their value */
  extraSubjectBonus: 0.25,
  maxExtraSubjects: 2,
  /** repeat photos of the same individual in one in-game day: value *= decay^n */
  repeatDecay: 0.45,
  /** shots below this score pay nothing even with a subject */
  minScore: 8,
};

export type Rarity = keyof typeof ECON.rarity;
