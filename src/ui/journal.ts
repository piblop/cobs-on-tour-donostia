import gsap from 'gsap';
import type { CrewId, FoodDef, LocationDef } from '../data/types.ts';
import { foodThumbnail } from '../world/food3d.ts';
import { button, h, trapFocus } from './dom.ts';
import { areas } from '../data/locations.ts';

const areaName = (id: string) => areas.find((a) => a.id === id)?.name ?? 'Donostia';

export interface JournalData {
  locations: LocationDef[];
  discovered: Map<string, { day: number; photo: string | null }>;
  captions: Record<string, string>;
  foods: FoodDef[];
  tried: Map<string, number>;
  names: Record<CrewId, string>;
  favourites: Set<string>;
}

export interface JournalResult {
  captions: Record<string, string>;
  favourites: Set<string>;
  /** A location to replay when the journal closes. */
  replay: string | null;
}

/**
 * The trip journal: a Sights tab of polaroids with facts and personal captions,
 * and a Pintxo-dex of everything tasted. No pressure to fill it: collections
 * celebrate the journey.
 */
export function showJournal(root: HTMLElement, data: JournalData, startTab: 'sights' | 'dex', reducedMotion: boolean): Promise<JournalResult> {
  return new Promise((resolve) => {
    const captions = { ...data.captions };
    const favourites = new Set(data.favourites);
    let replay: string | null = null;
    const tabSights = h('button', { class: 'tab', text: 'Sights', attrs: { type: 'button', role: 'tab', id: 'tab-sights' } });
    const tabDex = h('button', { class: 'tab', text: 'Pintxo-dex', attrs: { type: 'button', role: 'tab', id: 'tab-dex' } });
    const panel = h('div', { class: 'journal-panel', attrs: { role: 'tabpanel' } });
    const close = button('Close journal', () => finish(), 'btn primary');
    const box = h(
      'div',
      { class: 'journal paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'journal-title' } },
      h('h2', { id: 'journal-title', class: 'plan-title', text: 'Trip journal' }),
      h('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'Journal sections' } }, tabSights, tabDex),
      panel,
      h('div', { class: 'ticket-actions' }, close),
    );

    const showSights = () => {
      tabSights.setAttribute('aria-selected', 'true');
      tabDex.setAttribute('aria-selected', 'false');
      panel.setAttribute('aria-labelledby', 'tab-sights');
      const found = data.locations.filter((l) => data.discovered.has(l.id)).length;
      const grid = h('div', { class: 'journal-grid' });
      for (const loc of data.locations) {
        const d = data.discovered.get(loc.id);
        if (!d) {
          grid.append(
            h('article', { class: 'jcard locked' }, h('div', { class: 'jphoto' }), h('strong', { text: 'Not yet discovered' }), h('p', { class: 'muted', text: `Somewhere around ${areaName(loc.area)}…` })),
          );
          continue;
        }
        const img = h('img', { class: 'jphoto', attrs: { alt: `Polaroid of ${loc.name}`, width: '240', height: '180' } });
        if (d.photo) img.src = d.photo;
        const cap = h('input', { class: 'jcaption', attrs: { type: 'text', maxlength: '80', placeholder: 'Your caption', 'aria-label': `Caption for ${loc.name}` } });
        cap.value = captions[loc.id] ?? '';
        cap.addEventListener('input', () => (captions[loc.id] = cap.value.slice(0, 80)));
        grid.append(
          h(
            'article',
            { class: 'jcard' },
            img,
            h('strong', { text: loc.name }),
            h('span', { class: 'jday', text: `Discovered on day ${d.day}` }),
            h('p', { class: 'jfact', text: loc.fact.text }),
            cap,
            button('Replay the moment', () => {
              replay = loc.id;
              finish();
            }, 'btn quiet'),
          ),
        );
      }
      panel.replaceChildren(h('p', { class: 'journal-count', text: `${found} of ${data.locations.length} sights. No rush: the best ones are the ones we stumble into.` }), grid);
    };

    const showDex = () => {
      tabSights.setAttribute('aria-selected', 'false');
      tabDex.setAttribute('aria-selected', 'true');
      panel.setAttribute('aria-labelledby', 'tab-dex');
      const grid = h('div', { class: 'journal-grid' });
      let tried = 0;
      for (const food of data.foods) {
        const day = data.tried.get(food.id);
        if (day === undefined) {
          grid.append(h('article', { class: 'jcard locked' }, h('div', { class: 'jphoto small' }), h('strong', { text: '???' }), h('p', { class: 'muted', text: 'Not tasted yet.' })));
          continue;
        }
        tried++;
        const thumb = foodThumbnail(food);
        const fav = h('button', { class: 'fav', attrs: { type: 'button', 'aria-pressed': String(favourites.has(food.id)) } });
        const syncFav = () => {
          const on = favourites.has(food.id);
          fav.setAttribute('aria-pressed', String(on));
          fav.textContent = on ? '★ Favourite' : '☆ Mark favourite';
        };
        fav.addEventListener('click', () => {
          if (favourites.has(food.id)) favourites.delete(food.id);
          else favourites.add(food.id);
          syncFav();
        });
        syncFav();
        grid.append(
          h(
            'article',
            { class: 'jcard' },
            thumb ? h('img', { class: 'jphoto small', attrs: { src: thumb, alt: '', width: '160', height: '120' } }) : null,
            h('strong', { text: food.name }),
            food.localName ? h('em', { text: food.localName }) : null,
            h('span', { class: 'jday', text: `${food.rating} · first tried on day ${day}` }),
            h('p', { class: 'jfact', text: food.description }),
            h(
              'ul',
              { class: 'jreacts' },
              ...(Object.keys(data.names) as CrewId[]).map((id) => h('li', {}, h('strong', { text: `${data.names[id]}: ` }), food.reactions[id])),
            ),
            fav,
          ),
        );
      }
      panel.replaceChildren(h('p', { class: 'journal-count', text: `${tried} of ${data.foods.length} tasted. Plenty of room for seconds.` }), grid);
    };

    tabSights.addEventListener('click', showSights);
    tabDex.addEventListener('click', showDex);
    const layer = h('div', { class: 'ticket-layer' }, box);
    root.append(layer);
    const release = trapFocus(box);
    if (startTab === 'dex') showDex();
    else showSights();
    (startTab === 'dex' ? tabDex : tabSights).focus();
    if (!reducedMotion) gsap.fromTo(box, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.4)' });
    const finish = () => {
      release();
      gsap.to(layer, { opacity: 0, duration: reducedMotion ? 0.1 : 0.3, onComplete: () => (layer.remove(), resolve({ captions, favourites, replay })) });
    };
  });
}
