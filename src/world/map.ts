/**
 * Pure layout of the compressed Donostia map. No three.js here, so collision
 * and tests can use it directly.
 *
 * Coordinates: X runs west (-) to east (+). Z runs north (-, the sea) to
 * south (+, inland). Y is up. One unit is roughly one stylised metre.
 */
import { mulberry32 } from '../engine/random.ts';

// --- La Concha crescent -----------------------------------------------------

/** Waterline of the bay. The beach is a crescent whose ends curve north. */
export const SHORE_K = 0.0065;
export const SHORE_Z0 = -6;
export function shoreZ(x: number): number {
  return SHORE_Z0 - SHORE_K * x * x;
}
export function shoreSlope(x: number): number {
  return -2 * SHORE_K * x;
}

/** Bay x-range in curve parameter space. */
export const BAY_WEST = -62;
export const BAY_EAST = 44;
/** Where the boulevard building row stops and Alderdi Eder gardens begin. */
export const ROW_EAST = 26;

/** Distances inland from the waterline, measured along the curve normal. */
export const D = {
  water: 0.35,
  seawall: 9,
  promenadeEnd: 15,
  rowFront: 20,
  rowDepth: 9,
} as const;

/** Stair gaps through the railing down to the sand, in curve x. */
export const STAIRS: ReadonlyArray<{ x0: number; halfWidth: number }> = [
  { x0: -24, halfWidth: 1.6 },
  { x0: 14, halfWidth: 1.6 },
];
export const STAIR_TOP_D = 9;
export const STAIR_BOTTOM_D = 5.2;

export const PROMENADE_Y = 1.4;
export const BEACH_Y0 = 0.05;
export const BEACH_SLOPE = 0.034;

/** Inland unit normal of the shore curve at curve parameter x0. */
export function shoreNormal(x0: number): { x: number; z: number } {
  const s = shoreSlope(x0);
  const len = Math.hypot(s, 1);
  return { x: -s / len, z: 1 / len };
}

/** Point at distance d inland from the waterline at curve parameter x0. */
export function bayPoint(x0: number, d: number): { x: number; z: number } {
  const n = shoreNormal(x0);
  return { x: x0 + n.x * d, z: shoreZ(x0) + n.z * d };
}

/**
 * Project a world point onto the shore curve. Returns the curve parameter and
 * signed distance inland (negative means in the sea).
 */
export function projectToShore(px: number, pz: number): { x0: number; d: number } {
  let x0 = px;
  for (let i = 0; i < 8; i++) {
    const s = shoreZ(x0);
    const ds = shoreSlope(x0);
    const f = x0 - px + (s - pz) * ds;
    const df = 1 + ds * ds + (s - pz) * (-2 * SHORE_K);
    const step = f / df;
    x0 -= step;
    if (Math.abs(step) < 1e-5) break;
  }
  const n = shoreNormal(x0);
  const d = (px - x0) * n.x + (pz - shoreZ(x0)) * n.z;
  return { x0, d };
}

/** Ground height under a point: the sand slopes up to the promenade level. */
export function groundY(x: number, z: number): number {
  if (x > BAY_EAST + 8 || x < BAY_WEST - 4) return PROMENADE_Y;
  const { x0, d } = projectToShore(x, z);
  if (x0 < BAY_WEST - 1 || x0 > BAY_EAST + 1 || d >= D.seawall) return PROMENADE_Y;
  for (const stair of STAIRS) {
    if (Math.abs(x0 - stair.x0) <= stair.halfWidth + 0.4 && d > STAIR_BOTTOM_D) {
      const beachAtBottom = BEACH_Y0 + BEACH_SLOPE * STAIR_BOTTOM_D;
      const t = Math.min(1, (d - STAIR_BOTTOM_D) / (STAIR_TOP_D - STAIR_BOTTOM_D));
      return beachAtBottom + (PROMENADE_Y - beachAtBottom) * t;
    }
  }
  return BEACH_Y0 + BEACH_SLOPE * Math.max(0, d);
}

// --- Buildings ---------------------------------------------------------------

export type RoofStyle = 'gable' | 'hip' | 'flat';

/** Oriented building box. rotation is around +Y; local +Z is the facade normal. */
export interface BuildingDef {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  color: string;
  roofColor: string;
  roof: RoofStyle;
  /** Window bay spacing along the facade. */
  bay: number;
  kind: 'row' | 'oldtown' | 'landmark';
}

