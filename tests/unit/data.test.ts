import { describe, expect, it } from 'vitest';
import { collectFacts, formatIssues, validateContent } from '../../src/data/validate.ts';
import { locations } from '../../src/data/locations.ts';
import { buildCollisionWorld } from '../../src/world/collisions.ts';

describe('content tables', () => {
  it('validate cleanly', () => {
    const issues = validateContent();
    expect(issues, formatIssues(issues)).toEqual([]);
  });

  it('flag every player-visible fact for review until a human checks it', () => {
    for (const f of collectFacts()) {
      expect(typeof f.fact.needsReview).toBe('boolean');
      expect(f.fact.source.length).toBeGreaterThan(0);
    }
  });

  it('place every discovery where the crew can actually stand', () => {
    const world = buildCollisionWorld();
    for (const l of locations) {
      expect(world.isFree(l.position.x, l.position.z, 0.34), l.id).toBe(true);
    }
  });
});

describe('usable spots', () => {
  it('keep benches reachable and clear of discoveries', async () => {
    const { Interactables } = await import('../../src/world/locations.ts');
    const world = buildCollisionWorld();
    const spots = new Interactables().spots;
    const discoveries = spots.filter((s) => s.kind === 'discovery');
    for (const b of spots.filter((s) => s.kind === 'bench')) {
      expect(world.isFree(b.x, b.z, 0.34), b.id).toBe(true);
      for (const d of discoveries) expect(Math.hypot(b.x - d.x, b.z - d.z), `${b.id} vs ${d.id}`).toBeGreaterThan(b.radius + d.radius);
    }
  });
});

describe('the wider city', () => {
  it('has no two usable spots fighting over the same patch of ground', async () => {
    const { Interactables } = await import('../../src/world/locations.ts');
    const world = buildCollisionWorld();
    const spots = new Interactables().spots;
    for (const s of spots) expect(world.isFree(s.x, s.z, 0.34), s.id).toBe(true);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i];
        const b = spots[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        expect(d, `${a.id} vs ${b.id}`).toBeGreaterThan(Math.max(a.radius, b.radius));
      }
    }
  });

  it('puts every encounter and travel arrival somewhere walkable', async () => {
    const { encounters } = await import('../../src/data/encounters.ts');
    const { travelLinks } = await import('../../src/world/travel.ts');
    const world = buildCollisionWorld();
    for (const e of encounters) expect(world.isFree(e.position.x, e.position.z, 0.34), e.id).toBe(true);
    for (const t of travelLinks()) expect(world.isFree(t.to.x, t.to.z, 0.34), t.id).toBe(true);
    expect(encounters.length).toBeGreaterThanOrEqual(10);
  });

  it('lets the crew walk from the old town over the bridge to Zurriola', async () => {
    const { createMover, stepMovement } = await import('../../src/crew/controller.ts');
    const world = buildCollisionWorld();
    const s = createMover(90, 4.5);
    const route = [
      { x: 101, z: 4.8 },
      { x: 110, z: 4.8 },
      { x: 110, z: 0.6 },
      { x: 122, z: 0.6 },
      { x: 122, z: -14 },
    ];
    for (const target of route) {
      for (let i = 0; i < 60 * 8; i++) {
        const dx = target.x - s.x;
        const dz = target.z - s.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.4) break;
        stepMovement(s, { x: dx / len, z: dz / len, brisk: true }, 1 / 60, world);
      }
    }
    expect(Math.hypot(s.x - 122, s.z + 14)).toBeLessThan(1);
  });
});
