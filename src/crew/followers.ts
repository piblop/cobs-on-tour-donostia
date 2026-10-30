/**
 * Follower brains. Followers walk the leader's breadcrumb trail, so they take
 * the same corners through narrow lanes instead of cutting into walls. When the
 * leader stops they gather loosely and look where the leader is looking, and
 * now and then one wanders off to inspect something nearby.
 */
import type { MoveIntent } from './controller.ts';

export interface Point {
  x: number;
  z: number;
}

/** Ring of recent leader positions, newest last. */
export class Trail {
  private pts: Point[] = [];
  constructor(
    private readonly spacing = 0.45,
    private readonly max = 160,
  ) {}

  reset(...seed: Point[]): void {
    this.pts = seed.map((p) => ({ x: p.x, z: p.z }));
  }

  record(x: number, z: number): void {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(x - last.x, z - last.z) < this.spacing) return;
    this.pts.push({ x, z });
    if (this.pts.length > this.max) this.pts.shift();
  }

  get length(): number {
    return this.pts.length;
  }

  /**
   * Point at arc distance `dist` behind the leader along the trail, plus the
   * local trail direction (for a sideways offset). Falls back to the oldest point.
   */
  behind(leader: Point, dist: number, out: Point, dir: Point): void {
    let remaining = dist;
    let ax = leader.x;
    let az = leader.z;
    for (let i = this.pts.length - 1; i >= 0; i--) {
      const p = this.pts[i];
      const seg = Math.hypot(ax - p.x, az - p.z);
      if (seg >= remaining && seg > 1e-6) {
        const t = remaining / seg;
        out.x = ax + (p.x - ax) * t;
        out.z = az + (p.z - az) * t;
        dir.x = (ax - p.x) / seg;
        dir.z = (az - p.z) / seg;
        return;
      }
      remaining -= seg;
      if (seg > 1e-6) {
        dir.x = (ax - p.x) / seg;
        dir.z = (az - p.z) / seg;
      }
      ax = p.x;
      az = p.z;
    }
    out.x = ax;
    out.z = az;
  }
}

/** Walk toward a target and ease off on arrival. */
export function arriveIntent(from: Point, to: Point, settle = 0.35): MoveIntent {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < settle) return { x: 0, z: 0, brisk: false };
  const strength = Math.min(1, Math.max(0.3, d / 1.6));
  return { x: (dx / d) * strength, z: (dz / d) * strength, brisk: d > 4.5 };
}

export type BrainMode = 'follow' | 'gather' | 'investigate' | 'linger' | 'return';

export class FollowerBrain {
  mode: BrainMode = 'follow';
  /** Seconds without meaningful progress while far from the target. */
  stuckFor = 0;
  private lastDist = Infinity;
  private progressTimer = 0;
  investigateTarget: Point | null = null;
  private lingerLeft = 0;
  /** Angle the follower turns to while standing still. */
  lookAt: Point | null = null;

  constructor(
    readonly slot: number,
    readonly side: 1 | -1,
  ) {}

  startInvestigating(p: Point): void {
    this.mode = 'investigate';
    this.investigateTarget = { x: p.x, z: p.z };
  }

  /**
   * Decide where to walk this step. `follow`/`gather` targets come from the
   * crew manager; investigation overrides them.
   */
  intent(self: Point, formation: Point, leaderMoving: boolean, dt: number): { intent: MoveIntent; target: Point } {
    if (this.mode === 'investigate' && this.investigateTarget) {
      if (leaderMoving) {
        this.mode = 'return';
      } else {
        const t = this.investigateTarget;
        if (Math.hypot(t.x - self.x, t.z - self.z) < 1.2) {
          this.mode = 'linger';
          this.lingerLeft = 3 + (this.slot % 2) * 1.5;
          this.lookAt = { ...t };
        } else {
          return { intent: arriveIntent(self, t, 0.9), target: t };
        }
      }
    }
    if (this.mode === 'linger') {
      this.lingerLeft -= dt;
      if (this.lingerLeft <= 0 || leaderMoving) {
        this.mode = 'return';
        this.investigateTarget = null;
      } else {
        return { intent: { x: 0, z: 0, brisk: false }, target: self };
      }
    }
    if (this.mode === 'return' && Math.hypot(formation.x - self.x, formation.z - self.z) < 1) this.mode = 'follow';
    if (this.mode !== 'return') this.mode = leaderMoving ? 'follow' : 'gather';
    return { intent: arriveIntent(self, formation, this.mode === 'gather' ? 0.5 : 0.35), target: formation };
  }

  /** Track progress toward the target; returns true when it is time to recover. */
  trackStuck(self: Point, target: Point, dt: number): boolean {
    const d = Math.hypot(target.x - self.x, target.z - self.z);
    this.progressTimer += dt;
    if (this.progressTimer >= 0.75) {
      if (d > 2.5 && this.lastDist - d < 0.3) this.stuckFor += this.progressTimer;
      else this.stuckFor = 0;
      this.lastDist = d;
      this.progressTimer = 0;
    }
    return this.stuckFor > 2.2 || d > 18;
  }

  clearStuck(): void {
    this.stuckFor = 0;
    this.lastDist = Infinity;
    this.progressTimer = 0;
  }
}
