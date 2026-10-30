import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Trail } from '../../src/crew/followers.ts';
import { Crew } from '../../src/crew/crew.ts';
import { buildCollisionWorld, CollisionWorld } from '../../src/world/collisions.ts';
import { bayPoint, spawnPoint } from '../../src/world/map.ts';

describe('trail', () => {
  it('finds points at arc distance behind the leader', () => {
    const t = new Trail(0.5);
    for (let x = 0; x <= 10; x += 0.5) t.record(x, 0);
    const out = { x: 0, z: 0 };
    const dir = { x: 0, z: 0 };
    t.behind({ x: 10, z: 0 }, 3, out, dir);
    expect(out.x).toBeCloseTo(7, 5);
    expect(dir.x).toBeCloseTo(1, 5);
  });

  it('follows corners instead of cutting them', () => {
    const t = new Trail(0.5);
    for (let x = 0; x <= 5; x += 0.5) t.record(x, 0);
    for (let z = 0.5; z <= 5; z += 0.5) t.record(5, z);
    const out = { x: 0, z: 0 };
    t.behind({ x: 5, z: 5 }, 7, out, { x: 0, z: 0 });
    // 5 units up the second leg, then 2 back along the first.
    expect(out.x).toBeCloseTo(3, 5);
    expect(out.z).toBeCloseTo(0, 5);
  });
});

function walkCrew(crew: Crew, seconds: number, intent = { x: 1, z: 0, brisk: false }) {
  for (let i = 0; i < seconds * 60; i++) crew.step(1 / 60, intent, true, null);
}

describe('crew', () => {
  it('followers keep up without stacking on one another', () => {
    const world = buildCollisionWorld();
    const p = spawnPoint();
    const crew = new Crew(new THREE.Scene(), world, p, Math.PI / 2);
    walkCrew(crew, 4);
    walkCrew(crew, 3, { x: 0, z: 0, brisk: false });
    const lead = crew.leader.mover;
    for (const m of crew.followers) {
      expect(Math.hypot(m.mover.x - lead.x, m.mover.z - lead.z)).toBeLessThan(6);
    }
    const all = crew.members.map((m) => m.mover);
    for (let a = 0; a < all.length; a++) {
      for (let b = a + 1; b < all.length; b++) {
        expect(Math.hypot(all[a].x - all[b].x, all[a].z - all[b].z)).toBeGreaterThan(0.6);
      }
    }
  });

  it('recovers a follower who gets stuck behind a wall', () => {
    const world = new CollisionWorld();
    // A long wall the follower cannot get round quickly.
    world.addSegment(-50, 3, 50, 3);
    const crew = new Crew(new THREE.Scene(), world, { x: 0, z: 0 }, 0);
    const stuck = crew.followers[0];
    Object.assign(stuck.mover, { x: 0, z: 6 });
    stuck.prev.x = 0;
    stuck.prev.z = 6;
    const recovered: string[] = [];
    crew.onRecover = (id) => recovered.push(id);
    walkCrew(crew, 6, { x: 0, z: -1, brisk: false });
    expect(recovered).toContain(stuck.def.id);
    expect(stuck.mover.z).toBeLessThan(3);
  });

  it('switching hands control to the next friend and back round', () => {
    const crew = new Crew(new THREE.Scene(), buildCollisionWorld(), spawnPoint(), Math.PI);
    const order = [crew.leader.def.id];
    for (let i = 0; i < 4; i++) order.push(crew.switchLeader().def.id);
    expect(new Set(order.slice(0, 4)).size).toBe(4);
    expect(order[4]).toBe(order[0]);
  });

  it('sits everyone on a bench and stands them back up', () => {
    const crew = new Crew(new THREE.Scene(), buildCollisionWorld(), spawnPoint(), Math.PI);
    const p = bayPoint(-10, 10.6);
    crew.sitAt({ x: p.x, z: p.z, rotation: Math.PI });
    expect(crew.seated).toBe(true);
    expect(crew.members.filter((m) => m.character.seated)).toHaveLength(3);
    crew.standUp();
    expect(crew.seated).toBe(false);
  });

  it('teleports the whole crew to free spots', () => {
    const world = buildCollisionWorld();
    const crew = new Crew(new THREE.Scene(), world, spawnPoint(), Math.PI);
    const p = spawnPoint();
    crew.teleport(p.x, p.z, Math.PI);
    for (const m of crew.members) expect(world.isFree(m.mover.x, m.mover.z, 0.3)).toBe(true);
  });
});
