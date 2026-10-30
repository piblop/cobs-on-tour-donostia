import * as THREE from 'three';
import { PROMENADE_Y } from './map.ts';

/**
 * Background characters for encounters: a scruffy dog, a street musician,
 * and a few gulls. Built from primitives, animated procedurally.
 */
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
  const M = (c: string) => {
    const m = new THREE.MeshLambertMaterial({ color: c });
    mats.push(m);
    return m;
  };
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    geos.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Dog: sandy body, darker ears, a wagging tail and a little red scarf.
  const dog = new THREE.Group();
  const fur = M('#c99a5e');
  const dark = M('#6e4a2e');
  const body = part(dog, new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), fur, 0, 0.45, 0);
  body.rotation.x = Math.PI / 2;
  part(dog, new THREE.SphereGeometry(0.2, 10, 8), fur, 0, 0.62, 0.42);
  part(dog, new THREE.SphereGeometry(0.09, 8, 6), dark, 0, 0.58, 0.6);
  for (const x of [-0.13, 0.13]) part(dog, new THREE.SphereGeometry(0.07, 6, 5), dark, x, 0.8, 0.38).scale.set(0.6, 1.4, 0.6);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [-0.12, 0.25],
    [0.12, 0.25],
    [-0.12, -0.25],
    [0.12, -0.25],
  ]) legs.push(part(dog, new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), fur, x, 0.17, z));
  const tail = part(dog, new THREE.CylinderGeometry(0.03, 0.05, 0.32, 6), fur, 0, 0.6, -0.42);
  tail.rotation.x = -0.8;
  const scarf = part(dog, new THREE.TorusGeometry(0.15, 0.04, 5, 10), M('#c4513f'), 0, 0.55, 0.3);
  scarf.rotation.x = Math.PI / 2;
  dog.position.set(40, PROMENADE_Y, -4);
  dog.scale.setScalar(1.3);
  group.add(dog);

  // Street musician with a guitar and an open case.
  const musician = new THREE.Group();
  part(musician, new THREE.CapsuleGeometry(0.28, 0.5, 4, 8), M('#5a6f8f'), 0, 0.85, 0);
  part(musician, new THREE.SphereGeometry(0.3, 12, 10), M('#c99272'), 0, 1.5, 0);
  part(musician, new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#2a2420'), 0, 1.58, 0);
  const guitar = part(musician, new THREE.BoxGeometry(0.45, 0.6, 0.12), M('#b87a3a'), 0.05, 0.9, 0.3);
  guitar.rotation.z = 0.6;
  part(musician, new THREE.BoxGeometry(0.7, 0.12, 0.35), M('#2b211d'), 0.6, 0.06, 0.45);
  musician.position.set(63.5, PROMENADE_Y, 14.6);
  musician.scale.setScalar(1.4);
  group.add(musician);

  // Gulls: white body, grey wings that flap.
  const gulls: THREE.Group[] = [];
  const white = M('#fbfaf6');
  const grey = M('#9aa7ad');
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    part(g, new THREE.CapsuleGeometry(0.1, 0.3, 3, 6), white, 0, 0, 0).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const wing = part(g, new THREE.BoxGeometry(0.55, 0.02, 0.2), grey, side * 0.3, 0.02, 0);
      wing.userData.side = side;
    }
    g.userData.phase = i * 1.3;
    g.userData.radius = 10 + i * 3;
    g.userData.center = new THREE.Vector3(-10 + i * 10, 9 + (i % 3) * 2, -24 - i * 2);
    gulls.push(g);
    group.add(g);
  }

  let swoopGull: { g: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  let wanderAngle = 0;
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
      // Dog: trot toward a target, or potter around the gardens.
      const target = npcs.dogTarget ?? new THREE.Vector3(40 + Math.cos(wanderAngle) * 5, PROMENADE_Y, -2 + Math.sin(wanderAngle) * 4);
      if (!npcs.dogTarget) wanderAngle += dt * 0.15;
      const to = target.clone().sub(dog.position).setY(0);
      const d = to.length();
      const moving = d > 1.2;
      if (moving) {
        const step = Math.min(d - 1.1, (npcs.dogTarget ? 4.5 : 1.4) * dt);
        dog.position.addScaledVector(to.normalize(), step);
        dog.rotation.y = Math.atan2(to.x, to.z);
      }
      const gait = moving ? Math.sin(time * 14) * 0.5 : 0;
      legs.forEach((l, i) => (l.rotation.x = i % 2 ? gait : -gait));
      tail.rotation.z = Math.sin(time * (npcs.dogTarget ? 18 : 6)) * 0.6;
      // Musician sways to the tune.
      musician.rotation.z = reducedMotion ? 0 : Math.sin(time * 2.2) * 0.05;
      guitar.rotation.x = Math.sin(time * 4.4) * 0.05;
      // Gulls circle lazily; one may swoop.
      for (const g of gulls) {
        if (swoopGull?.g === g) continue;
        const c = g.userData.center as THREE.Vector3;
        const a = time * 0.25 + (g.userData.phase as number);
        g.position.set(c.x + Math.cos(a) * (g.userData.radius as number), c.y + Math.sin(a * 2) * 0.6, c.z + Math.sin(a) * (g.userData.radius as number) * 0.5);
        g.rotation.y = -a;
        for (const w of g.children) if (w.userData.side) w.rotation.z = Math.sin(time * 6 + (g.userData.phase as number)) * 0.4 * (w.userData.side as number);
      }
      if (swoopGull) {
        swoopGull.t += dt / 1.6;
        const t = Math.min(1, swoopGull.t);
        swoopGull.g.position.lerpVectors(swoopGull.from, swoopGull.to, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 5.5, 0));
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
