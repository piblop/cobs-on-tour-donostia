import gsap from 'gsap';
import { button, controlsList, h, moveFocus, trapFocus } from './dom.ts';

export interface PauseMenu {
  close(): Promise<void>;
  nav(dir: 1 | -1): void;
  back(): boolean;
}

export interface PauseHandlers {
  resume(): void;
  returnToPromenade(): void;
  toTitle(): void;
}

/** Pause menu. "Return to the promenade" is always available as a safe recovery. */
export function showPause(root: HTMLElement, handlers: PauseHandlers, reducedMotion: boolean): PauseMenu {
  const main = h('div', { class: 'stack' });
  const controlsPanel = h('div', { attrs: { hidden: '' } });
  const menu = h(
    'div',
    { class: 'menu paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' } },
    h('h2', { id: 'pause-title', text: 'Taking a breather' }),
    main,
    controlsPanel,
  );

  const showMain = () => {
    controlsPanel.setAttribute('hidden', '');
    main.removeAttribute('hidden');
    resume.focus();
  };
  const resume = button('Resume', handlers.resume, 'btn primary');
  main.append(
    resume,
    button('Return to the promenade', handlers.returnToPromenade),
    button('Controls', () => {
      main.setAttribute('hidden', '');
      controlsPanel.removeAttribute('hidden');
      backBtn.focus();
    }),
    button('Back to title', handlers.toTitle),
    h('p', { class: 'note', text: 'The trip is paused. Nothing moves until you come back.' }),
  );
  const backBtn = button('Back', showMain);
  controlsPanel.append(controlsList(), h('div', { class: 'stack' }, backBtn));

  const layer = h('div', { class: 'menu-layer' }, menu);
  root.append(layer);
  const release = trapFocus(menu);
  resume.focus();
  gsap.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: reducedMotion ? 0.1 : 0.2 });
  if (!reducedMotion) gsap.fromTo(menu, { y: 24, rotate: -2 }, { y: 0, rotate: 0.6, duration: 0.4, ease: 'back.out(1.6)' });

  return {
    nav: (dir) => moveFocus(menu, dir),
    back() {
      if (!controlsPanel.hasAttribute('hidden')) {
        showMain();
        return true;
      }
      return false;
    },
    close() {
      release();
      return new Promise((resolve) => {
        gsap.to(layer, {
          opacity: 0,
          duration: reducedMotion ? 0.08 : 0.18,
          onComplete: () => {
            layer.remove();
            resolve();
          },
        });
      });
    },
  };
}
