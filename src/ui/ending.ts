import gsap from 'gsap';
import { button, h, trapFocus } from './dom.ts';

export interface EndingSlide {
  kind: 'title' | 'photo' | 'meal' | 'memory' | 'crew' | 'final';
  heading: string;
  text?: string;
  image?: string | null;
  /** Crew colour for crew slides. */
  colour?: string;
}

export type EndingChoice = 'rewatch' | 'scrapbook' | 'one-more-day' | 'new-trip';

/**
 * The ending montage: the player's own polaroids, favourite meals, real
 * moments and the crew, set to soft original music. It always has something
 * to show, even if the trip was quiet. Ends with "See you next tour."
 */
export function playEnding(root: HTMLElement, slides: EndingSlide[], reducedMotion: boolean, onSlide: (i: number) => void): Promise<EndingChoice> {
  return new Promise((resolve) => {
    const stage = h('div', { class: 'ending-stage', attrs: { 'aria-live': 'polite' } });
    const skip = button('Skip to the end', () => show(slides.length - 1), 'btn quiet');
    const choices = h('div', { class: 'ending-choices', attrs: { hidden: '' } });
    const box = h(
      'div',
      { class: 'ending', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'The end of the trip' } },
      stage,
      h('div', { class: 'ending-foot' }, skip, choices),
    );
    const layer = h('div', { class: 'ending-layer' }, box);
    root.append(layer);
    const release = trapFocus(box);
    let i = -1;
    let timer = 0;
    const choose = (c: EndingChoice) => {
      window.clearTimeout(timer);
      release();
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.1 : 0.5, onComplete: () => (layer.remove(), resolve(c)) });
    };
    choices.append(
      button('Continue with “One More Day”', () => choose('one-more-day'), 'btn primary'),
      button('Rewatch', () => choose('rewatch')),
      button('Leaf through the scrapbook', () => choose('scrapbook')),
      button('Start a new trip', () => choose('new-trip')),
    );
    const show = (n: number) => {
      window.clearTimeout(timer);
      i = n;
      const s = slides[i];
      onSlide(i);
      const card = h(
        'div',
        { class: `ending-card ${s.kind}` },
        s.image ? h('img', { class: 'ending-photo', attrs: { src: s.image, alt: s.heading } }) : null,
        h(s.kind === 'final' ? 'h1' : 'h2', { class: 'ending-heading', text: s.heading }),
        s.text ? h('p', { class: 'ending-text', text: s.text }) : null,
      );
      if (s.colour) card.style.setProperty('--crew', s.colour);
      stage.replaceChildren(card);
      if (!reducedMotion) {
        gsap.fromTo(card, { opacity: 0, y: 24, rotate: s.kind === 'photo' ? -3 : 0, scale: 0.97 }, { opacity: 1, y: 0, rotate: s.kind === 'photo' ? -1.5 : 0, scale: 1, duration: 0.9, ease: 'power2.out' });
      }
      if (i >= slides.length - 1) {
        skip.setAttribute('hidden', '');
        choices.removeAttribute('hidden');
        (choices.firstElementChild as HTMLElement).focus();
        return;
      }
      timer = window.setTimeout(() => show(i + 1), s.kind === 'title' ? 3200 : 3800);
    };
    skip.focus();
    show(0);
  });
}

export interface BookPage {
  day: number;
  moment: string | null;
  caption: string;
  photos: Array<{ title: string; url: string | null }>;
  foods: string[];
  memories: string[];
}

/** Leaf through the finished scrapbook, one day per page. */
export function showBook(root: HTMLElement, pages: BookPage[], reducedMotion: boolean): Promise<void> {
  return new Promise((resolve) => {
    let n = 0;
    const body = h('div', { class: 'book-page' });
    const prev = button('Previous day', () => go(n - 1));
    const next = button('Next day', () => go(n + 1));
    const close = button('Close the scrapbook', () => finish(), 'btn primary');
    const box = h(
      'div',
      { class: 'sb paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'book-title' } },
      h('h2', { id: 'book-title', class: 'sb-title', text: 'Our scrapbook' }),
      body,
      h('div', { class: 'ticket-actions' }, prev, next, close),
    );
    const layer = h('div', { class: 'ticket-layer' }, box);
    root.append(layer);
    const release = trapFocus(box);
    const go = (i: number) => {
      if (pages.length === 0) {
        body.replaceChildren(h('p', { class: 'muted', text: 'No pages yet. Every trip starts somewhere.' }));
        prev.setAttribute('disabled', '');
        next.setAttribute('disabled', '');
        return;
      }
      n = Math.max(0, Math.min(pages.length - 1, i));
      const p = pages[n];
      const photos = h(
        'div',
        { class: 'sb-photos' },
        ...p.photos.map((ph, k) => {
          const img = h('img', { class: 'sb-photo', attrs: { alt: ph.title, width: '240', height: '180' } });
          if (ph.url) img.src = ph.url;
          const fig = h('figure', { class: 'sb-polaroid' }, img, h('figcaption', { text: ph.title }));
          fig.style.setProperty('--tilt', `${(k % 2 ? 1 : -1) * 2}deg`);
          return fig;
        }),
      );
      const parts: Node[] = [h('h3', { class: 'book-day', text: `Day ${p.day}` }), photos];
      if (p.moment) parts.push(h('p', { class: 'book-moment', text: `★ ${p.moment}` }));
      if (p.caption) parts.push(h('p', { class: 'book-caption', text: `“${p.caption}”` }));
      parts.push(
        h('div', { class: 'sb-cols' }, h('section', {}, h('h3', { text: 'On the plate' }), h('ul', { class: 'sb-foods' }, ...p.foods.map((f) => h('li', { text: f })))), h('section', {}, h('h3', { text: 'What happened' }), h('ul', { class: 'sb-foods' }, ...p.memories.map((m) => h('li', { text: m }))))),
      );
      body.replaceChildren(...parts);
      prev.toggleAttribute('disabled', n === 0);
      next.toggleAttribute('disabled', n === pages.length - 1);
      if (!reducedMotion) gsap.fromTo(body, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.3 });
    };
    go(0);
    close.focus();
    const finish = () => {
      release();
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.1 : 0.3, onComplete: () => (layer.remove(), resolve()) });
    };
  });
}
