// Settings panel: graphics, controls (rebindable keys), comfort/accessibility, world, audio.
import { h, clear, kbd } from './dom';
import type { App } from './app';
import { ACTION_LABELS, Action, DEFAULT_BINDINGS } from '../core/input';
import { Quality } from '../core/settings';

export function openSettings(app: App, onClose: () => void) {
  const s = app.settings;
  const layer = app.layer;
  clear(layer);
  const body = h('div', { style: { display: 'grid', gap: '12px' } });
  const save = () => app.saveSettings();

  const row = (label: string, control: HTMLElement, hint?: string) =>
    h('label', { class: 'set-row' }, h('span', {}, h('span', { class: 'set-label' }, label), hint ? h('span', { class: 'set-hint' }, hint) : null), control);
  const select = <T extends string | number>(id: string, value: T, options: [T, string][], on: (v: T) => void) => {
    const el = h('select', { id }, ...options.map(([v, l]) => h('option', { value: String(v), selected: v === value }, l))) as HTMLSelectElement;
    el.addEventListener('change', () => { const o = options.find(([v]) => String(v) === el.value); if (o) { on(o[0]); save(); } });
    return el;
  };
  const toggle = (id: string, value: boolean, on: (v: boolean) => void) => {
    const el = h('input', { id, type: 'checkbox', checked: value }) as HTMLInputElement;
    el.addEventListener('change', () => { on(el.checked); save(); });
    return el;
  };
  const slider = (id: string, value: number, min: number, max: number, step: number, on: (v: number) => void, fmt = (v: number) => String(v)) => {
    const out = h('span', { class: 'mono set-val' }, fmt(value));
    const el = h('input', { id, type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
    el.addEventListener('input', () => { const v = parseFloat(el.value); out.textContent = fmt(v); on(v); save(); });
    return h('span', { class: 'row', style: { gap: '8px', flexWrap: 'nowrap' } }, el, out);
  };

  const render = () => {
    clear(body);
    body.append(h('h3', {}, 'Graphics'));
    body.append(row('Quality', select<Quality>('set-quality', s.quality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], (v) => (s.quality = v)), 'Draw distance, shadows, vegetation, outline resolution'));
    body.append(row('Field of view', slider('set-fov', s.fov, 55, 95, 1, (v) => (s.fov = v), (v) => `${v}°`)));
    body.append(row('Rear-view mirror', toggle('set-mirror', s.mirror, (v) => (s.mirror = v)), 'Off is faster'));
    body.append(h('h3', {}, 'Comfort'));
    body.append(row('Head bob', toggle('set-bob', s.headBob, (v) => (s.headBob = v))));
    body.append(row('Camera shake', toggle('set-shake', s.shake, (v) => (s.shake = v))));
    body.append(row('Reduce motion', toggle('set-motion', s.reduceMotion, (v) => (s.reduceMotion = v)), 'Calms foliage sway, flashes, bob and shake'));
    body.append(row('Subtitles', h('span', { class: 'muted' }, 'Always on: every line of dialogue is shown as text')));
    body.append(h('h3', {}, 'World'));
    body.append(row('Length of a day', select<number>('set-day', s.dayLength, [[12, '12 minutes'], [24, '24 minutes'], [48, '48 minutes'], [96, '96 minutes']], (v) => (s.dayLength = v)), 'Real minutes per in-game day'));
    body.append(row('Units', select<'km' | 'mi'>('set-units', s.units, [['km', 'Kilometres'], ['mi', 'Miles']], (v) => (s.units = v))));
    body.append(row('Money', select<'rupee' | 'coins'>('set-cur', s.currency, [['rupee', '₹ rupees'], ['coins', 'Coins']], (v) => (s.currency = v))));
    body.append(h('h3', {}, 'Sound'));
    body.append(row('Master', slider('set-master', s.master, 0, 1, 0.05, (v) => (s.master = v), (v) => `${Math.round(v * 100)}%`)));
    body.append(row('Music (radio)', slider('set-music', s.music, 0, 1, 0.05, (v) => (s.music = v), (v) => `${Math.round(v * 100)}%`)));
    body.append(row('Ambience', slider('set-amb', s.ambience, 0, 1, 0.05, (v) => (s.ambience = v), (v) => `${Math.round(v * 100)}%`)));
    body.append(h('h3', {}, 'Controls'));
    body.append(row('Mouse sensitivity', slider('set-sens', s.sensitivity, 0.3, 2.5, 0.05, (v) => (s.sensitivity = v), (v) => v.toFixed(2))));
    body.append(row('Invert Y', toggle('set-invert', s.invertY, (v) => (s.invertY = v))));
    const keys = h('div', { class: 'keys-grid' });
    for (const a of Object.keys(ACTION_LABELS) as Action[]) {
      const btn = h('button', { class: 'btn small', 'aria-label': `Change key for ${ACTION_LABELS[a]}` }, s.bindings[a].map(kbd).join(' / ') || '—');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        btn.textContent = 'Press a key…';
        app.input.captureNext = (code) => {
          if (code !== 'Escape') s.bindings[a] = [code, ...s.bindings[a].filter((c) => c !== code).slice(0, 1)];
          save();
          render();
        };
      });
      keys.append(h('span', {}, ACTION_LABELS[a]), btn);
    }
    body.append(keys);
    body.append(h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Gamepad: left stick steers, triggers drive, LB raises the camera while driving (left trigger on foot), RT shoots, Y gets in and out, D-pad left/right tunes the radio, View opens the atlas, Start pauses.'));
    body.append(h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { s.bindings = structuredClone(DEFAULT_BINDINGS); save(); render(); } }, 'Reset keys')));
  };
  render();
  const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Settings' },
    h('div', { class: 'row' }, h('h2', {}, 'Settings'), h('span', { class: 'spacer' }), h('button', { class: 'btn', id: 'settings-close', onclick: onClose }, 'Done')),
    body);
  layer.append(h('div', { class: 'scrim' }, panel));
}
