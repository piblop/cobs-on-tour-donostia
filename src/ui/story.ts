import gsap from 'gsap';
import { button, h, trapFocus } from './dom.ts';

/**
 * Small story UI pieces: the arrival ticket, choice dialogs, toasts and
 * confirmations. All text is set with textContent.
 */

/** The opening: a train ticket stamped "Donostia" while a little train chugs across. Skippable. */
export function showArrivalTicket(root: HTMLElement, reducedMotion: boolean): Promise<void> {
  return new Promise((resolve) => {
    const train = h('div', { class: 'ticket-train', attrs: { 'aria-hidden': 'true' } }, h('span'), h('span'), h('span'));
    const stamp = h('div', { class: 'ticket-stamp', text: 'Arrived' });
    const cont = button('Step outside', () => end(), 'btn primary');
    const ticket = h(
      'div',
      { class: 'ticket paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ticket-title' } },
      h('p', { class: 'ticket-kicker', text: 'Cobs on Tour · Day 1' }),
      h('h2', { id: 'ticket-title', class: 'ticket-dest', text: 'Donostia' }),
      h('p', { class: 'ticket-line', text: 'Four friends. One train. Golden hour waiting at the end of the line.' }),
      h('div', { class: 'ticket-rail' }, train),
      stamp,
      h('div', { class: 'ticket-actions' }, cont),
    );
    const layer = h('div', { class: 'ticket-layer' }, ticket);
    root.append(layer);
    const release = trapFocus(ticket);
    cont.focus();
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      release();
      window.removeEventListener('keydown', onKey, true);
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.1 : 0.45, onComplete: () => (layer.remove(), resolve()) });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        end();
      }
    };
    window.addEventListener('keydown', onKey, true);
    if (reducedMotion) {
      stamp.style.opacity = '1';
    } else {
      gsap.fromTo(ticket, { y: 40, rotate: -6, opacity: 0 }, { y: 0, rotate: -1.5, opacity: 1, duration: 0.6, ease: 'back.out(1.6)' });
      gsap.fromTo(train, { x: '-120%' }, { x: '0%', duration: 2.2, ease: 'power2.out', delay: 0.3 });
      gsap.fromTo(stamp, { scale: 2.4, opacity: 0, rotate: -25 }, { scale: 1, opacity: 1, rotate: -12, duration: 0.35, delay: 2.3, ease: 'back.out(2)' });
    }
  });
}

export interface ChoiceOption<T> {
  label: string;
  value: T;
}

/** A small scrapbook dialog with a few choices. Esc picks the first (safe) option. */
export function choose<T>(root: HTMLElement, heading: string, text: string, options: ChoiceOption<T>[], reducedMotion: boolean): Promise<T> {
  return new Promise((resolve) => {
    const buttons = options.map((o, i) => button(o.label, () => pick(o.value), i === 0 ? 'btn primary' : 'btn'));
    const box = h(
      'div',
      { class: 'menu paper choice-box', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'choice-title' } },
      h('h2', { id: 'choice-title', text: heading }),
      h('p', { class: 'choice-text', text }),
      h('div', { class: 'stack' }, ...buttons),
    );
    const layer = h('div', { class: 'menu-layer soft' }, box);
    root.append(layer);
    const release = trapFocus(box);
    buttons[0].focus();
    if (!reducedMotion) gsap.fromTo(box, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'back.out(1.6)' });
    let picked = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        pick(options[0].value);
      }
    };
    window.addEventListener('keydown', onKey, true);
    const pick = (v: T) => {
      if (picked) return;
      picked = true;
      release();
      window.removeEventListener('keydown', onKey, true);
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.05 : 0.18, onComplete: () => (layer.remove(), resolve(v)) });
    };
  });
}

/** A gentle notice in the corner. Errors stay until dismissed. */
export function toast(root: HTMLElement, text: string, kind: 'info' | 'warn' = 'info', seconds = 4): void {
  const close = button('OK', () => remove(), 'btn quiet');
  const el = h('div', { class: `toast ${kind}`, attrs: { role: kind === 'warn' ? 'alert' : 'status' } }, h('span', { text }), kind === 'warn' ? close : null);
  root.append(el);
  gsap.fromTo(el, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 });
  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    gsap.to(el, { opacity: 0, duration: 0.3, onComplete: () => el.remove() });
  };
  if (kind === 'info') window.setTimeout(remove, seconds * 1000);
}
