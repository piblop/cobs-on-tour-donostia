# Cobs on Tour: Donostia

A cosy, single-player browser exploration game about four friends (Paulo, Annette, Huw and Romy) discovering San Sebastián / Donostia. Walk La Concha, peek down old-town lanes and collect polaroids of the moments.

Built with Vite, TypeScript, three.js and GSAP. All art and audio are procedural or original. The game runs entirely in the browser: no backend, accounts, analytics or network requests.

> **Status:** Milestones 1–3 (foundation; friends and atmosphere; one complete holiday day). See `docs/GAME_SPEC.md` for the full plan.

## Controls

| Action | Keyboard / mouse | Controller |
| --- | --- | --- |
| Stroll | W A S D or arrow keys | Left stick |
| Walk briskly | Shift | Right trigger / right bumper |
| Interact | E or Space | A |
| Zoom | Mouse wheel, + / - | Right stick up/down |
| Turn camera | Z / C, or right-drag | Right stick left/right |
| Reset camera | X | Right stick click |
| Switch friend | Tab | Back / View |
| Pause | Esc | Start |

## Running locally

Requires Node.js 24 or newer.

```bash
npm ci
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm run check        # type check + content validation + unit tests (Vitest)
npm run build        # production build into dist/
npm run preview      # serve dist/ locally
npm run test:e2e     # Playwright smoke tests against a subpath production build
npm run factcheck    # regenerate docs/FACT_CHECK.md from the content tables
```

The first time you run the end-to-end tests, install the browser with `npx playwright install chromium`.

## Previewing the production build

```bash
npm run build && npm run preview     # http://localhost:4173/
```

To preview exactly as GitHub Pages will serve a project site, build with the repository path:

```bash
# macOS / Linux
BASE_PATH=/your-repo-name/ npm run build && npx vite preview
# Windows PowerShell
$env:BASE_PATH="/your-repo-name/"; npm run build; npx vite preview
```

Then open `http://localhost:4173/your-repo-name/`.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the **Deploy to GitHub Pages** workflow by hand). The workflow in `.github/workflows/deploy.yml` installs with `npm ci`, runs the type check, content validation and unit tests, builds, and deploys.
4. In **Settings → Pages**, tick **Enforce HTTPS**.

### Base path

The workflow sets `BASE_PATH` from the Pages configuration automatically:

- A project site (`https://<username>.github.io/<repository>/`) builds with `/<repository>/`.
- A root site (`<username>.github.io`) or a custom domain builds with `/`.

Asset URLs are relative to the base, so the same code works for both. The game is a single page with no client-side routes, so reloading never 404s.

### Recommended repository settings

- Protect `main` (Settings → Branches): require the workflow to pass before merging.
- Keep Dependabot alerts on. `.github/dependabot.yml` already schedules weekly dependency and action updates.

## Troubleshooting a blank page or missing assets

- **Blank page on Pages, fine locally:** the base path is wrong. Check the build log for the `BASE_PATH` value; it must match `/<repository>/` with both slashes.
- **404s for `/assets/...`:** the site was built with `/` but is served from a subpath. Rebuild with `BASE_PATH`.
- **"This browser cannot draw the bay":** WebGL is unavailable. Turn on hardware acceleration or try another browser.
- **"The scenery took a nap":** the graphics device was reset. The game waits for it to come back; reload if it doesn't.
- **Old version still showing:** Pages caches for a few minutes. Hard-refresh (Ctrl+Shift+R).

## Project layout

```text
src/engine   loop, input, camera, renderer, state, events
src/world    map layout, collisions, buildings, scenery, locations
src/crew     characters and movement
src/ui       title, HUD, polaroid card, pause menu (scrapbook style)
src/data     editable content tables + validation
tests/unit   Vitest logic tests
tests/e2e    Playwright smoke tests
docs         spec, content guide, fact-check list
```

## Content and facts

Everything a writer edits lives in `src/data/`. See `docs/CONTENT_GUIDE.md`. Real-world claims are flagged `needsReview: true` until a human checks them; `docs/FACT_CHECK.md` lists what still needs review.

## Security

- Content-Security-Policy ships as a `<meta>` tag in production builds (`default-src 'self'`, no `unsafe-eval`, no third-party scripts). A meta CSP cannot set `frame-ancestors`, so it gives no clickjacking protection.
- No secrets, API keys or `.env` files are needed or committed.
- Player-facing text is rendered as text, never as HTML.