const WALL_PALETTE = ['#f4e3c8', '#f7d6bd', '#f1c9a5', '#efe6d3', '#f6dcc9', '#e9d3b4', '#f3ceb6', '#fbefdc'];
const OLDTOWN_PALETTE = ['#f2c9a0', '#e9b48f', '#f4dcb5', '#d9b6a3', '#f0d8c0', '#e7c39b', '#f5e1c6', '#cfdcc8'];
const ROOF_PALETTE = ['#c4643f', '#b85a3a', '#cf7347', '#a9503a', '#c86b4a'];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** The grand boulevard row facing the bay, following the crescent. */
function bayRow(rng: () => number): BuildingDef[] {
  const out: BuildingDef[] = [];
  let x0 = BAY_WEST;
  while (x0 < ROW_EAST - 4) {
    const width = 7 + rng() * 3;
    const along = Math.min(width, ROW_EAST - x0);
    const mid = x0 + along / 2;
    const n = shoreNormal(mid);
    const centre = bayPoint(mid, D.rowFront + D.rowDepth / 2);
    out.push({
      x: centre.x,
      z: centre.z,
      width: along - 0.35,
      depth: D.rowDepth,
      height: 10 + Math.floor(rng() * 4),
      rotation: Math.atan2(-n.x, -n.z),
      color: pick(rng, WALL_PALETTE),
      roofColor: pick(rng, ROOF_PALETTE),
      roof: rng() < 0.65 ? 'hip' : 'gable',
      bay: 2.6,
      kind: 'row',
    });
    x0 += along;
  }
  return out;
}

/** Parte Vieja blocks: narrow lanes between tall pastel houses. */
export interface Block {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const OLDTOWN_COLS: ReadonlyArray<[number, number]> = [
  [55, 62],
  [65, 72],
  [75, 82],
  [85, 92],
];
export const OLDTOWN_ROWS: ReadonlyArray<[number, number]> = [
  [-5, 2],
  [5, 12],
  [15, 22],
];
/** Column/row index of the open square in the middle of the old town. */
export const PLAZA_CELL = { col: 2, row: 1 } as const;

export function oldTownBlocks(): Block[] {
  const blocks: Block[] = [];
  OLDTOWN_COLS.forEach(([minX, maxX], col) => {
    OLDTOWN_ROWS.forEach(([minZ, maxZ], row) => {
      if (col === PLAZA_CELL.col && row === PLAZA_CELL.row) return;
      blocks.push({ minX, maxX, minZ, maxZ });
    });
  });
  return blocks;
}

function oldTownHouses(rng: () => number): BuildingDef[] {
  const out: BuildingDef[] = [];
  for (const b of oldTownBlocks()) {
    const w = b.maxX - b.minX;
    const h = b.maxZ - b.minZ;
    // Split along the longer side into narrow houses.
    const alongX = w >= h;
    const length = alongX ? w : h;
    const count = 2 + Math.floor(rng() * 2);
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      const remaining = length - cursor;
      const size = i === count - 1 ? remaining : Math.max(2.2, (length / count) * (0.8 + rng() * 0.4));
      const c = cursor + size / 2;
      out.push({
        x: alongX ? b.minX + c : (b.minX + b.maxX) / 2,
        z: alongX ? (b.minZ + b.maxZ) / 2 : b.minZ + c,
        width: alongX ? size - 0.12 : w,
        depth: alongX ? h : size - 0.12,
        height: 9 + Math.floor(rng() * 4),
        rotation: 0,
        color: pick(rng, OLDTOWN_PALETTE),
        roofColor: pick(rng, ROOF_PALETTE),
        roof: rng() < 0.5 ? 'gable' : 'hip',
        bay: 1.9,
        kind: 'oldtown',
      });
      cursor += size;
    }
  }
  return out;
}

/** The town hall in Alderdi Eder gardens: a grand cream landmark. */
export const TOWN_HALL: BuildingDef = {
  x: 42,
  z: 15.5,
  width: 15,
  depth: 7,
  height: 11,
  rotation: 0,
  color: '#f7ecd6',
  roofColor: '#7b8f9a',
  roof: 'hip',
  bay: 2.4,
  kind: 'landmark',
};

