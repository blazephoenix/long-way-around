// Road life controller: traffic, pedestrians, stop staff, hitchhikers; wires them into the game
// (obstacles, colliders, prompts, talk, subtitles, atlas tips, save state).
import * as THREE from 'three';
import type { Game } from '../game';
import { Traffic } from './traffic';
import { People, HitchState } from './people';
import { talkLine, HITCHERS } from '../../data/dialogue';
import { LANE } from '../world/world';
import { QUALITY } from '../core/settings';

export class RoadLife {
  readonly traffic: Traffic;
  readonly people: People;
  private chatTimer = 0;

  constructor(private g: Game) {
    this.traffic = new Traffic(g.world, g.scene);
    this.people = new People(g.world, g.scene);
    g.car.extraColliders = (x, z, fn) => {
      this.traffic.colliders(x, z, fn);
      this.people.colliders(x, z, fn);
      for (const a of g.animals.active.values()) {
        const p = a.obj.position;
        if (a.obj.visible && Math.abs(p.z - z) < 8 && a.def.size[0] > 0.4 && a.def.spawn?.place !== 'air') fn(p.x, p.z, a.def.size[0] * 0.8);
      }
    };
    const prevWalker = g.walker.extra;
    g.walker.extra = (x, z, fn) => { prevWalker?.(x, z, fn); this.traffic.colliders(x, z, fn); };
    this.traffic.onHorn = () => g.events.emit('horn', { npc: true } as never);
    g.extraPrompt = () => this.prompt();
    g.extraInteract = () => this.interact();
    g.animals.onCross = () => {};
    g.saveHooks.push({
      save: () => ({ life: { done: [...this.people.doneHitch], riding: this.people.riding ? { ...this.people.riding, hitcher: this.people.riding.hitcher.id } : null } }),
      load: (d) => {
        const l = (d as any).life;
        if (!l) return;
        this.people.doneHitch = new Set(l.done);
        if (l.riding) {
          const h = HITCHERS.find((x) => x.id === l.riding.hitcher);
          if (h) {
            this.people.riding = { ...l.riding, hitcher: h };
            this.people.seatPassenger(g.pcar.cockpit, this.people.lookOf(l.riding.id, h));
          }
        }
      },
    });
    g.extraSubjects.push(() => this.subjects());
  }

  dispose() {
    this.traffic.dispose();
    this.people.dispose();
  }

  update(dt: number) {
    const g = this.g;
    const focus = g.focusPos;
    // obstacles: the player (car or on foot), animals standing on the road
    const obs: typeof this.traffic.obstacles = [];
    obs.push({ x: g.car.pos.x, z: g.car.pos.z, r: 1.2, speed: g.car.vel.z, kind: 'player' });
    if (g.mode === 'walk') obs.push({ x: g.walker.pos.x, z: g.walker.pos.z, r: 0.6, speed: 0, kind: 'player' });
    for (const a of g.animals.active.values()) {
      const p = a.obj.position;
      if (Math.abs(g.world.lateral(p.x, p.z)) < 6) obs.push({ x: p.x, z: p.z, r: a.def.size[0] + 0.6, speed: 0, kind: 'animal' });
    }
    for (const e of this.extraObstacles) obs.push(...e());
    this.traffic.obstacles = obs;
    const q = QUALITY[g.settings.quality];
    this.traffic.update(dt, focus.z, q.density > 0.7 ? 1 : 0.7);
    this.people.update(dt, focus);
    this.updateHitch(dt);
  }
  readonly extraObstacles: (() => typeof this.traffic.obstacles)[] = [];

  // -------------------------------------------------------------- prompts + talk
  private prompt(): string {
    const g = this.g;
    const P = this.people;
    if (g.mode === 'walk' && !g.promptPoint) {
      const st = P.nearestStaff(g.walker.pos.x, g.walker.pos.z);
      if (st) return `Talk to the ${st.role === 'chaiwala' ? 'chaiwala' : st.role}`;
    }
    if (g.mode === 'drive' && P.waiting && !P.riding && Math.abs(g.car.speed) < 1.5) {
      if (Math.hypot(P.waiting.x - g.car.pos.x, P.waiting.z - g.car.pos.z) < 14) return `Offer ${P.waiting.hitcher.name} a ride`;
    }
    if (g.mode === 'drive' && P.riding?.done && Math.abs(g.car.speed) < 1.5) return `Let ${P.riding.hitcher.name} out`;
    return '';
  }

