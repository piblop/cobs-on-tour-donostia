import gsap from 'gsap';
import { button, h } from '../ui/dom.ts';

/**
 * Shared frame for every mini-game: the scrapbook panel, a sticky footer with
 * the stage's actions and an always-visible Skip, one persistent input loop
 * for keyboard and controller, and timers that die with the game.
 */
export interface ShellOptions {
  relaxed: boolean;
  oneButton: boolean;
  reducedMotion: boolean;
  sfx: (kind: 'click' | 'open' | 'close' | 'discover' | 'cheer' | 'switch') => void;
}

export type ShellKey = 'act' | 'left' | 'right' | 'up' | 'down';

export class MinigameShell {
  readonly panel: HTMLElement;
  readonly title: HTMLElement;
  readonly help: HTMLElement;
  readonly body: HTMLElement;
  readonly actions: HTMLElement;
  private layer: HTMLElement;
  private live: HTMLElement;
  private raf = 0;
  private timers: number[] = [];
  private tick: ((dt: number) => void) | null = null;
  private onKeyStage: ((k: ShellKey) => void) | null = null;
  /** CSS selector of elements whose Space/Enter belong to the stage (e.g. dish cards). */
  private stageOwns: string | null = null;
  private keyHeld = { act: false, left: false, right: false, up: false, down: false };
  private padHeld = { act: false, left: false, right: false, up: false, down: false };
  private padPrev = new Map<number, boolean>();
  finished = false;
  onFinish: (() => void) | null = null;

  constructor(
    root: HTMLElement,
    private opts: ShellOptions,
    private done: (skipped: boolean) => void,
    skipLabel = 'Skip: let the crew choose',
  ) {
    this.title = h('h2', { class: 'mg-title', id: 'mg-title' });
    this.help = h('p', { class: 'mg-help' });
    this.body = h('div', { class: 'mg-body' });
    this.actions = h('div', { class: 'mg-actions' });
    this.live = h('div', { class: 'visually-hidden', attrs: { 'aria-live': 'assertive' } });
    const skip = button(skipLabel, () => this.finish(true), 'btn quiet');
    this.panel = h(
      'div',
      { class: 'mg paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mg-title' } },
      this.title,
      this.help,
      this.body,
      h('div', { class: 'mg-foot' }, this.actions, skip),
      this.live,
    );
    this.layer = h('div', { class: 'mg-layer' }, this.panel);
    root.append(this.layer);
    gsap.fromTo(this.layer, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    if (!opts.reducedMotion) gsap.fromTo(this.panel, { y: 30, rotate: -2 }, { y: 0, rotate: -0.5, duration: 0.45, ease: 'back.out(1.5)' });
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    let last = performance.now();
    const frame = (now: number) => {
      if (this.finished) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.pollPad();
      this.tick?.(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Set the current stage's per-frame update and key handler. */
  stage(tick: ((dt: number) => void) | null, onKey: ((k: ShellKey) => void) | null, owns: string | null = null): void {
    this.tick = tick;
    this.onKeyStage = onKey;
    this.stageOwns = owns;
  }

  held(k: ShellKey): boolean {
    return this.keyHeld[k] || this.padHeld[k];
  }

  say(text: string): void {
    this.live.textContent = text;
  }

  /** A timeout that never fires after the game has ended. */
  later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      if (!this.finished) fn();
    }, ms);
    this.timers.push(id);
  }

  private static KEYS: Record<string, ShellKey | 'back'> = {
    Space: 'act',
    KeyE: 'act',
    Enter: 'act',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    Escape: 'back',
  };

  private onKey = (e: KeyboardEvent): void => {
    const k = MinigameShell.KEYS[e.code];
    if (!k) return;
    const target = e.target as HTMLElement | null;
    const activating = e.code === 'Space' || e.code === 'Enter';
    if (k !== 'back') this.keyHeld[k] = true;
    // A focused button keeps its own Space/Enter, unless the stage owns it (dish cards).
    if (activating && target instanceof HTMLButtonElement && !(this.stageOwns && target.matches(this.stageOwns))) {
      e.stopImmediatePropagation();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (k === 'back') {
      this.finish(true);
      return;
    }
    if (e.repeat) return;
    this.onKeyStage?.(k);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = MinigameShell.KEYS[e.code];
    if (k && k !== 'back') this.keyHeld[k] = false;
  };

  private pollPad(): void {
    const pad = (navigator.getGamepads?.() ?? []).find((p) => p && p.connected) ?? null;
    // Recomputed every frame, so releasing the stick or button always lets go.
    this.padHeld = { act: false, left: false, right: false, up: false, down: false };
    if (!pad) return;
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    this.padHeld.act = !!pad.buttons[0]?.pressed;
    this.padHeld.left = x < -0.4 || !!pad.buttons[14]?.pressed;
    this.padHeld.right = x > 0.4 || !!pad.buttons[15]?.pressed;
    this.padHeld.up = y < -0.4 || !!pad.buttons[12]?.pressed;
    this.padHeld.down = y > 0.4 || !!pad.buttons[13]?.pressed;
    const edges: Array<[number, ShellKey | 'back']> = [
      [0, 'act'],
      [1, 'back'],
      [12, 'up'],
      [13, 'down'],
      [14, 'left'],
      [15, 'right'],
    ];
    for (const [i, k] of edges) {
      const p = !!pad.buttons[i]?.pressed;
      if (p && !this.padPrev.get(i)) {
        if (k === 'back') this.finish(true);
        else if (k === 'act' && document.activeElement instanceof HTMLButtonElement && !(this.stageOwns && document.activeElement.matches(this.stageOwns))) {
          document.activeElement.click();
        } else this.onKeyStage?.(k);
      }
      this.padPrev.set(i, p);
    }
  }

  finish(skipped: boolean): void {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.onFinish?.();
    gsap.to(this.layer, {
      opacity: 0,
      duration: this.opts.reducedMotion ? 0.1 : 0.25,
      onComplete: () => {
        this.layer.remove();
        this.done(skipped);
      },
    });
  }
}
