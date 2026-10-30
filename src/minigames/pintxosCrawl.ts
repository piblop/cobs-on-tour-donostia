import gsap from 'gsap';
import type { CrewId, FoodDef } from '../data/types.ts';
import { minigameTuning } from '../data/tuning.ts';
import { button, h, trapFocus } from '../ui/dom.ts';

/**
 * Pintxos Crawl: catch the bartender's eye, choose dishes to share, and carry
 * the tray back without a wobble. Forgiving by design: missing is funny, never
 * a failure, and skipping gives the same progression.
 */
export interface CrawlOptions {
  menu: FoodDef[];
  favourites: Record<CrewId, string[]>;
  relaxed: boolean;
  oneButton: boolean;
  reducedMotion: boolean;
  sfx: (kind: 'click' | 'open' | 'close' | 'discover' | 'cheer' | 'switch') => void;
}

export interface CrawlResult {
  skipped: boolean;
  practiced: boolean;
  chosen: string[];
  wobbles: number;
  eyeTries: number;
}

const PICKS = 3;

/** Pick sensible dishes when the player skips: one favourite each, then house picks. */
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

type Key = 'act' | 'left' | 'right' | 'back';

export function playPintxosCrawl(root: HTMLElement, opts: CrawlOptions): Promise<CrawlResult> {
  return new Promise((resolve) => {
    const t = minigameTuning.crawl;
    const timing = opts.relaxed ? t.relaxedScale : 1;
    let practiced = false;
    let eyeTries = 0;
    let wobbles = 0;
    let chosen: string[] = [];
    let raf = 0;
    let stageKey: ((k: Key) => void) | null = null;
    let finished = false;
    const padPrev = new Map<number, boolean>();

    const body = h('div', { class: 'mg-body' });
    const title = h('h2', { class: 'mg-title', id: 'mg-title' });
    const help = h('p', { class: 'mg-help' });
    const skip = button('Skip: let the crew choose', () => finish(true), 'btn quiet');
    const panel = h(
      'div',
      { class: 'mg paper', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mg-title' } },
      title,
      help,
      body,
      h('div', { class: 'mg-foot' }, skip),
    );
    const layer = h('div', { class: 'mg-layer' }, panel);
    const live = h('div', { class: 'visually-hidden', attrs: { 'aria-live': 'assertive' } });
    panel.append(live);
    root.append(layer);
    const release = trapFocus(panel);
    gsap.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    if (!opts.reducedMotion) gsap.fromTo(panel, { y: 30, rotate: -2 }, { y: 0, rotate: -0.5, duration: 0.45, ease: 'back.out(1.5)' });

    const say = (text: string) => {
      live.textContent = text;
    };

    // Keys and controller, captured so the game underneath never sees them.
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Key> = {
        Space: 'act',
        KeyE: 'act',
        Enter: 'act',
        ArrowLeft: 'left',
        KeyA: 'left',
        ArrowRight: 'right',
        KeyD: 'right',
        Escape: 'back',
      };
      const k = map[e.code];
      if (!k) return;
      // Let Space/Enter press focused buttons normally.
      if ((e.code === 'Space' || e.code === 'Enter') && e.target instanceof HTMLButtonElement && !stageKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat && k === 'act') return;
      if (k === 'back') return finish(true);
      stageKey?.(k);
    };
    const held = { left: false, right: false, act: false };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') held.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') held.right = false;
      if (e.code === 'Space' || e.code === 'KeyE') held.act = false;
    };
    const onKeyDownHeld = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') held.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') held.right = true;
      if (e.code === 'Space' || e.code === 'KeyE') held.act = true;
    };
    window.addEventListener('keydown', onKeyDownHeld, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);

    const pollPad = () => {
      const pad = (navigator.getGamepads?.() ?? []).find((p) => p && p.connected) ?? null;
      if (!pad) return;
      const edges: Array<[number, Key]> = [
        [0, 'act'],
        [1, 'back'],
        [14, 'left'],
        [15, 'right'],
      ];
      for (const [i, k] of edges) {
        const p = !!pad.buttons[i]?.pressed;
        if (p && !padPrev.get(i)) {
          if (k === 'back') finish(true);
          else stageKey?.(k);
        }
        padPrev.set(i, p);
      }
      const x = pad.axes[0] ?? 0;
      held.left = held.left || x < -0.4 || !!pad.buttons[14]?.pressed;
      held.right = held.right || x > 0.4 || !!pad.buttons[15]?.pressed;
      held.act = held.act || !!pad.buttons[0]?.pressed;
    };

    const loop = (fn: (dt: number) => void) => {
      cancelAnimationFrame(raf);
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        pollPad();
        fn(dt);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    // --- Intro -------------------------------------------------------------------
    const intro = () => {
      cancelAnimationFrame(raf);
      stageKey = null;
      title.textContent = 'Pintxos Crawl';
      help.textContent = 'Three little steps: catch the bartender’s eye, choose dishes to share, carry the tray back without a wobble.';
      const play = button('Play', () => catchEye(false), 'btn primary');
      body.replaceChildren(
        h(
          'ol',
          { class: 'mg-steps' },
          h('li', { text: 'Wave when the bartender looks your way.' }),
          h('li', { text: `Pick ${PICKS} things to share.` }),
          h('li', { text: opts.oneButton ? 'Tap to steady the tray.' : 'Keep the tray level: left and right.' }),
        ),
        h('div', { class: 'mg-actions' }, play, button('Practice first', () => catchEye(true))),
        h('p', { class: 'mg-note', text: 'No pressure: misses are funny, never failures. Esc skips at any time.' }),
      );
      play.focus();
    };

    // --- Stage 1: catch the bartender's eye -------------------------------------
    const catchEye = (practice: boolean) => {
      if (practice) practiced = true;
      title.textContent = practice ? 'Practice: catch the eye' : 'Catch the bartender’s eye';
      help.textContent = opts.oneButton
        ? 'Press your button when the marker is in the middle.'
        : 'Press Space, E or A when the marker reaches the middle and the bartender looks your way.';
      const face = h('div', { class: 'mg-bartender', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'eye l' }), h('span', { class: 'eye r' }), h('span', { class: 'mouth' }));
      const marker = h('span', { class: 'mg-marker' });
      const zone = h('span', { class: 'mg-zone', text: 'now' });
      const track = h('div', { class: 'mg-track', attrs: { 'aria-hidden': 'true' } }, zone, marker);
      const wave = button('Wave!', () => stageKey?.('act'), 'btn primary');
      const note = h('p', { class: 'mg-feedback', attrs: { 'aria-live': 'polite' } });
      body.replaceChildren(h('div', { class: 'mg-counter' }, face), track, h('div', { class: 'mg-actions' }, wave), note);
      wave.focus();
      const half = (opts.relaxed ? t.eyeWindowRelaxed : t.eyeWindow) / 2;
      zone.style.left = `${(0.5 - half) * 100}%`;
      zone.style.width = `${half * 2 * 100}%`;
      let phase = 0;
      let misses = 0;
      let locked = false;
      loop((dt) => {
        phase = (phase + (dt * t.eyeSpeed) / timing) % 2;
        const pos = phase < 1 ? phase : 2 - phase;
        marker.style.left = `${pos * 100}%`;
        const looking = Math.abs(pos - 0.5) < half;
        face.classList.toggle('looking', looking);
      });
      const lines = [
        'Huw waves a bit too hard. The bartender pretends not to see.',
        'Annette tries a polite little wave. Nothing yet.',
        'Romy just stares meaningfully. Almost.',
      ];
      stageKey = (k) => {
        if (k !== 'act' || locked) return;
        const pos = phase < 1 ? phase : 2 - phase;
        if (!practice) eyeTries++;
        if (Math.abs(pos - 0.5) < half) {
          locked = true;
          opts.sfx('discover');
          note.textContent = 'Got it! The bartender grins and comes over.';
          say(note.textContent);
          face.classList.add('happy');
          window.setTimeout(() => (practice ? intro() : chooseDishes()), opts.reducedMotion ? 400 : 900);
        } else {
          misses++;
          opts.sfx('click');
          if (misses >= t.eyeMaxMisses && !practice) {
            locked = true;
            note.textContent = 'The bartender spots Huw’s enthusiastic waving anyway and laughs. Close enough!';
            say(note.textContent);
            face.classList.add('happy');
            window.setTimeout(() => chooseDishes(), opts.reducedMotion ? 600 : 1400);
          } else {
            note.textContent = lines[(misses - 1) % lines.length];
            say(note.textContent);
          }
        }
      };
    };

    // --- Stage 2: choose dishes ----------------------------------------------------
    const chooseDishes = () => {
      cancelAnimationFrame(raf);
      title.textContent = 'Choose dishes to share';
      help.textContent = opts.oneButton
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
        const card = h(
          'button',
          { class: 'mg-card', attrs: { type: 'button', 'aria-pressed': 'false' } },
          h('span', { class: 'mg-swatch', attrs: { 'aria-hidden': 'true' } }),
          h('strong', { text: food.name }),
          food.localName ? h('em', { text: food.localName }) : null,
          h('span', { class: 'mg-desc', text: food.description }),
          fav ? h('span', { class: 'mg-tag', text: `★ ${fav[0].toUpperCase()}${fav.slice(1)}’s favourite` }) : null,
          food.alcoholFree ? null : h('span', { class: 'mg-tag soft', text: 'Contains alcohol' }),
        );
        (card.querySelector('.mg-swatch') as HTMLElement).style.background = `linear-gradient(135deg, ${food.colours.base}, ${food.colours.topping})`;
        card.addEventListener('click', () => toggle(food.id, card));
        return { card, food };
      });
      const count = h('p', { class: 'mg-count', attrs: { 'aria-live': 'polite' } });
      const done = button('Carry it to the table', () => carryTray(), 'btn primary');
      const grid = h('div', { class: 'mg-cards' }, ...cards.map((c) => c.card));
      body.replaceChildren(grid, count, h('div', { class: 'mg-actions' }, done));
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
          say(`${PICKS} chosen. Carry it to the table.`);
          if (opts.oneButton) window.setTimeout(() => carryTray(), 700);
          else done.focus();
        }
      };
      sync();
      cards[0].card.focus();
      if (opts.oneButton) {
        let acc = 0;
        loop((dt) => {
          acc += dt;
          if (acc >= t.pickCycle * timing) {
            acc = 0;
            focus = (focus + 1) % cards.length;
            cards[focus].card.focus();
            sync();
          }
        });
      }
      stageKey = (k) => {
        if (k === 'left' || k === 'right') {
          focus = (focus + (k === 'left' ? -1 : 1) + cards.length) % cards.length;
          cards[focus].card.focus();
          sync();
        } else if (k === 'act') {
          const active = cards.findIndex((c) => c.card === document.activeElement);
          if (active >= 0) focus = active;
          toggle(cards[focus].food.id, cards[focus].card);
        }
      };
    };

    // --- Stage 3: carry the tray ----------------------------------------------------
    const carryTray = () => {
      if (chosen.length === 0) chosen = defaultPicks(opts.menu, opts.favourites);
      cancelAnimationFrame(raf);
      stageKey = null;
      title.textContent = 'Carry the tray';
      help.textContent = opts.oneButton
        ? 'Hold your button to steady the tray when it starts to tip.'
        : 'Keep the tray level with left and right (A and D, or the stick).';
      const plates = chosen.map((id) => {
        const food = opts.menu.find((f) => f.id === id)!;
        const p = h('span', { class: 'mg-plate', attrs: { title: food.name } });
        p.style.background = `radial-gradient(circle at 40% 40%, ${food.colours.topping}, ${food.colours.base} 60%, #fbfaf6 62%)`;
        return p;
      });
      const tray = h('div', { class: 'mg-tray', attrs: { 'aria-hidden': 'true' } }, ...plates);
      const level = h('div', { class: 'mg-level', attrs: { role: 'meter', 'aria-label': 'Tray tilt', 'aria-valuemin': '-100', 'aria-valuemax': '100' } }, h('span', { class: 'mg-level-safe' }), h('span', { class: 'mg-level-dot' }));
      const progress = h('div', { class: 'mg-progress', attrs: { role: 'progressbar', 'aria-label': 'Distance to the table', 'aria-valuemin': '0', 'aria-valuemax': '100' } }, h('span'));
      const note = h('p', { class: 'mg-feedback', attrs: { 'aria-live': 'polite' } });
      body.replaceChildren(h('div', { class: 'mg-stage' }, tray), level, progress, note);
      const duration = t.carrySeconds * (opts.relaxed ? 0.8 : 1);
      let elapsed = 0;
      let tilt = 0;
      let vel = 0;
      let wobbleCooldown = 0;
      const seed = Math.random() * 100;
      loop((dt) => {
        elapsed += dt;
        // Smooth, wandering push that the player has to answer.
        const drift = (Math.sin(elapsed * 1.3 + seed) + Math.sin(elapsed * 2.1 + seed * 1.7) * 0.6) * (t.carryDrift / timing);
        let control = 0;
        if (opts.oneButton) control = held.act ? -Math.sign(tilt) * t.carryControl : 0;
        else control = (held.left ? -1 : 0) + (held.right ? 1 : 0);
        if (!opts.oneButton) control *= t.carryControl;
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
          say(note.textContent);
          if (!opts.reducedMotion) gsap.fromTo(tray, { x: -6 }, { x: 0, duration: 0.3, ease: 'elastic.out(1, 0.3)' });
        }
        tray.style.transform = `rotate(${tilt * 14}deg)`;
        (level.querySelector('.mg-level-dot') as HTMLElement).style.left = `${50 + tilt * 40}%`;
        level.setAttribute('aria-valuenow', String(Math.round(tilt * 100)));
        const pct = Math.min(100, (elapsed / duration) * 100);
        (progress.firstElementChild as HTMLElement).style.width = `${pct}%`;
        progress.setAttribute('aria-valuenow', String(Math.round(pct)));
        if (elapsed >= duration) {
          cancelAnimationFrame(raf);
          opts.sfx('cheer');
          note.textContent = wobbles === 0 ? 'Not a drop spilled. The table applauds.' : 'Made it! A little wobbly, completely delicious.';
          say(note.textContent);
          window.setTimeout(() => finish(false), opts.reducedMotion ? 500 : 1200);
        }
      });
    };

    const finish = (skipped: boolean) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', onKeyDownHeld, true);
      window.removeEventListener('keyup', onKeyUp, true);
      release();
      if (skipped && chosen.length === 0) chosen = defaultPicks(opts.menu, opts.favourites);
      gsap.to(layer, {
        opacity: 0,
        duration: opts.reducedMotion ? 0.1 : 0.25,
        onComplete: () => {
          layer.remove();
          resolve({ skipped, practiced, chosen, wobbles, eyeTries });
        },
      });
    };

    intro();
  });
}
