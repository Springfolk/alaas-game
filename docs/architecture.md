# Architecture

| Path | Role |
|---|---|
| `src/main.js` | `Game`: boot, title, frame loop, focus (raycast ≤3.4 m or zone), E → act / card peek → full → close (non-blocking), save |
| `src/interact/*` | Hands-on acts: carrying pail and firewood, sitting, berries (`docs/interactions.md`); props in `src/models/chores.js` |
| `src/engine/engine.js` | `Engine`: WebGPURenderer, `SunLight` (cascades, cloud shadows from the sky's cloud field via a 512² `cloudMap` re-rendered each frame), sun intensity by air mass, PMREM sky env (intensity 1: sky and sun share absolute units), aerial haze (`scene.fogNode`: horizon colour + forward-scatter lobe toward the sun), metered eye adaptation |
| `src/engine/sky.js` | Perez/Preetham clear sky (T 1.9) in scene units, cumulus layer at 1.8 km (`cloudField`, shared with cloud shadows), sunlit ground below the horizon (green env bounce); `updateSky` on CPU gives haze colours |
| `src/engine/merge.js` · `lod.js` | Applied by `world.js` after the homestead (`world.optimized`; `?nomerge` = A/B off): merged depth-only shadow proxy per model and side (layer 2, cascade cameras only); billboard impostors per cluster (8 azimuths baked in place into an atlas, one instanced draw, also stand in for the models in the lake mirror away from the shore) that replace a cluster's meshes beyond ~110 m; meshes under ~2.5 px move to layer 30. Kept out: act/take targets, `userData.dynamic`; a watchdog gives a merged part that moves its own shadow back (and warns) |
| `src/engine/post.js` | GTAO (high) × interior occlusion → TRAA → clamped sharpen → capped-input glare (off on low) → AgX with a look (power/saturation) → vignette, grain; 64×36 log-luminance meter read back every 0.15 s |
| `src/engine/interiors.js` | Analytic sky occlusion inside urasa/balagan(+khoton)/ampaar from `layout.js` placements (all tiers; models placed elsewhere, e.g. the viewer, get none) |
| `src/engine/materials.js` | `pbr(id)` / `maps(id)` / `tex()` for the CC0 sets in `public/assets/tex/<id>/` (diff, nor, arm) |
| `src/engine/master.js` | Master materials (same-shape graphs share one build), the homestead light set (`docs/materials.md`) |
| `src/world/terrain.js` | Pure height/forest/splat functions: the alaas hollow, lake, homestead pads |
| `src/world/ground.js` | Warped ground grid (~1.5 m cells at the homestead → ~40 m at the horizon) + splat material |
| `src/load/*` | Loading: shader streaming behind the title, load-time workers (`docs/loading.md`) |
| `src/world/layout.js` | Placements of every model (single source of truth), start spot |
| `src/world/world.js` | Builds terrain, models (`src/models/*.js`), nature (`src/nature/*.js`); colliders, floors, interactables, updaters |
| `src/models/*.js` | One module per placed thing (contract: `docs/models.md`) |
| `src/nature/*.js` | `default (ctx, world)`, auto-loaded after the models: `forest.js` + `trees/` (procedural larch/birch/pine taiga: generator, wind/LOD-dither materials, baked impostors, canopy band, deadwood; textures from `tools/gen-forest-tex.mjs`; `?trees`, `?noforest`), `grass.js` (blade grass, flowers, shore plants; `natureField`/`natureWind` shared fields), `lake.js` (planar-reflection water), `life.js` + `life/` (birds, insects/leaves, midges/fluff/dust motes, lake ripples/striders: 4 draws, GPU- or CPU-steered, follow `natureWind`; debug `world.life`) |
| `src/audio/audio.js` | `AudioScape`: ambience beds, 3D one-shots, footsteps, named action sounds |
| `src/ui/ui.js` · `src/ui/i18n.js` | Prompt, explainer card (+ reference-image gallery from optional `src/data/images.json`), journal, toasts, title loading bar · interface strings and the controls list; Sakha/English/Russian (L cycles) |
| `index.html` · `public/assets/ui/` | All interface styles (Vista/Live-Messenger Aero look: `.glass` frame + light `.client`, glossy `.btn`) · self-hosted Open Sans + Noto Serif (`fonts.css`) |
| `src/data/entries.json` | Explainer entries (Sakha + English) with sources and confidence |
| `src/player.js` · `src/input.js` | Body: momentum walk/run (Shift)/crouch (C), jump (Space) with gather + landing spring, vault over 0.3–1.3 m obstacles (rays onto the contact collider's midline), wall sliding, footfall-synced bob/sway/roll, strafe lean, run FOV kick · keys/mouse, or touch (`active` = locked or touch live) |
| `src/util.js` | Shared helpers: seeded random (`mulberry32`, `hash2`), value noise/`fbm`, `clamp`/`lerp`/`smooth`/`ease`/`damp`, yaw vectors, `urlFlag` (debug query switches) |
| `src/ui/touch.js` | Phone controls (auto on coarse pointers; `?touch` / `?notouch`): floating stick (rim = run), right-side drag look (tap = E), glass buttons E/jump/crouch/journal/language/pause, 1·2·3 while an act runs; `tc-` scoped CSS |

- North is −Z, east +X; models face east (+X) locally — Sakha doors face east.
- Player settings (`player.settings`, saved in `alaas-v1` settings): `sens`, `invertY`, `fov` (base; run adds ≤7.5°), `motion` 0–1 (camera motion comfort: bob, sway, roll, FOV kick; 0 = steady), `smooth` 0–1 (mouse-look smoothing). `main.js` binds `#s-motion` / `#s-smooth` sliders if present.
- Player yaw 0 looks −Z; `util.js` has `fwd*/right*/yawTo`.
- Ground height: `world.groundAt()` (knows floors), not `terrain.height()`.
- Camera layer 1 = near grass, grass ring, flowers, near trees: the lake reflection and the shadow cascades skip it. Layer 2 = shadow proxies, 30 = culled (merge.js); the loader's collect pass (camera on all layers) builds both.
## Performance rules
- Device tiers (`src/engine/tier.js`): `high` (GTAO pre-pass) · `medium` (one scene pass, colour+velocity MRT) · `low` (0.75 px ratio, 1024 shadows, 1k textures) · `mobile` (1.25 px ratio, 1024 shadows, 1k textures, sparser ground/forest). Settings "Auto" (default) detects: touch device → mobile; no WebGPU, <6 cores, <4 GB or pre-Xe Intel → low; else medium (never high). Change needs a reload.
- Read the tier from `engine.tier` (`high|medium|low|mobile`) or `TIER` (`tier.js`, set before the world builds): `grassDensity` (1 / 1 / 0.6 / 0.45), `forest` (ring-radius scale), `ground` (grid verts), `texMax`. `engine.opts.quality` stays `high|medium|low` (mobile → `low`).
- Textures (`materials.js` `tex()`) load as ImageBitmaps off the main thread, pre-flipped (`flipY = false`), scaled down to `TIER.texMax`; the ground's splat sets are packed in a worker.
- Frame pacing (`Game.tick` → `Engine.pace`): a steady 60 everywhere (title, menus, cards, idle); 30 with the battery saver (default on phones, and where the Battery Status API reports ≤20% unplugged; Safari: the setting). `pace` counts display refreshes (median rAF delta) and draws every n-th: 120 Hz → every 2nd; refresh rates 60 doesn't divide run at their own rate (or 72 at 144 Hz). `frame(now)` steps time by the rAF timestamp. No frames once the pause menu has settled.
- Dynamic resolution: `Engine.dynamicResolution` lowers the pixel ratio (down to 55%) when frames run ≥12% over the paced interval (a few missed refreshes per 1.5 s), gives 5% back while all keep it (not above a scale that failed in the last 30 s).
- `node tools/bench.mjs [chrome|webkit|phone] [query]` — uncapped CPU ms, fps, calls, triangles at five views (`PORT`). `node tools/hitch.mjs …` — 1.2 km walk with mouse look through every area at real pacing: frame-interval p50/p95/p99/max, hitches, pipelines compiled after the fade (`UNCAPPED=1`).
- Lake mirror: model parts whose reflected sight line misses the water, or under ~3 reflection px, are hidden for that pass (`lake.js`).
- Never add/remove lights or toggle `light.visible` at runtime — the light set is part of every material's shader, so it recompiles everything (multi-second freeze). Animate `intensity` instead.
- Light sets (`world.js`, `src/engine/master.js`): nature gets `lights([sun])`; every model the homestead set (sun + two local lights read from each material: its own model's fires), so no fire shines through other walls and builds don't split by set (`docs/materials.md`).
- Grass blades transmit backlight (`LeafLighting` in `grass.js`): looking towards the sun the sward glows instead of going dark. Paths are trodden sward (sparse 3–10 cm blades) over pale dusty earth (`ground.js`, yardlife decals).
- A material that builds its vertices in `positionNode` must also `positionPrevious.assign(<built position>)`, or TRAA gets wrong velocity, drops its history and the mesh aliases/shimmers (grass, trees, impostors and life layers do).
- Grass blades never go under ~1.3–1.6 px wide (`natureWind.px`): far blades widen and thin out by the same factor; shading (normals, AO, colour variance) flattens with distance; `BladeMaterial` has weak specular and no grazing Fresnel. Phones/`low` tier (`engine.tier` or the quality preset) draw half the near blades.
- Every shader is built while loading, in time slices behind a live view of the world, and `Game.warmUp()` collects what is out of view; nothing compiles after "click to walk" (`docs/loading.md`).
- Look-at raycast runs every 3rd frame and only against targets whose bounds are within reach.
- Texture limit: 16 sampled textures per shader stage on WebGPU — the ground splat shares maps carefully.
## UI API (`game.ui`)
- `showEntry(id, { mode: 'peek'|'full' })` — side-panel card, never locks the player; `close()`; `open` = `'card'|'journal'|null`, `isOpen`, `mode`, `current`.
- `scroll(dy)`; the wheel (pointer locked) and PageUp/PageDown scroll the open card; `[` `]` step its gallery; click the image to enlarge.
- `toast(html, ms)` — Messenger-style pop-up, body = `<small>` + `<b>`; `discovered(id)`; `setPrompt(label, action)`.
- Title bar progress is read from `#go`'s text (`N%` build → `… N%` warm-up); `#title.ready` once `game.ready`.
- Settings ids → `save.settings`: `s-motion` `motion`, `s-smooth` `smooth`, `s-battery` `batterySaver`, `s-q` `quality` (auto/high/medium/low/mobile).
