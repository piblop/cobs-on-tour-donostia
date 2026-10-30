/**
 * 2D collision on the ground plane. Every blocker is a segment or a circle, so
 * a walking circle slides smoothly along walls and rounds convex corners
 * instead of snagging on them.
 */
import {
  BAY_EAST,
  BAY_WEST,
  CAROUSEL,
  D,
  EAST_LIMIT,
  ROW_EAST,
  SOUTH_LIMIT,
  STAIRS,
  PROP_RADIUS,
  bayPoint,
  buildingLayout,
  propLayout,
  quayLine,
  type BuildingDef,
} from './map.ts';

export interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

const CELL = 4;

export class CollisionWorld {
  private segments: Segment[] = [];
  private circles: Circle[] = [];
  private grid = new Map<number, number[]>();
  private circleGrid = new Map<number, number[]>();
  /** Scratch list reused every query to avoid allocations in the loop. */
  private scratch: number[] = [];
  private stamp: Uint32Array = new Uint32Array(0);
  private stampId = 0;

  private key(cx: number, cz: number): number {
    return (cx + 512) * 1024 + (cz + 512);
  }

  addSegment(ax: number, az: number, bx: number, bz: number): void {
    const index = this.segments.push({ ax, az, bx, bz }) - 1;
    const minX = Math.floor(Math.min(ax, bx) / CELL) - 1;
    const maxX = Math.floor(Math.max(ax, bx) / CELL) + 1;
    const minZ = Math.floor(Math.min(az, bz) / CELL) - 1;
    const maxZ = Math.floor(Math.max(az, bz) / CELL) + 1;
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const k = this.key(cx, cz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(index);
      }
    }
  }

  addPolyline(points: ReadonlyArray<{ x: number; z: number }>, closed = false): void {
    for (let i = 0; i < points.length - 1; i++) {
      this.addSegment(points[i].x, points[i].z, points[i + 1].x, points[i + 1].z);
    }
    if (closed && points.length > 2) {
      const a = points[points.length - 1];
      this.addSegment(a.x, a.z, points[0].x, points[0].z);
    }
  }

  addCircle(x: number, z: number, r: number): void {
    const index = this.circles.push({ x, z, r }) - 1;
    const minX = Math.floor((x - r) / CELL) - 1;
    const maxX = Math.floor((x + r) / CELL) + 1;
    const minZ = Math.floor((z - r) / CELL) - 1;
    const maxZ = Math.floor((z + r) / CELL) + 1;
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const k = this.key(cx, cz);
        let list = this.circleGrid.get(k);
        if (!list) this.circleGrid.set(k, (list = []));
        list.push(index);
      }
    }
  }

  /** Oriented rectangle footprint as four segments. */
  addBox(cx: number, cz: number, width: number, depth: number, rotation: number): void {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    const hw = width / 2;
    const hd = depth / 2;
    const corners = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ].map(([lx, lz]) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c }));
    this.addPolyline(corners, true);
  }

  /** What the last resolve() touched, so movement can steer round posts. */
  hitSegment = false;
  hitCircle: Circle | null = null;

  get segmentCount(): number {
    return this.segments.length;
  }

  private nearbySegments(x: number, z: number): number[] {
    const out = this.scratch;
    out.length = 0;
    if (this.stamp.length < this.segments.length) this.stamp = new Uint32Array(this.segments.length + 64);
    this.stampId = (this.stampId + 1) >>> 0;
    if (this.stampId === 0) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
    const list = this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (list) {
      for (const i of list) {
        if (this.stamp[i] !== this.stampId) {
          this.stamp[i] = this.stampId;
          out.push(i);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle of radius r out of every blocker. Mutates and returns pos.
   * A few relaxation passes resolve concave corners.
   */
  resolve(pos: { x: number; z: number }, r: number): { x: number; z: number } {
    this.hitSegment = false;
    this.hitCircle = null;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const i of this.nearbySegments(pos.x, pos.z)) {
        const s = this.segments[i];
        const ex = s.bx - s.ax;
        const ez = s.bz - s.az;
        const lenSq = ex * ex + ez * ez;
        let t = lenSq > 0 ? ((pos.x - s.ax) * ex + (pos.z - s.az) * ez) / lenSq : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s.ax + ex * t;
        const qz = s.az + ez * t;
        let dx = pos.x - qx;
        let dz = pos.z - qz;
        const distSq = dx * dx + dz * dz;
        if (distSq >= r * r) continue;
        let dist = Math.sqrt(distSq);
        if (dist < 1e-6) {
          // Exactly on the line: push along the segment's left normal.
          const len = Math.sqrt(lenSq) || 1;
          dx = -ez / len;
          dz = ex / len;
          dist = 1;
          pos.x = qx + dx * r;
          pos.z = qz + dz * r;
        } else {
          const push = (r - dist) / dist;
          pos.x += dx * push;
          pos.z += dz * push;
        }
        moved = true;
        this.hitSegment = true;
      }
      const clist = this.circleGrid.get(this.key(Math.floor(pos.x / CELL), Math.floor(pos.z / CELL)));
      if (clist) {
        for (const i of clist) {
          const c = this.circles[i];
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const min = c.r + r;
          const distSq = dx * dx + dz * dz;
          if (distSq >= min * min) continue;
          const dist = Math.sqrt(distSq) || 1e-6;
          const push = (min - dist) / dist;
          pos.x += dx * push;
          pos.z += dz * push;
          moved = true;
          this.hitCircle = c;
        }
      }
      if (!moved) break;
    }
    return pos;
  }

  /** True when a circle at (x, z) overlaps nothing. */
  isFree(x: number, z: number, r: number): boolean {
    const p = { x, z };
    this.resolve(p, r);
    return Math.abs(p.x - x) < 1e-4 && Math.abs(p.z - z) < 1e-4;
  }
}

/** Sample a curve offset line between two curve parameters. */
function curveLine(fromX0: number, toX0: number, d: number, step = 1.5): Array<{ x: number; z: number }> {
  const pts: Array<{ x: number; z: number }> = [];
  const n = Math.max(1, Math.ceil(Math.abs(toX0 - fromX0) / step));
  for (let i = 0; i <= n; i++) pts.push(bayPoint(fromX0 + ((toX0 - fromX0) * i) / n, d));
  return pts;
}

export function railingRuns(): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = BAY_WEST;
  for (const stair of [...STAIRS].sort((a, b) => a.x0 - b.x0)) {
    runs.push([start, stair.x0 - stair.halfWidth]);
    start = stair.x0 + stair.halfWidth;
  }
  runs.push([start, BAY_EAST]);
  return runs;
}

