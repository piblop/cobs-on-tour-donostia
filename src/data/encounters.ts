import type { AreaId, BanterSpeaker, CrewId, Vec2 } from './types.ts';

/**
 * Small encounters: little moments between landmarks, signalled by sound and
 * a glance rather than map icons. Each happens once per trip.
 */
export interface EncounterDef {
  id: string;
  kind: 'dog' | 'musician' | 'courtyard' | 'gull' | 'debate' | 'view' | 'reflection' | 'carousel' | 'vendor' | 'surfer';
  position: Vec2;
  radius: number;
  /** In-game hours when it can happen. */
  hours?: [number, number];
  /** Only right after rain (or only when dry). */
  weather?: 'after-rain' | 'dry';
  /** The friend at the centre of it, if any. */
  subject?: CrewId;
  beats: Array<[BanterSpeaker, string]>;
  memory: { key: string; summary: string };
}

export const encounters: EncounterDef[] = [
  {
    id: 'dog',
    kind: 'dog',
    position: { x: 40, z: -4 },
    radius: 7,
    hours: [8, 21],
    subject: 'huw',
    beats: [
      ['huw', 'DOG. There is a dog. Hello, dog. Hello!'],
      ['romy', 'We have lost Huw.'],
      ['huw', 'He has a little scarf. I would die for him.'],
    ],
    memory: { key: 'met:dog', summary: 'Huw made a best friend: a scruffy dog in the gardens' },
  },
  {
    id: 'musician',
    kind: 'musician',
    position: { x: 63.5, z: 13.5 },
    radius: 6,
    hours: [11, 23],
    subject: 'romy',
    beats: [
      ['romy', 'Wait. Listen.'],
      ['romy', 'I could stand here all night.'],
      ['annette', 'Coin in the case. Everyone.'],
    ],
    memory: { key: 'heard:musician', summary: 'Romy stopped everyone for a street guitarist in the old town' },
  },
  {
    id: 'courtyard',
    kind: 'courtyard',
    position: { x: 93.5, z: 23.5 },
    radius: 3.5,
    beats: [
      ['annette', 'Oh, a tiny courtyard. With flowers. Nobody else is here.'],
      ['paulo', 'Our secret. Tell no one.'],
    ],
    memory: { key: 'found:courtyard', summary: 'Found a tucked-away courtyard full of flowers' },
  },
  {
    id: 'gull',
    kind: 'gull',
    position: { x: 8, z: -4 },
    radius: 6,
    hours: [9, 20],
    subject: 'paulo',
    beats: [
      ['paulo', 'HEY. That seagull took my crisp!'],
      ['huw', 'Respect the gull.'],
      ['annette', 'I got it on camera. Sorry. Not sorry.'],
    ],
    memory: { key: 'robbed:gull', summary: 'A seagull mugged Paulo on the beach' },
  },
  {
    id: 'debate',
    kind: 'debate',
    position: { x: 51, z: 3.5 },
    radius: 4,
    beats: [
      ['paulo', 'Left is the old town.'],
      ['romy', 'Right is also the old town.'],
      ['huw', 'Straight is the old town?'],
      ['annette', 'It is all the old town. Pick one!'],
    ],
    memory: { key: 'debated:direction', summary: 'A very long debate about which way to walk' },
  },
  {
    id: 'view',
    kind: 'view',
    position: { x: 86.5, z: -31 },
    radius: 4,
    beats: [
      ['annette', 'This might be the best view in the whole city.'],
      ['romy', 'Annette says that about every view.'],
      ['annette', 'And I am right every time.'],
    ],
    memory: { key: 'found:view', summary: 'Found the bench with the best view above the harbour' },
  },
  {
    id: 'reflection',
    kind: 'reflection',
    position: { x: 78.5, z: 4.8 },
    radius: 5,
    weather: 'after-rain',
    beats: [
      ['annette', 'Look down. The whole square is in that puddle.'],
      ['paulo', 'Upside-down balconies. Beautiful.'],
    ],
    memory: { key: 'saw:reflection', summary: 'The square reflected in a puddle after the rain' },
  },
  {
    id: 'carousel',
    kind: 'carousel',
    position: { x: 43, z: 5.2 },
    radius: 4,
    hours: [10, 22],
    subject: 'huw',
    beats: [
      ['huw', 'I am an adult and I am going on the carousel.'],
      ['romy', 'He is waving at us from a horse.'],
      ['huw', 'I AM A KNIGHT.'],
    ],
    memory: { key: 'rode:carousel', summary: 'Huw rode the carousel, waving from a painted horse' },
  },
  {
    id: 'vendor',
    kind: 'vendor',
    position: { x: 88.5, z: 12.4 },
    radius: 4.5,
    hours: [8, 13.5],
    subject: 'annette',
    beats: [
      ['annette', 'The fishmonger just called me “guapa”. I am buying everything.'],
      ['paulo', 'We are staying in a hotel. With no kitchen.'],
      ['annette', 'Details.'],
    ],
    memory: { key: 'charmed:fishmonger', summary: 'Annette was charmed by a fishmonger at the market' },
  },
  {
    id: 'surfer',
    kind: 'surfer',
    position: { x: 136, z: -10.6 },
    radius: 6,
    hours: [8, 20],
    subject: 'huw',
    beats: [
      ['huw', 'That surfer just waved at me. We are friends now.'],
      ['annette', 'He was waving at the wave.'],
    ],
    memory: { key: 'waved:surfer', summary: 'A surfer waved back at Huw (probably at the wave)' },
  },
];

