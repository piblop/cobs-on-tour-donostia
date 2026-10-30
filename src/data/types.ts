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

export type AreaId =
  | 'la-concha'
  | 'alderdi-eder'
  | 'parte-vieja'
  | 'plaza'
  | 'peine'
  | 'igueldo'
  | 'urgull'
  | 'santa-clara'
  | 'miramar'
  | 'gros';

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

export type CrewId = 'paulo' | 'annette' | 'huw' | 'romy';

/**
 * Who says a beat:
 * - a crew id: that friend specifically,
 * - 'leader': whoever the player is controlling,
 * - 'subject': the friend the moment is about (the hungry one, the one who wandered off),
 * - 'any': any friend who isn't the leader,
 * - 'other': a different friend from the previous beat's speaker.
 */
export type BanterSpeaker = CrewId | 'leader' | 'subject' | 'any' | 'other';

export interface BanterBeat {
  speaker: BanterSpeaker;
  text: string;
}

/**
 * Banter contexts:
 * idle, area:<id>, time:<morning|midday|afternoon|golden|dusk|night>,
 * discover:<locationId>, need:<hungry|tired|bored>, switch:<crewId>,
 * investigate, bench, vibe:high, sunset, recover, weather:rain, callback.
 */
export interface BanterLine {
  id: string;
  context: string;
  beats: BanterBeat[];
  /** Only play if this memory event has happened (see src/crew/memories.ts). */
  requiresMemory?: string;
}

export type FoodModel =
  | 'tortilla'
  | 'tomato-salad'
  | 'gilda'
  | 'mushroom'
  | 'clams'
  | 'cheek'
  | 'cheesecake'
  | 'txuleta'
  | 'peppers'
  | 'anchovy'
  | 'drink'
  | 'chorizo'
  | 'omelette'
  | 'cod'
  | 'cheese'
  | 'pickles';

export interface FoodDef {
  id: string;
  name: string;
  /** Basque or Spanish name shown in italics, if there is a common one. */
  localName?: string;
  description: string;
  barId: string;
  model: FoodModel;
  /** Main colours for the procedural model. */
  colours: { base: string; topping: string; accent: string };
  alcoholFree: boolean;
  /** How each friend reacts. Every friend gets a line, drinks included. */
  reactions: Record<CrewId, string>;
  /** Conversational rating shown in the Pintxo-dex, e.g. "Unexpected hit". */
  rating: string;
  fact: FactCheck;
}

export interface BarDef {
  id: string;
  /** Fictional name: these are game experiences inspired by real places. */
  name: string;
  inspiredBy: string;
  blurb: string;
  /** Where the door prompt sits, and which way the door faces. */
  door: Vec2;
  facing: number;
  awning: string;
  activity: 'crawl' | 'meal' | 'market' | 'cider';
  menu: string[];
  actionLabel: string;
}

export interface WishDef {
  id: string;
  friend: CrewId;
  text: string;
  /** Completed by tasting a food or by a memory key happening. */
  done: { food: string } | { memory: string };
}

export interface CrewMember {
  id: CrewId;
  name: string;
  /** Clothing and hair colours as hex strings. */
  colors: { top: string; bottom: string; hair: string; skin: string; accent: string };
  hairStyle: 'short' | 'bob' | 'curly' | 'ponytail';
  /** Signature accessory, readable from the gameplay camera. */
  accessory: 'cap' | 'camera' | 'backpack' | 'tote';
  heightScale: number;
  favouriteFoods: string[];
  drinkPreferences: string[];
  energyTendency: 'early-bird' | 'steady' | 'night-owl';
  catchphrases: string[];
  interests: string[];
  distractions: string[];
  reactionStyle: 'beaming' | 'deadpan' | 'dramatic' | 'giggly';
}
