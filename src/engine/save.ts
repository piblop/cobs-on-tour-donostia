/**
 * Browser saves. Game state and memories live in IndexedDB with the previous
 * valid save kept as a backup; photos are separate blobs so they can be
 * removed without touching progress. Everything read back is treated as
 * untrusted and sanitised.
 */
import type { CrewId } from '../data/types.ts';
import type { MemoryEvent } from '../crew/memories.ts';
import type { NeedValues } from '../crew/needs.ts';

export const SAVE_VERSION = 1;

export interface PhotoMeta {
  id: string;
  day: number;
  title: string;
}

export interface ScrapbookPage {
  day: number;
  /** Memory key chosen as the moment of the day. */
  moment: string | null;
  caption: string;
  photoIds: string[];
  foods: string[];
  memories: string[];
}

export interface TripData {
  version: number;
  savedAt: number;
  day: number;
  hour: number;
  leader: CrewId;
  crew: Array<{ id: CrewId; x: number; z: number; heading: number }>;
  discovered: string[];
  foods: Array<{ id: string; day: number }>;
  memories: MemoryEvent[];
  needs: Partial<Record<CrewId, NeedValues>>;
  vibe: number;
  banterPlayed: string[];
  wishes: { day: number; offered: string[]; pinned: string[]; done: string[] };
  goal: string | null;
  flags: string[];
  pages: ScrapbookPage[];
  photos: PhotoMeta[];
  /** Personal captions for discovered sights. */
  captions: Record<string, string>;
  favourites: string[];
  encounters: string[];
  friendships: string[];
}

const CREW_IDS = new Set(['paulo', 'annette', 'huw', 'romy']);

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const strList = (v: unknown, max = 500): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 200)).slice(0, max) : [];

/** Validate save data from storage (or a file). Returns null if it is unusable. */
export function sanitiseTrip(raw: unknown): TripData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'number' || r.version < 1 || r.version > SAVE_VERSION) return null;
  const leader = str(r.leader, 20);
  if (!leader || !CREW_IDS.has(leader)) return null;
  const crew = Array.isArray(r.crew)
    ? r.crew
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && CREW_IDS.has(String((c as Record<string, unknown>).id)))
        .map((c) => ({
          id: c.id as CrewId,
          x: num(c.x, -200, 200, 0),
          z: num(c.z, -200, 200, 0),
          heading: num(c.heading, -10, 10, 0),
        }))
    : [];
  const needs: Partial<Record<CrewId, NeedValues>> = {};
  if (r.needs && typeof r.needs === 'object') {
    for (const [k, v] of Object.entries(r.needs as Record<string, unknown>)) {
      if (!CREW_IDS.has(k) || !v || typeof v !== 'object') continue;
      const n = v as Record<string, unknown>;
      needs[k as CrewId] = { hunger: num(n.hunger, 0, 1, 0.8), energy: num(n.energy, 0, 1, 0.8), fun: num(n.fun, 0, 1, 0.7) };
    }
  }
  const w = (r.wishes && typeof r.wishes === 'object' ? r.wishes : {}) as Record<string, unknown>;
  const pages: ScrapbookPage[] = Array.isArray(r.pages)
    ? r.pages
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p) => ({
          day: num(p.day, 1, 99, 1),
          moment: str(p.moment, 120),
          caption: str(p.caption, 160) ?? '',
          photoIds: strList(p.photoIds, 40),
          foods: strList(p.foods, 60),
          memories: strList(p.memories, 60),
        }))
        .slice(0, 60)
    : [];
  const photos: PhotoMeta[] = Array.isArray(r.photos)
    ? r.photos
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as Record<string, unknown>).id === 'string')
        .map((p) => ({ id: String(p.id).slice(0, 80), day: num(p.day, 1, 99, 1), title: str(p.title, 120) ?? '' }))
        .slice(0, 300)
    : [];
  const foods = Array.isArray(r.foods)
    ? r.foods
        .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && typeof (f as Record<string, unknown>).id === 'string')
        .map((f) => ({ id: String(f.id).slice(0, 80), day: num(f.day, 1, 99, 1) }))
        .slice(0, 500)
    : [];
  return {
    version: SAVE_VERSION,
    savedAt: num(r.savedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    day: Math.floor(num(r.day, 1, 99, 1)),
    hour: num(r.hour, 0, 23.99, 9),
    leader: leader as CrewId,
    crew,
    discovered: strList(r.discovered),
    foods,
    memories: Array.isArray(r.memories) ? (r.memories as MemoryEvent[]) : [],
    needs,
    vibe: num(r.vibe, 0, 100, 40),
    banterPlayed: strList(r.banterPlayed, 2000),
    wishes: {
      day: Math.floor(num(w.day, 0, 99, 0)),
      offered: strList(w.offered, 8),
      pinned: strList(w.pinned, 3),
      done: strList(w.done, 200),
    },
    goal: str(r.goal, 60),
    flags: strList(r.flags, 200),
    pages,
    photos,
    captions: Object.fromEntries(
      Object.entries(r.captions && typeof r.captions === 'object' ? (r.captions as Record<string, unknown>) : {})
        .filter(([k, v]) => typeof v === 'string' && k.length < 80)
        .slice(0, 100)
        .map(([k, v]) => [k, (v as string).slice(0, 80)]),
    ),
    favourites: strList(r.favourites, 100),
    encounters: strList(r.encounters, 100),
    friendships: strList(r.friendships, 100),
  };
}

