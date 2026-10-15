// Economy simulation: 60-minute sessions for casual, average and skilled players.
// Prints income vs spend; the balance target is 1.3-1.6x for the average player.
import { it, expect } from 'vitest';
import { ECON, Rarity } from '../data/economy';
import { COSMETICS } from '../data/cosmetics';
import { subjectValue, photoPayout } from '../src/camera/payout';
import { Rng } from '../src/world/prng';

interface Profile {
  name: string;
  driveFrac: number; // share of the hour spent driving
  kmh: number; // average speed while driving
  offroad: number; // share of km offroad/branch (higher burn)
  shotsPerHour: number;
  hitRate: number; // share of shots with a registered subject
  quality: [number, number]; // score mean, spread
  rarity: [number, number, number, number];
  repeatShare: number; // share of subject shots that repeat an individual
  extraSubjects: number; // mean extra subjects in frame
  coffees: number;
  motels: number;
}

const PROFILES: Profile[] = [
  { name: 'casual', driveFrac: 0.7, kmh: 55, offroad: 0.02, shotsPerHour: 28, hitRate: 0.55, quality: [45, 18], rarity: [0.86, 0.13, 0.01, 0], repeatShare: 0.3, extraSubjects: 0.1, coffees: 1, motels: 0 },
  { name: 'average', driveFrac: 0.62, kmh: 62, offroad: 0.06, shotsPerHour: 28, hitRate: 0.6, quality: [55, 18], rarity: [0.76, 0.2, 0.035, 0.005], repeatShare: 0.2, extraSubjects: 0.2, coffees: 1, motels: 0.3 },
  { name: 'skilled', driveFrac: 0.55, kmh: 68, offroad: 0.12, shotsPerHour: 42, hitRate: 0.76, quality: [70, 14], rarity: [0.62, 0.29, 0.075, 0.015], repeatShare: 0.1, extraSubjects: 0.35, coffees: 1, motels: 0.5 },
];
const TIERS: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

function session(p: Profile, rng: Rng) {
  const km = p.driveFrac * p.kmh;
  const burn = (1 - p.offroad) * 1 + p.offroad * 1.75;
  const fuel = (km / ECON.tankKm) * ECON.fullRefill * burn;
  const shots = Math.round(p.shotsPerHour * rng.range(0.8, 1.2));
  const film = (shots / ECON.shotsPerRoll) * ECON.filmRoll;
  const extras = p.coffees * ECON.coffee + p.motels * ECON.motel;
  let income = 0;
  for (let i = 0; i < shots; i++) {
    if (!rng.chance(p.hitRate)) continue;
    const score = Math.max(0, Math.min(100, p.quality[0] + (rng.float() + rng.float() + rng.float() - 1.5) * p.quality[1] * 1.4));
    const tier = rng.weighted(TIERS, p.rarity);
    const rep = rng.chance(p.repeatShare) ? 1 + (rng.chance(0.3) ? 1 : 0) : 0;
    const vals = [subjectValue(tier, score, rep, rng.float())];
    let n = 0;
    while (n < 2 && rng.chance(p.extraSubjects)) { vals.push(subjectValue('common', score * 0.8, 0, rng.float())); n++; }
    income += photoPayout(vals);
  }
  return { km, fuel, film, extras, spend: fuel + film + extras, income };
}

it('economy balance over 60-minute sessions', () => {
  const out: Record<string, number> = {};
  const surplus: Record<string, number> = {};
  const rows: string[] = [];
  for (const p of PROFILES) {
    const rng = new Rng(1234);
    let inc = 0, sp = 0, fuel = 0, film = 0, km = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const s = session(p, rng);
      inc += s.income; sp += s.spend; fuel += s.fuel; film += s.film; km += s.km;
    }
    inc /= N; sp /= N; fuel /= N; film /= N; km /= N;
    out[p.name] = inc / sp;
    surplus[p.name] = inc - sp;
    rows.push(`${p.name.padEnd(8)} ${km.toFixed(0).padStart(3)} km  fuel ${fuel.toFixed(0).padStart(4)}  film ${film.toFixed(0).padStart(3)}  spend ${sp.toFixed(0).padStart(4)}  income ${inc.toFixed(0).padStart(4)}  ratio ${(inc / sp).toFixed(2)}  surplus/h ${(inc - sp).toFixed(0)}`);
  }
  const cheapest = Math.min(...COSMETICS.filter((c) => c.price > 0 && !c.india).map((c) => c.price));
  const priciest = Math.max(...COSMETICS.map((c) => c.price));
  console.log('\n' + rows.join('\n'));
  console.log(`cheapest cosmetic ${cheapest} (start money ${ECON.startMoney}); priciest ${priciest}: ~${(priciest / surplus.average).toFixed(0)} h for an average player, ~${(priciest / surplus.skilled).toFixed(1)} h for a skilled one`);
  expect(out.average).toBeGreaterThanOrEqual(1.3);
  expect(out.average).toBeLessThanOrEqual(1.6);
  expect(out.casual).toBeGreaterThan(1.0); // even a casual player never goes broke
  expect(out.skilled).toBeGreaterThan(out.average);
});
