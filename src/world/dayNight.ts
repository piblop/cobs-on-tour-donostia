import * as THREE from 'three';
import type { Scenery } from './scenery.ts';
import { windowGlow } from './materials.ts';

/**
 * A gentle day/night cycle. Lighting, sky, fog, lamps and window glow all
 * blend between hand-tuned keyframes. Golden hour is stretched so it lasts.
 */

interface Key {
  t: number;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  zenith: string;
  mid: string;
  horizon: string;
  glow: string;
  cloudLit: string;
  cloudShade: string;
  night: number;
  exposure: number;
}

const KEYS: Key[] = [
  { t: 0, sun: '#a9c2ff', sunI: 0.55, hemiSky: '#7895c2', hemiGround: '#343c56', hemiI: 0.82, zenith: '#0f1a3a', mid: '#263559', horizon: '#4a4d78', glow: '#6c6fa3', cloudLit: '#3d4672', cloudShade: '#2a2f50', night: 1, exposure: 1.15 },
  { t: 5.5, sun: '#a9c2ff', sunI: 0.55, hemiSky: '#7895c2', hemiGround: '#343c56', hemiI: 0.82, zenith: '#13204a', mid: '#2c3a63', horizon: '#5d5a86', glow: '#7a76a8', cloudLit: '#454d78', cloudShade: '#2f3456', night: 1, exposure: 1.15 },
  { t: 7, sun: '#ffb98a', sunI: 1.7, hemiSky: '#a6bfe3', hemiGround: '#747487', hemiI: 1.05, zenith: '#7fa6d6', mid: '#e8c3c9', horizon: '#ffc7a3', glow: '#ffb07a', cloudLit: '#ffe1d6', cloudShade: '#d8b3c2', night: 0, exposure: 1.05 },
  { t: 10, sun: '#fff1dc', sunI: 2.45, hemiSky: '#c5d9ef', hemiGround: '#aaa1b2', hemiI: 1.55, zenith: '#5fb0e0', mid: '#a8d8ec', horizon: '#e3f1f3', glow: '#fff1c9', cloudLit: '#ffffff', cloudShade: '#dfe6ee', night: 0, exposure: 1.0 },
  { t: 16, sun: '#fff1dc', sunI: 2.45, hemiSky: '#c5d9ef', hemiGround: '#aaa1b2', hemiI: 1.55, zenith: '#5fb0e0', mid: '#a8d8ec', horizon: '#e3f1f3', glow: '#fff1c9', cloudLit: '#ffffff', cloudShade: '#dfe6ee', night: 0, exposure: 1.0 },
  { t: 18, sun: '#ffe2b8', sunI: 2.5, hemiSky: '#bed1ed', hemiGround: '#a89aac', hemiI: 1.5, zenith: '#6fb6d9', mid: '#a9d8e8', horizon: '#ffd9b3', glow: '#ffc98a', cloudLit: '#fff4e8', cloudShade: '#e9c3c0', night: 0, exposure: 1.02 },
  { t: 20, sun: '#ffa774', sunI: 1.9, hemiSky: '#b0b5df', hemiGround: '#8e7f93', hemiI: 1.2, zenith: '#5a7fb8', mid: '#c9a3c4', horizon: '#ffb08a', glow: '#ff9a6a', cloudLit: '#ffc3a8', cloudShade: '#b98aa6', night: 0.1, exposure: 1.05 },
  { t: 21, sun: '#b0caff', sunI: 0.72, hemiSky: '#8297ca', hemiGround: '#44465f', hemiI: 0.95, zenith: '#2e3f72', mid: '#6a5d8f', horizon: '#c98f9a', glow: '#e0828a', cloudLit: '#7a6d96', cloudShade: '#4c4870', night: 0.6, exposure: 1.1 },
  { t: 22.5, sun: '#a9c2ff', sunI: 0.55, hemiSky: '#7895c2', hemiGround: '#343c56', hemiI: 0.82, zenith: '#0f1a3a', mid: '#263559', horizon: '#4a4d78', glow: '#6c6fa3', cloudLit: '#3d4672', cloudShade: '#2a2f50', night: 1, exposure: 1.15 },
  { t: 24, sun: '#a9c2ff', sunI: 0.55, hemiSky: '#7895c2', hemiGround: '#343c56', hemiI: 0.82, zenith: '#0f1a3a', mid: '#263559', horizon: '#4a4d78', glow: '#6c6fa3', cloudLit: '#3d4672', cloudShade: '#2a2f50', night: 1, exposure: 1.15 },
];

