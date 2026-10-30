/**
 * Walking physics for the controlled friend. stepMovement is pure so it can be
 * tested at any frame rate.
 */
import { movement } from '../data/tuning.ts';
import type { CollisionWorld } from '../world/collisions.ts';

export interface MoverState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Facing angle around +Y (0 faces +Z). */
  heading: number;
}

export interface MoveIntent {
  /** Desired direction in world space; length 0..1 (analogue sticks may be partial). */
  x: number;
  z: number;
  brisk: boolean;
}

export function createMover(x: number, z: number, heading = Math.PI): MoverState {
  return { x, z, vx: 0, vz: 0, heading };
}

/** Clamp an input vector so diagonals are never faster than cardinals. */
export function normaliseIntent(x: number, z: number): { x: number; z: number } {
  const len = Math.hypot(x, z);
  if (len > 1) return { x: x / len, z: z / len };
  return { x, z };
}

const probe = { x: 0, z: 0 };

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function stepMovement(
  s: MoverState,
  intent: MoveIntent,
  dt: number,
  world: CollisionWorld | null,
  tune: typeof movement = movement,
): MoverState {
  const dir = normaliseIntent(intent.x, intent.z);
  const mag = Math.hypot(dir.x, dir.z);
  const top = intent.brisk ? tune.briskSpeed : tune.walkSpeed;
  const tx = dir.x * top;
  const tz = dir.z * top;

  // Move velocity toward the target at a bounded rate (accelerate or brake).
  const rate = mag > 0.01 ? tune.acceleration : tune.deceleration;
  const dvx = tx - s.vx;
  const dvz = tz - s.vz;
  const dvLen = Math.hypot(dvx, dvz);
  const maxDv = rate * dt;
  if (dvLen <= maxDv) {
    s.vx = tx;
    s.vz = tz;
  } else {
    s.vx += (dvx / dvLen) * maxDv;
    s.vz += (dvz / dvLen) * maxDv;
  }

  const prevX = s.x;
  const prevZ = s.z;
  const wantX = s.vx * dt;
  const wantZ = s.vz * dt;
  s.x += wantX;
  s.z += wantZ;

  if (world) {
    world.resolve(s, tune.radius);
    // Walking into a trunk, lamp post or bench: slide round it along its
    // tangent instead of stopping dead. Walls keep their plain slide.
    const post = world.hitCircle;
    if (mag > 0.3 && post && !world.hitSegment) {
      const wantLen2 = wantX * wantX + wantZ * wantZ;
      const progress = wantLen2 > 1e-10 ? ((s.x - prevX) * wantX + (s.z - prevZ) * wantZ) / wantLen2 : 0;
      if (progress < 0.5) {
        const nx = prevX - post.x;
        const nz = prevZ - post.z;
        const nLen = Math.hypot(nx, nz) || 1;
        let tx = -nz / nLen;
        let tz = nx / nLen;
        // Go round on the side the walker is already leaning toward.
        if (tx * dir.x + tz * dir.z < 0) {
          tx = -tx;
          tz = -tz;
        }
        const step = top * mag * dt;
        probe.x = prevX + tx * step;
        probe.z = prevZ + tz * step;
        world.resolve(probe, tune.radius);
        if (!world.hitSegment) {
          s.x = probe.x;
          s.z = probe.z;
        }
      }
    }
    // Keep velocity consistent with what actually happened, so sliding along a
    // wall doesn't build up hidden speed into it.
    if (dt > 0) {
      const realVx = (s.x - prevX) / dt;
      const realVz = (s.z - prevZ) / dt;
      s.vx = realVx;
      s.vz = realVz;
    }
  }

  // Turn smoothly toward the direction of travel (or of the stick).
  const speed = Math.hypot(s.vx, s.vz);
  if (mag > 0.05 || speed > 0.3) {
    const want = mag > 0.05 ? Math.atan2(dir.x, dir.z) : Math.atan2(s.vx, s.vz);
    const diff = wrapAngle(want - s.heading);
    s.heading = wrapAngle(s.heading + diff * (1 - Math.exp(-tune.turnRate * dt)));
  }
  return s;
}
