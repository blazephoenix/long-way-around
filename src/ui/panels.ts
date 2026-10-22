// Stop panels (pump, shop, diner, motel, stand) and the car/cosmetics garage.
import { h, clear } from './dom';
import type { App } from './app';
import type { Site } from '../world/sites';
import { ECON } from '../../data/economy';
import { COSMETICS, COSMETIC_BY_ID, SLOT_NAMES, Slot, Cosmetic } from '../../data/cosmetics';
import { money } from '../core/settings';
import { siteName } from '../stops/stops';
import { Rng, hashString } from '../world/prng';
import { WINDOW_STARTS } from '../render/sky';
import { lines } from '../../data/dialogue';
import { FEATURES } from '../core/features';
export { FEATURES };


function fmtHour(hh: number) {
  const H = Math.floor(hh) % 24, M = Math.floor((hh - Math.floor(hh)) * 60);
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
}

export function nextWindowHour(hour: number): number {
  for (const w of WINDOW_STARTS) if (w > hour + 0.05) return w;
  return WINDOW_STARTS[0] + 24;
}

export class Panels {
  constructor(private app: App) {}

  private get g() {
    return this.app.game!;
  }
  private m(n: number) {
    return money(n, this.app.settings);
  }

  /** open a modal panel; game pauses while it is open */
  open(title: string, sub: string, body: (el: HTMLElement, rerender: () => void) => void, wide = false) {
    const app = this.app;
    app.state = 'menu';
    this.g.paused = true;
    app.input.exitLock();
    clear(app.layer);
    const content = h('div', { style: { display: 'grid', gap: '12px' } });
    const wallet = h('span', { class: 'mono' });
    const render = () => {
      clear(content);
      wallet.textContent = `${this.m(this.g.player.money)} · film ${this.g.player.shots}`;
      body(content, render);
    };
    const panel = h(
      'div',
      { class: 'panel' + (wide ? '' : ' narrow'), role: 'dialog', 'aria-label': title },
      h('div', { class: 'row' }, h('h2', {}, title), h('span', { class: 'spacer' }), wallet),
      sub ? h('p', { class: 'muted' }, sub) : null,
      content,
      h('div', { class: 'row' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', id: 'panel-close', onclick: () => this.close() }, 'Back to the road')),
    );
    app.layer.append(h('div', { class: 'scrim', onclick: (e: Event) => { if (e.target === e.currentTarget) this.close(); } }, panel));
    render();
    const esc = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyF') { e.preventDefault(); this.close(); }
    };
    window.addEventListener('keydown', esc);
    this.closeHook = () => window.removeEventListener('keydown', esc);
  }
  private closeHook: (() => void) | null = null;

  close() {
    this.closeHook?.();
    this.closeHook = null;
    this.app.input.clearPressed();
    clear(this.app.layer);
    this.app.state = 'play';
    this.g.paused = false;
    this.app.input.requestLock();
    this.g.saveSoon();
  }

  // ---------------------------------------------------------------- pump
  pump(site: Site) {
    const g = this.g;
    const near = Math.hypot(g.car.pos.x - site.x, g.car.pos.z - site.z) < site.clear + 4;
    this.open(siteName(site), 'Pump', (el, rerender) => {
      const need = 1 - g.car.fuel;
      const cost = Math.ceil(need * ECON.fullRefill);
      el.append(h('p', {}, `Tank ${(g.car.fuel * 100).toFixed(0)}% · a full tank runs about ${ECON.tankKm} km on asphalt.`));
      if (!near) {
        el.append(h('p', { class: 'muted' }, 'Bring the car closer to the pump first.'));
        return;
      }
      if (need < 0.01) {
        el.append(h('p', { class: 'muted' }, 'Already full.'));
        return;
      }
      const afford = Math.min(cost, Math.floor(g.player.money));
      const fill = (amount: number) => {
        if (!g.player.spend(amount)) return;
        g.car.fuel = Math.min(1, g.car.fuel + amount / ECON.fullRefill);
        g.events.emit('subtitle', { who: 'Attendant', text: lines('pumpDone', site, g) });
        rerender();
      };
      el.append(
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', id: 'btn-fill', disabled: g.player.money < cost, onclick: () => fill(cost) }, `Fill up · ${this.m(cost)}`),
          afford > 0 && afford < cost ? h('button', { class: 'btn', onclick: () => fill(afford) }, `Fill ${this.m(afford)} worth`) : null,
        ),
      );
      if (afford <= 0) el.append(h('p', { class: 'muted' }, 'No money left. Reserve mode will still get you to the next kiosk to develop film.'));
    });
    g.events.emit('subtitle', { who: 'Attendant', text: lines('pumpHello', site, g) });
  }

