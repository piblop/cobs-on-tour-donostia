/** Shared content types. Everything a writer edits lives in typed tables under src/data/. */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Any real-world claim shown to the player carries its source and review flag.
 * needsReview stays true until a human has checked the claim.
 */
export interface FactCheck {
  text: string;
  source: string;
  needsReview: boolean;
}

export interface CameraShot {
  position: Vec3;
  target: Vec3;
}

export type AreaId = 'la-concha' | 'alderdi-eder' | 'parte-vieja';

export interface Area {
  id: AreaId;
  name: string;
  /** Short handwritten-style subtitle shown on the area banner. */
  subtitle: string;
  /** Axis-aligned trigger rectangle in world units. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Lower numbers win when trigger rectangles overlap. */
  priority: number;
}

export interface LocationDef {
  id: string;
  name: string;
  area: AreaId;
  /** Where the interaction point sits on the ground. */
  position: Vec2;
  /** How close the controlled friend must be for the prompt to appear. */
  interactRadius: number;
  /** Verb shown in the interaction prompt, e.g. "Lean on the railing". */
  actionLabel: string;
  /** Polaroid caption written in the scrapbook voice. */
  polaroidCaption: string;
  /** Postcard framing used for the first-discovery glide. */
  shot: CameraShot;
  fact: FactCheck;
}

export interface CrewMember {
  id: 'paulo' | 'annette' | 'huw' | 'romy';
  name: string;
  /** Clothing and hair colours as hex strings. */
  colors: { top: string; bottom: string; hair: string; skin: string; accent: string };
  hairStyle: 'short' | 'bob' | 'curly' | 'ponytail';
  heightScale: number;
  favouriteFoods: string[];
  drinkPreferences: string[];
  energyTendency: 'early-bird' | 'steady' | 'night-owl';
  catchphrases: string[];
  interests: string[];
  distractions: string[];
  reactionStyle: 'beaming' | 'deadpan' | 'dramatic' | 'giggly';
}
