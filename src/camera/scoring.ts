// Composition scoring: visibility (raycasts), size in frame, placement, focus, light, stability.
// Pure given a camera, candidates and an occlusion test, so it can be unit-tested with fixtures.
import * as THREE from 'three';
import { SUBJECT_BY_ID } from '../../data/subjects';
import { ECON, type Rarity } from '../../data/economy';
import { subjectValue, photoPayout } from './payout';
import type { LightWindow } from '../render/sky';

export interface Candidate {
  uid: string;
  defId: string;
  pos: THREE.Vector3; // base (ground) position
  r: number;
  h: number;
  /** sky subjects: direction instead of position */
  dir?: THREE.Vector3;
  sky?: boolean;
}

export interface ScoreCtx {
  camera: THREE.PerspectiveCamera;
  focusDist: number;
  speedKmh: number;
  window: LightWindow;
  weather: string;
  flash: boolean; // lightning flash in this frame
  rainbowInFrame: boolean;
  repeats: (uid: string) => number;
  blocked: (a: THREE.Vector3, b: THREE.Vector3) => boolean;
}

export interface SubjectScore {
  defId: string;
  uid: string;
  tier: Rarity;
  score: number;
  value: number;
  visibility: number;
  size: number;
  area: number;
  placement: number;
  placeKind: 'thirds' | 'centre' | 'off';
  focus: number;
  light: number;
  stability: number;
  repeats: number;
}

export interface PhotoScore {
  subjects: SubjectScore[];
  primary: SubjectScore | null;
  payout: number;
  stars: number;
  notes: string[];
}

const LIGHT: Record<LightWindow, number> = { dawn: 1.2, golden: 1.4, morning: 1.0, midday: 0.95, afternoon: 1.0, blue: 1.25, night: 1.0 };
const V = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function project(p: THREE.Vector3, cam: THREE.PerspectiveCamera): THREE.Vector3 | null {
  V.copy(p).applyMatrix4(cam.matrixWorldInverse);
  if (V.z > -0.1) return null;
  V.applyMatrix4(cam.projectionMatrix);
  return V.clone();
}

export function sizeScore(area: number): number {
  if (area >= 0.1 && area <= 0.4) return 1;
  if (area < 0.1) return Math.max(0, Math.min(1, Math.log(area / 0.0015) / Math.log(0.1 / 0.0015)));
  return Math.max(0.5, 1 - ((area - 0.4) / 0.6) * 0.5);
}

export function placementScore(u: number, v: number): { s: number; kind: 'thirds' | 'centre' | 'off' } {
  let dt = Infinity;
  for (const tu of [1 / 3, 2 / 3]) for (const tv of [1 / 3, 2 / 3]) dt = Math.min(dt, Math.hypot(u - tu, (v - tv) * 0.5625));
  const dc = Math.hypot(u - 0.5, (v - 0.5) * 0.5625);
  const st = Math.max(0, 1 - dt / 0.16);
  const sc = Math.max(0, 1 - dc / 0.1) * 0.92;
  if (st >= sc && st > 0.35) return { s: st, kind: 'thirds' };
  if (sc > 0.35) return { s: sc, kind: 'centre' };
  return { s: Math.max(st, sc, 0.15), kind: 'off' };
}

