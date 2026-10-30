/**
 * Group Vibe: a supportive measure of how the trip feels. It only rises
 * through good moments and drifts back gently; it never punishes slow
 * exploring, photos or quiet time.
 */
export type VibeSource = 'meal' | 'discovery' | 'sunset' | 'rest' | 'funny' | 'wish' | 'scene';

const GAINS: Record<VibeSource, number> = {
  meal: 10,
  discovery: 8,
  sunset: 10,
  rest: 6,
  funny: 1.5,
  wish: 9,
  scene: 6,
};

export const VIBE_HIGH = 75;

export class Vibe {
  value = 40;
  /** Highest threshold already celebrated today, so bonus moments fire once. */
  celebrated = false;

  add(source: VibeSource): number {
    const before = this.value;
    this.value = Math.min(100, this.value + GAINS[source]);
    return this.value - before;
  }

  /** Gentle drift back toward a comfortable middle, per in-game hour. Never below 45 by drift. */
  drift(hours: number): void {
    if (this.value > 45) this.value = Math.max(45, this.value - hours * 1.2);
  }

  get label(): string {
    const v = this.value;
    if (v < 30) return 'Easygoing';
    if (v < 50) return 'Cosy';
    if (v < 65) return 'Warm';
    if (v < VIBE_HIGH) return 'Glowing';
    return 'Magic';
  }

  /** True the first time the vibe crosses the high threshold in a day. */
  checkHigh(): boolean {
    if (!this.celebrated && this.value >= VIBE_HIGH) {
      this.celebrated = true;
      return true;
    }
    return false;
  }

  newDay(): void {
    this.celebrated = false;
  }
}