const colourCache = new Map<string, THREE.Color>();
function col(hex: string): THREE.Color {
  let c = colourCache.get(hex);
  if (!c) colourCache.set(hex, (c = new THREE.Color(hex)));
  return c;
}

/** Game minutes per real second, by hour. Golden hour runs slower. */
export function clockRate(hour: number): number {
  if (hour >= 17.5 && hour < 20.5) return 0.9; // long golden hour over La Concha
  if (hour >= 22.5 || hour < 6) return 3; // nights pass quickly
  return 1.5;
}

export type TimeOfDay = 'morning' | 'midday' | 'afternoon' | 'golden' | 'dusk' | 'night';

export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 11.5) return 'morning';
  if (hour >= 11.5 && hour < 14.5) return 'midday';
  if (hour >= 14.5 && hour < 17.5) return 'afternoon';
  if (hour >= 17.5 && hour < 20.5) return 'golden';
  if (hour >= 20.5 && hour < 21.5) return 'dusk';
  return 'night';
}

export function formatClock(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Sun direction (toward the sun) for an hour of the day. */
export function sunDirection(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  // Artistic liberty: the sun arcs over the bay side (east, north, then sets
  // west-north-west over Igueldo) so the bay-facing facades stay lit all day and
  // shadows fall inland instead of across the promenade.
  const t = THREE.MathUtils.clamp((hour - 7) / (20.8 - 7), 0, 1);
  const azimuth = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-15, -165, t));
  const elevation = Math.max(0.03, Math.sin(t * Math.PI)) * THREE.MathUtils.degToRad(55);
  out.set(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation));
  return out.normalize();
}

const MOON = new THREE.Vector3(-0.45, 0.75, -0.5).normalize();

/**
 * 0 by day, 1 at night: ramps up between onStart and onEnd in the evening and
 * back down between offStart and offEnd in the morning.
 */
export function nightWindow(hour: number, onStart: number, onEnd: number, offStart: number, offEnd: number): number {
  if (hour >= onEnd || hour < offStart) return 1;
  if (hour >= onStart) return THREE.MathUtils.smoothstep(hour, onStart, onEnd);
  if (hour < offEnd) return 1 - THREE.MathUtils.smoothstep(hour, offStart, offEnd);
  return 0;
}

export class DayNight {
  /** Hours since midnight, 0..24. */
  hour: number;
  day = 1;
  private sunDir = new THREE.Vector3();
  private lightDir = new THREE.Vector3();
  private skyDir = new THREE.Vector3();
  private tmp = new THREE.Color();
  night = 0;
  /** 0 clear .. 1 fully overcast (set from the weather). */
  overcast = 0;
  private grey = new THREE.Color('#a7b0b6');
  /** Fired once each time the time-of-day bracket changes. */
  onPhase: ((phase: TimeOfDay) => void) | null = null;
  private phase: TimeOfDay;

  constructor(
    private scenery: Scenery,
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    startHour = 17.6,
  ) {
    this.hour = startHour;
    this.phase = timeOfDay(startHour);
  }

  get phaseName(): TimeOfDay {
    return this.phase;
  }

  setTime(hour: number, day = this.day): void {
    this.hour = ((hour % 24) + 24) % 24;
    this.day = day;
    this.phase = timeOfDay(this.hour);
    this.apply();
  }

  /** Advance the clock by real seconds. Callers only advance while exploring. */
  advance(realSeconds: number): void {
    const minutes = realSeconds * clockRate(this.hour);
    this.hour += minutes / 60;
    if (this.hour >= 24) {
      this.hour -= 24;
      this.day += 1;
    }
    const phase = timeOfDay(this.hour);
    if (phase !== this.phase) {
      this.phase = phase;
      this.onPhase?.(phase);
    }
  }

