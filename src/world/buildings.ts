import * as THREE from 'three';
import { PROMENADE_Y, TOWN_HALL, buildingLayout, type BuildingDef } from './map.ts';
import { applyCutaway, facadeTextures, plasterTint, windowGlow } from './materials.ts';
import { mulberry32 } from '../engine/random.ts';
import { contactTexture, surfaceTexture } from './surfaces.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  const wall = new THREE.Color(b.color).offsetHSL(0, b.kind === 'oldtown' ? 0.12 : 0.045, -0.025);
  const foot = wall.clone().multiplyScalar(0.76);
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

/** Hundreds of architectural pieces share one draw per material, not per house. */
function dressBuildings(defs: BuildingDef[], group: THREE.Group, resources: Array<{ dispose(): void }>): void {
  const boxes: Array<{ matrix: THREE.Matrix4; color: THREE.Color }> = [];
  const flowers: typeof boxes = [];
  const canopies: typeof boxes = [];
  const glass: typeof boxes = [];
  const shadows: typeof boxes = [];
  const rng = mulberry32(190813);
  const dummy = new THREE.Object3D();
  const shades = ['#a8433c', '#286c60', '#c68e3c', '#497b8b'];
  const add = (list: typeof boxes, b: BuildingDef, x: number, y: number, z: number, w: number, h: number, d: number, color: string, tilt = 0) => {
    toWorld(b, x, PROMENADE_Y + y, z, dummy.position);
    dummy.rotation.set(tilt, b.rotation, 0, 'YXZ');
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    list.push({ matrix: dummy.matrix.clone(), color: new THREE.Color(color) });
  };
  for (const b of defs) {
    const hw = b.width / 2, hd = b.depth / 2;
    const accent = shades[Math.floor(rng() * shades.length)];
    // A dark plinth, projecting floor bands and a double limestone cornice.
    for (const y of [0.18, ...Array.from({ length: Math.floor(b.height / FLOOR_HEIGHT) }, (_, i) => (i + 1) * FLOOR_HEIGHT), b.height - 0.15, b.height + 0.06]) {
      const top = y > b.height - 0.3;
      const width = top ? 0.28 : 0.12;
      const color = y < 1 ? '#9b8d7d' : '#f5e7ce';
      for (const side of [-1, 1]) {
        add(boxes, b, 0, y, side * hd, b.width + width * 2, top ? 0.18 : 0.1, width * 2, color);
        add(boxes, b, side * hw, y, 0, width * 2, top ? 0.18 : 0.1, b.depth, color);
      }
    }
    // Corner quoins and roof chimneys give the mass a finished silhouette.
    for (const side of [-1, 1]) {
      add(boxes, b, side * (hw - 0.09), b.height / 2, hd + 0.025, 0.18, b.height, 0.12, '#ecddc6');
    }
    const chimneyY = b.height + Math.min(2.7, Math.min(hw, hd) * 0.75);
    add(canopies, b, hw * 0.45, chimneyY, -hd * 0.3, 0.5, 1.5, 0.6, '#bb8060');
    add(canopies, b, hw * 0.45, chimneyY + 0.8, -hd * 0.3, 0.68, 0.16, 0.76, '#e6d1b3');
    add(canopies, b, hw * 0.45, chimneyY + 0.9, -hd * 0.3, 0.36, 0.08, 0.42, '#403d3b');
    add(shadows, b, 0, 0.028, 0, b.width + 2.6, 1, b.depth + 2.6, '#ffffff');
    if (b.kind === 'landmark') continue;
    for (const side of [-1, 1]) {
      const bays = Math.max(1, Math.round(b.width / b.bay));
      const spacing = b.width / bays;
      const bw = Math.min(1.35, spacing * 0.7);
      // Recessed shop glass, painted timber surrounds and striped fabric canopies.
      for (let bay = 0; bay < bays; bay++) {
        const x = -hw + spacing * (bay + 0.5);
        add(boxes, b, x, 1.25, side * (hd + 0.045), bw + 0.18, 2.35, 0.12, accent);
        add(glass, b, x, 1.22, side * (hd + 0.12), bw - 0.06, 2.05, 0.06, '#294f59');
        add(boxes, b, x, 1.2, side * (hd + 0.18), 0.055, 2.1, 0.05, '#e6d6b9');
        add(boxes, b, x, 2.55, side * (hd + 0.18), bw + 0.28, 0.26, 0.2, accent);
        const stripes = 6;
        for (let i = 0; i < stripes; i++) {
          const xx = x - (bw + 0.4) / 2 + (i + 0.5) * (bw + 0.4) / stripes;
          const color = i % 2 ? '#fff0d6' : accent;
          add(canopies, b, xx, 2.75, side * (hd + 0.56), (bw + 0.4) / stripes, 0.07, 1.0, color, side * 0.18);
          add(canopies, b, xx, 2.57, side * (hd + 1.03), (bw + 0.4) / stripes, 0.22, 0.06, color);
        }
        for (let floor = 1; floor < b.height / FLOOR_HEIGHT - 0.7; floor++) {
          const y = floor * FLOOR_HEIGHT + 0.76;
          // Balcony slabs align with the bottom of each painted window bay.
          add(boxes, b, x, y, side * (hd + 0.25), bw + 0.28, 0.12, 0.65, '#e9dcc3');
          add(boxes, b, x, y + 0.66, side * (hd + 0.57), bw + 0.28, 0.055, 0.055, '#344749');
          for (let i = 0; i <= 3; i++) add(boxes, b, x - (bw + 0.2) / 2 + (bw + 0.2) * i / 3, y + 0.36, side * (hd + 0.57), 0.035, 0.6, 0.035, '#344749');
          for (const edge of [-1, 1]) add(boxes, b, x + edge * (bw + 0.24) / 2, y + 0.66, side * (hd + 0.3), 0.045, 0.045, 0.56, '#344749');
          if (rng() < 0.52) {
            add(boxes, b, x, y + 0.35, side * (hd + 0.64), bw * 0.7, 0.22, 0.24, '#a6543e');
            add(flowers, b, x, y + 0.49, side * (hd + 0.67), bw * 0.8, 0.23, 0.32, '#426e48');
            for (let i = 0; i < 3; i++) add(flowers, b, x + (i - 1) * bw * 0.22, y + 0.61, side * (hd + 0.69), 0.16, 0.17, 0.16, i % 2 ? '#f4cf65' : '#d94d67');
          }
        }
      }
    }
  }
  const solid = applyCutaway(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }));
  const shop = applyCutaway(new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), (shader) => {
    shader.uniforms.uWindowGlow = windowGlow;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWindowGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(3.2, 1.5, 0.4) * uWindowGlow;');
  }, 'cutaway-shop');
  const contact = new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
  for (const [items, geo, mat, cast] of [
    [boxes, new THREE.BoxGeometry(1, 1, 1), solid, false],
    [canopies, new THREE.BoxGeometry(1, 1, 1), solid, true],
    [flowers, new THREE.IcosahedronGeometry(0.5, 0), solid, false],
    [glass, new THREE.BoxGeometry(1, 1, 1), shop, false],
    [shadows, plane, contact, false],
  ] as const) {
    const chunks = new Map<string, typeof boxes>();
    for (const item of items) {
      const key = `${Math.floor(item.matrix.elements[12] / 24)},${Math.floor(item.matrix.elements[14] / 24)}`;
      let chunk = chunks.get(key); if (!chunk) chunks.set(key, (chunk = []));
      chunk.push(item);
    }
    for (const chunk of chunks.values()) {
      const parts = chunk.map((item) => {
        const part = geo.clone().applyMatrix4(item.matrix);
        const colors = new Float32Array(part.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) { colors[i] = item.color.r; colors[i + 1] = item.color.g; colors[i + 2] = item.color.b; }
        part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return part;
      });
      const merged = mergeGeometries(parts); parts.forEach((p) => p.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = mat === solid;
      mesh.name = mat === contact ? 'building-contact-shadows' : 'facade-details';
      mesh.matrixAutoUpdate = false;
      group.add(mesh); resources.push(merged);
    }
    resources.push(geo);
  }
  resources.push(solid, shop, contact, contact.map!);
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
  const tiles = surfaceTexture('tiles');
  const roofMat = applyCutaway(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: tiles }));
  const edgeMat = applyCutaway(new THREE.LineBasicMaterial({ color: 0x6e4f3c, transparent: true, opacity: 0.38 }));

  const group = new THREE.Group();
  group.name = 'buildings';
  const geometries: THREE.BufferGeometry[] = [];
  const details: Array<{ dispose(): void }> = [];
  dressBuildings(defs, group, details);
  for (const [mb, mat] of [
    [rowWalls, rowMat],
    [oldWalls, oldMat],
    [roofs, roofMat],
  ] as const) {
    const geo = mb.build();
    if (mb === roofs) {
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.8, pos.getZ(i) / 1.8);
    }
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
      for (const d of details) d.dispose();
      tiles.dispose();
      for (const m of [rowMat, oldMat, roofMat, edgeMat]) m.dispose();
      for (const t of [rowTex, oldTex]) {
        t.map.dispose();
        t.mask.dispose();
      }
    },
  };
}
