/** Tiny typed event bus. Systems talk through events instead of importing each other. */

export interface GameEvents {
  'area:entered': { id: string; name: string; subtitle: string };
  'location:discovered': { id: string; firstTime: boolean };
  'state:changed': { from: GameStateName; to: GameStateName };
}

export type GameStateName = 'loading' | 'title' | 'exploring' | 'cinematic' | 'menu' | 'card';

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(name: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const h of set) (h as Handler<E[K]>)(payload);
  }
}

export const events = new EventBus<GameEvents>();
