import './styles/main.css';
import './styles/story.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { validateContent, formatIssues } from './data/validate.ts';
import { areas, locations } from './data/locations.ts';
import { banter } from './data/banter.ts';
import type { CrewId } from './data/types.ts';
import { GameLoop } from './engine/loop.ts';
import { GameState } from './engine/state.ts';
import { Input, type Action } from './engine/input.ts';
import { CameraRig } from './engine/camera.ts';
import { Renderer } from './engine/renderer.ts';
import { events } from './engine/events.ts';
import { SettingsStore, type Settings } from './engine/settings.ts';
import { AudioEngine, type Surface } from './engine/audio.ts';
import { createScenery, PALETTE, type Scenery } from './world/scenery.ts';
import { createBuildings } from './world/buildings.ts';
import { buildCollisionWorld, type CollisionWorld } from './world/collisions.ts';
import { BAY_EAST, BAY_WEST, groundY, projectToShore, spawnPoint, type Prop } from './world/map.ts';
import { Interactables, areaAt, type Spot } from './world/locations.ts';
import { DayNight, clockRate, formatClock } from './world/dayNight.ts';
import { Crew } from './crew/crew.ts';
import { BanterDirector, PRIORITY, type BanterContextInfo } from './crew/banter.ts';
import { Memories } from './crew/memories.ts';
import { Needs } from './crew/needs.ts';
import { Vibe } from './crew/vibe.ts';
import { installPaperTexture } from './ui/paper.ts';
import { showTitle, type TitleScreen } from './ui/title.ts';
import { Hud } from './ui/hud.ts';
import { Bubbles } from './ui/bubbles.ts';
import { showPolaroid, type PolaroidCard } from './ui/discovery.ts';
import { showPause, type PauseMenu } from './ui/pause.ts';
import { settingsPanel } from './ui/settings.ts';
import { showFatal } from './ui/fatal.ts';
import { h } from './ui/dom.ts';
import type { PerfOverlay } from './engine/perfOverlay.ts';
import type { BarDef, FoodDef, LocationDef } from './data/types.ts';
import { foodById } from './data/foods.ts';
import { wishes } from './data/wishes.ts';
import { crew as crewData } from './data/crew.ts';
import { SaveStore, dataUrlToBlob, type PhotoMeta, type ScrapbookPage, type TripData } from './engine/save.ts';
import { createBars, type BarDressing } from './world/bars.ts';
import { cutaway } from './world/materials.ts';
import { bayPoint, PROMENADE_Y } from './world/map.ts';
import { serveMeal, type SceneContext } from './scenes/meal.ts';
import { showArrivalTicket, choose, toast } from './ui/story.ts';
import { showPlanning } from './ui/planning.ts';
import { showScrapbookPage } from './ui/scrapbook.ts';
import { playPintxosCrawl } from './minigames/pintxosCrawl.ts';
import { playTxotx } from './minigames/txotx.ts';
import { createLandmarks, type Landmarks } from './world/landmarks.ts';
import { createNpcs, type Npcs } from './world/npcs.ts';
import { Weather } from './world/weather.ts';
import { Crowds } from './world/crowds.ts';
import type { TravelDef } from './world/travel.ts';
import { playTravel } from './scenes/travel.ts';
import { encounters, friendships, type EncounterDef, type FriendshipDef } from './data/encounters.ts';
import { foods as allFoods } from './data/foods.ts';
import { showFeast } from './ui/feast.ts';
import { showJournal } from './ui/journal.ts';
import { foodThumbnail, makeDish } from './world/food3d.ts';
import { playEnding, showBook, type EndingSlide } from './ui/ending.ts';
import { trip as tripTuning } from './data/tuning.ts';
import { TouchControls } from './ui/touch.ts';
import { showQuickTravel } from './ui/quickTravel.ts';
import { travelLinks } from './world/travel.ts';

const loadingFill = document.getElementById('loading-fill');
const loadingStep = document.getElementById('loading-step');