  private lerpKey<K extends keyof Key>(a: Key, b: Key, f: number, key: K): THREE.Color {
    return this.tmp.copy(col(a[key] as string)).lerp(col(b[key] as string), f);
  }

  /** Push the current time into lights, sky, fog and materials. */
  apply(): void {
    const hour = this.hour;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= hour) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const f = THREE.MathUtils.smoothstep(hour, a.t, b.t);
    const s = this.scenery;

    s.sun.color.copy(this.lerpKey(a, b, f, 'sun'));
    s.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, f);
    s.hemi.color.copy(this.lerpKey(a, b, f, 'hemiSky'));
    s.hemi.groundColor.copy(this.lerpKey(a, b, f, 'hemiGround'));
    s.hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, f);
    s.sky.zenith.value.copy(this.lerpKey(a, b, f, 'zenith'));
    s.sky.mid.value.copy(this.lerpKey(a, b, f, 'mid'));
    const horizon = this.lerpKey(a, b, f, 'horizon');
    s.sky.horizon.value.copy(horizon);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(horizon);
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(horizon);
    s.sky.glow.value.copy(this.lerpKey(a, b, f, 'glow'));
    s.sky.cloudLit.value.copy(this.lerpKey(a, b, f, 'cloudLit'));
    s.sky.cloudShade.value.copy(this.lerpKey(a, b, f, 'cloudShade'));
    this.night = THREE.MathUtils.lerp(a.night, b.night, f);
    s.sky.uNight.value = this.night;
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(a.exposure, b.exposure, f);

    if (this.overcast > 0.001) {
      const o = this.overcast;
      s.sun.intensity *= 1 - 0.65 * o;
      s.hemi.intensity *= 1 - 0.2 * o;
      for (const c of [s.sky.zenith.value, s.sky.mid.value, s.sky.horizon.value, s.sky.glow.value]) c.lerp(this.grey, 0.6 * o);
      s.sky.cloudLit.value.lerp(this.grey, 0.5 * o);
      if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.lerp(this.grey, 0.6 * o);
      if (this.scene.background instanceof THREE.Color) this.scene.background.lerp(this.grey, 0.6 * o);
    }
    // The visible sun sits lower than the light, so golden hour reads as a sunset.
    sunDirection(hour, this.sunDir);
    const toMoon = nightWindow(hour, 20.6, 21.6, 5.5, 6.8);
    this.skyDir.copy(this.sunDir);
    this.skyDir.y = Math.min(this.skyDir.y, 0.17 + Math.max(0, this.sunDir.y - 0.5) * 0.6);
    this.skyDir.normalize().lerp(MOON, toMoon).normalize();
    s.sky.sunDir.value.copy(this.skyDir);
    s.sky.discColor.value.setRGB(1.0 - toMoon * 0.12, 0.97 - toMoon * 0.04, 0.88 + toMoon * 0.12);
    // Keep the shadow-casting light high enough that shadows stay readable.
    this.lightDir.copy(this.sunDir);
    this.lightDir.y = Math.max(this.lightDir.y, 0.45);
    this.lightDir.normalize().lerp(MOON, toMoon).normalize();

    // Lamps switch on through dusk; windows warm up a little after.
    const lamps = nightWindow(hour, 20.2, 21.0, 6.5, 7.2);
    s.lampGlass.emissiveIntensity = 0.12 + lamps * 5.0;
    s.lampPools.opacity = lamps * 0.65;
    this.scene.userData.night = this.night;
    windowGlow.value = Math.min(1, this.night * 1.2);
  }

  /** Keep the shadow camera on the crew. Snapped to stop shimmer while walking. */
  followLight(x: number, z: number): void {
    const sun = this.scenery.sun;
    const fx = Math.round(x * 2) / 2;
    const fz = Math.round(z * 2) / 2;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + this.lightDir.x * 90, this.lightDir.y * 90, fz + this.lightDir.z * 90);
    sun.target.updateMatrixWorld();
  }
}
