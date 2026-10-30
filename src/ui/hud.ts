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
  private clock: HTMLElement;
  private clockIcon: HTMLElement;
  private vibeFill: HTMLElement;
  private vibeLabel: HTMLElement;
  private crewRow: HTMLElement;
  private lastClock = '';
  private goals: HTMLElement;
  reducedMotion = false;
  /** Tapping the floating prompt on a touch screen. */
  onPromptTap: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.bannerTitle = h('h2');
    this.bannerSub = h('p', { class: 'hand' });
    this.banner = h('div', { class: 'area-banner paper', attrs: { 'aria-hidden': 'true' } }, this.bannerTitle, this.bannerSub);
    this.promptKey = h('span', { class: 'key', text: 'E' });
    this.promptLabel = h('span');
    this.prompt = h('div', { class: 'prompt', attrs: { 'aria-hidden': 'true' } }, this.promptKey, this.promptLabel);
    // On touch screens the prompt itself is a button (CSS turns on pointer events in touch mode).
    this.prompt.addEventListener('pointerdown', (e) => {
      if (!this.promptVisible) return;
      e.preventDefault();
      this.onPromptTap?.();
    });
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
    this.clockIcon = h('span', { class: 'clock-icon', attrs: { 'aria-hidden': 'true' } });
    this.clock = h('span', { class: 'clock-text' });
    this.vibeFill = h('span', { class: 'vibe-fill' });
    this.vibeLabel = h('span', { class: 'vibe-label' });
    const status = h(
      'div',
      { class: 'status paper' },
      h('div', { class: 'clock' }, this.clockIcon, this.clock),
      h(
        'div',
        { class: 'vibe', attrs: { title: 'Group vibe' } },
        h('span', { class: 'vibe-word', text: 'Vibe' }),
        h('span', { class: 'vibe-meter', attrs: { 'aria-hidden': 'true' } }, this.vibeFill),
        this.vibeLabel,
      ),
    );
    this.crewRow = h('div', { class: 'crew-row', attrs: { 'aria-label': 'The crew' } });
    this.goals = h('div', { class: 'goals paper', attrs: { 'aria-label': 'Today' } });
    status.append(this.goals);
    this.el = h('div', { class: 'hud' }, this.banner, this.prompt, chip, this.hint, pauseHint, status, this.crewRow, this.live);
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
    const y = Math.round(Math.min(window.innerHeight - 50, Math.max(8, screen.y + 26)));
    this.prompt.style.transform = `translate(${x}px, ${y}px)`;
    if (!this.promptVisible) {
      this.promptVisible = true;
      this.announce(key === '✋' ? `${label}. Tap to interact.` : `${label}. Press ${key}.`);
      gsap.to(this.prompt, { opacity: 1, duration: 0.18, overwrite: 'auto' });
    }
  }

  setHighContrast(on: boolean): void {
    this.prompt.classList.toggle('high-contrast', on);
  }

  setClock(day: number, time: string, night: boolean): void {
    const text = `Day ${day} · ${time}`;
    if (text === this.lastClock) return;
    this.lastClock = text;
    this.clock.textContent = text;
    this.clockIcon.textContent = night ? '☾' : '☀';
    this.clockIcon.classList.toggle('night', night);
  }

  setVibe(value: number, label: string): void {
    this.vibeFill.style.width = `${Math.round(value)}%`;
    if (this.vibeLabel.textContent !== label) {
      this.vibeLabel.textContent = label;
      if (!this.reducedMotion) gsap.fromTo(this.vibeLabel, { y: -4 }, { y: 0, duration: 0.3, ease: 'back.out(3)' });
    }
  }

  /** One chip per friend: initial, colour, who you are, and a gentle need hint in words. */
  setCrew(list: Array<{ id: string; name: string; colour: string; leader: boolean; need: string | null }>): void {
    const key = JSON.stringify(list);
    if (this.crewRow.dataset.key === key) return;
    this.crewRow.dataset.key = key;
    const glyph: Record<string, string> = { hungry: '🍴', tired: '💤', bored: '✨' };
    this.crewRow.replaceChildren(
      ...list.map((m) => {
        const label = `${m.name}${m.leader ? ' (you)' : ''}${m.need ? `, feeling ${m.need}` : ''}`;
        const chip = h(
          'div',
          { class: `crew-chip${m.leader ? ' leader' : ''}`, attrs: { 'aria-label': label, title: label } },
          h('span', { class: 'crew-initial', text: m.name[0] }),
          m.leader ? h('span', { class: 'crew-you', text: 'You' }) : null,
          m.need ? h('span', { class: 'crew-need', text: glyph[m.need] ?? '' }) : null,
        );
        chip.style.setProperty('--crew', m.colour);
        return chip;
      }),
      h('span', { class: 'crew-tab', text: 'Tab · switch' }),
    );
  }

  /** The day's goal or pinned wishes, ticked off in words (never colour alone). */
  setGoals(items: Array<{ text: string; done: boolean }>): void {
    const key = JSON.stringify(items);
    if (this.goals.dataset.key === key) return;
    const before = this.goals.dataset.key ? (JSON.parse(this.goals.dataset.key) as Array<{ done: boolean }>) : [];
    this.goals.dataset.key = key;
    this.goals.hidden = items.length === 0;
    this.goals.replaceChildren(
      h('span', { class: 'goals-title', text: 'Today' }),
      ...items.map((it, i) => {
        const li = h('div', { class: `goal${it.done ? ' done' : ''}` }, h('span', { class: 'goal-box', attrs: { 'aria-hidden': 'true' }, text: it.done ? '✓' : '' }), h('span', { text: it.text }));
        li.setAttribute('aria-label', `${it.text}${it.done ? ', done' : ''}`);
        if (it.done && before[i] && !before[i].done && !this.reducedMotion) gsap.fromTo(li, { scale: 1.08 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
        return li;
      }),
    );
  }

  setCount(n: number, total: number): void {
    this.chipCount.textContent = `${n} / ${total}`;
  }

  /** First-time controls hint that fades by itself once the player starts moving. */
  showHint(device: 'keyboard' | 'gamepad' | 'touch'): void {
    this.hint.replaceChildren();
    if (device === 'touch') {
      this.hint.append('Drag on the left to stroll · tap ', h('kbd', { text: '✋' }), ' or the bubble to interact · pinch to zoom');
    } else if (device === 'gamepad') {
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