/** Real loading progress: each step is actual work, then the browser gets a frame to paint. */
async function progress(fraction: number, label: string): Promise<void> {
  if (loadingFill) loadingFill.style.width = `${Math.round(fraction * 100)}%`;
  if (loadingStep) loadingStep.textContent = label;
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

interface Systems {
  ui: HTMLElement;
  scene: THREE.Scene;
  renderer: Renderer;
  rig: CameraRig;
  input: Input;
  world: CollisionWorld;
  scenery: Scenery;
  interactables: Interactables;
  crew: Crew;
  dayNight: DayNight;
  settings: SettingsStore;
  bars: BarDressing;
  landmarks: Landmarks;
  npcs: Npcs;
  weather: Weather;
  crowds: Crowds;
}

const ARRIVAL = { x0: 30, d: 12.5 };
const MORNING_HOUR = 8.5;
const DAY_ONE_GOAL = 'Find somewhere for pintxos tonight';
const TIPS = [
  'Annette’s rule: as many tomato salads as possible while in Basque country.',
  'Annette swears by the burnt cheesecake. “Best on the planet. Non-negotiable.”',
  'Morning txakoli is a local tradition (according to Annette).',
  'Local wisdom: one pintxo and one drink per bar, then move on.',
  'Pack for everything: gumboots, a raincoat, and room for cheesecake.',
];

/**
 * Quick travel stops, west to east. Ground-level stops are open from the start;
 * a stop with `via` borrows that travel link's arrival point and unlocks once
 * its sight has been discovered, so the ride itself always comes first.
 */
const QUICK_STOPS: Array<{ area: string; at?: { x: number; z: number; heading: number }; via?: string; sight?: string; locked?: string }> = [
  { area: 'igueldo', via: 'funicular-up', sight: 'igueldo-view', locked: 'Ride the funicular up first' },
  { area: 'peine', at: { x: -80, z: -29, heading: Math.PI } },
  { area: 'miramar', at: { x: -49, z: 6, heading: Math.PI } },
  { area: 'santa-clara', via: 'boat-out', sight: 'santa-clara', locked: 'Take the little boat over first' },
  { area: 'la-concha' },
  { area: 'alderdi-eder', at: { x: 28, z: 4, heading: Math.PI } },
  { area: 'parte-vieja', at: { x: 53.4, z: 3.5, heading: Math.PI / 2 } },
  { area: 'plaza', at: { x: 78.5, z: 6, heading: Math.PI } },
  { area: 'urgull', via: 'urgull-up', sight: 'urgull-castle', locked: 'Climb the path up first' },
  { area: 'gros', at: { x: 125, z: -5, heading: Math.PI } },
];

class Game {
  readonly state = new GameState();
  private s: Systems;
  private audio = new AudioEngine();
  private banter: BanterDirector;
  private memories = new Memories();
  private needs = new Map<CrewId, Needs>();
  private vibe = new Vibe();
  private bubbles: Bubbles;
  private hud: Hud;
  private fade: HTMLElement;
  private anchor = new THREE.Vector3();
  private discovered = new Set<string>();
  private currentArea: string | null = null;
  private decorTime = 0;
  private faceTarget: number | null = null;
  private title: TitleScreen | null = null;
  private pause: PauseMenu | null = null;
  private card: PolaroidCard | null = null;
  private cardDone: (() => void) | null = null;
  private movedSinceStart = 0;
  private hintHidden = false;
  private reducedMotion = false;
  private needCheck = 0;
  private hudTimer = 0;
  private idleAtRailing = 0;
  private sunsetDay = 0;
  private walked = 0;
  private benchSatThisSit = false;
  private lastSettings: Settings | null = null;
  private saves = new SaveStore();
  private foodsTried: Array<{ id: string; day: number }> = [];
  private wishDay = { day: 0, offered: [] as string[], pinned: [] as string[] };
  private wishesDone = new Set<string>();
  private goal: string | null = null;
  private goalDone = false;
  private flags = new Set<string>();
  private pages: ScrapbookPage[] = [];
  private photos: PhotoMeta[] = [];
  private photoUrls = new Map<string, string>();
  private frameHooks = new Set<(time: number) => void>();
  private advance: (() => void) | null = null;
  private autoWalk: { x: number; z: number } | null = null;
  private lateAskedDay = 0;
  private warnedSave = false;
  private tripStarted = false;
  private captions: Record<string, string> = {};
  private favourites = new Set<string>();
  private encountersDone = new Set<string>();
  private friendshipsDone = new Set<string>();
  private encounterBusy = false;
  private encounterTimer = 0;
  private friendTimer = 0;
  private friendship: FriendshipDef | null = null;
  private wasRaining = false;
  /** Warm lamplight that keeps the friends' faces readable at night. */
  private crewLight = new THREE.PointLight('#ffd2a0', 0, 11, 1.3);
  perf: PerfOverlay | null = null;

  constructor(s: Systems) {
    this.s = s;
    this.hud = new Hud(s.ui);
    this.hud.setVisible(false);
    this.hud.setCount(0, locations.length);
    this.hud.onPromptTap = () => s.input.press('interact');
    new TouchControls(s.ui, s.renderer.canvas, s.input);
    this.bubbles = new Bubbles(s.ui);
    this.fade = h('div', { class: 'fade', attrs: { 'aria-hidden': 'true' } });
    // Inside the UI layer, so story overlays and toasts can sit above the curtain.
    s.ui.append(this.fade);
    for (const m of s.crew.members) this.needs.set(m.def.id, new Needs(m.def));
    queueMicrotask(() => this.wire());

    this.banter = this.makeDirector();
  }

  private makeDirector(): BanterDirector {
    const s = this.s;
    const d = new BanterDirector(banter);
    d.readingScale = s.settings.current.relaxedTiming ? 1.35 : 1;
    d.onSay = (e) => {
      const m = s.crew.byId(e.speaker);
      if (!m) return;
      this.bubbles.say(e.speaker, m.def.name, m.def.colors.top, e.text, e.duration, {
        day: s.dayNight.day,
        time: formatClock(s.dayNight.hour),
      });
    };
    d.onEnd = (id) => {
      const line = banter.find((l) => l.id === id);
      if (line && line.beats.length > 1) this.vibe.add('funny');
    };
    return d;
  }

  private wire(): void {
    const s = this.s;
    s.crew.onRecover = (id) => this.say('recover', PRIORITY.ambient, id as CrewId, 60);
    s.crew.onInvestigate = (id) => this.say('investigate', PRIORITY.ambient, id as CrewId, 25);
    s.crew.pointsOfInterest = s.interactables.pointsOfInterest();
    s.dayNight.onPhase = (phase) => this.say(`time:${phase}`, PRIORITY.ambient, undefined, 0);
    s.crew.leader.character.onStep = () => this.footstep();

    s.scene.add(this.crewLight);
    s.settings.subscribe((v) => this.applySettings(v));
    void this.saves.open();
    const lead = s.crew.leader;
    s.rig.snapTo(lead.mover.x, groundY(lead.mover.x, lead.mover.z), lead.mover.z);
  }

  // --- Settings ---------------------------------------------------------------

  private applySettings(v: Settings): void {
    const s = this.s;
    this.reducedMotion = s.settings.reducedMotion;
    document.documentElement.style.setProperty('--text-scale', String(v.textScale));
    s.rig.reducedMotion = this.reducedMotion;
    this.hud.reducedMotion = this.reducedMotion;
    this.bubbles.reducedMotion = this.reducedMotion;
    this.hud.setHighContrast(v.highContrastPrompts);
    this.bubbles.captionBar = v.captionBar;
    this.banter.readingScale = v.relaxedTiming ? 1.35 : 1;
    this.audio.applySettings(v);
    const prev = this.lastSettings;
    if (!prev || prev.quality !== v.quality || prev.resolutionScale !== v.resolutionScale) {
      s.renderer.apply({ quality: v.quality, resolutionScale: v.resolutionScale });
      s.landmarks.setQuality(v.quality);
      // Fewer townsfolk on lighter presets; the crew and encounters are unaffected.
      s.crowds.density = v.quality === 'low' ? 0.5 : v.quality === 'medium' ? 0.85 : 1;
    }
    this.lastSettings = v;
  }

  // --- Helpers ------------------------------------------------------------------

  private banterInfo(subject?: CrewId): BanterContextInfo {
    const c = this.s.crew;
    return {
      leader: c.leader.def.id,
      present: c.members.map((m) => m.def.id),
      subject,
      hasMemory: (k) => this.memories.has(k),
    };
  }

  private say(context: string, priority: number, subject?: CrewId, cooldown = 30): boolean {
    if (!this.state.gameplayActive && priority < PRIORITY.important) return false;
    return this.banter.trigger(context, this.banterInfo(subject), priority, cooldown);
  }

  private remember(key: string, summary: string, where?: string): void {
    const dn = this.s.dayNight;
    this.memories.record({
      key,
      summary,
      where: where ?? (this.currentArea ? (areaAt(this.s.crew.leader.mover.x, this.s.crew.leader.mover.z)?.name ?? 'Donostia') : 'Donostia'),
      day: dn.day,
      hour: dn.hour,
      who: this.s.crew.members.map((m) => m.def.id),
    });
    this.checkWishes();
  }

  private surfaceUnderLeader(): Surface {
    const m = this.s.crew.leader.mover;
    if (groundY(m.x, m.z) < 1) return 'sand';
    if (this.currentArea === 'alderdi-eder' && m.z < 9.5 && m.x < 53) return 'grass';
    return 'stone';
  }

  private footstep(): void {
    if (this.state.gameplayActive) this.audio.footstep(this.surfaceUnderLeader());
  }

  // --- Simulation (fixed 60 Hz) ---------------------------------------------

  step = (dt: number): void => {
    if (!this.state.simulationRunning) return;
    const s = this.s;
    const crew = s.crew;
    let intent = { x: 0, z: 0, brisk: false };
    if (this.state.gameplayActive) {
      const raw = s.input.move();
      if (crew.seated) {
        // Any real push on the stick or keys stands everyone up.
        if (Math.hypot(raw.x, raw.z) > 0.5) this.standUp();
      } else {
        const w = s.rig.screenToWorld(raw.x, raw.z);
        intent = { x: w.x, z: w.z, brisk: raw.brisk };
      }
    }
    if (this.autoWalk) intent = { x: this.autoWalk.x, z: this.autoWalk.z, brisk: false };
    const allowFollowers = this.state.gameplayActive || this.autoWalk !== null;
    crew.step(dt, intent, allowFollowers, this.faceTarget);
    if (!this.state.gameplayActive) return;

    const lead = crew.leader.mover;
    const speed = Math.hypot(lead.vx, lead.vz);
    this.movedSinceStart += speed * dt;
    this.walked += speed * dt;

    // The clock only runs while exploring.
    const gameHours = (dt * clockRate(s.dayNight.hour)) / 60;
    // The evening only ends when the player chooses, so the clock waits just before midnight.
    if (s.dayNight.hour < 23.9) s.dayNight.advance(dt);
    for (const n of this.needs.values()) n.tick(gameHours, s.dayNight.hour, crew.seated ? 0 : speed * dt);
    this.vibe.drift(gameHours);
    if (crew.seated) for (const n of this.needs.values()) n.rest(dt * 0.02);

    const area = areaAt(lead.x, lead.z);
    if (area && area.id !== this.currentArea) {
      this.currentArea = area.id;
      this.hud.showArea(area.name, area.subtitle);
      events.emit('area:entered', { id: area.id, name: area.name, subtitle: area.subtitle });
      this.say(`area:${area.id}`, PRIORITY.ambient, undefined, 40);
      const tight = area.id === 'parte-vieja' || area.id === 'plaza';
      s.rig.setAreaFraming(tight ? 0.2 : 0, tight ? 0.8 : 1);
      // Wider see-through hole among the old town's tall houses.
      cutaway.uCutRadius.value = tight ? 5.2 : 3.6;
    }
    this.checkSunset(dt, speed);
    this.encounterTimer -= dt;
    if (this.encounterTimer <= 0) {
      this.encounterTimer = 0.5;
      this.checkEncounters();
    }
    this.friendTimer -= dt;
    if (this.friendTimer <= 0) {
      this.friendTimer = 1;
      this.friendship = this.availableFriendship();
    }
  };

  /** A once-a-day moment: standing by the railing as the sun goes down. */
  private checkSunset(dt: number, speed: number): void {
    const dn = this.s.dayNight;
    if (this.sunsetDay === dn.day || dn.hour < 19.2 || dn.hour > 20.8) {
      this.idleAtRailing = 0;
      return;
    }
    const lead = this.s.crew.leader.mover;
    const { x0, d } = projectToShore(lead.x, lead.z);
    const atRailing = x0 > BAY_WEST && x0 < BAY_EAST && d > 8.8 && d < 13;
    this.idleAtRailing = atRailing && speed < 0.3 ? this.idleAtRailing + dt : 0;
    if (this.idleAtRailing > 3.5) {
      this.sunsetDay = dn.day;
      this.vibe.add('sunset');
      this.remember('watched:sunset', 'Watched the sun go down over La Concha', 'La Concha');
      this.banter.interrupt();
      this.say('sunset', PRIORITY.moment, undefined, 0);
    }
  }

  // --- Rendering (every display frame) ---------------------------------------

  render = (alpha: number, frameDt: number): void => {
    const s = this.s;
    s.input.pollGamepad();
    for (const action of s.input.consume()) this.handle(action);

    if (this.state.gameplayActive) {
      const rot = s.input.cameraRotate();
      s.rig.rotate(rot.rate, rot.drag, frameDt);
      const zoom = s.input.zoom();
      if (zoom) s.rig.addZoom(zoom);
    } else {
      s.input.cameraRotate();
      s.input.zoom();
    }

    const frozen = this.state.name === 'menu';
    if (!frozen) this.decorTime += frameDt;
    s.crew.interpolate(alpha);
    s.crew.animate(frameDt, this.reducedMotion, frozen);
    const leadPos = s.crew.leader.renderPos;
    s.rig.update(leadPos, frameDt);
    const onTitle = this.state.name === 'title';
    if (onTitle) s.rig.titleView(this.decorTime, this.reducedMotion);
    s.interactables.group.visible = !onTitle;
    s.dayNight.apply();
    s.dayNight.followLight(leadPos.x, leadPos.z);
    this.crewLight.position.set(leadPos.x, leadPos.y + 4.2, leadPos.z + 1.5);
    this.crewLight.intensity = s.dayNight.night * 10;
    s.scenery.update(this.decorTime);
    for (const fn of this.frameHooks) fn(this.decorTime);
    s.interactables.update(this.decorTime, this.reducedMotion);
    s.landmarks.update(this.decorTime, this.reducedMotion, this.state.name === 'cinematic');
    s.landmarks.kursaalGlow.emissiveIntensity = s.dayNight.night * 0.45;
    s.npcs.update(frozen ? 0 : frameDt, this.decorTime, this.reducedMotion);
    s.crowds.update(frozen ? 0 : frameDt, s.dayNight.hour, this.reducedMotion);
    if (!frozen && this.state.name !== 'title') s.weather.update(frameDt, s.dayNight.day, s.dayNight.hour, leadPos, this.reducedMotion);
    s.dayNight.overcast = s.weather.intensity;
    this.audio.setRain(s.weather.intensity);
    if (s.weather.raining !== this.wasRaining) {
      this.wasRaining = s.weather.raining;
      for (const m of s.crew.members) m.character.setUmbrella(this.wasRaining);
      if (this.wasRaining) this.say('weather:rain', PRIORITY.ambient, undefined, 0);
    }
    this.updatePrompt();

    if (this.state.gameplayActive) {
      this.banter.update(frameDt, this.idleContexts(), this.banterInfo());
      this.needCheck -= frameDt;
      if (this.needCheck <= 0) {
        this.needCheck = 8;
        this.checkNeeds();
      }
      if (this.vibe.checkHigh()) this.celebrate();
      if (s.dayNight.hour >= 22.5 && this.lateAskedDay !== s.dayNight.day && !s.crew.seated) {
        this.lateAskedDay = s.dayNight.day;
        void this.askLate();
      }
    }
    this.bubbles.update(frozen ? 0 : frameDt, (id) => this.headAnchor(id));
    this.updateAudio(frameDt);
    this.hudTimer -= frameDt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.updateHud();
    }

    if (!this.hintHidden && this.movedSinceStart > 6) {
      this.hintHidden = true;
      this.hud.hideHint();
    }

    const info = s.renderer.info;
    info.reset();
    s.renderer.render();
    this.perf?.update(frameDt, info, s.scene);
  };

  private idleContexts(): string[] {
    const list = ['callback', `time:${this.s.dayNight.phaseName}`];
    if (this.currentArea) list.push(`area:${this.currentArea}`);
    list.push('idle');
    return list;
  }

  private checkNeeds(): void {
    const abs = this.s.dayNight.day * 24 + this.s.dayNight.hour;
    for (const [id, n] of this.needs) {
      const kind = n.suggestion(abs);
      if (!kind) continue;
      if (this.say(`need:${kind}`, PRIORITY.need, id, 45)) {
        n.markNagged(kind, abs);
        return;
      }
    }
  }

  private celebrate(): void {
    this.say('vibe:high', PRIORITY.moment, undefined, 0);
    this.audio.ui('cheer');
    for (const m of this.s.crew.members) {
      m.character.hop(0.45);
      m.character.cheering = 1.6;
    }
  }

  private headAnchor(id: CrewId): { x: number; y: number } | null {
    const m = this.s.crew.byId(id);
    if (!m) return null;
    this.anchor.copy(m.renderPos);
    this.anchor.y += m.character.seated ? 2.7 : 3.4;
    this.anchor.project(this.s.rig.camera);
    if (this.anchor.z > 1 || Math.abs(this.anchor.x) > 1.2 || Math.abs(this.anchor.y) > 1.2) return null;
    return { x: (this.anchor.x * 0.5 + 0.5) * window.innerWidth, y: (-this.anchor.y * 0.5 + 0.5) * window.innerHeight };
  }

  private updateAudio(dt: number): void {
    if (!this.audio.started) return;
    const lead = this.s.crew.leader.mover;
    let surf = 0.3;
    if (lead.x < BAY_EAST + 6) {
      const { d } = projectToShore(lead.x, lead.z);
      surf = Math.min(1, Math.max(0, 1 - (d - 2) / 24));
    }
    const crowd = this.currentArea === 'parte-vieja' ? 1 : this.currentArea === 'alderdi-eder' ? 0.3 : 0.05;
    const wind = groundY(lead.x, lead.z) < 1 ? 0.6 : 0.3;
    this.audio.update({ surf, crowd, wind, night: this.s.dayNight.night }, dt);
  }

  private updateHud(): void {
    const s = this.s;
    this.hud.setGoals(this.goalItems());
    this.hud.setClock(s.dayNight.day, formatClock(s.dayNight.hour), s.dayNight.night > 0.5);
    this.hud.setVibe(this.vibe.value, this.vibe.label);
    this.hud.setCrew(
      s.crew.members.map((m, i) => ({
        id: m.def.id,
        name: m.def.name,
        colour: m.def.colors.top,
        leader: i === s.crew.leaderIndex,
        need: this.needs.get(m.def.id)?.status() ?? null,
      })),
    );
  }

  private updatePrompt(): void {
    const s = this.s;
    if (!this.state.gameplayActive) {
      s.interactables.setActive(null);
      this.hud.setPrompt(null, null, '');
      return;
    }
    const key = s.input.device === 'gamepad' ? 'A' : s.input.device === 'touch' ? '✋' : 'E';
    const lead = s.crew.leader;
    const overLeader = (label: string) => {
      this.anchor.copy(lead.renderPos).setY(lead.renderPos.y + 3.6).project(s.rig.camera);
      this.hud.setPrompt(label, { x: (this.anchor.x * 0.5 + 0.5) * window.innerWidth, y: (-this.anchor.y * 0.5 + 0.5) * window.innerHeight }, key);
    };
    if (s.crew.seated) {
      s.interactables.setActive(null);
      overLeader(this.friendship?.when.seated ? `♥ ${this.friendship.title}` : 'Stand up');
      return;
    }
    const spot = s.interactables.nearest(lead.mover.x, lead.mover.z);
    s.interactables.setActive(spot?.id ?? null);
    if (!spot) {
      if (this.friendship && !this.friendship.when.seated) overLeader(`♥ ${this.friendship.title}`);
      else this.hud.setPrompt(null, null, '');
      return;
    }
    s.interactables.promptAnchor(spot.id, this.anchor).project(s.rig.camera);
    if (this.anchor.z > 1) {
      this.hud.setPrompt(null, null, '');
      return;
    }
    const x = (this.anchor.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.anchor.y * 0.5 + 0.5) * window.innerHeight;
    const label = spot.kind === 'discovery' && this.discovered.has(spot.id) ? `${spot.label} again` : spot.label;
    this.hud.setPrompt(label, { x, y }, key);
  }

  // --- Actions ----------------------------------------------------------------

  /** Controller left/right adjusts a focused slider. */
  private nudgeSlider(dir: 1 | -1): void {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement) || el.type !== 'range') return;
    if (dir > 0) el.stepUp();
    else el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private clickFocused(): void {
    const el = document.activeElement;
    if (el instanceof HTMLButtonElement) el.click();
  }

  private handle(action: Action): void {
    if (action === 'devOverlay') {
      this.perf?.toggle();
      return;
    }
    const s = this.s;
    switch (this.state.name) {
      case 'title':
        if (action === 'up') this.title?.nav(-1);
        else if (action === 'down') this.title?.nav(1);
        else if (action === 'interact' && s.input.device === 'gamepad') this.clickFocused();
        break;
      case 'exploring':
        if (action === 'pause') this.openPause();
        else if (action === 'resetCamera') s.rig.resetView();
        else if (action === 'switchFriend') this.switchFriend();
        else if (action === 'journal') void this.openJournal('sights');
        else if (action === 'map') void this.openQuickTravel();
        else if (action === 'interact' || action === 'confirm') this.interact();
        break;
      case 'cinematic':
        if (action === 'interact' || action === 'confirm' || action === 'pause' || action === 'back') s.rig.skip();
        break;
      case 'card':
        if (action === 'interact' || action === 'pause' || action === 'back') this.cardDone?.();
        break;
      case 'scene':
        if (action === 'interact' || action === 'confirm' || action === 'back') this.advance?.();
        break;
      case 'menu':
        if (action === 'pause' || action === 'back') {
          if (!this.pause?.back()) void this.closePause();
        } else if (action === 'up') this.pause?.nav(-1);
        else if (action === 'down') this.pause?.nav(1);
        else if (action === 'left' || action === 'right') this.nudgeSlider(action === 'left' ? -1 : 1);
        else if (action === 'interact' && s.input.device === 'gamepad') this.clickFocused();
        break;
      default:
        break;
    }
  }

  private interact(): void {
    const s = this.s;
    if (s.crew.seated) {
      if (this.friendship?.when.seated) void this.playFriendship(this.friendship);
      else this.standUp();
      return;
    }
    const spot = s.interactables.nearest(s.crew.leader.mover.x, s.crew.leader.mover.z);
    if (!spot) {
      if (this.friendship) void this.playFriendship(this.friendship);
      return;
    }
    if (spot.kind === 'travel') {
      void this.travel(spot.travel);
      return;
    }
    if (spot.kind === 'discovery') void this.discover(spot.loc);
    else if (spot.kind === 'bar') void this.visitBar(spot.bar);
    else void this.sit(spot);
  }

  private switchFriend(): void {
    const s = this.s;
    if (s.crew.seated) return;
    s.crew.leader.character.onStep = null;
    const lead = s.crew.switchLeader();
    lead.character.onStep = () => this.footstep();
    lead.character.hop(0.3);
    this.audio.ui('switch');
    this.hud.announce(`You are now ${lead.def.name}.`);
    const key = `led:${lead.def.id}`;
    if (!this.memories.has(key)) this.remember(key, `${lead.def.name} took the lead`);
    this.banter.interrupt();
    this.say(`switch:${lead.def.id}`, PRIORITY.moment, lead.def.id, 0);
    this.updateHud();
  }

  // --- Flow -------------------------------------------------------------------

  private settingsFor = (onDone: () => void): HTMLElement => settingsPanel(this.s.settings, onDone);

  showTitleScreen(): void {
    this.hud.setVisible(false);
    this.bubbles.clear();
    this.state.set('title');
    void this.saves.load().then((saved) => {
      if (this.state.name !== 'title' || this.title) return;
      this.title = showTitle(this.s.ui, {
        onNew: () => void this.confirmNewTrip(saved !== null),
        onContinue: saved ? () => void this.startTrip(saved.data) : undefined,
        continueLabel: saved ? `Continue trip · Day ${saved.data.day}` : undefined,
        reducedMotion: this.reducedMotion,
        settings: this.settingsFor,
        storageNote: this.saves.available
          ? undefined
          : 'This browser is not letting the game save (private mode or blocked site data). You can still play.',
      });
      if (saved?.source === 'backup') toast(this.s.ui, 'Your latest save was damaged, so we restored the one before it.', 'warn');
    });
  }

  private async confirmNewTrip(hasSave: boolean): Promise<void> {
    if (hasSave) {
      const ok = await choose(
        this.s.ui,
        'Start a new trip?',
        'This replaces the trip saved in this browser, including its scrapbook and photos.',
        [
          { label: 'Keep my trip', value: false },
          { label: 'Start fresh', value: true },
        ],
        this.reducedMotion,
      );
      if (!ok) return;
      await this.saves.clear();
    }
    void this.startTrip(null);
  }

  private async startTrip(saved: TripData | null): Promise<void> {
    if (this.state.name !== 'title' || !this.title) return;
    const s = this.s;
    // The click on "Start Trip" is the user gesture that unlocks audio.
    this.audio.start();
    this.audio.applySettings(s.settings.current);
    this.audio.ui('open');
    const title = this.title;
    this.title = null;
    s.rig.resetView();
    await title.close();
    this.resetTrip();
    if (saved) {
      await this.applyTrip(saved);
    } else {
      // Opening: the train ticket, then the crew steps out onto the promenade at golden hour.
      this.state.set('scene');
      await showArrivalTicket(s.ui, this.reducedMotion);
      const p = bayPoint(ARRIVAL.x0, ARRIVAL.d);
      s.crew.teleport(p.x, p.z, Math.PI / 2);
      this.state.set('cinematic');
      const tangent = { x: 0.93, z: -0.36 };
      this.autoWalk = tangent;
      this.goal = DAY_ONE_GOAL;
      this.flags.add('opening');
    }
    this.tripStarted = true;
    this.state.set('cinematic');
    const glide = s.rig.glideFromCurrent(this.reducedMotion ? 0.3 : 2.2);
    await glide;
    this.autoWalk = null;
    if (import.meta.env.DEV) {
      // Dev only: ?hour=21.5 overrides the starting time after a new trip resets it.
      const devHour = Number(new URLSearchParams(location.search).get('hour'));
      if (Number.isFinite(devHour) && devHour > 0) s.dayNight.setTime(devHour);
      // Dev only: ?day=5 starts on a later day.
      const devDay = Number(new URLSearchParams(location.search).get('day'));
      if (Number.isFinite(devDay) && devDay > 1) s.dayNight.setTime(s.dayNight.hour, Math.floor(devDay));
      // Dev only: ?rain=1 starts a shower now.
      if (new URLSearchParams(location.search).get('rain')) s.weather.setRainNow(s.dayNight.day, s.dayNight.hour);
      // Dev only: ?spawn=x,z starts the crew somewhere specific for testing.
      const sp = new URLSearchParams(location.search).get('spawn')?.split(',').map(Number);
      if (sp && sp.length === 2 && sp.every(Number.isFinite)) {
        s.crew.teleport(sp[0], sp[1], Math.PI / 2);
        s.rig.snapTo(sp[0], groundY(sp[0], sp[1]), sp[1]);
      }
    }
    this.state.set('exploring');
    s.renderer.canvas.focus({ preventScroll: true });
    this.hud.setVisible(true);
    this.hud.showHint(s.input.device);
    this.updateHud();
    const lead = s.crew.leader.mover;
    const area = areaAt(lead.x, lead.z);
    if (area) {
      this.currentArea = area.id;
      this.hud.showArea(area.name, area.subtitle);
    }
    s.dayNight.apply();
    if (this.flags.has('opening')) {
      this.flags.delete('opening');
      this.say('arrival', PRIORITY.moment, undefined, 0);
      window.setTimeout(() => this.say('goal:pintxos', PRIORITY.ambient, undefined, 90), 22000);
      void this.autosave();
    } else if (this.flags.has('needs-planning')) {
      await this.morningPlanning();
    } else {
      window.setTimeout(() => this.say(`time:${s.dayNight.phaseName}`, PRIORITY.ambient, undefined, 0), 2500);
    }
  }

  private async discover(loc: LocationDef): Promise<void> {
    const s = this.s;
    const firstTime = !this.discovered.has(loc.id);
    this.banter.interrupt();
    this.bubbles.clear();
    this.state.set('cinematic');
    this.audio.setDucked(true);
    const lead = s.crew.leader.mover;
    this.faceTarget = Math.atan2(loc.shot.target.x - lead.x, loc.shot.target.z - lead.z);
    for (const m of s.crew.members) m.character.hop(firstTime ? 0.6 : 0.35);
    if (firstTime) this.audio.ui('discover');
    await s.rig.glideTo(loc.shot, firstTime ? undefined : 0.6);
    if (this.state.name !== 'cinematic') return;
    s.renderer.setTiltShift(0.35);
    const photo = s.renderer.snapshot();
    s.renderer.setTiltShift(1);
    if (firstTime) void this.keepPhoto(photo, loc.name);
    this.state.set('card');
    await new Promise<void>((resolve) => {
      let done = false;
      this.cardDone = () => {
        if (done) return;
        done = true;
        resolve();
      };
      this.card = showPolaroid(s.ui, loc, photo, firstTime, () => this.cardDone?.(), this.reducedMotion);
    });
    this.cardDone = null;
    const card = this.card;
    this.card = null;
    this.audio.ui('close');
    await card?.close();
    if (firstTime) {
      this.discovered.add(loc.id);
      s.interactables.markDiscovered(loc.id);
      this.hud.setCount(this.discovered.size, locations.length);
      this.hud.announce(`${loc.name} added to the journal.`);
      this.vibe.add('discovery');
      for (const n of this.needs.values()) n.enjoy(0.35);
      this.remember(`discovered:${loc.id}`, `Discovered ${loc.name}`, loc.name);
      void this.autosave();
    }
    events.emit('location:discovered', { id: loc.id, firstTime });
    this.state.set('cinematic');
    await s.rig.returnToFollow();
    this.faceTarget = null;
    this.audio.setDucked(false);
    this.state.set('exploring');
    s.renderer.canvas.focus({ preventScroll: true });
    if (firstTime) window.setTimeout(() => this.say(`discover:${loc.id}`, PRIORITY.moment, undefined, 0), 600);
  }

  private async sit(spot: Extract<Spot, { kind: 'bench' }>): Promise<void> {
    const bench: Prop = spot.bench;
    this.banter.interrupt();
    await gsap.to(this.fade, { opacity: 0.85, duration: this.reducedMotion ? 0.05 : 0.25 });
    this.s.crew.sitAt(bench);
    this.benchSatThisSit = false;
    await gsap.to(this.fade, { opacity: 0, duration: this.reducedMotion ? 0.05 : 0.35 });
    this.audio.ui('open');
    if (!this.benchSatThisSit) {
      this.benchSatThisSit = true;
      this.vibe.add('rest');
      if (!this.memories.has('sat:bench')) this.remember('sat:bench', 'Sat together on a bench by the bay');
      this.say('bench', PRIORITY.moment, undefined, 0);
      void this.autosave();
    }
  }

  private standUp(): void {
    if (!this.s.crew.seated) return;
    this.s.crew.standUp();
    this.audio.ui('close');
  }

  private openPause(): void {
    this.state.set('menu');
    this.s.input.clear();
    this.audio.setDucked(true);
    this.audio.ui('open');
    this.pause = showPause(
      this.s.ui,
      {
        resume: () => void this.closePause(),
        returnToPromenade: () => void this.returnToPromenade(),
        toTitle: () => void this.backToTitle(),
        settings: this.settingsFor,
        history: () => this.bubbles.history,
        journal: () => void this.journalFromMenu(),
        quickTravel: () => void this.quickTravelFromMenu(),
        callItANight: this.s.dayNight.hour >= 19.5 || this.s.dayNight.hour < 4 ? () => void this.callItANightFromMenu() : undefined,
      },
      this.reducedMotion,
    );
  }

  private async closePause(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    this.audio.ui('close');
    await menu?.close();
    this.audio.setDucked(false);
    if (this.state.name === 'menu') this.state.set('exploring');
    this.s.renderer.canvas.focus({ preventScroll: true });
  }

  /** Safe recovery: put the crew back on the promenade without touching progress. */
  private async returnToPromenade(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    const p = spawnPoint();
    await this.hop(p.x, p.z, Math.PI);
  }

  /** Fade out, move the whole crew and camera, fade back in. Progress is untouched. */
  private async hop(x: number, z: number, heading: number): Promise<void> {
    const s = this.s;
    s.rig.cancelCinematic();
    this.banter.interrupt();
    this.bubbles.clear();
    this.state.set('cinematic');
    await gsap.to(this.fade, { opacity: 1, duration: this.reducedMotion ? 0.05 : 0.3 });
    s.crew.teleport(x, z, heading);
    this.faceTarget = null;
    s.rig.snapTo(x, groundY(x, z), z);
    s.rig.resetView();
    this.audio.setDucked(false);
    this.state.set('exploring');
    await gsap.to(this.fade, { opacity: 0, duration: this.reducedMotion ? 0.05 : 0.4 });
    s.renderer.canvas.focus({ preventScroll: true });
  }

  /** Quick travel: pick a stop on the card and the crew hop straight there. */
  private async openQuickTravel(): Promise<void> {
    if (this.state.name !== 'exploring') return;
    this.state.set('scene');
    this.s.input.clear();
    this.audio.ui('open');
    const links = travelLinks();
    const stops = QUICK_STOPS.map((q) => {
      const area = areas.find((a) => a.id === q.area)!;
      const locked = q.sight && !this.discovered.has(q.sight) ? (q.locked ?? 'Not yet') : null;
      return { id: q.area, name: area.name, subtitle: area.subtitle, locked, here: this.currentArea === q.area };
    });
    const menu = showQuickTravel(this.s.ui, stops, this.reducedMotion);
    // Esc / B closes the card like "Stay here".
    this.advance = menu.cancel;
    const id = await menu.result;
    this.advance = null;
    this.audio.ui('close');
    const stop = QUICK_STOPS.find((q) => q.area === id);
    if (!stop) {
      this.state.set('exploring');
      this.s.renderer.canvas.focus({ preventScroll: true });
      return;
    }
    const via = stop.via ? links.find((l) => l.id === stop.via)?.to : undefined;
    const p = stop.at ?? via ?? { ...spawnPoint(), heading: Math.PI };
    await this.hop(p.x, p.z, p.heading);
    void this.autosave();
  }

  private async quickTravelFromMenu(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    this.audio.setDucked(false);
    this.state.set('exploring');
    await this.openQuickTravel();
  }

  private async backToTitle(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    this.audio.setDucked(false);
    this.showTitleScreen();
  }

  // --- Trip state ------------------------------------------------------------------

  private resetTrip(): void {
    const s = this.s;
    this.memories = new Memories();
    this.banter = this.makeDirector();
    this.discovered.clear();
    s.interactables.resetDiscovered();
    this.hud.setCount(0, locations.length);
    this.foodsTried = [];
    this.wishDay = { day: 0, offered: [], pinned: [] };
    this.wishesDone.clear();
    this.goal = null;
    this.goalDone = false;
    this.flags.clear();
    this.pages = [];
    this.photos = [];
    this.captions = {};
    this.favourites.clear();
    this.encountersDone.clear();
    this.friendshipsDone.clear();
    this.friendship = null;
    for (const url of this.photoUrls.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    this.photoUrls.clear();
    this.vibe = new Vibe();
    for (const m of s.crew.members) this.needs.set(m.def.id, new Needs(m.def));
    this.sunsetDay = 0;
    this.lateAskedDay = 0;
    this.currentArea = null;
    s.dayNight.setTime(17.4, 1);
    const p = spawnPoint();
    s.crew.teleport(p.x, p.z, Math.PI);
  }

  private buildTrip(): TripData {
    const s = this.s;
    const needs: TripData['needs'] = {};
    for (const [id, n] of this.needs) needs[id] = n.toJSON();
    return {
      version: 1,
      savedAt: Date.now(),
      day: s.dayNight.day,
      hour: s.dayNight.hour,
      leader: s.crew.leader.def.id,
      crew: s.crew.members.map((m) => ({ id: m.def.id, x: m.mover.x, z: m.mover.z, heading: m.mover.heading })),
      discovered: [...this.discovered],
      foods: [...this.foodsTried],
      memories: this.memories.toJSON(),
      needs,
      vibe: this.vibe.value,
      banterPlayed: this.banter.playedIds,
      wishes: { day: this.wishDay.day, offered: [...this.wishDay.offered], pinned: [...this.wishDay.pinned], done: [...this.wishesDone] },
      goal: this.goal && !this.goalDone ? this.goal : null,
      flags: [...this.flags],
      pages: this.pages,
      captions: { ...this.captions },
      favourites: [...this.favourites],
      encounters: [...this.encountersDone],
      friendships: [...this.friendshipsDone],
      photos: this.photos,
    };
  }

  private async applyTrip(d: TripData): Promise<void> {
    const s = this.s;
    s.dayNight.setTime(d.hour, d.day);
    this.discovered = new Set(d.discovered.filter((id) => locations.some((l) => l.id === id)));
    for (const id of this.discovered) s.interactables.markDiscovered(id);
    this.hud.setCount(this.discovered.size, locations.length);
    this.foodsTried = d.foods.filter((f) => foodById(f.id));
    this.memories.load(d.memories);
    for (const [id, n] of this.needs) n.load(d.needs[id]);
    this.vibe.value = d.vibe;
    this.banter.restorePlayed(d.banterPlayed);
    this.wishDay = { day: d.wishes.day, offered: d.wishes.offered, pinned: d.wishes.pinned };
    this.wishesDone = new Set(d.wishes.done);
    this.goal = d.goal;
    this.goalDone = false;
    this.flags = new Set(d.flags);
    this.pages = d.pages;
    this.photos = d.photos;
    this.captions = { ...d.captions };
    this.favourites = new Set(d.favourites);
    this.encountersDone = new Set(d.encounters);
    this.friendshipsDone = new Set(d.friendships);
    this.sunsetDay = this.memories.all().some((m) => m.key === 'watched:sunset' && m.day === d.day) ? d.day : 0;
    // Put the leader back in charge and everyone where they were.
    while (s.crew.leader.def.id !== d.leader) s.crew.switchLeader();
    const lead = d.crew.find((c) => c.id === d.leader);
    if (lead && s.world.isFree(lead.x, lead.z, 0.34)) s.crew.teleport(lead.x, lead.z, lead.heading);
    else {
      const p = spawnPoint();
      s.crew.teleport(p.x, p.z, Math.PI);
    }
    s.rig.snapTo(s.crew.leader.mover.x, groundY(s.crew.leader.mover.x, s.crew.leader.mover.z), s.crew.leader.mover.z);
    for (const p of this.photos) {
      const blob = await this.saves.getPhoto(p.id);
      if (blob) this.photoUrls.set(p.id, URL.createObjectURL(blob));
    }
  }

  private async autosave(): Promise<void> {
    if (!this.tripStarted) return;
    const result = await this.saves.save(this.buildTrip());
    if (!result.ok && !this.warnedSave) {
      this.warnedSave = true;
      toast(this.s.ui, `${result.message} Saves are local to this browser.`, 'warn');
    }
  }

  private async keepPhoto(dataUrl: string, title: string): Promise<void> {
    if (!dataUrl) return;
    const id = `photo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    this.photos.push({ id, day: this.s.dayNight.day, title });
    this.photoUrls.set(id, dataUrl);
    const blob = dataUrlToBlob(dataUrl);
    if (blob) {
      const r = await this.saves.putPhoto(id, blob);
      if (!r.ok && !this.warnedSave) {
        this.warnedSave = true;
        toast(this.s.ui, r.message, 'warn');
      }
    }
  }

  // --- Goals and wishes -------------------------------------------------------------

  private goalItems(): Array<{ text: string; done: boolean }> {
    const items: Array<{ text: string; done: boolean }> = [];
    if (this.goal) items.push({ text: this.goal, done: this.goalDone });
    for (const id of this.wishDay.pinned) {
      const w = wishes.find((x) => x.id === id);
      const who = crewData.find((c) => c.id === w?.friend)?.name ?? '';
      if (w) items.push({ text: `${who}: ${w.text}`, done: this.wishesDone.has(id) });
    }
    return items;
  }

  private wishSatisfied(id: string): boolean {
    const w = wishes.find((x) => x.id === id);
    if (!w) return false;
    if ('food' in w.done) return this.foodsTried.some((f) => f.id === (w.done as { food: string }).food);
    return this.memories.has(w.done.memory);
  }

  private checkWishes(): void {
    for (const id of this.wishDay.offered) {
      if (this.wishesDone.has(id) || !this.wishSatisfied(id)) continue;
      this.wishesDone.add(id);
      if (!this.wishDay.pinned.includes(id)) continue;
      const w = wishes.find((x) => x.id === id)!;
      this.vibe.add('wish');
      this.audio.ui('cheer');
      const m = this.s.crew.byId(w.friend);
      m?.character.hop(0.5);
      toast(this.s.ui, `Wish granted: ${crewData.find((c) => c.id === w.friend)?.name}’s “${w.text}”`);
      window.setTimeout(() => this.say('wish:done', PRIORITY.moment, w.friend, 0), 400);
    }
    this.updateHud();
  }

  private offerWishes(day: number): Array<{ wish: (typeof wishes)[number]; friend: (typeof crewData)[number] }> {
    return crewData.map((friend) => {
      const mine = wishes.filter((w) => w.friend === friend.id);
      const open = mine.filter((w) => !this.wishesDone.has(w.id) && !this.wishSatisfied(w.id));
      const pool = open.length ? open : mine;
      return { wish: pool[day % pool.length], friend };
    });
  }

  private async morningPlanning(): Promise<void> {
    const s = this.s;
    this.state.set('scene');
    const day = s.dayNight.day;
    const offered = this.offerWishes(day);
    const tips = [TIPS[day % TIPS.length], TIPS[(day + 2) % TIPS.length]];
    const pinned = await showPlanning(s.ui, day, offered, tips, this.reducedMotion);
    this.wishDay = { day, offered: offered.map((o) => o.wish.id), pinned };
    this.flags.delete('needs-planning');
    this.state.set('exploring');
    this.checkWishes();
    this.updateHud();
    void this.autosave();
    window.setTimeout(() => this.say('morning:plan', PRIORITY.ambient, undefined, 0), 1200);
  }

  // --- Food ---------------------------------------------------------------------------

  private tasteFoods(ids: string[]): void {
    const day = this.s.dayNight.day;
    for (const id of ids) {
      const food = foodById(id);
      if (!food) continue;
      if (!this.foodsTried.some((f) => f.id === id && f.day === day)) this.foodsTried.push({ id, day });
      if (!this.memories.has(`tasted:${id}`)) this.remember(`tasted:${id}`, `Tried ${food.name.toLowerCase()}`);
    }
    for (const n of this.needs.values()) {
      n.eat(0.55);
      n.enjoy(0.2);
    }
    this.vibe.add('meal');
    if (this.goal === DAY_ONE_GOAL && !this.goalDone) {
      this.goalDone = true;
      this.audio.ui('cheer');
      toast(this.s.ui, 'Pintxos found. Day one, conquered.');
    }
    this.checkWishes();
  }

  private sceneContext(): SceneContext {
    const s = this.s;
    return {
      scene: s.scene,
      rig: s.rig,
      crew: s.crew,
      seats: s.bars.seats,
      setParasol: (v) => {
        s.bars.parasol.visible = v;
      },
      reducedMotion: () => this.reducedMotion,
      fade: (to, seconds) => new Promise<void>((resolve) => void gsap.to(this.fade, { opacity: to, duration: seconds, onComplete: () => resolve() })),
      line: (speaker, text) => {
        const m = s.crew.byId(speaker);
        const duration = BanterDirector.duration(text) * (s.settings.current.relaxedTiming ? 1.35 : 1);
        if (m) this.bubbles.say(speaker, m.def.name, m.def.colors.top, text, duration, { day: s.dayNight.day, time: formatClock(s.dayNight.hour) });
        return duration;
      },
      sfx: (k) => this.audio.ui(k),
      wait: (seconds) =>
        new Promise<void>((resolve) => {
          const t = window.setTimeout(() => {
            this.advance = null;
            resolve();
          }, seconds * 1000);
          this.advance = () => {
            window.clearTimeout(t);
            this.advance = null;
            resolve();
          };
        }),
      onFrame: (fn) => {
        this.frameHooks.add(fn);
        return () => this.frameHooks.delete(fn);
      },
    };
  }

  private async visitBar(bar: BarDef): Promise<void> {
    const s = this.s;
    if (this.state.name !== 'exploring') return;
    if (bar.activity === 'market') return this.visitMarket(bar);
    if (bar.activity === 'cider') return this.visitCiderHouse(bar);
    this.banter.interrupt();
    this.bubbles.clear();
    this.state.set('scene');
    this.audio.setDucked(true);
    const ctx = this.sceneContext();
    const door = { x: bar.door.x + Math.sin(bar.facing) * 1.4, z: bar.door.z + Math.cos(bar.facing) * 1.4, heading: bar.facing };
    let foods: FoodDef[] = [];
    let wobbles = 0;

    if (bar.activity === 'crawl') {
      this.state.set('minigame');
      const result = await playPintxosCrawl(s.ui, {
        menu: bar.menu.map((id) => foodById(id)!).filter(Boolean),
        favourites: Object.fromEntries(crewData.map((c) => [c.id, c.favouriteFoods])) as Record<CrewId, string[]>,
        relaxed: s.settings.current.relaxedTiming,
        oneButton: s.settings.current.oneButton,
        reducedMotion: this.reducedMotion,
        sfx: (k) => this.audio.ui(k),
      });
      this.state.set('scene');
      foods = result.chosen.map((id) => foodById(id)!).filter(Boolean);
      wobbles = result.wobbles;
    } else if (bar.id === 'bar-ttipi') {
      foods = ['tomato-salad', 'txuleta'].map((id) => foodById(id)!);
    } else {
      foods = bar.menu.map((id) => foodById(id)!).filter(Boolean);
    }

    const meal = await serveMeal(ctx, foods);
    if (bar.id === 'bar-ttipi' && !this.memories.has('missed:tortilla')) {
      // The famous tortilla is gone tonight: a funny miss, and a promise.
      await ctx.wait(ctx.line('paulo', 'The tortilla list is full tonight. We were so close.') * 0.9);
      await ctx.wait(ctx.line('huw', 'Then we come back tomorrow. Early. With purpose.') * 0.9);
      this.remember('missed:tortilla', 'Just missed the famous tortilla at Bar Ttipi', bar.name);
    }
    if (bar.id === 'gazta') {
      const slices = await choose(
        s.ui,
        'How many slices?',
        'The cheesecakes are cooling on the counter. Huw is very quiet.',
        [
          { label: 'One to share', value: 1 },
          { label: 'One each', value: 4 },
          { label: 'One each, and two more for Huw', value: 6 },
        ],
        this.reducedMotion,
      );
      if (slices === 6) {
        await ctx.wait(ctx.line('huw', 'Three cheesecakes. For me. I regret nothing.') * 0.9);
        await ctx.wait(ctx.line('romy', 'We will never let you forget this.') * 0.9);
        this.remember('ordered:three-cheesecakes', 'Huw ordered three cheesecakes', bar.name);
      } else if (slices === 4) {
        await ctx.wait(ctx.line('annette', 'One each. Correct. Civilised.') * 0.9);
      } else {
        await ctx.wait(ctx.line('romy', 'One to share. Brave.') * 0.9);
      }
    }
    if (wobbles > 0 && !this.memories.has('wobbled:tray')) this.remember('wobbled:tray', 'The tray wobbled all the way back from the bar', bar.name);
    // A table photo for the scrapbook.
    s.renderer.setTiltShift(0.35);
    void this.keepPhoto(s.renderer.snapshot(), `Dinner at ${bar.name}`);
    s.renderer.setTiltShift(1);
    this.tasteFoods(foods.map((f) => f.id));
    await ctx.wait(2.5);
    await meal.leave(door);
    this.audio.setDucked(false);
    this.state.set('exploring');
    s.renderer.canvas.focus({ preventScroll: true });
    void this.autosave();
  }

  // --- Travel ----------------------------------------------------------------------------

  private async travel(def: TravelDef): Promise<void> {
    const s = this.s;
    if (this.state.name !== 'exploring') return;
    this.banter.interrupt();
    this.bubbles.clear();
    this.state.set('cinematic');
    this.audio.setDucked(true);
    const ctx = this.sceneContext();
    await playTravel(
      {
        ...ctx,
        landmarks: s.landmarks,
        skipSignal: () => new Promise<void>((resolve) => (this.advance = resolve)),
      },
      def,
    );
    this.advance = null;
    s.crew.teleport(def.to.x, def.to.z, def.to.heading);
    s.rig.cancelCinematic();
    s.rig.snapTo(def.to.x, groundY(def.to.x, def.to.z), def.to.z);
    s.dayNight.setTime(Math.min(23.9, s.dayNight.hour + def.hours));
    await gsap.to(this.fade, { opacity: 0, duration: this.reducedMotion ? 0.05 : 0.4 });
    this.audio.setDucked(false);
    this.state.set('exploring');
    s.renderer.canvas.focus({ preventScroll: true });
    void this.autosave();
  }

  // --- Market and cider house -----------------------------------------------------------

  private async visitMarket(bar: BarDef): Promise<void> {
    const s = this.s;
    const hour = s.dayNight.hour;
    if (hour < 8 || hour > 14) {
      toast(s.ui, 'The stalls are packing up. Mornings are best for the market.');
      return;
    }
    this.banter.interrupt();
    this.bubbles.clear();
    this.state.set('scene');
    const pick = await choose(
      s.ui,
      bar.name,
      'Annette is already talking to a stallholder. What shall we try?',
      bar.menu.map((id) => ({ label: foodById(id)!.name, value: id })),
      this.reducedMotion,
    );
    const food = foodById(pick)!;
    const ctx = this.sceneContext();
    const dish = makeDish(food);
    dish.group.position.set(88.5, PROMENADE_Y + 0.92, 13.6);
    s.scene.add(dish.group);
    await s.rig.glideTo({ position: { x: 88.4, y: PROMENADE_Y + 2.7, z: 11.1 }, target: { x: 88.5, y: PROMENADE_Y + 1, z: 13.6 } }, this.reducedMotion ? 0.2 : 0.9);
    await ctx.wait(ctx.line('annette', food.reactions.annette) * 0.9);
    await ctx.wait(ctx.line('huw', food.reactions.huw) * 0.9);
    if (!this.memories.has('visited:market')) this.remember('visited:market', 'Morning at the Bretxa market', 'Mercado de la Bretxa');
    this.tasteFoods([food.id]);
    dish.dispose();
    await s.rig.returnToFollow();
    this.state.set('exploring');
    s.renderer.canvas.focus({ preventScroll: true });
    void this.autosave();
  }

  private async visitCiderHouse(bar: BarDef): Promise<void> {
    const s = this.s;
    const hour = s.dayNight.hour;
    if (hour < 17 || hour > 23.5) {
      toast(s.ui, 'Cider houses open in the evening. Come back after five.');
      return;
    }
    this.banter.interrupt();
    this.bubbles.clear();
    this.state.set('scene');
    this.audio.setDucked(true);
    await gsap.to(this.fade, { opacity: 1, duration: this.reducedMotion ? 0.05 : 0.5 });
    toast(s.ui, 'A taxi winds up into the hills. Ask the locals: the most remote one is the best.');
    await new Promise((r) => window.setTimeout(r, this.reducedMotion ? 300 : 1400));
    // Lift the curtain so the mini-game (which sits under the fade layer) is visible.
    await gsap.to(this.fade, { opacity: 0.55, duration: this.reducedMotion ? 0.05 : 0.3 });
    this.state.set('minigame');
    const result = await playTxotx(s.ui, {
      relaxed: s.settings.current.relaxedTiming,
      oneButton: s.settings.current.oneButton,
      reducedMotion: this.reducedMotion,
      sfx: (k) => this.audio.ui(k),
    });
    this.state.set('scene');
    const names = Object.fromEntries(crewData.map((c) => [c.id, c.name])) as Record<CrewId, string>;
    const courses = bar.menu.map((id) => foodById(id)!).filter(Boolean);
    await showFeast(s.ui, bar.name, courses, names, this.reducedMotion);
    this.remember('played:txotx', 'Shouted “Txotx!” at a cider house in the hills', bar.name);
    if (result.splashes > 1 && !this.memories.has('splashed:cider')) this.remember('splashed:cider', 'Cider all over the floor (and Huw’s shoes)', bar.name);
    this.tasteFoods(courses.map((f) => f.id));
    s.dayNight.setTime(Math.min(23.9, s.dayNight.hour + 3));
    const back = { x: bar.door.x, z: bar.door.z + 1.6 };
    s.crew.teleport(back.x, back.z, 0);
    s.rig.snapTo(back.x, groundY(back.x, back.z), back.z);
    await gsap.to(this.fade, { opacity: 0, duration: this.reducedMotion ? 0.05 : 0.6 });
    this.audio.setDucked(false);
    this.state.set('exploring');
    s.renderer.canvas.focus({ preventScroll: true });
    void this.autosave();
  }

  // --- Encounters and friendship moments -----------------------------------------------------

  private checkEncounters(): void {
    const s = this.s;
    if (this.encounterBusy) return;
    const lead = s.crew.leader.mover;
    const hour = s.dayNight.hour;
    for (const e of encounters) {
      if (this.encountersDone.has(e.id)) continue;
      if (Math.hypot(lead.x - e.position.x, lead.z - e.position.z) > e.radius) continue;
      if (e.hours && (hour < e.hours[0] || hour > e.hours[1])) continue;
      if (e.weather === 'after-rain' && !s.weather.afterRain(s.dayNight.day, hour)) continue;
      if (e.weather === 'dry' && s.weather.raining) continue;
      void this.playEncounter(e);
      return;
    }
  }

  private resolveSpeaker(speaker: string, subject?: CrewId): CrewId {
    const ids = this.s.crew.members.map((m) => m.def.id);
    if (speaker === 'leader') return this.s.crew.leader.def.id;
    if (speaker === 'subject') return subject ?? this.s.crew.leader.def.id;
    if (speaker === 'any' || speaker === 'other') return ids.find((id) => id !== this.s.crew.leader.def.id) ?? ids[0];
    return speaker as CrewId;
  }

  private async playEncounter(e: EncounterDef): Promise<void> {
    const s = this.s;
    this.encounterBusy = true;
    this.encountersDone.add(e.id);
    this.banter.interrupt();
    const subject = e.subject ? s.crew.byId(e.subject) : undefined;
    if (e.kind === 'dog' && subject) s.npcs.dogTarget = subject.renderPos;
    if (e.kind === 'musician') this.audio.playTune();
    if (e.kind === 'gull') s.npcs.swoop(s.crew.leader.renderPos.clone());
    if ((e.kind === 'carousel' || e.kind === 'surfer') && subject) {
      subject.character.hop(0.5);
      subject.character.cheering = 1.5;
    }
    if (subject && subject !== s.crew.leader) subject.brain.startInvestigating(e.kind === 'dog' ? s.npcs.dog.position : e.position);
    const ctx = this.sceneContext();
    for (const [speaker, text] of e.beats) {
      const seconds = ctx.line(this.resolveSpeaker(speaker, e.subject), text);
      await new Promise((r) => window.setTimeout(r, seconds * 900));
      if (this.state.name !== 'exploring') break;
    }
    s.npcs.dogTarget = null;
    this.remember(e.memory.key, e.memory.summary);
    this.vibe.add('funny');
    this.encounterBusy = false;
    void this.autosave();
  }

  private availableFriendship(): FriendshipDef | null {
    const s = this.s;
    const hour = s.dayNight.hour;
    const ateToday = this.foodsTried.some((f) => f.day === s.dayNight.day);
    for (const f of friendships) {
      if (this.friendshipsDone.has(f.id)) continue;
      const w = f.when;
      if (w.raining && !s.weather.raining) continue;
      if (w.areas && (!this.currentArea || !w.areas.includes(this.currentArea as never))) continue;
      if (w.hours && (hour < w.hours[0] || hour > w.hours[1])) continue;
      if (w.seated !== undefined && w.seated !== s.crew.seated) continue;
      if (w.afterMeal && !ateToday) continue;
      return f;
    }
    return null;
  }

  private async playFriendship(f: FriendshipDef): Promise<void> {
    const s = this.s;
    if (this.state.name !== 'exploring') return;
    this.friendship = null;
    this.friendshipsDone.add(f.id);
    this.banter.interrupt();
    this.bubbles.clear();
    this.state.set('cinematic');
    const [a, b] = f.pair.map((id) => s.crew.byId(id)!);
    // The pair turn to each other; the camera finds them.
    const mid = a.renderPos.clone().add(b.renderPos).multiplyScalar(0.5);
    if (!s.crew.seated) {
      a.mover.heading = Math.atan2(b.mover.x - a.mover.x, b.mover.z - a.mover.z);
      b.mover.heading = Math.atan2(a.mover.x - b.mover.x, a.mover.z - b.mover.z);
    }
    const yaw = s.rig.yaw;
    await s.rig.glideTo(
      {
        position: { x: mid.x + Math.sin(yaw) * 5.2, y: mid.y + 3.1, z: mid.z + Math.cos(yaw) * 5.2 },
        target: { x: mid.x, y: mid.y + 1.7, z: mid.z },
      },
      this.reducedMotion ? 0.2 : 1.1,
    );
    const ctx = this.sceneContext();
    for (const [speaker, text] of f.beats) await ctx.wait(ctx.line(speaker, text) * 0.95);
    s.renderer.setTiltShift(0.35);
    void this.keepPhoto(s.renderer.snapshot(), f.title);
    s.renderer.setTiltShift(1);
    this.remember(f.memory.key, f.memory.summary);
    this.vibe.add('scene');
    await s.rig.returnToFollow();
    this.state.set('exploring');
    s.renderer.canvas.focus({ preventScroll: true });
    void this.autosave();
  }

  // --- Journal ----------------------------------------------------------------------------

  private async journalFromMenu(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    this.audio.setDucked(false);
    this.state.set('exploring');
    await this.openJournal('sights');
  }

  private async openJournal(tab: 'sights' | 'dex'): Promise<void> {
    const s = this.s;
    if (this.state.name !== 'exploring') return;
    this.state.set('scene');
    const discovered = new Map<string, { day: number; photo: string | null }>();
    for (const id of this.discovered) {
      const mem = this.memories.all().find((m) => m.key === `discovered:${id}`);
      const loc = locations.find((l) => l.id === id);
      const photo = this.photos.find((p) => p.title === loc?.name);
      discovered.set(id, { day: mem?.day ?? 1, photo: photo ? (this.photoUrls.get(photo.id) ?? null) : null });
    }
    const tried = new Map<string, number>();
    for (const f of this.foodsTried) if (!tried.has(f.id)) tried.set(f.id, f.day);
    const result = await showJournal(
      s.ui,
      {
        locations,
        discovered,
        captions: this.captions,
        foods: allFoods,
        tried,
        names: Object.fromEntries(crewData.map((c) => [c.id, c.name])) as Record<CrewId, string>,
        favourites: this.favourites,
      },
      tab,
      this.reducedMotion,
    );
    this.captions = result.captions;
    this.favourites = result.favourites;
    this.state.set('exploring');
    s.renderer.canvas.focus({ preventScroll: true });
    void this.autosave();
    if (result.replay) {
      const loc = locations.find((l) => l.id === result.replay);
      if (loc) await this.discover(loc);
    }
  }

  // --- Ending the day -------------------------------------------------------------------

  private async askLate(): Promise<void> {
    if (this.state.name !== 'exploring') return;
    this.state.set('scene');
    const yes = await choose(
      this.s.ui,
      'It’s getting late',
      'Head back to the hotel and fill in today’s scrapbook page?',
      [
        { label: 'Five more minutes', value: false },
        { label: 'Call it a night', value: true },
      ],
      this.reducedMotion,
    );
    this.state.set('exploring');
    if (yes) await this.callItANight();
    else this.say('late', PRIORITY.ambient, undefined, 0);
  }

  private async callItANightFromMenu(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    this.audio.setDucked(false);
    this.state.set('exploring');
    await this.callItANight();
  }

  private async callItANight(): Promise<void> {
    const s = this.s;
    if (this.state.name !== 'exploring') return;
    this.state.set('scene');
    this.banter.interrupt();
    this.bubbles.clear();
    if (s.crew.seated) s.crew.standUp();
    const day = s.dayNight.day;
    const todays = this.memories.onDay(day);
    const photos = this.photos.filter((p) => p.day === day).map((p) => ({ id: p.id, title: p.title, url: this.photoUrls.get(p.id) ?? null }));
    const foods = [...new Set(this.foodsTried.filter((f) => f.day === day).map((f) => foodById(f.id)?.name ?? f.id))];
    const result = await showScrapbookPage(
      s.ui,
      { day, photos, foods, memories: todays, moment: null, caption: '' },
      this.reducedMotion,
    );
    this.pages = this.pages.filter((p) => p.day !== day);
    this.pages.push({
      day,
      moment: result.moment,
      caption: result.caption,
      photoIds: photos.map((p) => p.id),
      foods,
      memories: todays.map((m) => m.summary),
    });
    if (day >= tripTuning.days && !this.flags.has('ended')) {
      const carryOn = await this.runEnding();
      if (!carryOn) return;
      this.flags.add('ended');
      toast(s.ui, 'One More Day: the city is still yours. Your collections come with you.');
    }
    // A new morning.
    await gsap.to(this.fade, { opacity: 1, duration: this.reducedMotion ? 0.05 : 0.5 });
    s.dayNight.setTime(MORNING_HOUR, day + 1);
    for (const n of this.needs.values()) {
      n.rest(1);
      n.values.hunger = 0.6;
      n.values.fun = Math.max(n.values.fun, 0.7);
    }
    this.vibe.newDay();
    if (this.goal === DAY_ONE_GOAL) this.goal = null;
    const p = spawnPoint();
    s.crew.teleport(p.x, p.z, Math.PI);
    s.rig.snapTo(p.x, groundY(p.x, p.z), p.z);
    s.rig.resetView();
    this.flags.add('needs-planning');
    this.state.set('exploring');
    void this.autosave();
    await gsap.to(this.fade, { opacity: 0, duration: this.reducedMotion ? 0.05 : 0.8 });
    await this.morningPlanning();
  }

  // --- The ending ------------------------------------------------------------------------

  private endingSlides(): EndingSlide[] {
    const s = this.s;
    const days = s.dayNight.day;
    const slides: EndingSlide[] = [{ kind: 'title', heading: `${days} days in Donostia`, text: 'Cobs on Tour' }];
    // The player's own polaroids, spread across the trip.
    const photos = this.photos.filter((p) => this.photoUrls.has(p.id));
    const step = Math.max(1, Math.ceil(photos.length / 7));
    for (let i = 0; i < photos.length; i += step) {
      slides.push({ kind: 'photo', heading: photos[i].title, text: `Day ${photos[i].day}`, image: this.photoUrls.get(photos[i].id) ?? null });
    }
    if (photos.length === 0) {
      slides.push({ kind: 'memory', heading: 'The bay at golden hour', text: 'No photos this time. The best bits were in our heads anyway.' });
    }
    // Favourite meals: marked favourites first, then the most-loved plates.
    const counts = new Map<string, number>();
    for (const f of this.foodsTried) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    const meals = [...this.favourites, ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)].filter((id, i, arr) => arr.indexOf(id) === i).slice(0, 3);
    meals.forEach((id, i) => {
      const food = foodById(id);
      if (!food) return;
      const who = (['annette', 'huw', 'romy', 'paulo'] as CrewId[])[i % 4];
      slides.push({ kind: 'meal', heading: food.name, text: `${crewData.find((c) => c.id === who)?.name}: “${food.reactions[who]}”`, image: foodThumbnail(food) });
    });
    if (meals.length === 0) slides.push({ kind: 'meal', heading: 'So many pintxos', text: 'We will be back for the ones we missed.' });
    // Real moments: friendships, encounters and the silly bits that actually happened.
    const notable = /^(friend:|met:|ordered:|rode:|robbed:|splashed:|heard:|found:|watched:|played:|wobbled:|missed:)/;
    const moments = this.memories.all().filter((m) => notable.test(m.key));
    for (const m of moments.slice(0, 5)) slides.push({ kind: 'memory', heading: 'Remember when…', text: m.summary });
    if (moments.length === 0) slides.push({ kind: 'memory', heading: 'Remember when…', text: 'We walked the whole bay and talked about dinner the entire time.' });
    // The crew, one at a time.
    for (const c of crewData) {
      slides.push({ kind: 'crew', heading: c.name, text: c.catchphrases[0], colour: c.colors.top });
    }
    slides.push({ kind: 'final', heading: 'See you next tour.' });
    return slides;
  }

  /** Plays the montage and handles the choices. Resolves true to continue with One More Day. */
  private async runEnding(): Promise<boolean> {
    const s = this.s;
    this.audio.setDucked(true);
    for (;;) {
      this.audio.playEndingTheme();
      const choice = await playEnding(s.ui, this.endingSlides(), this.reducedMotion, () => undefined);
      if (choice === 'rewatch') continue;
      if (choice === 'scrapbook') {
        await showBook(
          s.ui,
          this.pages.map((p) => ({
            day: p.day,
            moment: this.memories.all().find((m) => m.key === p.moment)?.summary ?? null,
            caption: p.caption,
            photos: p.photoIds.map((id) => ({ title: this.photos.find((x) => x.id === id)?.title ?? '', url: this.photoUrls.get(id) ?? null })),
            foods: p.foods,
            memories: p.memories,
          })),
          this.reducedMotion,
        );
        continue;
      }
      if (choice === 'new-trip') {
        const sure = await choose(
          s.ui,
          'Start a new trip?',
          'This replaces the trip saved in this browser, including its scrapbook and photos.',
          [
            { label: 'Keep this trip', value: false },
            { label: 'Start fresh', value: true },
          ],
          this.reducedMotion,
        );
        if (!sure) continue;
        await this.saves.clear();
        this.tripStarted = false;
        this.audio.setDucked(false);
        this.showTitleScreen();
        return false;
      }
      this.audio.setDucked(false);
      return true;
    }
  }

  onVisibility = (visible: boolean): void => {
    this.audio.setHidden(!visible);
    if (!visible) {
      this.s.input.clear();
      // Hidden mid-walk: stop cleanly so returning never lurches.
      for (const m of this.s.crew.members) {
        m.mover.vx = 0;
        m.mover.vz = 0;
      }
      this.s.crew.syncPrev();
    }
  };

  onContextChange = (lost: boolean): void => {
    let box = document.getElementById('context-lost');
    if (lost && !box) {
      box = h(
        'div',
        { class: 'fatal paper', id: 'context-lost', attrs: { role: 'alert' } },
        h('h1', { text: 'The scenery took a nap' }),
        h('p', { text: 'The graphics device was reset. The game will pick up where you left off as soon as it comes back.' }),
        h('p', {}, h('button', { class: 'btn', text: 'Reload now', attrs: { type: 'button' }, on: { click: () => location.reload() } })),
      );
      document.body.append(box);
    } else if (!lost && box) {
      box.remove();
    }
  };
}

async function boot(): Promise<void> {
  await progress(0.05, 'Checking the itinerary');
  if (import.meta.env.DEV) {
    const issues = validateContent();
    if (issues.length) {
      showFatal('Content needs a fix', 'The content tables have problems. See the details below.', formatIssues(issues));
      return;
    }
  }
  if (!webglAvailable()) {
    showFatal(
      'This browser cannot draw the bay',
      'Cobs on Tour needs WebGL. Try a current version of Chrome, Edge, Firefox or Safari, or turn on hardware acceleration.',
    );
    return;
  }
  installPaperTexture();
  const settings = new SettingsStore();

  const stage = document.getElementById('stage')!;
  const ui = document.getElementById('ui')!;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.skyHorizon, 110, 360);
  scene.background = new THREE.Color(PALETTE.skyHorizon);

  await progress(0.15, 'Building the town');
  const buildings = createBuildings();
  scene.add(buildings.group);

  const rig = new CameraRig(buildings.occluders);
  let game: Game | null = null;
  const renderer = new Renderer(stage, scene, rig.camera, (lost) => game?.onContextChange(lost));
  renderer.info.autoReset = false;

  await progress(0.4, 'Pouring the sea');
  const scenery = createScenery();
  scene.add(scenery.group);
  const dayNight = new DayNight(scenery, scene, renderer.renderer, 17.6);
  if (import.meta.env.DEV) {
    // Dev only: ?hour=21.5 starts at a chosen time for checking lighting.
    const hour = Number(new URLSearchParams(location.search).get('hour'));
    if (Number.isFinite(hour) && hour > 0) dayNight.setTime(hour);
  }

  await progress(0.6, 'Laying the promenade');
  const world = buildCollisionWorld();
  const interactables = new Interactables();
  scene.add(interactables.group);

  const barDressing = createBars();
  scene.add(barDressing.group);
  const landmarks = createLandmarks();
  scene.add(landmarks.group);
  const npcs = createNpcs();
  scene.add(npcs.group);
  const weather = new Weather();
  scene.add(weather.group);
  const crowds = new Crowds();
  scene.add(crowds.group);

  await progress(0.72, 'Waking the crew');
  const spawn = spawnPoint();
  const crew = new Crew(scene, world, spawn, Math.PI);

  const input = new Input(renderer.canvas);
  game = new Game({ ui, scene, renderer, rig, input, world, scenery, interactables, crew, dayNight, settings, bars: barDressing, landmarks, npcs, weather, crowds });

  await progress(0.85, 'Warming up the shaders');
  dayNight.apply();
  // Compile every material now so the first walk never stutters.
  await renderer.renderer.compileAsync(scene, rig.camera);

  if (import.meta.env.DEV) {
    const { PerfOverlay } = await import('./engine/perfOverlay.ts');
    game.perf = new PerfOverlay();
  }

  await progress(1, 'Ready');
  const g = game;
  const loop = new GameLoop(g.step, g.render, g.onVisibility);
  g.showTitleScreen();
  loop.start();
  document.getElementById('loading')?.classList.add('done');
}

boot().catch((err: unknown) => {
  console.error(err);
  showFatal(
    'Something went wrong while packing',
    'The trip could not start. Reloading usually fixes it.',
    err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err),
  );
});
