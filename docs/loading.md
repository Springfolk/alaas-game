# Loading

Order (`Game.boot` → `World.build`): engine → loading view (sky; the fade clears ~0.25 s; the model code waits for that frame) → ground (worker) ∥ homestead (staged, added at once) → forest → meadow, lake, life (they need the ground mesh, `world.ground`, not its textures; the ground joins the scene once its textures are in) → `Game.warmUp`: `collect()` rounds until nothing new, every shader and pipeline built, then frames until two come at a normal pace (the GPU through its compiles) → **ready** ("click to walk"; `game.complete` too). Nothing compiles in play.

**Key art** (`index.html` `#keyart`): the game's own render (inline ~0.3 kB placeholder, then AVIF/WebP preloaded, shown ~50–150 ms after navigation, before any JS; slow CSS drift) covers the world until **ready** — the live world is never seen half-built. Under it the loading view renders at half resolution (¼ pixels: the frames only feed the stream), one frame when a stage joins the scene (else every 0.5 s), and the stream builds whole shaders in 40 ms slices (`sync`: no yields inside a build); `warmUp` restores full resolution before its pacing frames. At ready it cross-fades (1.4 s) to the start view, then "click to walk". `?auto` hides it (no fade, full-resolution loading). Phone portrait (≤ 4:5) gets its own framing.

