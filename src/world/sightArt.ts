import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../engine/random.ts';
import type { QualityPreset } from '../engine/renderer.ts';
import { applyCutaway, waterTime, windowGlow } from './materials.ts';
import { BASILICA_BLOCK, CAROUSEL, LANDMARKS, MIRAMAR, PROMENADE_Y, SUMMITS, TOWN_HALL, ZURRIOLA, bayPoint, hillSurface, peineLayout, shoreNormal } from './map.ts';

const C = {
  stone: '#d9c5a0', light: '#f4e6cd', shade: '#a28c70', white: '#fff5df',
  iron: '#354c50', glass: '#376a79', red: '#b95143', gold: '#dfb15c',
  roof: '#745d56', green: '#486e4f', brick: '#ad6952', rust: '#934a29',
};
type Finish = 'solid' | 'stone' | 'glass' | 'rust' | 'church' | 'surf';
type Part = { geo: THREE.BufferGeometry; finish: Finish; fine: boolean };

/** Small original architectural pieces, baked by sight/material/LOD, never by ornament. */
class Sculpture {
  readonly root = new THREE.Group();
  private parts: Part[] = [];
  fine = false;

  copy(): Sculpture {
    const copy = new Sculpture();
    copy.parts = this.parts.map((p) => ({ ...p, geo: p.geo.clone() }));
    return copy;
  }

  recoat(from: Finish, to: Finish): void {
    for (const p of this.parts) if (p.finish === from) p.finish = to;
  }

  place(other: Sculpture, x: number, y: number, z: number, yaw = 0): void {
    const matrix = new THREE.Matrix4().makeRotationY(yaw); matrix.setPosition(x, y, z);
    for (const p of other.parts) { p.geo.applyMatrix4(matrix); this.parts.push(p); }
    other.parts = [];
  }

  add(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, rotation: [number, number, number] = [0, 0, 0], finish: Finish = 'solid'): void {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(matrix);
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal') g.deleteAttribute(key);
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push({ geo: g, finish, fine: this.fine });
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, rotation: [number, number, number] = [0, 0, 0], finish: Finish = 'solid'): void {
    this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rotation, finish);
  }

  cyl(x: number, y: number, z: number, rt: number, rb: number, h: number, color: string, n = 10, finish: Finish = 'solid'): void {
    this.add(new THREE.CylinderGeometry(rt, rb, h, n), color, x, y, z, [0, 0, 0], finish);
  }

  ball(x: number, y: number, z: number, r: number, color: string, scale: [number, number, number] = [1, 1, 1]): void {
    const g = new THREE.IcosahedronGeometry(r, 1); g.scale(...scale); this.add(g, color, x, y, z);
  }

  bar(a: number[], b: number[], width: number, color: string, depth = width): void {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const g = new THREE.BoxGeometry(width, start.distanceTo(end), depth);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
    const mid = start.add(end).multiplyScalar(0.5); this.add(g, color, mid.x, mid.y, mid.z);
  }

  arch(x: number, y: number, z: number, r: number, thick: number, color: string, finish: Finish = 'stone'): void {
    this.add(new THREE.TorusGeometry(r, thick, 4, 14, Math.PI), color, x, y, z, [0, 0, 0], finish);
  }

  gable(x: number, y: number, z: number, w: number, h: number, d: number, color: string): void {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    this.add(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }), color, x, y, z - d / 2);
  }

  window(x: number, y: number, z: number, w: number, h: number, face = 1): void {
    this.box(x, y, z, w + 0.18, h + 0.18, 0.13, C.light);
    this.box(x, y, z + face * 0.08, w, h, 0.08, C.glass, [0, 0, 0], 'glass');
    this.box(x, y, z + face * 0.14, 0.06, h, 0.06, C.white);
    this.box(x, y, z + face * 0.14, w, 0.06, 0.06, C.white);
  }

  bake(materials: Record<Finish, THREE.Material>, resources: Array<{ dispose(): void }>, fineMeshes: THREE.Object3D[]): THREE.Group {
    for (const finish of Object.keys(materials) as Finish[]) for (const fine of [false, true]) {
      const parts = this.parts.filter((p) => p.finish === finish && p.fine === fine).map((p) => p.geo);
      if (!parts.length) continue;
      const geo = mergeGeometries(parts); parts.forEach((g) => g.dispose()); resources.push(geo);
      const m = new THREE.Mesh(geo, materials[finish]);
      m.castShadow = !fine && finish !== 'glass' && finish !== 'surf'; m.receiveShadow = true;
      this.root.add(m); if (fine) fineMeshes.push(m);
    }
    this.parts = [];
    return this.root;
  }
}