export function scoreSubject(c: Candidate, ctx: ScoreCtx): SubjectScore | null {
  const def = SUBJECT_BY_ID[c.defId];
  if (!def) return null;
  const cam = ctx.camera;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  let visibility: number, area: number, cu: number, cv: number, dist: number;
  if (c.sky) {
    const far = cam.position.clone().addScaledVector(c.dir!, 1000);
    const p = project(far, cam);
    if (!p || Math.abs(p.x) > 1.02 || Math.abs(p.y) > 1.02) return null;
    visibility = ctx.blocked(cam.position, cam.position.clone().addScaledVector(c.dir!, 220)) ? 0.4 : 1;
    area = 0.2;
    cu = (p.x + 1) / 2;
    cv = (p.y + 1) / 2;
    dist = ctx.focusDist; // sky subjects are at infinity: focus doesn't matter
  } else {
    const centre = c.pos.clone().addScaledVector(UP, c.h * 0.5);
    const pc = project(centre, cam);
    if (!pc) return null;
    const samples = [
      centre,
      c.pos.clone().addScaledVector(UP, c.h * 0.92),
      c.pos.clone().addScaledVector(UP, c.h * 0.12),
      centre.clone().addScaledVector(right, c.r * 0.85),
      centre.clone().addScaledVector(right, -c.r * 0.85),
    ];
    let inFrame = 0, seen = 0;
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (const s of samples) {
      const p = project(s, cam);
      if (!p) continue;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
      inFrame++;
      if (!ctx.blocked(cam.position, s)) seen++;
    }
    if (inFrame === 0) return null;
    visibility = (seen / samples.length) * (inFrame / samples.length) ** 0.3;
    const w = Math.min(2, Math.max(0, Math.min(maxX, 1) - Math.max(minX, -1)));
    const h = Math.min(2, Math.max(0, Math.min(maxY, 1) - Math.max(minY, -1)));
    area = (w / 2) * (h / 2);
    cu = (Math.max(-1, Math.min(1, pc.x)) + 1) / 2;
    cv = (Math.max(-1, Math.min(1, pc.y)) + 1) / 2;
    dist = cam.position.distanceTo(centre);
  }
  if (visibility < 0.2 || area < 0.0012) return null;
  const size = sizeScore(area);
  const pl = placementScore(cu, cv);
  const focusErr = Math.abs(ctx.focusDist - dist) / Math.max(dist, 1);
  const focus = c.sky ? 1 : Math.max(0, 1 - focusErr / 0.4);
  const stability = ctx.speedKmh <= 30 ? 1 : 1 - Math.min(1, (ctx.speedKmh - 30) / 70) * 0.6;
  let light = LIGHT[ctx.window];
  if (ctx.weather === 'fog') light *= 1.1;
  if (ctx.flash && c.defId !== 'lightning') light *= 1.6;
  if (ctx.rainbowInFrame && !c.defId.startsWith('rainbow')) light *= 1.5;
  const quality = Math.pow(visibility, 0.7) * (0.4 * size + 0.3 * pl.s + 0.3 * focus) * stability;
  const score = Math.min(100, Math.round(quality * light * 100));
  const repeats = ctx.repeats(c.uid);
  const value = subjectValue(def.tier, score, repeats, (c.defId.length % 7) / 7);
  return { defId: c.defId, uid: c.uid, tier: def.tier, score, value, visibility, size, area, placement: pl.s, placeKind: pl.kind, focus, light, stability, repeats };
}

export function scorePhoto(cands: Candidate[], ctx: ScoreCtx): PhotoScore {
  const subs: SubjectScore[] = [];
  for (const c of cands) {
    const s = scoreSubject(c, ctx);
    if (s && s.score > 0) subs.push(s);
  }
  // one entry per subject type (groups of the same species count once, best wins)
  const best = new Map<string, SubjectScore>();
  for (const s of subs) {
    const b = best.get(s.defId);
    if (!b || s.value > b.value) best.set(s.defId, s);
  }
  const list = [...best.values()].sort((a, b) => b.value - a.value);
  const primary = list[0] ?? null;
  const payout = photoPayout(list.map((s) => s.value));
  const stars = primary ? (primary.score >= 75 ? 3 : primary.score >= 45 ? 2 : 1) : 0;
  return { subjects: list, primary, payout, stars, notes: primary ? notesFor(primary, list.length - 1, ctx) : ['No subject in frame. Saved to the gallery.'] };
}

const WINDOW_NAME: Record<LightWindow, string> = { dawn: 'First light', golden: 'Golden hour', morning: 'Morning light', midday: 'Midday light', afternoon: 'Afternoon light', blue: 'Blue hour', night: 'Night' };

export function notesFor(s: SubjectScore, extras: number, ctx: Pick<ScoreCtx, 'window' | 'flash' | 'rainbowInFrame' | 'weather'>): string[] {
  const def = SUBJECT_BY_ID[s.defId];
  const n: string[] = [`${def.name}, ${s.tier}.`];
  const lb = Math.round((LIGHT[ctx.window] - 1) * 100);
  if (lb > 0) n.push(`${WINDOW_NAME[ctx.window]} +${lb}%.`);
  if (lb < 0) n.push(`Flat ${WINDOW_NAME[ctx.window].toLowerCase()} ${lb}%.`);
  if (ctx.flash && s.defId !== 'lightning') n.push('Lightning flash +60%.');
  if (ctx.rainbowInFrame && !s.defId.startsWith('rainbow')) n.push('Rainbow in frame +50%.');
  if (ctx.weather === 'fog') n.push('Fog mood +10%.');
  if (s.size < 0.55) n.push(s.area < 0.1 ? 'Small in the frame: get closer or zoom in.' : 'Crowds the frame.');
  if (s.placeKind === 'thirds' && s.placement > 0.6) n.push('Nicely on a third.');
  else if (s.placeKind === 'centre' && s.placement > 0.6) n.push('Centred.');
  else n.push('Slightly off-centre.');
  if (s.focus < 0.7) n.push('Soft focus.');
  if (s.visibility < 0.7) n.push('Partly hidden.');
  if (s.stability < 0.95) n.push('Motion blur from the moving car.');
  if (s.repeats > 0) n.push(`Shot this one today already: ${Math.round((1 - Math.pow(ECON.repeatDecay, s.repeats)) * 100)}% less.`);
  if (extras > 0) n.push(`${extras} more subject${extras > 1 ? 's' : ''} in frame: bonus.`);
  return n;
}
