import gsap from 'gsap';
import type { CrewId, FoodDef } from '../data/types.ts';
import { minigameTuning } from '../data/tuning.ts';
import { foodThumbnail } from '../world/food3d.ts';
import { button, h, trapFocus } from '../ui/dom.ts';
import { MinigameShell, type ShellOptions } from './shell.ts';

/**
 * Pintxos Crawl: catch the bartender's eye, choose dishes to share, and carry
 * the tray back without a wobble. Forgiving by design: missing is funny, never
 * a failure, and skipping gives the same progression.
 */
export interface CrawlOptions extends ShellOptions {
  menu: FoodDef[];
  favourites: Record<CrewId, string[]>;
}

export interface CrawlResult {
  skipped: boolean;
  practiced: boolean;
  chosen: string[];
  wobbles: number;
  eyeTries: number;
}

const PICKS = 3;

/** Pick sensible dishes when the player skips: favourites first, then house picks. */
export function defaultPicks(menu: FoodDef[], favourites: Record<CrewId, string[]>): string[] {
  const out: string[] = [];
  const favNames = Object.values(favourites).flat().map((f) => f.toLowerCase());
  for (const food of menu) {
    if (out.length >= PICKS) break;
    if (favNames.some((f) => food.name.toLowerCase().includes(f) || f.includes(food.name.toLowerCase()))) out.push(food.id);
  }
  for (const food of menu) {
    if (out.length >= PICKS) break;
    if (!out.includes(food.id)) out.push(food.id);
  }
  return out;
}

