import * as THREE from 'three';
import { mulberry32 } from '../engine/random.ts';

/**
 * Occasional weather. Some afternoons bring a short shower: streaks of rain
 * around the crew, an overcast sky, umbrellas. Rain changes the mood and a
 * few moments, but never traps anyone or cancels plans.
 */
const DROPS = 420;

export class Weather {
  readonly group = new THREE.Group();
  /** 0 clear .. 1 full rain, eased. */
  intensity = 0;
  private window: { day: number; start: number; end: number } | null = null;
  private plannedDay = 0;
  private lastRainEnd: { day: number; hour: number } | null = null;
  private drops: THREE.InstancedMesh;
  private seeds: Float32Array;
  private tmp = new THREE.Object3D();
  private geo = new THREE.BoxGeometry(0.02, 0.6, 0.02);
  private mat = new THREE.MeshBasicMaterial({ color: '#cfe0ea', transparent: true, opacity: 0.55, depthWrite: false });

  constructor(private seed = 2024) {
    this.drops = new THREE.InstancedMesh(this.geo, this.mat, DROPS);
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    this.group.add(this.drops);
    const rng = mulberry32(seed);
    this.seeds = new Float32Array(DROPS * 3);
    for (let i = 0; i < this.seeds.length; i++) this.seeds[i] = rng();
  }

  get raining(): boolean {
    return this.intensity > 0.35;
  }

  /** True for a while after a shower (puddles, shiny streets). */
  afterRain(day: number, hour: number): boolean {
    const e = this.lastRainEnd;
    return !!e && e.day === day && hour - e.hour < 1.5 && !this.raining;
  }

  /** Decide (deterministically per day) whether today brings a shower. */
  private plan(day: number): void {
    if (this.plannedDay === day) return;
    this.plannedDay = day;
    const rng = mulberry32(this.seed * 31 + day * 977);
    // Mostly sunshine: a shower turns up on roughly one day in seven.
    this.window = rng() < 0.14 ? { day, start: 12 + rng() * 5.5, end: 0 } : null;
    if (this.window) this.window.end = this.window.start + 0.9 + rng() * 0.7;
  }

  /** Force the weather (dev testing, or a scripted shower). */
  setRainNow(day: number, hour: number, hours = 1.2): void {
    this.plannedDay = day;
    this.window = { day, start: hour, end: hour + hours };
  }

  update(dt: number, day: number, hour: number, focus: THREE.Vector3, reducedMotion: boolean): void {
    this.plan(day);
    const w = this.window;
    const wet = !!w && w.day === day && hour >= w.start && hour < w.end;
    const before = this.raining;
    this.intensity += ((wet ? 1 : 0) - this.intensity) * Math.min(1, dt * 0.35);
    if (before && !this.raining) this.lastRainEnd = { day, hour };
    this.drops.visible = this.intensity > 0.02;
    if (!this.drops.visible) return;
    const count = Math.floor(DROPS * this.intensity * (reducedMotion ? 0.5 : 1));
    this.drops.count = count;
    const t = performance.now() / 1000;
    for (let i = 0; i < count; i++) {
      const sx = this.seeds[i * 3];
      const sz = this.seeds[i * 3 + 1];
      const sp = this.seeds[i * 3 + 2];
      const fall = (t * (9 + sp * 4) + sp * 20) % 14;
      this.tmp.position.set(focus.x + (sx - 0.5) * 34, focus.y + 13 - fall, focus.z + (sz - 0.5) * 34);
      this.tmp.rotation.z = 0.12;
      this.tmp.updateMatrix();
      this.drops.setMatrixAt(i, this.tmp.matrix);
    }
    this.drops.instanceMatrix.needsUpdate = true;
  }

  toJSON(): { window: { day: number; start: number; end: number } | null } {
    return { window: this.window };
  }

  dispose(): void {
    this.drops.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}
