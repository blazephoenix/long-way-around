// Viewfinder overlay, kiosk developing ritual, gallery (grid, full view, delete, download,
// zip export) and the photo journal.
import JSZip from 'jszip';
import { h, clear, kbd } from './dom';
import type { App } from './app';
import type { PhotoRecord } from '../camera/photo';
import { db } from '../save/db';
import { money } from '../core/settings';
import { SUBJECT_BY_ID, PAGE_NAMES, Page, SubjectDef } from '../../data/subjects';
import { MILESTONES } from '../journal/journal';
import { JOURNAL_UNLOCKS, COSMETIC_BY_ID } from '../../data/cosmetics';
import { saveFile } from './files';
import type { Site } from '../world/sites';

const urls = new Map<number, string>();
function thumbUrl(p: PhotoRecord, full = false): string {
  const key = (p.id ?? 0) * 2 + (full ? 1 : 0);
  let u = urls.get(key);
  if (!u) {
    u = URL.createObjectURL(full ? p.blob : p.thumb);
    urls.set(key, u);
  }
  return u;
}
function starStr(n: number) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}
function fmtTime(hh: number) {
  const H = Math.floor(hh), M = Math.floor((hh - H) * 60);
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

export class PhotoUI {
  private vf: HTMLElement;
  private vfInfo: HTMLElement;
  private vfFocus: HTMLElement;
  private shownFirstShot = false;

  constructor(private app: App) {
    this.vfInfo = h('div', { class: 'vf-info mono' });
    this.vfFocus = h('div', { class: 'vf-focus' });
    this.vf = h('div', { class: 'vf hidden', 'aria-hidden': 'true' },
      h('div', { class: 'vf-grid' }), this.vfFocus,
      h('i', { class: 'vf-c tl' }), h('i', { class: 'vf-c tr' }), h('i', { class: 'vf-c bl' }), h('i', { class: 'vf-c br' }),
      this.vfInfo);
    app.root.prepend(this.vf);
  }

  private get g() {
    return this.app.game!;
  }

  attach() {
    const g = this.g;
    g.events.on('viewfinder', ({ up }) => {
      this.vf.classList.toggle('hidden', !up);
      if (up) this.app.hideHint();
    });
    g.photo.onShot = (rec, score) => {
      if (!this.shownFirstShot) {
        this.shownFirstShot = true;
        this.app.toast('Shot saved. Develop film at any photo kiosk.');
      }
      void rec;
      void score;
    };
  }

  frame() {
    const g = this.g;
    if (!g.photo.raised) return;
    const focused = g.photo.focused;
    this.vfFocus.classList.toggle('ok', focused);
    const d = g.photo.focusTarget;
    this.vfInfo.textContent = `${g.photo.focal} mm · ${d > 500 ? '∞' : d.toFixed(1) + ' m'} · film ${g.player.shots}${g.mode === 'drive' && g.car.kmh > 30 ? ' · hold steady' : ''}`;
  }

  // ------------------------------------------------------------ kiosk
  async kiosk(site: Site) {
    const g = this.g;
    const all = ((await db.all<PhotoRecord>('photos')) ?? []).filter((p) => !p.developed && p.seed === g.world.seedStr).sort((a, b) => a.created - b.created);
    const m = (n: number) => money(n, this.app.settings);
    let i = -1;
    let total = 0;
    const journalNews: string[] = [];
    this.app.panels.open('Photo kiosk', all.length ? `${all.length} undeveloped shot${all.length > 1 ? 's' : ''}` : 'Nothing to develop', (el, rerender) => {
      if (!all.length) {
        el.append(h('p', {}, 'Take some photos, then come back. Every stop with a kiosk develops film.'));
        return;
      }
      if (i < 0) {
        el.append(h('p', {}, 'The machine hums. Each print comes out one at a time.'));
        el.append(h('button', { class: 'btn primary', id: 'btn-develop', onclick: async () => { i = 0; await developOne(all[0]); rerender(); } }, `Develop ${all.length} photo${all.length > 1 ? 's' : ''}`));
        return;
      }
      if (i >= all.length) {
        el.append(h('h3', {}, 'All developed'));
        el.append(h('p', { style: { fontSize: '22px', fontWeight: '700' } }, `${m(total)} earned`));
        for (const n of journalNews) el.append(h('p', {}, n));
        el.append(h('p', { class: 'muted' }, 'Your best shot of each subject is pinned in the journal (J).'));
        return;
      }
      const p = all[i];
      const img = h('img', { class: 'print', src: thumbUrl(p, true), alt: p.primary ? SUBJECT_BY_ID[p.primary]?.name ?? 'photo' : 'photo' });
      el.append(img);
      el.append(h('div', { class: 'row' },
        h('span', { class: 'stars', 'aria-label': `${p.stars} of 3 stars` }, starStr(p.stars)),
        h('span', { class: 'mono muted' }, `${p.focal} mm · day ${p.day} · ${fmtTime(p.hour)} · ${p.weather}`),
        h('span', { class: 'spacer' }),
        h('span', { style: { fontWeight: '700', fontSize: '20px' } }, p.payout > 0 ? `+${m(p.payout)}` : 'no subject')));
      el.append(h('p', {}, p.notes.join(' ')));
      if (p.subjects.length > 1) el.append(h('p', { class: 'muted' }, 'In frame: ' + p.subjects.map((s) => `${SUBJECT_BY_ID[s.defId]?.name} (${s.score})`).join(', ')));
      el.append(h('div', { class: 'row' }, h('span', { class: 'mono muted' }, `${i + 1} / ${all.length}`), h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', id: 'btn-next', onclick: async () => { i++; if (all[i]) await developOne(all[i]); rerender(); } }, i + 1 < all.length ? 'Next print' : 'Finish')));
    });
    // develop each photo as it is revealed (so leaving mid-way keeps progress)
    const developOne = async (p: PhotoRecord) => {
      if (p.developed) return;
      p.developed = true;
      g.photo.pending = Math.max(0, g.photo.pending - 1);
      await db.put('photos', p);
      g.player.earn(p.payout);
      if (p.payout > 0) g.events.emit('money', { delta: p.payout });
      total += p.payout;
      if (p.id !== undefined && p.subjects.length) {
        const r = g.journal.record(p.id, p.day, p.subjects, p.stars, g.player);
        for (const id of r.newOnes) journalNews.push(`New in the journal: ${SUBJECT_BY_ID[id]?.name}`);
        for (const u of r.unlocks) { journalNews.push(`Milestone: ${u}`); this.app.toast(u); }
        if (r.unlocks.length) g.refreshCosmetics();
      }
    };
    void site;
  }

  // ------------------------------------------------------------ gallery
  async gallery() {
    const g = this.g;
    let list = ((await db.all<PhotoRecord>('photos')) ?? []).sort((a, b) => b.created - a.created);
    let onlyThis = true;
    let view: PhotoRecord | null = null;
    const m = (n: number) => money(n, this.app.settings);
    this.app.panels.open('Gallery', 'Every shot you take is kept here.', (el, rerender) => {
      const shown = list.filter((p) => !onlyThis || p.seed === g.world.seedStr);
      if (view) {
        const p = view;
        el.append(h('img', { class: 'print', src: p.developed ? thumbUrl(p, true) : thumbUrl(p), alt: 'photo', style: p.developed ? {} : { filter: 'blur(14px) sepia(.6)' } }));
        el.append(h('p', { class: 'mono muted' }, `seed ${p.seed} · day ${p.day} · ${fmtTime(p.hour)} · ${p.biome} · ${p.weather} · ${p.focal} mm · at ${p.pos.map((v) => v.toFixed(0)).join(', ')}`));
        if (p.developed) {
          el.append(h('p', {}, `${starStr(p.stars)}  ${p.payout ? m(p.payout) : 'no subject'}`));
          el.append(h('p', {}, p.notes.join(' ')));
        } else el.append(h('p', {}, 'Undeveloped. Take it to a photo kiosk to see how it turned out.'));
        el.append(h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => { view = null; rerender(); } }, '← All photos'),
          h('span', { class: 'spacer' }),
          p.developed ? h('button', { class: 'btn small', onclick: async () => { const r = await saveFile(`long-way-round-${p.seed}-${p.id}.jpg`, p.blob); if (r === 'declined') this.app.toast('Download cancelled'); } }, 'Download') : null,
          h('button', { class: 'btn small', id: 'btn-del', onclick: async (e: Event) => {
            const b = e.currentTarget as HTMLButtonElement;
            if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to delete'; return; }
            if (p.id !== undefined) await db.del('photos', p.id);
            list = list.filter((x) => x !== p);
            view = null;
            rerender();
          } }, 'Delete')));
        return;
      }
      el.append(h('div', { class: 'row' },
        h('label', { class: 'row', style: { gap: '6px' } }, h('input', { type: 'checkbox', id: 'only-this', checked: onlyThis, onchange: (e: Event) => { onlyThis = (e.target as HTMLInputElement).checked; rerender(); } }), 'This road only'),
        h('span', { class: 'spacer' }),
        h('span', { class: 'mono muted' }, `${shown.length} photo${shown.length === 1 ? '' : 's'}`),
        h('button', { class: 'btn small', disabled: !shown.some((p) => p.developed), onclick: async (e: Event) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.textContent = 'Zipping…';
          const zip = new JSZip();
          for (const p of shown.filter((x) => x.developed)) {
            const name = `${p.seed}-day${p.day}-${String(p.id).padStart(4, '0')}${p.primary ? '-' + p.primary : ''}.jpg`;
            zip.file(name, p.blob);
          }
          zip.file('photos.json', JSON.stringify(shown.filter((x) => x.developed).map(({ blob, thumb, ...meta }) => meta), null, 2));
          const blob = await zip.generateAsync({ type: 'blob' });
          b.textContent = 'Export all (zip)';
          const r = await saveFile(`long-way-round-photos.zip`, blob);
          if (r === 'declined') this.app.toast('Export cancelled');
        } }, 'Export all (zip)')));
      if (!shown.length) {
        el.append(h('p', { class: 'muted' }, `No photos yet. Hold ${kbd(this.app.settings.bindings.camera[0])} to raise the camera.`));
        return;
      }
      const grid = h('div', { class: 'gal' });
      for (const p of shown) {
        grid.append(h('button', { class: 'gal-item', onclick: () => { view = p; rerender(); }, 'aria-label': p.developed ? `Photo ${p.id}, ${p.stars} stars` : `Undeveloped photo ${p.id}` },
          h('img', { src: thumbUrl(p), alt: '', style: p.developed ? {} : { filter: 'blur(10px) sepia(.6)' } }),
          h('span', { class: 'gal-tag' }, p.developed ? (p.primary ? `${starStr(p.stars)} ${SUBJECT_BY_ID[p.primary]?.name ?? ''}` : 'no subject') : 'undeveloped')));
      }
      el.append(grid);
    }, true);
  }

  // ------------------------------------------------------------ journal
  async journal() {
    const g = this.g;
    const J = g.journal;
    const photos = new Map<number, PhotoRecord>();
    for (const p of (await db.all<PhotoRecord>('photos')) ?? []) if (p.id !== undefined) photos.set(p.id, p);
    const pages = J.pages();
    let page: Page = pages.includes(g.world.dominantBiome(g.focusPos.z) as Page) ? (g.world.dominantBiome(g.focusPos.z) as Page) : 'forest';
    const [have, all] = J.totalProgress();
    this.app.panels.open('Journal', `${have} of ${all} subjects photographed`, (el, rerender) => {
      const tabs = h('div', { class: 'row tabs', role: 'tablist' });
      for (const p of pages) {
        tabs.append(h('button', { class: 'btn small' + (p === page ? ' primary' : ''), role: 'tab', 'aria-selected': p === page ? 'true' : 'false', onclick: () => { page = p; rerender(); } }, `${PAGE_NAMES[p]} ${Math.round(J.progress(p) * 100)}%`));
      }
      el.append(tabs);
      const prog = J.progress(page);
      const ms = MILESTONES.map((t, i) => {
        const item = JOURNAL_UNLOCKS[page]?.[i];
        const got = prog >= t - 1e-9;
        return h('span', { class: 'ms' + (got ? ' got' : '') }, `${Math.round(t * 100)}%: ${item ? COSMETIC_BY_ID[item]?.name : 'page complete'}`);
      });
      el.append(h('div', { class: 'row', style: { fontSize: '13px', gap: '8px' } }, ...ms));
      const grid = h('div', { class: 'jgrid' });
      for (const s of J.subjectsOn(page)) {
        const e = J.d.entries[s.id];
        const p = e ? photos.get(e.photoId) : undefined;
        grid.append(h('div', { class: 'jcard' + (e ? ' got' : '') },
          e && p ? h('img', { src: thumbUrl(p), alt: s.name }) : silhouette(s),
          h('div', { class: 'jname' }, e ? s.name : '???', h('span', { class: 'tier ' + s.tier }, s.tier)),
          h('div', { class: 'jhint' }, e ? `${starStr(e.stars)} · score ${e.score}` : J.hintFor(s))));
      }
      el.append(grid);
    }, true);
  }
}

