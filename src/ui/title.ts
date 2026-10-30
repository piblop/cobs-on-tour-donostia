import gsap from 'gsap';
import { button, controlsList, h, moveFocus, trapFocus } from './dom.ts';

export interface TitleScreen {
  el: HTMLElement;
  close(): Promise<void>;
  nav(dir: 1 | -1): void;
}

export interface TitleOptions {
  onNew: () => void;
  /** Present when a saved trip exists. */
  onContinue?: () => void;
  continueLabel?: string;
  reducedMotion: boolean;
  settings: (onDone: () => void) => HTMLElement;
  /** Shown when browser storage is unavailable. */
  storageNote?: string;
}

/** Title card over the live diorama. "Start Trip" is the user gesture that unlocks audio. */
export function showTitle(root: HTMLElement, o: TitleOptions): TitleScreen {
  const controls = h('div', { attrs: { hidden: '' } }, controlsList());
  let showingControls = false;
  const controlsBtn = button('How to play', () => {
    showingControls = !showingControls;
    controls.toggleAttribute('hidden', !showingControls);
    controlsBtn.textContent = showingControls ? 'Hide controls' : 'How to play';
    controlsBtn.setAttribute('aria-expanded', String(showingControls));
  });
  controlsBtn.setAttribute('aria-expanded', 'false');
  const primary = o.onContinue
    ? button(o.continueLabel ?? 'Continue trip', o.onContinue, 'btn primary')
    : button('Start Trip', o.onNew, 'btn primary');
  const fresh = o.onContinue ? button('New trip', o.onNew) : null;
  const settingsBtn = button('Settings', () => {
    const front = Array.from(card.children);
    const panel = o.settings(() => {
      card.replaceChildren(...front);
      settingsBtn.focus();
    });
    card.replaceChildren(h('h2', { class: 'title-name small', text: 'Settings' }), panel);
    (panel.querySelector('button') as HTMLElement | null)?.focus();
  });

  const card = h(
    'div',
    { class: 'title-card paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'title-name' } },
    h('p', { class: 'title-kicker', text: 'A travel memory you can play' }),
    h('h1', { class: 'title-name', id: 'title-name', text: 'Cobs on Tour' }),
    h('div', { class: 'title-place', text: 'Donostia' }),
    h('p', {
      class: 'title-blurb',
      text: 'Four friends, one shell-shaped bay, and far too many pintxos. Wander, discover, and collect the moments.',
    }),
    h('div', { class: 'title-actions' }, primary, fresh, controlsBtn, settingsBtn),
    controls,
    h('p', {
      class: 'title-foot',
      text: o.storageNote ?? 'Your trip saves in this browser on this device. Clearing site data removes it.',
    }),
  );
  const el = h('div', { class: 'title-screen' }, card);
  root.append(el);
  const release = trapFocus(card);
  primary.focus();

  if (!o.reducedMotion) {
    gsap.from(card, { y: 30, opacity: 0, rotate: -4, duration: 0.8, ease: 'back.out(1.6)' });
  }

  return {
    el,
    nav: (dir) => moveFocus(card, dir),
    close() {
      release();
      return new Promise((resolve) => {
        gsap.to(el, {
          opacity: 0,
          duration: o.reducedMotion ? 0.15 : 0.45,
          ease: 'power2.in',
          onComplete: () => {
            el.remove();
            resolve();
          },
        });
      });
    },
  };
}
