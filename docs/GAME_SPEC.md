# Cobs on Tour: Donostia (Game Spec)

> **Source of truth.** This file lives at `docs/GAME_SPEC.md`. Re-read the relevant sections before starting each milestone. If anything here conflicts with an earlier conversation, this file wins.

You are building a polished, single-player browser exploration game called **"Cobs on Tour: Donostia"**, to be published on **GitHub Pages**.

It celebrates discovering San Sebastián / Donostia, Spain, with four friends: Paulo, Annette, Huw and Romy. The emotional heart is exploring together, eating wonderful food, sharing silly moments and collecting memories.

The game should feel warm, funny, cosy and magical: **a travel memory you can play**.

Build a real, playable game, not a landing page, mockup or collection of disconnected demos. Prioritise smooth movement, atmosphere and meaningful interactions over feature count.

---

## 0. Release scope

Two release targets. Always finish the smaller one first.

**Minimum Lovable Release (MLR)**
- Milestones M1 to M4.
- A short ending montage built from the player's real memories.
- Working GitHub Pages deployment.
- Everything in this release must feel finished.

**Full Release**
- Milestones M5 to M7 and everything else in this spec.

If time or scope becomes a problem, ship the MLR polished rather than the Full Release half-built.

---

## 1. Platform and technology

- Vite, TypeScript and three.js.
- Compatible stable dependency versions. Commit `package-lock.json`.
- GSAP for UI transitions and cinematic camera tweening.
- Web Audio API only for procedural music and sound (no audio libraries needed).
- Accessible HTML/CSS interface layered over the 3D canvas.
- Vitest for logic tests. Playwright for browser smoke tests.
- Target desktop browsers first, with keyboard/mouse and controller support.
- Basic touch support arrives in M7 (see section 20).
- Support current Chrome, Edge, Firefox and Safari where their graphics capabilities allow.
- Run entirely in the browser.
- No Electron, installers, backend, account system, paid APIs, server database or runtime secrets.
- Bundle dependencies locally. No runtime CDN imports.
- Produce a static `dist/` folder suitable for GitHub Pages.
- **Bundle budget:** initial download under roughly 2 MB gzipped before the first playable scene.

All artwork must be procedural or built from original project assets:
- Low-poly miniature diorama scenery.
- Soft pastel palette.
- Warm lighting.
- Gentle outlines.
- A tilt-shift travel-postcard feeling.
- No copyrighted music, third-party logos or copied brand assets.

---

## 2. Architecture and project structure

Organise the project approximately as follows:

```text
.github/workflows/deploy.yml
.github/dependabot.yml
docs/
  GAME_SPEC.md
  FACT_CHECK.md
  CONTENT_GUIDE.md
public/
src/
  main.ts
  engine/
    renderer.ts
    loop.ts
    input.ts
    camera.ts
    audio.ts
    save.ts
    settings.ts
    events.ts
  world/
    map.ts
    locations.ts
    buildings.ts
    scenery.ts
    collisions.ts
    navigation.ts
    dayNight.ts
    weather.ts
    crowds.ts
    travel.ts
  crew/
    character.ts
    controller.ts
    followers.ts
    banter.ts
    needs.ts
    memories.ts
    vibe.ts
  minigames/
    pintxosCrawl.ts
    txotx.ts
    surf.ts
    wavePhoto.ts
    tortillaRush.ts
    tastingGuess.ts
  ui/
    title.ts
    hud.ts
    planning.ts
    map.ts
    journal.ts
    pintxoDex.ts
    phrasebook.ts
    photoMode.ts
    settings.ts
    ending.ts
  data/
    types.ts
    locations.ts
    foods.ts
    restaurants.ts
    crew.ts
    banter.ts
    phrases.ts
    encounters.ts
    tuning.ts
    validate.ts
  styles/
tests/
  unit/
  e2e/
CLAUDE.md
index.html
package.json
package-lock.json
tsconfig.json
vite.config.ts
README.md
```

Adjust where necessary, but keep engine code, content and UI clearly separated.

