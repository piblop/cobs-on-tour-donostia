import './styles/main.css';
import * as THREE from 'three';
import gsap from 'gsap';
import { validateContent, formatIssues } from './data/validate.ts';
import { crew, playerDefaultId } from './data/crew.ts';
import { locations } from './data/locations.ts';
import type { LocationDef } from './data/types.ts';
import { movement } from './data/tuning.ts';
import { GameLoop } from './engine/loop.ts';
import { GameState } from './engine/state.ts';
import { Input, type Action } from './engine/input.ts';
import { CameraRig } from './engine/camera.ts';
import { Renderer } from './engine/renderer.ts';
import { events } from './engine/events.ts';
import { createScenery, PALETTE, type Scenery } from './world/scenery.ts';
import { createBuildings } from './world/buildings.ts';
import { buildCollisionWorld, type CollisionWorld } from './world/collisions.ts';
import { groundY, spawnPoint } from './world/map.ts';
import { Interactables, areaAt } from './world/locations.ts';
import { Character } from './crew/character.ts';
import { createMover, stepMovement, type MoverState } from './crew/controller.ts';
import { installPaperTexture } from './ui/paper.ts';
import { showTitle, type TitleScreen } from './ui/title.ts';
import { Hud } from './ui/hud.ts';
import { showPolaroid, type PolaroidCard } from './ui/discovery.ts';
import { showPause, type PauseMenu } from './ui/pause.ts';
import { showFatal } from './ui/fatal.ts';
import { h } from './ui/dom.ts';
import type { PerfOverlay } from './engine/perfOverlay.ts';

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

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

class Game {
  readonly state = new GameState();
  private mover: MoverState;
  private prev = { x: 0, z: 0, heading: 0 };
  private renderPos = new THREE.Vector3();
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
  private hud: Hud;
  private fade: HTMLElement;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  perf: PerfOverlay | null = null;

