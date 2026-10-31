import type { Action, Input } from '../engine/input.ts';
import { h } from './dom.ts';

/** How far the thumb can travel from where it landed, in CSS pixels. */
const STICK_RADIUS = 56;
/** A touch that ends this quickly without moving counts as a tap. */
const TAP_MS = 260;
const TAP_SLOP = 12;
const LOOK_SPEED = 0.008;
const PINCH_SPEED = 2.2;

interface Track {
  id: number;
  role: 'stick' | 'look';
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
}

/**
 * Basic touch play: a floating joystick on the left half of the screen, a drag
 * on the right half to look around, pinch to zoom, and big buttons for
 * interact, switching friends, the journal and pause. Everything is fed into
 * Input, so the game never needs to know a finger was involved.
 *
 * Shown only once the player touches the screen (or on a coarse-pointer
 * device), and only while exploring; body.touch-mode drives the CSS.
 */
export class TouchControls {
  private tracks = new Map<number, Track>();
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private pinchDist = 0;

  constructor(
    root: HTMLElement,
    private canvas: HTMLElement,
    private input: Input,
  ) {
    this.stickKnob = h('span', { class: 'stick-knob' });
    this.stickBase = h('div', { class: 'stick-base', attrs: { 'aria-hidden': 'true' } }, this.stickKnob);
    const pad = (cls: string, glyph: string, label: string, action: Action) => {
      const b = h('button', { class: `touch-btn ${cls}`, text: glyph, attrs: { type: 'button', 'aria-label': label } });
      // pointerdown, not click: no 300 ms wait, and holding a finger elsewhere never blocks it.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.input.device = 'touch';
        this.input.press(action);
        // A tiny tick under the thumb where the phone supports it (Android); iOS ignores it.
        navigator.vibrate?.(8);
      });
      return b;
    };
    const ui = h(
      'div',
      { class: 'touch-ui' },
      this.stickBase,
      pad('touch-act', '✋', 'Interact', 'interact'),
      pad('touch-switch', '⇄', 'Switch friend', 'switchFriend'),
      pad('touch-journal', '📖', 'Journal', 'journal'),
      pad('touch-pause', 'II', 'Pause', 'pause'),
    );
    root.append(ui);

    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    // Any touch switches the layout to touch; a mouse or keyboard switches it back.
    window.addEventListener('pointerdown', (e) => this.setMode(e.pointerType === 'touch' || e.pointerType === 'pen'), true);
    window.addEventListener('keydown', () => this.setMode(false), true);
    let coarse = false;
    try {
      coarse = matchMedia('(pointer: coarse)').matches;
    } catch {
      coarse = false;
    }
    this.setMode(coarse);
  }

  private setMode(touch: boolean): void {
    document.body.classList.toggle('touch-mode', touch);
    if (touch) this.input.device = 'touch';
    else if (this.input.device === 'touch') this.input.device = 'keyboard';
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    // Safari can refuse capture for a touch it already captured implicitly; the
    // window listeners track the finger either way, so a refusal is harmless.
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // Keep going: the stick must still appear.
    }
    const exploring = document.body.dataset.state === 'exploring';
    const hasStick = [...this.tracks.values()].some((t) => t.role === 'stick');
    const role = exploring && !hasStick && e.clientX < window.innerWidth * 0.5 ? 'stick' : 'look';
    this.tracks.set(e.pointerId, { id: e.pointerId, role, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now() });
    if (role === 'stick') {
      this.stickBase.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.stickKnob.style.transform = '';
      this.stickBase.classList.add('on');
    }
    this.pinchDist = this.lookPinch();
  };

  private onMove = (e: PointerEvent): void => {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x;
    t.x = e.clientX;
    t.y = e.clientY;
    if (t.role === 'stick') {
      let sx = t.x - t.x0;
      let sy = t.y - t.y0;
      const len = Math.hypot(sx, sy);
      if (len > STICK_RADIUS) {
        sx *= STICK_RADIUS / len;
        sy *= STICK_RADIUS / len;
      }
      this.stickKnob.style.transform = `translate(${sx}px, ${sy}px)`;
      // A small dead zone so a resting thumb never drifts the crew.
      const m = Math.hypot(sx, sy) / STICK_RADIUS;
      if (m < 0.15) this.input.setStick(0, 0);
      else this.input.setStick(sx / STICK_RADIUS, sy / STICK_RADIUS);
      return;
    }
    const d = this.lookPinch();
    if (d > 0) {
      // Two fingers: pinch to zoom. Spreading apart zooms in.
      if (this.pinchDist > 0) this.input.addZoom((this.pinchDist - d) * PINCH_SPEED);
      this.pinchDist = d;
    } else {
      this.input.addLook(dx * LOOK_SPEED);
    }
  };

  private onUp = (e: PointerEvent): void => {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    this.tracks.delete(e.pointerId);
    if (t.role === 'stick') {
      this.input.setStick(0, 0);
      this.stickBase.classList.remove('on');
      // The knob springs home as the base fades (see .stick-base CSS).
      this.stickKnob.style.transform = '';
    } else if (performance.now() - t.t0 < TAP_MS && Math.hypot(t.x - t.x0, t.y - t.y0) < TAP_SLOP && e.type === 'pointerup') {
      // Outside free play a tap moves things along: skip a glide, close a card, next line.
      if (document.body.dataset.state !== 'exploring') this.input.press('interact');
    }
    this.pinchDist = this.lookPinch();
  };

  /** Distance between the first two look fingers, or 0 with fewer than two. */
  private lookPinch(): number {
    const looks = [...this.tracks.values()].filter((t) => t.role === 'look');
    if (looks.length < 2) return 0;
    return Math.hypot(looks[0].x - looks[1].x, looks[0].y - looks[1].y);
  }
}