Technical requirements:
- Fixed 60 Hz simulation timestep, decoupled from rendering.
- Interpolate rendered movement for smooth results.
- Clamp accumulated time and limit catch-up steps after stalls.
- Pause simulation when the browser tab becomes hidden.
- Resume without sudden movement, time jumps or audio bursts.
- Explicit game states for exploration, menus, cinematics, travel and minigames.
- Gameplay controls never fire while navigating menus.
- Dispose of graphics and audio resources when changing zones.
- Keep decorative randomness separate from progression and saved outcomes.

---

## 3. Art direction and presentation

Make the world immediately inviting.

Visual identity:
- Pale turquoise sea.
- Cream and peach buildings.
- Terracotta roofs.
- Muted green hills.
- Golden sunlight.
- Warm amber windows at night.
- Soft shadows and restrained atmospheric effects.

Characters:
- Four visually distinct stylised friends.
- Recognisable silhouettes and clothing colours.
- Simple expressive faces.
- Rounded, friendly proportions.

Interface:
- Travel scrapbook aesthetic.
- Paper textures generated with code.
- Polaroids, tickets, handwritten-style accents and understated stamps.
- Highly readable body text.
- No clutter or tiny controls.
- Keep most of the screen available for the world.

Use subtle effects rather than heavy bloom or blur that obscures the scene.

---

## 4. Movement, camera and interaction feel

Smooth and clean beats feature count.

Movement:
- Responsive walking with gentle acceleration and deceleration.
- Consistent diagonal movement speed.
- Smooth character rotation.
- Reliable collision against buildings, cliffs and water boundaries.
- No snagging on tiny decorative objects.
- Walk bob, idle sway and small celebratory hops.
- Restrained squash and stretch for reactions.

Camera:
- Spring-damped follow.
- Smooth scroll-wheel zoom.
- Comfortable limits that preserve orientation.
- Optional rotation with a clear reset control.
- Cinematic arrival glides lasting roughly 1.2 to 1.8 seconds.
- No clipping through buildings.
- Reduced-motion alternatives for all elaborate movement.

Interaction:
- Clearly highlight the nearest usable object.
- Show a concise action label.
- Never require pixel-perfect positioning.
- Cinematics can be skipped immediately.
- Repeated interactions are faster than first-time interactions.

UI:
- Panels slide and fade with consistent easing.
- Buttons have subtle hover lift and press feedback.
- Counters animate without delaying input.
- Keyboard navigation, visible focus and controller navigation.

---

## 5. The world

A stylised, compressed map, not a geographically exact recreation.

Every major location needs:
- A distinctive silhouette.
- A first-discovery moment.
- One to three activities.
- A concise cultural or historical fact (see section 22 for fact-check rules).
- A collectible polaroid.
- Contextual crew dialogue.

City locations:
- La Concha beach and promenade, including iconic white railings.
- Isla de Santa Clara, reached by a small boat.
- Monte Igueldo, with a funicular and vintage hilltop amusement-park atmosphere.
- Monte Urgull, with castle ruins and the Sagrado Corazón statue.
- Peine del Viento, with stylised sculptures and wave-driven bursts.
- Parte Vieja, with narrow lanes and lively pintxos bars.
- Plaza de la Constitución, including numbered balconies.
- Basílica de Santa María.
- Mercado de la Bretxa.
- Gros and Zurriola beach.
- Kursaal near the river mouth.
- Miramar Palace gardens.

Day-trip zones:
- Getaria: vineyards, grilled fish and a coastal walk.
- Astigarraga: cider-house atmosphere and the "Txotx!" ritual.
- Pasai Donibane: fishing-village lanes and a boat crossing.
- Hondarribia: colourful houses and a border-town atmosphere.

Unlock day trips through natural trip progression, not repetitive grinding.

---

## 6. Ambient life and small discoveries

Make the spaces between landmarks enjoyable.

Include:
- Seagulls and gentle surf.
- Surfers at Zurriola.
- Market activity.
- Night-time crowds around old-town bars.
- Boats on the bay.
- Laundry, flowerpots, benches and shopfront details.
- Occasional weather changes.
- Reflections and puddles after rain where performance permits.

