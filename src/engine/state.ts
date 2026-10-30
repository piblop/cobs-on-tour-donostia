import { events, type GameStateName } from './events.ts';

/**
 * Explicit game states. Gameplay input only reaches the crew while exploring,
 * so menus and cinematics never trigger movement or interactions.
 */
const allowed: Record<GameStateName, GameStateName[]> = {
  loading: ['title'],
  title: ['exploring', 'cinematic', 'scene'],
  exploring: ['menu', 'cinematic', 'card', 'scene', 'minigame'],
  cinematic: ['card', 'exploring', 'menu', 'scene'],
  card: ['exploring', 'cinematic', 'scene'],
  menu: ['exploring', 'title', 'cinematic', 'card', 'scene'],
  scene: ['exploring', 'minigame', 'cinematic', 'card', 'title', 'menu'],
  minigame: ['scene', 'exploring'],
};

export class GameState {
  private current: GameStateName = 'loading';

  get name(): GameStateName {
    return this.current;
  }

  get gameplayActive(): boolean {
    return this.current === 'exploring';
  }

  /** The world clock and simulation only advance in these states. */
  get simulationRunning(): boolean {
    return this.current === 'exploring' || this.current === 'cinematic' || this.current === 'card' || this.current === 'scene';
  }

  set(next: GameStateName): void {
    if (next === this.current) return;
    if (!allowed[this.current].includes(next)) {
      if (import.meta.env?.DEV) console.warn(`Ignored state change ${this.current} -> ${next}`);
      return;
    }
    const from = this.current;
    this.current = next;
    document.body.dataset.state = next;
    events.emit('state:changed', { from, to: next });
  }
}
