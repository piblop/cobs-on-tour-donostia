import gsap from 'gsap';
import { button, controlsList, h, moveFocus, trapFocus } from './dom.ts';
import type { HistoryItem } from './bubbles.ts';

export interface PauseMenu {
  close(): Promise<void>;
  nav(dir: 1 | -1): void;
  back(): boolean;
}

export interface PauseHandlers {
  resume(): void;
  returnToPromenade(): void;
  toTitle(): void;
  settings(onDone: () => void): HTMLElement;
  history(): HistoryItem[];
}

/** Pause menu. "Return to the promenade" is always available as a safe recovery. */
export function showPause(root: HTMLElement, handlers: PauseHandlers, reducedMotion: boolean): PauseMenu {
  const title = h('h2', { id: 'pause-title', text: 'Taking a breather' });
  const body = h('div');
  const menu = h(
    'div',
    { class: 'menu paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' } },
    title,
    body,
  );
  let inSub = false;

  const showMain = () => {
    inSub = false;
    title.textContent = 'Taking a breather';
    const resume = button('Resume', handlers.resume, 'btn primary');
    body.replaceChildren(
      h(
        'div',
        { class: 'stack' },
        resume,
        button('Return to the promenade', handlers.returnToPromenade),
        button('Conversation history', showHistory),
        button('Settings', showSettings),
        button('Controls', showControls),
        button('Back to title', handlers.toTitle),
      ),
      h('p', { class: 'note', text: 'The trip is paused. The clock stops until you come back.' }),
    );
    resume.focus();
  };
  const sub = (heading: string, content: HTMLElement) => {
    inSub = true;
    title.textContent = heading;
    const back = button('Back', showMain);
    body.replaceChildren(content, h('div', { class: 'stack sub-back' }, back));
    (content.querySelector('button, input') as HTMLElement | null)?.focus() ?? back.focus();
  };
  const showControls = () => sub('Controls', controlsList());
  const showSettings = () => {
    inSub = true;
    title.textContent = 'Settings';
    body.replaceChildren(handlers.settings(showMain));
    (body.querySelector('button') as HTMLElement | null)?.focus();
  };
  const showHistory = () => {
    const items = handlers.history();
    const list = h('ol', { class: 'history', attrs: { 'aria-label': 'What the crew said, oldest first' } });
    if (items.length === 0) list.append(h('li', { class: 'empty', text: 'Nobody has said anything yet. Give them a minute.' }));
    for (const it of items.slice(-120)) {
      list.append(h('li', {}, h('span', { class: 'when', text: `Day ${it.day} · ${it.time}` }), h('strong', { text: `${it.name}: ` }), it.text));
    }
    sub('Conversation history', list);
    list.scrollTop = list.scrollHeight;
  };

  const layer = h('div', { class: 'menu-layer' }, menu);
  root.append(layer);
  const release = trapFocus(menu);
  showMain();
  gsap.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: reducedMotion ? 0.1 : 0.2 });
  if (!reducedMotion) gsap.fromTo(menu, { y: 24, rotate: -2 }, { y: 0, rotate: 0.6, duration: 0.4, ease: 'back.out(1.6)' });

  return {
    nav: (dir) => moveFocus(menu, dir),
    back() {
      if (inSub) {
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
