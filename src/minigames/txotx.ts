import gsap from 'gsap';
import type { CrewId } from '../data/types.ts';
import { minigameTuning } from '../data/tuning.ts';
import { button, h, trapFocus } from '../ui/dom.ts';
import { MinigameShell, type ShellOptions } from './shell.ts';

/**
 * Txotx!: when someone shouts, catch the arc of cider from the barrel in your
 * glass. Splashes are funny, never failures. One round per friend.
 */
export interface TxotxResult {
  skipped: boolean;
  /** 0..1 fill per round. */
  fills: number[];
  splashes: number;
}

const ORDER: Array<{ id: CrewId; name: string; colour: string }> = [
  { id: 'huw', name: 'Huw', colour: '#6f86c9' },
  { id: 'annette', name: 'Annette', colour: '#7cc4a4' },
  { id: 'romy', name: 'Romy', colour: '#f0b84c' },
  { id: 'paulo', name: 'Paulo', colour: '#e9846b' },
];

const SVG = 'http://www.w3.org/2000/svg';

export function playTxotx(root: HTMLElement, opts: ShellOptions): Promise<TxotxResult> {
  return new Promise((resolve) => {
    const t = minigameTuning.txotx;
    const timing = opts.relaxed ? t.relaxedScale : 1;
    const fills: number[] = [];
    let splashes = 0;
    const shell = new MinigameShell(
      root,
      opts,
      (skipped) => resolve({ skipped, fills: skipped && fills.length === 0 ? [0.8, 0.8, 0.8, 0.8] : fills, splashes }),
      'Skip: just pour me a glass',
    );
    shell.onFinish = trapFocus(shell.panel);

    const intro = () => {
      shell.stage(null, null);
      shell.title.textContent = 'Txotx!';
      shell.help.textContent = 'When someone shouts “Txotx!”, the barrel opens. Catch the arc of cider in your glass.';
      const play = button('Play', () => round(0, false), 'btn primary');
      shell.body.replaceChildren(
        h(
          'ol',
          { class: 'mg-steps' },
          h('li', { text: opts.oneButton ? 'Your glass follows the stream by itself. Hold your button to catch.' : 'Move your glass left and right to stay under the stream.' }),
          h('li', { text: 'The pressure wobbles, so the arc lands near and far.' }),
          h('li', { text: 'One round each. Splashes are part of the fun.' }),
        ),
      );
      shell.actions.replaceChildren(play, button('Practice first', () => round(0, true)));
      play.focus();
    };

    const round = (i: number, practice: boolean) => {
      const who = ORDER[i];
      shell.title.textContent = practice ? 'Practice pour' : `${who.name}: “Txotx!”`;
      shell.help.textContent = opts.oneButton ? 'Hold Space, E or A to catch.' : 'Left and right (A and D, or the stick) to move your glass.';
      const svg = document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 400 200');
      svg.setAttribute('class', 'tx-scene');
      svg.setAttribute('aria-hidden', 'true');
      const barrel = document.createElementNS(SVG, 'g');
      const rect = (x: number, y: number, w: number, hh: number, fill: string, rx = 0) => {
        const r = document.createElementNS(SVG, 'rect');
        for (const [k, v] of Object.entries({ x, y, width: w, height: hh, fill, rx })) r.setAttribute(k, String(v));
        return r;
      };
      barrel.append(rect(6, 40, 70, 110, '#8a5a32', 18), rect(6, 60, 70, 8, '#4a3328'), rect(6, 120, 70, 8, '#4a3328'), rect(70, 92, 18, 8, '#4a3328', 2));
      const stream = document.createElementNS(SVG, 'path');
      stream.setAttribute('fill', 'none');
      stream.setAttribute('stroke', '#e8cf7a');
      stream.setAttribute('stroke-width', '5');
      stream.setAttribute('stroke-linecap', 'round');
      const floor = rect(0, 186, 400, 14, '#c9a27a');
      svg.append(floor, barrel, stream);
      const glass = h('div', { class: 'tx-glass', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'tx-fill' }));
      const stage = h('div', { class: 'tx-stage' }, svg, glass);
      const meter = h('div', { class: 'mg-progress', attrs: { role: 'progressbar', 'aria-label': 'How full the glass is', 'aria-valuemin': '0', 'aria-valuemax': '100' } }, h('span'));
      const note = h('p', { class: 'mg-feedback', attrs: { 'aria-live': 'polite' } });
      shell.body.replaceChildren(stage, meter, note);
      shell.actions.replaceChildren();
      shell.say(`${who.name} shouts Txotx! The barrel is open.`);
      opts.sfx('open');
      if (!opts.reducedMotion) gsap.fromTo(stage, { scale: 0.97 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });

      let elapsed = 0;
      let glassX = 0.55;
      let fill = 0;
      let splashCooldown = 0;
      const duration = t.roundSeconds * (opts.relaxed ? 1.2 : 1);
      const width = (opts.relaxed ? t.glassWidthRelaxed : t.glassWidth) / 2;
      const seed = Math.random() * 10;
      shell.stage((dt) => {
        elapsed += dt;
        // Pressure wobbles: the arc lands nearer and farther.
        const land = 0.62 + Math.sin(elapsed * (t.wobbleSpeed / timing) + seed) * 0.17 + Math.sin(elapsed * 2.3 + seed) * 0.04;
        if (opts.oneButton) glassX += (land - glassX) * Math.min(1, dt * 2.6);
        else {
          const dir = (shell.held('left') ? -1 : 0) + (shell.held('right') ? 1 : 0);
          glassX = Math.max(0.3, Math.min(0.95, glassX + dir * dt * t.glassSpeed));
        }
        const catching = opts.oneButton ? shell.held('act') : true;
        const under = Math.abs(glassX - land) < width;
        if (under && catching) fill = Math.min(1, fill + dt / (duration * 0.55));
        else if (!under) {
          splashCooldown -= dt;
          if (splashCooldown <= 0 && catching) {
            splashCooldown = 1.6;
            splashes++;
            const lines = ['Splash! Huw’s shoes are now cider shoes.', 'A little on the floor. That is tradition, surely.', 'Most of it went in. Some of it went on Paulo.'];
            note.textContent = lines[splashes % lines.length];
            shell.say(note.textContent);
          }
        }
        const lx = land * 400;
        stream.setAttribute('d', `M 88 96 Q ${(88 + lx) / 2} 60 ${lx} 175`);
        glass.style.left = `${glassX * 100}%`;
        (glass.firstElementChild as HTMLElement).style.height = `${fill * 100}%`;
        (meter.firstElementChild as HTMLElement).style.width = `${fill * 100}%`;
        meter.setAttribute('aria-valuenow', String(Math.round(fill * 100)));
        if (elapsed >= duration || fill >= 1) {
          shell.stage(null, null);
          if (!practice) fills.push(fill);
          opts.sfx(fill > 0.6 ? 'cheer' : 'click');
          note.textContent = fill > 0.85 ? 'A perfect pour! The whole table cheers.' : fill > 0.5 ? 'A good glass. Cheers!' : 'Half a glass and a happy floor. Txotx!';
          shell.say(note.textContent);
          shell.later(() => {
            if (practice) intro();
            else if (i + 1 < ORDER.length) round(i + 1, false);
            else shell.finish(false);
          }, opts.reducedMotion ? 500 : 1100);
        }
      }, null);
    };

    intro();
  });
}
