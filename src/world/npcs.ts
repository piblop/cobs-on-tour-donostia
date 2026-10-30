import * as THREE from 'three';
import { batchStaticParts } from '../engine/meshParts.ts';
import { outlineMaterial } from './materials.ts';
import { PROMENADE_Y } from './map.ts';

/** Background encounter characters, built and animated procedurally. */
export interface Npcs {
  group: THREE.Group;
  dog: THREE.Group;
  musician: THREE.Group;
  gulls: THREE.Group[];
  /** Point the dog at a spot to trot to (null: wander). */
  dogTarget: THREE.Vector3 | null;
  /** Send one gull swooping past a point. */
  swoop(at: THREE.Vector3): void;
  update(dt: number, time: number, reducedMotion: boolean): void;
  dispose(): void;
}

export function createNpcs(): Npcs {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const M = (c: string, unlit = false) => {
    const m = unlit ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c });
    mats.push(m);
    return m;
  };
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, outline = false) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = outline;
    if (outline) {
      const hull = new THREE.Mesh(geo, outlineMaterial);
      hull.scale.setScalar(1.035);
      m.add(hull);
    }
    parent.add(m);
    return m;
  };
  const ball = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, outline = false) => {
    const m = part(parent, new THREE.SphereGeometry(1, 12, 8), mat, x, y, z, outline);
    m.scale.set(sx, sy, sz);
    return m;
  };
  const ink = M('#30252b', true);
  const shine = M('#fffaf1', true);
  const blush = M('#ed8e89', true);

  // A plump puppy with a cream muzzle, oversized paws and floppy ears.
  const dog = new THREE.Group();
  const fur = M('#c99a5e');
  const dark = M('#795033');
  const cream = M('#f4dbb3');
  ball(dog, fur, 0, 0.41, -0.075, 0.29, 0.29, 0.45, true);
  ball(dog, cream, 0, 0.39, 0.235, 0.21, 0.21, 0.12);
  const dogHead = new THREE.Group();
  dogHead.position.set(0, 0.74, 0.34);
  dog.add(dogHead);
  ball(dogHead, fur, 0, 0, 0, 0.3, 0.285, 0.28, true);
  ball(dogHead, cream, 0, -0.075, 0.24, 0.18, 0.12, 0.12);
  ball(dogHead, ink, 0, -0.025, 0.345, 0.068, 0.05, 0.04);
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.26, 0.12, -0.035);
    ball(ear, dark, side * 0.025, -0.15, 0, 0.105, 0.235, 0.115, true);
    ear.rotation.z = side * 0.15;
    ears.push(ear);
    dogHead.add(ear);
    ball(dogHead, ink, side * 0.12, 0.07, 0.246, 0.051, 0.061, 0.03);
    ball(dogHead, shine, side * 0.12 - 0.014, 0.092, 0.271, 0.016, 0.018, 0.01);
    ball(dogHead, blush, side * 0.2, -0.035, 0.212, 0.045, 0.025, 0.018);
  }
  ball(dogHead, blush, 0.025, -0.155, 0.324, 0.038, 0.05, 0.018);
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.18, 0.2], [0.18, 0.2], [-0.18, -0.3], [0.18, -0.3]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.28, z);
    ball(leg, fur, 0, -0.09, 0, 0.08, 0.15, 0.085);
    ball(leg, cream, 0, -0.19, 0.035, 0.1, 0.08, 0.13);
    legs.push(leg);
    dog.add(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.55, -0.44);
  const tailFur = ball(tail, fur, 0, 0.12, -0.075, 0.08, 0.22, 0.08, true);
  tailFur.rotation.x = -0.65;
  dog.add(tail);
  const scarf = part(dog, new THREE.TorusGeometry(0.22, 0.045, 5, 12), M('#c4513f'), 0, 0.6, 0.27);
  scarf.rotation.x = Math.PI / 2;
  dog.position.set(40, PROMENADE_Y, -4);
  dog.scale.setScalar(1.3);
  group.add(dog);

  // The musician shares the crew's proportions, with a beret and round guitar.
  const musician = new THREE.Group();
  const coat = M('#5a6f8f');
  const skin = M('#c99272');
  const hair = M('#383033');
  const wood = M('#b87a3a');
  ball(musician, coat, 0, 0.65, 0, 0.33, 0.38, 0.27, true);
  for (const x of [-0.15, 0.15]) {
    ball(musician, hair, x, 0.15, 0.06, 0.12, 0.12, 0.18);
    ball(musician, coat, x * 2.3, 0.72, 0.05, 0.12, 0.23, 0.12);
    ball(musician, skin, x * 1.8, 0.57, 0.25, 0.1, 0.1, 0.1);
  }
  ball(musician, skin, 0, 1.32, 0, 0.41, 0.4, 0.38, true);
  const beret = part(musician, new THREE.SphereGeometry(0.43, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, -0.035, 1.46, -0.025, true);
  beret.scale.y = 0.75;
  ball(musician, hair, -0.07, 1.78, -0.025, 0.045, 0.06, 0.045);
  for (const x of [-0.14, 0.14]) {
    ball(musician, ink, x, 1.35, 0.355, 0.055, 0.067, 0.03);
    ball(musician, shine, x - 0.016, 1.376, 0.38, 0.017, 0.02, 0.01);
    ball(musician, blush, x * 1.65, 1.24, 0.311, 0.06, 0.032, 0.02);
  }
  const smile = part(musician, new THREE.TorusGeometry(0.05, 0.012, 5, 10, Math.PI), ink, 0, 1.2, 0.36);
  smile.rotation.z = Math.PI;
  const guitar = new THREE.Group();
  guitar.position.set(0.07, 0.61, 0.36);
  guitar.rotation.z = -0.55;
  ball(guitar, wood, 0, 0, 0, 0.23, 0.25, 0.1, true);
  ball(guitar, wood, 0, 0.23, 0, 0.17, 0.18, 0.09);
  part(guitar, new THREE.BoxGeometry(0.075, 0.44, 0.06), dark, 0, 0.49, 0);
  ball(guitar, ink, 0, 0.13, 0.095, 0.065, 0.065, 0.012);
  const strum = new THREE.Group();
  strum.position.set(-0.12, 0.18, 0.12);
  ball(strum, skin, 0, 0, 0, 0.09, 0.07, 0.06);
  guitar.add(strum);
  musician.add(guitar);
  part(musician, new THREE.BoxGeometry(0.7, 0.12, 0.35), hair, 0.6, 0.06, 0.45);
  musician.position.set(63.5, PROMENADE_Y, 14.6);
  musician.scale.setScalar(1.4);
  group.add(musician);

  // Chubby gulls: rounded bellies, little beaks and soft paddle-like wings.
  const gulls: THREE.Group[] = [];
  const wings: THREE.Mesh[][] = [];
  const white = M('#fbfaf6');
  const grey = M('#9aa7ad');
  const beak = M('#eeb958');
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    ball(g, white, 0, 0, 0, 0.21, 0.2, 0.34);
    ball(g, white, 0, 0.12, 0.24, 0.18, 0.18, 0.19);
    ball(g, beak, 0, 0.09, 0.43, 0.07, 0.045, 0.12);
    for (const side of [-1, 1]) ball(g, ink, side * 0.12, 0.17, 0.362, 0.023, 0.03, 0.015);
    const pair: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      // Bake the wing's offset into geometry so flapping pivots at its shoulder.
      const geo = new THREE.SphereGeometry(1, 10, 6);
      geo.scale(0.32, 0.045, 0.15);
      geo.translate(side * 0.25, 0, 0);
      const wing = part(g, geo, grey, side * 0.12, 0.04, -0.03);
      pair.push(wing);
    }
    wings.push(pair);
    g.userData.phase = i * 1.3;
    g.userData.radius = 10 + i * 3;
    g.userData.center = new THREE.Vector3(-10 + i * 10, 9 + (i % 3) * 2, -24 - i * 2);
    // Keep the wings out of the static batch because they flap independently.
    pair.forEach((wing) => g.remove(wing));
    batchStaticParts(g, geos);
    g.add(...pair);
    gulls.push(g);
    group.add(g);
  }
  batchStaticParts(dog, geos);
  batchStaticParts(musician, geos);

  let swoopGull: { g: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  let wanderAngle = 0;
  const wanderTarget = new THREE.Vector3();
  const to = new THREE.Vector3();
  const npcs: Npcs = {
    group,
    dog,
    musician,
    gulls,
    dogTarget: null,
    swoop(at) {
      const g = gulls[0];
      swoopGull = { g, from: at.clone().add(new THREE.Vector3(-12, 7, -6)), to: at.clone().add(new THREE.Vector3(12, 6, 4)), t: 0 };
    },
    update(dt, time, reducedMotion) {
      const motion = reducedMotion ? 0.15 : 1;
      const target = npcs.dogTarget ?? wanderTarget.set(40 + Math.cos(wanderAngle) * 5, PROMENADE_Y, -2 + Math.sin(wanderAngle) * 4);
      if (!npcs.dogTarget) wanderAngle += dt * 0.15;
      to.copy(target).sub(dog.position).setY(0);
      const d = to.length();
      const moving = d > 1.2;
      if (moving) {
        const step = Math.min(d - 1.1, (npcs.dogTarget ? 4.5 : 1.4) * dt);
        dog.position.addScaledVector(to.normalize(), step);
        dog.rotation.y = Math.atan2(to.x, to.z);
      }
      const gait = moving ? Math.sin(time * 14) * 0.45 * motion : 0;
      legs.forEach((l, i) => (l.rotation.x = i % 2 ? gait : -gait));
      tail.rotation.z = Math.sin(time * (npcs.dogTarget ? 18 : 6)) * 0.65 * motion;
      dogHead.rotation.x = moving ? Math.sin(time * 14 - 0.6) * 0.055 * motion : 0;
      ears.forEach((ear, i) => (ear.rotation.z = (i === 0 ? -1 : 1) * (0.15 + Math.sin(time * 14 - 0.8) * 0.09 * motion * Number(moving))));
      musician.rotation.z = reducedMotion ? 0 : Math.sin(time * 2.2) * 0.04;
      guitar.rotation.x = Math.sin(time * 4.4) * 0.04 * motion;
      strum.rotation.z = Math.sin(time * 8.8) * 0.18 * motion;
      for (let i = 0; i < gulls.length; i++) {
        const g = gulls[i];
        for (let side = 0; side < 2; side++) wings[i][side].rotation.z = Math.sin(time * 6 + (g.userData.phase as number)) * 0.35 * (side === 0 ? -1 : 1) * motion;
        if (swoopGull?.g === g) continue;
        const c = g.userData.center as THREE.Vector3;
        const a = time * 0.25 + (g.userData.phase as number);
        g.position.set(c.x + Math.cos(a) * (g.userData.radius as number), c.y + Math.sin(a * 2) * 0.6 * motion, c.z + Math.sin(a) * (g.userData.radius as number) * 0.5);
        g.rotation.y = -a;
      }
      if (swoopGull) {
        swoopGull.t += dt / 1.6;
        const t = Math.min(1, swoopGull.t);
        swoopGull.g.position.lerpVectors(swoopGull.from, swoopGull.to, t);
        swoopGull.g.position.y -= Math.sin(t * Math.PI) * 5.5 * motion;
        swoopGull.g.lookAt(swoopGull.to);
        if (t >= 1) swoopGull = null;
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
  return npcs;
}
