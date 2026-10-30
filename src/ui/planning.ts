import gsap from 'gsap';
import type { CrewMember, WishDef } from '../data/types.ts';
import { MAX_PINNED_WISHES } from '../data/wishes.ts';
import { button, h, trapFocus } from './dom.ts';

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Map pins for places the wishes point at (approximate positions on the drawing). */
const PIN_FOR: Record<string, { x: number; y: number; label: string }> = {
  'annette-tomato': { x: 262, y: 92, label: 'Bar Ttipi' },
  'annette-lanes': { x: 248, y: 74, label: 'Old town lanes' },
  'huw-cheesecake': { x: 240, y: 98, label: 'Gazta' },
  'huw-clams': { x: 276, y: 100, label: 'Gozo Gozo' },
  'romy-bench': { x: 128, y: 128, label: 'A bench by the bay' },
  'romy-mushrooms': { x: 276, y: 100, label: 'Gozo Gozo' },
  'paulo-sunset': { x: 92, y: 120, label: 'The railing at sunset' },
  'paulo-railing': { x: 106, y: 124, label: 'The white railing' },
};
const HOTEL = { x: 150, y: 140 };

/**
 * Morning planning: a hand-drawn map of the bay, one optional wish from each
 * friend, and up to three pins. Plans are suggestions, never a checklist.
 */
