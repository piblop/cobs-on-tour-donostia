import { describe, expect, it } from 'vitest';
import { sanitiseTrip, SAVE_VERSION, type TripData } from '../../src/engine/save.ts';
import { defaultPicks } from '../../src/minigames/pintxosCrawl.ts';
import { foods, foodById } from '../../src/data/foods.ts';
import { bars } from '../../src/data/restaurants.ts';
import { crew } from '../../src/data/crew.ts';
import { wishes } from '../../src/data/wishes.ts';
import { banter } from '../../src/data/banter.ts';
import type { CrewId } from '../../src/data/types.ts';

function sampleTrip(): TripData {
  return {
    version: SAVE_VERSION,
    savedAt: 1,
    day: 2,
    hour: 14.5,
    leader: 'annette',
    crew: [{ id: 'annette', x: 10, z: 5, heading: 1 }],
    discovered: ['la-concha-railing'],
    foods: [{ id: 'gilda', day: 1 }],
    memories: [{ key: 'ordered:three-cheesecakes', summary: 'Huw ordered three cheesecakes', where: 'Gazta', day: 1, hour: 21, who: ['huw'] }],
    needs: { huw: { hunger: 0.4, energy: 0.6, fun: 0.9 } },
    vibe: 62,
    banterPlayed: ['idle-map'],
    wishes: { day: 2, offered: ['huw-cheesecake'], pinned: ['huw-cheesecake'], done: [] },
    goal: null,
    flags: [],
    pages: [{ day: 1, moment: 'tasted:gilda', caption: 'Best night', photoIds: ['p1'], foods: ['Gilda'], memories: ['Tried gilda'] }],
    photos: [{ id: 'p1', day: 1, title: 'Dinner at Gozo Gozo' }],
    captions: { 'la-concha-railing': 'The best view' },
    favourites: ['gilda'],
    encounters: ['dog'],
    friendships: ['umbrella'],
  };
}

describe('saves', () => {
  it('round-trip through JSON unchanged', () => {
    const trip = sampleTrip();
    const back = sanitiseTrip(JSON.parse(JSON.stringify(trip)));
    expect(back).toEqual(trip);
  });

  it('reject data that is not a trip', () => {
    expect(sanitiseTrip(null)).toBeNull();
    expect(sanitiseTrip('hello')).toBeNull();
    expect(sanitiseTrip({ version: 99, leader: 'paulo' })).toBeNull();
    expect(sanitiseTrip({ version: 1, leader: 'mallory' })).toBeNull();
  });

  it('treat imported values as untrusted', () => {
    const evil = {
      ...sampleTrip(),
      day: 1e9,
      hour: -5,
      vibe: 9000,
      crew: [{ id: 'annette', x: 1e12, z: 'x', heading: 0 }, { id: '<script>', x: 0, z: 0 }],
      pages: [{ day: 1, moment: 5, caption: 'x'.repeat(10000), photoIds: [1, 'ok'] }],
    };
    const t = sanitiseTrip(evil)!;
    expect(t.day).toBe(99);
    expect(t.hour).toBe(0);
    expect(t.vibe).toBe(100);
    expect(t.crew).toHaveLength(1);
    expect(t.crew[0].x).toBe(200);
    expect(t.crew[0].z).toBe(0);
    expect(t.pages[0].caption.length).toBeLessThanOrEqual(160);
    expect(t.pages[0].moment).toBeNull();
    expect(t.pages[0].photoIds).toEqual(['ok']);
  });
});

describe('food content', () => {
  it('has the MLR food target and every bar serves real dishes', () => {
    expect(foods.length).toBeGreaterThanOrEqual(8);
    for (const bar of bars) for (const id of bar.menu) expect(foodById(id), `${bar.id}:${id}`).toBeDefined();
  });

  it('gives alcohol-free drinks the same warmth as the rest', () => {
    const free = foods.filter((f) => f.model === 'drink' && f.alcoholFree);
    expect(free.length).toBeGreaterThan(0);
    for (const f of free) for (const id of ['paulo', 'annette', 'huw', 'romy'] as CrewId[]) expect(f.reactions[id].length).toBeGreaterThan(10);
  });

  it('skipping the crawl still serves a full table', () => {
    const crawl = bars.find((b) => b.activity === 'crawl')!;
    const menu = crawl.menu.map((id) => foodById(id)!);
    const favs = Object.fromEntries(crew.map((c) => [c.id, c.favouriteFoods])) as Record<CrewId, string[]>;
    const picks = defaultPicks(menu, favs);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
  });
});

describe('wishes and callbacks', () => {
  it('every friend has a wish to offer', () => {
    for (const c of crew) expect(wishes.some((w) => w.friend === c.id)).toBe(true);
  });

  it('the three-cheesecakes joke only exists as a memory callback', () => {
    const lines = banter.filter((l) => l.beats.some((b) => b.text.toLowerCase().includes('three cheesecakes')));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.requiresMemory).toBe('ordered:three-cheesecakes');
  });
});
