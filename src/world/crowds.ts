import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BAY_EAST, BAY_WEST, PROMENADE_Y, bayPoint } from './map.ts';
import { mulberry32 } from '../engine/random.ts';

/** Simplified toy townsfolk: five instanced draws, regardless of population. */
const MAX = 40;
const COLOURS = ['#e9846b', '#7cc4a4', '#6f86c9', '#f0b84c', '#c48ab0', '#8fb3a6', '#d9c19a', '#5a6f8f', '#e86f8e', '#f2efe6'];
const SKINS = ['#e8b48f', '#c99272', '#f2c9a8', '#a87458', '#f0c4a0'];
const HAIR = ['#49352d', '#b87d49', '#66534a', '#e0bd7e', '#302b30', '#9b6045'];

interface Person {
  role: 'stroller' | 'shopper' | 'night';
  x0: number;
  d: number;
  speed: number;
  dir: 1 | -1;
  spot: { x: number; z: number };
  phase: number;
}

export class Crowds {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh;
  private hats: THREE.InstancedMesh;
  private details: THREE.InstancedMesh;
  private meshes: THREE.InstancedMesh[];
  private people: Person[] = [];
  private tmp = new THREE.Object3D();
  private palette = COLOURS.map((c) => new THREE.Color(c));
  private skins = SKINS.map((c) => new THREE.Color(c));
  private hairColours = HAIR.map((c) => new THREE.Color(c));
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private time = 0;
  /** 0..1, set from the quality preset. */
  density = 1;