/** Short optional moments between two friends. Never a score: just memories. */
export interface FriendshipDef {
  id: string;
  pair: [CrewId, CrewId];
  title: string;
  when: { areas?: AreaId[]; hours?: [number, number]; raining?: boolean; seated?: boolean; afterMeal?: boolean };
  beats: Array<[CrewId, string]>;
  memory: { key: string; summary: string };
}

export const friendships: FriendshipDef[] = [
  {
    id: 'umbrella',
    pair: ['romy', 'paulo'],
    title: 'Romy & Paulo share an umbrella',
    when: { raining: true },
    beats: [
      ['paulo', 'Room under here for one more?'],
      ['romy', 'If you stop dripping on me.'],
      ['paulo', 'No promises.'],
      ['romy', 'This is nice, actually. Do not make it weird.'],
    ],
    memory: { key: 'friend:umbrella', summary: 'Romy and Paulo squeezed under one umbrella in the rain' },
  },
  {
    id: 'favourite-dishes',
    pair: ['paulo', 'huw'],
    title: 'Paulo & Huw compare favourite dishes',
    when: { areas: ['plaza', 'parte-vieja'], afterMeal: true },
    beats: [
      ['huw', 'Ranking time. Best thing we have eaten so far.'],
      ['paulo', 'The veal cheek. No contest.'],
      ['huw', 'Cheesecake. Obviously. Also the other cheesecake.'],
      ['paulo', 'We are going to need a bigger ranking.'],
    ],
    memory: { key: 'friend:rankings', summary: 'Paulo and Huw drew up the official food rankings' },
  },
  {
    id: 'bench-quiet',
    pair: ['huw', 'romy'],
    title: 'Huw & Romy, quiet on the bench',
    when: { seated: true },
    beats: [
      ['romy', 'I like this bit. Just sitting.'],
      ['huw', 'Me too. Do not tell anyone I can be quiet.'],
      ['romy', 'Your secret is safe.'],
    ],
    memory: { key: 'friend:quiet', summary: 'Huw and Romy sat quietly by the sea, for once' },
  },
  {
    id: 'sunset-photo',
    pair: ['annette', 'romy'],
    title: 'Annette & Romy take a sunset photo',
    when: { areas: ['la-concha', 'peine', 'igueldo'], hours: [18.6, 21] },
    beats: [
      ['annette', 'Stand there. No, there. Look at the sea. Perfect.'],
      ['romy', 'Can I be in one where I am not squinting?'],
      ['annette', 'Every one is beautiful. Even the squinting ones.'],
    ],
    memory: { key: 'friend:sunset-photo', summary: 'Annette took Romy’s photo against the sunset' },
  },
  {
    id: 'rooftop-chat',
    pair: ['paulo', 'annette'],
    title: 'Paulo & Annette, a late-night chat up high',
    when: { areas: ['urgull', 'igueldo'], hours: [21.3, 23.95] },
    beats: [
      ['annette', 'Thank you for organising all this.'],
      ['paulo', 'You wrote the whole itinerary, Annette.'],
      ['annette', 'Then thank you for following it. Mostly.'],
      ['paulo', 'Mostly is my favourite way to follow things.'],
    ],
    memory: { key: 'friend:late-chat', summary: 'Paulo and Annette talked late into the night above the city lights' },
  },
];
