import * as THREE from 'three';
import type { CrewMember } from '../data/types.ts';
import { outlineMaterial } from '../world/materials.ts';

/**
 * A rounded, friendly figure built from primitives, with simple procedural
 * animation: walk bob, limb swing, idle sway, and squash-and-stretch hops.
 */
export class Character {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso: THREE.Mesh;
  private head = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private walkPhase = 0;
  private idleTime = Math.random() * 10;
  private hopTime = -1;
  private hopHeight = 0.55;
  private lean = 0;
  private blinkTimer = 2 + Math.random() * 3;
  private eyes: THREE.Mesh[] = [];
  private stepSign = 1;
  /** Called on each footfall while walking (for footstep sounds). */
  onStep: (() => void) | null = null;
  /** Sitting on a bench: legs forward, body lowered. */
  seated = false;
  /** Happy wave/cheer pose for celebrations and photos. */
  cheering = 0;
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(readonly member: CrewMember) {
    const c = member.colors;
    const mat = (hex: string) => {
      const m = new THREE.MeshLambertMaterial({ color: hex });
      this.materials.push(m);
      return m;
    };
    const top = mat(c.top);
    const bottom = mat(c.bottom);
    const skin = mat(c.skin);
    const hair = mat(c.hair);
    const accent = mat(c.accent);
    const dark = mat('#2b211d');
    const cheek = new THREE.MeshBasicMaterial({ color: '#f29a8b', transparent: true, opacity: 0.55 });
    this.materials.push(cheek);

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, outline = true) => {
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      // Tiny parts (eyes, hands, shoes) skip shadow casting: invisible cost.
      mesh.castShadow = outline;
      parent.add(mesh);
      if (outline) {
        const hull = new THREE.Mesh(geo, outlineMaterial);
        hull.scale.setScalar(1.07);
        mesh.add(hull);
      }
      return mesh;
    };

    // Torso: a soft capsule.
    this.torso = add(this.body, new THREE.CapsuleGeometry(0.3, 0.36, 4, 12), top);
    this.torso.position.y = 0.86;
    // Belt / shorts band.
    const hips = add(this.body, new THREE.CylinderGeometry(0.31, 0.3, 0.2, 14), bottom, false);
    hips.position.y = 0.58;

    // Legs pivot at the hip.
    for (const [leg, x] of [
      [this.legL, -0.13],
      [this.legR, 0.13],
    ] as const) {
      leg.position.set(x, 0.56, 0);
      const limb = add(leg, new THREE.CapsuleGeometry(0.1, 0.26, 3, 8), bottom);
      limb.position.y = -0.24;
      const shoe = add(leg, new THREE.SphereGeometry(0.12, 10, 8), dark, false);
      shoe.scale.set(1, 0.6, 1.4);
      shoe.position.set(0, -0.48, 0.04);
      this.body.add(leg);
    }

    // Arms pivot at the shoulder.
    for (const [arm, x] of [
      [this.armL, -0.37],
      [this.armR, 0.37],
    ] as const) {
      arm.position.set(x, 1.06, 0);
      const limb = add(arm, new THREE.CapsuleGeometry(0.085, 0.3, 3, 8), top);
      limb.position.y = -0.2;
      const hand = add(arm, new THREE.SphereGeometry(0.09, 8, 6), skin, false);
      hand.position.y = -0.42;
      this.body.add(arm);
    }

    // Head: big and round for a friendly silhouette.
    this.head.position.y = 1.5;
    add(this.head, new THREE.SphereGeometry(0.34, 18, 14), skin);
    this.buildHair(member.hairStyle, hair, add);
    for (const x of [-0.12, 0.12]) {
      const eye = add(this.head, new THREE.SphereGeometry(0.045, 8, 6), dark, false);
      eye.scale.set(1, 1.3, 0.6);
      eye.position.set(x, 0.03, 0.31);
      this.eyes.push(eye);
      const blush = add(this.head, new THREE.CircleGeometry(0.06, 10), cheek, false);
      blush.position.set(x * 1.55, -0.07, 0.3);
      blush.rotation.y = x > 0 ? 0.45 : -0.45;
      blush.castShadow = false;
    }
    const smile = add(this.head, new THREE.TorusGeometry(0.07, 0.016, 5, 10, Math.PI), dark, false);
    smile.position.set(0, -0.08, 0.315);
    smile.rotation.z = Math.PI;
    // A little accent: scarf for everyone, in their signature colour.
    const scarf = add(this.body, new THREE.TorusGeometry(0.22, 0.07, 6, 14), accent, false);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.22;

