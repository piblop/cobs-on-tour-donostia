import gsap from 'gsap';
import type { MemoryEvent } from '../crew/memories.ts';
import { button, h, trapFocus } from './dom.ts';

export interface PageInput {
  day: number;
  photos: Array<{ id: string; title: string; url: string | null }>;
  foods: string[];
  memories: MemoryEvent[];
  /** Pre-selected moment and caption when revisiting a page. */
  moment: string | null;
  caption: string;
}

export interface PageResult {
  moment: string | null;
  caption: string;
}

/**
 * The evening scrapbook page: today's polaroids, foods and shared moments.
 * The player picks a "moment of the day" and may add a caption.
 */
export function showScrapbookPage(root: HTMLElement, page: PageInput, reducedMotion: boolean, actionLabel = 'Sleep well'): Promise<PageResult> {
  return new Promise((resolve) => {
    const photos = h('div', { class: 'sb-photos' });
    if (page.photos.length === 0) {
      photos.append(h('div', { class: 'sb-polaroid empty' }, h('div', { class: 'sb-photo' }), h('span', { text: 'No photos today. The best bits were in our heads.' })));
    }
    page.photos.forEach((p, i) => {
      const img = h('img', { class: 'sb-photo', attrs: { alt: p.title, width: '240', height: '180' } });
      if (p.url) img.src = p.url;
      const card = h('figure', { class: 'sb-polaroid' }, img, h('figcaption', { text: p.title }));
      card.style.setProperty('--tilt', `${(i % 2 ? 1 : -1) * (2 + (i % 3))}deg`);
      photos.append(card);
    });

    const foods = h(
      'ul',
      { class: 'sb-foods' },
      ...(page.foods.length ? page.foods.map((f) => h('li', { text: f })) : [h('li', { class: 'muted', text: 'Nothing new on the plate today.' })]),
    );

    let moment: string | null = page.moment ?? page.memories[0]?.key ?? null;
    const choices = h('div', { class: 'sb-moments', attrs: { role: 'radiogroup', 'aria-label': 'Moment of the day' } });
    page.memories.forEach((m) => {
      const b = h('button', { class: 'sb-moment', text: m.summary, attrs: { type: 'button', role: 'radio', 'aria-checked': 'false' } });
      b.addEventListener('click', () => {
        moment = m.key;
        sync();
      });
      b.dataset.key = m.key;
      choices.append(b);
    });
    if (page.memories.length === 0) choices.append(h('p', { class: 'muted', text: 'A quiet day. Those count too.' }));
    const sync = () => {
      for (const b of Array.from(choices.querySelectorAll<HTMLButtonElement>('.sb-moment'))) {
        const on = b.dataset.key === moment;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on || (!moment && b === choices.firstElementChild) ? 0 : -1;
      }
    };
    choices.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const list = Array.from(choices.querySelectorAll<HTMLButtonElement>('.sb-moment'));
      const i = list.findIndex((b) => b.dataset.key === moment);
      const next = list[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
      if (next) {
        moment = next.dataset.key ?? null;
        sync();
        next.focus();
        e.preventDefault();
      }
    });
    sync();

    const caption = h('textarea', { class: 'sb-caption', id: 'sb-caption', attrs: { maxlength: '140', rows: '2', placeholder: 'Write a caption (optional)' } });
    caption.value = page.caption;
    const done = button(actionLabel, () => finish(), 'btn primary');
    const box = h(
      'article',
      { class: 'sb paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sb-title' } },
      h('h2', { id: 'sb-title', class: 'sb-title', text: `Day ${page.day}` }),
      photos,
      h('div', { class: 'sb-cols' }, h('section', {}, h('h3', { text: 'On the plate' }), foods), h('section', {}, h('h3', { text: 'Moment of the day' }), choices)),
      h('label', { class: 'sb-label', attrs: { for: 'sb-caption' }, text: 'Caption' }),
      caption,
      h('div', { class: 'ticket-actions' }, done),
    );
    const layer = h('div', { class: 'ticket-layer' }, box);
    root.append(layer);
    const release = trapFocus(box);
    done.focus();
    if (!reducedMotion) {
      gsap.fromTo(box, { y: 50, rotate: -3, opacity: 0 }, { y: 0, rotate: -0.6, opacity: 1, duration: 0.6, ease: 'back.out(1.3)' });
      gsap.fromTo(photos.children, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.12, delay: 0.3 });
    }
    const finish = () => {
      release();
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.1 : 0.4, onComplete: () => (layer.remove(), resolve({ moment, caption: caption.value.trim().slice(0, 140) })) });
    };
  });
}
