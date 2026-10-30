import gsap from 'gsap';
import { h } from './dom.ts';

/**
 * Minimal heads-up layer: area banners, the interaction prompt that floats
 * over the nearest object, a polaroid counter and a one-time controls hint.
 */
export class Hud {
  readonly el: HTMLElement;
  private banner: HTMLElement;
  private bannerTitle: HTMLElement;
  private bannerSub: HTMLElement;
  private prompt: HTMLElement;
  private promptKey: HTMLElement;
  private promptLabel: HTMLElement;
  private chipCount: HTMLElement;
  private hint: HTMLElement;
  private promptVisible = false;
  private bannerTween: gsap.core.Timeline | null = null;
  private live: HTMLElement;
  reducedMotion = false;

  constructor(root: HTMLElement) {
    this.bannerTitle = h('h2');
    this.bannerSub = h('p', { class: 'hand' });
    this.banner = h('div', { class: 'area-banner paper', attrs: { 'aria-hidden': 'true' } }, this.bannerTitle, this.bannerSub);
    this.promptKey = h('span', { class: 'key', text: 'E' });
    this.promptLabel = h('span');
    this.prompt = h('div', { class: 'prompt', attrs: { 'aria-hidden': 'true' } }, this.promptKey, this.promptLabel);
    this.chipCount = h('span', { text: '0' });
    const chip = h(
      'div',
      { class: 'collection-chip paper', attrs: { 'aria-label': 'Polaroids collected' } },
      h('span', { class: 'mini-polaroid', attrs: { 'aria-hidden': 'true' } }, h('span')),
      this.chipCount,
    );
    this.hint = h('div', { class: 'hint paper' });
    this.live = h('div', { class: 'visually-hidden', attrs: { 'aria-live': 'polite' } });
    const pauseHint = h('div', { class: 'pause-hint', text: 'Esc · pause' });
    this.el = h('div', { class: 'hud' }, this.banner, this.prompt, chip, this.hint, pauseHint, this.live);
    root.append(this.el);
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? '' : 'none';
  }

  announce(text: string): void {
    this.live.textContent = text;
  }

  showArea(name: string, subtitle: string): void {
    this.bannerTitle.textContent = name;
    this.bannerSub.textContent = subtitle;
    this.announce(`${name}: ${subtitle}`);
    this.bannerTween?.kill();
    const tl = gsap.timeline();
    if (this.reducedMotion) {
      tl.set(this.banner, { opacity: 1, y: 0 }).to(this.banner, { opacity: 0, duration: 0.3, delay: 2.6 });
    } else {
      tl.fromTo(this.banner, { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.55, ease: 'back.out(1.8)' }).to(this.banner, {
        opacity: 0,
        y: -10,
        duration: 0.5,
        delay: 2.4,
        ease: 'power2.in',
      });
    }
    this.bannerTween = tl;
  }

  /** Position the prompt at a screen point; null hides it. */
  setPrompt(label: string | null, screen: { x: number; y: number } | null, key: string): void {
    if (!label || !screen) {
      if (this.promptVisible) {
        this.promptVisible = false;
        gsap.to(this.prompt, { opacity: 0, duration: 0.15, overwrite: 'auto' });
      }
      return;
    }
    if (this.promptLabel.textContent !== label) this.promptLabel.textContent = label;
    if (this.promptKey.textContent !== key) this.promptKey.textContent = key;
    const w = this.prompt.offsetWidth;
    const x = Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, screen.x - w / 2)));
    const y = Math.round(Math.min(window.innerHeight - 50, Math.max(8, screen.y - 60)));
    this.prompt.style.transform = `translate(${x}px, ${y}px)`;
    if (!this.promptVisible) {
      this.promptVisible = true;
      this.announce(`${label}. Press ${key}.`);
      gsap.to(this.prompt, { opacity: 1, duration: 0.18, overwrite: 'auto' });
    }
  }

  setHighContrast(on: boolean): void {
    this.prompt.classList.toggle('high-contrast', on);
  }

  setCount(n: number, total: number): void {
    this.chipCount.textContent = `${n} / ${total}`;
  }

  /** First-time controls hint that fades by itself once the player starts moving. */
  showHint(device: 'keyboard' | 'gamepad'): void {
    this.hint.replaceChildren();
    if (device === 'gamepad') {
      this.hint.append('Left stick to stroll · ', h('kbd', { text: 'A' }), ' to interact · right stick to look around');
    } else {
      this.hint.append(
        h('kbd', { text: 'W' }),
        h('kbd', { text: 'A' }),
        h('kbd', { text: 'S' }),
        h('kbd', { text: 'D' }),
        ' to stroll · ',
        h('kbd', { text: 'E' }),
        ' to interact · scroll to zoom',
      );
    }
    gsap.fromTo(this.hint, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.6 });
  }

  hideHint(): void {
    gsap.to(this.hint, { opacity: 0, duration: 0.6, delay: 1.5, overwrite: 'auto' });
  }
}