export function buildCollisionWorld(buildings: BuildingDef[] = buildingLayout()): CollisionWorld {
  const world = new CollisionWorld();

  // The sea along the beach.
  world.addPolyline(curveLine(BAY_WEST, BAY_EAST, D.water));
  // Railing along the top of the sea wall, open at the stairs.
  for (const [a, b] of railingRuns()) world.addPolyline(curveLine(a, b, D.seawall, 1));
  // Building fronts along the bay boulevard.
  world.addPolyline(curveLine(BAY_WEST, ROW_EAST, D.rowFront - 0.45, 1.2));
  // West end of the beach and boulevard.
  world.addPolyline([bayPoint(BAY_WEST, 0), bayPoint(BAY_WEST, D.rowFront)]);
  // East end of the sand, where the beach meets the harbour wall.
  world.addPolyline([bayPoint(BAY_EAST, 0), bayPoint(BAY_EAST, D.seawall)]);
  // Harbour quay, then the far east edge and the inland edge.
  world.addPolyline(quayLine());
  world.addSegment(EAST_LIMIT, -10, EAST_LIMIT, SOUTH_LIMIT + 1);
  // Side wall of the last boulevard building, then the southern limit.
  const rowEnd = bayPoint(ROW_EAST, D.rowFront - 0.45);
  world.addSegment(rowEnd.x, rowEnd.z, rowEnd.x, SOUTH_LIMIT);
  world.addSegment(rowEnd.x, SOUTH_LIMIT, EAST_LIMIT, SOUTH_LIMIT);

  for (const b of buildings) {
    if (b.kind === 'row') continue; // covered by the smooth front line above
    world.addBox(b.x, b.z, b.width, b.depth, b.rotation);
  }
  world.addCircle(CAROUSEL.x, CAROUSEL.z, CAROUSEL.radius);
  for (const p of propLayout()) world.addCircle(p.x, p.z, PROP_RADIUS[p.kind] * p.scale);
  return world;
}
