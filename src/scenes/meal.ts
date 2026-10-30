import * as THREE from 'three';
import gsap from 'gsap';
import type { CrewId, FoodDef } from '../data/types.ts';
import { TERRACE_TABLE } from '../data/restaurants.ts';
import { PROMENADE_Y } from '../world/map.ts';
import { animateSteam, makeDish, type Dish } from '../world/food3d.ts';
import type { Crew } from '../crew/crew.ts';
import type { CameraRig } from '../engine/camera.ts';

/** What a scene needs from the game, kept narrow on purpose. */
export interface SceneContext {
  scene: THREE.Scene;
  rig: CameraRig;
  crew: Crew;
  seats: Array<{ x: number; z: number; heading: number }>;
  /** Hide or show the table parasol (it hides faces from the meal camera). */
  setParasol: (visible: boolean) => void;
  reducedMotion: () => boolean;
  fade: (to: number, seconds: number) => Promise<void>;
  /** Show a single line in a speech bubble. */
  line: (speaker: CrewId, text: string) => number;
  sfx: (kind: 'click' | 'open' | 'close' | 'discover' | 'cheer' | 'switch') => void;
  /** Resolves after `seconds`, or sooner if the player presses interact. */
  wait: (seconds: number) => Promise<void>;
  /** Run fn every rendered frame until the returned function is called. */
  onFrame: (fn: (time: number) => void) => () => void;
}

const TABLE_TOP = PROMENADE_Y + 1.0;

/** The camera framing for the terrace table. */
export function tableShot(): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } {
  return {
    // Between two chairs, low enough to see faces and plates rather than the tops of heads.
    position: { x: TERRACE_TABLE.x + 0.3, y: PROMENADE_Y + 3.3, z: TERRACE_TABLE.z + 3.9 },
    target: { x: TERRACE_TABLE.x, y: TABLE_TOP + 0.35, z: TERRACE_TABLE.z - 0.2 },
  };
}

export interface MealHandle {
  /** Dishes on the table, for the snapshot. */
  dishes: Dish[];
  /** Clear the table and stand everyone up by the given spot. */
  leave(at: { x: number; z: number; heading: number }): Promise<void>;
}

/**
 * Sit the crew at the terrace table, bring the dishes out one by one, and let
 * each friend react in their own voice.
 */
export async function serveMeal(ctx: SceneContext, foods: FoodDef[]): Promise<MealHandle> {
  const rm = ctx.reducedMotion();
  await ctx.fade(0.92, rm ? 0.05 : 0.3);
  ctx.crew.seatAround(ctx.seats);
  ctx.setParasol(false);
  await ctx.rig.glideTo(tableShot(), 0.01);
  await ctx.fade(0, rm ? 0.05 : 0.4);

  const dishes: Dish[] = [];
  const stopSteam = ctx.onFrame((time) => {
    for (const d of dishes) animateSteam(d, time, ctx.reducedMotion());
  });

  const spots = foods.map((_, i) => {
    const a = (i / Math.max(1, foods.length)) * Math.PI * 2 + 0.4;
    const r = foods.length === 1 ? 0 : 0.42;
    return { x: TERRACE_TABLE.x + Math.sin(a) * r, z: TERRACE_TABLE.z + Math.cos(a) * r };
  });

  for (const [i, food] of foods.entries()) {
    const dish = makeDish(food);
    dish.group.position.set(spots[i].x, TABLE_TOP, spots[i].z);
    dish.group.rotation.y = i * 1.7;
    ctx.scene.add(dish.group);
    dishes.push(dish);
    ctx.sfx('click');
    if (rm) {
      dish.group.scale.setScalar(1);
    } else {
      // Floating plate entrance.
      gsap.fromTo(dish.group.position, { y: TABLE_TOP + 1.4 }, { y: TABLE_TOP, duration: 0.7, ease: 'bounce.out' });
      gsap.fromTo(dish.group.scale, { x: 0.2, y: 0.2, z: 0.2 }, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2)' });
    }
    // Two friends react to each dish: whoever loves it most, then someone else.
    const order: CrewId[] = ['paulo', 'annette', 'huw', 'romy'];
    const fan = order.find((id) => food.rating.toLowerCase().includes(id)) ?? order[(i * 3 + 1) % 4];
    const other = order[(order.indexOf(fan) + 1 + i) % 4];
    for (const who of [fan, other]) {
      const seconds = ctx.line(who, food.reactions[who]);
      await ctx.wait(seconds * 0.85);
    }
  }

  return {
    dishes,
    async leave(at) {
      await ctx.fade(0.92, ctx.reducedMotion() ? 0.05 : 0.3);
      stopSteam();
      for (const d of dishes) d.dispose();
      dishes.length = 0;
      ctx.crew.standAt(at.x, at.z, at.heading);
      ctx.setParasol(true);
      ctx.rig.cancelCinematic();
      const lead = ctx.crew.leader.mover;
      ctx.rig.snapTo(lead.x, PROMENADE_Y, lead.z);
      await ctx.fade(0, ctx.reducedMotion() ? 0.05 : 0.4);
    },
  };
}
