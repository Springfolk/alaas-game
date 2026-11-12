# Performance

## Hard rules
- Nothing compiles in play: every shader and pipeline is built before "click to walk" (`docs/loading.md`); `npm run walkcheck` prints 0 shaders, 0 pipelines.
- Never add or remove lights or toggle `light.visible` at runtime: the light set is in every shader (multi-second freeze). Animate `intensity`.
- Light sets (`world.js`): nature `lights([sun])`; every model the homestead set (sun + two local lights from its own fires, `docs/materials.md`).
- A material that builds vertices in `positionNode` also does `positionPrevious.assign(<built position>)`, else TRAA loses its history and the mesh shimmers.
- Attributes upload only when marked (`Engine.init`, three r186 internals: recheck on upgrade; `?reupload` = three's own): an attribute rewritten in play is `DynamicDrawUsage` and gets `needsUpdate` after each write.
- Instance matrices live in instanced vertex buffers; world matrices update once a frame (`Engine.render`), not per pass.
- ≤16 sampled textures per shader stage (WebGPU); the ground splat shares maps.
- Cut-out (`alphaTest`) homestead meshes draw after opaque ones: `world.js` gives them `renderOrder` 1 when unset, so leave it unset.
- A part that moves or hides after load: `userData.dynamic` (else it is merged; the merge watchdog warns).
- Objects not dynamic at the end of the load keep their local matrix (`merge.js`, `?nofreeze` off); one whose position, quaternion, scale or parent changes thaws before that frame's matrices. Write transforms through those, not `matrix`.
- Look-at raycast: every 3rd frame, only targets within reach; meshes over 1500 triangles test a 16³ grid (`src/interact/raycast.js`).
- Pure-CPU load work over ~50 ms: a worker job or a bake tool (`docs/loading.md`).
- Interface: every surface, state and paint style is drawn in `src/ui/prewarm.js`; no own layer (`will-change`) inside a rounded clip; no always-on backdrop blur.

## Tiers (`src/engine/tier.js`)
| Tier | Pixel ratio (dynamic floor) | Sun shadows | Textures | Also |
|---|---|---|---|---|
| `high` | ≤2 (1) | 2048, 150 m | 4096 | GTAO pre-pass; never picked by Auto |
| `medium` | ≤1.5 (0.7) | 2048, 110 m, watched | 2048 | one scene pass (colour + velocity) |
| `low` | 0.75 (0.5) | 1024, 70 m, watched | 1024 | no lake mirror, `leanEnv`, no glare, grass 0.6 |
| `mobile` | native, starts at 67% (67%) | 1024, 55 m, lazy | 512 | FXAA instead of TRAA, anisotropy ≤4, atlases 1024, ≤4 pipeline compiles in flight, `release`, grass 0.45, ground grid 320 |
| `mobile` + `LITE` | as mobile | 512, 45 m | 256 | atlases 512, ≤2 compiles, grass 0.3 |

- Auto (default): phone or tablet → `mobile`, + `LITE` at ≤3 GB or <4 cores; no WebGPU, <6 cores, <4 GB, pre-Xe Intel or `maxTextureDimension2D` < 8192 → `low`; else `medium`. A change needs a reload. Custom: a preset with the player's video options on top (`src/engine/video.js`, `docs/ui.md`).
- No tier renders under half the screen's own resolution (`MIN_RES`).
- WebGPU wherever the browser gives an adapter, phones too; WebGL2 only with `?webgl`, without an adapter, or after 3 GPU losses within 2 min in the tab.
- Read the tier from `engine.tier` or `TIER` (set before the world builds: `grassDensity`, `forest`, `ground`, `texMax`, `lite` …); `engine.opts.quality` is `high|medium|low` (mobile → `low`).
- Lazy shadows (phones; high as a dynamic-quality knob before the slower beat): the sun's maps re-render on a 1.5 m move or 8° turn (≤8/s), else every 2 s; the warm-up forces them each round; `?nolazy` off.
- Watched shadows (medium, low): the maps re-render on any move or turn of the view or when a caster's world matrix, vertices, visibility, `castShadow` or layers change, else every 2 s; the lazy-shadow knob there caps them at 8/s, a view come to rest at once.
- Model impostors from max(110 m, 6× size); phones max(45 m, 3× size), the homestead atlas at full size.
- Phones (`mobile` tier or `isPhone()`, any preset or setting): 30 fps; the battery saver and frame-rate options are hidden there.
- Battery saver (30 fps, desktops): default on a battery ≤20% unplugged (Battery Status API); the setting overrides.

## Phone memory
- iOS kills a tab past ~1–1.5 GB: memory is decided at boot (tier, `LITE`) and cannot be handed back.
- `TIER.release` closes each texture image once uploaded (WebKit keeps ImageBitmaps as IOSurfaces); ≤3 load workers on coarse-pointer or ≤4 GB devices.
- Indices go up 16-bit under 65536 vertices (`Engine.init`, three r186 internals: its WebGPU upload widens them; `?wideindex` off).
- Every tier: `src/load/release.js` drops the JS copy of uploaded vertex data after the build and after the warm-up (`?keepgeo` off); raycast meshes keep positions + index; dev warns on a freed array.
- `src/load/stream.js` empties each three `NodeBuilder` once its state is taken (`?keepbuilders` off).

## Boot guard and GPU loss (`tier.js`)
- A load marks `localStorage['alaas-boot5']` until ready or `pagehide` (unmarked while hidden). An unfinished mark under 10 min old, or "failed to start", steps Auto down to mobile + `LITE` / `low` (never to WebGL2).
- A load that finished at the step-down tries the full tier next: phones at most once a day, desktops at once. A phone that reports no memory (Safari) starts at the step-down. Choosing a quality resets it.
- A lost GPU device (also Safari's broken one: the first `createCommandEncoder` throw, or 5 thrown frames within 3 s) → `restoreLost`: a reload once the page is visible, same tier and backend, at the player's spot (`resumeSpot`).
- A load error on a broken device (`Engine.deviceBroken`: a new buffer maps 0 bytes) counts as a loss, not a failed start. `pagehide` (not into the back-forward cache) destroys the device.

## Cuts by tier
- `low`/`mobile`: the water samples the sky PMREM along the reflected ray (a dark horizon band for the treeline); sky light from two 64×32 panoramas baked on each `setSun` (`leanenv.js`, `?fullenv` off); ground normals from one tiling scale.
- `mobile`: no mid grass ring, near blades and flowers ~half (`grass.js` `phone`); splat sets sampled only where shown (`ground.js` `lean`); model noise two octaves fewer (`tier.js` `octaves`); smoke 45% of the puffs (`yardlife/smoke.js`); forest thinned (`forest.js` `thin`).
- Every tier: the lake mirror hides parts whose reflected sight line misses the water or under ~3 reflection px; forest near/mid lists keep trees in the view cone, within 12 m or casting into it (refilled on a turn past ~11°); full trees to 34 m × `TIER.forest`; far grass chunks draw a coarser index (`userData.lite`); shadow proxies simplified in a worker (meshoptimizer, 1.5 cm, only the vertices still used are uploaded; `?fullshadow` exact); smoke noise from a baked texture, no puff drawn around the eye.
