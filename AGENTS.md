# Алаас (Alaas)

First-person walk through a traditional Sakha summer homestead (сайылык) in a Central Yakutia alaas, rendered realistically, that teaches Sakha culture: look at a thing, press E, read its explainer (Sakha / English / Russian, with reference images), do respectful hands-on acts (feed the fire, tie a ribbon). No combat, no human characters. Browser game: three.js WebGPURenderer + TSL, Vite, no backend; progress in `localStorage` (`alaas-v1`). Public face: `README.md`, `CONTRIBUTING.md`, `LICENSE` (code MIT, content CC BY-SA 4.0).

## Commands
- `npm install` · `npm run dev` → http://127.0.0.1:5190 · `npm run build` → `dist/` · `npm run lint` (ESLint: undefined/unused names only)
- Hosting: GitHub Pages at https://springfolk.github.io/alaas-game/, built by `.github/workflows/pages.yml` on every push to `main` (`BASE=/alaas-game/ npm run build`)
- `npm run shot -- "<path?query>" out.png [w h waitMs]` — headless screenshot (system Chrome, WebGPU); `PORT`, `EVAL`, `CHROME` env
- Checks against a dev server (`PORT`): `npm run walkcheck|hitch|loadprof|loadtrace|bench -- chrome|webkit|phone` (`docs/testing.md`)
- Icon and README art: `node tools/make-icon.mjs` (→ `docs/img/icon.svg`) → `node tools/readme-art.mjs` (icon PNGs, `public/icon.svg`, `docs/img/banner.webp`; no dev server)
- Traced ornament textures (`docs/patterns.md`): `node tools/make-carving.mjs` (chorons, front saddle bow; no dev server)
- `npm run fetch-assets` (Poly Haven textures, then `tools/tex-sizes.mjs`: masters re-encoded + 1024/512/256 sizes) · `npm run fetch-audio` (sound sources)
- Bakes (dev server running; `docs/loading.md`), rerun after changing a model, tree or the look, in this order: `npm run bake-geometry` → `npm run bake-impostors` → `npm run key-art`
- URL flags: `?auto` skip title · `?at=x,z,yaw` start spot · `?q=auto|high|medium|low|mobile` · `?sun=elev,az` · `?nopost` · `?webgl` force WebGL2 (else WebGPU wherever the browser has it) · `?low` · `?nogeo` generate instead of baked geometry · `?sharp` full-size textures from the start (no 256 first pass) · `?taa` TRAA instead of the default FXAA (`?noaa` none) · `?fullshadow` exact shadow proxies (A/B) · `?fullenv` PMREM sky light on low/mobile (A/B) · `?hardshadow` one-tap shadow filter · `?nolocal` no fire lights (A/B) · `?perftest` per-layer frame cost on a device (logs via `?remotelog`) · `?remotelog` console + heartbeat to `/__log` (`node tools/phonelog.mjs`, docs/testing.md) · `?cam=x,y,z,yaw°,pitch°,fov°` pinned camera · `?keyart` full-quality still (key-art tool only)
- In game: F3 frame-rate meter (fps, draw calls, triangles, quality, resolution scale) · H on-screen controls · `viewer.html?m=<model>` — one model in isolation

## Docs
- `docs/architecture.md` — module map, coordinates, render pipeline, performance rules, UI API.
- `docs/loading.md` — boot order, shader streaming, load workers, load rules and timings.
- `docs/materials.md` — shared master graphs, per-material params, homestead light set, what does and does not cut build time.
- `docs/models.md` — the model-module contract and how to check a model.
- `docs/content.md` — explainer entry format, language and voice rules, term research.
- `docs/interactions.md` — E flow (peek/full card), hands-on acts, interaction hooks.
- `docs/audio.md` — sound sources, processing, the named one-shots.
- `docs/patterns.md` — every drawn ornament: motif, where it is used, source.
- `docs/credits.md` — third-party assets and licences.
- `docs/testing.md` — headless checks.
- `docs/roadmap.md` — planned features (forest and lake life) and open items.

## Constraints
- Cultural accuracy over invention; sacred acts (shamanic rites, the great algys, sacrifice) are explained, never played. Sakha text is written by hand (no machine translation).
- Free assets only (CC0; CC-BY/BY-SA credited in `docs/credits.md`).
- The performance rules in `docs/architecture.md` are hard: breaking one freezes the game.
