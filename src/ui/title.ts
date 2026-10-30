import gsap from 'gsap';
import { button, controlsList, h, moveFocus, trapFocus } from './dom.ts';

export interface TitleScreen {
  el: HTMLElement;
  close(): Promise<void>;
  nav(dir: 1 | -1): void;
}

/** Title card over the live diorama. "Start Trip" is the user gesture that will unlock audio. */
export function showTitle(root: HTMLElement, onStart: () => void, reducedMotion: boolean): TitleScreen {
  const controls = h('div', { attrs: { hidden: '' } }, controlsList());
  let showingControls = false;
  const controlsBtn = button('How to play', () => {
    showingControls = !showingControls;
    controls.toggleAttribute('hidden', !showingControls);
    controlsBtn.textContent = showingControls ? 'Hide controls' : 'How to play';
    controlsBtn.setAttribute('aria-expanded', String(showingControls));
  });
  controlsBtn.setAttribute('aria-expanded', 'false');
  const start = button('Start Trip', onStart, 'btn primary');

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
    h('div', { class: 'title-actions' }, start, controlsBtn),
    controls,
    h('p', { class: 'title-foot', text: 'Paulo, Annette, Huw and Romy are waiting on the promenade.' }),
  );
  const el = h('div', { class: 'title-screen' }, card);
  root.append(el);
  const release = trapFocus(card);
  start.focus();

  if (!reducedMotion) {
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
          duration: reducedMotion ? 0.15 : 0.45,
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
