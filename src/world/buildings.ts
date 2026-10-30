import * as THREE from 'three';
import { PROMENADE_Y, TOWN_HALL, buildingLayout, type BuildingDef } from './map.ts';
import { applyCutaway, facadeTextures, plasterTint } from './materials.ts';

/** Accumulates flat-shaded, non-indexed triangles with UVs and colours. */
class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private c = new THREE.Vector3();
  private n = new THREE.Vector3();
  private e1 = new THREE.Vector3();
  private e2 = new THREE.Vector3();

  tri(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    uv1: [number, number],
    uv2: [number, number],
    uv3: [number, number],
    col1: THREE.Color,
    col2 = col1,
    col3 = col1,
  ): void {
    this.a.copy(p1);
    this.b.copy(p2);
    this.c.copy(p3);
    this.e1.subVectors(this.b, this.a);
    this.e2.subVectors(this.c, this.a);
    this.n.crossVectors(this.e1, this.e2).normalize();
    for (const [p, uv, col] of [
      [this.a, uv1, col1],
      [this.b, uv2, col2],
      [this.c, uv3, col3],
    ] as const) {
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(this.n.x, this.n.y, this.n.z);
      this.uvs.push(uv[0], uv[1]);
      this.colors.push(col.r, col.g, col.b);
    }
  }

  /** Quad from four corners in counter-clockwise order (seen from outside). */
  quad(
    p: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
    uv: [[number, number], [number, number], [number, number], [number, number]],
    cols: [THREE.Color, THREE.Color, THREE.Color, THREE.Color],
  ): void {
    this.tri(p[0], p[1], p[2], uv[0], uv[1], uv[2], cols[0], cols[1], cols[2]);
    this.tri(p[0], p[2], p[3], uv[0], uv[2], uv[3], cols[0], cols[2], cols[3]);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const FLOOR_HEIGHT = 3.1;

function toWorld(b: BuildingDef, lx: number, y: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  return out.set(b.x + lx * c + lz * s, y, b.z - lx * s + lz * c);
}

function addWalls(mb: MeshBuilder, b: BuildingDef, baseY: number): void {
  const hw = b.width / 2;
  const hd = b.depth / 2;
  const top = baseY + b.height;
  const wall = new THREE.Color(b.color);
  const foot = wall.clone().multiplyScalar(0.8);
  // Corners in local space, counter-clockwise from above.
  const corners: Array<[number, number]> = [
    [-hw, hd],
    [hw, hd],
    [hw, -hd],
    [-hw, -hd],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const u = Math.max(1, Math.round(len / b.bay));
    const v = b.height / FLOOR_HEIGHT;
    mb.quad(
      [toWorld(b, ax, baseY, az), toWorld(b, bx, baseY, bz), toWorld(b, bx, top, bz), toWorld(b, ax, top, az)],
      [
        [0, 0],
        [u, 0],
        [u, v],
        [0, v],
      ],
      [foot, foot, wall, wall],
    );
  }
}

function addRoof(mb: MeshBuilder, b: BuildingDef, baseY: number): void {
  const roof = new THREE.Color(b.roofColor);
  const roofDark = roof.clone().multiplyScalar(0.82);
  const eave = 0.35;
  const hw = b.width / 2 + eave;
  const hd = b.depth / 2 + eave;
  const y0 = baseY + b.height;
  const z: [number, number] = [0, 0];
  if (b.roof === 'flat') {
    const y1 = y0 + 0.5;
    const p = (x: number, yy: number, zz: number) => toWorld(b, x, yy, zz);
    mb.quad([p(-hw, y1, hd), p(hw, y1, hd), p(hw, y1, -hd), p(-hw, y1, -hd)], [z, z, z, z], [roof, roof, roof, roof]);
    // Fascia on all four sides so the slab never floats above the walls.
    const corners: Array<[number, number]> = [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      mb.quad([p(ax, y0 - 0.2, az), p(bx, y0 - 0.2, bz), p(bx, y1, bz), p(ax, y1, az)], [z, z, z, z], [roofDark, roofDark, roofDark, roofDark]);
    }
    return;
  }
  // Ridge runs along the longer local axis.
  const alongX = b.width >= b.depth;
  const half = alongX ? hd : hw;
  const rise = Math.min(3.2, half * 0.75);
  const ridgeY = y0 + rise;
  const inset = b.roof === 'hip' ? half : 0;
  const p = (x: number, yy: number, zz: number) => toWorld(b, x, yy, zz);
  if (alongX) {
    const rx = Math.max(0.01, hw - inset);
    // Two long slopes.
    mb.quad([p(-hw, y0, hd), p(hw, y0, hd), p(rx, ridgeY, 0), p(-rx, ridgeY, 0)], [z, z, z, z], [roof, roof, roof, roof]);
    mb.quad([p(hw, y0, -hd), p(-hw, y0, -hd), p(-rx, ridgeY, 0), p(rx, ridgeY, 0)], [z, z, z, z], [roofDark, roofDark, roofDark, roofDark]);
    // Ends: hip slopes or vertical gables.
    mb.tri(p(hw, y0, hd), p(hw, y0, -hd), p(rx, ridgeY, 0), z, z, z, roofDark);
    mb.tri(p(-hw, y0, -hd), p(-hw, y0, hd), p(-rx, ridgeY, 0), z, z, z, roof);
  } else {
    const rz = Math.max(0.01, hd - inset);
    mb.quad([p(hw, y0, hd), p(hw, y0, -hd), p(0, ridgeY, -rz), p(0, ridgeY, rz)], [z, z, z, z], [roofDark, roofDark, roofDark, roofDark]);
    mb.quad([p(-hw, y0, -hd), p(-hw, y0, hd), p(0, ridgeY, rz), p(0, ridgeY, -rz)], [z, z, z, z], [roof, roof, roof, roof]);
    mb.tri(p(-hw, y0, hd), p(hw, y0, hd), p(0, ridgeY, rz), z, z, z, roof);
    mb.tri(p(hw, y0, -hd), p(-hw, y0, -hd), p(0, ridgeY, -rz), z, z, z, roofDark);
  }
  // Underside of the eaves so the overhang doesn't look paper thin.
  const under = roofDark.clone().multiplyScalar(0.7);
  mb.quad([p(-hw, y0, -hd), p(hw, y0, -hd), p(hw, y0, hd), p(-hw, y0, hd)], [z, z, z, z], [under, under, under, under]);
}

/** Two towers on the town hall so it reads as a landmark from far away. */
function landmarkExtras(): BuildingDef[] {
  const t = TOWN_HALL;
  return [-1, 1].map((side) => ({
    ...t,
    x: t.x + side * (t.width / 2 - 1.6),
    z: t.z - 0.2,
    width: 3.2,
    depth: 3.6,
    height: t.height + 3.5,
    roof: 'hip' as const,
  }));
}

export interface BuildingMeshes {
  group: THREE.Group;
  occluders: BuildingDef[];
  dispose(): void;
}

export function createBuildings(): BuildingMeshes {
  const defs = [...buildingLayout(), ...landmarkExtras()];
  const rowWalls = new MeshBuilder();
  const oldWalls = new MeshBuilder();
  const roofs = new MeshBuilder();
  for (const b of defs) {
    const target = b.kind === 'oldtown' ? oldWalls : rowWalls;
    addWalls(target, b, PROMENADE_Y - 0.05);
    addRoof(roofs, b, PROMENADE_Y - 0.05);
  }

  const rowTex = facadeTextures('row');
  const oldTex = facadeTextures('oldtown');
  const rowMat = applyCutaway(new THREE.MeshLambertMaterial({ vertexColors: true, map: rowTex.map }), plasterTint(rowTex.mask), 'facade');
  const oldMat = applyCutaway(new THREE.MeshLambertMaterial({ vertexColors: true, map: oldTex.map }), plasterTint(oldTex.mask), 'facade');
  const roofMat = applyCutaway(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const edgeMat = applyCutaway(new THREE.LineBasicMaterial({ color: 0x6e4f3c, transparent: true, opacity: 0.38 }));

  const group = new THREE.Group();
  group.name = 'buildings';
  const geometries: THREE.BufferGeometry[] = [];
  for (const [mb, mat] of [
    [rowWalls, rowMat],
    [oldWalls, oldMat],
    [roofs, roofMat],
  ] as const) {
    const geo = mb.build();
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    const edges = new THREE.EdgesGeometry(geo, 25);
    geometries.push(edges);
    const lines = new THREE.LineSegments(edges, edgeMat);
    lines.matrixAutoUpdate = false;
    group.add(lines);
  }

  return {
    group,
    occluders: defs,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of [rowMat, oldMat, roofMat, edgeMat]) m.dispose();
      for (const t of [rowTex, oldTex]) {
        t.map.dispose();
        t.mask.dispose();
      }
    },
  };
}
