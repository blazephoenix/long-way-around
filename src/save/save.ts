// Save slot: runtime state only. Generated content is rebuilt from the seed.
import { db } from './db';
import type { PlayerData } from '../economy/state';

export interface SaveData {
  version: 1;
  seed: string;
  savedAt: number;
  hour: number;
  day: number;
  mode: 'drive' | 'walk';
  car: { x: number; z: number; yaw: number; fuel: number; odometer: number };
  walker: { x: number; z: number; yaw: number };
  player: PlayerData;
  journal?: unknown;
  weather?: unknown;
  life?: unknown;
}

export async function writeSave(s: SaveData) {
  await db.put('save', s, 'slot1');
}
export async function readSave(): Promise<SaveData | null> {
  const s = await db.get<SaveData>('save', 'slot1');
  return s && s.version === 1 ? s : null;
}
