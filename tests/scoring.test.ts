import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { scorePhoto, Candidate, ScoreCtx, sizeScore, placementScore } from '../src/camera/scoring';

function cam(fovDeg = 40) {
  const c = new THREE.PerspectiveCamera(fovDeg, 16 / 9, 0.1, 2000);
  c.position.set(0, 1.6, 0);
  c.lookAt(0, 1.6, -10);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}
function ctx(c: THREE.PerspectiveCamera, over: Partial<ScoreCtx> = {}): ScoreCtx {
  return { camera: c, focusDist: 20, speedKmh: 0, window: 'morning', weather: 'clear', flash: false, rainbowInFrame: false, repeats: () => 0, blocked: () => false, ...over };
}
const heron = (x: number, z: number): Candidate => ({ uid: 'heron:1', defId: 'heron', pos: new THREE.Vector3(x, 0, z), r: 0.5, h: 1.0 });
const deer = (x: number, z: number, uid = 'deer:1'): Candidate => ({ uid, defId: 'deer', pos: new THREE.Vector3(x, 0, z), r: 0.9, h: 1.4 });

describe('composition scoring', () => {
  it('size curve peaks between 10% and 40% of the frame', () => {
    expect(sizeScore(0.2)).toBe(1);
    expect(sizeScore(0.01)).toBeLessThan(0.6);
    expect(sizeScore(0.8)).toBeLessThan(1);
  });

  it('thirds beat arbitrary off-centre placement', () => {
    expect(placementScore(1 / 3, 1 / 3).s).toBeGreaterThan(placementScore(0.1, 0.9).s);
    expect(placementScore(0.5, 0.5).kind).toBe('centre');
  });

  it('a well-framed, focused subject scores higher than a tiny one', () => {
    const c = cam(30);
    const near = scorePhoto([deer(0, -12)], ctx(c, { focusDist: 12 }));
    const far = scorePhoto([deer(0, -160)], ctx(c, { focusDist: 160 }));
    expect(near.primary!.score).toBeGreaterThan(far.primary?.score ?? 0);
  });

  it('subjects behind the camera or outside the frame are not detected', () => {
    const c = cam();
    expect(scorePhoto([deer(0, 12)], ctx(c)).primary).toBeNull();
    expect(scorePhoto([deer(60, -10)], ctx(c)).primary).toBeNull();
  });

  it('occlusion lowers visibility and can hide a subject', () => {
    const c = cam(30);
    const open = scorePhoto([deer(0, -12)], ctx(c, { focusDist: 12 }));
    const hidden = scorePhoto([deer(0, -12)], ctx(c, { focusDist: 12, blocked: () => true }));
    expect(hidden.primary).toBeNull();
    expect(open.primary!.visibility).toBeGreaterThan(0.9);
  });

  it('golden hour pays more than midday, and notes say so', () => {
    const c = cam(30);
    const g = scorePhoto([heron(0, -8)], ctx(c, { focusDist: 8, window: 'golden' }));
    const m = scorePhoto([heron(0, -8)], ctx(c, { focusDist: 8, window: 'midday' }));
    expect(g.payout).toBeGreaterThan(m.payout);
    expect(g.notes.join(' ')).toContain('Golden hour +40%');
    expect(g.notes[0]).toBe('Grey heron, rare.');
  });

  it('missed focus and motion blur both cost points', () => {
    const c = cam(30);
    const sharp = scorePhoto([deer(0, -12)], ctx(c, { focusDist: 12 })).primary!.score;
    expect(scorePhoto([deer(0, -12)], ctx(c, { focusDist: 2 })).primary!.score).toBeLessThan(sharp);
    expect(scorePhoto([deer(0, -12)], ctx(c, { focusDist: 12, speedKmh: 90 })).primary!.score).toBeLessThan(sharp);
  });

  it('repeat photos of the same individual decay; extra subjects add a bonus', () => {
    const c = cam(30);
    const first = scorePhoto([deer(0, -12)], ctx(c, { focusDist: 12 })).payout;
    const again = scorePhoto([deer(0, -12)], ctx(c, { focusDist: 12, repeats: () => 2 })).payout;
    expect(again).toBeLessThan(first * 0.4);
    const pair = scorePhoto([deer(-1.5, -12), heron(2, -10)], ctx(c, { focusDist: 11 }));
    expect(pair.subjects.length).toBe(2);
    expect(pair.payout).toBeGreaterThan(Math.max(...pair.subjects.map((s) => s.value)));
  });

  it('no subject → saved, pays nothing', () => {
    const r = scorePhoto([], ctx(cam()));
    expect(r.payout).toBe(0);
    expect(r.stars).toBe(0);
  });
});
