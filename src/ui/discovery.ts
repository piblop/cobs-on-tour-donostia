import gsap from 'gsap';
import type { LocationDef } from '../data/types.ts';
import { button, h, trapFocus } from './dom.ts';

export interface PolaroidCard {
  close(): Promise<void>;
}

/** The polaroid that slides in after a discovery, with the snapshot from the game. */
export function showPolaroid(
  root: HTMLElement,
  loc: LocationDef,
  photo: string,
  firstTime: boolean,
  onDone: () => void,
  reducedMotion: boolean,
): PolaroidCard {
  const img = h('img', {
    class: 'photo',
    attrs: { alt: `A photo of ${loc.name}`, width: '480', height: '360', decoding: 'async' },
  });
  if (photo) img.src = photo;
  const keep = button(firstTime ? 'Add to the journal' : 'Keep exploring', onDone, 'btn primary');
  const card = h(
    'article',
    { class: 'polaroid', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'polaroid-title' } },
    img,
    firstTime ? h('div', { class: 'stamp', text: 'Discovered' }) : null,
    h('h2', { id: 'polaroid-title', text: loc.name }),
    h('p', { class: 'caption', text: loc.polaroidCaption }),
    h('p', { class: 'fact' }, h('strong', { text: 'Did you know?' }), loc.fact.text),
    h('div', { class: 'card-actions' }, keep),
  );
  const layer = h('div', { class: 'card-layer' }, card);
  root.append(layer);
  const release = trapFocus(card);
  keep.focus({ preventScroll: true });

  // The backdrop fades; the card arrives as solid paper so text never blends into the scene.
  gsap.fromTo(layer, { backgroundColor: 'rgba(58, 44, 37, 0)' }, { backgroundColor: 'rgba(58, 44, 37, 0.18)', duration: 0.25 });
  if (reducedMotion) {
    gsap.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.12 });
  } else {
    gsap.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.1 });
    gsap.fromTo(card, { y: 36, rotate: 4, scale: 0.96 }, { y: 0, rotate: -2, scale: 1, duration: firstTime ? 0.5 : 0.35, ease: 'back.out(1.4)' });
  }

  return {
    close() {
      release();
      return new Promise((resolve) => {
        gsap.to(layer, {
          opacity: 0,
          duration: reducedMotion ? 0.12 : 0.25,
          onComplete: () => {
            layer.remove();
            resolve();
          },
        });
        if (!reducedMotion) gsap.to(card, { y: 30, rotate: -6, duration: 0.25, ease: 'power2.in' });
      });
    },
  };
}
