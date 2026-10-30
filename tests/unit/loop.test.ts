import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../../src/engine/loop.ts';
import { SIM_DT } from '../../src/data/tuning.ts';

describe('FixedStepper', () => {
  it('runs the same number of steps regardless of frame rate', () => {
    const counts: number[] = [];
    for (const fps of [30, 60, 75, 144, 240]) {
      let steps = 0;
      const stepper = new FixedStepper(() => steps++);
      const frame = 1 / fps;
      for (let t = 0; t < 2 - 1e-9; t += frame) stepper.advance(frame);
      counts.push(steps);
    }
    for (const c of counts) expect(Math.abs(c - 120)).toBeLessThanOrEqual(1);
  });

  it('clamps long stalls instead of spiralling', () => {
    let steps = 0;
    const stepper = new FixedStepper(() => steps++);
    stepper.advance(3); // a three second hitch
    expect(steps).toBeLessThanOrEqual(8);
    expect(stepper.dropped).toBeGreaterThan(2.5);
  });

  it('returns an interpolation alpha in [0, 1)', () => {
    const stepper = new FixedStepper(() => {});
    const alpha = stepper.advance(SIM_DT * 1.5);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('ignores negative or NaN deltas', () => {
    let steps = 0;
    const stepper = new FixedStepper(() => steps++);
    stepper.advance(-1);
    stepper.advance(Number.NaN);
    expect(steps).toBe(0);
  });
});
