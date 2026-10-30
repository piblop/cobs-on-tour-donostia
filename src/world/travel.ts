import { SUMMITS, peineLayout, travelStops } from './map.ts';

/**
 * Travel links between the city and its hilltops and island. Connections are
 * compressed, fictional game abstractions, not real timetables.
 */
export type TravelMode = 'funicular' | 'boat' | 'climb';

export interface TravelDef {
  id: string;
  label: string;
  mode: TravelMode;
  /** Where the prompt appears. */
  from: { x: number; z: number };
  /** Where the crew arrives: a few steps from the return stop, so its prompt doesn't fire at once. */
  to: { x: number; z: number; heading: number };
  /** In-game hours the journey takes. */
  hours: number;
  /** Up/out along the vehicle's path (1) or down/back (-1). */
  direction: 1 | -1;
}

export function travelLinks(): TravelDef[] {
  const s = travelStops();
  const ig = SUMMITS.igueldo;
  const ur = SUMMITS.urgull;
  const sc = SUMMITS.santaClara;
  const t = peineLayout().tangent;
  return [
    {
      id: 'funicular-up',
      label: 'Ride the funicular up Igueldo',
      mode: 'funicular',
      from: s.funicularBase,
      to: { x: ig.x + ig.r - 5.2, z: ig.z + 1.5, heading: Math.PI / 2 },
      hours: 0.3,
      direction: 1,
    },
    {
      id: 'funicular-down',
      label: 'Ride the funicular back down',
      mode: 'funicular',
      from: s.funicularTop,
      to: { x: s.funicularBase.x + t.x * 2.8, z: s.funicularBase.z + t.z * 2.8, heading: Math.atan2(t.x, t.z) },
      hours: 0.3,
      direction: -1,
    },
    {
      id: 'urgull-up',
      label: 'Climb the path up Monte Urgull',
      mode: 'climb',
      from: s.urgullFoot,
      to: { x: ur.x + ur.r - 4.6, z: ur.z + 3.4, heading: -Math.PI / 2 },
      hours: 0.5,
      direction: 1,
    },
    {
      id: 'urgull-down',
      label: 'Walk back down to the old town',
      mode: 'climb',
      from: s.urgullTop,
      to: { x: s.urgullFoot.x - 2.6, z: s.urgullFoot.z + 0.8, heading: Math.PI },
      hours: 0.35,
      direction: -1,
    },
    {
      id: 'boat-out',
      label: 'Take the little boat to Santa Clara',
      mode: 'boat',
      from: s.boatQuay,
      to: { x: sc.x - 0.5, z: sc.z + 2.4, heading: Math.PI },
      hours: 0.4,
      direction: 1,
    },
    {
      id: 'boat-back',
      label: 'Boat back to the harbour',
      mode: 'boat',
      from: s.islandLanding,
      to: { x: s.boatQuay.x, z: s.boatQuay.z + 2.6, heading: 0 },
      hours: 0.4,
      direction: -1,
    },
  ];
}
