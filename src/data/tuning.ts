/** Gameplay feel numbers. Tweak here rather than inside engine code. */

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** Longest real-time gap the loop will try to catch up on after a stall. */
export const MAX_FRAME_SECONDS = 0.25;
/** Hard cap on simulation steps per rendered frame. */
export const MAX_STEPS_PER_FRAME = 5;

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

export const interaction = {
  /** Repeat visits skip the glide and show the polaroid quickly. */
  repeatCardDelay: 0.15,
} as const;
