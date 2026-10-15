// Tiny typed event bus.
type Handler<T> = (payload: T) => void;

export class Events<M extends Record<string, unknown>> {
  private map = new Map<keyof M, Set<Handler<any>>>();
  on<K extends keyof M>(k: K, h: Handler<M[K]>) {
    let s = this.map.get(k);
    if (!s) this.map.set(k, (s = new Set()));
    s.add(h);
    return () => s!.delete(h);
  }
  emit<K extends keyof M>(k: K, p: M[K]) {
    this.map.get(k)?.forEach((h) => h(p));
  }
}

export type GameEvents = {
  bump: { strength: number };
  stopEnter: { id: string };
  photo: { id: number };
  subtitle: { who: string; text: string; ms?: number };
  toast: { text: string };
  money: { delta: number };
  autosave: Record<string, never>;
  horn: Record<string, never>;
  modeChange: { mode: 'drive' | 'walk' };
  viewfinder: { up: boolean };
  shutter: Record<string, never>;
  toll: Record<string, never>;
  lightning: { delay: number };
};