Small encounters (target 10 to 15 in the Full Release):
- A friendly dog distracting someone.
- A tucked-away courtyard.
- A street musician playing original procedural music.
- An unexpectedly beautiful reflection.
- A debate about which direction to walk.
- A bench with a particularly good view.

Use subtle visual and audio cues rather than filling the map with icons.

Include places where the crew can sit together, recover energy and have a short conversation.

Weather changes atmosphere and available moments without trapping players or cancelling essential progression.

---

## 7. Day and night

A gentle day/night cycle with:
- A long golden hour over La Concha.
- Gradual lighting and sky changes.
- Street lamps turning on.
- Warm bar windows at night.
- Area-specific ambient audio.
- Different crowd patterns across the day.

The clock pauses during:
- Menus.
- Planning.
- Important dialogue.
- Photo mode.
- Accessibility-assisted activities where timing would otherwise create pressure.

Never end the day during an active meal, scene or minigame.

Let the player choose when to finish the evening after a gentle prompt.

---

## 8. The crew

The travelling group is called **"Cobs on Tour"**.

Friends:
- Paulo, player-controlled by default.
- Annette.
- Huw.
- Romy.

Switch the controlled friend with Tab (remappable in M7).

Followers:
- Follow in a loose, natural formation.
- Never stack on top of one another.
- Occasionally investigate nearby points of interest.
- Catch up without blocking the player.
- Recover gracefully if stuck.
- Avoid visible teleportation where possible.

Editable traits in `src/data/crew.ts`:
- Favourite foods.
- Drink preferences.
- Energy tendencies.
- Catchphrases.
- Interests.
- Things that distract them.
- Clothing colours.
- Reaction styles.

Use affectionate, fictional placeholder personalities that are easy to edit. Use first names only. Do not invent sensitive personal details.

---

## 9. Banter, friendship and memory

Write at least 150 short, warm, funny lines across:
- Locations.
- Weather.
- Time of day.
- Food.
- Travel.
- Discoveries.
- Minigames.
- Earlier conversations.
- Memorable trip events.

Banter requirements:
- No repeated authored line within a session.
- Track recently used lines across saves where practical.
- Cooldowns so dialogue never becomes constant noise.
- Never overlap important dialogue.
- Allow comfortable silence once relevant unseen lines are exhausted.
- Readable bubbles plus a dialogue-history panel.

Structured memories:
- Record what happened, where, when and who was involved.
- Use these events for later callbacks.
- Never reference an event that did not happen.
- Example: a joke about Huw ordering three cheesecakes appears only if that event occurred.

Friendship scenes:
- Short optional moments between pairs of friends.
- Sharing an umbrella.
- Comparing favourite dishes.
- A quiet conversation on a bench.
- A sunset photo.
- A late-night rooftop chat.

These enrich the trip without turning friendship into a competitive score.

---

## 10. Needs and group vibe

Each friend has simple hunger, energy and fun values that gently suggest pacing:
- Hungry friends suggest food.
- Tired friends suggest sitting or a quieter activity.
- Bored friends point out something interesting.

Never:
- Lock essential activities because of needs.
- Make friends abandon the player.
- Create a failure spiral.
- Penalise players for taking photos or exploring slowly.

Group Vibe rises through:
- Shared meals.
- Discoveries.
- Sunsets.
- Rest.
- Funny moments.
- Completing optional friend wishes.

High Vibe unlocks bonus scenes:
- An impromptu beach dip.
- A group selfie.
- A spontaneous singalong.
- A late-night conversation.

Keep the meter supportive rather than judgemental.

---

## 11. Opening and five-day trip structure

**Opening (first 90 seconds)**
- The crew arrives by train and walks out onto the promenade at golden hour.
- The first gentle goal: "Find somewhere for pintxos tonight."
- Teach movement, interaction and banter naturally within 90 seconds.
- No text-heavy tutorial screens.

**The trip** lasts five in-game days.

Each morning:
- A hand-drawn-style planning map.
- Each friend offers one optional wish.
- The player can pin up to three ideas.
- Routes are suggested, never mandatory.

Plans are suggestions:
- Changing your mind never causes failure.
- No compulsory daily checklists.
- Important story moments have fallback opportunities.