  constructor() {
    // Bake tiny arms, ears, feet and eyes into their material's shared geometry.
    const ball = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const geo = new THREE.SphereGeometry(1, 8, 6);
      geo.scale(sx, sy, sz);
      geo.translate(x, y, z);
      return geo;
    };
    const merged = (parts: THREE.BufferGeometry[]) => {
      const geo = mergeGeometries(parts)!;
      parts.forEach((g) => g.dispose());
      return geo;
    };
    const bodyGeo = merged([
      ball(0, 0.55, 0, 0.25, 0.32, 0.22),
      ball(-0.25, 0.56, 0, 0.09, 0.2, 0.1),
      ball(0.25, 0.56, 0, 0.09, 0.2, 0.1),
    ]);
    const headGeo = merged([
      ball(0, 1.13, 0, 0.34, 0.33, 0.32),
      ball(-0.33, 1.12, 0, 0.055, 0.065, 0.055),
      ball(0.33, 1.12, 0, 0.055, 0.065, 0.055),
    ]);
    const hairGeo = new THREE.SphereGeometry(0.355, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    hairGeo.scale(1, 0.92, 0.98);
    hairGeo.rotateX(-0.2);
    hairGeo.translate(0, 1.18, -0.025);
    const hatGeo = merged([
      ball(0, 1.39, -0.015, 0.34, 0.13, 0.3),
      ball(0, 1.33, 0.08, 0.39, 0.035, 0.37),
    ]);
    const detailGeo = merged([
      ball(-0.12, 0.22, 0, 0.08, 0.14, 0.09),
      ball(0.12, 0.22, 0, 0.08, 0.14, 0.09),
      ball(-0.12, 0.11, 0.055, 0.105, 0.08, 0.15),
      ball(0.12, 0.11, 0.055, 0.105, 0.08, 0.15),
      // Eyes sit slightly upward on the front, readable from the promenade camera.
      ball(-0.115, 1.14, 0.3, 0.032, 0.043, 0.024),
      ball(0.115, 1.14, 0.3, 0.032, 0.043, 0.024),
    ]);
    const coloured = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const ink = new THREE.MeshBasicMaterial({ color: '#3b3034' });
    this.mats.push(coloured, ink);
    const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      this.geos.push(geo);
      const mesh = new THREE.InstancedMesh(geo, mat, MAX);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return mesh;
    };
    this.bodies = instanced(bodyGeo, coloured);
    this.heads = instanced(headGeo, coloured);
    this.hair = instanced(hairGeo, coloured);
    this.hats = instanced(hatGeo, coloured);
    this.details = instanced(detailGeo, ink);
    this.meshes = [this.bodies, this.heads, this.hair, this.hats, this.details];
    this.bodies.castShadow = true;
    const rng = mulberry32(777);
    const nightSpots = [
      { x: 82.6, z: 7.2 },
      { x: 78.5, z: 12.6 },
      { x: 74.4, z: 9.8 },
      { x: 63.5, z: 3.5 },
      { x: 88, z: 3.4 },
      { x: 58.5, z: 13.5 },
    ];
    for (let i = 0; i < MAX; i++) {
      const role: Person['role'] = i < 22 ? 'stroller' : i < 28 ? 'shopper' : 'night';
      const spot = role === 'shopper' ? { x: 86 + rng() * 5, z: 12.4 + rng() * 0.8 } : nightSpots[i % nightSpots.length];
      this.people.push({
        role,
        x0: BAY_WEST + rng() * (BAY_EAST - BAY_WEST),
        d: 10 + rng() * 4.5,
        speed: 0.9 + rng() * 0.6,
        dir: rng() < 0.5 ? 1 : -1,
        spot: { x: spot.x + (rng() - 0.5) * 1.6, z: spot.z + (rng() - 0.5) * 1.2 },
        phase: rng() * 10,
      });
    }
    this.group.add(...this.meshes);
  }

  update(dt: number, hour: number, reducedMotion: boolean): void {
    this.time += dt;
    let n = 0;
    let hats = 0;
    const day = hour >= 8.5 && hour < 20.5;
    const morning = hour >= 8 && hour < 13.5;
    const night = hour >= 20 || hour < 1;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      if (i / this.people.length > this.density) continue;
      let visible = false;
      let x = 0;
      let z = 0;
      let heading = 0;
      if (p.role === 'stroller' && day) {
        p.x0 += p.dir * p.speed * dt * 0.9;
        if (p.x0 > BAY_EAST - 2) p.dir = -1;
        if (p.x0 < BAY_WEST + 2) p.dir = 1;
        const a = bayPoint(p.x0, p.d);
        const b = bayPoint(p.x0 + p.dir * 0.5, p.d);
        x = a.x;
        z = a.z;
        heading = Math.atan2(b.x - a.x, b.z - a.z);
        visible = true;
      } else if (p.role === 'shopper' && morning) {
        x = p.spot.x + Math.sin(hour * 3 + p.phase) * 0.4;
        z = p.spot.z;
        heading = Math.PI;
        visible = true;
      } else if (p.role === 'night' && night) {
        x = p.spot.x;
        z = p.spot.z;
        heading = p.phase;
        visible = true;
      }
      if (!visible) continue;
      const gait = this.time * p.speed * 7 + p.phase;
      const bob = reducedMotion ? 0 : (1 - Math.cos(gait * 2)) * (p.role === 'stroller' ? 0.025 : 0.005);
      this.tmp.position.set(x, PROMENADE_Y + bob, z);
      this.tmp.rotation.set(0, heading, reducedMotion ? 0 : Math.sin(gait) * (p.role === 'stroller' ? 0.035 : 0.015));
      this.tmp.scale.set(1.25, 1.25 + (i % 3 - 1) * 0.06, 1.25);
      this.tmp.updateMatrix();
      this.bodies.setMatrixAt(n, this.tmp.matrix);
      this.heads.setMatrixAt(n, this.tmp.matrix);
      this.hair.setMatrixAt(n, this.tmp.matrix);
      this.details.setMatrixAt(n, this.tmp.matrix);
      // Every appearance follows its person as the active population shuffles.
      this.bodies.setColorAt(n, this.palette[i % this.palette.length]);
      this.heads.setColorAt(n, this.skins[i % this.skins.length]);
      this.hair.setColorAt(n, this.hairColours[i % this.hairColours.length]);
      if (i % 3 === 0) {
        this.hats.setMatrixAt(hats, this.tmp.matrix);
        this.hats.setColorAt(hats, this.palette[(i + 3) % this.palette.length]);
        hats++;
      }
      n++;
    }
    for (const mesh of this.meshes) {
      mesh.count = mesh === this.hats ? hats : n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
