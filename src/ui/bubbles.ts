import gsap from 'gsap';
import type { CrewId } from '../data/types.ts';
import { h } from './dom.ts';

export interface HistoryItem {
  name: string;
  text: string;
  day: number;
  time: string;
}

interface Live {
  el: HTMLElement;
  left: number;
}

const MAX_BUBBLES = 3;
const MAX_HISTORY = 250;

/**
 * Speech bubbles above the friends' heads, an optional caption bar for
 * readability, and a running history the player can scroll back through.
 */
export class Bubbles {
  private layer: HTMLElement;
  private caption: HTMLElement;
  private live = new Map<CrewId, Live>();
  readonly history: HistoryItem[] = [];
  captionBar = false;
  reducedMotion = false;

  constructor(root: HTMLElement) {
    this.layer = h('div', { class: 'bubble-layer', attrs: { 'aria-hidden': 'true' } });
    this.caption = h('div', { class: 'caption-bar', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'Crew conversation' } });
    root.append(this.layer, this.caption);
  }

  say(speaker: CrewId, name: string, colour: string, text: string, duration: number, stamp: { day: number; time: string }): void {
    this.history.push({ name, text, ...stamp });
    if (this.history.length > MAX_HISTORY) this.history.shift();

    // One bubble per friend; a new line replaces their previous one.
    this.live.get(speaker)?.el.remove();
    if (this.live.size >= MAX_BUBBLES) {
      const oldest = [...this.live.entries()].sort((a, b) => a[1].left - b[1].left)[0];
      oldest?.[1].el.remove();
      if (oldest) this.live.delete(oldest[0]);
    }
    const el = h('div', { class: 'bubble' }, h('span', { class: 'bubble-name', text: name }), h('span', { class: 'bubble-text', text }));
    el.style.setProperty('--speaker', colour);
    this.layer.append(el);
    this.live.set(speaker, { el, left: duration });
    if (!this.reducedMotion) gsap.fromTo(el, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: 'back.out(2)' });

    this.caption.replaceChildren(h('strong', { text: `${name}: ` }), text);
    this.caption.classList.toggle('show', this.captionBar);
  }

  /** Reposition bubbles; `anchor` returns a screen point above the friend, or null when off screen. */
  update(dt: number, anchor: (id: CrewId) => { x: number; y: number } | null): void {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const items: Array<{ b: Live; px: number; py: number; w: number; h: number }> = [];
    for (const [id, b] of this.live) {
      b.left -= dt;
      if (b.left <= 0) {
        b.el.remove();
        this.live.delete(id);
        if (this.live.size === 0) this.caption.classList.remove('show');
        continue;
      }
      const p = anchor(id);
      if (!p) {
        b.el.style.opacity = '0';
        continue;
      }
      b.el.style.opacity = '';
      items.push({ b, px: p.x, py: p.y, w: b.el.offsetWidth, h: b.el.offsetHeight });
    }
    // Lowest bubbles keep their spot; any that would overlap are lifted above.
    items.sort((a, c) => c.py - a.py);
    for (const it of items) {
      const x = Math.round(Math.min(window.innerWidth - it.w - 8, Math.max(8, it.px - it.w / 2)));
      let y = Math.round(Math.min(window.innerHeight - it.h - 8, Math.max(8, it.py - it.h)));
      for (let guard = 0; guard < 4; guard++) {
        const hit = placed.find((r) => x < r.x + r.w + 6 && x + it.w + 6 > r.x && y < r.y + r.h + 6 && y + it.h + 6 > r.y);
        if (!hit) break;
        y = Math.max(8, hit.y - it.h - 8);
      }
      placed.push({ x, y, w: it.w, h: it.h });
      it.b.el.style.transform = `translate(${x}px, ${y}px)`;
      // Point the tail at the speaker, even when the bubble had to move.
      const tail = Math.min(it.w - 16, Math.max(16, it.px - x));
      it.b.el.style.setProperty('--tail-x', `${tail}px`);
    }
  }

  clear(): void {
    for (const b of this.live.values()) b.el.remove();
    this.live.clear();
    this.caption.classList.remove('show');
  }
}