export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' | 'quota' | 'error'; message: string };

const DB_NAME = 'cobs-donostia';
const DB_VERSION = 1;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function describe(err: unknown): SaveResult {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'QuotaExceededError') {
    return { ok: false, reason: 'quota', message: 'The browser is out of storage space for this game. Removing old photos usually helps.' };
  }
  return { ok: false, reason: 'error', message: 'The browser would not save just now. Your trip is still running.' };
}

export class SaveStore {
  private db: IDBDatabase | null = null;
  available = false;

  async open(): Promise<boolean> {
    if (this.db) return true;
    try {
      if (!('indexedDB' in window)) return false;
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('trip')) db.createObjectStore('trip');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      this.db = await promisify(req);
      this.available = true;
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  /** Load the current save, falling back to the backup if the current one is damaged. */
  async load(): Promise<{ data: TripData; source: 'current' | 'backup' } | null> {
    if (!(await this.open()) || !this.db) return null;
    try {
      const tx = this.db.transaction('trip', 'readonly');
      const store = tx.objectStore('trip');
      const [current, backup] = await Promise.all([promisify(store.get('current')), promisify(store.get('backup'))]);
      const a = sanitiseTrip(current);
      if (a) return { data: a, source: 'current' };
      const b = sanitiseTrip(backup);
      if (b) return { data: b, source: 'backup' };
      return null;
    } catch {
      return null;
    }
  }

  async hasSave(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  /** Keep the previous valid save as a backup, then write the new one, atomically. */
  async save(data: TripData): Promise<SaveResult> {
    if (!(await this.open()) || !this.db) {
      return { ok: false, reason: 'unavailable', message: 'This browser is not letting the game save (private mode or blocked site data).' };
    }
    try {
      const tx = this.db.transaction('trip', 'readwrite');
      const store = tx.objectStore('trip');
      const previous = await promisify(store.get('current'));
      if (sanitiseTrip(previous)) store.put(previous, 'backup');
      store.put({ ...data, version: SAVE_VERSION, savedAt: Date.now() }, 'current');
      await done(tx);
      return { ok: true };
    } catch (err) {
      return describe(err);
    }
  }

  /** Delete the trip and its photos (only after the player confirms). */
  async clear(): Promise<void> {
    if (!(await this.open()) || !this.db) return;
    const tx = this.db.transaction(['trip', 'photos'], 'readwrite');
    tx.objectStore('trip').clear();
    tx.objectStore('photos').clear();
    await done(tx);
  }

  async putPhoto(id: string, blob: Blob): Promise<SaveResult> {
    if (!(await this.open()) || !this.db) return { ok: false, reason: 'unavailable', message: 'Photos cannot be stored in this browser.' };
    try {
      const tx = this.db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put(blob, id);
      await done(tx);
      return { ok: true };
    } catch (err) {
      return describe(err);
    }
  }

  async getPhoto(id: string): Promise<Blob | null> {
    if (!(await this.open()) || !this.db) return null;
    try {
      const tx = this.db.transaction('photos', 'readonly');
      const v = await promisify(tx.objectStore('photos').get(id));
      return v instanceof Blob ? v : null;
    } catch {
      return null;
    }
  }

  /** Remove stored photos without touching progress. */
  async deletePhotos(ids?: string[]): Promise<void> {
    if (!(await this.open()) || !this.db) return;
    const tx = this.db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    if (ids) for (const id of ids) store.delete(id);
    else store.clear();
    await done(tx);
  }
}

/** Turn a data URL snapshot into a Blob for storage. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const bytes = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  } catch {
    return null;
  }
}
