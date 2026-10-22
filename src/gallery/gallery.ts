// Asset gallery (?gallery): every model in the game laid out on a lot, rendered with the game's
// sky, toon ramp and outline pass. Pick an asset from the list (or ←/→) to frame it; models being
// reworked show their old version beside the new one.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from '../render/sky';
import { PostFX } from '../render/post';
import { shared, toon } from '../render/toon';
import { nightGlow } from '../render/props';
import { updateWaterLight } from '../render/water';
import { loadPeople, type Rig } from '../render/peopleModels';
import { disposeTree } from '../render/models';
import { EYE } from '../vehicle/cockpit';
import { ASSETS, type Asset } from './assets';

interface Placed {
  asset: Asset;
  slot: THREE.Group; // positioned cell; holds the built object(s)
  seed: number;
  box: THREE.Box3; // world-space bounds of the cell contents
}

const GAP = 4; // metres between cells
const ROW_GAP = 14; // metres between groups

export async function startGallery(canvas: HTMLCanvasElement, ui: HTMLElement) {
  await loadPeople();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0xaaccdd, 160, 1100);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 3000);
  const sky = new Sky(scene);
  const post = new PostFX(16, 9);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), toon({ color: 0x8a9a6a }));
  ground.receiveShadow = true;
  scene.add(ground);
  const padMat = toon({ color: 0x9a9890 });

  let showOld: boolean = readJSON('gallery-old') ?? true;
  let hour: number = readJSON('gallery-hour') ?? 9.5;
  let turntable = false;
  let walk = true;

  // ------------------------------------------------------------ layout: one row per group
  const placed: Placed[] = [];
  const groups: string[] = [];
  for (const a of ASSETS) if (!groups.includes(a.group)) groups.push(a.group);
  let rowZ = 0;
  const hash = decodeURIComponent(location.hash.slice(1));
  const savedSeeds: Record<string, number> = readJSON('gallery-seeds') ?? {};
  for (const group of groups) {
    let x = 0, depth = 0;
    for (const asset of ASSETS.filter((a) => a.group === group)) {
      const slot = new THREE.Group();
      scene.add(slot);
      const p: Placed = { asset, slot, seed: savedSeeds[key(asset)] ?? 1, box: new THREE.Box3() };
      fill(p);
      const size = p.box.getSize(new THREE.Vector3());
      slot.position.set(x + size.x / 2, 0, rowZ);
      slot.updateMatrixWorld(true);
      p.box.setFromObject(slot);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(size.x + 1.5, 0.04, size.z + 1.5), padMat);
      pad.position.set(slot.position.x, -0.015, (p.box.min.z + p.box.max.z) / 2);
      pad.receiveShadow = true;
      scene.add(pad);
      x += size.x + GAP;
      depth = Math.max(depth, size.z);
      placed.push(p);
    }
    rowZ += depth + ROW_GAP;
  }

  /** (re)build an asset into its slot: new on the right, old on the left when it has one */
  function fill(p: Placed) {
    for (const c of [...p.slot.children]) {
      p.slot.remove(c);
      disposeTree(c);
    }
    const parts: THREE.Object3D[] = [];
    if (p.asset.legacy && showOld) parts.push(p.asset.legacy(p.seed));
    parts.push(p.asset.build(p.seed));
    const boxes = parts.map((o) => new THREE.Box3().setFromObject(o));
    const widths = boxes.map((b) => b.max.x - b.min.x);
    const total = widths.reduce((s, w) => s + w, 0) + (parts.length - 1) * 2.5;
    let cx = -total / 2;
    parts.forEach((o, i) => {
      o.position.x += cx - boxes[i].min.x;
      cx += widths[i] + 2.5;
      o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
      p.slot.add(o);
      if (parts.length > 1) {
        const tag = label(i === 0 ? 'old' : 'new', i === 0 ? '#b8442a' : '#2a7a4a', 0.5);
        tag.position.set(o.position.x + (boxes[i].min.x + boxes[i].max.x) / 2, boxes[i].max.y + 0.6, boxes[i].min.z - 0.4);
        p.slot.add(tag);
      }
    });
    const all = new THREE.Box3();
    boxes.forEach((b, i) => all.union(b.clone().translate(parts[i].position)));
    const name = label(p.asset.name, '#1b2740', Math.min(1.2, Math.max(0.45, (all.max.x - all.min.x) * 0.08)));
    name.position.set(0, all.max.y + (parts.length > 1 ? 1.5 : 0.8), all.min.z - 0.4);
    p.slot.add(name);
    p.slot.updateMatrixWorld(true);
    p.box.setFromObject(p.slot);
  }

  // ------------------------------------------------------------ UI
  let current = Math.max(0, placed.findIndex((p) => key(p.asset) === hash));
  const style = document.createElement('style');
  style.textContent = `
    .gal { position: fixed; font: 14px var(--body); color: var(--paper); }
    .gal-list { top: 0; left: 0; bottom: 0; width: 240px; overflow-y: auto; background: var(--glass); padding: 10px 8px 40px; box-sizing: border-box; backdrop-filter: blur(6px); }
    .gal-list h1 { font: 22px var(--display); margin: 2px 6px 8px; color: var(--mile); }
    .gal-list h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; margin: 14px 6px 4px; color: #9fb0c8; }
    .gal-list button { display: flex; justify-content: space-between; width: 100%; text-align: left; background: none; border: 0; color: inherit; padding: 4px 8px; border-radius: 6px; }
    .gal-list button:hover { background: rgba(255,255,255,.08); }
    .gal-list button.on { background: var(--mile); color: var(--ink); }
    .gal-list .tag { font-size: 11px; opacity: .8; }
    .gal-bar { top: 10px; right: 10px; display: flex; gap: 10px; align-items: center; background: var(--glass); padding: 8px 12px; border-radius: 10px; flex-wrap: wrap; max-width: calc(100vw - 280px); }
    .gal-bar label { display: flex; gap: 6px; align-items: center; }
    .gal-bar button { background: rgba(255,255,255,.12); border: 0; color: inherit; border-radius: 6px; padding: 3px 9px; }
    .gal-info { left: 252px; bottom: 10px; background: var(--glass); padding: 8px 12px; border-radius: 10px; font-family: var(--mono); font-size: 12px; }
  `;
  document.head.append(style);
  const list = el('div', 'gal gal-list');
  list.append(el('h1', '', 'Asset gallery'));
  const buttons: HTMLButtonElement[] = [];
  for (const group of groups) {
    list.append(el('h2', '', group));
    placed.forEach((p, i) => {
      if (p.asset.group !== group) return;
      const b = el('button', '') as HTMLButtonElement;
      b.append(el('span', '', p.asset.name));
      if (p.asset.legacy) b.append(el('span', 'tag', 'old → new'));
      b.onclick = () => select(i);
      buttons[i] = b;
      list.append(b);
    });
  }
  const bar = el('div', 'gal gal-bar');
  const hourIn = Object.assign(document.createElement('input'), { type: 'range', min: '0', max: '24', step: '0.25', value: String(hour) });
  const hourOut = el('span', '', fmtHour(hour));
  hourIn.oninput = () => { hour = parseFloat(hourIn.value); hourOut.textContent = fmtHour(hour); writeJSON('gallery-hour', hour); };
  const seedOut = el('span', '');
  const seedBtn = (d: number, t: string) => { const b = el('button', '', t) as HTMLButtonElement; b.onclick = () => reseed(d); return b; };
  bar.append(
    wrapLabel('Time', hourIn, hourOut),
    wrapLabel('Variant', seedBtn(-1, '−'), seedOut, seedBtn(1, '+')),
    checkbox('Old beside new', showOld, (v) => { showOld = v; writeJSON('gallery-old', v); for (const p of placed) if (p.asset.legacy) fill(p); select(current, false); }),
    checkbox('Turntable', turntable, (v) => (turntable = v)),
    checkbox('Walk', walk, (v) => (walk = v)),
  );
  const info = el('div', 'gal gal-info');
  ui.append(list, bar, info);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') select((current + 1) % placed.length);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') select((current - 1 + placed.length) % placed.length);
    else if (e.key === ']') reseed(1);
    else if (e.key === '[') reseed(-1);
    else if (e.key === 'n') { hour = hour > 6 && hour < 18.5 ? 21 : 9.5; hourIn.value = String(hour); hourOut.textContent = fmtHour(hour); }
    else return;
    e.preventDefault();
  });

  function reseed(d: number) {
    const p = placed[current];
    p.seed = Math.max(0, p.seed + d);
    savedSeeds[key(p.asset)] = p.seed;
    writeJSON('gallery-seeds', savedSeeds);
    fill(p);
    select(current, false);
  }

  // ------------------------------------------------------------ camera framing
  const tween = { t: 1, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3() };
  function select(i: number, move = true) {
    current = i;
    const p = placed[i];
    buttons.forEach((b, k) => b.classList.toggle('on', k === i));
    buttons[i].scrollIntoView({ block: 'nearest' });
    history.replaceState(null, '', `#${encodeURIComponent(key(p.asset))}`);
    seedOut.textContent = String(p.seed);
    let tris = 0, meshes = 0;
    p.slot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      meshes++;
      const g = m.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * ((m as THREE.InstancedMesh).count ?? 1);
    });
    info.textContent = `${p.asset.group} › ${p.asset.name}   ·   ${meshes} meshes   ·   ${Math.round(tris).toLocaleString()} tris   ·   ←/→ browse  [ ] variant  n day/night`;
    if (!move) return;
    tween.fromPos.copy(camera.position);
    tween.fromTgt.copy(controls.target);
    if (p.asset.view === 'cockpit') {
      const eye = EYE.clone().add(new THREE.Vector3(0, 0.55, 0)).applyMatrix4(p.slot.children.find((c) => !(c as THREE.Sprite).isSprite)!.matrixWorld);
      tween.toPos.copy(eye);
      tween.toTgt.copy(eye).add(new THREE.Vector3(0, -0.04, -0.3));
      controls.minDistance = 0.01;
    } else {
      const c = p.box.getCenter(new THREE.Vector3());
      const s = p.box.getSize(new THREE.Vector3());
      const r = Math.max(s.x, s.y * 1.4, s.z) * 0.5;
      const dist = r / Math.tan((camera.fov * Math.PI) / 360) + 1.5;
      tween.toTgt.copy(c);
      tween.toPos.copy(c).add(new THREE.Vector3(-0.55, 0.38, -0.75).normalize().multiplyScalar(dist));
      controls.minDistance = 0.5;
    }
    tween.t = 0;
  }

  // ------------------------------------------------------------ loop
  function resize() {
    const w = window.innerWidth, h = window.innerHeight, pr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    post.setSize(Math.floor(w * pr), Math.floor(h * pr));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  select(current);
  const cam = readJSON('gallery-cam');
  if (cam && hash) {
    camera.position.fromArray(cam.pos);
    controls.target.fromArray(cam.tgt);
    tween.t = 1;
  }
  window.addEventListener('beforeunload', () => writeJSON('gallery-cam', { pos: camera.position.toArray(), tgt: controls.target.toArray() }));

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    shared.time.value += dt;
    if (tween.t < 1) {
      tween.t = Math.min(1, tween.t + dt * 2.2);
      const k = tween.t * tween.t * (3 - 2 * tween.t);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
      controls.target.lerpVectors(tween.fromTgt, tween.toTgt, k);
    }
    controls.update();
    const p = placed[current];
    if (turntable && p.asset.view !== 'cockpit') for (const c of p.slot.children) if (!(c as THREE.Sprite).isSprite) c.rotation.y += dt * 0.5;
    if (p.asset.group === 'People') p.slot.traverse((c) => {
      const rig = c.userData.rig as Rig | undefined;
      if (rig) { rig.play(walk ? 'Walk' : 'Idle'); rig.update(dt); }
    });
    sky.update(hour, controls.target, fog.color, { overcast: 0, milkyWay: 0, dim: 1 });
    nightGlow.value = THREE.MathUtils.smoothstep(sky.night, 0.2, 0.8) * 0.9;
    updateWaterLight(sky.sun, sky.hemi.intensity, sky.horizon);
    const u = post.material.uniforms;
    (u.uInk.value as THREE.Color).copy(sky.ink);
    (u.uFog.value as THREE.Color).copy(fog.color);
    u.uTime.value = shared.time.value;
    post.render(renderer, scene, camera, null);
  });
  (window as any).__gallery = { placed, select, scene, camera, controls };
}

// ------------------------------------------------------------ helpers
function key(a: Asset) {
  return `${a.group}/${a.name}`;
}

function label(text: string, bg: string, height: number): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = '600 44px Mukta, system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  c.width = w;
  c.height = 64;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 64, 14);
  ctx.fill();
  ctx.fillStyle = '#f7f3e8';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 18, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false });
  mat.userData.own = true;
  const s = new THREE.Sprite(mat);
  s.scale.set((height * w) / 64, height, 1);
  return s;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function wrapLabel(name: string, ...kids: HTMLElement[]) {
  const l = el('label', '', name + ' ');
  l.append(...kids);
  return l;
}

function checkbox(name: string, on: boolean, cb: (v: boolean) => void) {
  const i = Object.assign(document.createElement('input'), { type: 'checkbox', checked: on });
  i.onchange = () => cb(i.checked);
  return wrapLabel(name, i);
}

function fmtHour(h: number) {
  return `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
}

function readJSON(k: string) {
  try {
    const v = sessionStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function writeJSON(k: string, v: unknown) {
  try {
    sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}