  // ---------------------------------------------------------------- shops
  private cosmeticRow(c: Cosmetic, buyable: boolean, rerender: () => void) {
    const p = this.g.player;
    const owned = p.owns(c.id);
    const equipped = p.d.equipped[c.slot] === c.id;
    const btn = owned
      ? h('button', { class: 'btn small', onclick: () => { p.equip(equipped ? null : c.id, c.slot); this.g.refreshCosmetics(); rerender(); } }, equipped ? 'Unequip' : 'Equip')
      : h('button', { class: 'btn small primary', disabled: !buyable || !p.canAfford(c.price), onclick: () => { if (p.spend(c.price)) { p.give(c.id); p.equip(c.id, c.slot); this.g.refreshCosmetics(); this.app.toast(`Bought ${c.name}`); rerender(); } } }, `Buy · ${this.m(c.price)}`);
    return h('div', { class: 'row', style: { borderTop: '1px solid var(--paper-2)', paddingTop: '6px' } },
      swatch(c), h('div', { style: { minWidth: '0', flex: '1' } }, h('div', { style: { fontWeight: '700' } }, c.name), h('div', { class: 'muted', style: { fontSize: '13px' } }, SLOT_NAMES[c.slot] + (c.note ? ' · ' + c.note : ''))), btn);
  }

  shop(site: Site) {
    const g = this.g;
    this.open(siteName(site), 'Shop · film and car bits', (el, rerender) => {
      const p = g.player;
      el.append(h('h3', {}, 'Film'));
      el.append(
        h('div', { class: 'row' },
          h('span', {}, `Roll of ${ECON.shotsPerRoll} · you carry ${p.shots} shots (max ${ECON.maxRolls * ECON.shotsPerRoll})`),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn small primary', id: 'btn-film', disabled: !p.canCarryRoll() || !p.canAfford(ECON.filmRoll), onclick: () => { if (p.spend(ECON.filmRoll)) { p.addRoll(); rerender(); } } }, `Buy · ${this.m(ECON.filmRoll)}`),
        ),
      );
      el.append(h('h3', {}, 'For the car'));
      const items = COSMETICS.filter((c) => !c.stand && !c.unlock && c.price > 0 && (FEATURES.india || !c.india));
      for (const c of items) el.append(this.cosmeticRow(c, true, rerender));
    }, true);
  }

  diner(site: Site) {
    const g = this.g;
    const dhaba = site.variant?.startsWith('dhaba');
    this.open(siteName(site), dhaba ? 'Highway dhaba' : 'Highway restaurant', (el) => {
      const next = nextWindowHour(g.hour);
      el.append(h('p', {}, `It's ${fmtHour(g.hour)}. ${dhaba ? 'Chai' : 'Chai or coffee'} and a sit-down until the light changes (${fmtHour(next % 24)}).`));
      el.append(h('div', { class: 'row' },
        h('button', { class: 'btn primary', id: 'btn-coffee', disabled: !g.player.canAfford(ECON.coffee), onclick: () => { if (g.player.spend(ECON.coffee)) { this.close(); g.skipTo(next); g.events.emit('subtitle', { who: dhaba ? 'Cook' : 'Cook', text: lines('dinerBye', site, g) }); } } }, `${dhaba ? 'Chai' : 'Chai and a samosa'} · ${this.m(ECON.coffee)}`),
        dhaba ? h('button', { class: 'btn', disabled: !g.player.canAfford(ECON.motel), onclick: () => { if (g.player.spend(ECON.motel)) { this.close(); g.skipTo(dawnAfter(g.hour)); } } }, `Full meal, then a nap on the charpai · ${this.m(ECON.motel)}`) : null,
      ));
      el.append(h('p', { class: 'muted' }, 'No timers anywhere. Skipping time only changes the light.'));
    });
    g.events.emit('subtitle', { who: dhaba ? 'Cook' : 'Cook', text: lines('dinerHello', site, g) });
  }

