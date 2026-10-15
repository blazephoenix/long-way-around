// Runtime player state: wallet, film, cosmetics, atlas log. Kept separate from generated content.
import { ECON } from '../../data/economy';
import { COSMETIC_BY_ID, Slot } from '../../data/cosmetics';

export interface AtlasMark {
  id: string;
  kind: string;
  x: number;
  z: number;
  label?: string;
}

export interface PlayerData {
  money: number;
  shots: number; // shots remaining in total (rolls * 24)
  owned: string[];
  equipped: Partial<Record<Slot, string>>;
  driven: [number, number][]; // main road station intervals
  branches: Record<string, number>; // branch id → furthest point index reached
  marks: AtlasMark[];
  stats: { km: number; photos: number; earned: number; spent: number; stops: number };
  freeRollGiven: number;
}

export function newPlayerData(): PlayerData {
  return {
    money: ECON.startMoney,
    shots: ECON.startRolls * ECON.shotsPerRoll,
    owned: ['paint-lake'],
    equipped: { paint: 'paint-lake' },
    driven: [],
    branches: {},
    marks: [],
    stats: { km: 0, photos: 0, earned: 0, spent: 0, stops: 0 },
    freeRollGiven: 0,
  };
}

export class Player {
  d: PlayerData;
  onChange: (() => void) | null = null;
  constructor(d?: PlayerData) {
    this.d = d ?? newPlayerData();
  }
  get money() {
    return this.d.money;
  }
  get shots() {
    return this.d.shots;
  }
  get rolls() {
    return Math.ceil(this.d.shots / ECON.shotsPerRoll);
  }
  canAfford(n: number) {
    return this.d.money >= n - 1e-6;
  }
  spend(n: number): boolean {
    if (!this.canAfford(n)) return false;
    this.d.money -= n;
    this.d.stats.spent += n;
    this.onChange?.();
    return true;
  }
  earn(n: number) {
    this.d.money += n;
    this.d.stats.earned += n;
    this.onChange?.();
  }
  canCarryRoll() {
    return this.d.shots + ECON.shotsPerRoll <= ECON.maxRolls * ECON.shotsPerRoll;
  }
  addRoll() {
    this.d.shots = Math.min(ECON.maxRolls * ECON.shotsPerRoll, this.d.shots + ECON.shotsPerRoll);
    this.onChange?.();
  }
  useShot(): boolean {
    if (this.d.shots <= 0) return false;
    this.d.shots--;
    this.d.stats.photos++;
    this.onChange?.();
    return true;
  }
  owns(id: string) {
    return this.d.owned.includes(id);
  }
  give(id: string) {
    if (!this.owns(id)) this.d.owned.push(id);
    this.onChange?.();
  }
  equip(id: string | null, slot: Slot) {
    if (id === null) delete this.d.equipped[slot];
    else if (this.owns(id) && COSMETIC_BY_ID[id]?.slot === slot) this.d.equipped[slot] = id;
    this.onChange?.();
  }

  /** record main-road progress (merging intervals) */
  logDrive(s: number) {
    const iv = this.d.driven;
    const tol = 40;
    for (const it of iv) {
      if (s >= it[0] - tol && s <= it[1] + tol) {
        it[0] = Math.min(it[0], s);
        it[1] = Math.max(it[1], s);
        this.mergeIntervals();
        return;
      }
    }
    iv.push([s, s]);
  }
  private mergeIntervals() {
    const iv = this.d.driven.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const it of iv) {
      const last = out[out.length - 1];
      if (last && it[0] <= last[1] + 40) last[1] = Math.max(last[1], it[1]);
      else out.push([it[0], it[1]]);
    }
    this.d.driven = out;
  }
  logBranch(id: string, idx: number) {
    this.d.branches[id] = Math.max(this.d.branches[id] ?? 0, idx);
  }
  mark(m: AtlasMark) {
    if (this.d.marks.some((x) => x.id === m.id)) return false;
    this.d.marks.push(m);
    return true;
  }
}