| Piece | Role |
|---|---|
| `src/load/stream.js` | `ShaderStream`: loading-view renders draw what is built and queue the rest; queued shaders build via three's `buildAsync` in ≤12 ms slices: what a load step awaits (`prepare()`) → what the view missed → nearest first. Pipelines are created async (compiled on the GPU process's worker threads; a synchronous one blocks its main thread 5–300 ms). `collect()`: every mesh shown, unculled, off-layer ones on layer 0, drawn for one loading frame (a pipeline made without a draw stalls later). Drops the index flag from three's shader key. Polyfills `scheduler.yield` (Safari). three r186 internals: recheck on upgrade. |
| `src/load/shadows.js` | Opaque materials share one sun-shadow shader (three otherwise builds one per material from its colour's alpha). |
| `src/load/pmrem.js` | Scene environment light (`scene.environmentNode`): three's PMREM lookup with the cube-UV maths in native WGSL — same pixels, cheaper builds. |
| `src/load/atlas.js` · `tools/bake-impostors.mjs` | Impostor atlases (homestead, forest) baked offline to `public/assets/impostors/` (+ `meta.json` keys); phones decode them scaled to `TIER.atlasMax` in a worker; loaded when the key matches, else baked at load with a console warning. **Rerun `npm run bake-impostors` (dev server, `cwebp`) after changing a model, a tree or a bake.** |
| `src/load/workers.js` · `worker.js` | Pool of ≤6 module workers (≤3 on coarse-pointer or ≤4 GB devices), one queue (texture images last); ≤2 download jobs (`bitmap`, `geo`, `pack`) per worker, generation jobs never wait for a download slot (a slow link once left the grass field empty: blades at y 0): jobs `ground` (terrain samples), `pack`, `field`, `mask`, `scatter`, `geo` (fetch + inflate a pack), `bitmap` (a texture image, `src/load/bitmap.js`: Safari decodes `createImageBitmap` on the calling thread, ~20 ms/Mpx — 2 s of its main thread for the ~175 Mpx of textures); main-thread fallback; closed at ready. |
| `src/load/prof.js` · `tools/loadtrace.mjs` | `?prof`: main-thread time by bucket (node builds, renders, buffers, texture upload…), off-thread spans (jobs, pipelines), timeline events; the tool adds a busy probe per stage and Chrome's CPU profile. |
| `src/load/geocache.js` · `geocodec.js` · `tools/bake-geometry.mjs` | Baked geometry in `public/assets/geo/` (deflated packs + `manifest.json`): model `section()`s and bucket merges (`docs/models.md`) and the ground's terrain samples (the requested tier only). Vertex data quantised (positions 16-bit in bounds, normals 8-bit octahedral, uvs 14, colours 8, other 12; ground heights 4 mm, normals 1/256), delta + zigzag + byte planes, then deflate; colliders and plain data exact. Packs fetch and decode in a worker from module start. Not shipped (worker jobs, or too little main-thread time per MB): forest variants, field, mask, scatter. Used when the source key (`tools/geo-keys.mjs`, put in the page by `vite.config.js`) and inputs (placement, pads, job args) match, else generated with a warning; a pack out of step with the run reruns that build live. `?nogeo` = generate (A/B), `?bakegeo` = record. **Rerun `npm run bake-geometry` (dev server) after changing a model, a generator, the terrain or the layout**; build and dev server warn when stale. The tool checks baked vs generated (scene graph, geometry means within quantisation, colliders, interactables). |
| `src/world/ground-data.js` · `src/nature/grass/field.js` · `src/nature/trees/scatter.js` | The pure data code the jobs run. |
| `tools/key-art.mjs` | Renders the key art (`?auto&keyart&cam=x,y,z,yaw°,pitch°,fov°`, the game's own sun so the cross-fade matches) at 2× the output size, after `complete`, `texturesLoaded()` and ≥150 frames / 5 s (TRAA, exposure); retries a shot a dev-server reload broke. Encodes `public/assets/ui/keyart-{1920,960,phone}.{avif,webp}` + the inline placeholder (`npm run key-art`; dev server, `cwebp`, `avifenc`, `ffmpeg`). **Rerun after a visible change to the homestead, the lake shore, the light or the sun.** |
| `?keyart` (`KEYART`, `src/util.js`) | Full-quality still, never for play (~160 ms/frame, ~260 M triangles): high tier with 4096 shadows to 900 m, full-res mirror, no dynamic resolution; no model impostors or size culling (`merge.js`); every tree lod0, frustum-filtered (`forest.js`), deadwood to 2 km; mid grass to 700 m, flowers to 250 m (`grass.js`). |
| `tools/bake-canvas-tex.mjs` | Bakes the yard's painted sets (`yardlife/textures.js`) to `public/assets/tex/canvas_*`; rerun after changing a painter. |

## Rules
- Only the homestead stage may add lights (≤2 point lights per model: the homestead light set, `docs/materials.md`).
- `stream.js` builds each shader with the scene lights captured when it was queued: outside a render three leaves a scene's `LightsNode` stale (wave 4 regression: balagan unlit by its fire, paths and props darker).
- three keys a shader build by node identity: `shareGraphs` (`src/engine/master.js`) makes same-shape materials share one graph before they join the scene; write factories so they can (`docs/materials.md`).
- Await `world.breathe()` between load steps and `world.prewarm(scene, cam, target)` before an offscreen bake render.
- Anything added to the scene before `warmUp` is built before play; adding a material later compiles in play.
- No WebGPU validation errors: three's async pipeline creation marks a pipeline failed (never drawn) on any error caught in its scope.
- Pure-CPU load work over ~50 ms goes to a worker job or a bake tool; dense per-vertex terrain lookups use `terrain.heightFast`.
- Checks: `loadprof` (first pixel, playable, stalls before and 2.5 s after; `THROTTLE=4` = CPU ×4), `walkcheck` (0/0; `EARLY=1` from ready: no frame >50 ms), `shot` waits for complete.

## Measured (Mac M3 Max, `tools/loadtrace.mjs` + alternating `loadprof` runs vs HEAD 24d1de3; 2026-10-25)
Main-thread time from navigation to ready, dev server (s). Before → after.

| | WebKit | Chrome |
|---|---|---|
| playable, dev (median of 6) | 6.65 → 4.01 | 2.94 → 2.58 |
| playable, production build | 6.43 → 3.89 | 2.89 → 2.52 (CPU ×4: 10.7 → 9.3) |
| node builds (~185 shaders, ~10 / ~6 ms each) | 1.85 → 1.87 | 1.23 → 1.18 |
| other JS: model/nature code, module eval, GC; WebKit: image decode | 2.24 → 0.93 | 0.80 → 0.82 |
| loading-frame renders | 0.31 → 0.15 | 0.21 → 0.17 |
| GPU buffers + bind groups | 0.36 → 0.33 | 0.12 → 0.11 |
| texture upload + mips | 0.25 → 0.26 | 0.14 → 0.14 |
| idle (ground textures, frame-paced waits, timer hops) | 1.47 → 0.37 | 0.53 → 0.31 |

Floor now: shader builds are half of WebKit's load and ~45% of Chrome's; module loading is 0.1–0.2 s (dev) and the warm-up rounds ~0.3 s. Tried, no gain: collecting every stage at once (+0.4 s), an early `AudioContext` (Chrome's first one blocks ~150 ms wherever it goes). Earlier steps: baked geometry (homestead 1.1 → 0.67 s WebKit), master materials (builds 277 → ~186), worker jobs, impostor bakes offline.
