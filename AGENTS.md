# Алаас (Alaas)

First-person walk through a traditional Sakha summer homestead (сайылык) in a Central Yakutia alaas, rendered realistically, that teaches Sakha culture: look at a thing, press E, read its explainer (Sakha / English / Russian, with reference images), do respectful hands-on acts (feed the fire, tie a ribbon). No combat, no human characters. Browser game: three.js WebGPURenderer + TSL, Vite, no backend; progress in `localStorage` (`alaas-v1`). Public face: `README.md`, `CONTRIBUTING.md`, `LICENSE` (code MIT, content CC BY-SA 4.0).

## Commands
- `npm install` · `npm run dev` → http://127.0.0.1:5190 · `npm run build` → `dist/` · `npm run lint` (ESLint: undefined/unused names only)
- Branches: PRs merge into `canary` (testing); `main` holds only released code.
- Hosting: GitHub Pages, `.github/workflows/pages.yml` rebuilds both on a push to `main` or `canary`: `main` at https://springfolk.github.io/alaas-game/, `canary` at https://springfolk.github.io/alaas-game/canary/ (`BASE=/alaas-game/[canary/] npm run build`; one origin, so both share `localStorage`)
- `npm run shot -- "<path?query>" out.png [w h waitMs]` — headless screenshot (system Chrome, WebGPU); `PORT`, `EVAL`, `CHROME` env
- Checks against a dev server (`PORT`): `npm run walkcheck|smooth|hitch|loadprof|loadtrace|bench -- chrome|webkit|phone` (`docs/testing.md`)
- Icon and README art: `node tools/make-icon.mjs` (→ `docs/img/icon.svg`) → `node tools/readme-art.mjs` (icon PNGs, `public/icon.svg`, `docs/img/banner.webp`; no dev server) · `node tools/og-image.mjs` (link-preview `public/og.jpg`; meta tags in `index.html`)
- Traced ornament textures (`docs/patterns.md`): `node tools/make-carving.mjs` (chorons, front saddle bow; no dev server)
- `npm run fetch-assets` (Poly Haven textures, then `tools/tex-sizes.mjs`: masters re-encoded + 1024/512/256 sizes) · `npm run fetch-audio` (sound sources)
- Bakes (dev server running; `docs/loading.md`), rerun after changing a model, tree or the look, in this order: `npm run bake-geometry` → `npm run bake-impostors` → `npm run bake-journal` (stage views, `docs/ui.md`) → `npm run key-art` (then `readme-art`, `og-image`) · after a terrain change: `npm run bake-map` (the journal's map)
- URL flags: `?auto` skip title · `?at=x,z,yaw` start spot · `?q=auto|high|medium|low|mobile` · `?sun=elev,az` · `?nopost` · `?webgl` force WebGL2 (else WebGPU wherever the browser has it) · `?low` · `?nogeo` generate instead of baked geometry · `?sharp` full-size textures from the start (no 256 first pass) · `?taa` / `?notaa` force TRAA on/off (phones: off, FXAA instead; `?noaa` none) · `?fullshadow` exact shadow proxies (A/B) · `?keepgeo` keep JS copies of vertex data (A/B) · `?keepbuilders` keep three's shader builders (A/B) · `?fullenv` PMREM sky light on low/mobile (A/B) · `?hardshadow` one-tap shadow filter · `?nolocal` no fire lights (A/B) · `?perftest` per-layer frame cost on a device (logs via `?remotelog`) · `?remotelog` console + heartbeat to `/__log` (`node tools/phonelog.mjs`, docs/testing.md) · `?teach` lessons with `?auto` (`docs/ui.md`) · `?cam=x,y,z,yaw°,pitch°,fov°` pinned camera · `?keyart` full-quality still (key-art tool only)
- In game: F3 frame-rate meter (fps, draw calls, triangles, tier, fps cap and knobs, GPU ms, resolution, backend and why WebGL2; `?fps` opens it, for phones) · `viewer.html?m=<model>` — one model in isolation
## Docs
- `docs/architecture.md` — module map, coordinates, camera layers, conventions.
- `docs/performance.md` — hard performance rules, device tiers, phone memory, boot guard, cuts by tier.
- `docs/smoothness.md` — frame pacing targets, pacing and dynamic quality, how to measure.
- `docs/loading.md` — boot order, key art, load pieces and bakes, load rules.
- `docs/materials.md` — master graphs, factories that share builds, homestead light set.
- `docs/models.md` — the model-module contract, building notes, how to check a model.
- `docs/content.md` — explainer entry format, language and voice rules, what awaits approval.
- `docs/terms.md` — term research: thin sources, confirmed words, label alternatives.
- `docs/ui.md` — every screen and what it shows; the inspect stage; the UI API.
- `docs/interactions.md` — inputs, inspect flow, pointer lock and pause, hooks, journal finder.
- `docs/actions.md` — every hands-on action and job: the input and the world's answer.
- `docs/audio.md` — sound sources, processing, the named one-shots.
- `docs/patterns.md` — every drawn ornament: motif, where it is used, source.
- `docs/credits.md` — third-party assets and licences.
- `docs/testing.md` — headless checks, iOS.
- `docs/roadmap.md` — planned features (forest and lake life) and open items.

## Constraints
- Cultural accuracy over invention; sacred acts (shamanic rites, the great algys, sacrifice) are explained, never played. Sakha text is written by hand (no machine translation).
- Free assets only (CC0; CC-BY/BY-SA credited in `docs/credits.md`).
- The rules in `docs/performance.md` are hard: breaking one freezes the game.
- Docs state only what is true now, one line per fact: no history, before/after tables or "was".
