import { describe, expect, it } from 'vitest';
import { CollisionWorld, buildCollisionWorld } from '../../src/world/collisions.ts';
import { createMover, stepMovement } from '../../src/crew/controller.ts';
import { STAIRS, bayPoint, groundY, PROMENADE_Y, projectToShore, shoreZ, spawnPoint } from '../../src/world/map.ts';

describe('shore geometry', () => {
  it('projects points back onto the curve', () => {
    for (const x0 of [-50, -10, 0, 20, 40]) {
      for (const d of [0, 5, 12, 19]) {
        const p = bayPoint(x0, d);
        const proj = projectToShore(p.x, p.z);
        expect(proj.x0).toBeCloseTo(x0, 3);
        expect(proj.d).toBeCloseTo(d, 3);
      }
    }
  });

  it('puts the promenade above the sand', () => {
    const promenade = bayPoint(0, 12);
    const sand = bayPoint(0, 4);
    expect(groundY(promenade.x, promenade.z)).toBe(PROMENADE_Y);
    expect(groundY(sand.x, sand.z)).toBeLessThan(0.4);
    expect(shoreZ(0)).toBeLessThan(promenade.z);
  });
});

describe('collision world', () => {
  it('slides along a wall instead of stopping dead', () => {
    const world = new CollisionWorld();
    world.addSegment(-10, 0, 10, 0);
    const s = createMover(0, 1);
    for (let i = 0; i < 60; i++) stepMovement(s, { x: 0.7, z: -0.7, brisk: false }, 1 / 60, world);
    expect(s.z).toBeGreaterThan(0.3); // never crossed
    expect(s.x).toBeGreaterThan(1.5); // kept sliding east
  });

  it('rounds convex corners without snagging', () => {
    const world = new CollisionWorld();
    world.addBox(0, 0, 4, 4, 0);
    const s = createMover(-3, -2.2);
    for (let i = 0; i < 120; i++) stepMovement(s, { x: 1, z: 0.05, brisk: false }, 1 / 60, world);
    expect(s.x).toBeGreaterThan(3); // made it past the box corner
  });

  it('steers around a small trunk instead of snagging on it', () => {
    const world = new CollisionWorld();
    world.addCircle(0, 0, 0.4);
    const s = createMover(-3, 0); // dead centre, walking straight at it
    for (let i = 0; i < 120; i++) stepMovement(s, { x: 1, z: 0, brisk: false }, 1 / 60, world);
    expect(s.x).toBeGreaterThan(2);
  });

  it('does not jitter sideways when walking straight into a wall', () => {
    const world = new CollisionWorld();
    world.addSegment(0, -10, 0, 10);
    const s = createMover(-2, 0);
    for (let i = 0; i < 120; i++) stepMovement(s, { x: 1, z: 0, brisk: false }, 1 / 60, world);
    expect(Math.abs(s.z)).toBeLessThan(0.05);
    expect(s.x).toBeLessThan(0);
  });

  it('spawns the crew somewhere free', () => {
    const world = buildCollisionWorld();
    const p = spawnPoint();
    expect(world.isFree(p.x, p.z, 0.34)).toBe(true);
  });

  it('lets the crew reach the sand down the stairs', () => {
    const world = buildCollisionWorld();
    const top = bayPoint(STAIRS[0].x0, 11);
    const s = createMover(top.x, top.z);
    const target = bayPoint(STAIRS[0].x0, 3);
    for (let i = 0; i < 60 * 6; i++) {
      const dx = target.x - s.x;
      const dz = target.z - s.z;
      const len = Math.hypot(dx, dz) || 1;
      stepMovement(s, { x: dx / len, z: dz / len, brisk: false }, 1 / 60, world);
    }
    expect(projectToShore(s.x, s.z).d).toBeLessThan(4.5);
  });

  it('keeps the crew out of the sea at the waterline', () => {
    const world = buildCollisionWorld();
    const start = bayPoint(-30, 3);
    const s = createMover(start.x, start.z);
    for (let i = 0; i < 60 * 8; i++) stepMovement(s, { x: 0, z: -1, brisk: true }, 1 / 60, world);
    expect(projectToShore(s.x, s.z).d).toBeGreaterThan(0.3);
  });
});
