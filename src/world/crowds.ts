import * as THREE from 'three';
import { BAY_EAST, BAY_WEST, PROMENADE_Y, bayPoint } from './map.ts';
import { mulberry32 } from '../engine/random.ts';

/**
 * Background people. Strollers drift along the promenade by day, shoppers
 * gather at the market in the morning, and little clusters chat outside the
 * bars at night. One instanced mesh for bodies and one for heads.
 */
const MAX = 40;
const COLOURS = ['#e9846b', '#7cc4a4', '#6f86c9', '#f0b84c', '#c48ab0', '#8fb3a6', '#d9c19a', '#5a6f8f', '#e86f8e', '#f2efe6'];

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
  private people: Person[] = [];
  private tmp = new THREE.Object3D();
  private palette = COLOURS.map((c) => new THREE.Color(c));
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  /** 0..1, set from the quality preset. */
  density = 1;

  constructor() {
    const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.75, 3, 8);
    bodyGeo.translate(0, 0.65, 0);
    const headGeo = new THREE.SphereGeometry(0.26, 10, 8);
    headGeo.translate(0, 1.5, 0);
    this.geos.push(bodyGeo, headGeo);
    const bodyMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const headMat = new THREE.MeshLambertMaterial({ color: '#e8b48f' });
    this.mats.push(bodyMat, headMat);
    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, MAX);
    this.bodies.castShadow = true;
    this.bodies.frustumCulled = false;
    this.heads.frustumCulled = false;
    const rng = mulberry32(777);
    const skins = ['#e8b48f', '#c99272', '#f2c9a8', '#a87458', '#f0c4a0'];
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
      this.bodies.setColorAt(i, new THREE.Color(COLOURS[i % COLOURS.length]));
      this.heads.setColorAt(i, new THREE.Color(skins[i % skins.length]));
    }
    this.group.add(this.bodies, this.heads);
  }

  update(dt: number, hour: number, reducedMotion: boolean): void {
    let n = 0;
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
        // Walk along the promenade, turning round at the ends.
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
      const bob = reducedMotion ? 0 : Math.abs(Math.sin(hour * 400 * p.speed + p.phase)) * (p.role === 'stroller' ? 0.05 : 0.01);
      this.tmp.position.set(x, PROMENADE_Y + bob, z);
      this.tmp.rotation.set(0, heading, p.role === 'night' && !reducedMotion ? Math.sin(hour * 60 + p.phase) * 0.04 : 0);
      this.tmp.scale.setScalar(1.25);
      this.tmp.updateMatrix();
      this.bodies.setMatrixAt(n, this.tmp.matrix);
      this.heads.setMatrixAt(n, this.tmp.matrix);
      // Keep each person's colours with them as the visible list shuffles.
      this.bodies.setColorAt(n, this.palette[i % this.palette.length]);
      n++;
    }
    this.bodies.count = n;
    this.heads.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.bodies.dispose();
    this.heads.dispose();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