export interface SightArt {
  group: THREE.Group;
  vents: Array<{ x: number; z: number }>;
  setQuality(quality: QualityPreset): void;
  update(time: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createSightArt(): SightArt {
  const group = new THREE.Group(); group.name = 'sight-architecture';
  const resources: Array<{ dispose(): void }> = [];
  const fineMeshes: THREE.Object3D[] = [];
  const rng = mulberry32(0x51a47);
  const material = (finish: Finish) => {
    const m = finish === 'rust'
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.28 })
      : new THREE.MeshLambertMaterial({ vertexColors: true, transparent: finish === 'surf', opacity: finish === 'surf' ? 0.7 : 1, depthWrite: finish !== 'surf' });
    applyCutaway(m, (shader) => {
      shader.uniforms.uWindowGlow = windowGlow;
      if (finish === 'surf') {
        shader.uniforms.uSurfTime = waterTime;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSurfTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(position.z * 0.6 + uSurfTime * 0.8) * 0.12;\ntransformed.y += sin(position.x * 0.8 + uSurfTime * 1.4) * 0.035;');
      }
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vArtPosition;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvArtPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vArtPosition;\nuniform float uWindowGlow;');
      const stone = finish === 'stone' || finish === 'church';
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float grain = fract(sin(dot(floor(vArtPosition * 33.0), vec3(12.9898, 78.233, 41.7))) * 43758.5453);
        diffuseColor.rgb *= 0.96 + grain * ${finish === 'rust' ? '0.19' : '0.07'};
        ${stone ? `vec2 block = vec2(vArtPosition.x + vArtPosition.z, vArtPosition.y) * vec2(1.3, 2.4);
        block.x += mod(floor(block.y), 2.0) * 0.5;
        vec2 joint = min(fract(block), 1.0 - fract(block));
        diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.012, 0.045, min(joint.x, joint.y));` : ''}
      `);
      if (finish === 'glass') shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(2.8, 1.35, 0.35) * uWindowGlow;');
    }, `sight-${finish}`, finish === 'church' ? 0.36 : 1);
    resources.push(m); return m;
  };
  const materials: Record<Finish, THREE.Material> = {
    solid: material('solid'), stone: material('stone'), glass: material('glass'), rust: material('rust'), church: material('church'), surf: material('surf'),
  };
  const bake = (s: Sculpture, name: string, x: number, y: number, z: number, rotation = 0) => {
    s.root.name = name; s.root.position.set(x, y, z); s.root.rotation.y = rotation;
    group.add(s.bake(materials, resources, fineMeshes)); return s.root;
  };

  // Castillo de la Mota: all mass stays within the existing 6 x 5 keep collider.
  {
    const s = new Sculpture();
    s.box(0, 1.15, 0, 5.95, 2.3, 4.95, C.shade, [0, 0, 0], 'stone');
    s.box(0, 2.5, 0, 4.7, 0.45, 4.2, C.stone, [0, 0, 0], 'stone');
    s.cyl(0, 4.25, 0, 1.25, 1.75, 3.2, C.stone, 8, 'stone');
    s.cyl(0, 5.95, 0, 1.45, 1.45, 0.3, C.light, 8);
    for (const side of [-1, 1]) {
      s.box(side * 2.5, 1.9, 0, 0.45, 1.1, 4.9, C.stone, [0, 0, 0], 'stone');
      for (let i = 0; i < 7; i++) s.box(-2.65 + i * 0.88, 2.7, side * 2.2, 0.5, 0.55, 0.5, C.light);
      s.box(0, 1.2, side * 2.49, 0.9, 1.7, 0.06, C.iron);
      s.arch(0, 2.05, side * 2.5, 0.45, 0.16, C.light);
    }
    // Sculpted robe, shoulders, head, hair, beard and open hands: a person, not a cross.
    s.cyl(0, 7.8, 0, 0.53, 0.93, 3.4, C.white, 9);
    s.ball(0, 9.2, 0, 0.72, C.white, [1, 0.6, 0.65]);
    s.cyl(0, 9.68, 0, 0.22, 0.25, 0.45, C.white, 8);
    s.ball(0, 10.2, 0.02, 0.46, C.white, [0.8, 1.15, 0.82]);
    s.ball(0, 10.35, -0.16, 0.45, '#d9d2c2', [0.82, 1.07, 0.7]);
    s.ball(0, 10, 0.31, 0.2, C.white, [0.85, 1.1, 0.65]);
    for (const side of [-1, 1]) {
      s.bar([side * 0.4, 9.25, 0], [side * 1.5, 9.1, 0.08], 0.48, C.white);
      s.bar([side * 1.5, 9.1, 0.08], [side * 2.45, 9.5, 0.2], 0.29, C.white);
      s.ball(side * 2.53, 9.55, 0.21, 0.23, C.white, [0.8, 1.2, 0.6]);
    }
    s.fine = true;
    for (let i = -2; i <= 2; i++) s.bar([i * 0.14, 8.9, 0.5], [i * 0.3, 6.25, 0.61], 0.055, '#dbd6c9');
    s.ball(0, 8.9, 0.51, 0.17, '#e2bd88', [0.85, 1.2, 0.5]);
    for (const x of [-2.2, 2.2]) {
      s.box(x, 2.8, -0.6, 0.55, 0.35, 0.9, C.brick);
      s.add(new THREE.CylinderGeometry(0.14, 0.23, 1.55, 8), C.iron, x, 3.15, -0.85, [Math.PI / 2 - 0.15, 0, 0]);
      for (const z of [-0.95, -0.3]) s.add(new THREE.TorusGeometry(0.22, 0.06, 4, 8), C.iron, x + 0.34, 2.8, z, [0, Math.PI / 2, 0]);
    }
    bake(s, 'urgull-castle-and-sacred-heart', 81, SUMMITS.urgull.y, -35);
  }

  // Monte Igueldo's chunky crenellated torreón, replacing the generic cone tower.
  {
    const s = new Sculpture();
    s.cyl(0, 3.5, 0, 1.55, 1.85, 7, C.stone, 12, 'stone');
    for (const y of [0.4, 4.5, 6.5, 7.1]) s.cyl(0, y, 0, 1.8, 1.8, 0.22, C.light, 12);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, x = Math.cos(a), z = Math.sin(a);
      s.box(x * 1.58, 7.55, z * 1.58, 0.55, 0.75, 0.5, C.light, [0, -a, 0]);
      if (i % 3 === 0) s.box(x * 1.64, 5.4, z * 1.64, 0.4, 1.2, 0.06, C.iron, [0, Math.PI / 2 - a, 0]);
    }
    bake(s, 'igueldo-torreon', SUMMITS.igueldo.x - 4, SUMMITS.igueldo.y, SUMMITS.igueldo.z + 5);
  }

  const carousels: THREE.Group[] = [];
  const carousel = (x: number, y: number, z: number, r: number, name: string) => {
    const s = new Sculpture();
    s.cyl(0, 0.15, 0, r, r, 0.3, C.light, 20);
    s.cyl(0, 2.65, 0, r, r, 0.35, C.red, 20);
    const indexedRoof = new THREE.ConeGeometry(r + 0.15, 1.3, 16);
    const roof = indexedRoof.toNonIndexed(); indexedRoof.dispose();
    // Each roof wedge gets its own cream/coral stripe in the same draw.
    const p = roof.attributes.position, cols: number[] = [];
    for (let i = 0; i < p.count; i += 3) {
      const a = Math.atan2(p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2), p.getX(i) + p.getX(i + 1) + p.getX(i + 2));
      const c = new THREE.Color(Math.floor((a + Math.PI) * 8 / Math.PI) % 2 ? C.red : C.white);
      for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b);
    }
    roof.translate(0, 3.4, 0); roof.deleteAttribute('uv'); roof.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const roofMesh = new THREE.Mesh(roof, materials.solid); resources.push(roof); s.root.add(roofMesh);
    s.cyl(0, 3.95, 0, 0.07, 0.16, 0.65, C.gold, 8);
    s.cyl(0, 1.45, 0, 0.18, 0.18, 2.7, C.gold, 8);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, px = Math.cos(a) * (r - 0.5), pz = Math.sin(a) * (r - 0.5);
      s.cyl(px, 1.5, pz, 0.035, 0.035, 2.65, C.gold, 5);
      // Carved toy horses: body, rising neck, muzzle, saddle and four legs.
      const h = new Sculpture();
      h.ball(0, 1.1, 0, 0.35, C.white, [0.5, 0.7, 1.25]);
      h.bar([0, 1.1, 0.2], [0, 1.65, 0.34], 0.2, C.white);
      h.ball(0, 1.6, 0.47, 0.21, C.white, [0.65, 0.75, 1.2]);
      h.box(0, 1.32, -0.08, 0.3, 0.1, 0.3, i % 2 ? C.red : C.glass);
      for (const side of [-1, 1]) for (const end of [-1, 1]) h.bar([side * 0.11, 1.05, end * 0.24], [side * 0.16, 0.65, end * 0.38], 0.07, C.gold);
      s.place(h, px, 0, pz, Math.PI / 2 - a);
      s.fine = true;
      s.ball(px, 2.67, pz, 0.1, C.gold); s.fine = false;
    }
    carousels.push(bake(s, name, x, y, z));
  };
  carousel(SUMMITS.igueldo.x + 3, SUMMITS.igueldo.y, SUMMITS.igueldo.z + 5.5, 2.15, 'igueldo-vintage-carousel');
  carousel(CAROUSEL.x, PROMENADE_Y, CAROUSEL.z, 2.5, 'alderdi-eder-carousel');

  // A small scenic railway hugging the OUTSIDE of the walkable summit rim.
  {
    const s = new Sculpture(), top = SUMMITS.igueldo;
    const pts = Array.from({ length: 25 }, (_, i) => {
      const a = 0.1 + i / 24 * Math.PI * 0.8;
      return new THREE.Vector3(Math.cos(a) * 12.6, 1.8 + Math.sin(i / 24 * Math.PI * 3) * 0.65, Math.sin(a) * 12.6);
    });
    for (const offset of [-0.28, 0.28]) s.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(new THREE.Vector3(0, 0, offset)))), 48, 0.065, 4), C.red);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]; s.bar([p.x, -1.8, p.z], [p.x, p.y, p.z], 0.12, C.iron);
      s.box(p.x, p.y, p.z, 0.7, 0.08, 0.8, C.light);
    }
    bake(s, 'igueldo-scenic-railway', top.x, top.y, top.z);
  }

  // Santa Clara: keeper's cottage fits the existing circular lighthouse footprint.
  const beam = new THREE.Group();
  const beamMaterial = new THREE.MeshBasicMaterial({ color: '#ffe8a9', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  resources.push(beamMaterial);
  {
    const s = new Sculpture(), sc = SUMMITS.santaClara;
    s.box(0, 0.9, 0, 1.25, 1.8, 1.3, C.white);
    s.gable(0, 1.8, 0, 1.5, 0.65, 1.5, C.red);
    s.cyl(0.08, 2.1, -0.1, 0.42, 0.49, 2.8, C.white, 10);
    s.cyl(0.08, 3.35, -0.1, 0.58, 0.58, 0.15, C.light, 12);
    s.cyl(0.08, 3.75, -0.1, 0.37, 0.37, 0.65, C.glass, 10, 'glass');
    s.add(new THREE.ConeGeometry(0.58, 0.4, 10), C.red, 0.08, 4.25, -0.1);
    s.window(-0.31, 0.95, 0.68, 0.28, 0.5);
    s.box(0.3, 0.55, 0.67, 0.32, 1.05, 0.06, C.glass);
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5;
      s.cyl(0.08 + Math.cos(a) * 0.52, 3.58, -0.1 + Math.sin(a) * 0.52, 0.025, 0.025, 0.4, C.iron, 4);
    }
    bake(s, 'santa-clara-lighthouse-house', sc.x + 1, sc.y, sc.z);
    const b = new THREE.ConeGeometry(1.8, 13, 12, 1, true); b.rotateX(-Math.PI / 2); b.translate(0, 0, -6.5); resources.push(b);
    beam.add(new THREE.Mesh(b, beamMaterial)); beam.position.set(sc.x + 1.08, sc.y + 3.7, sc.z - 0.1); group.add(beam);
    const shore = new Sculpture();
    const beach = new THREE.CircleGeometry(2.1, 16); beach.rotateX(-Math.PI / 2); beach.scale(1, 1, 0.6);
    shore.add(beach, '#edd5a0', sc.x + 3.9, 0.27, sc.z + 6.6);
    for (let i = 0; i < 9; i++) shore.box(sc.x + 3.5, 0.8, sc.z + 1.7 + i * 0.46, 1.4, 0.12, 0.4, i % 2 ? '#997958' : '#b38e63');
    for (const side of [-1, 1]) for (const z of [2, 5]) shore.cyl(sc.x + 3.5 + side * 0.55, 0.6, sc.z + z, 0.08, 0.1, 1.3, C.iron, 6);
    bake(shore, 'santa-clara-beach-and-landing', 0, 0, 0);
  }

  // Basílica: a carved retablo facade, paired bell towers and scalloped crest.
  {
    const s = new Sculpture();
    s.box(0, 5.6, -2.1, 5.5, 11.2, 5.4, C.stone, [0, 0, 0], 'stone');
    s.gable(0, 11.2, -2.1, 5.7, 2.3, 5.7, C.roof);
    for (const face of [1]) {
      const facade = new Sculpture();
      facade.box(0, 5.65, 0, 4.5, 11.3, 0.32, C.stone, [0, 0, 0], 'church');
      facade.box(0, 1.55, 0.22, 1.75, 3.1, 0.15, '#59422e');
      facade.arch(0, 3.1, 0.25, 0.87, 0.22, C.light, 'church');
      for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
        const x = side * (1.2 + i * 0.58);
        facade.cyl(x, 2.8, 0.35, 0.15, 0.19, 4.8, C.light, 8, 'church');
        for (const y of [0.4, 5.2]) facade.box(x, y, 0.35, 0.5, 0.25, 0.5, C.light);
      }
      for (const y of [5.5, 8.45, 10.6]) facade.box(0, y, 0.35, y === 5.5 ? 4.3 : 3.4, 0.26, 0.7, C.light);
      facade.box(0, 6.75, 0.2, 0.95, 1.75, 0.15, C.shade);
      facade.arch(0, 7.6, 0.28, 0.5, 0.14, C.light, 'church');
      facade.cyl(0, 6.55, 0.38, 0.18, 0.32, 1, C.white, 7);
      facade.ball(0, 7.23, 0.39, 0.23, C.white);
      facade.add(new THREE.TorusGeometry(0.68, 0.18, 5, 20), C.light, 0, 9.45, 0.3);
      facade.add(new THREE.CircleGeometry(0.53, 18), C.glass, 0, 9.45, 0.32, [0, 0, 0], 'glass');
      facade.box(0, 9.45, 0.36, 0.07, 1, 0.06, C.gold); facade.box(0, 9.45, 0.36, 1, 0.07, 0.06, C.gold);
      facade.gable(0, 10.7, 0.05, 3.9, 1.7, 0.65, C.stone);
      for (const side of [-1, 1]) {
        facade.add(new THREE.TorusGeometry(0.45, 0.15, 4, 12, Math.PI * 1.5), C.light, side * 1.85, 11.05, 0.3, [0, 0, side < 0 ? 0 : Math.PI / 2]);
        facade.cyl(side * 1.83, 11.8, 0.15, 0.03, 0.2, 0.85, C.light, 6);
      }
      facade.box(0, 12.8, 0.1, 0.12, 1.1, 0.16, C.iron); facade.box(0, 13, 0.1, 0.65, 0.12, 0.16, C.iron);
      facade.fine = true;
      for (let i = -3; i <= 3; i++) for (const y of [5.85, 8.8]) facade.ball(i * 0.44, y, 0.48, 0.15, C.gold, [1, 0.7, 0.5]);
      for (const x of [-0.45, 0, 0.45]) for (const y of [0.8, 1.6, 2.4]) facade.box(x, y, 0.34, 0.34, 0.55, 0.08, '#785536');
      // Narrower cutaway on the retablo preserves its silhouette around the crew.
      facade.recoat('solid', 'church'); facade.recoat('stone', 'church');
      // A matching inner retablo is revealed when the foreground nave peels away.
      // It reads from the follow camera, while the south portal remains for the photo.
      s.place(facade.copy(), 0, 0, 0.55, Math.PI);
      s.place(facade, 0, 0, face > 0 ? 0.95 : -4.85, face > 0 ? 0 : Math.PI);
    }
    for (const x of [-2.3, 2.3]) {
      s.box(x, 7, 0.5, 1.85, 14, 1.85, C.stone, [0, 0, 0], 'church');
      for (const y of [8, 12.7, 14.15]) s.box(x, y, 0.5, 2.15, 0.28, 2.15, C.light, [0, 0, 0], 'church');
      for (const face of [-1, 1]) {
        s.box(x, 13.25, 0.5 + face * 0.95, 0.72, 1.35, 0.05, C.iron, [0, 0, 0], 'church');
        s.arch(x, 13.9, 0.5 + face * 0.99, 0.35, 0.13, C.light, 'church');
        s.add(new THREE.SphereGeometry(0.22, 8, 5), C.gold, x, 13.15, 0.5 + face * 1.02);
      }
      s.cyl(x, 14.65, 0.5, 0.8, 0.9, 0.9, C.shade, 8, 'church');
      s.add(new THREE.SphereGeometry(0.88, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.roof, x, 15.1, 0.5);
      s.cyl(x, 16.15, 0.5, 0.04, 0.15, 0.9, C.gold, 6);
    }
    bake(s, 'santa-maria-baroque-facades', (BASILICA_BLOCK.minX + BASILICA_BLOCK.maxX) / 2, PROMENADE_Y, 0);
  }

  // Miramar: red brick, pale stone, steep crossing gables and exposed timber.
  {
    const s = new Sculpture(), mid = (MIRAMAR.from + MIRAMAR.to) / 2, n = shoreNormal(mid), p = bayPoint(mid, 28.5);
    s.box(0, 3.7, 0, 8.5, 7.4, 5.5, C.brick, [0, 0, 0], 'stone');
    s.box(0, 6.3, 0, 8.55, 1.6, 5.55, C.white);
    s.gable(0, 7.4, 0, 9, 2.7, 5.9, C.roof);
    for (const x of [-2.7, 0, 2.7]) {
      s.box(x, 6.7, 2.85, 2.25, 1.8, 0.22, C.white);
      s.gable(x, 7.5, 2.85, 2.6, 2.1, 0.7, C.white);
      s.bar([x - 1.35, 7.5, 3.25], [x, 9.7, 3.25], 0.17, C.roof);
      s.bar([x, 9.7, 3.25], [x + 1.35, 7.5, 3.25], 0.17, C.roof);
      s.box(x, 8.4, 3.25, 0.13, 2, 0.1, C.roof);
      for (const y of [2, 4.6, 6.6]) s.window(x, y, 2.88, 1.1, 1.5);
    }
    for (const x of [-4, 4]) {
      s.box(x, 4, 0, 0.28, 8, 5.6, C.light);
      s.box(x * 0.7, 9.4, -1, 0.6, 2.9, 0.65, C.brick);
      s.box(x * 0.7, 10.9, -1, 0.85, 0.2, 0.85, C.light);
    }
    for (let i = -4; i <= 4; i++) s.box(i, 6.6, 2.83, 0.11, 1.5, 0.1, C.roof);
    s.box(0, 0.65, 2.86, 1, 1.3, 0.1, C.iron);
    bake(s, 'miramar-half-timbered-palace', p.x, PROMENADE_Y, p.z, Math.atan2(-n.x, -n.z));
  }

  // Bretxa's ashlar arcade and iron clerestory; symbolic produce, no real branding.
  {
    const s = new Sculpture();
    s.box(0, 2.8, 0, 6.6, 5.6, 6.4, C.stone, [0, 0, 0], 'stone');
    s.gable(0, 5.6, 0, 7, 1.8, 6.8, '#537a6a');
    s.box(0, 5.5, 0, 6.95, 0.3, 6.75, C.light);
    for (const face of [-1, 1]) for (let i = -1; i <= 1; i++) {
      const x = i * 2.05, z = face * 3.23;
      s.box(x, 1.5, z, 1.45, 2.9, 0.06, C.glass, [0, 0, 0], 'glass');
      s.arch(x, 2.95, z + face * 0.05, 0.72, 0.15, C.light);
      s.box(x, 3.8, z, 1.7, 0.18, 0.2, C.light);
      for (const dx of [-0.84, 0.84]) s.box(x + dx, 1.9, z, 0.18, 3.8, 0.23, C.light);
    }
    s.box(0, 6, -3.27, 3.8, 0.85, 0.1, C.glass, [0, 0, 0], 'glass');
    for (let i = -4; i <= 4; i++) s.box(i * 0.43, 6, -3.34, 0.06, 0.85, 0.06, C.iron);
    // An original fish relief acts as a market sign, without lettering or branding.
    s.ball(0, 6.4, -3.55, 0.3, C.gold, [1.7, 0.65, 0.3]);
    s.gable(0.65, 6.15, -3.55, 0.45, 0.5, 0.1, C.gold);
    // Crates fit just inside the market footprint, leaving the lane open.
    s.fine = true;
    for (let i = -1; i <= 1; i++) {
      s.box(i * 1.8, 0.45, -2.9, 1.3, 0.9, 0.5, '#9c7650');
      for (let j = 0; j < 6; j++) s.ball(i * 1.8 - 0.48 + j * 0.19, 0.99, -2.9, 0.14, [C.red, '#6f984d', C.gold][i + 1]);
    }
    bake(s, 'bretxa-ashlar-market', 88.5, PROMENADE_Y, 18.6);
  }

  // Plaza arcades and continuous ochre elevations follow the ORIGINAL block faces.
  {
    const arcades = new Sculpture();
    const faces = [{ x: 78.5, z: 2.03, a: 0 }, { x: 78.5, z: 14.97, a: Math.PI }, { x: 72.03, z: 8.5, a: Math.PI / 2 }, { x: 84.97, z: 8.5, a: -Math.PI / 2 }];
    for (let f = 0; f < faces.length; f++) {
      const s = new Sculpture();
      s.box(0, 6.8, 0.08, 10, 7.7, 0.12, '#d6aa68');
      for (const y of [3.1, 6.45, 9.6, 10.6]) s.box(0, y, 0.03, 10.2, 0.2, 0.3, C.white);
      for (let i = 0; i < 4; i++) {
        const x = -3 + i * 2;
        s.box(x, 1.35, 0.16, 1.55, 2.6, 0.06, '#60594a');
        s.arch(x, 2.05, 0.2, 0.78, 0.14, C.white);
        for (const dx of [-0.94, 0.94]) s.box(x + dx, 1.5, 0.04, 0.2, 3, 0.25, C.white);
        for (const y of [4.8, 7.95]) {
          s.window(x, y, 0.19, 0.84, 1.8);
          s.box(x, y - 0.9, 0.25, 1.45, 0.12, 0.6, C.light);
          s.box(x, y - 0.22, 0.51, 1.45, 0.07, 0.06, C.iron);
          s.fine = true;
          for (let j = -3; j <= 3; j++) s.box(x + j * 0.21, y - 0.5, 0.51, 0.035, 0.65, 0.04, C.iron);
          s.fine = false;
        }
      }
      // Clock facade on the end elevation seen by the discovery camera.
      if (f === 1) {
        s.box(0, 11.1, 0.65, 3.4, 1.5, 0.4, C.white);
        s.gable(0, 11.8, 0.65, 3.8, 1.15, 0.5, C.light);
        s.add(new THREE.CircleGeometry(0.6, 24), C.white, 0, 11.12, 0.89);
        s.add(new THREE.TorusGeometry(0.62, 0.07, 4, 24), C.iron, 0, 11.12, 0.93);
        s.bar([0, 11.12, 0.97], [-0.28, 11.3, 0.97], 0.045, C.iron);
        s.bar([0, 11.12, 0.97], [0.12, 11.56, 0.97], 0.04, C.iron);
      }
      arcades.place(s, faces[f].x, PROMENADE_Y, faces[f].z, faces[f].a);
    }
    bake(arcades, 'plaza-arcades-and-clock', 0, 0, 0);
  }

  // Former casino: bay windows, ceremonial centre, corner cupolas and stone balustrades.
  {
    const s = new Sculpture(), t = TOWN_HALL;
    for (const face of [-1, 1]) {
      const z = face * 3.56;
      for (const y of [0.5, 4.1, 8.3, 10.9]) s.box(0, y, z, 15.2, 0.27, 0.35, C.light);
      for (let i = -3; i <= 3; i++) {
        const x = i * 1.95;
        s.box(x, 2, z, 1, 2.5, 0.08, C.glass, [0, 0, 0], 'glass');
        s.arch(x, 3.25, z, 0.52, 0.14, C.light);
        s.window(x, 6.2, z, 0.9, 2.1, face);
        s.box(x, 7.8, z, 1.25, 0.18, 0.3, C.light);
      }
    }
    for (const x of [-5.9, 5.9]) {
      s.cyl(x, 15.05, -0.2, 1.5, 1.6, 1.1, C.stone, 8, 'stone');
      s.add(new THREE.SphereGeometry(1.65, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), '#637f81', x, 15.55, -0.2);
      s.cyl(x, 17.3, -0.2, 0.09, 0.19, 1, C.gold, 6);
      for (const face of [-1, 1]) s.window(x, 12.6, face * 1.85 - 0.2, 0.8, 1.8, face);
    }
    s.gable(0, 11, -3.55, 4.5, 2, 0.55, C.light);
    s.add(new THREE.CircleGeometry(0.63, 20), C.white, 0, 11.7, -3.87, [0, Math.PI, 0]);
    s.box(0, 11.83, -3.94, 0.05, 0.5, 0.06, C.iron);
    s.box(-0.18, 11.7, -3.94, 0.4, 0.05, 0.06, C.iron);
    s.fine = true;
    for (let i = -14; i <= 14; i++) s.cyl(i * 0.5, 11.6, -3.6, 0.05, 0.08, 0.9, C.light, 5);
    s.box(0, 12.1, -3.6, 14.5, 0.12, 0.24, C.light);
    bake(s, 'ayuntamiento-casino-ornament', t.x, PROMENADE_Y, t.z);
  }

  // The promenade clock stands on the seaward side of the existing railing.
  // The already detailed white curls remain untouched.
  {
    const s = new Sculpture(), p = bayPoint(-16, 8.85), n = shoreNormal(-16);
    s.cyl(0, 1.65, 0, 0.07, 0.14, 3.3, C.white, 8);
    s.cyl(0, 0.2, 0, 0.24, 0.3, 0.4, C.light, 8);
    for (const face of [-1, 1]) {
      s.add(new THREE.CircleGeometry(0.56, 24), C.white, 0, 3.45, face * 0.085, [0, face < 0 ? Math.PI : 0, 0]);
      s.add(new THREE.TorusGeometry(0.58, 0.075, 5, 24), C.iron, 0, 3.45, face * 0.11);
      s.bar([0, 3.45, face * 0.13], [-0.25, 3.62, face * 0.13], 0.045, C.iron);
      s.bar([0, 3.45, face * 0.13], [0.15, 3.87, face * 0.13], 0.04, C.iron);
      s.fine = true;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        s.box(Math.sin(a) * 0.46, 3.45 + Math.cos(a) * 0.46, face * 0.13, 0.035, 0.07, 0.02, C.iron, [0, 0, -a]);
      }
      s.fine = false;
    }
    s.ball(0, 4.12, 0, 0.12, C.gold);
    bake(s, 'la-concha-promenade-clock', p.x, PROMENADE_Y, p.z, Math.atan2(n.x, n.z));
  }

  // Zurriola: original striped boards mounted flush to the existing sea wall.
  // Their shallow relief stays inside the wall's collision clearance, away from the ramp.
  {
    const s = new Sculpture();
    for (let i = 0; i < 4; i++) {
      const board = new THREE.CapsuleGeometry(0.3, 1.7, 3, 8); board.scale(1, 1, 0.12);
      const x = 130 + i * 0.85, z = ZURRIOLA.wallZ - 0.54;
      s.add(board, [C.red, C.gold, '#68b5b1', C.white][i], x, 1.55, z, [0, 0, (i - 1.5) * 0.08]);
      s.box(x, 1.55, z - 0.05, 0.08, 1.7, 0.025, C.white);
    }
    for (const x of [128.5, 134]) s.box(x, 0.8, ZURRIOLA.wallZ - 0.52, 0.1, 0.1, 0.08, C.iron);
    for (const x of [114, 140]) {
      s.add(new THREE.TorusGeometry(0.35, 0.09, 5, 16), C.white, x, 1.1, ZURRIOLA.wallZ - 0.55);
      for (const side of [-1, 1]) s.box(x + side * 0.32, 1.1, ZURRIOLA.wallZ - 0.6, 0.14, 0.2, 0.12, C.red);
    }
    bake(s, 'zurriola-surfboard-wall-and-lifebuoys', 0, 0, 0);
  }

  // Low stone overlooks and benches outside the hilltop walk boundaries.
  {
    const s = new Sculpture(), top = SUMMITS.urgull;
    for (const a of [0.15, 2.8]) {
      const x = top.x + Math.cos(a) * (top.r + 0.4), z = top.z + Math.sin(a) * (top.r + 0.4);
      const bench = new Sculpture();
      for (let i = 0; i < 4; i++) {
        bench.box(0, 0.5, -0.2 + i * 0.13, 1.7, 0.07, 0.1, '#8d9d82');
        bench.box(0, 0.75 + i * 0.12, -0.28, 1.7, 0.07, 0.07, '#8d9d82');
      }
      for (const side of [-1, 1]) bench.box(side * 0.62, 0.25, 0, 0.1, 0.5, 0.5, C.iron);
      s.place(bench, x, top.y - 0.15, z, Math.PI / 2 - a);
    }
    // A ribbon of switchback path follows the wooded slope, below the plateau.
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const a = -0.4 + i / 32 * 2.8, r = 12.2 + Math.sin(i / 32 * Math.PI * 2) * 1.7;
      const x = top.x + Math.cos(a) * r, z = top.z + Math.sin(a) * r;
      path.push(new THREE.Vector3(x, hillSurface(LANDMARKS.urgull, x, z) + 0.15, z));
    }
    const ribbon = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 48, 0.3, 4); s.add(ribbon, '#bdb08b');
    bake(s, 'urgull-woodland-path-and-lookouts', 0, 0, 0);
  }

  // Corten claws have a square forged section and three distinct spatial curls.
  const peine = peineLayout();
  const vents: Array<{ x: number; z: number }> = [];
  {
    const s = new Sculpture();
    peine.sculptures.forEach((p, i) => {
      const comb = new Sculpture();
      const shape = new THREE.Shape(); const w = 0.34;
      shape.moveTo(-w / 2, -w / 2); shape.lineTo(w / 2, -w / 2); shape.lineTo(w / 2, w / 2); shape.lineTo(-w / 2, w / 2); shape.closePath();
      for (let j = 0; j < 3; j++) {
        const a = j * Math.PI * 2 / 3 + i * 0.4;
        const pts = [[0, 0, 0], [0, 1.2, 0], [Math.cos(a) * 0.8, 2.5, Math.sin(a) * 0.8], [Math.cos(a) * 1.6, 2.65, Math.sin(a) * 1.6], [Math.cos(a) * 1.8, 1.8, Math.sin(a) * 1.8], [Math.cos(a) * 1.0, 1.5, Math.sin(a) * 1.0]].map((q) => new THREE.Vector3(...q));
        comb.add(new THREE.ExtrudeGeometry(shape, { steps: 20, bevelEnabled: false, extrudePath: new THREE.CatmullRomCurve3(pts, false, 'centripetal') }), j === 1 ? '#ae5b32' : C.rust, 0, 0, 0, [0, 0, 0], 'rust');
      }
      const rock = new THREE.DodecahedronGeometry(1.9 + i * 0.2, 0); rock.scale(1.2, 0.6, 1);
      comb.add(rock, '#9c9787', 0, -0.65, 0);
      const root = bake(comb, `peine-corten-comb-${i}`, p.x, 0.9, p.z); root.rotation.y = i * 1.4;
      // Lacing of white water around each rock, animated by the shared frozen clock.
      const foam = new THREE.TorusGeometry(2.1 + i * 0.15, 0.055, 3, 26, Math.PI * 1.65); foam.rotateX(-Math.PI / 2);
      s.add(foam, '#ddf6ea', p.x, 0.13, p.z, [0, 0, 0], 'surf');
    });
    // Flush blowhole grilles avoid introducing obstacles in the existing plaza.
    for (let i = -2; i <= 2; i++) {
      const x = peine.C.x + peine.inland.x * i * 1.15, z = peine.C.z + peine.inland.z * i * 1.15;
      vents.push({ x, z });
      s.cyl(x, PROMENADE_Y + 0.012, z, 0.19, 0.19, 0.025, C.iron, 10);
      s.fine = true;
      for (let j = -1; j <= 1; j++) s.box(x + j * 0.09, PROMENADE_Y + 0.03, z, 0.025, 0.025, 0.34, C.light);
      s.fine = false;
    }
    // Shallow granite courses inset into the platform perimeter, below foot level.
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.TorusGeometry(peine.r + i * 0.22, 0.07, 3, 40); ring.rotateX(-Math.PI / 2);
      s.add(ring, i % 2 ? '#d1c2ac' : '#a69a87', peine.C.x, PROMENADE_Y - 0.12 - i * 0.18, peine.C.z);
    }
    bake(s, 'peine-granite-vents-and-surf', 0, 0, 0);
  }

  // Seeded wooded slopes: two instanced draws, with fewer crowns on phones.
  const trunks: THREE.Matrix4[] = [], crowns: THREE.Matrix4[] = [], crownColors: THREE.Color[] = [];
  const dummy = new THREE.Object3D();
  for (const name of ['urgull', 'igueldo', 'santaClara'] as const) {
    const h = LANDMARKS[name], top = SUMMITS[name], count = name === 'santaClara' ? 15 : 32;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, r = top.r + 1.5 + rng() * (h.radius * 0.85 - top.r - 1.5);
      const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
      // Leave the funicular's east approach and the island landing clear.
      if ((name === 'igueldo' && x > h.x + 5 && Math.abs(z - h.z) < 7) || (name === 'santaClara' && x > h.x && z > h.z)) continue;
      const y = Math.min(top.y - 0.7, hillSurface(h, x, z)), size = 0.75 + rng() * 0.55;
      dummy.position.set(x, y + 0.65, z); dummy.rotation.set(0, a, 0); dummy.scale.set(0.16, 1.3, 0.16); dummy.updateMatrix(); trunks.push(dummy.matrix.clone());
      dummy.position.y = y + 1.7; dummy.scale.set(size * 1.2, size, size); dummy.updateMatrix(); crowns.push(dummy.matrix.clone());
      crownColors.push(new THREE.Color(['#567c50', '#6e9359', '#829f64'][i % 3]));
    }
  }
  const treeMeshes: THREE.InstancedMesh[] = [];
  const treeOrder = [...trunks.keys()].filter((i) => i % 2 === 0).concat([...trunks.keys()].filter((i) => i % 2 !== 0));
  for (const [matrices, geo, mat] of [[trunks, new THREE.CylinderGeometry(0.5, 0.7, 1, 5), new THREE.MeshLambertMaterial({ color: '#806249' })], [crowns, new THREE.IcosahedronGeometry(1, 0), applyCutaway(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }))]] as const) {
    const m = new THREE.InstancedMesh(geo, mat, matrices.length);
    treeOrder.forEach((index, i) => { m.setMatrixAt(i, matrices[index]); if (matrices === crowns) m.setColorAt(i, crownColors[index]); });
    m.castShadow = m.receiveShadow = true; group.add(m); resources.push(m, geo, mat); treeMeshes.push(m);
  }

  // Flags use a single seeded, shader-driven batch; waterTime freezes with reduced motion.
  {
    const flags = new Sculpture();
    for (const [x, y, z] of [[81, 19.2, -36.8], [42, 14, 15.5], [-122, 34, -13]]) {
      flags.cyl(x, y, z, 0.035, 0.035, 3, C.iron, 5);
      flags.box(x + 0.48, y + 0.85, z, 0.95, 0.6, 0.025, C.red);
      flags.box(x + 0.48, y + 0.85, z + 0.02, 0.95, 0.14, 0.03, C.white);
      flags.box(x + 0.48, y + 0.85, z + 0.04, 0.14, 0.6, 0.03, '#4b8467');
    }
    const flagMat = applyCutaway(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), (shader) => {
      shader.uniforms.uFlagTime = waterTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uFlagTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(position.x * 6.0 + uFlagTime * 1.8) * 0.055;');
    }, 'sight-flags'); resources.push(flagMat);
    group.add(flags.bake({ ...materials, solid: flagMat }, resources, fineMeshes));
  }

  return {
    group, vents,
    setQuality(quality) {
      for (const m of fineMeshes) m.visible = quality !== 'low';
      for (const m of treeMeshes) m.count = quality === 'low' ? Math.ceil(trunks.length * 0.6) : trunks.length;
    },
    update(time, reducedMotion) {
      for (const c of carousels) c.rotation.y = reducedMotion ? 0 : time * 0.17;
      beam.rotation.y = reducedMotion ? 0.7 : time * 0.12;
      beamMaterial.opacity = windowGlow.value * 0.065;
      beam.visible = windowGlow.value > 0.05;
    },
    dispose() { for (const r of resources) r.dispose(); },
  };
}
