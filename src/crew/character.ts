import * as THREE from 'three';
import { batchStaticParts } from '../engine/meshParts.ts';
import type { CrewMember } from '../data/types.ts';
import { decorRandom } from '../engine/random.ts';
import { outlineMaterial } from '../world/materials.ts';

type AddPart = (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, o?: boolean) => THREE.Mesh;

/** A little storybook traveller. All animation stays below the gameplay root. */
export class Character {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private ponytail = new THREE.Group();
  private eyes = new THREE.Group();
  private happyEyes = new THREE.Group();
  private smile = new THREE.Group();
  private surprisedMouth = new THREE.Group();
  private walkPhase = 0;
  private idleTime = decorRandom() * 10;
  private fidgetTimer = 5 + decorRandom() * 5;
  private fidgetTime = -1;
  private hopTime = -1;
  private hopHeight = 0.55;
  private lean = 0;
  private blinkTimer = 2 + decorRandom() * 3;
  private stepSign = 1;
  /** Called on each footfall while walking (for footstep sounds). */
  onStep: (() => void) | null = null;
  /** Sitting on a bench: legs forward, body lowered. */
  seated = false;
  /** Happy wave/cheer pose for celebrations and photos. */
  cheering = 0;
  private umbrella = new THREE.Group();
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
    // Unlit facial marks stay readable in shade and never receive outline hulls.
    const ink = new THREE.MeshBasicMaterial({ color: '#30252b' });
    const cheek = new THREE.MeshBasicMaterial({ color: '#ed8e89' });
    const shine = new THREE.MeshBasicMaterial({ color: '#fffaf1' });
    this.materials.push(ink, cheek, shine);

