/**
 * Procedural sound with the Web Audio API only: no samples, no libraries.
 * Created on the first user gesture ("Start Trip"); faded and suspended when
 * the tab is hidden so nothing bursts on return.
 */
import type { Settings } from './settings.ts';

export type Surface = 'sand' | 'stone' | 'grass';

export interface AmbienceMix {
  /** 0..1 how close the crew is to the surf. */
  surf: number;
  /** 0..1 old-town lanes and bars. */
  crowd: number;
  /** 0..1 open, high or windy places. */
  wind: number;
  /** 0..1 how much night it is (crickets-ish shimmer, softer gulls). */
  night: number;
}

function noiseBuffer(ctx: AudioContext, seconds: number, kind: 'white' | 'brown' | 'pink'): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') data[i] = w * 0.5;
    else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.2;
    } else {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
  }
  // Crossfade the tail into the head so the loop has no seam or click.
  const fade = Math.floor(ctx.sampleRate * 0.3);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    const j = length - fade + i;
    data[j] = data[j] * (1 - t) + data[i] * t;
  }
  return buf;
}

/** D major pentatonic over two octaves, as frequencies. */
const DAY_SCALE = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99];
const NIGHT_SCALE = [220, 246.94, 293.66, 329.63, 369.99, 440, 493.88, 587.33];
const CHORDS = [
  [146.83, 220, 293.66],
  [123.47, 185, 246.94],
  [164.81, 246.94, 329.63],
  [110, 164.81, 220],
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private ambience!: GainNode;
  private sfx!: GainNode;
  private surfGain!: GainNode;
  private surfSwell!: GainNode;
  private crowdGain!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private nightGain!: GainNode;
  private white!: AudioBuffer;
  private mix: AmbienceMix = { surf: 0, crowd: 0, wind: 0, night: 0 };
  private nextGull = 4;
  private nextNote = 0;
  private chordIndex = 0;
  private nextChord = 0;
  private padVoices: OscillatorNode[] = [];
  private settings: Settings | null = null;
  private suspended = false;
  private ducked = false;
  private echoIn!: GainNode;
  private sources: AudioScheduledSourceNode[] = [];

  get started(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  start(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);
    this.music = this.bus();
    this.ambience = this.bus();
    this.sfx = this.bus();

    this.white = noiseBuffer(ctx, 2, 'white');
    const brown = noiseBuffer(ctx, 6, 'brown');
    const pink = noiseBuffer(ctx, 5, 'pink');

    // Surf: brown noise, low-passed, swelling like waves rolling in.
    this.surfGain = ctx.createGain();
    this.surfGain.gain.value = 0;
    this.surfSwell = ctx.createGain();
    this.surfSwell.gain.value = 0.6;
    const surfLp = ctx.createBiquadFilter();
    surfLp.type = 'lowpass';
    surfLp.frequency.value = 700;
    this.loop(brown).connect(surfLp).connect(this.surfSwell).connect(this.surfGain).connect(this.ambience);
    // Two incommensurate swells, so the waves never fall into an obvious beat.
    for (const [rate, depth] of [
      [0.11, 0.3],
      [0.067, 0.16],
    ]) {
      const swellLfo = ctx.createOscillator();
      swellLfo.frequency.value = rate;
      const swellDepth = ctx.createGain();
      swellDepth.gain.value = depth;
      swellLfo.connect(swellDepth).connect(this.surfSwell.gain);
      swellLfo.start();
      this.sources.push(swellLfo);
    }
    // A brighter hiss on the wash of each wave.
    const wash = ctx.createBiquadFilter();
    wash.type = 'bandpass';
    wash.frequency.value = 2400;
    wash.Q.value = 0.6;
    const washGain = ctx.createGain();
    washGain.gain.value = 0.08;
    this.loop(pink).connect(wash).connect(washGain).connect(this.surfSwell);

    // Wind: pink noise through a slowly wandering band-pass.
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.9;
    this.loop(pink).connect(this.windFilter).connect(this.windGain).connect(this.ambience);

    // Crowd murmur: band-limited noise with a babbling amplitude wobble.
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    const voice = ctx.createBiquadFilter();
    voice.type = 'bandpass';
    voice.frequency.value = 650;
    voice.Q.value = 1.4;
    const babble = ctx.createGain();
    babble.gain.value = 0.5;
    this.loop(brown).connect(voice).connect(babble).connect(this.crowdGain).connect(this.ambience);
    for (const [rate, depth] of [
      [2.7, 0.18],
      [4.3, 0.12],
      [0.6, 0.1],
    ]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g).connect(babble.gain);
      lfo.start();
      this.sources.push(lfo);
    }

    // Night shimmer: a very quiet high band, like distant insects.
    this.nightGain = ctx.createGain();
    this.nightGain.gain.value = 0;
    const shimmer = ctx.createBiquadFilter();
    shimmer.type = 'bandpass';
    shimmer.frequency.value = 5200;
    shimmer.Q.value = 8;
    this.loop(this.white).connect(shimmer).connect(this.nightGain).connect(this.ambience);

    // Soft pad: three detuned sines that glide between chords.
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = CHORDS[0][i];
      osc.detune.value = (i - 1) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.045;
      osc.connect(g).connect(this.music);
      osc.start();
      this.padVoices.push(osc);
      this.sources.push(osc);
    }

    // One shared echo for the plucks, so notes never leave nodes behind.
    this.echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.38;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    this.echoIn.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(this.music);

    if (this.settings) this.applySettings(this.settings);
    this.fadeMaster(1, 2.5);
  }

  private bus(): GainNode {
    const g = this.ctx!.createGain();
    g.connect(this.master);
    return g;
  }

  private loop(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    // Seamless buffer: loop the whole thing, starting somewhere different each time.
    src.start(0, Math.random() * buffer.duration * 0.9);
    this.sources.push(src);
    return src;
  }

  private fadeMaster(target: number, seconds: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target * (this.settings?.muted ? 0 : (this.settings?.volumes.master ?? 0.8)), now + seconds);
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, now, 0.08);
    set(this.master.gain, s.muted || this.suspended ? 0 : s.volumes.master);
    set(this.music.gain, s.volumes.music * 0.9);
    set(this.ambience.gain, s.volumes.ambience * (this.ducked ? 0.45 : 1));
    set(this.sfx.gain, s.volumes.effects);
  }

  /** Tab hidden: fade out and suspend. Visible again: resume and fade back in. */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    this.suspended = hidden;
    if (hidden) {
      this.fadeMaster(0, 0.15);
      window.setTimeout(() => {
        if (this.suspended) void this.ctx?.suspend();
      }, 200);
    } else {
      void this.ctx.resume().then(() => this.fadeMaster(1, 1.2));
    }
  }

  /** Menus and cinematics duck the world a little. */
  /** Stop everything and release the audio device. */
  dispose(): void {
    if (!this.ctx) return;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
      s.disconnect();
    }
    this.sources = [];
    void this.ctx.close();
    this.ctx = null;
  }

  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (!this.ctx) return;
    this.ambience.gain.setTargetAtTime((this.settings?.volumes.ambience ?? 0.8) * (ducked ? 0.45 : 1), this.ctx.currentTime, 0.25);
  }

  /** Called every frame with where the crew is and what time it is. */
  update(mix: AmbienceMix, dt: number): void {
    if (!this.ctx || this.suspended) return;
    const now = this.ctx.currentTime;
    // Crossfade area layers gently.
    const k = 1 - Math.exp(-dt * 1.5);
    this.mix.surf += (mix.surf - this.mix.surf) * k;
    this.mix.crowd += (mix.crowd - this.mix.crowd) * k;
    this.mix.wind += (mix.wind - this.mix.wind) * k;
    this.mix.night += (mix.night - this.mix.night) * k;
    this.surfGain.gain.setTargetAtTime(0.05 + this.mix.surf * 0.42, now, 0.3);
    this.crowdGain.gain.setTargetAtTime(this.mix.crowd * (0.12 + this.mix.night * 0.14), now, 0.3);
    this.windGain.gain.setTargetAtTime(0.02 + this.mix.wind * 0.1, now, 0.4);
    this.windFilter.frequency.setTargetAtTime(420 + Math.sin(now * 0.13) * 160 + Math.sin(now * 0.31) * 70, now, 0.5);
    this.nightGain.gain.setTargetAtTime(this.mix.night * 0.012, now, 0.6);

    // Gulls by day near the water.
    this.nextGull -= dt;
    if (this.nextGull <= 0) {
      this.nextGull = 7 + Math.random() * 12;
      if (this.mix.surf > 0.25 && this.mix.night < 0.5) this.gull();
    }
    this.tickMusic(now);
  }

  private tickMusic(now: number): void {
    if (now >= this.nextChord) {
      this.nextChord = now + 12;
      this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
      this.padVoices.forEach((osc, i) => osc.frequency.setTargetAtTime(CHORDS[this.chordIndex][i], now, 2.5));
    }
    if (now >= this.nextNote) {
      // Sparse plucks: room to breathe, never a constant tune.
      this.nextNote = now + 1.1 + Math.random() * 2.4;
      if (Math.random() < 0.7) {
        const scale = this.mix.night > 0.5 ? NIGHT_SCALE : DAY_SCALE;
        this.pluck(scale[Math.floor(Math.random() * scale.length)], 0.05, now);
      }
    }
  }

  private pluck(freq: number, level: number, when: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(level, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, when + 2.2);
    osc.connect(g);
    g.connect(this.music);
    g.connect(this.echoIn);
    osc.start(when);
    osc.stop(when + 2.4);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private gull(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const calls = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < calls; i++) {
      const t = now + i * 0.32;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const base = 1300 + Math.random() * 300;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.linearRampToValueAtTime(base * 0.62, t + 0.22);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.26);
      osc.connect(bp).connect(g).connect(this.ambience);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  footstep(surface: Surface): void {
    if (!this.ctx || this.suspended) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = surface === 'stone' ? 'bandpass' : 'lowpass';
    f.frequency.value = surface === 'stone' ? 1900 + Math.random() * 400 : surface === 'sand' ? 600 : 900;
    f.Q.value = surface === 'stone' ? 2.5 : 0.7;
    const g = ctx.createGain();
    const level = surface === 'stone' ? 0.09 : 0.07;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(level, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, now + (surface === 'sand' ? 0.16 : 0.08));
    src.connect(f).connect(g).connect(this.sfx);
    src.start(now, Math.random() * 1.5);
    src.stop(now + 0.2);
  }

  /** Short UI feedback. */
  ui(kind: 'click' | 'open' | 'close' | 'discover' | 'cheer' | 'switch'): void {
    if (!this.ctx || this.suspended) return;
    const now = this.ctx.currentTime;
    const notes: Record<typeof kind, number[]> = {
      click: [880],
      open: [587.33, 880],
      close: [880, 587.33],
      switch: [659.25, 783.99],
      discover: [587.33, 739.99, 880, 1174.66],
      cheer: [523.25, 659.25, 783.99, 1046.5],
    };
    notes[kind].forEach((freq, i) => {
      const t = now + i * (kind === 'discover' || kind === 'cheer' ? 0.11 : 0.06);
      const osc = this.ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(kind === 'click' ? 0.05 : 0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + (kind === 'discover' ? 0.9 : 0.25));
      osc.connect(g).connect(this.sfx);
      osc.start(t);
      osc.stop(t + 1);
    });
  }
}
