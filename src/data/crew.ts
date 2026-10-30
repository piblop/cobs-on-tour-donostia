import type { CrewMember } from './types.ts';

/**
 * Affectionate, fictional placeholder personalities. First names only.
 * Edit freely: nothing here describes real people's private details.
 */
export const crew: CrewMember[] = [
  {
    id: 'paulo',
    name: 'Paulo',
    colors: { top: '#e9846b', bottom: '#4f6d8f', hair: '#16120f', skin: '#c48a5f', accent: '#f6d36b' },
    hairStyle: 'short',
    accessory: 'cap',
    heightScale: 1.04,
    favouriteFoods: ['tortilla', 'grilled octopus'],
    drinkPreferences: ['txakoli', 'sparkling water'],
    energyTendency: 'steady',
    catchphrases: ['One more pintxo, then we go.', 'Trust me, I have a map.'],
    interests: ['viewpoints', 'old buildings'],
    distractions: ['bakery windows'],
    reactionStyle: 'beaming',
  },
  {
    id: 'annette',
    name: 'Annette',
    colors: { top: '#7cc4a4', bottom: '#f3efe2', hair: '#dcb25e', skin: '#f2c9a8', accent: '#e86f8e' },
    hairStyle: 'bob',
    accessory: 'camera',
    heightScale: 0.97,
    favouriteFoods: ['burnt cheesecake', 'tomato salad', 'anchovies'],
    drinkPreferences: ['txakoli', 'cider', 'cafe con leche'],
    energyTendency: 'early-bird',
    catchphrases: ['Photo first, then eat.', 'As many tomato salads as possible.', 'Best cheesecake on the planet. Non-negotiable.'],
    interests: ['photography', 'markets'],
    distractions: ['flower boxes'],
    reactionStyle: 'giggly',
  },
  {
    id: 'huw',
    name: 'Huw',
    colors: { top: '#6f86c9', bottom: '#8a6b4e', hair: '#2f241e', skin: '#f3cfb4', accent: '#f2f0ea' },
    hairStyle: 'curly',
    accessory: 'backpack',
    heightScale: 1.08,
    favouriteFoods: ['cheesecake', 'more cheesecake'],
    drinkPreferences: ['vermouth', 'lemonade'],
    energyTendency: 'night-owl',
    catchphrases: ['I could eat.', 'Is that a dog? Hello, dog.'],
    interests: ['dogs', 'surfing'],
    distractions: ['dogs', 'dessert counters'],
    reactionStyle: 'dramatic',
  },
  {
    id: 'romy',
    name: 'Romy',
    colors: { top: '#f0b84c', bottom: '#5a7a5c', hair: '#f1dfa6', skin: '#f3cdb0', accent: '#7fd6cf' },
    hairStyle: 'ponytail',
    accessory: 'tote',
    heightScale: 0.95,
    favouriteFoods: ['mushroom pintxos', 'peppers'],
    drinkPreferences: ['kalimotxo', 'iced tea'],
    energyTendency: 'steady',
    catchphrases: ['Mushrooms. Now.', 'Nobody tell the others, but this is the best one.'],
    interests: ['food', 'street music'],
    distractions: ['street musicians'],
    reactionStyle: 'deadpan',
  },
];

export const playerDefaultId: CrewMember['id'] = 'paulo';
