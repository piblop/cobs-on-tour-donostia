import * as THREE from 'three';
import { crew as crewData, playerDefaultId } from '../data/crew.ts';
import type { CrewMember } from '../data/types.ts';
import { movement } from '../data/tuning.ts';
import type { CollisionWorld } from '../world/collisions.ts';
import { groundY } from '../world/map.ts';
import { Character } from './character.ts';
import { createMover, stepMovement, type MoveIntent, type MoverState } from './controller.ts';
import { FollowerBrain, Trail, type Point } from './followers.ts';
import { decorRandom } from '../engine/random.ts';

export interface CrewRuntime {
  def: CrewMember;
  character: Character;
  mover: MoverState;
  prev: { x: number; z: number; heading: number };
  brain: FollowerBrain;
  renderPos: THREE.Vector3;
  /** Seat assigned while the crew sits together. */
  seat: { x: number; z: number; heading: number } | null;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

const SLOT_GAP = 1.35;
const FIRST_SLOT = 1.7;

/**
 * The four friends: one controlled leader, three followers who walk the
 * leader's trail, gather when the leader stops, and never stack up.
 */
export class Crew {
  readonly members: CrewRuntime[];
  leaderIndex: number;
  private trail = new Trail();
  private formation: Point = { x: 0, z: 0 };
  private trailDir: Point = { x: 0, z: 1 };
  private idleFor = 0;
  private investigateCooldown = 6;
  /** Where the group's attention goes while standing still. */
  private viewPoint: Point = { x: 0, z: 0 };
  /** Called when a follower has to be recovered (for diagnostics/tests). */
  onRecover: ((id: string) => void) | null = null;
  /** Called when a follower wanders off to look at something. */
  onInvestigate: ((id: string) => void) | null = null;

  constructor(
    scene: THREE.Scene,
    private world: CollisionWorld,
    spawn: Point,
    heading: number,
  ) {
    this.members = crewData.map((def, i) => {
      const character = new Character(def);
      scene.add(character.root);
      const mover = createMover(spawn.x, spawn.z, heading);
      return {
        def,
        character,
        mover,
        prev: { x: mover.x, z: mover.z, heading },
        brain: new FollowerBrain(i, i % 2 === 0 ? 1 : -1),
        renderPos: new THREE.Vector3(),
        seat: null,
      };
    });
    this.leaderIndex = Math.max(0, this.members.findIndex((m) => m.def.id === playerDefaultId));
    this.teleport(spawn.x, spawn.z, heading);
  }

  get leader(): CrewRuntime {
    return this.members[this.leaderIndex];
  }

  get followers(): CrewRuntime[] {
    return this.members.filter((_, i) => i !== this.leaderIndex);
  }

  get seated(): boolean {
    return this.members.some((m) => m.seat !== null);
  }

  byId(id: string): CrewRuntime | undefined {
    return this.members.find((m) => m.def.id === id);
  }

  /** Position the whole crew at once: the leader on the spot, the others in a loose line behind. */
  teleport(x: number, z: number, heading: number): void {
    const back = { x: -Math.sin(heading), z: -Math.cos(heading) };
    const side = { x: Math.cos(heading), z: -Math.sin(heading) };
    const lead = this.leader;
    Object.assign(lead.mover, { x, z, vx: 0, vz: 0, heading });
    this.world.resolve(lead.mover, movement.radius);
    // Seed a straight trail behind the leader so followers have somewhere to stand.
    const seed: Point[] = [];
    for (let d = 8; d > 0; d -= 0.5) seed.push({ x: x + back.x * d, z: z + back.z * d });
    this.trail.reset(...seed);
    this.followers.forEach((m, i) => {
      const dist = FIRST_SLOT + i * SLOT_GAP;
      const p = this.freeSpot(x + back.x * dist + side.x * m.brain.side * 0.6, z + back.z * dist + side.z * m.brain.side * 0.6, lead.mover);
      Object.assign(m.mover, { x: p.x, z: p.z, vx: 0, vz: 0, heading });
      m.brain.clearStuck();
      m.brain.mode = 'follow';
    });
    for (const m of this.members) {
      m.seat = null;
      m.character.seated = false;
    }
    this.syncPrev();
  }

