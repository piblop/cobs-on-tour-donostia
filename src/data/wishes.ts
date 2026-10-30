import type { WishDef } from './types.ts';

/**
 * Each morning every friend offers one optional wish. The player can pin up
 * to three. Wishes are suggestions: nothing fails if they are skipped.
 */
export const wishes: WishDef[] = [
  { id: 'annette-tomato', friend: 'annette', text: 'Tomato salad. As many as possible. It is the rule.', done: { food: 'tomato-salad' } },
  { id: 'annette-lanes', friend: 'annette', text: 'Get lost in the old-town lanes for a photo.', done: { memory: 'discovered:parte-vieja-lanes' } },
  { id: 'huw-cheesecake', friend: 'huw', text: 'Find the best cheesecake on the planet.', done: { food: 'burnt-cheesecake' } },
  { id: 'huw-clams', friend: 'huw', text: 'The clam mission. Bread for the sauce.', done: { food: 'clams' } },
  { id: 'romy-bench', friend: 'romy', text: 'Sit by the sea and do absolutely nothing.', done: { memory: 'sat:bench' } },
  { id: 'romy-mushrooms', friend: 'romy', text: 'Mushroom pintxo. Immediately.', done: { food: 'mushroom-pintxo' } },
  { id: 'paulo-sunset', friend: 'paulo', text: 'Watch the sun go down from the railing.', done: { memory: 'watched:sunset' } },
  { id: 'paulo-railing', friend: 'paulo', text: 'Lean on the famous white railing.', done: { memory: 'discovered:la-concha-railing' } },
];

export const MAX_PINNED_WISHES = 3;