    this.body.add(this.head);
    this.root.add(this.body);
    this.root.scale.setScalar(1.45 * member.heightScale);
    // Blob shadow keeps the friend grounded even on low shadow settings.
    const blobGeo = new THREE.CircleGeometry(0.42, 16);
    const blobMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false });
    this.geometries.push(blobGeo);
    this.materials.push(blobMat);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.root.add(blob);
  }

  private buildHair(
    style: CrewMember['hairStyle'],
    hair: THREE.Material,
    add: (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, o?: boolean) => THREE.Mesh,
  ): void {
    const cap = add(this.head, new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.rotation.x = -0.25;
    cap.position.y = 0.04;
    if (style === 'bob') {
      const bob = add(this.head, new THREE.CylinderGeometry(0.37, 0.4, 0.34, 16, 1, true, Math.PI * 0.75, Math.PI * 1.5), hair, false);
      bob.position.y = -0.06;
    } else if (style === 'curly') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const curl = add(this.head, new THREE.SphereGeometry(0.12, 8, 6), hair, false);
        curl.position.set(Math.cos(a) * 0.26, 0.2 + Math.sin(i * 1.7) * 0.04, Math.sin(a) * 0.24 - 0.04);
      }
    } else if (style === 'ponytail') {
      const tail = add(this.head, new THREE.CapsuleGeometry(0.08, 0.25, 3, 8), hair);
      tail.position.set(0, 0.0, -0.36);
      tail.rotation.x = 0.5;
    }
  }

  /** Celebratory hop with squash and stretch. */
  hop(height = 0.55): void {
    this.hopTime = 0;
    this.hopHeight = height;
  }

  /**
   * Render-rate animation from interpolated movement.
   * speed is world units per second; reducedMotion tones everything down.
   */
  animate(dt: number, speed: number, maxSpeed: number, reducedMotion: boolean): void {
    const t = Math.min(1, speed / maxSpeed);
    const motion = reducedMotion ? 0.4 : 1;
    this.idleTime += dt;
    if (speed > 0.05) this.walkPhase += dt * (5.5 + speed * 1.6);

    const sinPhase = Math.sin(this.walkPhase);
    if (speed > 0.6 && Math.sign(sinPhase) !== this.stepSign && sinPhase !== 0) {
      this.stepSign = Math.sign(sinPhase);
      this.onStep?.();
    }
    if (this.seated) {
      this.legL.rotation.x = -1.45;
      this.legR.rotation.x = -1.45;
      this.armL.rotation.x = -0.35;
      this.armR.rotation.x = -0.35;
      this.armL.rotation.z = -0.08;
      this.armR.rotation.z = 0.08;
      this.body.rotation.x = -0.08;
      this.body.rotation.z = 0;
      this.body.position.y = -0.42;
      this.body.scale.set(1, 1, 1);
      this.head.rotation.y = Math.sin(this.idleTime * 0.5) * 0.25;
      this.blink(dt);
      return;
    }
    const swing = sinPhase * 0.75 * t * motion;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.armL.rotation.z = -0.12 - (1 - t) * 0.05;
    this.armR.rotation.z = 0.12 + (1 - t) * 0.05;
    if (this.cheering > 0) {
      this.cheering = Math.max(0, this.cheering - dt);
      const wave = Math.sin(this.idleTime * 12) * 0.25 * motion;
      this.armR.rotation.x = -2.6;
      this.armR.rotation.z = 0.35 + wave;
      this.armL.rotation.x = -2.4;
      this.armL.rotation.z = -0.35 - wave;
    }

    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.07 * t * motion;
    const idle = (1 - t) * motion;
    const breathe = Math.sin(this.idleTime * 2.1) * 0.012 * idle;
    this.lean += (t * 0.12 * motion - this.lean) * Math.min(1, dt * 8);
    this.body.rotation.x = this.lean;
    this.body.rotation.z = Math.sin(this.idleTime * 1.3) * 0.035 * idle;
    this.head.rotation.y = Math.sin(this.idleTime * 0.6) * 0.18 * idle;

    let y = bob;
    let sy = 1 + breathe;
    if (this.hopTime >= 0) {
      this.hopTime += dt;
      const d = 0.55;
      const p = this.hopTime / d;
      if (p < 0.15) {
        sy = 1 - 0.18 * (p / 0.15) * motion; // squash before take-off
      } else if (p < 1) {
        const q = (p - 0.15) / 0.85;
        y += Math.sin(q * Math.PI) * this.hopHeight * motion;
        sy = 1 + 0.12 * Math.sin(q * Math.PI) * motion; // stretch in the air
      } else if (p < 1.25) {
        sy = 1 - 0.1 * Math.sin(((p - 1) / 0.25) * Math.PI) * motion; // land
      } else {
        this.hopTime = -1;
      }
    }
    this.body.position.y = y;
    this.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

    this.blink(dt);
  }

  private blink(dt: number): void {
    // Blink now and then.
    this.blinkTimer -= dt;
    const blinking = this.blinkTimer < 0.12;
    for (const e of this.eyes) e.scale.y = blinking ? 0.25 : 1.3;
    if (this.blinkTimer < 0) this.blinkTimer = 2.5 + Math.random() * 3.5;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