Each evening:
- Assemble a scrapbook page.
- Summarise discoveries, foods and shared moments.
- The player picks a "moment of the day".
- Optional caption.

Complete one polished playable day before expanding to the full five days.

After the ending, unlock **"One More Day"** for continued exploration with collections preserved.

---

## 12. Food: the emotional heart

Pintxos bars inspired by:
- La Cuchara de San Telmo.
- Gandarias.
- Bar Nestor.
- La Viña.
- Borda Berri.
- Ganbara.

**Content target:** 15 to 20 distinct pintxos and dishes in the Full Release (6 to 8 in the MLR).

Include:
- A limited-slice tortilla encounter inspired by Bar Nestor.
- Burnt Basque cheesecake.
- Mushroom dishes.
- Seasonal pintxos.
- Shared plates.
- Distinct crew reactions.

Let the crew order food to share.

Ratings feel conversational:
- "Romy's favourite."
- "Unexpected hit."
- "Paulo would order another."
- "Worth coming back for."

Alcohol-free options get equally rich reactions and rewards.

Missing a tortilla slice triggers a funny alternate moment and another food option, never a progression failure.

Restaurant-inspired scenes are fictionalised game experiences. Keep gameplay opening times, availability and prices separate from real-world information.

---

## 13. Special tasting-menu evenings

Special set-piece dinners inspired by:
- Arzak.
- Akelarre.
- Martín Berasategui.
- Mugaritz.
- Elkano.

**Content target:** 5 courses per dinner.

Use an original, generic star icon. No Michelin logos or branding.

Do not hard-code star counts. Store any star count as content with `needsReview: true` and include this note in `docs/FACT_CHECK.md`:
**"Verify current star counts before sharing."**

Each dinner includes:
- Course-by-course presentation.
- Floating plate entrances.
- Gentle procedural steam.
- Original stylised food models.
- Crew reactions.
- Optional ingredient guesses.
- Collectible tasting cards.

Allow faster pacing or skipping of repeated presentation animations.

Make these evenings special through atmosphere and character moments rather than expensive visual effects.

---

## 14. Travel is part of the holiday

Travel modes:
- Walking.
- Rental bikes along suitable promenade routes.
- Monte Igueldo funicular.
- Boat to Santa Clara.
- Regional train journeys where geographically appropriate.
- Road travel for destinations requiring onward connections.
- Rental-car coastal drives.

Treat compressed game connections as fictional abstractions. Any real-world transport claim shown to the player follows the fact-check rules in section 22.

Each travel mode needs:
- A short, skippable animated sequence.
- Contextual crew banter.
- Distinct sound and motion.
- Clear arrival feedback.

The coastal drive includes:
- A stylised top-down road sequence.
- Sea views.
- Original procedural music.
- Affectionately terrible crew singing.

Keep travel playful and brief. It must never become repetitive waiting.

---

## 15. Minigames

Every minigame must be:
- Under two minutes.
- Skippable.
- Replayable.
- Easy to understand.
- Forgiving.
- Playable with accessible alternatives.

Minigames:

1. **Pintxos Crawl:** catch the bartender's eye, choose dishes and balance plates.
2. **Txotx!:** position and time a glass under an arc of cider. Splashes are funny, not failures.
3. **Zurriola Surf:** ride a wave with simple timing and gentle steering.
4. **Peine del Viento Photo:** capture a dramatic wave burst.
5. **Tortilla Rush:** join the list and return for a slice. Missing out leads to an alternate scene.
6. **Tasting Menu Guess:** guess a hidden ingredient from playful clues.

Provide:
- Relaxed timing.
- One-button alternatives.
- A practice option.
- Clear retry and exit controls.
- Equivalent core story progression when skipped.

Never require a high score to finish the trip.

---

## 16. Collections

**Sights journal**
- Location polaroids.
- Short facts.
- Discovery dates.
- Personal captions.
- Replayable discovery scenes.

**Pintxo-dex**
- Foods tried.
- Descriptions.
- Crew reactions.
- Favourite dishes.

**Basque phrasebook**
- Kaixo.
- Eskerrik asko.
- Txotx.
- Agur.
- On egin.
- Meanings and usage notes, flagged for review per section 22.
- No invented pronunciation audio.

