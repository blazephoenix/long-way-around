// Road atlas: draws only the roads you've driven, plus stops, landmarks and tips you've found.
import { h } from './dom';
import type { Game } from '../game';
import { CHUNK } from '../world/world';

const ICON: Record<string, { c: string; g: string; label: string }> = {
  gas: { c: '#d9573a', g: 'F', label: 'Fuel, shop, photo kiosk' },
  diner: { c: '#e8a03a', g: 'D', label: 'Diner / dhaba' },
  motel: { c: '#6a5aa8', g: 'M', label: 'Motel' },
  overlook: { c: '#3a7a5a', g: 'V', label: 'Scenic overlook' },
  bench: { c: '#3a7a5a', g: 'V', label: 'Viewpoint' },
  stand: { c: '#a85a8a', g: 'S', label: 'Roadside stand' },
  toll: { c: '#5a6a7a', g: 'T', label: 'Toll plaza' },
  tip: { c: '#f2c230', g: '★', label: "Hitchhiker's tip" },
  landmark: { c: '#1b2740', g: '▲', label: 'Landmark' },
};

export function openAtlas(g: Game, host: HTMLElement, onClose: () => void) {
  const canvas = h('canvas', { width: '900', height: '560', style: { width: '100%', height: 'auto', borderRadius: '10px', border: '2px solid var(--ink)', background: '#e6ece0', touchAction: 'none', cursor: 'grab' }, 'aria-label': 'Road atlas map' }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const p = g.focusPos;
  let ox = p.x, oz = p.z;
  let scale = 0.12; // px per metre
  const d = g.player.d;
  const km = (d.driven.reduce((a, iv) => a + iv[1] - iv[0], 0) / 1000).toFixed(1);

  const toScreen = (x: number, z: number): [number, number] => [canvas.width / 2 - (x - ox) * scale, canvas.height / 2 - (z - oz) * scale];

  const draw = () => {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#e6ece0';
    ctx.fillRect(0, 0, W, H);
    // grid every km
    ctx.strokeStyle = 'rgba(27,39,64,0.08)';
    ctx.lineWidth = 1;
    const step = 1000 * scale;
    if (step > 12) {
      const gx0 = ((W / 2 + (ox % 1000) * scale) % step + step) % step;
      const gz0 = ((H / 2 + (oz % 1000) * scale) % step + step) % step;
      for (let x = gx0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = gz0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }
    // driven main road
    const sStep = Math.max(20, 3 / scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? '#f2c230' : '#1b2740';
      ctx.lineWidth = pass ? 2.5 : 6;
      for (const [a, b] of d.driven) {
        ctx.beginPath();
        let first = true;
        for (let s = a; s <= b + 0.01; s += sStep) {
          const r = g.world.road(Math.min(s, b));
          const [x, y] = toScreen(r.x, r.z);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // branches
      for (const [id, maxI] of Object.entries(d.branches)) {
        const c = parseInt(id.slice(1));
        const br = g.world.chunkFeatures(c).branch;
        if (!br) continue;
        ctx.strokeStyle = pass ? (br.surface === 'gravel' ? '#cbbf9a' : '#b08a5a') : '#1b2740';
        ctx.lineWidth = pass ? 1.6 : 4;
        ctx.beginPath();
        for (let i = 0; i <= Math.min(maxI + 1, br.pts.length / 2 - 1); i++) {
          const [x, y] = toScreen(br.pts[i * 2], br.pts[i * 2 + 1]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    // marks
    ctx.font = '700 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of d.marks) {
      const ic = ICON[m.kind] ?? ICON.landmark;
      const [x, y] = toScreen(m.x, m.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      ctx.fillStyle = ic.c;
      ctx.strokeStyle = '#1b2740';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = m.kind === 'tip' ? '#1b2740' : '#fff';
      ctx.fillText(ic.g, x, y + 0.5);
      if (m.label && scale > 0.06) {
        ctx.fillStyle = '#1b2740';
        ctx.font = '600 11px Mukta, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(m.label, x + 11, y);
        ctx.textAlign = 'center';
        ctx.font = '700 11px "IBM Plex Mono", monospace';
      }
    }
    // car + you
    const [cx, cy] = toScreen(g.car.pos.x, g.car.pos.z);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-(g.car.yaw) + Math.PI);
    ctx.fillStyle = '#2f6f8f';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    if (g.mode === 'walk') {
      const [wx, wy] = toScreen(g.walker.pos.x, g.walker.pos.z);
      ctx.fillStyle = '#d9573a';
      ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.fill();
    }
    // scale bar
    const bar = scale > 0.2 ? 200 : scale > 0.05 ? 1000 : 5000;
    ctx.fillStyle = '#1b2740';
    ctx.fillRect(16, H - 22, bar * scale, 4);
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(bar >= 1000 ? `${bar / 1000} km` : `${bar} m`, 16, H - 32);
    ctx.fillText('N ↑', W - 46, 22);
  };

  // pan + zoom
  let drag: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = canvas.width / canvas.clientWidth;
    ox += ((e.clientX - drag[0]) * k) / scale;
    oz += ((e.clientY - drag[1]) * k) / scale;
    drag = [e.clientX, e.clientY];
    draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); scale = Math.min(1.5, Math.max(0.004, scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); draw(); }, { passive: false });

  const legend = h('div', { class: 'row', style: { fontSize: '13px', gap: '14px' } },
    ...Object.entries(ICON).filter(([k]) => k !== 'bench').map(([, ic]) => h('span', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } },
      h('span', { style: { width: '14px', height: '14px', borderRadius: '50%', background: ic.c, border: '1.5px solid var(--ink)', display: 'inline-block' } }), ic.label)));
  const zoom = (k: number) => { scale = Math.min(1.5, Math.max(0.004, scale * k)); draw(); };
  const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Road atlas' },
    h('div', { class: 'row' }, h('h2', {}, 'Road Atlas'), h('span', { class: 'spacer' }), h('span', { class: 'mono muted' }, `${km} km of road driven · seed ${g.world.seedStr}`)),
    canvas,
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => zoom(1.4) }, 'Zoom in'),
      h('button', { class: 'btn small', onclick: () => zoom(1 / 1.4) }, 'Zoom out'),
      h('button', { class: 'btn small', onclick: () => { ox = g.focusPos.x; oz = g.focusPos.z; draw(); } }, 'Centre on me'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', id: 'atlas-close', onclick: onClose }, 'Close')),
    legend,
    h('p', { class: 'muted', style: { fontSize: '13px' } }, `Roads appear as you drive them. Chunks are ${CHUNK} m; the grid is 1 km.`),
  );
  host.append(h('div', { class: 'scrim', onclick: (e: Event) => { if (e.target === e.currentTarget) onClose(); } }, panel));
  draw();
}