  private interact(): boolean {
    const g = this.g;
    const P = this.people;
    if (g.mode === 'walk' && !g.promptPoint) {
      const st = P.nearestStaff(g.walker.pos.x, g.walker.pos.z);
      if (st) {
        const who = st.role[0].toUpperCase() + st.role.slice(1);
        g.events.emit('subtitle', { who, text: talkLine(st.role, st.talkN++, st.site, { hour: g.hour, day: g.day, weather: g.weatherName, india: g.indiaOn }) });
        return true;
      }
    }
    if (g.mode === 'drive' && Math.abs(g.car.speed) < 1.5) {
      if (P.waiting && !P.riding && Math.hypot(P.waiting.x - g.car.pos.x, P.waiting.z - g.car.pos.z) < 14) {
        const w = P.waiting;
        const r = new THREE.Vector2(w.hitcher.ride[0], w.hitcher.ride[1]);
        const km = r.x + ((w.id.length * 37 + Math.floor(w.s)) % 100) / 100 * (r.y - r.x);
        P.riding = { id: w.id, hitcher: w.hitcher, startOdo: g.car.odometer, rideM: km * 1000, said: 0, done: false, tipGiven: false };
        g.scene.remove(w.obj);
        P.waiting = null;
        P.seatPassenger(g.pcar.cockpit, P.lookOf(w.id, w.hitcher));
        g.events.emit('subtitle', { who: w.hitcher.name, text: w.hitcher.lines[0] });
        g.events.emit('toast', { text: `${w.hitcher.name}, ${w.hitcher.who}` });
        this.chatTimer = 30;
        P.riding.said = 1;
        return true;
      }
      if (P.riding?.done) {
        this.dropOff();
        return true;
      }
    }
    return false;
  }

  private updateHitch(dt: number) {
    const g = this.g;
    const R = this.people.riding;
    if (!R) return;
    const travelled = g.car.odometer - R.startOdo;
    this.chatTimer -= dt;
    if (!R.done && this.chatTimer <= 0 && R.said < R.hitcher.lines.length && travelled > (R.rideM * R.said) / (R.hitcher.lines.length + 1)) {
      g.events.emit('subtitle', { who: R.hitcher.name, text: R.hitcher.lines[R.said], ms: 6000 });
      R.said++;
      this.chatTimer = 25;
    }
    if (!R.done && travelled >= R.rideM) {
      R.done = true;
      const tip = this.people.findTip(g.car.pos.z);
      let text = R.hitcher.bye;
      if (tip && !R.tipGiven) {
        R.tipGiven = true;
        g.player.mark({ id: tip.id, kind: 'tip', x: tip.x, z: tip.z, label: `${R.hitcher.name}'s tip` });
        text = R.hitcher.tip.replace('{place}', tip.label) + ' ' + text;
      }
      g.events.emit('subtitle', { who: R.hitcher.name, text, ms: 9000 });
      g.events.emit('toast', { text: 'Pull over to let them out' });
    }
  }

  private dropOff() {
    const g = this.g;
    const P = this.people;
    const R = P.riding!;
    P.doneHitch.add(R.id);
    P.seatPassenger(g.pcar.cockpit, null);
    P.riding = null;
    g.events.emit('subtitle', { who: R.hitcher.name, text: 'Thank you. Safe travels!' });
    g.saveSoon();
  }

  /** Painted trucks and autos are photo subjects (India layer). */
  private subjects() {
    const out = [];
    for (const v of this.traffic.vehicles) {
      if (v.kind !== 'painted' && v.kind !== 'auto') continue;
      out.push({ uid: `veh:${v.id}`, defId: v.kind === 'painted' ? 'truck' : 'auto', pos: v.obj.position.clone(), r: v.kind === 'painted' ? 1.3 : 0.8, h: v.kind === 'painted' ? 3.4 : 1.9 });
    }
    return out;
  }

  static lane = LANE;
}
