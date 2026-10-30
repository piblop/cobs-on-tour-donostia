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