  /** Nearest free point to (x, z), searching outward; falls back to `fallback`. */
  private freeSpot(x: number, z: number, fallback: Point): Point {
    const r = movement.radius;
    if (this.world.isFree(x, z, r)) return { x, z };
    for (let ring = 1; ring <= 6; ring++) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const px = x + Math.cos(a) * ring * 0.5;
        const pz = z + Math.sin(a) * ring * 0.5;
        if (this.world.isFree(px, pz, r)) return { x: px, z: pz };
      }
    }
    return { x: fallback.x, z: fallback.z };
  }

  /** Hand control to the next friend. Returns the new leader. */
  switchLeader(): CrewRuntime {
    if (this.seated) return this.leader;
    const old = this.leader;
    this.leaderIndex = (this.leaderIndex + 1) % this.members.length;
    const lead = this.leader;
    // Followers now trail the new leader, starting from where the old one stood.
    this.trail.reset({ x: old.mover.x, z: old.mover.z }, { x: lead.mover.x, z: lead.mover.z });
    for (const m of this.followers) {
      m.brain.mode = 'follow';
      m.brain.clearStuck();
    }
    return lead;
  }

  syncPrev(): void {
    for (const m of this.members) {
      m.prev.x = m.mover.x;
      m.prev.z = m.mover.z;
      m.prev.heading = m.mover.heading;
    }
  }

  /** Points of interest followers may wander to when the group is idle. */
  pointsOfInterest: Point[] = [];

  step(dt: number, leaderIntent: MoveIntent, allowFollowers: boolean, faceTarget: number | null): void {
    this.syncPrev();
    const lead = this.leader;
    if (this.seated) {
      for (const m of this.members) this.settleSeat(m, dt);
      return;
    }
    stepMovement(lead.mover, leaderIntent, dt, this.world);
    if (faceTarget !== null) this.turnToward(lead.mover, faceTarget, dt);
    this.trail.record(lead.mover.x, lead.mover.z);

    const leaderSpeed = Math.hypot(lead.mover.vx, lead.mover.vz);
    const moving = leaderSpeed > 0.4;
    this.idleFor = moving ? 0 : this.idleFor + dt;
    const lookAhead = { x: Math.sin(lead.mover.heading), z: Math.cos(lead.mover.heading) };
    this.viewPoint.x = lead.mover.x + lookAhead.x * 8;
    this.viewPoint.z = lead.mover.z + lookAhead.z * 8;

    if (allowFollowers) this.maybeInvestigate(dt);

    this.followers.forEach((m, i) => {
      if (!allowFollowers) {
        stepMovement(m.mover, { x: 0, z: 0, brisk: false }, dt, this.world);
        if (faceTarget !== null) this.turnToward(m.mover, faceTarget, dt);
        return;
      }
      this.formationPoint(i, m, moving);
      const { intent, target } = m.brain.intent(m.mover, this.formation, moving || this.idleFor < 0.6, dt);
      stepMovement(m.mover, intent, dt, this.world);
      const standing = Math.hypot(m.mover.vx, m.mover.vz) < 0.25;
      if (standing) {
        const look = m.brain.lookAt ?? this.viewPoint;
        this.turnToward(m.mover, Math.atan2(look.x - m.mover.x, look.z - m.mover.z), dt * 0.6);
      }
      if (m.brain.trackStuck(m.mover, target, dt)) this.recover(m, i);
    });
    this.separate();
  }

  /** Where follower i should stand: on the trail while walking, in a loose arc when gathered. */
  private formationPoint(i: number, m: CrewRuntime, moving: boolean): void {
    const lead = this.leader.mover;
    if (moving || this.idleFor < 0.6) {
      this.trail.behind(lead, FIRST_SLOT + i * SLOT_GAP, this.formation, this.trailDir);
      // A small sideways offset so the line looks like friends, not ducklings.
      const off = 0.55 * m.brain.side;
      this.formation.x += -this.trailDir.z * off;
      this.formation.z += this.trailDir.x * off;
    } else {
      // Gather in a loose arc behind and beside the leader, all looking the same way.
      const angles = [2.3, -2.3, Math.PI];
      const a = lead.heading + angles[i % 3];
      const r = i === 2 ? 1.9 : 1.55;
      this.formation.x = lead.x + Math.sin(a) * r;
      this.formation.z = lead.z + Math.cos(a) * r;
    }
  }

  private maybeInvestigate(dt: number): void {
    this.investigateCooldown -= dt;
    if (this.idleFor < 3.5 || this.investigateCooldown > 0 || this.pointsOfInterest.length === 0) return;
    this.investigateCooldown = 9 + decorRandom() * 8;
    const lead = this.leader.mover;
    const near = this.pointsOfInterest.filter((p) => {
      const d = Math.hypot(p.x - lead.x, p.z - lead.z);
      return d > 2 && d < 8;
    });
    if (near.length === 0) return;
    const followers = this.followers.filter((m) => m.brain.mode === 'gather');
    if (followers.length === 0) return;
    const who = followers[Math.floor(decorRandom() * followers.length)];
    const poi = near[Math.floor(decorRandom() * near.length)];
    who.brain.startInvestigating(poi);
    this.onInvestigate?.(who.def.id);
  }

  /** Recover a stuck follower: hop them to a free spot just behind the leader. */
  private recover(m: CrewRuntime, i: number): void {
    const lead = this.leader.mover;
    const p = { x: 0, z: 0 };
    const dir = { x: 0, z: 0 };
    this.trail.behind(lead, FIRST_SLOT + i * SLOT_GAP, p, dir);
    const spot = this.freeSpot(p.x, p.z, lead);
    Object.assign(m.mover, { x: spot.x, z: spot.z, vx: 0, vz: 0 });
    m.prev.x = spot.x;
    m.prev.z = spot.z;
    m.brain.clearStuck();
    m.brain.mode = 'follow';
    m.character.hop(0.4);
    this.onRecover?.(m.def.id);
  }

  /** Friends never stand inside one another. Only followers give way. */
  private separate(): void {
    const minDist = 0.85;
    for (let a = 0; a < this.members.length; a++) {
      for (let b = a + 1; b < this.members.length; b++) {
        const A = this.members[a].mover;
        const B = this.members[b].mover;
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const d = Math.hypot(dx, dz);
        if (d >= minDist) continue;
        const nx = d > 1e-5 ? dx / d : 1;
        const nz = d > 1e-5 ? dz / d : 0;
        const push = minDist - d;
        const aLead = a === this.leaderIndex;
        const bLead = b === this.leaderIndex;
        const wa = aLead ? 0 : bLead ? 1 : 0.5;
        const wb = bLead ? 0 : aLead ? 1 : 0.5;
        A.x -= nx * push * wa;
        A.z -= nz * push * wa;
        B.x += nx * push * wb;
        B.z += nz * push * wb;
        if (!aLead) this.world.resolve(A, movement.radius);
        if (!bLead) this.world.resolve(B, movement.radius);
      }
    }
  }

  private turnToward(m: MoverState, angle: number, dt: number): void {
    const diff = wrapAngle(angle - m.heading);
    m.heading = wrapAngle(m.heading + diff * (1 - Math.exp(-7 * dt)));
  }

  // --- Sitting together ---------------------------------------------------------

  /** Seat everyone along a bench (and the fourth friend leaning nearby). */
  sitAt(bench: { x: number; z: number; rotation: number }): void {
    const facing = bench.rotation;
    const right = { x: Math.cos(facing), z: -Math.sin(facing) };
    const fwd = { x: Math.sin(facing), z: Math.cos(facing) };
    const seats = [-0.55, 0, 0.55].map((o) => ({
      x: bench.x + right.x * o - fwd.x * 0.05,
      z: bench.z + right.z * o - fwd.z * 0.05,
      heading: facing,
    }));
    // The fourth friend stands at the end, half-turned to the group.
    seats.push({ x: bench.x + right.x * 1.35 + fwd.x * 0.5, z: bench.z + right.z * 1.35 + fwd.z * 0.5, heading: facing - 0.9 });
    const order = [this.leader, ...this.followers];
    order.forEach((m, i) => {
      m.seat = seats[i];
      Object.assign(m.mover, { x: seats[i].x, z: seats[i].z, vx: 0, vz: 0, heading: seats[i].heading });
      m.character.seated = i < 3;
    });
    this.syncPrev();
  }

  /** Seat the four friends on chairs (e.g. around the terrace table). */
  seatAround(seats: Array<{ x: number; z: number; heading: number }>): void {
    const order = [this.leader, ...this.followers];
    order.forEach((m, i) => {
      const seat = seats[i % seats.length];
      m.seat = seat;
      Object.assign(m.mover, { x: seat.x, z: seat.z, vx: 0, vz: 0, heading: seat.heading });
      m.character.seated = true;
    });
    this.syncPrev();
  }

  /** Stand everyone up at a spot (leaving a scene). */
  standAt(x: number, z: number, heading: number): void {
    for (const m of this.members) {
      m.seat = null;
      m.character.seated = false;
    }
    this.teleport(x, z, heading);
  }

  standUp(): void {
    const lead = this.leader;
    const fwdAngle = lead.mover.heading;
    for (const m of this.members) {
      if (!m.seat) continue;
      m.mover.x += Math.sin(fwdAngle) * 0.7;
      m.mover.z += Math.cos(fwdAngle) * 0.7;
      this.world.resolve(m.mover, movement.radius);
      m.seat = null;
      m.character.seated = false;
    }
    this.trail.reset({ x: lead.mover.x, z: lead.mover.z });
    this.syncPrev();
  }

  private settleSeat(m: CrewRuntime, dt: number): void {
    if (!m.seat) return;
    this.turnToward(m.mover, m.seat.heading, dt);
  }

  // --- Rendering -------------------------------------------------------------------

  interpolate(alpha: number): void {
    for (const m of this.members) {
      const x = m.prev.x + (m.mover.x - m.prev.x) * alpha;
      const z = m.prev.z + (m.mover.z - m.prev.z) * alpha;
      const heading = m.prev.heading + wrapAngle(m.mover.heading - m.prev.heading) * alpha;
      // Seated friends sit on the bench, not the ground beneath it.
      const y = groundY(x, z) + (m.seat && m.character.seated ? 0.05 : 0);
      m.renderPos.set(x, y, z);
      m.character.root.position.copy(m.renderPos);
      m.character.root.rotation.y = heading;
    }
  }

  animate(dt: number, reducedMotion: boolean, frozen: boolean): void {
    for (const m of this.members) {
      const speed = frozen ? 0 : Math.hypot(m.mover.vx, m.mover.vz);
      m.character.animate(frozen ? 0 : dt, speed, movement.walkSpeed, reducedMotion);
    }
  }

  dispose(): void {
    for (const m of this.members) m.character.dispose();
  }
}
