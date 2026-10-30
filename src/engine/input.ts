/**
 * Keyboard, mouse and gamepad merged into intents. Edge-triggered actions are
 * queued and consumed once, so a press is never handled twice or lost.
 */

export type Action =
  | 'interact'
  | 'pause'
  | 'back'
  | 'resetCamera'
  | 'switchFriend'
  | 'devOverlay'
  | 'confirm'
  | 'up'
  | 'down'
  | 'left'
  | 'right';

const KEY_ACTIONS: Record<string, Action> = {
  KeyE: 'interact',
  Space: 'interact',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Escape: 'pause',
  KeyX: 'resetCamera',
  Tab: 'switchFriend',
  F3: 'devOverlay',
};

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const DEADZONE = 0.18;

function deadzone(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

export class Input {
  private held = new Set<string>();
  private queue: Action[] = [];
  private wheel = 0;
  private dragYaw = 0;
  private dragging = false;
  private lastPointerX = 0;
  private padPrev = new Map<number, boolean>();
  /** Last device used, so prompts can show matching hints. */
  device: 'keyboard' | 'gamepad' = 'keyboard';

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.device = 'keyboard';
    const target = e.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (typing) return;
    // Inside a dialog, Tab moves focus as usual; it only switches friends during play.
    const inDialog = !!target?.closest?.('[role="dialog"]');
    if (e.code === 'Tab' && inDialog) return;
    if (e.code === 'Tab' || e.code === 'F3') e.preventDefault();
    if (MOVE_KEYS[e.code] || e.code === 'Space') {
      // Don't scroll the page; but let Space activate a focused button.
      if (!(e.code === 'Space' && target instanceof HTMLButtonElement)) e.preventDefault();
    }
    if (!e.repeat) {
      const action = KEY_ACTIONS[e.code];
      // Space and Enter on a focused button belong to the button, not the game.
      const onButton = target instanceof HTMLButtonElement;
      if (action && !(onButton && (e.code === 'Space' || e.code === 'Enter'))) this.queue.push(action);
    }
    this.held.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Normalise line/page deltas to pixels-ish.
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    this.wheel += e.deltaY * scale;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2 || e.button === 1) {
      this.dragging = true;
      this.lastPointerX = e.clientX;
      this.canvas.setPointerCapture?.(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragYaw += (e.clientX - this.lastPointerX) * 0.006;
    this.lastPointerX = e.clientX;
  };

  private onPointerUp = (): void => {
    this.dragging = false;
  };

  /** Drop held keys when focus leaves, so nobody keeps walking on their own. */
  clear = (): void => {
    this.held.clear();
    this.dragging = false;
  };

  private gamepad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Poll gamepad buttons once per frame and translate presses into actions. */
  pollGamepad(): void {
    const pad = this.gamepad();
    if (!pad) return;
    const map: Array<[number, Action]> = [
      [0, 'interact'],
      [1, 'back'],
      [9, 'pause'],
      [8, 'switchFriend'],
      [11, 'resetCamera'],
      [12, 'up'],
      [13, 'down'],
      [14, 'left'],
      [15, 'right'],
    ];
    for (const [index, action] of map) {
      const pressed = !!pad.buttons[index]?.pressed;
      const was = this.padPrev.get(index) ?? false;
      if (pressed && !was) {
        this.queue.push(action);
        this.device = 'gamepad';
      }
      this.padPrev.set(index, pressed);
    }
    if (Math.abs(pad.axes[0] ?? 0) > 0.5 || Math.abs(pad.axes[1] ?? 0) > 0.5) this.device = 'gamepad';
  }

  /** Movement relative to the screen: x right, z down (toward the camera). */
  move(): { x: number; z: number; brisk: boolean } {
    let x = 0;
    let z = 0;
    for (const code of this.held) {
      const m = MOVE_KEYS[code];
      if (m) {
        x += m[0];
        z += m[1];
      }
    }
    x = Math.max(-1, Math.min(1, x));
    z = Math.max(-1, Math.min(1, z));
    let brisk = this.held.has('ShiftLeft') || this.held.has('ShiftRight');
    const pad = this.gamepad();
    if (pad) {
      const px = deadzone(pad.axes[0] ?? 0);
      const pz = deadzone(pad.axes[1] ?? 0);
      if (px !== 0 || pz !== 0) {
        x = px;
        z = pz;
      }
      if (pad.buttons[7]?.value > 0.5 || pad.buttons[5]?.pressed) brisk = true;
    }
    return { x, z, brisk };
  }

  /** Camera rotation input in radians-per-second units (keys, stick) plus drag delta. */
  cameraRotate(): { rate: number; drag: number } {
    let rate = 0;
    if (this.held.has('KeyZ')) rate -= 1;
    if (this.held.has('KeyC')) rate += 1;
    const pad = this.gamepad();
    if (pad) rate += deadzone(pad.axes[2] ?? 0);
    const drag = this.dragYaw;
    this.dragYaw = 0;
    return { rate, drag };
  }

  /** Accumulated zoom since the last call (positive = zoom out). */
  zoom(): number {
    let z = this.wheel / 100;
    this.wheel = 0;
    if (this.held.has('Equal') || this.held.has('NumpadAdd')) z -= 0.12;
    if (this.held.has('Minus') || this.held.has('NumpadSubtract')) z += 0.12;
    const pad = this.gamepad();
    if (pad) z += deadzone(pad.axes[3] ?? 0) * 0.12;
    return z;
  }

  consume(): Action[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }
}
