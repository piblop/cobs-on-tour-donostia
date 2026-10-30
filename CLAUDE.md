# Cobs on Tour: Donostia

A cosy browser exploration game (Vite + TypeScript + three.js), published on GitHub Pages.
`docs/GAME_SPEC.md` is the source of truth. If it conflicts with anything else, the spec wins.

## Core rules

1. **Feel over features.** Walking along La Concha with the four friends must feel delightful before any new system is added. Polish movement, camera and atmosphere first.
2. **Re-read the spec before each milestone.** Open the relevant sections of `docs/GAME_SPEC.md` before starting a milestone, and again before calling it done.
3. **Never claim a check passed unless it was run.** Tests, type checks, audits, builds and deployments are reported with their real result. A prepared workflow is not a deployment; a local build is not a live site.
4. **Commit after each milestone** with a clear message, after running the game and fixing what you find.
5. **Run the section 25 security checklist before any push or public deployment**, and report the results.

## Working conventions

- Content lives in typed tables under `src/data/`. Any real-world claim shown to the player carries `source` and `needsReview: true` until a human verifies it. Run `npm run factcheck` after changing facts.
- Engine (`src/engine`), world (`src/world`), crew (`src/crew`), UI (`src/ui`) and content (`src/data`) stay separate. UI text goes through `textContent` (see `src/ui/dom.ts`), never `innerHTML`.
- Simulation runs at a fixed 60 Hz (`src/engine/loop.ts`); rendering interpolates. Gameplay input only acts in the `exploring` state.
- Decorative randomness uses seeded streams (`src/engine/random.ts`) and never feeds progression or saves.
- No runtime network requests, CDNs, analytics or secrets. Assets are procedural or original.
- Keep the initial download under ~2 MB gzipped.
- `src/data/` files are also run directly by Node (`npm run validate`, `npm run factcheck`): keep them free of enums, parameter properties and other non-erasable TypeScript, and import with explicit `.ts` extensions.

## Commands

```bash
npm run dev        # local dev server
npm run check      # type check + content validation + unit tests
npm run build      # production build (BASE_PATH=/repo-name/ for a project site)
npm run test:e2e   # Playwright smoke test against a subpath production build
npm run factcheck  # regenerate docs/FACT_CHECK.md
```
