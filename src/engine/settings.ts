/**
 * Player preferences. Small, so they live in localStorage (game saves use
 * IndexedDB). Every read and write tolerates storage being unavailable.
 */
import type { QualityPreset } from './renderer.ts';

export interface Settings {
  textScale: number;
  highContrastPrompts: boolean;
  /** 'system' follows the OS preference. */
  reducedMotion: 'system' | 'on' | 'off';
  cameraShake: boolean;
  relaxedTiming: boolean;
  oneButton: boolean;
  /** Show a caption bar at the bottom as well as speech bubbles. */
  captionBar: boolean;
  volumes: { master: number; music: number; ambience: number; effects: number };
  muted: boolean;
  quality: QualityPreset;
  resolutionScale: number;
}

export const DEFAULT_SETTINGS: Settings = {
  textScale: 1,
  highContrastPrompts: false,
  reducedMotion: 'system',
  cameraShake: false,
  relaxedTiming: false,
  oneButton: false,
  captionBar: false,
  volumes: { master: 0.8, music: 0.55, ambience: 0.8, effects: 0.8 },
  muted: false,
  quality: 'medium',
  resolutionScale: 1,
};

const KEY = 'cobs-donostia:settings:v1';

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/** Treat stored data as untrusted: keep only known keys with valid values. */
export function sanitiseSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return structuredClone(d);
  const r = raw as Record<string, unknown>;
  const vol = (r.volumes && typeof r.volumes === 'object' ? r.volumes : {}) as Record<string, unknown>;
  const bool = (v: unknown, f: boolean) => (typeof v === 'boolean' ? v : f);
  return {
    textScale: [1, 1.15, 1.3, 1.5].includes(r.textScale as number) ? (r.textScale as number) : d.textScale,
    highContrastPrompts: bool(r.highContrastPrompts, d.highContrastPrompts),
    reducedMotion: r.reducedMotion === 'on' || r.reducedMotion === 'off' ? r.reducedMotion : 'system',
    cameraShake: bool(r.cameraShake, d.cameraShake),
    relaxedTiming: bool(r.relaxedTiming, d.relaxedTiming),
    oneButton: bool(r.oneButton, d.oneButton),
    captionBar: bool(r.captionBar, d.captionBar),
    volumes: {
      master: clamp01(vol.master, d.volumes.master),
      music: clamp01(vol.music, d.volumes.music),
      ambience: clamp01(vol.ambience, d.volumes.ambience),
      effects: clamp01(vol.effects, d.volumes.effects),
    },
    muted: bool(r.muted, d.muted),
    quality: r.quality === 'low' || r.quality === 'high' ? r.quality : 'medium',
    resolutionScale:
      typeof r.resolutionScale === 'number' && r.resolutionScale >= 0.5 && r.resolutionScale <= 1 ? r.resolutionScale : 1,
  };
}

type Listener = (s: Settings) => void;

export class SettingsStore {
  private value: Settings;
  private listeners = new Set<Listener>();
  private systemReduced = false;

  constructor() {
    let raw: unknown = null;
    try {
      const text = localStorage.getItem(KEY);
      if (text) raw = JSON.parse(text);
    } catch {
      raw = null;
    }
    this.value = sanitiseSettings(raw);
    try {
      const mq = matchMedia('(prefers-reduced-motion: reduce)');
      this.systemReduced = mq.matches;
      mq.addEventListener('change', (e) => {
        this.systemReduced = e.matches;
        this.emit();
      });
    } catch {
      this.systemReduced = false;
    }
  }

  get current(): Settings {
    return this.value;
  }

  get reducedMotion(): boolean {
    const r = this.value.reducedMotion;
    return r === 'on' || (r === 'system' && this.systemReduced);
  }

  update(patch: Partial<Settings>): void {
    this.value = sanitiseSettings({ ...this.value, ...patch, volumes: { ...this.value.volumes, ...(patch.volumes ?? {}) } });
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // Private mode or blocked storage: settings still apply for this session.
    }
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.value);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.value);
  }
}
