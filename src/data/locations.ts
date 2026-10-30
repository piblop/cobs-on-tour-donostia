import type { Area, LocationDef } from './types.ts';

/**
 * Areas trigger the handwritten banner when the crew walks in.
 * Bounds are rough rectangles in world units (see src/world/map.ts).
 */
export const areas: Area[] = [
  {
    id: 'plaza',
    name: 'Plaza de la Constitución',
    subtitle: 'balconies all round, bars on every side',
    bounds: { minX: 72, maxX: 85, minZ: 2, maxZ: 15 },
    priority: 0,
  },
  {
    id: 'parte-vieja',
    name: 'Parte Vieja',
    subtitle: 'the old town, all lanes and chatter',
    bounds: { minX: 53.5, maxX: 96, minZ: -10, maxZ: 26 },
    priority: 1,
  },
  {
    id: 'alderdi-eder',
    name: 'Alderdi Eder',
    subtitle: 'gardens, a carousel, and the town hall',
    bounds: { minX: 30, maxX: 53.5, minZ: -14, maxZ: 26 },
    priority: 2,
  },
  {
    id: 'la-concha',
    name: 'La Concha',
    subtitle: 'the shell-shaped bay',
    bounds: { minX: -66, maxX: 34, minZ: -45, maxZ: 30 },
    priority: 3,
  },
];

/**
 * Discoverable locations. Facts stay needsReview: true until a human checks them;
 * run `npm run factcheck` to regenerate docs/FACT_CHECK.md.
 */
export const locations: LocationDef[] = [
  {
    id: 'la-concha-railing',
    name: 'La Concha',
    area: 'la-concha',
    position: { x: -11.3, z: 3.1 },
    interactRadius: 2.6,
    actionLabel: 'Lean on the railing',
    polaroidCaption: 'The whole bay, glowing. Nobody said anything for a minute.',
    shot: {
      position: { x: -10, y: 4.6, z: 10.1 },
      target: { x: -16.5, y: 1.2, z: -44 },
    },
    fact: {
      text: "La Concha's white promenade railing is one of the city's best-known symbols, and its curling pattern turns up on souvenirs all over town.",
      source: 'unsourced',
      needsReview: true,
    },
  },
  {
    id: 'parte-vieja-lanes',
    name: 'Parte Vieja',
    area: 'parte-vieja',
    position: { x: 53.4, z: 3.5 },
    interactRadius: 2.4,
    actionLabel: 'Peek down the lane',
    polaroidCaption: 'Narrow lanes, warm windows, and the smell of something grilling.',
    shot: {
      position: { x: 49.5, y: 3.6, z: 3.5 },
      target: { x: 92, y: 4.2, z: 3.5 },
    },
    fact: {
      text: 'The Parte Vieja is the oldest part of Donostia, tucked between the bay and Monte Urgull, and is famous for its pintxos bars.',
      source: 'unsourced',
      needsReview: true,
    },
  },
];
