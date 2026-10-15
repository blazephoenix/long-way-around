// Keyboard + mouse + gamepad input with rebindable keys.
export type Action =
  | 'left' | 'right' | 'forward' | 'back' | 'handbrake' | 'cruise' | 'camera' | 'shoot'
  | 'interact' | 'radio' | 'atlas' | 'journal' | 'gallery' | 'pause' | 'horn' | 'jog' | 'zoomIn' | 'zoomOut';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Throttle / walk forward',
  back: 'Brake, reverse / walk back',
  left: 'Steer / walk left',
  right: 'Steer / walk right',
  handbrake: 'Handbrake',
  cruise: 'Cruise control',
  camera: 'Raise camera (hold)',
  shoot: 'Shoot',
  interact: 'Exit / enter car, interact',
  radio: 'Radio station',
  atlas: 'Road atlas',
  journal: 'Journal',
  gallery: 'Gallery',
  pause: 'Pause',
  horn: 'Horn',
  jog: 'Jog (on foot)',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
};

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  cruise: ['KeyC'],
  camera: ['Mouse2', 'KeyQ'],
  shoot: ['Mouse0'],
  interact: ['KeyF'],
  radio: ['KeyR'],
  atlas: ['KeyM'],
  journal: ['KeyJ'],
  gallery: ['KeyG'],
  pause: ['Escape', 'KeyP'],
  horn: ['KeyH'],
  jog: ['ShiftLeft', 'ShiftRight'],
  zoomIn: ['Equal', 'WheelUp'],
  zoomOut: ['Minus', 'WheelDown'],
};

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export class Input {
  bindings: Record<Action, string[]> = structuredClone(DEFAULT_BINDINGS);
  private down = new Set<string>();
  private pressedCodes = new Set<string>();
  private padPrev: boolean[] = [];
  private padNow: boolean[] = [];
  private padAxes: number[] = [0, 0, 0, 0];
  private padTriggers = [0, 0];
  mouseDX = 0;
  mouseDY = 0;
  sensitivity = 1;
  invertY = false;
  locked = false;
  usingPad = false;
  /** UI hook: capture next key for rebinding */
  captureNext: ((code: string) => void) | null = null;
  enabled = true;
  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', (e) => {
      if (this.captureNext) {
        e.preventDefault();
        const f = this.captureNext;
        this.captureNext = null;
        f(e.code);
        return;
      }
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedCodes.add(e.code);
      this.down.add(e.code);
      this.usingPad = false;
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (this.captureNext) {
        const f = this.captureNext;
        this.captureNext = null;
        f(code);
        return;
      }
      if (!this.down.has(code)) this.pressedCodes.add(code);
      this.down.add(code);
    });
    window.addEventListener('mouseup', (e) => this.down.delete('Mouse' + e.button));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.pressedCodes.add(e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
    });
  }

  requestLock() {
    try {
      const p = this.el.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* pointer lock is optional */
    }
  }
  exitLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      /* ignore */
    }
  }

  /** call at start of each frame */
  poll() {
    this.padPrev = this.padNow;
    this.padNow = [];
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      this.padNow = p.buttons.map((b) => b.pressed);
      this.padAxes = [0, 1, 2, 3].map((i) => {
        const v = p.axes[i] ?? 0;
        return Math.abs(v) < 0.12 ? 0 : v;
      });
      this.padTriggers = [p.buttons[PAD.LT]?.value ?? 0, p.buttons[PAD.RT]?.value ?? 0];
      if (this.padNow.some((b) => b) || this.padAxes.some((a) => a !== 0)) this.usingPad = true;
      break;
    }
  }

  /** forget keys pressed this frame (used when a UI panel consumed the key) */
  clearPressed() {
    this.pressedCodes.clear();
  }

  /** call at end of each frame */
  endFrame() {
    this.pressedCodes.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  private padHeld(b: number) {
    return !!this.padNow[b];
  }
  private padPressed(b: number) {
    return !!this.padNow[b] && !this.padPrev[b];
  }

  held(a: Action, ctx: { driving: boolean; camera: boolean } = { driving: true, camera: false }): boolean {
    if (!this.enabled) return false;
    if (this.bindings[a].some((c) => this.down.has(c))) return true;
    switch (a) {
      case 'handbrake': return this.padHeld(PAD.B);
      case 'camera': return ctx.driving ? this.padHeld(PAD.LB) : this.padTriggers[0] > 0.4;
      case 'jog': return this.padHeld(PAD.LS);
    }
    return false;
  }

  pressed(a: Action, ctx: { driving: boolean; camera: boolean } = { driving: true, camera: false }): boolean {
    if (!this.enabled && a !== 'pause') return false;
    if (this.bindings[a].some((c) => this.pressedCodes.has(c))) return true;
    switch (a) {
      case 'cruise': return this.padPressed(PAD.UP);
      case 'interact': return this.padPressed(PAD.Y);
      case 'radio': return this.padPressed(PAD.LEFT) || this.padPressed(PAD.RIGHT);
      case 'atlas': return this.padPressed(PAD.VIEW);
      case 'journal': return this.padPressed(PAD.DOWN);
      case 'pause': return this.padPressed(PAD.START);
      case 'horn': return this.padPressed(PAD.RS);
      case 'shoot': return ctx.camera && this.padTriggers[1] > 0.5 && !(this.padPrevRT > 0.5);
      case 'zoomIn': return ctx.camera && (this.padPressed(PAD.RB) || (!ctx.driving ? false : this.padAxes[3] < -0.7 && this.zoomRepeat()));
      case 'zoomOut': return ctx.camera && ((!ctx.driving && this.padPressed(PAD.LB)) || (ctx.driving && this.padAxes[3] > 0.7 && this.zoomRepeat()));
    }
    return false;
  }
  private padPrevRT = 0;
  private lastZoom = 0;
  private zoomRepeat() {
    const now = performance.now();
    if (now - this.lastZoom > 160) {
      this.lastZoom = now;
      return true;
    }
    return false;
  }
  /** track trigger edge for shooting */
  lateUpdate() {
    this.padPrevRT = this.padTriggers[1];
  }

  /** -1..1 */
  steer(): number {
    if (!this.enabled) return 0;
    let v = 0;
    if (this.held('left')) v -= 1;
    if (this.held('right')) v += 1;
    if (v === 0) v = this.padAxes[0];
    return v;
  }
  throttle(cameraUp = false): number {
    if (!this.enabled) return 0;
    if (this.held('forward')) return 1;
    return cameraUp ? 0 : this.padTriggers[1];
  }
  brake(cameraUp = false): number {
    if (!this.enabled) return 0;
    if (this.held('back')) return 1;
    return cameraUp ? 0 : this.padTriggers[0];
  }
  /** walking: x right, y forward */
  move(): [number, number] {
    if (!this.enabled) return [0, 0];
    let x = 0, y = 0;
    if (this.held('left', { driving: false, camera: false })) x -= 1;
    if (this.held('right', { driving: false, camera: false })) x += 1;
    if (this.held('forward', { driving: false, camera: false })) y += 1;
    if (this.held('back', { driving: false, camera: false })) y -= 1;
    if (x === 0 && y === 0) { x = this.padAxes[0]; y = -this.padAxes[1]; }
    return [x, y];
  }
  /** look delta in radians for this frame */
  look(dt: number, cameraUp: boolean, driving: boolean): [number, number] {
    if (!this.enabled) return [0, 0];
    const k = 0.0022 * this.sensitivity;
    let dx = this.mouseDX * k, dy = this.mouseDY * k;
    const ry = cameraUp && driving ? 0 : this.padAxes[3];
    dx += this.padAxes[2] * dt * 2.4 * this.sensitivity;
    dy += ry * dt * 1.8 * this.sensitivity;
    if (this.invertY) dy = -dy;
    return [dx, dy];
  }
}
