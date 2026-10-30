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
  for (const s of Object.values(SUMMITS)) {
    if ((x - s.x) ** 2 + (z - s.z) ** 2 < (s.r + 1.5) ** 2) return s.y;
  }
  if (x >= RIVER.east - 0.5) {
    if (z >= ZURRIOLA.wallZ) return PROMENADE_Y;
    const beach = BEACH_Y0 + BEACH_SLOPE * Math.max(0, z - ZURRIOLA.waterZ);
    if (x >= ZURRIOLA.ramp[0] && x <= ZURRIOLA.ramp[1] && z > ZURRIOLA.wallZ - 4) {
      const t = (z - (ZURRIOLA.wallZ - 4)) / 4;
      return beach + (PROMENADE_Y - beach) * t;
    }
    return beach;
  }
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
  kind: 'row' | 'oldtown' | 'landmark' | 'gros';
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
    if (x0 >= MIRAMAR.from - 0.01 && x0 < MIRAMAR.to) {
      x0 = MIRAMAR.to;
      continue;
    }
    const width = 7 + rng() * 3;
    const along = Math.min(width, ROW_EAST - x0, x0 < MIRAMAR.from ? MIRAMAR.from - x0 : Infinity);
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

/** Blocks given over to landmarks: the basilica and the market hall. */
export const BASILICA_BLOCK: Block = { minX: 65, maxX: 72, minZ: -5, maxZ: 2 };
export const BRETXA_BLOCK: Block = { minX: 85, maxX: 92, minZ: 15, maxZ: 22 };
const sameBlock = (a: Block, b: Block) => a.minX === b.minX && a.minZ === b.minZ;

