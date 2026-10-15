// Player settings with safe persistence (localStorage may be unavailable).
import { DEFAULT_BINDINGS, Action } from './input';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  headBob: boolean;
  shake: boolean;
  reduceMotion: boolean;
  dayLength: number; // real minutes per in-game day
  units: 'km' | 'mi';
  currency: 'rupee' | 'coins';
  master: number;
  music: number;
  ambience: number;
  mirror: boolean;
  subtitles: boolean;
  bindings: Record<Action, string[]>;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  sensitivity: 1,
  invertY: false,
  fov: 72,
  headBob: true,
  shake: true,
  reduceMotion: false,
  dayLength: 24,
  units: 'km',
  currency: 'rupee',
  master: 0.8,
  music: 0.7,
  ambience: 0.8,
  mirror: true,
  subtitles: true,
  bindings: structuredClone(DEFAULT_BINDINGS),
};

export const QUALITY = {
  low: { radius: 2, density: 0.5, shadow: 1024, pixelRatio: 0.85, lineFar: 260, fogMul: 0.75, ahead: 1200 },
  medium: { radius: 3, density: 0.8, shadow: 2048, pixelRatio: 1.25, lineFar: 380, fogMul: 1, ahead: 1500 },
  high: { radius: 3, density: 1.1, shadow: 2048, pixelRatio: 1.5, lineFar: 460, fogMul: 1.15, ahead: 1500 },
};

const KEY = 'longwayround.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_SETTINGS), ...s, bindings: { ...structuredClone(DEFAULT_BINDINGS), ...(s.bindings ?? {}) } };
    }
  } catch {
    /* storage unavailable */
  }
  return structuredClone(DEFAULT_SETTINGS);
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function money(n: number, s: Settings): string {
  const v = Math.round(n);
  return s.currency === 'rupee' ? `₹${v}` : `${v} coins`;
}