export function showPlanning(
  root: HTMLElement,
  day: number,
  offered: Array<{ wish: WishDef; friend: CrewMember }>,
  tips: string[],
  reducedMotion: boolean,
): Promise<string[]> {
  return new Promise((resolve) => {
    const pinned: string[] = [];
    // Hand-drawn style map: bay, beach crescent, old town, Urgull, Igueldo, Santa Clara.
    const map = svg('svg', { viewBox: '0 0 320 170', class: 'plan-map', role: 'img', 'aria-label': 'A hand-drawn map of the bay with the pinned plans' });
    map.append(
      svg('rect', { x: '0', y: '0', width: '320', height: '170', fill: '#fbf3e3' }),
      svg('path', { d: 'M0 0 H320 V60 C 250 70, 230 110, 160 118 C 100 124, 50 100, 0 70 Z', fill: '#bfe9e2', stroke: '#7fbfb8', 'stroke-width': '2' }),
      svg('path', { d: 'M20 82 C 60 112, 110 128, 160 126 C 205 124, 228 104, 238 86', fill: 'none', stroke: '#e8cf98', 'stroke-width': '9', 'stroke-linecap': 'round' }),
      svg('ellipse', { cx: '138', cy: '40', rx: '16', ry: '9', fill: '#9cc28a', stroke: '#6f9a63', 'stroke-width': '2' }),
      svg('ellipse', { cx: '18', cy: '52', rx: '30', ry: '22', fill: '#9cc28a', stroke: '#6f9a63', 'stroke-width': '2' }),
      svg('ellipse', { cx: '286', cy: '50', rx: '28', ry: '20', fill: '#9cc28a', stroke: '#6f9a63', 'stroke-width': '2' }),
      svg('rect', { x: '232', y: '66', width: '62', height: '44', rx: '6', fill: '#f2c9a0', stroke: '#c48a62', 'stroke-width': '2', 'stroke-dasharray': '4 3' }),
    );
    const label = (x: number, y: number, text: string) => {
      const t = svg('text', { x: String(x), y: String(y), class: 'plan-label' });
      t.textContent = text;
      return t;
    };
    map.append(
      label(120, 30, 'Santa Clara'),
      label(4, 30, 'Igueldo'),
      label(270, 26, 'Urgull'),
      label(236, 124, 'Old town'),
      label(96, 150, 'La Concha'),
      svg('circle', { cx: String(HOTEL.x), cy: String(HOTEL.y), r: '5', fill: '#3a2c25' }),
      label(158, 160, 'Hotel'),
    );
    const route = svg('path', { d: '', fill: 'none', stroke: '#c4513f', 'stroke-width': '2.5', 'stroke-dasharray': '6 5', 'stroke-linecap': 'round' });
    const pins = svg('g', {});
    map.append(route, pins);

    const drawRoute = () => {
      pins.replaceChildren();
      const pts = [HOTEL, ...pinned.map((id) => PIN_FOR[id]).filter(Boolean)];
      let d = `M${HOTEL.x} ${HOTEL.y}`;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        d += ` Q ${(a.x + b.x) / 2} ${Math.min(a.y, b.y) - 18} ${b.x} ${b.y}`;
      }
      route.setAttribute('d', pts.length > 1 ? d : '');
      pinned.forEach((id, i) => {
        const p = PIN_FOR[id];
        if (!p) return;
        pins.append(svg('circle', { cx: String(p.x), cy: String(p.y), r: '8', fill: '#c4513f', stroke: '#fff', 'stroke-width': '2' }));
        const n = svg('text', { x: String(p.x), y: String(p.y + 4), class: 'plan-pin-num' });
        n.textContent = String(i + 1);
        pins.append(n);
      });
    };

    const count = h('p', { class: 'plan-count', attrs: { 'aria-live': 'polite' } });
    const legend = h('ol', { class: 'plan-legend', attrs: { 'aria-label': 'Pinned plans in order' } });
    const cards = offered.map(({ wish, friend }) => {
      const card = h(
        'button',
        { class: 'wish-card', attrs: { type: 'button', 'aria-pressed': 'false' } },
        h('span', { class: 'wish-who', text: friend.name }),
        h('span', { class: 'wish-text', text: wish.text }),
        h('span', { class: 'wish-pin', text: 'Pin it' }),
      );
      card.style.setProperty('--crew', friend.colors.top);
      card.addEventListener('click', () => {
        const i = pinned.indexOf(wish.id);
        if (i >= 0) pinned.splice(i, 1);
        else if (pinned.length < MAX_PINNED_WISHES) pinned.push(wish.id);
        sync();
      });
      return { card, wish };
    });
    const sync = () => {
      for (const { card, wish } of cards) {
        const on = pinned.includes(wish.id);
        card.setAttribute('aria-pressed', String(on));
        (card.querySelector('.wish-pin') as HTMLElement).textContent = on ? `Pinned ${pinned.indexOf(wish.id) + 1}` : 'Pin it';
      }
      count.textContent = `${pinned.length} of ${MAX_PINNED_WISHES} pinned. Plans are suggestions: change your mind any time.`;
      legend.replaceChildren(
        ...(pinned.length
          ? pinned.map((id) => {
              const o = offered.find((x) => x.wish.id === id);
              return h('li', { text: `${PIN_FOR[id]?.label ?? 'Somewhere nice'}: ${o?.friend.name ?? ''}’s wish` });
            })
          : [h('li', { class: 'muted', text: 'Nothing pinned yet. Wandering is also a plan.' })]),
      );
      map.setAttribute('aria-label', `A hand-drawn map of the bay. ${pinned.length ? `Route: hotel, then ${pinned.map((id) => PIN_FOR[id]?.label ?? 'somewhere').join(', then ')}.` : 'No route yet.'}`);
      drawRoute();
    };

    const go = button('Off we go', () => finish(), 'btn primary');
    const box = h(
      'div',
      { class: 'plan paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'plan-title' } },
      h('h2', { id: 'plan-title', class: 'plan-title', text: `Day ${day} · Morning plans` }),
      h('div', { class: 'plan-grid' }, h('div', { class: 'plan-map-wrap' }, map, legend), h('div', { class: 'plan-wishes' }, ...cards.map((c) => c.card))),
      count,
      tips.length ? h('ul', { class: 'plan-tips' }, ...tips.map((t) => h('li', { text: t }))) : null,
      h('div', { class: 'ticket-actions' }, go),
    );
    const layer = h('div', { class: 'ticket-layer' }, box);
    root.append(layer);
    const release = trapFocus(box);
    sync();
    (cards[0]?.card ?? go).focus();
    if (!reducedMotion) gsap.fromTo(box, { y: 40, rotate: 2, opacity: 0 }, { y: 0, rotate: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' });
    const finish = () => {
      release();
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.1 : 0.35, onComplete: () => (layer.remove(), resolve([...pinned])) });
    };
  });
}
