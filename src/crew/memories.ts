import type { CrewId } from '../data/types.ts';

/**
 * Structured trip memories: what happened, where, when and who was there.
 * Callbacks may only reference events recorded here, so the crew never jokes
 * about something that did not happen.
 */
export interface MemoryEvent {
  /** Stable key used by content, e.g. "discovered:la-concha-railing". */
  key: string;
  /** Human-readable one-liner for the scrapbook and ending. */
  summary: string;
  where: string;
  day: number;
  hour: number;
  who: CrewId[];
}

export class Memories {
  private events: MemoryEvent[] = [];

  record(event: MemoryEvent): void {
    this.events.push({ ...event, who: [...event.who] });
  }

  has(key: string): boolean {
    return this.events.some((e) => e.key === key);
  }

  count(key: string): number {
    return this.events.filter((e) => e.key === key).length;
  }

  all(): readonly MemoryEvent[] {
    return this.events;
  }

  onDay(day: number): MemoryEvent[] {
    return this.events.filter((e) => e.day === day);
  }

  toJSON(): MemoryEvent[] {
    return this.events.map((e) => ({ ...e, who: [...e.who] }));
  }

  /** Load from untrusted save data: keep only well-formed events. */
  load(raw: unknown): void {
    this.events = [];
    if (!Array.isArray(raw)) return;
    const ids = new Set(['paulo', 'annette', 'huw', 'romy']);
    for (const r of raw) {
      if (!r || typeof r !== 'object') continue;
      const e = r as Record<string, unknown>;
      if (typeof e.key !== 'string' || typeof e.summary !== 'string' || typeof e.where !== 'string') continue;
      if (typeof e.day !== 'number' || typeof e.hour !== 'number') continue;
      const who = Array.isArray(e.who) ? e.who.filter((w): w is CrewId => typeof w === 'string' && ids.has(w)) : [];
      this.events.push({
        key: e.key.slice(0, 120),
        summary: e.summary.slice(0, 300),
        where: e.where.slice(0, 120),
        day: Math.max(1, Math.floor(e.day)),
        hour: Math.min(24, Math.max(0, e.hour)),
        who,
      });
    }
  }
}
