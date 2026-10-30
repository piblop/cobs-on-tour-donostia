import gsap from 'gsap';
import type { CrewId, FoodDef } from '../data/types.ts';
import { foodThumbnail } from '../world/food3d.ts';
import { button, h, trapFocus } from './dom.ts';

/**
 * The cider-house feast as a scrapbook menu card: you don't choose, it
 * arrives, course by course, each with a reaction from the table.
 */
export function showFeast(
  root: HTMLElement,
  title: string,
  courses: FoodDef[],
  names: Record<CrewId, string>,
  reducedMotion: boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const list = h('ol', { class: 'feast-list' });
    const next = button('Next course', () => advance(), 'btn primary');
    const box = h(
      'div',
      { class: 'feast paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'feast-title' } },
      h('h2', { id: 'feast-title', class: 'plan-title', text: title }),
      h('p', { class: 'mg-help', text: 'Fixed menu. You don’t choose. It arrives.' }),
      list,
      h('div', { class: 'ticket-actions' }, next),
    );
    const layer = h('div', { class: 'ticket-layer' }, box);
    root.append(layer);
    const release = trapFocus(box);
    next.focus();
    const order: CrewId[] = ['huw', 'romy', 'annette', 'paulo'];
    let i = 0;
    let timer = 0;
    const advance = () => {
      window.clearTimeout(timer);
      if (i >= courses.length) {
        finish();
        return;
      }
      const food = courses[i];
      const who = order[i % order.length];
      const thumb = foodThumbnail(food);
      const li = h(
        'li',
        { class: 'feast-course' },
        thumb ? h('img', { class: 'feast-thumb', attrs: { src: thumb, alt: '', width: '120', height: '90' } }) : null,
        h('div', {}, h('strong', { text: food.name }), food.localName ? h('em', { text: ` ${food.localName}` }) : null, h('p', { class: 'feast-react', text: `${names[who]}: “${food.reactions[who]}”` })),
      );
      list.append(li);
      li.scrollIntoView({ block: 'nearest' });
      if (!reducedMotion) gsap.fromTo(li, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' });
      i++;
      next.textContent = i >= courses.length ? 'Lovely. Taxi home' : 'Next course';
      timer = window.setTimeout(advance, 3600);
    };
    const finish = () => {
      window.clearTimeout(timer);
      release();
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.1 : 0.35, onComplete: () => (layer.remove(), resolve()) });
    };
    advance();
  });
}
