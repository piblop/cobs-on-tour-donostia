/**
 * Content validation. Runs in the dev server at startup, in `npm run validate`,
 * in unit tests and as a build step (see vite.config.ts).
 */
import { areas, locations } from './locations.ts';
import { crew, playerDefaultId } from './crew.ts';
import { foods } from './foods.ts';
import { bars } from './restaurants.ts';
import { wishes } from './wishes.ts';
import { banter } from './banter.ts';
import type { FactCheck } from './types.ts';

export interface ContentIssue {
  table: string;
  id: string;
  message: string;
}

/** Generous world rectangle every authored coordinate must sit inside. */
export const WORLD_BOUNDS = { minX: -170, maxX: 180, minZ: -110, maxZ: 90 } as const;

function inWorld(x: number, z: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    x >= WORLD_BOUNDS.minX &&
    x <= WORLD_BOUNDS.maxX &&
    z >= WORLD_BOUNDS.minZ &&
    z <= WORLD_BOUNDS.maxZ
  );
}

function checkUnique(table: string, ids: string[], issues: ContentIssue[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || !/^[a-z0-9-]+$/.test(id)) issues.push({ table, id, message: 'id must be lowercase kebab-case' });
    if (seen.has(id)) issues.push({ table, id, message: 'duplicate id' });
    seen.add(id);
  }
}

function checkFact(table: string, id: string, fact: FactCheck, issues: ContentIssue[]): void {
  if (!fact.text.trim()) issues.push({ table, id, message: 'fact text is empty' });
  if (!fact.source.trim()) issues.push({ table, id, message: 'fact source is empty (use "unsourced")' });
  if (typeof fact.needsReview !== 'boolean') issues.push({ table, id, message: 'needsReview must be a boolean' });
}

