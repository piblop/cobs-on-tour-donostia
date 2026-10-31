import gsap from 'gsap';
import { button, h, trapFocus } from './dom.ts';

export interface QuickStop {
  id: string;
  name: string;
  subtitle: string;
  /** Section heading the stop is listed under, e.g. "Sights". */
  group?: string;
  /** Why it is not available yet, or null when it is. */
  locked: string | null;
  here: boolean;
}

export interface QuickTravelMenu {
  /** Resolves with the chosen stop id, or null if the player closed the map. */
  result: Promise<string | null>;
  cancel: () => void;
}

/**
 * The quick travel card: every sight and pintxos bar around the bay, grouped
 * under small headings. Tap one and the crew hop straight there.
 */
export function showQuickTravel(root: HTMLElement, stops: QuickStop[], reducedMotion: boolean): QuickTravelMenu {
  let cancel = () => {};
  const result = new Promise<string | null>((resolve) => {
    const list = h('div', { class: 'qt-list' });
    let done = false;
    const finish = (id: string | null) => {
      if (done) return;
      done = true;
      release();
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.1 : 0.25, onComplete: () => (layer.remove(), resolve(id)) });
    };
    cancel = () => finish(null);
    let group: string | undefined;
    for (const stop of stops) {
      if (stop.group && stop.group !== group) {
        group = stop.group;
        list.append(h('h3', { class: 'qt-group', text: group }));
      }
      const b = h(
        'button',
        { class: `qt-stop${stop.here ? ' here' : ''}`, attrs: { type: 'button' } },
        h('strong', { text: stop.name }),
        h('span', { class: 'qt-sub', text: stop.locked ?? (stop.here ? 'You are here' : stop.subtitle) }),
      );
      if (stop.locked || stop.here) b.disabled = true;
      else b.addEventListener('click', () => finish(stop.id));
      list.append(b);
    }
    const box = h(
      'div',
      { class: 'quick-travel paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qt-title' } },
      h('h2', { id: 'qt-title', class: 'plan-title', text: 'Where to?' }),
      h('p', { class: 'qt-note hand', text: 'A quick hop across town. The crew will meet you there.' }),
      list,
      h('div', { class: 'ticket-actions' }, button('Stay here', () => finish(null), 'btn quiet')),
    );
    const layer = h('div', { class: 'ticket-layer' }, box);
    root.append(layer);
    const release = trapFocus(box);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish(null);
    });
    (list.querySelector<HTMLButtonElement>('button:not([disabled])') ?? box.querySelector('button'))?.focus();
    if (!reducedMotion) gsap.fromTo(box, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.4)' });
  });
  return { result, cancel };
}