    const add: AddPart = (parent, geo, m, outline = true) => {
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = outline;
      parent.add(mesh);
      if (outline) {
        const hull = new THREE.Mesh(geo, outlineMaterial);
        hull.scale.setScalar(1.035);
        mesh.add(hull);
      }
      return mesh;
    };
    const ball = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, outline = true) => {
      const mesh = add(p, new THREE.SphereGeometry(1, 12, 10), m, outline);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      return mesh;
    };

    // A bean-shaped jumper, full at the hem and narrow at the shoulders.
    const torsoGeo = new THREE.SphereGeometry(1, 16, 12);
    const pos = torsoGeo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const pear = 1 - pos.getY(i) * 0.18;
      pos.setXYZ(i, pos.getX(i) * 0.33 * pear, pos.getY(i) * 0.36, pos.getZ(i) * 0.27 * pear);
    }
    torsoGeo.computeVertexNormals();
    add(this.body, torsoGeo, top).position.y = 0.7;
    ball(this.body, bottom, 0, 0.43, 0, 0.29, 0.17, 0.25, false);

    // Short legs and small, rounded shoes. Soles remain at the old ground level.
    for (const [leg, x] of [[this.legL, -0.145], [this.legR, 0.145]] as const) {
      leg.position.set(x, 0.42, 0);
      const limb = add(leg, new THREE.CapsuleGeometry(0.105, 0.1, 3, 8), bottom);
      limb.position.y = -0.15;
      ball(leg, dark, 0, -0.32, 0.065, 0.12, 0.075, 0.17, false);
      this.body.add(leg);
    }
    for (const [arm, x] of [[this.armL, -0.33], [this.armR, 0.33]] as const) {
      arm.position.set(x, 0.89, 0);
      const sleeve = add(arm, new THREE.CapsuleGeometry(0.105, 0.13, 3, 8), top);
      sleeve.position.y = -0.12;
      ball(arm, skin, 0, -0.29, 0.015, 0.1, 0.105, 0.095, false);
      this.body.add(arm);
    }

    // Roughly 1:1.2 head to body, retaining the previous overall height envelope.
    this.head.position.y = 1.37;
    ball(this.head, skin, 0, 0, 0, 0.45, 0.43, 0.415);
    for (const x of [-0.43, 0.43]) ball(this.head, skin, x, -0.015, 0.015, 0.07, 0.09, 0.065, false);
    this.buildHair(member.hairStyle, hair, add);

    // Tip the face up toward the high gameplay camera, keeping the cheeks proud
    // of the head surface rather than burying flat decals in the sphere.
    const face = new THREE.Group();
    face.rotation.x = -0.3;
    this.head.add(face);
    this.eyes.position.set(0, -0.025, 0.39);
    this.happyEyes.position.copy(this.eyes.position);
    face.add(this.eyes, this.happyEyes, this.smile, this.surprisedMouth);
    for (const x of [-0.155, 0.155]) {
      ball(this.eyes, ink, x, 0, 0, 0.068, 0.082, 0.035, false);
      ball(this.eyes, shine, x - 0.019, 0.028, 0.03, 0.022, 0.024, 0.012, false);
      const happy = add(this.happyEyes, new THREE.TorusGeometry(0.06, 0.014, 5, 10, Math.PI), ink, false);
      happy.position.set(x, 0, 0.015);
      happy.scale.y = 0.8;
      ball(face, cheek, x * 1.6, -0.11, 0.343, 0.082, 0.042, 0.025, false);
      const brow = ball(face, hair, x, 0.1, 0.38, 0.065, 0.018, 0.015, false);
      brow.rotation.z = x > 0 ? -0.12 : 0.12;
    }
    ball(face, skin, 0, -0.075, 0.421, 0.037, 0.03, 0.03, false);
    const smile = add(this.smile, new THREE.TorusGeometry(0.055, 0.014, 5, 12, Math.PI), ink, false);
    smile.position.set(0, -0.13, 0.39);
    smile.rotation.z = Math.PI;
    const mouth = add(this.surprisedMouth, new THREE.TorusGeometry(0.035, 0.012, 5, 10), ink, false);
    mouth.position.set(0, -0.15, 0.388);
    mouth.scale.y = 1.2;
    this.happyEyes.visible = false;
    this.surprisedMouth.visible = false;
    this.buildAccessory(member.accessory, accent, dark, add);
    this.body.add(this.head);

    const canopy = add(this.umbrella, new THREE.ConeGeometry(0.75, 0.38, 10, 1, true), accent, false);
    (canopy.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    canopy.position.y = 0.2;
    canopy.castShadow = true;
    const stick = add(this.umbrella, new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), dark, false);
    stick.position.y = -0.35;
    this.umbrella.position.set(0.3, 2.15, 0.05);
    this.umbrella.rotation.z = -0.15;
    this.umbrella.visible = false;
    this.body.add(this.umbrella);
    this.root.add(this.body);
    this.root.scale.setScalar(1.45 * member.heightScale);
    // Curls, fringes, face marks and accessory pieces share draws by material
    // within each animated pivot. Outlines are batched too.
    batchStaticParts(this.body, this.geometries);

    const blobGeo = new THREE.CircleGeometry(0.42, 16);
    const blobMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false });
    this.geometries.push(blobGeo);
    this.materials.push(blobMat);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.root.add(blob);
  }

  private buildAccessory(kind: CrewMember['accessory'], accent: THREE.Material, dark: THREE.Material, add: AddPart): void {
    if (kind === 'cap') {
      const crown = add(this.head, new THREE.SphereGeometry(0.48, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent);
      crown.scale.set(1, 0.58, 0.95);
      crown.position.y = 0.28;
      const peak = add(this.head, new THREE.SphereGeometry(0.3, 12, 8), accent, false);
      peak.scale.set(1.15, 0.09, 0.8);
      peak.position.set(0, 0.27, 0.33);
    } else if (kind === 'camera') {
      const strap = add(this.body, new THREE.TorusGeometry(0.27, 0.025, 4, 18), dark, false);
      strap.rotation.set(0.35, 0, 0.5);
      strap.position.set(0, 0.86, 0.04);
      const cam = add(this.body, new THREE.BoxGeometry(0.26, 0.18, 0.12), dark);
      cam.position.set(0.04, 0.69, 0.29);
      const lens = add(this.body, new THREE.CylinderGeometry(0.065, 0.065, 0.08, 10), accent, false);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0.04, 0.69, 0.38);
    } else if (kind === 'backpack') {
      const pack = add(this.body, new THREE.SphereGeometry(1, 12, 10), accent);
      pack.scale.set(0.29, 0.32, 0.17);
      pack.position.set(0, 0.72, -0.3);
      const flap = add(this.body, new THREE.SphereGeometry(1, 10, 8), dark, false);
      flap.scale.set(0.24, 0.1, 0.06);
      flap.position.set(0, 0.88, -0.45);
    } else {
      const bag = add(this.body, new THREE.SphereGeometry(1, 12, 10), accent);
      bag.scale.set(0.12, 0.22, 0.19);
      bag.position.set(-0.39, 0.53, 0.02);
      const handle = add(this.body, new THREE.TorusGeometry(0.18, 0.02, 4, 12, Math.PI), dark, false);
      handle.rotation.y = Math.PI / 2;
      handle.position.set(-0.39, 0.68, 0.02);
    }
  }

  private buildHair(style: CrewMember['hairStyle'], hair: THREE.Material, add: AddPart): void {
    const lock = (p: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const mesh = add(p, new THREE.SphereGeometry(1, 12, 8), hair, false);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      return mesh;
    };
    const cap = add(this.head, new THREE.SphereGeometry(0.465, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hair);
    cap.scale.set(1, 0.98, 0.96);
    cap.position.set(0, 0.045, -0.025);
    cap.rotation.x = -0.18;
    if (style === 'bob') {
      // Rounded side locks and a low nape leave an open window for the face.
      for (const x of [-0.36, 0.36]) lock(this.head, x, -0.01, -0.07, 0.19, 0.37, 0.32);
      lock(this.head, 0, 0, -0.3, 0.39, 0.34, 0.18);
      for (const x of [-0.23, 0, 0.23]) lock(this.head, x, 0.25, 0.3, 0.17, 0.13, 0.13);
    } else if (style === 'curly') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        lock(this.head, Math.cos(a) * 0.34, 0.26 + Math.sin(i * 1.7) * 0.045, Math.sin(a) * 0.3 - 0.035, 0.17, 0.17, 0.17);
      }
      for (const x of [-0.16, 0.14]) lock(this.head, x, 0.43, -0.04, 0.22, 0.17, 0.23);
    } else if (style === 'ponytail') {
      lock(this.head, 0, 0.36, -0.28, 0.19, 0.18, 0.19);
      this.ponytail.position.set(0, 0.28, -0.37);
      lock(this.ponytail, 0, -0.16, -0.09, 0.17, 0.3, 0.19);
      lock(this.ponytail, 0, -0.37, -0.14, 0.12, 0.18, 0.14);
      this.head.add(this.ponytail);
      lock(this.head, -0.19, 0.25, 0.29, 0.23, 0.13, 0.15).rotation.z = -0.25;
    } else {
      // A swept fringe and side tufts peek out below Paulo's cap.
      lock(this.head, -0.17, 0.24, 0.32, 0.24, 0.12, 0.13).rotation.z = -0.22;
      for (const x of [-0.4, 0.4]) lock(this.head, x, 0.07, -0.015, 0.08, 0.17, 0.19);
    }
  }

  setUmbrella(open: boolean): void {
    this.umbrella.visible = open;
    if (open) this.armR.rotation.x = -1.2;
  }

  /** Celebratory hop with squash and stretch. */
  hop(height = 0.55): void {
    this.hopTime = 0;
    this.hopHeight = height;
  }

  /** Render-rate animation from interpolated movement, below the fixed root. */
  animate(dt: number, speed: number, maxSpeed: number, reducedMotion: boolean): void {
    const t = THREE.MathUtils.clamp(speed / maxSpeed, 0, 1);
    const motion = reducedMotion ? 0.2 : 1;
    this.idleTime += dt;
    if (speed > 0.05) this.walkPhase += dt * (5.5 + speed * 1.6);
    const sinPhase = Math.sin(this.walkPhase);
    if (speed > 0.6 && Math.sign(sinPhase) !== this.stepSign && sinPhase !== 0) {
      this.stepSign = Math.sign(sinPhase);
      this.onStep?.();
    }
    this.cheering = Math.max(0, this.cheering - dt);
    this.legL.position.y = this.seated ? 0.53 : 0.42;
    this.legR.position.y = this.legL.position.y;
    if (this.seated) {
      this.legL.rotation.x = -1.45;
      this.legR.rotation.x = -1.45;
      this.armL.rotation.set(-0.35, 0, -0.08);
      this.armR.rotation.set(this.umbrella.visible ? -1.2 : -0.35, 0, 0.08);
      this.body.rotation.set(-0.08, 0, 0);
      this.body.position.y = -0.42;
      this.body.scale.setScalar(1);
      this.head.position.y = 1.37;
      this.head.rotation.set(0, Math.sin(this.idleTime * 0.5) * 0.2 * motion, 0);
      this.ponytail.rotation.set(0, 0, 0);
      this.expression(dt);
      return;
    }
    const swing = sinPhase * 0.65 * t * motion;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.armL.rotation.z = -0.16;
    this.armR.rotation.z = 0.16;
    if (this.cheering > 0) {
      const wave = Math.sin(this.idleTime * 12) * 0.2 * motion;
      this.armR.rotation.set(-2.6, 0, 0.35 + wave);
      this.armL.rotation.set(-2.4, 0, -0.35 - wave);
    }
    if (this.umbrella.visible) this.armR.rotation.set(-1.2, 0, 0.12);

    const idle = (1 - t) * motion;
    if (t < 0.02 && !reducedMotion && this.cheering === 0) {
      this.fidgetTimer -= dt;
      if (this.fidgetTimer <= 0) {
        this.fidgetTime = 0;
        this.fidgetTimer = 6 + decorRandom() * 6;
      }
    } else this.fidgetTime = -1;
    let glance = 0;
    if (this.fidgetTime >= 0) {
      this.fidgetTime += dt;
      glance = Math.sin(Math.min(1, this.fidgetTime / 1.8) * Math.PI) * 0.38;
      if (this.fidgetTime > 1.8) this.fidgetTime = -1;
    }
    const bob = (1 - Math.cos(this.walkPhase * 2)) * 0.045 * t * motion;
    const breathe = Math.sin(this.idleTime * 2.1) * 0.012 * idle;
    this.lean += (t * 0.08 * motion - this.lean) * (1 - Math.exp(-dt * 8));
    this.body.rotation.set(this.lean, 0, sinPhase * 0.045 * t * motion + Math.sin(this.idleTime * 1.3) * 0.025 * idle);
    this.head.position.y = 1.37 + Math.sin(this.walkPhase * 2 - 0.7) * 0.018 * t * motion;
    this.head.rotation.set(-0.035 * sinPhase * t * motion, Math.sin(this.idleTime * 0.6) * 0.12 * idle + glance, -sinPhase * 0.025 * t * motion);
    this.ponytail.rotation.set(Math.sin(this.walkPhase - 0.6) * 0.18 * t * motion, 0, Math.sin(this.walkPhase - 0.8) * 0.25 * t * motion);

    let y = bob;
    let sy = 1 + breathe + Math.sin(this.walkPhase * 2) * 0.025 * t * motion;
    if (this.hopTime >= 0) {
      this.hopTime += dt;
      const p = this.hopTime / 0.55;
      const hopMotion = reducedMotion ? 0 : 1;
      if (p < 0.15) sy = 1 - 0.18 * (p / 0.15) * hopMotion;
      else if (p < 1) {
        const q = (p - 0.15) / 0.85;
        y += Math.sin(q * Math.PI) * this.hopHeight * hopMotion;
        sy = 1 + 0.12 * Math.sin(q * Math.PI) * hopMotion;
      } else if (p < 1.25) sy = 1 - 0.1 * Math.sin(((p - 1) / 0.25) * Math.PI) * hopMotion;
      else this.hopTime = -1;
    }
    this.body.position.y = y;
    this.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.expression(dt);
  }

  private expression(dt: number): void {
    this.blinkTimer -= dt;
    this.eyes.scale.y = this.blinkTimer < 0.12 ? 0.12 : 1;
    if (this.blinkTimer < 0) this.blinkTimer = 2.5 + decorRandom() * 3.5;
    const happy = this.cheering > 0;
    const surprised = !happy && this.hopTime > 0.08 && this.hopTime < 0.42;
    this.eyes.visible = !happy;
    this.happyEyes.visible = happy;
    this.smile.visible = !surprised;
    this.surprisedMouth.visible = surprised;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