export function validateContent(): ContentIssue[] {
  const issues: ContentIssue[] = [];

  checkUnique('areas', areas.map((a) => a.id), issues);
  for (const a of areas) {
    if (!a.name.trim()) issues.push({ table: 'areas', id: a.id, message: 'name is empty' });
    const b = a.bounds;
    if (!(b.minX < b.maxX && b.minZ < b.maxZ)) issues.push({ table: 'areas', id: a.id, message: 'bounds are inverted' });
    if (!inWorld(b.minX, b.minZ) || !inWorld(b.maxX, b.maxZ))
      issues.push({ table: 'areas', id: a.id, message: 'bounds outside the world' });
  }

  const areaIds = new Set(areas.map((a) => a.id));
  checkUnique('locations', locations.map((l) => l.id), issues);
  for (const l of locations) {
    const t = 'locations';
    if (!areaIds.has(l.area)) issues.push({ table: t, id: l.id, message: `unknown area "${l.area}"` });
    for (const [field, value] of [
      ['name', l.name],
      ['actionLabel', l.actionLabel],
      ['polaroidCaption', l.polaroidCaption],
    ] as const) {
      if (!value.trim()) issues.push({ table: t, id: l.id, message: `${field} is empty` });
    }
    if (!inWorld(l.position.x, l.position.z)) issues.push({ table: t, id: l.id, message: 'position outside the world' });
    if (!inWorld(l.shot.position.x, l.shot.position.z) || !inWorld(l.shot.target.x, l.shot.target.z))
      issues.push({ table: t, id: l.id, message: 'camera shot outside the world' });
    if (!(l.interactRadius > 0.5 && l.interactRadius < 8))
      issues.push({ table: t, id: l.id, message: 'interactRadius should be between 0.5 and 8' });
    checkFact(t, l.id, l.fact, issues);
  }

  checkUnique('crew', crew.map((c) => c.id), issues);
  if (crew.length !== 4) issues.push({ table: 'crew', id: '*', message: 'the crew must have exactly four friends' });
  if (!crew.some((c) => c.id === playerDefaultId))
    issues.push({ table: 'crew', id: playerDefaultId, message: 'default player is not in the crew' });
  for (const c of crew) {
    if (!c.name.trim() || /\s/.test(c.name.trim()))
      issues.push({ table: 'crew', id: c.id, message: 'use a first name only' });
    for (const [k, v] of Object.entries(c.colors)) {
      if (!/^#[0-9a-f]{6}$/i.test(v)) issues.push({ table: 'crew', id: c.id, message: `colour ${k} must be #rrggbb` });
    }
    if (c.catchphrases.length === 0) issues.push({ table: 'crew', id: c.id, message: 'needs at least one catchphrase' });
  }

  const crewIds = new Set(crew.map((c) => c.id));
  const barIds = new Set(bars.map((b) => b.id));
  const foodIds = new Set(foods.map((f) => f.id));

  checkUnique('foods', foods.map((f) => f.id), issues);
  for (const food of foods) {
    const t = 'foods';
    if (!barIds.has(food.barId)) issues.push({ table: t, id: food.id, message: `unknown bar "${food.barId}"` });
    if (!food.name.trim() || !food.description.trim()) issues.push({ table: t, id: food.id, message: 'name and description are required' });
    for (const id of crewIds) {
      if (!food.reactions[id]?.trim()) issues.push({ table: t, id: food.id, message: `missing reaction for ${id}` });
    }
    for (const [k, v] of Object.entries(food.colours)) {
      if (!/^#[0-9a-f]{6}$/i.test(v)) issues.push({ table: t, id: food.id, message: `colour ${k} must be #rrggbb` });
    }
    checkFact(t, food.id, food.fact, issues);
  }
  if (!foods.some((f) => f.alcoholFree && f.model === 'drink')) issues.push({ table: 'foods', id: '*', message: 'needs at least one alcohol-free drink' });

  checkUnique('bars', bars.map((b) => b.id), issues);
  for (const bar of bars) {
    if (!inWorld(bar.door.x, bar.door.z)) issues.push({ table: 'bars', id: bar.id, message: 'door outside the world' });
    if (bar.menu.length === 0) issues.push({ table: 'bars', id: bar.id, message: 'menu is empty' });
    for (const m of bar.menu) if (!foodIds.has(m)) issues.push({ table: 'bars', id: bar.id, message: `menu item "${m}" is not a food` });
  }

  checkUnique('wishes', wishes.map((w) => w.id), issues);
  for (const w of wishes) {
    if (!crewIds.has(w.friend)) issues.push({ table: 'wishes', id: w.id, message: `unknown friend "${w.friend}"` });
    if ('food' in w.done && !foodIds.has(w.done.food)) issues.push({ table: 'wishes', id: w.id, message: `unknown food "${w.done.food}"` });
    if ('memory' in w.done && !/^[a-z]+:[a-z0-9-]+$/.test(w.done.memory)) issues.push({ table: 'wishes', id: w.id, message: 'memory key must look like kind:id' });
  }
  for (const id of crewIds) {
    if (!wishes.some((w) => w.friend === id)) issues.push({ table: 'wishes', id, message: 'every friend needs at least one wish' });
  }

  checkUnique('banter', banter.map((l) => l.id), issues);
  for (const line of banter) {
    if (line.beats.length === 0) issues.push({ table: 'banter', id: line.id, message: 'needs at least one beat' });
    for (const b of line.beats) if (!b.text.trim()) issues.push({ table: 'banter', id: line.id, message: 'empty beat' });
    if (line.context === 'callback' && !line.requiresMemory) issues.push({ table: 'banter', id: line.id, message: 'callbacks need requiresMemory' });
  }

  return issues;
}

export function formatIssues(issues: ContentIssue[]): string {
  return issues.map((i) => `  - [${i.table}] ${i.id}: ${i.message}`).join('\n');
}

/** Every player-visible real-world claim, for docs/FACT_CHECK.md. */
export function collectFacts(): Array<{ table: string; id: string; name: string; fact: FactCheck }> {
  return [
    ...locations.map((l) => ({ table: 'locations', id: l.id, name: l.name, fact: l.fact })),
    ...foods.map((f) => ({ table: 'foods', id: f.id, name: f.name, fact: f.fact })),
  ];
}