**Tasting cards**
- Original course illustrations or rendered snapshots.
- Ingredients.
- Dinner memories.

Collections celebrate the journey. No pressure to reach 100%.

---

## 17. Photo mode and scrapbook

Photo mode:
- Free camera within safe scene bounds.
- Hide/show interface.
- Film, golden-hour and black-and-white filters.
- Crew poses: cheers, jump and point at the view.
- Reset-camera button.
- PNG download through the browser.

Browser requirements:
- Never promise silent writes to a local folder.
- Trigger downloads only from a clear user action.
- Keep generated images compatible with canvas export.
- Avoid unnecessary permanent high-resolution rendering buffers.

Scrapbook:
- Evening pages built from actual photos, foods and memories.
- Optional captions and favourite stickers.
- Export individual pages as PNGs.
- Store image blobs separately from lightweight game state.
- Handle storage limits without losing progression.
- Let the user remove stored photos independently of their save.

---

## 18. Ending

On the final night:
- Replay the player's own polaroids.
- Include favourite meals.
- Recall real memorable events.
- Show affectionate crew moments.
- Soft original music.
- End with **"See you next tour."**

Provide fallback images and scenes if the player took no photos or skipped optional activities.

Offer:
- Rewatch montage.
- Return to scrapbook.
- Continue with "One More Day".
- Start a new trip without accidentally overwriting the existing one.

---

## 19. Audio

Original procedural audio:
- Gentle surf.
- Wind.
- Seagulls.
- Market bustle.
- Soft crowd murmur.
- Footsteps.
- Boat and funicular sounds.
- UI feedback.
- Simple melodic ambience.

Crossfade area-specific layers for:
- Beach.
- Old town.
- Hilltop.
- Cider house.
- Special dinners.

Start audio only after a user gesture, such as pressing "Start Trip".

Settings:
- Master volume.
- Music.
- Ambience.
- Effects.
- Mute.

Pause or fade audio when the tab is hidden.

Avoid clipping, sudden volume jumps and excessive repetition.

---

## 20. Accessibility, input and settings

**From M2 onward:**
- Adjustable text size.
- High-contrast interaction prompts.
- Subtitles and dialogue history.
- Reduced motion.
- Optional camera shake, off by default.
- Relaxed minigame timing.
- One-button minigame alternatives.
- Separate audio controls.
- Graphics quality presets.
- Rendering-resolution scale.
- Optional fullscreen, requested through user interaction.
- Sensible default keyboard and controller layouts.

**Deferred to M7:**
- Remappable keyboard controls.
- Controller remapping.
- Basic touch support: on-screen joystick, tap to interact, touch-sized buttons. Full minigame touch support is optional.

Never communicate essential information through colour alone.

Menus stay usable at browser zoom and smaller window sizes.

Reduced motion removes:
- Dramatic camera orbits.
- Camera shake.
- Flashes.
- Exaggerated bounce.
- Unnecessary motion blur.

---

## 21. Browser saves and recovery

Storage:
- IndexedDB for game saves, memories and photo blobs.
- localStorage only for small preferences.

Save:
- Current day and time.
- Player and crew state.
- Discovered locations.
- Collections.
- Completed activities.
- Memories.
- Settings where appropriate.

**From M3 onward:**
- Autosave after discoveries, meals, important scenes and day transitions.
- Keep a previous valid save as a backup.
- Version the save schema from the first save.
- Handle unavailable storage and quota errors visibly.
- Explain that browser saves are local and may disappear if site data is cleared.
- Confirmation before overwriting or deleting a trip.

**Deferred to M7:**
- Separate manual save slots.
- Validation and migration of older save versions.
- Validated JSON export/import of progress (clearly state whether photos are excluded; export photos separately if needed).

Recovery action available at all times:
**"Return to the promenade."**
This safely restores the crew without resetting progress.

---

## 22. Data-driven content and fact checking

All editable content lives in typed tables under `src/data/`:
- Locations.
- Foods.
- Restaurants.
- Crew traits.
- Banter.
- Phrases.
- Encounters.
- Minigame tuning.
- Day-trip unlocks.
- Accessibility timing values.