  constructor(
    private ui: HTMLElement,
    private scene: THREE.Scene,
    private renderer: Renderer,
    private rig: CameraRig,
    private input: Input,
    private world: CollisionWorld,
    private scenery: Scenery,
    private interactables: Interactables,
    private friend: Character,
  ) {
    const p = spawnPoint();
    this.mover = createMover(p.x, p.z, Math.PI);
    this.syncPrev();
    this.rig.reducedMotion = this.reducedMotion;
    this.hud = new Hud(ui);
    this.hud.reducedMotion = this.reducedMotion;
    this.hud.setVisible(false);
    this.hud.setCount(0, locations.length);
    this.fade = h('div', { class: 'fade', attrs: { 'aria-hidden': 'true' } });
    document.body.append(this.fade);
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
      this.rig.reducedMotion = e.matches;
      this.hud.reducedMotion = e.matches;
    });
    this.placeFriend(1);
    this.rig.snapTo(this.mover.x, groundY(this.mover.x, this.mover.z), this.mover.z);
  }

  private syncPrev(): void {
    this.prev.x = this.mover.x;
    this.prev.z = this.mover.z;
    this.prev.heading = this.mover.heading;
  }

  // --- Simulation (fixed 60 Hz) ---------------------------------------------

  step = (dt: number): void => {
    if (!this.state.simulationRunning) return;
    this.syncPrev();
    let intent = { x: 0, z: 0, brisk: false };
    if (this.state.gameplayActive) {
      const raw = this.input.move();
      const w = this.rig.screenToWorld(raw.x, raw.z);
      intent = { x: w.x, z: w.z, brisk: raw.brisk };
    }
    stepMovement(this.mover, intent, dt, this.world);
    if (this.faceTarget !== null && !this.state.gameplayActive) {
      const diff = wrapAngle(this.faceTarget - this.mover.heading);
      this.mover.heading = wrapAngle(this.mover.heading + diff * (1 - Math.exp(-7 * dt)));
    }
    if (this.state.gameplayActive) {
      this.movedSinceStart += Math.hypot(this.mover.vx, this.mover.vz) * dt;
      const area = areaAt(this.mover.x, this.mover.z);
      if (area && area.id !== this.currentArea) {
        this.currentArea = area.id;
        this.hud.showArea(area.name, area.subtitle);
        events.emit('area:entered', { id: area.id, name: area.name, subtitle: area.subtitle });
      }
    }
  };

  // --- Rendering (every display frame) ---------------------------------------

  render = (alpha: number, frameDt: number): void => {
    this.input.pollGamepad();
    for (const action of this.input.consume()) this.handle(action);

    if (this.state.gameplayActive) {
      const rot = this.input.cameraRotate();
      this.rig.rotate(rot.rate, rot.drag, frameDt);
      const zoom = this.input.zoom();
      if (zoom) this.rig.addZoom(zoom);
    } else {
      this.input.cameraRotate();
      this.input.zoom();
    }

    if (this.state.name !== 'menu') this.decorTime += frameDt;
    this.placeFriend(alpha);
    const speed = this.state.simulationRunning ? Math.hypot(this.mover.vx, this.mover.vz) : 0;
    this.friend.animate(this.state.name === 'menu' ? 0 : frameDt, speed, movement.walkSpeed, this.reducedMotion);
    this.rig.update(this.renderPos, frameDt);
    // Behind the title card: a slow postcard view out across the bay and sky.
    const onTitle = this.state.name === 'title';
    if (onTitle) this.rig.titleView(this.decorTime, this.reducedMotion);
    this.interactables.group.visible = !onTitle;
    this.followSun();
    this.scenery.update(this.decorTime);
    this.interactables.update(this.decorTime, this.reducedMotion);
    this.updatePrompt();

    if (!this.hintHidden && this.movedSinceStart > 6) {
      this.hintHidden = true;
      this.hud.hideHint();
    }

    const info = this.renderer.info;
    info.reset();
    this.renderer.render();
    this.perf?.update(frameDt, info, this.scene);
  };

  private placeFriend(alpha: number): void {
    const x = this.prev.x + (this.mover.x - this.prev.x) * alpha;
    const z = this.prev.z + (this.mover.z - this.prev.z) * alpha;
    const heading = this.prev.heading + wrapAngle(this.mover.heading - this.prev.heading) * alpha;
    this.renderPos.set(x, groundY(x, z), z);
    this.friend.root.position.copy(this.renderPos);
    this.friend.root.rotation.y = heading;
  }

  private followSun(): void {
    const sun = this.scenery.sun;
    // Snap to a coarse grid so shadow texels don't shimmer while walking.
    const fx = Math.round(this.renderPos.x * 2) / 2;
    const fz = Math.round(this.renderPos.z * 2) / 2;
    sun.target.position.set(fx, 0, fz);
    // Low golden sun from the north-west, over the bay, so the facades glow.
    sun.position.set(fx - 40, 48, fz - 58);
    sun.target.updateMatrixWorld();
  }

  private updatePrompt(): void {
    if (!this.state.gameplayActive) {
      this.interactables.setActive(null);
      this.hud.setPrompt(null, null, '');
      return;
    }
    const loc = this.interactables.nearest(this.mover.x, this.mover.z);
    this.interactables.setActive(loc?.id ?? null);
    if (!loc) {
      this.hud.setPrompt(null, null, '');
      return;
    }
    this.interactables.promptAnchor(loc.id, this.anchor).project(this.rig.camera);
    if (this.anchor.z > 1) {
      this.hud.setPrompt(null, null, '');
      return;
    }
    const x = (this.anchor.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.anchor.y * 0.5 + 0.5) * window.innerHeight;
    const label = this.discovered.has(loc.id) ? `${loc.actionLabel} again` : loc.actionLabel;
    this.hud.setPrompt(label, { x, y }, this.input.device === 'gamepad' ? 'A' : 'E');
  }

  // --- Actions ----------------------------------------------------------------

  private clickFocused(): void {
    const el = document.activeElement;
    if (el instanceof HTMLButtonElement) el.click();
  }

  private handle(action: Action): void {
    if (action === 'devOverlay') {
      this.perf?.toggle();
      return;
    }
    switch (this.state.name) {
      case 'title':
        if (action === 'up') this.title?.nav(-1);
        else if (action === 'down') this.title?.nav(1);
        else if (action === 'interact' && this.input.device === 'gamepad') this.clickFocused();
        break;
      case 'exploring':
        if (action === 'pause') this.openPause();
        else if (action === 'resetCamera') this.rig.resetView();
        else if (action === 'interact' || action === 'confirm') {
          const loc = this.interactables.nearest(this.mover.x, this.mover.z);
          if (loc) void this.discover(loc);
        }
        break;
      case 'cinematic':
        if (action === 'interact' || action === 'confirm' || action === 'pause' || action === 'back') this.rig.skip();
        break;
      case 'card':
        if (action === 'interact' || action === 'pause' || action === 'back') this.cardDone?.();
        break;
      case 'menu':
        if (action === 'pause' || action === 'back') {
          if (!this.pause?.back()) void this.closePause();
        } else if (action === 'up') this.pause?.nav(-1);
        else if (action === 'down') this.pause?.nav(1);
        else if (action === 'interact' && this.input.device === 'gamepad') this.clickFocused();
        break;
      default:
        break;
    }
  }

  // --- Flow -------------------------------------------------------------------

  showTitleScreen(): void {
    this.hud.setVisible(false);
    this.state.set('title');
    this.title = showTitle(this.ui, () => void this.startTrip(), this.reducedMotion);
  }

  private async startTrip(): Promise<void> {
    if (this.state.name !== 'title' || !this.title) return;
    const title = this.title;
    this.title = null;
    this.rig.resetView();
    // Sweep from the postcard view down to the crew while the card fades.
    this.state.set('cinematic');
    const glide = this.rig.glideFromCurrent(this.reducedMotion ? 0.3 : 1.8);
    await title.close();
    await glide;
    this.state.set('exploring');
    this.renderer.canvas.focus({ preventScroll: true });
    this.hud.setVisible(true);
    this.hud.showHint(this.input.device);
    const area = areaAt(this.mover.x, this.mover.z);
    if (area) {
      this.currentArea = area.id;
      this.hud.showArea(area.name, area.subtitle);
    }
  }

  private async discover(loc: LocationDef): Promise<void> {
    const firstTime = !this.discovered.has(loc.id);
    this.state.set('cinematic');
    this.faceTarget = Math.atan2(loc.shot.target.x - this.mover.x, loc.shot.target.z - this.mover.z);
    this.friend.hop(firstTime ? 0.6 : 0.35);
    await this.rig.glideTo(loc.shot, firstTime ? undefined : 0.6);
    if (this.state.name !== 'cinematic') return; // recovered or paused away
    this.renderer.setTiltShift(0.35);
    const photo = this.renderer.snapshot();
    this.renderer.setTiltShift(1);
    this.state.set('card');
    await new Promise<void>((resolve) => {
      let done = false;
      this.cardDone = () => {
        if (done) return;
        done = true;
        resolve();
      };
      this.card = showPolaroid(this.ui, loc, photo, firstTime, () => this.cardDone?.(), this.reducedMotion);
    });
    this.cardDone = null;
    const card = this.card;
    this.card = null;
    await card?.close();
    if (firstTime) {
      this.discovered.add(loc.id);
      this.interactables.markDiscovered(loc.id);
      this.hud.setCount(this.discovered.size, locations.length);
      this.hud.announce(`${loc.name} added to the journal.`);
    }
    events.emit('location:discovered', { id: loc.id, firstTime });
    this.state.set('cinematic');
    await this.rig.returnToFollow();
    this.faceTarget = null;
    this.state.set('exploring');
    this.renderer.canvas.focus({ preventScroll: true });
  }

  private openPause(): void {
    this.state.set('menu');
    this.input.clear();
    this.pause = showPause(
      this.ui,
      {
        resume: () => void this.closePause(),
        returnToPromenade: () => void this.returnToPromenade(),
        toTitle: () => void this.backToTitle(),
      },
      this.reducedMotion,
    );
  }

  private async closePause(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    if (this.state.name === 'menu') this.state.set('exploring');
    this.renderer.canvas.focus({ preventScroll: true });
  }

  /** Safe recovery: put the crew back on the promenade without touching progress. */
  private async returnToPromenade(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    this.rig.cancelCinematic();
    await gsap.to(this.fade, { opacity: 1, duration: this.reducedMotion ? 0.05 : 0.3 });
    const p = spawnPoint();
    Object.assign(this.mover, { x: p.x, z: p.z, vx: 0, vz: 0, heading: Math.PI });
    this.syncPrev();
    this.faceTarget = null;
    this.rig.snapTo(p.x, groundY(p.x, p.z), p.z);
    this.rig.resetView();
    this.state.set('exploring');
    await gsap.to(this.fade, { opacity: 0, duration: this.reducedMotion ? 0.05 : 0.4 });
    this.renderer.canvas.focus({ preventScroll: true });
  }

  private async backToTitle(): Promise<void> {
    const menu = this.pause;
    this.pause = null;
    await menu?.close();
    this.showTitleScreen();
  }

  onVisibility = (visible: boolean): void => {
    if (!visible) {
      this.input.clear();
      // Hidden mid-walk: stop cleanly so returning never lurches.
      this.mover.vx = 0;
      this.mover.vz = 0;
      this.syncPrev();
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

  await progress(0.6, 'Laying the promenade');
  const world = buildCollisionWorld();
  const interactables = new Interactables();
  scene.add(interactables.group);

  await progress(0.72, 'Waking the crew');
  const member = crew.find((c) => c.id === playerDefaultId)!;
  const friend = new Character(member);
  scene.add(friend.root);

  const input = new Input(renderer.canvas);
  game = new Game(ui, scene, renderer, rig, input, world, scenery, interactables, friend);

  await progress(0.85, 'Warming up the shaders');
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
