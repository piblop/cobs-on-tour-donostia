import './styles/main.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { validateContent, formatIssues } from './data/validate.ts';
import { locations } from './data/locations.ts';
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
import type { LocationDef } from './data/types.ts';

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
}

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
  /** Warm lamplight that keeps the friends' faces readable at night. */
  private crewLight = new THREE.PointLight('#ffd2a0', 0, 11, 1.3);
  perf: PerfOverlay | null = null;

  constructor(s: Systems) {
    this.s = s;
    this.hud = new Hud(s.ui);
    this.hud.setVisible(false);
    this.hud.setCount(0, locations.length);
    this.bubbles = new Bubbles(s.ui);
    this.fade = h('div', { class: 'fade', attrs: { 'aria-hidden': 'true' } });
    document.body.append(this.fade);
    for (const m of s.crew.members) this.needs.set(m.def.id, new Needs(m.def));

    this.banter = new BanterDirector(banter);
    this.banter.onSay = (e) => {
      const m = s.crew.byId(e.speaker);
      if (!m) return;
      this.bubbles.say(e.speaker, m.def.name, m.def.colors.top, e.text, e.duration, {
        day: s.dayNight.day,
        time: formatClock(s.dayNight.hour),
      });
    };
    this.banter.onEnd = (id) => {
      const line = banter.find((l) => l.id === id);
      if (line && line.beats.length > 1) this.vibe.add('funny');
    };

    s.crew.onRecover = (id) => this.say('recover', PRIORITY.ambient, id as CrewId, 60);
    s.crew.onInvestigate = (id) => this.say('investigate', PRIORITY.ambient, id as CrewId, 25);
    s.crew.pointsOfInterest = s.interactables.pointsOfInterest();
    s.dayNight.onPhase = (phase) => this.say(`time:${phase}`, PRIORITY.ambient, undefined, 0);
    s.crew.leader.character.onStep = () => this.footstep();

    s.scene.add(this.crewLight);
    s.settings.subscribe((v) => this.applySettings(v));
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
    const allowFollowers = this.state.gameplayActive;
    crew.step(dt, intent, allowFollowers, this.faceTarget);
    if (!this.state.gameplayActive) return;

    const lead = crew.leader.mover;
    const speed = Math.hypot(lead.vx, lead.vz);
    this.movedSinceStart += speed * dt;
    this.walked += speed * dt;

    // The clock only runs while exploring.
    const gameHours = (dt * clockRate(s.dayNight.hour)) / 60;
    s.dayNight.advance(dt);
    for (const n of this.needs.values()) n.tick(gameHours, s.dayNight.hour, crew.seated ? 0 : speed * dt);
    this.vibe.drift(gameHours);
    if (crew.seated) for (const n of this.needs.values()) n.rest(dt * 0.02);

    const area = areaAt(lead.x, lead.z);
    if (area && area.id !== this.currentArea) {
      this.currentArea = area.id;
      this.hud.showArea(area.name, area.subtitle);
      events.emit('area:entered', { id: area.id, name: area.name, subtitle: area.subtitle });
      this.say(`area:${area.id}`, PRIORITY.ambient, undefined, 40);
    }
    this.checkSunset(dt, speed);
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
    s.interactables.update(this.decorTime, this.reducedMotion);
    this.updatePrompt();

    if (this.state.gameplayActive) {
      this.banter.update(frameDt, this.idleContexts(), this.banterInfo());
      this.needCheck -= frameDt;
      if (this.needCheck <= 0) {
        this.needCheck = 8;
        this.checkNeeds();
      }
      if (this.vibe.checkHigh()) this.celebrate();
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
    const key = s.input.device === 'gamepad' ? 'A' : 'E';
    const lead = s.crew.leader;
    if (s.crew.seated) {
      s.interactables.setActive(null);
      this.anchor.copy(lead.renderPos).setY(lead.renderPos.y + 3.6).project(s.rig.camera);
      this.hud.setPrompt('Stand up', { x: (this.anchor.x * 0.5 + 0.5) * window.innerWidth, y: (-this.anchor.y * 0.5 + 0.5) * window.innerHeight }, key);
      return;
    }
    const spot = s.interactables.nearest(lead.mover.x, lead.mover.z);
    s.interactables.setActive(spot?.id ?? null);
    if (!spot) {
      this.hud.setPrompt(null, null, '');
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
        else if (action === 'interact' || action === 'confirm') this.interact();
        break;
      case 'cinematic':
        if (action === 'interact' || action === 'confirm' || action === 'pause' || action === 'back') s.rig.skip();
        break;
      case 'card':
        if (action === 'interact' || action === 'pause' || action === 'back') this.cardDone?.();
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
      this.standUp();
      return;
    }
    const spot = s.interactables.nearest(s.crew.leader.mover.x, s.crew.leader.mover.z);
    if (!spot) return;
    if (spot.kind === 'discovery') void this.discover(spot.loc);
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
    this.title = showTitle(this.s.ui, () => void this.startTrip(), this.reducedMotion, this.settingsFor);
  }

  private async startTrip(): Promise<void> {
    if (this.state.name !== 'title' || !this.title) return;
    const s = this.s;
    // The click on "Start Trip" is the user gesture that unlocks audio.
    this.audio.start();
    this.audio.applySettings(s.settings.current);
    this.audio.ui('open');
    const title = this.title;
    this.title = null;
    s.rig.resetView();
    this.state.set('cinematic');
    const glide = s.rig.glideFromCurrent(this.reducedMotion ? 0.3 : 1.8);
    await title.close();
    await glide;
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
    window.setTimeout(() => this.say(`time:${s.dayNight.phaseName}`, PRIORITY.ambient, undefined, 0), 2500);
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
    const s = this.s;
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    s.rig.cancelCinematic();
    this.banter.interrupt();
    this.bubbles.clear();
    await gsap.to(this.fade, { opacity: 1, duration: this.reducedMotion ? 0.05 : 0.3 });
    const p = spawnPoint();
    s.crew.teleport(p.x, p.z, Math.PI);
    this.faceTarget = null;
    s.rig.snapTo(p.x, groundY(p.x, p.z), p.z);
    s.rig.resetView();
    this.audio.setDucked(false);
    this.state.set('exploring');
    await gsap.to(this.fade, { opacity: 0, duration: this.reducedMotion ? 0.05 : 0.4 });
    s.renderer.canvas.focus({ preventScroll: true });
  }

  private async backToTitle(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    this.audio.setDucked(false);
    this.showTitleScreen();
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

  await progress(0.72, 'Waking the crew');
  const spawn = spawnPoint();
  const crew = new Crew(scene, world, spawn, Math.PI);

  const input = new Input(renderer.canvas);
  game = new Game({ ui, scene, renderer, rig, input, world, scenery, interactables, crew, dayNight, settings });

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