function oldTownHouses(rng: () => number): BuildingDef[] {
  const out: BuildingDef[] = [];
  for (const b of oldTownBlocks()) {
    if (sameBlock(b, BASILICA_BLOCK) || sameBlock(b, BRETXA_BLOCK)) continue;
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
    cachedBuildings = [...bayRow(rng), ...oldTownHouses(rng), TOWN_HALL, ...landmarkBuildings(), ...grosHouses(mulberry32(4242))];
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
  igueldo: { x: -118, z: -18, radius: 30, height: 30 },
  santaClara: { x: -16, z: -62, radius: 9, height: 7 },
} as const;

// --- M4: the wider city ---------------------------------------------------------------

type P = { x: number; z: number };

/** Walkable hilltops, reached by funicular, path and boat. y is the plateau height. */
export const SUMMITS = {
  igueldo: { x: -118, z: -18, r: 11, y: 26 },
  urgull: { x: 80, z: -34, r: 9.5, y: 16 },
  santaClara: { x: -16, z: -62, r: 4, y: 6 },
} as const;

/** Miramar Palace gardens interrupt the boulevard row (curve x range). */
export const MIRAMAR = { from: -46, to: -32, depth: 34 } as const;

/** The Urumea river between the old town and Gros, and the bridge over it. */
export const RIVER = { west: 97, east: 107 } as const;
export const BRIDGE = { minZ: 2, maxZ: 7.5 } as const;
export const GROS = { minX: 107, maxX: 150, minZ: -12, maxZ: 25.5 } as const;
export const ZURRIOLA = { waterZ: -31, wallZ: -12, ramp: [120, 124] as const } as const;
export const KURSAAL = [
  { x: 111.5, z: -6.2, w: 6, d: 6, h: 8 },
  { x: 119, z: -5.6, w: 7, d: 7, h: 10.5 },
] as const;
export const GROS_COLS: ReadonlyArray<[number, number]> = [
  [113, 120],
  [124, 131],
  [135, 142],
];
export const GROS_ROWS: ReadonlyArray<[number, number]> = [
  [3, 10],
  [14, 21],
];

/** The walkway from the end of the promenade out to the Peine del Viento. */
export function peineLayout() {
  const n = shoreNormal(BAY_WEST);
  const t = { x: n.z, z: -n.x };
  const back = { x: -t.x, z: -t.z };
  const A = bayPoint(BAY_WEST, 9.3);
  const B = bayPoint(BAY_WEST, 16);
  const len = 8;
  const A2 = { x: A.x + back.x * len, z: A.z + back.z * len };
  const B2 = { x: B.x + back.x * len, z: B.z + back.z * len };
  const mid = { x: (A2.x + B2.x) / 2, z: (A2.z + B2.z) / 2 };
  const r = 5.6;
  const C = { x: mid.x + back.x * 5.2, z: mid.z + back.z * 5.2 };
  // Arc around the far side of the platform, from the land side to the sea side.
  const aB = Math.atan2(B2.z - C.z, B2.x - C.x);
  const aA = Math.atan2(A2.z - C.z, A2.x - C.x);
  const aFar = Math.atan2(back.z, back.x);
  const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  // Pick the sweep direction that passes through the far point.
  const ccw = norm(aFar - aB) < norm(aA - aB);
  const sweep = ccw ? norm(aA - aB) : -norm(aB - aA);
  const arc: P[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = aB + (sweep * i) / steps;
    arc.push({ x: C.x + Math.cos(a) * r, z: C.z + Math.sin(a) * r });
  }
  const polyline: P[] = [B, B2, ...arc, A2, A];
  const side = { x: -back.z, z: back.x };
  const sculptures: P[] = [
    { x: C.x + back.x * 8.5 + side.x * -3, z: C.z + back.z * 8.5 + side.z * -3 },
    { x: C.x + back.x * 9.5 + side.x * 1.5, z: C.z + back.z * 9.5 + side.z * 1.5 },
    { x: C.x + back.x * 7 + side.x * 5, z: C.z + back.z * 7 + side.z * 5 },
  ];
  // Funicular base station just inland of the walkway.
  const station = { x: B2.x + n.x * 3.4 + t.x * 1.5, z: B2.z + n.z * 3.4 + t.z * 1.5 };
  const stationSpot = { x: B2.x + (A2.x - B2.x) * 0.25 + t.x * 1.5, z: B2.z + (A2.z - B2.z) * 0.25 + t.z * 1.5 };
  return { A, B, A2, B2, C, r, polyline, sculptures, station, stationSpot, tangent: t, back, inland: n };
}

/** Height of a hill's surface at a point (0 outside the hill), for funicular rails. */
export function hillSurface(h: { x: number; z: number; radius: number; height: number }, x: number, z: number): number {
  const rho = Math.hypot(x - h.x, z - h.z) / h.radius;
  return rho >= 1 ? 0 : -0.5 + h.height * Math.sqrt(1 - rho * rho);
}

/** Funicular track from the base station up to the Igueldo summit. */
export function funicularTrack(): P[] {
  const base = peineLayout().station;
  const top = { x: SUMMITS.igueldo.x + SUMMITS.igueldo.r - 1, z: SUMMITS.igueldo.z };
  const pts: P[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push({ x: base.x + (top.x - base.x) * t, z: base.z + (top.z - base.z) * t });
  }
  return pts;
}

function landmarkBuildings(): BuildingDef[] {
  const stone = '#e6d6b8';
  const out: BuildingDef[] = [];
  // Basilica de Santa Maria: nave and two towers, facing the lane to the south.
  const bx = (BASILICA_BLOCK.minX + BASILICA_BLOCK.maxX) / 2;
  out.push({ x: bx, z: -2.2, width: 5.6, depth: 5.4, height: 12.5, rotation: 0, color: stone, roofColor: '#9a6e4f', roof: 'gable', bay: 3.2, kind: 'landmark' });
  for (const dx of [-2.3, 2.3]) {
    out.push({ x: bx + dx, z: 0.9, width: 1.9, depth: 1.9, height: 16, rotation: 0, color: stone, roofColor: '#7b8f9a', roof: 'hip', bay: 1.9, kind: 'landmark' });
  }
  // Mercado de la Bretxa: a long, low hall with a green iron roof.
  const mx = (BRETXA_BLOCK.minX + BRETXA_BLOCK.maxX) / 2;
  out.push({ x: mx, z: 18.6, width: 6.6, depth: 6.4, height: 6.2, rotation: 0, color: '#f1e4cc', roofColor: '#5f8a7a', roof: 'gable', bay: 2.2, kind: 'landmark' });
  // Miramar Palace: an English-cottage-style summer palace among lawns.
  const mid = (MIRAMAR.from + MIRAMAR.to) / 2;
  const n = shoreNormal(mid);
  const p = bayPoint(mid, 28.5);
  out.push({ x: p.x, z: p.z, width: 8.5, depth: 5.5, height: 8.5, rotation: Math.atan2(-n.x, -n.z), color: '#efe2c8', roofColor: '#6d5a52', roof: 'hip', bay: 2.2, kind: 'landmark' });
  // The Kursaal's two glassy cubes are drawn separately; their footprints still block.
  return out;
}

function grosHouses(rng: () => number): BuildingDef[] {
  const out: BuildingDef[] = [];
  for (const [minX, maxX] of GROS_COLS) {
    for (const [minZ, maxZ] of GROS_ROWS) {
      const count = 2;
      const w = (maxX - minX) / count;
      for (let i = 0; i < count; i++) {
        out.push({
          x: minX + w * (i + 0.5),
          z: (minZ + maxZ) / 2,
          width: w - 0.15,
          depth: maxZ - minZ,
          height: 10 + Math.floor(rng() * 4),
          rotation: Math.PI,
          color: pick(rng, WALL_PALETTE),
          roofColor: pick(rng, ROOF_PALETTE),
          roof: rng() < 0.5 ? 'hip' : 'gable',
          bay: 2.6,
          kind: 'gros',
        });
      }
    }
  }
  return out;
}

/** Travel stops: where you board, and where you arrive. */
export function travelStops() {
  const peine = peineLayout();
  const ig = SUMMITS.igueldo;
  const ur = SUMMITS.urgull;
  const sc = SUMMITS.santaClara;
  return {
    funicularBase: peine.stationSpot,
    funicularTop: { x: ig.x + ig.r - 2.5, z: ig.z + 1.5 },
    urgullFoot: { x: 93.5, z: -8.4 },
    urgullTop: { x: ur.x + ur.r - 2.2, z: ur.z + 3 },
    boatQuay: { x: 52, z: -8.8 },
    islandLanding: { x: sc.x + 2.2, z: sc.z + 1.6 },
    taxiRank: { x: 34.5, z: 6.5 },
  };
}
