import type { BanterLine, BanterSpeaker, CrewId } from '../data/types.ts';

/**
 * Plays crew banter without ever overlapping, repeating a line in a session,
 * or turning into constant noise. Priorities let important moments (a
 * discovery) cut in ahead of idle chatter; idle chatter waits its turn.
 */
export interface SayEvent {
  speaker: CrewId;
  text: string;
  lineId: string;
  /** Seconds the bubble should stay up. */
  duration: number;
}

export interface BanterContextInfo {
  leader: CrewId;
  present: CrewId[];
  subject?: CrewId;
  hasMemory: (key: string) => boolean;
}

export const PRIORITY = { idle: 0, ambient: 1, need: 2, moment: 3, important: 4 } as const;

interface Active {
  lineId: string;
  beats: Array<{ speaker: CrewId; text: string }>;
  index: number;
  timeLeft: number;
  priority: number;
}

export class BanterDirector {
  private used = new Set<string>();
  private active: Active | null = null;
  private quiet = 10;
  private contextCooldown = new Map<string, number>();
  /** Multiplies how long each bubble stays (relaxed reading). */
  readingScale = 1;
  onSay: ((e: SayEvent) => void) | null = null;
  onEnd: ((lineId: string) => void) | null = null;
  private rng: () => number;

  constructor(
    private lines: BanterLine[],
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
  }

  get talking(): boolean {
    return this.active !== null;
  }

  /** Lines already played (persisted across saves where practical). */
  get playedIds(): string[] {
    return [...this.used];
  }

  restorePlayed(ids: unknown): void {
    if (!Array.isArray(ids)) return;
    for (const id of ids) if (typeof id === 'string') this.used.add(id);
  }

  static duration(text: string): number {
    return Math.min(6.5, Math.max(2.2, 1.5 + text.length * 0.055));
  }

  /**
   * Try to start a line for a context. Returns true if something started.
   * Lower-priority requests are dropped while someone is talking.
   */
  trigger(context: string, info: BanterContextInfo, priority: number = PRIORITY.ambient, cooldown = 0): boolean {
    if (this.active && this.active.priority >= priority) return false;
    const until = this.contextCooldown.get(context) ?? 0;
    if (until > 0) return false;
    const candidates = this.lines.filter(
      (l) => l.context === context && !this.used.has(l.id) && (!l.requiresMemory || info.hasMemory(l.requiresMemory)) && this.castable(l, info),
    );
    if (candidates.length === 0) return false; // comfortable silence
    const line = candidates[Math.floor(this.rng() * candidates.length)];
    const beats = this.cast(line, info);
    if (!beats) return false;
    this.used.add(line.id);
    if (cooldown > 0) this.contextCooldown.set(context, cooldown);
    this.active = { lineId: line.id, beats, index: -1, timeLeft: 0, priority };
    this.next();
    return true;
  }

  /** Can every beat be given to someone who is actually here? */
  private castable(line: BanterLine, info: BanterContextInfo): boolean {
    for (const b of line.beats) {
      if (this.isCrewId(b.speaker) && !info.present.includes(b.speaker)) return false;
      if (b.speaker === 'subject' && !info.subject) return false;
    }
    return true;
  }

  private isCrewId(s: BanterSpeaker): s is CrewId {
    return s === 'paulo' || s === 'annette' || s === 'huw' || s === 'romy';
  }

  private cast(line: BanterLine, info: BanterContextInfo): Array<{ speaker: CrewId; text: string }> | null {
    const out: Array<{ speaker: CrewId; text: string }> = [];
    const pick = (pool: CrewId[]) => (pool.length ? pool[Math.floor(this.rng() * pool.length)] : null);
    for (const b of line.beats) {
      let who: CrewId | null = null;
      const prev = out.length ? out[out.length - 1].speaker : null;
      switch (b.speaker) {
        case 'leader':
          who = info.leader;
          break;
        case 'subject':
          who = info.subject ?? null;
          break;
        case 'any':
          who = pick(info.present.filter((p) => p !== info.leader && p !== prev));
          break;
        case 'other':
          who = pick(info.present.filter((p) => p !== prev));
          break;
        default:
          who = b.speaker;
      }
      if (!who) return null;
      out.push({ speaker: who, text: b.text });
    }
    return out;
  }

  private next(): void {
    const a = this.active;
    if (!a) return;
    a.index++;
    if (a.index >= a.beats.length) {
      const id = a.lineId;
      this.active = null;
      // Leave a breath of silence before the next ambient line.
      this.quiet = 18 + this.rng() * 20;
      this.onEnd?.(id);
      return;
    }
    const beat = a.beats[a.index];
    const duration = BanterDirector.duration(beat.text) * this.readingScale;
    a.timeLeft = duration + 0.25;
    this.onSay?.({ speaker: beat.speaker, text: beat.text, lineId: a.lineId, duration });
  }

  /** Stop talking now (e.g. a cutscene starts). */
  interrupt(): void {
    this.active = null;
  }

  /**
   * Advance timers. `idleContexts` are offered, in order, when it's time for a
   * bit of ambient chatter.
   */
  update(dt: number, idleContexts: string[], info: BanterContextInfo): void {
    for (const [k, v] of this.contextCooldown) {
      const left = v - dt;
      if (left <= 0) this.contextCooldown.delete(k);
      else this.contextCooldown.set(k, left);
    }
    if (this.active) {
      this.active.timeLeft -= dt;
      if (this.active.timeLeft <= 0) this.next();
      return;
    }
    this.quiet -= dt;
    if (this.quiet > 0) return;
    for (const ctx of idleContexts) {
      if (this.trigger(ctx, info, PRIORITY.idle)) return;
    }
    // Nothing left to say right now: enjoy the silence a while longer.
    this.quiet = 15;
  }
}
