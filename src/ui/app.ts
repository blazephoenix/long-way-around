// App shell: title screen, pause menu, and the game lifecycle.
import * as THREE from 'three';
import { loadPeople } from '../render/peopleModels';
import { loadAnimals } from '../render/animalPack';
import { Game } from '../game';
import { Input } from '../core/input';
import { loadSettings, saveSettings, Settings } from '../core/settings';
import { randomSeedString } from '../world/prng';
import { h, clear, kbd } from './dom';
import type { BiomeId } from '../../data/biomes';
import { Panels } from './panels';
import { openAtlas } from './atlas';
import { readSave, SaveData } from '../save/save';
import type { Point } from '../stops/stops';
import { PhotoUI } from './photoUI';
import { Audio } from '../audio/audio';
import { openSettings } from './settings';

export class App {
  readonly canvas: HTMLCanvasElement;
  readonly root: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly input: Input;
  settings: Settings;
  game: Game | null = null;
  params = new URLSearchParams(location.search);
  layer: HTMLElement;
  hud: HTMLElement;
  private fpsEl: HTMLElement | null = null;
  private hintEl: HTMLElement;
  private subEl: HTMLElement;
  private toastEl: HTMLElement;
  state: 'title' | 'play' | 'pause' | 'menu' = 'title';
  panels: Panels;
  photoUI: PhotoUI;
  readonly audio = new Audio();
  private compass: HTMLElement;
  private promptShown = '';
  saved: SaveData | null = null;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.canvas = canvas;
    this.root = root;
    this.settings = loadSettings();
    const q = this.params.get('q');
    if (q === 'low' || q === 'medium' || q === 'high') this.settings.quality = q;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.input = new Input(canvas);
    this.hud = h('div', { class: 'hud' });
    this.hintEl = h('div', { class: 'hint hidden' });
    this.subEl = h('div', { class: 'hud-sub', 'aria-live': 'polite' });
    this.toastEl = h('div', { class: 'toast' });
    this.layer = h('div');
    this.compass = h('div', { class: 'compass hidden', 'aria-hidden': 'true' });
    this.hud.append(this.compass, this.subEl, this.hintEl, this.toastEl);
    this.panels = new Panels(this);
    this.photoUI = new PhotoUI(this);
    window.addEventListener('beforeunload', () => { if (this.state !== 'title') this.game?.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state !== 'title') this.game?.save(); });
    root.append(this.hud, this.layer);
    if (this.params.has('fps')) {
      this.fpsEl = h('div', { class: 'fps' });
      root.append(this.fpsEl);
    }
    const unlock = () => { this.audio.start(); this.audio.setVolumes(this.settings.master, this.settings.music, this.settings.ambience); if (this.game) this.audio.bind(this.game); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    canvas.addEventListener('click', () => {
      if (this.state === 'play' && !this.input.locked) this.input.requestLock();
    });
  }

  async refreshSave() {
    this.saved = await readSave();
    const b = document.getElementById('btn-continue') as HTMLButtonElement | null;
    if (b) {
      b.disabled = !this.saved;
      if (this.saved) b.title = `seed ${this.saved.seed} · day ${this.saved.day}`;
    }
  }

  async boot() {
    // makePerson and the pack animals need their models before any game exists
    await Promise.all([loadPeople(), loadAnimals()]);
    const seed = this.params.get('seed') ?? randomSeedString();
    const hour = this.params.has('hour') ? parseFloat(this.params.get('hour')!) : 8.5;
    const biome = (this.params.get('biome') as BiomeId | null) ?? null;
    this.newGame(seed, { hour, biome, attract: !this.params.has('play') });
    if (this.params.has('play')) this.play();
    else this.showTitle();
  }

  newGame(seed: string, o: { hour?: number; biome?: BiomeId | null; attract?: boolean; s?: number } = {}) {
    this.audio.unbind();
    this.game?.dispose();
    const g = new Game(this.renderer, this.input, this.settings, { seed, onlyBiome: o.biome ?? null, hour: o.hour ?? 8.5, autopilot: o.attract || this.params.has('auto') });
    this.game = g;
    g.spawnAt(o.s ?? (this.params.has('s') ? parseFloat(this.params.get('s')!) : 40));
    g.events.on('subtitle', (p) => this.subtitle(p.who, p.text, p.ms));
    g.events.on('toast', (p) => this.toast(p.text));
    g.lateTickers.push(() => this.frameUI());
    g.onInteract = (p) => this.interact(p);
    g.refreshCosmetics();
    this.photoUI.attach();
    this.audio.bind(g);
    g.lateTickers.push((dt) => this.audio.update(dt));
    this.onGame?.(g);
    g.start();
    (window as any).__game = g;
    return g;
  }

  onGame: ((g: Game) => void) | null = null;

  interact(p: Point) {
    switch (p.kind) {
      case 'pump': return this.panels.pump(p.site);
      case 'shop': return this.panels.shop(p.site);
      case 'diner': return this.panels.diner(p.site);
      case 'motel': return this.panels.motel(p.site);
      case 'stand': return this.panels.stand(p.site);
      case 'kiosk': return this.photoUI.kiosk(p.site);
    }
  }
  onKiosk: ((site: import('../world/sites').Site) => void) | null = null;

  openAtlas() {
    const g = this.game!;
    this.state = 'menu';
    g.paused = true;
    this.input.exitLock();
    clear(this.layer);
    this.atlasOpen = true;
    openAtlas(g, this.layer, () => this.closeMenu());
  }

  atlasOpen = false;
  closeMenu() {
    this.atlasOpen = false;
    clear(this.layer);
    this.state = 'play';
    this.game!.paused = false;
    this.input.requestLock();
  }

  private updateCompass() {
    const g = this.game!;
    const show = this.state === 'play' && g.mode === 'walk';
    this.compass.classList.toggle('hidden', !show);
    if (!show) return;
    const yaw = g.camera.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const bearing = Math.atan2(-fx, fz); // east positive, north = +z
    const deg = (b: number) => ((b * 180) / Math.PI + 360) % 360;
    const head = deg(bearing);
    const toCar = deg(Math.atan2(-(g.car.pos.x - g.walker.pos.x), g.car.pos.z - g.walker.pos.z));
    let html = '';
    const W = 360; // strip shows ±90°
    const place = (b: number) => { let d = b - head; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
    for (const [b, l] of [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']] as [number, string][]) {
      const d = place(b);
      if (Math.abs(d) < 90) html += `<span class="ct" style="left:${50 + (d / 180) * 100}%">${l}</span>`;
    }
    const dc = place(toCar);
    const dist = g.distToCar();
    const carLeft = Math.max(-90, Math.min(90, dc));
    html += `<span class="cc${Math.abs(dc) > 90 ? ' edge' : ''}" style="left:${50 + (carLeft / 180) * 100}%">🚗 ${dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1) + ' km'}</span>`;
    this.compass.innerHTML = html;
    void W;
  }

  private frameUI() {
    const g = this.game!;
    if (this.state === 'play') {
      const pr = g.prompt;
      if (pr !== this.promptShown) {
        this.promptShown = pr;
        if (pr) this.hint([h('kbd', {}, kbd(this.settings.bindings.interact[0])), ' ' + pr], 0);
        else this.hideHint();
      }
      if (g.input.pressed('radio') && g.mode === 'drive') this.audio.radio?.cycle();
      if (g.input.pressed('atlas')) this.openAtlas();
      else if (g.input.pressed('journal')) this.photoUI.journal();
      else if (g.input.pressed('gallery')) this.photoUI.gallery();
    } else if (this.state === 'menu' && this.atlasOpen && (g.input.pressed('pause') || g.input.pressed('atlas'))) {
      this.closeMenu();
      return;
    }
    this.photoUI.frame();
    this.updateCompass();
    if (this.fpsEl) this.fpsEl.textContent = `${g.fps.toFixed(0)} fps · ${this.renderer.info.render.calls} calls · ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
    if (this.state === 'play' && g.input.pressed('pause')) this.pause();
    else if (this.state === 'pause' && g.input.pressed('pause')) this.resume();
  }

  // ------------------------------------------------------------- title
  showTitle() {
    this.state = 'title';
    this.input.exitLock();
    clear(this.layer);
    const seedInput = h('input', { id: 'seed-input', type: 'text', placeholder: 'seed', maxlength: '24', 'aria-label': 'World seed', value: '' }) as HTMLInputElement;
    const seedRow = h('div', { class: 'seed-row hidden' }, seedInput, h('button', { class: 'btn small', onclick: () => { const v = seedInput.value.trim(); if (v) this.startRoad(v); } }, 'Drive'));
    const card = h(
      'div',
      { class: 'title-card' },
      h('div', { class: 'stone', 'aria-hidden': 'true' }, h('span', {}, h('b', {}, '∞'), 'km')),
      h('h1', {}, 'Long Way Round'),
      h('p', { class: 'tag' }, 'An endless road, a film camera, and nowhere to be.'),
      h(
        'div',
        { class: 'menu' },
        h('button', { class: 'btn primary', id: 'btn-continue', disabled: true, onclick: () => this.continueGame() }, 'Continue'),
        h('button', { class: 'btn', id: 'btn-new', onclick: () => this.startRoad(randomSeedString()) }, 'New Road'),
        h('button', { class: 'btn ghost', id: 'btn-seed', onclick: () => { seedRow.classList.toggle('hidden'); seedInput.focus(); } }, 'Enter Seed'),
        seedRow,
        h('button', { class: 'btn ghost', id: 'btn-settings', onclick: () => openSettings(this, () => this.showTitle()) }, 'Settings'),
      ),
      h('div', { class: 'keys' }, ...this.controlsLine()),
    );
    seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = seedInput.value.trim(); if (v) this.startRoad(v); } });
    this.layer.append(h('div', { class: 'title' }, card));
    this.onTitle?.(card);
    this.refreshSave();
  }
  onTitle: ((card: HTMLElement) => void) | null = null;

  controlsLine(): (Node | string)[] {
    const b = this.settings.bindings;
    const k = (a: keyof typeof b) => h('kbd', {}, kbd(b[a][0]));
    return [
      k('forward'), ' ', k('left'), ' ', k('back'), ' ', k('right'), ' drive · ', k('cruise'), ' cruise · ',
      k('camera'), ' camera · ', k('interact'), ' get out · ', k('radio'), ' radio · ', k('atlas'), ' atlas · ', k('pause'), ' pause',
    ];
  }

  startRoad(seed: string) {
    const g = this.newGame(seed, { hour: 8.5 });
    g.autopilot = false;
    this.play();
  }

  async continueGame() {
    const d = this.saved ?? (await readSave());
    if (!d) return;
    const g = this.newGame(d.seed, { hour: d.hour });
    g.restore(d);
    g.autopilot = false;
    this.play();
  }

  play() {
    if (this.game) this.game.autopilot = this.params.has('auto');
    this.state = 'play';
    clear(this.layer);
    this.game!.paused = false;
    this.input.enabled = true;
    this.promptShown = '';
    this.input.requestLock();
    this.hint(this.controlsLine(), 9000);
  }

  // ------------------------------------------------------------- pause
  pause() {
    const g = this.game!;
    this.state = 'pause';
    g.paused = true;
    this.input.exitLock();
    clear(this.layer);
    const seedBtn = h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(g.world.seedStr); seedBtn.textContent = 'Seed copied'; } catch { seedBtn.textContent = `Seed: ${g.world.seedStr}`; } } }, 'Copy Seed');
    const items: HTMLElement[] = [
      h('button', { class: 'btn primary', onclick: () => this.resume() }, 'Resume'),
      ...this.pauseExtras(),
      seedBtn,
      h('button', { class: 'btn ghost', style: { color: 'var(--ink)', borderColor: 'var(--ink)' }, onclick: () => this.quitToTitle() }, 'Quit to Title'),
    ];
    this.layer.append(
      h('div', { class: 'scrim' }, h('div', { class: 'panel narrow' }, h('h2', {}, 'Paused'), h('p', { class: 'muted mono' }, `seed ${g.world.seedStr} · day ${g.day}`), h('div', { class: 'menu' }, ...items))),
    );
  }
  pauseExtras: () => HTMLElement[] = () => [
    h('button', { class: 'btn', onclick: () => this.openAtlas() }, 'Atlas'),
    h('button', { class: 'btn', onclick: () => this.photoUI.journal() }, 'Journal'),
    h('button', { class: 'btn', onclick: () => this.photoUI.gallery() }, 'Gallery'),
    h('button', { class: 'btn', onclick: () => this.panels.garage() }, 'Your car'),
    h('button', { class: 'btn', onclick: () => openSettings(this, () => this.pause()) }, 'Settings'),
  ];

  resume() {
    this.state = 'play';
    clear(this.layer);
    this.game!.paused = false;
    this.input.requestLock();
  }

  quitToTitle() {
    this.onQuit?.();
    this.game?.save();
    const g = this.game!;
    g.paused = false;
    g.autopilot = true;
    this.showTitle();
  }
  onQuit: (() => void) | null = null;

  // ------------------------------------------------------------- HUD helpers
  private hintTimer = 0;
  hint(content: (Node | string)[] | string, ms = 3000) {
    clear(this.hintEl);
    if (typeof content === 'string') this.hintEl.textContent = content;
    else this.hintEl.append(...content);
    this.hintEl.classList.remove('hidden');
    clearTimeout(this.hintTimer);
    if (ms > 0) this.hintTimer = window.setTimeout(() => this.hintEl.classList.add('hidden'), ms);
  }
  hideHint() {
    this.hintEl.classList.add('hidden');
  }
  private subTimer = 0;
  subtitle(who: string, text: string, ms = 4200) {
    if (!this.settings.subtitles && who !== '') { /* subtitles toggle hides NPC lines only when audio voice exists; text-only game keeps them */ }
    clear(this.subEl);
    if (who) this.subEl.append(h('b', {}, who + ': '));
    this.subEl.append(text);
    clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => clear(this.subEl), ms);
  }
  toast(text: string) {
    const t = h('div', {}, text);
    this.toastEl.append(t);
    setTimeout(() => t.remove(), 3800);
  }

  saveSettings() {
    saveSettings(this.settings);
    this.audio.setVolumes(this.settings.master, this.settings.music, this.settings.ambience);
    this.game?.applySettings();
  }
}
