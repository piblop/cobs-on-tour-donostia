import { describe, expect, it } from 'vitest';
import { clockRate, formatClock, nightWindow, sunDirection, timeOfDay } from '../../src/world/dayNight.ts';
import { Needs } from '../../src/crew/needs.ts';
import { Vibe, VIBE_HIGH } from '../../src/crew/vibe.ts';
import { Memories } from '../../src/crew/memories.ts';
import { crew } from '../../src/data/crew.ts';
import { DEFAULT_SETTINGS, sanitiseSettings } from '../../src/engine/settings.ts';

describe('day and night', () => {
  it('names the parts of the day', () => {
    expect(timeOfDay(8)).toBe('morning');
    expect(timeOfDay(18.5)).toBe('golden');
    expect(timeOfDay(21)).toBe('dusk');
    expect(timeOfDay(2)).toBe('night');
  });

  it('stretches golden hour', () => {
    expect(clockRate(19)).toBeLessThan(clockRate(12));
  });

  it('formats the clock', () => {
    expect(formatClock(9.5)).toBe('09:30');
    expect(formatClock(23.99)).toBe('23:59');
  });

  it('keeps the sun above the horizon by day and sets in the west', () => {
    expect(sunDirection(13).y).toBeGreaterThan(0.6);
    const evening = sunDirection(20.5);
    expect(evening.x).toBeLessThan(0);
    expect(evening.y).toBeLessThan(0.2);
  });

  it('switches lamps on at dusk and off after dawn', () => {
    expect(nightWindow(14, 20.2, 21, 6.5, 7.2)).toBe(0);
    expect(nightWindow(23, 20.2, 21, 6.5, 7.2)).toBe(1);
    expect(nightWindow(3, 20.2, 21, 6.5, 7.2)).toBe(1);
    expect(nightWindow(8, 20.2, 21, 6.5, 7.2)).toBe(0);
  });
});

describe('needs and vibe', () => {
  it('suggest, but never nag twice in a row', () => {
    const n = new Needs(crew[0]);
    n.tick(8, 13, 0);
    const first = n.suggestion(20);
    expect(first).toBe('hungry');
    n.markNagged(first!, 20);
    expect(n.suggestion(21)).not.toBe('hungry');
    n.eat(1);
    expect(n.values.hunger).toBe(1);
  });

  it('vibe rises with good moments and is never judgemental', () => {
    const v = new Vibe();
    const start = v.value;
    v.add('discovery');
    v.add('sunset');
    expect(v.value).toBeGreaterThan(start);
    v.drift(100);
    expect(v.value).toBeGreaterThanOrEqual(45);
    while (v.value < VIBE_HIGH) v.add('meal');
    expect(v.checkHigh()).toBe(true);
    expect(v.checkHigh()).toBe(false);
  });
});

describe('memories', () => {
  it('only loads well-formed events from untrusted data', () => {
    const m = new Memories();
    m.load([
      { key: 'ok', summary: 'Fine', where: 'La Concha', day: 1, hour: 18, who: ['huw', 'mallory'] },
      { key: 3, summary: 'bad' },
      'nonsense',
    ]);
    expect(m.all()).toHaveLength(1);
    expect(m.all()[0].who).toEqual(['huw']);
  });
});

describe('settings', () => {
  it('sanitises stored preferences', () => {
    const s = sanitiseSettings({ textScale: 9, quality: 'ultra', volumes: { master: 5, music: -1 }, muted: 'yes' });
    expect(s.textScale).toBe(DEFAULT_SETTINGS.textScale);
    expect(s.quality).toBe('medium');
    expect(s.volumes.master).toBe(1);
    expect(s.volumes.music).toBe(0);
    expect(s.muted).toBe(false);
    expect(s.cameraShake).toBe(false);
  });
});