function silhouette(s: SubjectDef): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 90;
  c.className = 'sil';
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9d2c4';
  g.fillRect(0, 0, 160, 90);
  g.fillStyle = '#1b2740';
  g.globalAlpha = 0.55;
  if (s.kind === 'wildlife') {
    const flier = ['gull', 'hawk', 'parrot', 'butterfly'].includes(s.model ?? '');
    if (flier) {
      g.beginPath(); g.moveTo(40, 50); g.quadraticCurveTo(60, 25, 80, 48); g.quadraticCurveTo(100, 25, 120, 50); g.quadraticCurveTo(80, 42, 40, 50); g.fill();
    } else if (s.size[1] < 0.6 && s.size[0] < 0.4) {
      g.beginPath(); g.ellipse(80, 55, 16, 11, 0, 0, 7); g.fill(); g.beginPath(); g.arc(96, 44, 7, 0, 7); g.fill();
    } else {
      g.fillRect(52, 40, 56, 20); g.beginPath(); g.ellipse(80, 45, 32, 13, 0, 0, 7); g.fill();
      for (const x of [56, 66, 92, 102]) g.fillRect(x, 52, 5, 24);
      g.beginPath(); g.moveTo(108, 42); g.lineTo(122, 24); g.lineTo(130, 28); g.lineTo(116, 46); g.fill();
    }
  } else if (s.kind === 'sky') {
    g.beginPath(); g.arc(80, 52, 18, Math.PI, 0); g.fill(); g.fillRect(20, 52, 120, 4);
  } else {
    g.beginPath(); g.moveTo(66, 80); g.lineTo(74, 20); g.lineTo(86, 20); g.lineTo(94, 80); g.fill(); g.fillRect(30, 78, 100, 4);
  }
  return c;
}
