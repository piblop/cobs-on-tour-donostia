import * as THREE from 'three';
import gsap from 'gsap';
import type { CrewId } from '../data/types.ts';
import type { TravelDef } from '../world/travel.ts';
import type { Landmarks } from '../world/landmarks.ts';
import { SUMMITS, travelStops } from '../world/map.ts';
import type { SceneContext } from './meal.ts';

/**
 * Short, skippable travel sequences: the funicular car climbing Igueldo, the
 * little boat crossing to Santa Clara, and the puffing climb up Urgull.
 */
export interface TravelContext extends SceneContext {
  landmarks: Landmarks;
  /** Resolve early when the player skips. */
  skipSignal: () => Promise<void>;
}

const LINES: Record<TravelDef['mode'], Array<[CrewId, string]>> = {
  funicular: [
    ['annette', 'Igueldo first! It is dodgy and hectic and perfect.'],
    ['huw', 'This funicular is older than all of us combined.'],
  ],
  boat: [
    ['romy', 'A boat to a tiny island. Peak holiday.'],
    ['paulo', 'Everyone wave at the beach. They cannot see us. Wave anyway.'],
  ],
  climb: [
    ['huw', 'These steps are a workout. A beautiful, sweaty workout.'],
    ['annette', 'Nearly there. The view will be worth it.'],
  ],
};

function hideCrew(ctx: TravelContext, hidden: boolean): void {
  for (const m of ctx.crew.members) m.character.root.visible = !hidden;
}

/** Move a vehicle along a path while the camera rides alongside. */
async function ride(ctx: TravelContext, vehicle: THREE.Object3D, path: THREE.Vector3[], seconds: number, camOffset: THREE.Vector3): Promise<void> {
  const curve = new THREE.CatmullRomCurve3(path);
  const state = { t: 0 };
  const look = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const place = () => {
    curve.getPointAt(Math.min(1, state.t), pos);
    curve.getPointAt(Math.min(1, state.t + 0.02), look);
    vehicle.position.copy(pos);
    vehicle.lookAt(look.x, pos.y + (look.y - pos.y), look.z);
    ctx.rig.holdShot({ x: pos.x + camOffset.x, y: pos.y + camOffset.y, z: pos.z + camOffset.z }, { x: pos.x, y: pos.y + 1, z: pos.z });
  };
  place();
  const tween = gsap.to(state, { t: 1, duration: ctx.reducedMotion() ? Math.min(1.2, seconds) : seconds, ease: 'sine.inOut', onUpdate: place });
  await Promise.race([tween.then(() => undefined), ctx.skipSignal()]);
  tween.progress(1);
  place();
}

export async function playTravel(ctx: TravelContext, def: TravelDef): Promise<void> {
  const rm = ctx.reducedMotion();
  const lines = LINES[def.mode];
  if (def.mode === 'climb') {
    await ctx.fade(0.9, rm ? 0.05 : 0.35);
    hideCrew(ctx, true);
    const seconds = ctx.line(lines[0][0], lines[0][1]);
    await ctx.wait(seconds * 0.8);
    if (def.direction > 0) await ctx.wait(ctx.line(lines[1][0], lines[1][1]) * 0.8);
    hideCrew(ctx, false);
    return;
  }
  await ctx.fade(0.9, rm ? 0.05 : 0.3);
  hideCrew(ctx, true);
  let vehicle: THREE.Object3D;
  let path: THREE.Vector3[];
  let offset: THREE.Vector3;
  if (def.mode === 'funicular') {
    vehicle = ctx.landmarks.funicularCar;
    path = def.direction > 0 ? ctx.landmarks.funicularPath : [...ctx.landmarks.funicularPath].reverse();
    // From the bay side, so the hill never gets between the camera and the car.
    offset = new THREE.Vector3(9, 8.5, -9);
  } else {
    vehicle = ctx.landmarks.ferry;
    const s = travelStops();
    const sc = SUMMITS.santaClara;
    const quay = new THREE.Vector3(s.boatQuay.x, -0.05, s.boatQuay.z - 3);
    const jetty = new THREE.Vector3(sc.x + 3.5, -0.05, sc.z + 6.5);
    const mid = new THREE.Vector3((quay.x + jetty.x) / 2, -0.05, Math.min(quay.z, jetty.z) - 6);
    path = def.direction > 0 ? [quay, mid, jetty] : [jetty, mid, quay];
    offset = new THREE.Vector3(-7, 8, 10);
  }
  await ctx.fade(0, rm ? 0.05 : 0.3);
  ctx.line(lines[0][0], lines[0][1]);
  window.setTimeout(() => ctx.line(lines[1][0], lines[1][1]), 2200);
  await ride(ctx, vehicle, path, def.mode === 'funicular' ? 5 : 6, offset);
  await ctx.fade(0.9, rm ? 0.05 : 0.3);
  // The funicular car always rests at the bottom between rides; the boat stays where it docked.
  if (def.mode === 'funicular') {
    const base = ctx.landmarks.funicularPath;
    vehicle.position.copy(base[0]);
    vehicle.lookAt(base[1]);
  }
  hideCrew(ctx, false);
}