**Fact-check fields.** Every entry that shows a real-world fact to the player (history, culture, phrase meanings, restaurant details, transport) includes:
- `source: string` (where the claim came from, or "unsourced").
- `needsReview: boolean`, default `true`.

Generate and keep updated `docs/FACT_CHECK.md` listing every entry with `needsReview: true`, its text and its source, so a human can verify it. Never describe content as verified unless a human has set `needsReview: false`.

Validate data during development and production build. Check:
- Unique IDs.
- Valid references.
- Required text.
- Valid coordinates.
- Valid unlock conditions.
- Missing fallback content.
- Impossible progression dependencies.

Show clear development errors and a friendly production error screen if startup cannot continue.

Document in `docs/CONTENT_GUIDE.md` how to add:
- A location.
- A food.
- A banter line.
- A friend preference.
- A minigame configuration.

---

## 23. Performance and robustness

Target smooth 60 fps on a documented representative desktop device. Treat this as a measured target, not a guarantee.

Use:
- Instancing for repeated buildings, trees and crowds.
- Shared geometry and materials.
- Limited shadow-casting lights.
- Capped pixel ratio.
- Adjustable shadow quality.
- Lower crowd density on lower presets.
- Lazy loading for day-trip zones and minigames.
- Bounded particles and dialogue bubbles.
- Efficient collision and follower navigation.

Avoid:
- Unnecessary allocations inside the frame loop.
- Rebuilding unchanged UI every frame.
- Expensive full-screen effects on low settings.
- Loading optional zones before the first playable scene.

Development-only performance overlay:
- Frame time.
- Draw calls.
- Triangle count.
- Active scene objects.

Handle:
- Window resizing.
- Display scaling changes.
- Tab switching.
- Lost input focus.
- Unsupported graphics capabilities.
- WebGL context loss with a recovery message.

Loading progress reflects actual loading work, not an artificial timer.

---

## 24. GitHub Pages deployment

The game must run at either:
- `https://<username>.github.io/<repository>/`
- A GitHub Pages root site or custom domain.

Requirements:
- Configure Vite's base path for the deployment target (read from an env var).
- Keep asset URLs base-path aware.
- Use imported assets or `import.meta.env.BASE_URL` where appropriate.
- No hard-coded root-relative paths.
- Single application entry point with no server-dependent routes.
- If URL navigation is needed, use hash-based routing.
- Reloading the deployed game must not produce a 404.
- All required runtime files are included in `dist/`.
- No source maps in production builds.

GitHub Actions workflow:
1. Check out the repository.
2. Set up the current active LTS version of Node.js.
3. Install dependencies with `npm ci`.
4. Run type checks and automated tests.
5. Build the production site.
6. Upload the Pages artifact.
7. Deploy through GitHub Pages.

Use current official GitHub Pages actions, pinned to versions, with only the permissions they require (`contents: read`, `pages: write`, `id-token: write`).

Document in the README:
- Enabling GitHub Pages with GitHub Actions (Settings, Pages, Source: GitHub Actions).
- Configuring the repository base path.
- Running locally.
- Previewing the production build.
- Deploying.
- Troubleshooting a blank page or missing assets.

No secrets or API keys required for the game to run.

No service worker initially. Consider offline support only after deployment and update behaviour are reliable.

---

## 25. Security and publishing checks

Run before **every** push or public deployment, and report the results:
- No secrets, tokens, keys or `.env` files in code or git history. `.gitignore` covers `node_modules`, `dist`, `.env*` and OS junk files.
- `npm audit` run; high and critical issues fixed or documented.
- Dependabot alerts and version updates enabled via `.github/dependabot.yml`.
- No private information in content: first names only, no surnames, photos, addresses, dates or contact details of real people.
- All music and visual assets are original or appropriately licensed.
- Imported save files are validated as untrusted data.
- Player captions rendered safely as text. No unsafe HTML insertion or executable imported content.
- Content-Security-Policy applied via a `<meta>` tag (Pages cannot set headers): `default-src 'self'`, no `'unsafe-eval'`, no third-party scripts. Note: meta CSP cannot use `frame-ancestors`, so do not claim clickjacking protection.
- No analytics, trackers or external network requests.
- Production builds exclude development tools, debug overlays and debug content.
- Production build tested under a repository-style subpath.
- "Enforce HTTPS" enabled in Pages settings and branch protection on `main` recommended in the README.

