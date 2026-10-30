import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../../src/engine/loop.ts';
import { createMover, normaliseIntent, stepMovement } from '../../src/crew/controller.ts';
import { movement } from '../../src/data/tuning.ts';
import { buildCollisionWorld } from '../../src/world/collisions.ts';
import { spawnPoint } from '../../src/world/map.ts';

function walk(fps: number, seconds: number, intent = { x: 1, z: 0, brisk: false }) {
  const s = createMover(0, 0);
  const stepper = new FixedStepper((dt) => stepMovement(s, intent, dt, null));
  const frame = 1 / fps;
  for (let t = 0; t < seconds - 1e-9; t += frame) stepper.advance(frame);
  return s;
}

describe('movement', () => {
  it('covers the same distance at different rendering frame rates', () => {
    const results = [30, 60, 144, 240].map((fps) => walk(fps, 3).x);
    const base = results[1];
    for (const r of results) expect(Math.abs(r - base)).toBeLessThan(movement.walkSpeed / 60 + 1e-6);
  });

  it('keeps diagonal speed equal to cardinal speed', () => {
    const d = normaliseIntent(1, 1);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
    const cardinal = walk(60, 2, { x: 1, z: 0, brisk: false });
    const diagonal = walk(60, 2, { x: 1, z: 1, brisk: false });
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(cardinal.x, cardinal.z), 4);
  });

  it('accelerates gently then reaches walking speed', () => {
    const s = createMover(0, 0);
    stepMovement(s, { x: 1, z: 0, brisk: false }, 1 / 60, null);
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(movement.walkSpeed);
    for (let i = 0; i < 60; i++) stepMovement(s, { x: 1, z: 0, brisk: false }, 1 / 60, null);
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(movement.walkSpeed, 5);
  });

  it('decelerates to a stop when input is released', () => {
    const s = createMover(0, 0);
    for (let i = 0; i < 60; i++) stepMovement(s, { x: 0, z: 1, brisk: false }, 1 / 60, null);
    for (let i = 0; i < 60; i++) stepMovement(s, { x: 0, z: 0, brisk: false }, 1 / 60, null);
    expect(Math.hypot(s.vx, s.vz)).toBe(0);
  });

  it('turns smoothly rather than snapping', () => {
    const s = createMover(0, 0, 0);
    stepMovement(s, { x: 1, z: 0, brisk: false }, 1 / 60, null);
    expect(s.heading).toBeGreaterThan(0);
    expect(s.heading).toBeLessThan(Math.PI / 2);
  });

  it('never walks into the sea from the promenade', () => {
    const world = buildCollisionWorld();
    const p = spawnPoint();
    const s = createMover(p.x, p.z);
    // Walk north (toward the sea) for a long time.
    for (let i = 0; i < 60 * 20; i++) stepMovement(s, { x: 0, z: -1, brisk: true }, 1 / 60, world);
    // The railing stops the walk before the sand.
    expect(s.z).toBeGreaterThan(p.z - 4);
  });
});
