# Content guide

All editable content lives in typed tables under `src/data/`. After any change run:

```bash
npm run check       # validates the tables and runs the tests
npm run factcheck   # refreshes docs/FACT_CHECK.md if you touched a fact
```

The build fails if a table is invalid, so mistakes never reach players.

## Facts need a source and a review flag

Anything that tells the player something about the real world (history, culture, phrase meanings, restaurant details, transport) is a `FactCheck`:

```ts
fact: {
  text: 'The Parte Vieja is the oldest part of Donostia…',
  source: 'unsourced',   // or a book, page or URL you checked
  needsReview: true,     // only a human sets this to false, after checking
}
```

Never set `needsReview: false` unless a person has verified the claim.

## Add a location

Edit `src/data/locations.ts` and add an entry to `locations`:

```ts
{
  id: 'miramar-gardens',            // lowercase kebab-case, unique
  name: 'Miramar Gardens',
  area: 'la-concha',                 // must match an id in `areas`
  position: { x: -20, z: 12 },       // where the interaction ring sits (see src/world/map.ts)
  interactRadius: 2.5,               // 0.5 to 8 world units
  actionLabel: 'Sit on the lawn',    // shown in the prompt
  polaroidCaption: 'Short, warm, in the scrapbook voice.',
  shot: {                            // camera framing for the discovery glide
    position: { x: -18, y: 5, z: 18 },
    target: { x: -22, y: 2, z: -30 },
  },
  fact: { text: '…', source: 'unsourced', needsReview: true },
}
```

The validator checks that the id is unique, the area exists, the text is filled in, and the coordinates sit inside the world. A unit test also checks that the crew can stand on the interaction point.

To add a new named area (for the banner that appears on entry), add it to `areas` with a bounding rectangle and a priority (lower wins where rectangles overlap).

## Add a food

*Arrives in M3/M4 (`src/data/foods.ts`).* Each food will have an id, name, description, the bar it is found at, crew reactions and an alcohol-free flag, with real-world details carrying a `FactCheck`.

## Add a banter line

Edit `src/data/banter.ts`. Each line has an id, a context and one or more beats:

```ts
l('vieja-lanes', 'area:parte-vieja', ['paulo', 'These lanes are narrow enough to hold hands with both walls.']),
l('golden-gold', 'time:golden', ['paulo', 'Golden hour.'], ['romy', 'Even Huw is glowing.']),
cb('cb-railing-1', 'discovered:la-concha-railing', ['huw', 'I keep thinking about that view.']), // callback
```

- **Contexts:** `idle`, `area:<area id>`, `time:<morning|midday|afternoon|golden|dusk|night>`, `discover:<location id>`, `need:<hungry|tired|bored>`, `switch:<friend id>`, `investigate`, `bench`, `vibe:high`, `sunset`, `recover`, `weather:rain`, `callback`.
- **Speakers:** a friend id (`paulo`, `annette`, `huw`, `romy`), `leader` (whoever you control), `subject` (the friend the moment is about, e.g. the hungry one), `any` (any friend but the leader) or `other` (someone other than the previous speaker).
- **Callbacks:** use `cb(id, memoryKey, ...)`. The line only plays if that memory really happened (see `src/crew/memories.ts`; keys look like `discovered:<id>`, `sat:bench`, `watched:sunset`, `led:<friend>`).
- Each line plays at most once per session. Keep lines short: a bubble stays up 2 to 6.5 seconds depending on length.

## Add a friend preference

Edit `src/data/crew.ts`. Each friend has editable traits:

```ts
favouriteFoods: ['burnt cheesecake', 'anchovies'],
drinkPreferences: ['cider', 'cafe con leche'],
energyTendency: 'early-bird',        // 'early-bird' | 'steady' | 'night-owl'
catchphrases: ['Photo first, then eat.'],
interests: ['photography', 'markets'],
distractions: ['flower boxes'],
reactionStyle: 'giggly',             // 'beaming' | 'deadpan' | 'dramatic' | 'giggly'
colors: { top: '#7cc4a4', bottom: '#f3efe2', hair: '#c98b4f', skin: '#f2c9a8', accent: '#e86f8e' },
```

Use first names only and keep personalities affectionate and fictional. Don't add surnames, addresses, dates or other personal details.

## Add a minigame configuration

*Arrives with the first minigame in M3 (`src/data/tuning.ts`).* Timing windows, relaxed-timing multipliers and one-button alternatives will live here so they can be tuned without touching engine code.

## Feel and camera tuning

`src/data/tuning.ts` holds movement speed, acceleration, turn rate, camera distances, pitch and glide durations.