export function playPintxosCrawl(root: HTMLElement, opts: CrawlOptions): Promise<CrawlResult> {
  return new Promise((resolve) => {
    const t = minigameTuning.crawl;
    const timing = opts.relaxed ? t.relaxedScale : 1;
    let practiced = false;
    let eyeTries = 0;
    let wobbles = 0;
    let chosen: string[] = [];

    const shell = new MinigameShell(root, opts, (skipped) => {
      if (skipped && chosen.length === 0) chosen = defaultPicks(opts.menu, opts.favourites);
      resolve({ skipped, practiced, chosen, wobbles, eyeTries });
    });
    const release = trapFocus(shell.panel);
    shell.onFinish = release;

    // --- Intro -------------------------------------------------------------------
    const intro = () => {
      shell.stage(null, null);
      shell.title.textContent = 'Pintxos Crawl';
      shell.help.textContent = 'Three little steps: catch the bartender’s eye, choose dishes to share, carry the tray back without a wobble.';
      const play = button('Play', () => catchEye(false), 'btn primary');
      shell.body.replaceChildren(
        h(
          'ol',
          { class: 'mg-steps' },
          h('li', { text: 'Wave when the bartender looks your way (or just wave, no timing needed).' }),
          h('li', { text: `Pick ${PICKS} things to share.` }),
          h('li', { text: opts.oneButton ? 'Hold your button to steady the tray.' : 'Keep the tray level: left and right.' }),
        ),
        h('p', { class: 'mg-note', text: 'No pressure: misses are funny, never failures. Esc skips at any time.' }),
      );
      shell.actions.replaceChildren(play, button('Practice first', () => catchEye(true)));
      play.focus();
    };

    // --- Stage 1: catch the bartender's eye -------------------------------------
    const catchEye = (practice: boolean) => {
      if (practice) practiced = true;
      shell.title.textContent = practice ? 'Practice: catch the eye' : 'Catch the bartender’s eye';
      shell.help.textContent = opts.oneButton
        ? 'Press your button when the marker is in the middle. A soft tick sounds when it is.'
        : 'Press Space, E or A when the marker reaches the middle. A soft tick sounds when the bartender looks your way.';
      const face = h('div', { class: 'mg-bartender', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'eye l' }), h('span', { class: 'eye r' }), h('span', { class: 'mouth' }));
      const marker = h('span', { class: 'mg-marker' });
      const zone = h('span', { class: 'mg-zone', text: 'now' });
      const track = h('div', { class: 'mg-track', attrs: { 'aria-hidden': 'true' } }, zone, marker);
      const note = h('p', { class: 'mg-feedback', attrs: { 'aria-live': 'polite' } });
      shell.body.replaceChildren(h('div', { class: 'mg-counter' }, face), track, note);
      const wave = button('Wave!', () => attempt(), 'btn primary');
      const untimed = button('Just wave (no timing)', () => succeed('The bartender sees the whole crew waving and comes straight over.'));
      shell.actions.replaceChildren(wave, untimed);
      wave.focus();
      const half = (opts.relaxed ? t.eyeWindowRelaxed : t.eyeWindow) / 2;
      zone.style.left = `${(0.5 - half) * 100}%`;
      zone.style.width = `${half * 2 * 100}%`;
      let phase = 0;
      let misses = 0;
      let locked = false;
      let wasLooking = false;
      const pos = () => (phase < 1 ? phase : 2 - phase);
      const succeed = (text: string) => {
        if (locked) return;
        locked = true;
        opts.sfx('discover');
        note.textContent = text;
        shell.say(text);
        face.classList.add('happy');
        shell.later(() => (practice ? intro() : chooseDishes()), opts.reducedMotion ? 400 : 900);
      };
      const attempt = () => {
        if (locked) return;
        if (!practice) eyeTries++;
        if (Math.abs(pos() - 0.5) < half) {
          succeed('Got it! The bartender grins and comes over.');
          return;
        }
        misses++;
        opts.sfx('click');
        const lines = [
          'Huw waves a bit too hard. The bartender pretends not to see.',
          'Annette tries a polite little wave. Nothing yet.',
          'Romy just stares meaningfully. Almost.',
        ];
        if (misses >= t.eyeMaxMisses && !practice) {
          succeed('The bartender spots Huw’s enthusiastic waving anyway and laughs. Close enough!');
        } else {
          note.textContent = lines[(misses - 1) % lines.length];
          shell.say(note.textContent);
        }
      };
      shell.stage(
        (dt) => {
          phase = (phase + (dt * t.eyeSpeed) / timing) % 2;
          marker.style.left = `${pos() * 100}%`;
          const looking = Math.abs(pos() - 0.5) < half;
          face.classList.toggle('looking', looking);
          // A soft audio cue when the window opens, so timing is not sight-only.
          if (looking && !wasLooking && !locked) opts.sfx('switch');
          wasLooking = looking;
        },
        (k) => {
          if (k === 'act') attempt();
        },
      );
    };

    // --- Stage 2: choose dishes ----------------------------------------------------
    const chooseDishes = () => {
      shell.title.textContent = 'Choose dishes to share';
      shell.help.textContent = opts.oneButton
        ? `The highlight moves by itself. Press your button to pick. Choose ${PICKS}.`
        : `Arrow keys to look, Space or Enter to pick. Choose ${PICKS}.`;
      chosen = [];
      let focus = 0;
      const favouriteOf = (food: FoodDef) =>
        (Object.entries(opts.favourites) as Array<[CrewId, string[]]>).find(([, favs]) =>
          favs.some((f) => food.name.toLowerCase().includes(f.toLowerCase()) || f.toLowerCase().includes(food.name.toLowerCase())),
        )?.[0];
      const cards = opts.menu.map((food) => {
        const fav = favouriteOf(food);
        const thumb = foodThumbnail(food);
        const card = h(
          'button',
          { class: 'mg-card', attrs: { type: 'button', 'aria-pressed': 'false' } },
          thumb ? h('img', { class: 'mg-thumb', attrs: { src: thumb, alt: '', width: '160', height: '120' } }) : h('span', { class: 'mg-swatch', attrs: { 'aria-hidden': 'true' } }),
          h('strong', { text: food.name }),
          food.localName ? h('em', { text: food.localName }) : null,
          h('span', { class: 'mg-desc', text: food.description }),
          fav ? h('span', { class: 'mg-tag', text: `★ ${fav[0].toUpperCase()}${fav.slice(1)}’s favourite` }) : null,
          food.alcoholFree ? null : h('span', { class: 'mg-tag soft', text: 'Contains alcohol' }),
        );
        card.addEventListener('click', () => toggle(food.id, card));
        return { card, food };
      });
      const count = h('p', { class: 'mg-count', attrs: { 'aria-live': 'polite' } });
      const done = button('Carry it to the table', () => carryTray(), 'btn primary');
      shell.body.replaceChildren(h('div', { class: 'mg-cards' }, ...cards.map((c) => c.card)));
      shell.actions.replaceChildren(count, done);
      const sync = () => {
        count.textContent = `${chosen.length} of ${PICKS} chosen`;
        done.toggleAttribute('disabled', chosen.length < 1);
        cards.forEach(({ card, food }, i) => {
          card.setAttribute('aria-pressed', String(chosen.includes(food.id)));
          card.classList.toggle('focus', i === focus);
        });
      };
      const toggle = (id: string, card: HTMLElement) => {
        if (chosen.includes(id)) chosen = chosen.filter((c) => c !== id);
        else if (chosen.length < PICKS) chosen.push(id);
        opts.sfx('click');
        if (!opts.reducedMotion) gsap.fromTo(card, { scale: 0.96 }, { scale: 1, duration: 0.2, ease: 'back.out(3)' });
        sync();
        if (chosen.length === PICKS) {
          shell.say(`${PICKS} chosen. Carry it to the table.`);
          if (opts.oneButton) shell.later(() => carryTray(), 700);
          else done.focus();
        }
      };
      sync();
      cards[0].card.focus();
      let acc = 0;
      shell.stage(
        opts.oneButton
          ? (dt) => {
              acc += dt;
              if (acc >= t.pickCycle * timing) {
                acc = 0;
                focus = (focus + 1) % cards.length;
                cards[focus].card.focus();
                sync();
              }
            }
          : null,
        (k) => {
          if (k === 'left' || k === 'right') {
            focus = (focus + (k === 'left' ? -1 : 1) + cards.length) % cards.length;
            cards[focus].card.focus();
            sync();
          } else if (k === 'act') {
            const active = cards.findIndex((c) => c.card === document.activeElement);
            if (active >= 0) focus = active;
            toggle(cards[focus].food.id, cards[focus].card);
          }
        },
        '.mg-card',
      );
    };

    // --- Stage 3: carry the tray ----------------------------------------------------
    const carryTray = () => {
      if (chosen.length === 0) chosen = defaultPicks(opts.menu, opts.favourites);
      shell.title.textContent = 'Carry the tray';
      shell.help.textContent = opts.oneButton
        ? 'Hold your button to steady the tray when it starts to tip.'
        : 'Keep the tray level with left and right (A and D, or the stick).';
      const plates = chosen.map((id) => {
        const food = opts.menu.find((f) => f.id === id)!;
        const thumb = foodThumbnail(food);
        const p = h('span', { class: 'mg-plate', attrs: { title: food.name } }, thumb ? h('img', { attrs: { src: thumb, alt: '' } }) : null);
        return p;
      });
      const tray = h('div', { class: 'mg-tray', attrs: { 'aria-hidden': 'true' } }, ...plates);
      const level = h(
        'div',
        { class: 'mg-level', attrs: { role: 'meter', 'aria-label': 'Tray tilt', 'aria-valuemin': '-100', 'aria-valuemax': '100' } },
        h('span', { class: 'mg-level-safe', text: 'level' }),
        h('span', { class: 'mg-level-dot' }),
      );
      const progress = h('div', { class: 'mg-progress', attrs: { role: 'progressbar', 'aria-label': 'Distance to the table', 'aria-valuemin': '0', 'aria-valuemax': '100' } }, h('span'));
      const note = h('p', { class: 'mg-feedback', attrs: { 'aria-live': 'polite' } });
      shell.body.replaceChildren(h('div', { class: 'mg-stage' }, tray), level, progress, note);
      shell.actions.replaceChildren();
      const duration = t.carrySeconds * (opts.relaxed ? 0.8 : 1);
      let elapsed = 0;
      let tilt = 0;
      let vel = 0;
      let wobbleCooldown = 0;
      let lastWords = '';
      const seed = Math.random() * 100;
      shell.stage((dt) => {
        elapsed += dt;
        const drift = (Math.sin(elapsed * 1.3 + seed) + Math.sin(elapsed * 2.1 + seed * 1.7) * 0.6) * (t.carryDrift / timing);
        let control = 0;
        if (opts.oneButton) control = shell.held('act') ? -Math.sign(tilt) * t.carryControl : 0;
        else control = ((shell.held('left') ? -1 : 0) + (shell.held('right') ? 1 : 0)) * t.carryControl;
        vel += (drift + control - tilt * 0.6) * dt;
        vel *= 1 - Math.min(1, dt * 2.2);
        tilt = Math.max(-1.2, Math.min(1.2, tilt + vel * dt * 2));
        wobbleCooldown -= dt;
        if (Math.abs(tilt) > 1 && wobbleCooldown <= 0) {
          wobbles++;
          wobbleCooldown = 1.2;
          tilt *= 0.4;
          vel = -vel * 0.3;
          opts.sfx('click');
          note.textContent = wobbles === 1 ? 'Whoa! Steady… everything survives.' : 'Another wobble! Everyone gasps. Nothing falls.';
          shell.say(note.textContent);
          if (!opts.reducedMotion) gsap.fromTo(tray, { x: -6 }, { x: 0, duration: 0.3, ease: 'elastic.out(1, 0.3)' });
        }
        tray.style.transform = `rotate(${tilt * 14}deg)`;
        (level.querySelector('.mg-level-dot') as HTMLElement).style.left = `${50 + tilt * 40}%`;
        level.setAttribute('aria-valuenow', String(Math.round(tilt * 100)));
        const words = Math.abs(tilt) < 0.25 ? 'Level' : tilt < 0 ? 'Tipping left' : 'Tipping right';
        if (words !== lastWords) {
          lastWords = words;
          level.setAttribute('aria-valuetext', words);
        }
        const pct = Math.min(100, (elapsed / duration) * 100);
        (progress.firstElementChild as HTMLElement).style.width = `${pct}%`;
        progress.setAttribute('aria-valuenow', String(Math.round(pct)));
        if (elapsed >= duration) {
          shell.stage(null, null);
          opts.sfx('cheer');
          note.textContent = wobbles === 0 ? 'Not a drop spilled. The table applauds.' : 'Made it! A little wobbly, completely delicious.';
          shell.say(note.textContent);
          shell.later(() => shell.finish(false), opts.reducedMotion ? 500 : 1200);
        }
      }, null);
    };

    intro();
  });
}
