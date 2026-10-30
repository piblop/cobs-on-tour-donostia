import type { CrewMember } from '../data/types.ts';

/**
 * Gentle needs. They only ever *suggest* pacing through banter: nothing is
 * locked, nobody leaves, and there is no way to fail.
 * Values run 0..1 where 1 is content.
 */
export interface NeedValues {
  hunger: number;
  energy: number;
  fun: number;
}

export type NeedKind = 'hungry' | 'tired' | 'bored';

/** Drain per in-game hour. */
const RATES = { hunger: 0.075, energy: 0.04, fun: 0.06 } as const;
const LOW = 0.32;
/** In-game hours before the same friend mentions the same need again. */
const NAG_GAP_HOURS = 3;

export class Needs {
  readonly values: NeedValues = { hunger: 0.8, energy: 0.85, fun: 0.7 };
  private lastNag: Record<NeedKind, number> = { hungry: -99, tired: -99, bored: -99 };

  constructor(readonly member: CrewMember) {}

  /** Advance by in-game hours at a given hour of day. */
  tick(hours: number, hourOfDay: number, walkedMetres: number): void {
    let energyRate: number = RATES.energy;
    const t = this.member.energyTendency;
    const late = hourOfDay >= 21 || hourOfDay < 6;
    const early = hourOfDay >= 6 && hourOfDay < 10;
    if (t === 'early-bird' && late) energyRate *= 1.8;
    if (t === 'night-owl' && early) energyRate *= 1.8;
    if (t === 'night-owl' && late) energyRate *= 0.5;
    this.values.hunger = clamp(this.values.hunger - RATES.hunger * hours);
    this.values.energy = clamp(this.values.energy - energyRate * hours - walkedMetres * 0.0006);
    this.values.fun = clamp(this.values.fun - RATES.fun * hours);
  }

  eat(amount = 0.5): void {
    this.values.hunger = clamp(this.values.hunger + amount);
  }

  rest(amount = 0.35): void {
    this.values.energy = clamp(this.values.energy + amount);
  }

  enjoy(amount = 0.25): void {
    this.values.fun = clamp(this.values.fun + amount);
  }

  /** The most pressing need worth mentioning now, if any (and not mentioned recently). */
  suggestion(absoluteHour: number): NeedKind | null {
    const v = this.values;
    const candidates: Array<[NeedKind, number]> = [
      ['hungry', v.hunger],
      ['tired', v.energy],
      ['bored', v.fun],
    ];
    candidates.sort((a, b) => a[1] - b[1]);
    for (const [kind, value] of candidates) {
      if (value < LOW && absoluteHour - this.lastNag[kind] >= NAG_GAP_HOURS) return kind;
    }
    return null;
  }

  markNagged(kind: NeedKind, absoluteHour: number): void {
    this.lastNag[kind] = absoluteHour;
  }

  /** Short, non-judgemental status for the HUD. */
  status(): NeedKind | null {
    const v = this.values;
    const lowest = Math.min(v.hunger, v.energy, v.fun);
    if (lowest >= LOW) return null;
    if (lowest === v.hunger) return 'hungry';
    if (lowest === v.energy) return 'tired';
    return 'bored';
  }

  toJSON(): NeedValues {
    return { ...this.values };
  }

  load(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    for (const k of ['hunger', 'energy', 'fun'] as const) {
      if (typeof r[k] === 'number' && Number.isFinite(r[k])) this.values[k] = clamp(r[k] as number);
    }
  }
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}
