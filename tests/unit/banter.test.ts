import { describe, expect, it } from 'vitest';
import { BanterDirector, PRIORITY, type SayEvent } from '../../src/crew/banter.ts';
import { banter } from '../../src/data/banter.ts';
import type { BanterLine } from '../../src/data/types.ts';

const info = (memories: string[] = [], subject?: 'paulo' | 'annette' | 'huw' | 'romy') => ({
  leader: 'paulo' as const,
  present: ['paulo', 'annette', 'huw', 'romy'] as Array<'paulo' | 'annette' | 'huw' | 'romy'>,
  subject,
  hasMemory: (k: string) => memories.includes(k),
});

function drain(d: BanterDirector, seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) d.update(0.1, [], info());
}

describe('banter content', () => {
  it('has at least 150 lines with unique ids', () => {
    expect(banter.length).toBeGreaterThanOrEqual(150);
    expect(new Set(banter.map((l) => l.id)).size).toBe(banter.length);
  });
});

describe('banter director', () => {
  it('never repeats a line within a session, then falls quiet', () => {
    const lines: BanterLine[] = [
      { id: 'a', context: 'idle', beats: [{ speaker: 'any', text: 'One' }] },
      { id: 'b', context: 'idle', beats: [{ speaker: 'any', text: 'Two' }] },
    ];
    const d = new BanterDirector(lines, () => 0.1);
    const said: string[] = [];
    d.onSay = (e: SayEvent) => said.push(e.lineId);
    for (let i = 0; i < 5; i++) {
      d.trigger('idle', info(), PRIORITY.ambient);
      drain(d, 10);
    }
    expect(said.sort()).toEqual(['a', 'b']);
  });

  it('does not let idle chatter talk over an important moment', () => {
    const lines: BanterLine[] = [
      { id: 'important', context: 'discover:x', beats: [{ speaker: 'paulo', text: 'Wow, a long and important thought.' }] },
      { id: 'idle', context: 'idle', beats: [{ speaker: 'huw', text: 'Hm.' }] },
    ];
    const d = new BanterDirector(lines);
    expect(d.trigger('discover:x', info(), PRIORITY.moment)).toBe(true);
    expect(d.trigger('idle', info(), PRIORITY.idle)).toBe(false);
  });

  it('only plays callbacks for things that really happened', () => {
    const lines: BanterLine[] = [
      { id: 'cb', context: 'callback', requiresMemory: 'ordered:three-cheesecakes', beats: [{ speaker: 'romy', text: 'Three cheesecakes, Huw.' }] },
    ];
    const d = new BanterDirector(lines);
    expect(d.trigger('callback', info())).toBe(false);
    expect(d.trigger('callback', info(['ordered:three-cheesecakes']))).toBe(true);
  });

  it('gives "subject" lines to the friend the moment is about', () => {
    const lines: BanterLine[] = [{ id: 'h', context: 'need:hungry', beats: [{ speaker: 'subject', text: 'Snack?' }] }];
    const d = new BanterDirector(lines);
    let who = '';
    d.onSay = (e) => (who = e.speaker);
    d.trigger('need:hungry', info([], 'huw'), PRIORITY.need);
    expect(who).toBe('huw');
  });

  it('respects context cooldowns', () => {
    const lines: BanterLine[] = [
      { id: '1', context: 'area:x', beats: [{ speaker: 'paulo', text: 'a' }] },
      { id: '2', context: 'area:x', beats: [{ speaker: 'paulo', text: 'b' }] },
    ];
    const d = new BanterDirector(lines);
    expect(d.trigger('area:x', info(), PRIORITY.ambient, 30)).toBe(true);
    d.interrupt();
    expect(d.trigger('area:x', info(), PRIORITY.ambient, 30)).toBe(false);
  });

  it('keeps every bubble readable for at least two seconds', () => {
    expect(BanterDirector.duration('Hi')).toBeGreaterThanOrEqual(2.2);
  });
});