export const CAROUSEL = { x: 43, z: 1.5, radius: 2.6 } as const;

let cachedBuildings: BuildingDef[] | null = null;
/** Deterministic: the same seed always builds the same town. */
export function buildingLayout(): BuildingDef[] {
  if (!cachedBuildings) {
    const rng = mulberry32(1813);
    cachedBuildings = [...bayRow(rng), ...oldTownHouses(rng), TOWN_HALL];
  }
  return cachedBuildings;
}

// --- Street furniture --------------------------------------------------------

export interface Prop {
  kind: 'tamarisk' | 'gardenTree' | 'lamp' | 'bench';
  x: number;
  z: number;
  /** Facing angle around +Y. */
  rotation: number;
  scale: number;
}

let cachedProps: Prop[] | null = null;
export function propLayout(): Prop[] {
  if (cachedProps) return cachedProps;
  const rng = mulberry32(2207);
  const props: Prop[] = [];
  // Tamarisk trees shading the boulevard.
  for (let x0 = BAY_WEST + 3; x0 < ROW_EAST - 1; x0 += 7) {
    const p = bayPoint(x0, 17.6);
    props.push({ kind: 'tamarisk', x: p.x, z: p.z, rotation: rng() * Math.PI * 2, scale: 0.85 + rng() * 0.35 });
  }
  // Ornate lamps along the railing.
  for (let x0 = BAY_WEST + 4; x0 < BAY_EAST - 2; x0 += 11) {
    if (STAIRS.some((s) => Math.abs(s.x0 - x0) < s.halfWidth + 1.2)) continue;
    const p = bayPoint(x0, D.seawall + 0.6);
    props.push({ kind: 'lamp', x: p.x, z: p.z, rotation: 0, scale: 1 });
  }
  // Benches facing the sea.
  for (let x0 = BAY_WEST + 9.5; x0 < BAY_EAST - 4; x0 += 16) {
    if (STAIRS.some((s) => Math.abs(s.x0 - x0) < s.halfWidth + 2)) continue;
    const n = shoreNormal(x0);
    const p = bayPoint(x0, D.seawall + 1.6);
    props.push({ kind: 'bench', x: p.x, z: p.z, rotation: Math.atan2(-n.x, -n.z), scale: 1 });
  }
  // Alderdi Eder garden trees, kept clear of the carousel and town hall.
  for (let gx = 33; gx <= 52; gx += 4.5) {
    for (let gz = -5; gz <= 10; gz += 5) {
      const x = gx + (rng() - 0.5) * 1.2;
      const z = gz + (rng() - 0.5) * 1.2;
      if (Math.hypot(x - CAROUSEL.x, z - CAROUSEL.z) < CAROUSEL.radius + 2.6) continue;
      if (z > 8.5) continue;
      if (Math.abs(z - 3.5) < 1.6 && x > 49) continue; // keep the lane entrance open
      props.push({ kind: 'gardenTree', x, z, rotation: rng() * Math.PI * 2, scale: 0.8 + rng() * 0.4 });
    }
  }
  cachedProps = props;
  return props;
}

export const PROP_RADIUS: Record<Prop['kind'], number> = {
  tamarisk: 0.38,
  gardenTree: 0.42,
  lamp: 0.16,
  bench: 0.65,
};

// --- Bounds and anchors ------------------------------------------------------

/** East-side quay edge (harbour water lies north of it). */
export const QUAY: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: 0 }, // replaced at runtime by the promenade end point, see quayLine()
  { x: 60, z: -9.8 },
  { x: 96, z: -9.8 },
];
export function quayLine(): Array<{ x: number; z: number }> {
  const start = bayPoint(BAY_EAST, D.seawall);
  return [start, ...QUAY.slice(1)];
}

export const EAST_LIMIT = 96;
export const SOUTH_LIMIT = 24.5;

export const SPAWN = { x0: -8, d: 12 } as const;
export function spawnPoint(): { x: number; z: number } {
  return bayPoint(SPAWN.x0, SPAWN.d);
}

/** Decorative hills and island (outside the walkable area). */
export const LANDMARKS = {
  urgull: { x: 80, z: -34, radius: 22, height: 19 },
  igueldo: { x: -94, z: -44, radius: 30, height: 30 },
  santaClara: { x: -16, z: -62, radius: 9, height: 7 },
} as const;
