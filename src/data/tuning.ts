/** Gameplay feel numbers. Tweak here rather than inside engine code. */

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** Longest real-time gap the loop will try to catch up on after a stall. */
export const MAX_FRAME_SECONDS = 0.25;
/** Hard cap on simulation steps per rendered frame. */
export const MAX_STEPS_PER_FRAME = 8;

export const movement = {
  walkSpeed: 4.2,
  briskSpeed: 6.6,
  acceleration: 20,
  deceleration: 16,
  /** Exponential turn rate; higher snaps faster. */
  turnRate: 12,
  radius: 0.34,
} as const;

export const camera = {
  minDistance: 15,
  maxDistance: 50,
  defaultDistance: 31,
  /** Pitch in radians at min and max zoom. */
  pitchNear: 0.82,
  pitchFar: 1.06,
  /** Angular frequency of the critically damped follow spring. */
  followOmega: 5.5,
  zoomSmoothing: 9,
  rotateSpeed: 1.8,
  /** Looking inland from over the bay: beach in front, facades behind. */
  defaultYaw: Math.PI,
  /** Seconds for the first-discovery glide. */
  arrivalGlide: 1.5,
  returnGlide: 0.85,
  lookHeight: 1.4,
} as const;

/** Mini-game timing. Relaxed timing scales speeds down and windows up. */
export const minigameTuning = {
  crawl: {
    /** Marker sweeps per second across the bartender track. */
    eyeSpeed: 0.75,
    /** Fraction of the track that counts as "looking your way". */
    eyeWindow: 0.22,
    eyeWindowRelaxed: 0.36,
    /** After this many misses the bartender comes over anyway. */
    eyeMaxMisses: 3,
    /** One-button mode: seconds the highlight rests on each dish. */
    pickCycle: 1.3,
    carrySeconds: 10,
    carryDrift: 1.1,
    carryControl: 2.4,
    relaxedScale: 1.6,
  },
  txotx: {
    /** Seconds per friend's pour. */
    roundSeconds: 7,
    /** How fast the cider arc's landing point wanders. */
    wobbleSpeed: 1.1,
    /** Fraction of the scene width the glass covers. */
    glassWidth: 0.12,
    glassWidthRelaxed: 0.2,
    /** Glass movement in scene widths per second. */
    glassSpeed: 0.75,
    relaxedScale: 1.6,
  },
} as const;

/** The shape of the trip. */
export const trip = {
  /** The ending montage plays after this day's evening. "One More Day" continues after it. */
  days: 5,
} as const;

export const interaction = {
  /** Repeat visits skip the glide and show the polaroid quickly. */
  repeatCardDelay: 0.15,
} as const;