  motel(site: Site) {
    const g = this.g;
    this.open(siteName(site), 'Tourist complex', (el) => {
      el.append(h('p', {}, `A clean room and a quiet night. You wake at first light (${fmtHour(dawnAfter(g.hour) % 24)}).`));
      el.append(h('div', { class: 'row' },
        h('button', { class: 'btn primary', id: 'btn-motel', disabled: !g.player.canAfford(ECON.motel), onclick: () => { if (g.player.spend(ECON.motel)) { this.close(); g.skipTo(dawnAfter(g.hour)); } } }, `Stay the night · ${this.m(ECON.motel)}`),
      ));
    });
    g.events.emit('subtitle', { who: 'Clerk', text: lines('motelHello', site, g) });
  }

  stand(site: Site) {
    const g = this.g;
    const r = new Rng(hashString(site.id + 'stand'));
    const pool = COSMETICS.filter((c) => c.stand && (FEATURES.india || !c.india));
    const item = pool[r.int(0, pool.length - 1)];
    const film = r.chance(0.5);
    const tapri = site.variant?.startsWith('tapri');
    this.open(tapri ? 'Tapri chai stand' : 'Roadside stand', tapri ? 'Steel glasses, a kettle on the stove' : 'Hand-made things, one of a kind', (el, rerender) => {
      if (tapri) {
        el.append(h('div', { class: 'row' }, h('span', {}, 'Cutting chai: half a glass, half the price. Waits out the light.'), h('span', { class: 'spacer' }),
          h('button', { class: 'btn small primary', disabled: !g.player.canAfford(ECON.cuttingChai), onclick: () => { if (g.player.spend(ECON.cuttingChai)) { this.close(); g.skipTo(nextWindowHour(g.hour)); } } }, `Cutting · ${this.m(ECON.cuttingChai)}`)));
      }
      el.append(h('h3', {}, 'Only sold here'));
      el.append(this.cosmeticRow(item, true, rerender));
      if (film) {
        const p = g.player;
        el.append(h('div', { class: 'row' }, h('span', {}, `Film roll (${p.shots} shots carried)`), h('span', { class: 'spacer' }),
          h('button', { class: 'btn small', disabled: !p.canCarryRoll() || !p.canAfford(ECON.filmRoll), onclick: () => { if (p.spend(ECON.filmRoll)) { p.addRoll(); rerender(); } } }, `Buy · ${this.m(ECON.filmRoll)}`)));
      }
    });
    g.events.emit('subtitle', { who: tapri ? 'Chaiwala' : 'Owner', text: lines(tapri ? 'tapriHello' : 'standHello', site, g) });
  }

  // ---------------------------------------------------------------- garage (pause menu)
  garage() {
    const g = this.g;
    this.open('Your car', 'Everything you own. Purchases change the look, never the drive.', (el, rerender) => {
      const p = g.player;
      for (const slot of Object.keys(SLOT_NAMES) as Slot[]) {
        const own = p.d.owned.map((id) => COSMETIC_BY_ID[id]).filter((c) => c && c.slot === slot);
        if (!own.length) continue;
        el.append(h('h3', {}, SLOT_NAMES[slot]));
        for (const c of own) el.append(this.cosmeticRow(c, false, rerender));
      }
      const notOwned = COSMETICS.filter((c) => !p.owns(c.id) && (FEATURES.india || !c.india)).length;
      el.append(h('p', { class: 'muted' }, `${notOwned} more to find: shops sell most, roadside stands sell one-offs, and journal milestones unlock the rest.`));
    }, true);
  }
}

export function dawnAfter(hour: number) {
  return hour < 5.2 ? 5.2 : 24 + 5.2;
}

function swatch(c: Cosmetic) {
  const a = c.colors ? '#' + c.colors[0].toString(16).padStart(6, '0') : 'var(--mile)';
  const b = c.colors ? '#' + c.colors[1].toString(16).padStart(6, '0') : 'var(--paper-2)';
  return h('span', { 'aria-hidden': 'true', style: { width: '28px', height: '28px', borderRadius: '6px', border: '2px solid var(--ink)', background: `linear-gradient(135deg, ${a} 0 55%, ${b} 55% 100%)`, flex: '0 0 auto' } });
}