Never claim an audit, test or deployment succeeded unless it was actually run and its result verified.

Preparing a deployment workflow does not mean the game is published. Clearly distinguish a local build from a live deployment.

---

## 26. Milestones

Build in this order. After each milestone: run the game, fix issues, **commit with a clear message**, and give a short progress summary before continuing.

**M1: Beautiful playable foundation**
- Vite, TypeScript and three.js setup.
- La Concha and a small Parte Vieja area.
- One controllable character.
- Polished movement and camera.
- Collision.
- One meaningful discovery interaction.
- Basic title screen and controls.
- Production build with GitHub Pages base-path support.

**M2: Friends and atmosphere**
- Four switchable friends.
- Natural following.
- Contextual banter.
- Vibe and gentle needs.
- Day/night cycle.
- Basic procedural audio.
- Accessibility foundations (section 20, "From M2 onward").

**M3: One complete holiday day (quality gate)**
- The opening arrival sequence.
- Morning planning.
- Exploration.
- A shared food experience.
- One playable minigame.
- One remembered event and a later callback.
- Evening scrapbook.
- Save and resume (section 21, "From M3 onward").

Polish this complete loop before expanding the game.

**M4: City discoveries and food**
- Remaining city locations.
- Discovery scenes.
- Sights journal.
- Pintxo-dex.
- Pintxos Crawl and Txotx.
- Small encounters and friendship scenes.

**MLR checkpoint:** add a short ending montage from real memories, deploy to GitHub Pages, run the full security checklist, and report. The MLR must feel finished.

**M5: Five-day trip and regional travel**
- Full five-day structure.
- Special tasting-menu evenings.
- Travel sequences.
- Day-trip zones.
- Expanded memories and contextual dialogue.

**M6: Photos, activities and ending**
- Remaining minigames.
- Photo mode and downloads.
- Phrasebook.
- Tasting cards.
- Full personalised ending montage.
- "One More Day" mode.

**M7: Release polish**
- Performance profiling.
- Audio balance.
- Control remapping and basic touch support.
- Manual save slots, save migration and export/import.
- Controller and accessibility checks.
- Browser compatibility checks.
- README, `CONTENT_GUIDE.md` and `FACT_CHECK.md` up to date.
- Final production verification and deployment.

---

## 27. Acceptance criteria

The Full Release lets a player:
- Start from a GitHub Pages URL.
- Understand the controls within the opening.
- Walk around smoothly.
- Explore with all four friends.
- Discover locations.
- Share meals.
- Play or skip minigames.
- Experience a complete five-day trip.
- Save and resume.
- Download a photo.
- Review their scrapbook.
- Watch an ending based on their actual memories.
- Continue exploring afterward.

Every visible button must work. Remove or clearly label unfinished features during development.

Test important behaviour:
- Movement consistency at different rendering frame rates (Vitest).
- Follower recovery.
- Pause and resume.
- Save round trips and invalid imports.
- Day progression.
- Minigame skipping.
- Memory callbacks.
- Data validation.
- Repository-subpath asset loading (Playwright).

Use Playwright browser smoke tests for the playable experience where tooling permits.

Report what was tested, what remains incomplete and any known limitations honestly.

---

## 28. Working instructions

Start by:
1. Creating `CLAUDE.md` with the core rules: feel over features, re-read the relevant spec section before each milestone, never claim checks passed unless run, commit after each milestone, run the section 25 security checklist before any push.
2. Briefly proposing the architecture.
3. Listing the files required for M1.
4. Implementing M1.
5. Running available checks and the playable build.
6. Reporting the result, then proceeding milestone by milestone.

Make reasonable implementation decisions without stopping for routine approval.

If an existing project is present, inspect it first, preserve working functionality and improve it incrementally.

Do not attempt to implement the entire scope in one unverified pass.

Above all: **make walking along La Concha with these four friends feel delightful before adding more systems.**
