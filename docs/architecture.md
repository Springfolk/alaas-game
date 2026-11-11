# Architecture

| Path | Role |
|---|---|
| `src/main.js` | `Game`: boot, title, frame loop, focus (raycast ≤3.4 m, else a zone), do → act, put down, E → inspect (`docs/interactions.md`), save |
| `src/input.js` · `src/player.js` | keys, mouse, touch (`active` = locked or touch live) · body: walk 10:00 / run 5:30 min/km, crouch, jump, vault over 0.3–1.3 m, wall sliding, footfall-synced bob/sway/roll, run FOV kick |
| `src/util.js` | seeded random (`mulberry32`, `hash2`), value noise/`fbm`, `clamp`/`lerp`/`smooth`/`ease`/`damp`, yaw vectors, `urlFlag` |
| `src/engine/engine.js` | `Engine`: WebGPURenderer, `SunLight` cascades with cloud shadows (512² `cloudMap`, re-rendered 4×/s or on a texel move), sun by air mass, PMREM sky light, aerial haze (`scene.fogNode`), metered eye adaptation |
| `src/engine/sky.js` | Perez/Preetham clear sky (turbidity 1.9), cumulus at 1.8 km (`cloudField`, also the cloud shadows), `updateSky` haze colours |
| `src/engine/tier.js` · `pacing.js` | tiers, boot guard (`docs/performance.md`) · frame pacing, dynamic quality (`docs/smoothness.md`) |
| `src/engine/merge.js` · `lod.js` | after the homestead (`?nomerge` off): a depth-only shadow proxy per model (layer 2); impostors per cluster (8 azimuths, one instanced draw, also in the lake mirror); parts under ~2.5 px → layer 30 |
| `src/engine/post.js` | [GTAO, high] → TRAA (phones: FXAA at the end) → sharpen → glare → AgX look → vignette, grain; 64×36 luminance meter every 0.15 s |
| `src/engine/interiors.js` | sky occlusion inside urasa, balagan (+ khoton), ampaar, from `layout.js` placements |
| `src/engine/materials.js` · `master.js` · `leanenv.js` | `pbr(id)`/`maps(id)`/`tex()` for `public/assets/tex/<id>/` (diff, nor, arm) · master materials, homestead light set (`docs/materials.md`) · low/mobile sky light |
| `src/world/terrain.js` · `ground.js` | pure height/forest/splat functions (hollow, lake, homestead pads) · warped ground grid (4×4 tiles) + splat material |
| `src/world/layout.js` · `world.js` | every placement, the start spot · builds terrain, models, nature; colliders, floors, interactables, updaters |
| `src/models/*.js` | one module per placed thing (`docs/models.md`) |
| `src/nature/*.js` | after the models: `forest.js` + `trees/` (larch/birch/pine, impostors, canopy, deadwood; `?trees`, `?noforest`), `grass.js` (blades, flowers, shore plants; `natureField`/`natureWind`), `lake.js` (planar mirror), `life.js` + `life/` (birds, insects, motes, lake ripples: 4 draws) |
| `src/load/*` | loading (`docs/loading.md`) |
| `src/interact/*` | carrying, sitting, berries, rites; `work/` jobs (`docs/interactions.md`, `docs/actions.md`) |
| `src/ui/*` | stage, prompt, card, journal, toasts, title, cursor, finder, phone controls, prewarm; `i18n.js` strings and controls list (`docs/ui.md`) |
| `src/audio/audio.js` | `AudioScape` (`docs/audio.md`) |
| `index.html` · `public/assets/ui/` | all interface styles · key art, logo, self-hosted Open Sans + Noto Serif (`fonts.css`), journal pictures |
| `src/data/` | `entries`, `hints`, `images` (`docs/content.md`) · `views`, `journal` (`docs/ui.md`) · `tex-sizes` |

## Conventions
- North −Z, east +X; models face east (+X) locally (Sakha doors face east). Player yaw 0 looks −Z (`util.js` `fwd*`, `right*`, `yawTo`).
- Ground height: `world.groundAt()` (knows floors), not `terrain.height()`.
- Camera layers: 1 = near grass, flowers, near trees, life (the lake mirror and the shadow cascades skip it); 2 = shadow proxies; 30 = culled. The loader's `collect()` builds all of them.
- Eye adaptation (`Engine.update`): `closeLook` = full adaptation up to 24×; `adaptFast` (s) = at once; both set by the stage. During `closeLook` inside the balagan its door fill light moves beside the eye (`balagan.js` `update`).
- Player settings (`save.settings`): `sens`, `invertY`, `fov` (run adds ≤7.5°), `motion` 0–1 (bob, sway, roll, FOV kick; 0 = steady), `smooth` 0–1 (mouse look; touch always 0.3, let go on faster drags).
- The grass mask is writable in play: `world._field.mask.mow(minX, minZ, maxX, maxZ, inside)`, `mask.tall(x, z)`; blades and ground read it every frame.
- Grass blades stay ≥ ~1.3–1.6 px wide (`natureWind.px`): far blades widen and thin out; meadow blades are lit two-sided towards the sun; flowers and shore plants transmit backlight (`LeafLighting`).
- Frame step: dt ≤ 0.25 s; the player steps ≤ 1/30 s (`Game.stepPlayer`), look input once.
