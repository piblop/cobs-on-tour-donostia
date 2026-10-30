import type { BarDef } from './types.ts';

/**
 * Bars around the old-town square. Names are fictional: these are game
 * experiences inspired by real places, with no real opening times or prices.
 * Positions sit on the faces of the blocks around the plaza (see src/world/map.ts).
 */
export const bars: BarDef[] = [
  {
    id: 'gozo-gozo',
    name: 'Gozo Gozo',
    inspiredBy: 'Gandarias and La Cuchara de San Telmo',
    blurb: 'A long counter piled with pintxos and a bartender who sees everything, eventually.',
    door: { x: 84.3, z: 8.5 },
    facing: -Math.PI / 2,
    awning: '#2f7f86',
    activity: 'crawl',
    menu: ['gilda', 'mushroom-pintxo', 'clams', 'veal-cheek', 'anchovies', 'green-peppers', 'txakoli', 'mosto'],
    actionLabel: 'Pintxos crawl at Gozo Gozo',
  },
  {
    id: 'bar-ttipi',
    name: 'Bar Ttipi',
    inspiredBy: 'Bar Néstor',
    blurb: 'Tiny, packed, famous for a tortilla with a waiting list and a tomato salad worth crossing the city for.',
    door: { x: 78.5, z: 14.3 },
    facing: Math.PI,
    awning: '#c4513f',
    activity: 'meal',
    menu: ['tomato-salad', 'txuleta', 'tortilla'],
    actionLabel: 'Squeeze into Bar Ttipi',
  },
  {
    id: 'gazta',
    name: 'Gazta',
    inspiredBy: 'La Viña',
    blurb: 'Cheesecakes cooling on the counter, tops burnt dark and middles barely set.',
    door: { x: 72.7, z: 8.5 },
    facing: Math.PI / 2,
    awning: '#e9a23b',
    activity: 'meal',
    menu: ['burnt-cheesecake'],
    actionLabel: 'Cheesecake at Gazta',
  },
  {
    id: 'bretxa-market',
    name: 'La Bretxa stalls',
    inspiredBy: 'the Bretxa market',
    blurb: 'Morning stalls: cheese, peppers, and fishmongers who know everyone.',
    door: { x: 90.9, z: 12.8 },
    facing: Math.PI,
    awning: '#2f7f86',
    activity: 'market',
    menu: ['piparras', 'idiazabal-quince'],
    actionLabel: 'Taste something at the stalls',
  },
  {
    id: 'goiko',
    name: 'Goiko Sagardotegia',
    inspiredBy: 'the hillside cider houses around Astigarraga',
    blurb: 'A remote cider house in the hills: long tables, huge barrels, and a fixed feast that simply arrives.',
    door: { x: 34.5, z: 6.5 },
    facing: Math.PI,
    awning: '#8a5a32',
    activity: 'cider',
    menu: ['chorizo-cider', 'cod-omelette', 'fried-cod-peppers', 'txuleta', 'idiazabal-quince', 'sagardoa', 'apple-juice'],
    actionLabel: 'Taxi up to a hillside cider house',
  },
];

/** The terrace table in the square where the crew eats together. */
export const TERRACE_TABLE = { x: 78.5, z: 8.5 } as const;
