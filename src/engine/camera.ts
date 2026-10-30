import * as THREE from 'three';
import gsap from 'gsap';
import { camera as tune } from '../data/tuning.ts';
import type { BuildingDef } from '../world/map.ts';
import type { CameraShot } from '../data/types.ts';
import { cutaway } from '../world/materials.ts';

/** Critically damped spring on a vector: smooth, no overshoot. */
class Spring3 {
  readonly value = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private x = new THREE.Vector3();
  private vTerm = new THREE.Vector3();

  step(target: THREE.Vector3, omega: number, dt: number): void {
    // Closed-form critically damped step: x(t) = (x0 + (v0 + w x0) t) e^(-wt).
    const x = this.x.subVectors(this.value, target);
    const exp = Math.exp(-omega * dt);
    const vTerm = this.vTerm.copy(this.velocity).addScaledVector(x, omega).multiplyScalar(dt);
    this.velocity.addScaledVector(vTerm, -omega).multiplyScalar(exp);
    this.value.copy(target).add(x.add(vTerm).multiplyScalar(exp));
  }

  snap(v: THREE.Vector3): void {
    this.value.copy(v);
    this.velocity.set(0, 0, 0);
  }
}

function insideBox(p: THREE.Vector3, b: BuildingDef, pad: number): boolean {
  const roofTop = 1.4 + b.height + 3.4;
  if (p.y > roofTop + pad) return false;
  const c = Math.cos(b.rotation);
  const s = Math.sin(b.rotation);
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < b.width / 2 + pad && Math.abs(lz) < b.depth / 2 + pad;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw: number = tune.defaultYaw;
  private targetYaw: number = tune.defaultYaw;
  private distance: number = tune.defaultDistance;
  private targetDistance: number = tune.defaultDistance;
  private pitchLift = 0;
  private focus = new Spring3();
  private desiredFocus = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private cinematic: gsap.core.Timeline | null = null;
  private cine = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
  private probe = new THREE.Vector3();
  reducedMotion = false;
  /** Area framing: narrow lanes get a higher, closer view. */
  private areaPitch = 0;
  private areaScale = 1;
  private targetAreaPitch = 0;
  private targetAreaScale = 1;

  setAreaFraming(pitchAdd: number, distanceScale: number): void {
    this.targetAreaPitch = pitchAdd;
    this.targetAreaScale = distanceScale;
  }

  constructor(private occluders: BuildingDef[]) {
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 900);
  }

  get inCinematic(): boolean {
    return this.cinematic !== null;
  }

  /** Teleport the follow target (spawn, recovery). */
  snapTo(x: number, y: number, z: number): void {
    this.desiredFocus.set(x, y + tune.lookHeight, z);
    this.focus.snap(this.desiredFocus);
    this.placeFollow(1);
  }

  addZoom(amount: number): void {
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + amount * 2.2, tune.minDistance, tune.maxDistance);
  }

  rotate(rate: number, drag: number, dt: number): void {
    this.targetYaw += rate * tune.rotateSpeed * dt + drag;
  }

  resetView(): void {
    // Unwrap so the reset turns the short way round.
    const twoPi = Math.PI * 2;
    const delta = ((((tune.defaultYaw - this.targetYaw) % twoPi) + twoPi * 1.5) % twoPi) - Math.PI;
    this.targetYaw += delta;
    this.targetDistance = tune.defaultDistance;
  }

  private pitchFor(distance: number): number {
    const t = (distance - tune.minDistance) / (tune.maxDistance - tune.minDistance);
    return THREE.MathUtils.lerp(tune.pitchNear, tune.pitchFar, t);
  }

  private offsetFor(distance: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
    const horiz = Math.cos(pitch) * distance;
    return out.set(Math.sin(this.yaw) * horiz, Math.sin(pitch) * distance, Math.cos(this.yaw) * horiz);
  }

  /** Lift the camera over roofs instead of letting it clip into a building. */
  private clearPitch(base: number): number {
    for (let k = 0; k <= 10; k++) {
      const pitch = Math.min(1.35, base + k * 0.06);
      this.offsetFor(this.distance, pitch, this.probe).add(this.focus.value);
      let blocked = false;
      for (const b of this.occluders) {
        if (insideBox(this.probe, b, 0.8)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return pitch - base;
    }
    return 1.35 - base;
  }

  private placeFollow(dt: number): void {
    const k = 1 - Math.exp(-tune.zoomSmoothing * dt);
    const ka = 1 - Math.exp(-2.5 * dt);
    this.areaPitch += (this.targetAreaPitch - this.areaPitch) * ka;
    this.areaScale += (this.targetAreaScale - this.areaScale) * ka;
    this.distance += (this.targetDistance * this.areaScale - this.distance) * k;
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-10 * dt));
    const base = this.pitchFor(this.distance) + this.areaPitch;
    const wantLift = this.clearPitch(base);
    this.pitchLift += (wantLift - this.pitchLift) * (1 - Math.exp(-6 * dt));
    if (wantLift > this.pitchLift) this.pitchLift = Math.max(this.pitchLift, wantLift - 0.04);
    this.offsetFor(this.distance, base + this.pitchLift, this.camera.position).add(this.focus.value);
    this.lookTarget.copy(this.focus.value);
    this.camera.lookAt(this.lookTarget);
  }

  /** Called every rendered frame with the interpolated friend position. */
  update(friend: THREE.Vector3, dt: number): void {
    this.desiredFocus.set(friend.x, friend.y + tune.lookHeight, friend.z);
    if (!this.cinematic) {
      this.focus.step(this.desiredFocus, tune.followOmega, dt);
      this.placeFollow(dt);
    }
    cutaway.uFocus.value.copy(this.cinematic ? this.lookTarget : this.desiredFocus);
    cutaway.uCam.value.copy(this.camera.position);
    cutaway.uCutEnabled.value = this.cinematic ? 0 : 1;
  }

  /** Movement directions are relative to where the camera is looking. */
  screenToWorld(x: number, z: number): { x: number; z: number } {
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // Screen "up" (z = -1) points away from the camera.
    return { x: x * c + z * s, z: -x * s + z * c };
  }

  /**
   * Glide to a postcard shot. Resolves when the camera arrives (or the glide is
   * skipped). Reduced motion swaps the glide for a short ease.
   */
  glideTo(shot: CameraShot, seconds: number = tune.arrivalGlide): Promise<void> {
    this.cinematic?.kill();
    const p = this.camera.position;
    const look = this.lookTarget;
    Object.assign(this.cine, { px: p.x, py: p.y, pz: p.z, tx: look.x, ty: look.y, tz: look.z });
    const duration = this.reducedMotion ? Math.min(0.35, seconds) : seconds;
    return new Promise((resolve) => {
      const tl = gsap.timeline({
        onUpdate: () => this.applyCine(),
        onComplete: () => resolve(),
      });
      tl.to(this.cine, {
        px: shot.position.x,
        py: shot.position.y,
        pz: shot.position.z,
        tx: shot.target.x,
        ty: shot.target.y,
        tz: shot.target.z,
        duration,
        ease: this.reducedMotion ? 'sine.out' : 'power2.inOut',
      });
      this.cinematic = tl;
    });
  }

  /** Glide back from a cinematic to the follow position. */
  returnToFollow(seconds: number = tune.returnGlide): Promise<void> {
    if (!this.cinematic) return Promise.resolve();
    this.cinematic.kill();
    const from = { ...this.cine };
    const end = new THREE.Vector3();
    const base = this.pitchFor(this.distance);
    this.offsetFor(this.distance, base + this.pitchLift, end).add(this.focus.value);
    const duration = this.reducedMotion ? 0.25 : seconds;
    return new Promise((resolve) => {
      this.cinematic = gsap.timeline({
        onUpdate: () => this.applyCine(),
        onComplete: () => {
          this.cinematic = null;
          resolve();
        },
      });
      Object.assign(this.cine, from);
      this.cinematic.to(this.cine, {
        px: end.x,
        py: end.y,
        pz: end.z,
        tx: this.focus.value.x,
        ty: this.focus.value.y,
        tz: this.focus.value.z,
        duration,
        ease: 'power2.inOut',
      });
    });
  }

  /**
   * Postcard framing behind the title card: low over the promenade, looking
   * out across the bay to Santa Clara with the sky filling the top of frame.
   */
  titleView(time: number, reducedMotion: boolean): void {
    const sway = reducedMotion ? 0 : Math.sin(time * 0.11) * 0.18;
    this.camera.position.set(-7.5 + sway * 6, 6.2 + Math.sin(time * 0.07) * 0.2, 16);
    this.lookTarget.set(-14 + sway * 24, 5.5, -60);
    this.camera.lookAt(this.lookTarget);
    cutaway.uCutEnabled.value = 0;
  }

  /** Glide from wherever the camera is now (e.g. the title shot) down into the follow view. */
  glideFromCurrent(seconds: number): Promise<void> {
    const p = this.camera.position;
    const l = this.lookTarget;
    Object.assign(this.cine, { px: p.x, py: p.y, pz: p.z, tx: l.x, ty: l.y, tz: l.z });
    this.cinematic = gsap.timeline();
    return this.returnToFollow(seconds);
  }

  /** Hold the camera at an exact shot (vehicles in travel scenes drive it each frame). */
  holdShot(position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }): void {
    if (!this.cinematic) this.cinematic = gsap.timeline();
    Object.assign(this.cine, { px: position.x, py: position.y, pz: position.z, tx: target.x, ty: target.y, tz: target.z });
    this.applyCine();
  }

  /** Jump a running glide straight to its end. */
  skip(): void {
    this.cinematic?.progress(1);
  }

  /** Abandon any cinematic immediately (recovery, menus). */
  cancelCinematic(): void {
    this.cinematic?.kill();
    this.cinematic = null;
  }

  private applyCine(): void {
    const c = this.cine;
    this.camera.position.set(c.px, c.py, c.pz);
    this.lookTarget.set(c.tx, c.ty, c.tz);
    this.camera.lookAt(this.lookTarget);
  }
}
