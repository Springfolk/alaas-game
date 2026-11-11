# Smoothness

Targets: desktop 60 fps, phones 30. Order of priorities: no late frame, then a shorter frame and a shorter way from input to picture. Never a higher average at the cost of a steady frame.

## Measuring
| What | Command |
|---|---|
| Late frames, intervals, JS and GPU time per area × stand/walk/run/turn | `npm run smooth -- chrome\|webkit\|phone\|lite [query]` (`THROTTLE=4`, `SIZE=1728x1117@2`) |
| The same in the iOS Simulator or on a phone | `SIM=1 BASE=… node tools/iphone.mjs smooth` |
| What a frame costs in every direction, and on what | `COST=1 [WHY=n] npm run smooth -- …` |
| Look latency | `LAT=1 npm run smooth -- chrome\|phone` |
| Pacing and quality logic on modelled devices | `node tools/pace-sim.mjs` |
| A 1.2 km walk through everything | `npm run hitch -- …` |

Late = a drawn frame that came a display refresh late or more. Headless Chrome and the Simulator run on the Mac's GPU: they show CPU-side dips, pacing faults and latency truly, GPU cost only relatively. Timings drift over hours: compare in alternating runs.

## Causes found and what was done (2026-11-11)
| # | Cause | Effect | Fix |
|---|---|---|---|
| 1 | Chrome compiles its own 2D and compositor shaders at the first paint of each kind of interface surface, in the GPU process the game's frames queue behind | 3–6 frames 80–250 ms late (phone emulation: 420) at the first prompt, toast, card, pause menu, good swing, touch controls: "the first step into the urasa stutters" | `src/ui/prewarm.js` draws every surface in every state while loading, under the key art |
| 2 | Dynamic resolution judged by the average frame interval, probed +10% every 8 s | GPU 2% over: no late frame seen, 3–4 frames queued (+60 ms input to picture); hunting 63–83% with 3–13 late frames a second half the time | `src/engine/pacing.js`: quality follows late frames, the GPU's measured time and its queue; no probing while the rate holds with little to spare |
| 3 | Smoke: 110 blended puffs with three procedural noises each | 13–66 ms a frame downwind of the smudge fire (medium, 2592×1675, M3 Max) | noise from a baked texture; puffs around the eye not drawn: 12–15 ms |
| 4 | Cut-out plaster shaded behind the log wall | half the frame inside a balagan: 15.0 ms | cut-outs draw after opaque: 5.5 ms |
| 5 | three re-uploaded every dynamic attribute and instance matrix each frame | 2.1 MB of buffer writes a frame, ~1 ms of JS | uploads on change only: 37 kB |
| 6 | Look-at ray tested every triangle of big targets | 1.6–3 ms every third frame beside the ampaar, pen, sacred birch, serge | grid per mesh: < 0.1 ms |
| 7 | CPU-bound: resolution lowered first (no help), then 60 ↔ 30 on a timer | 42 late frames in 40 s with the CPU ×4 | JS-bound goes to a steady slower beat, back only when the JS fits |
| 8 | Pacer counted refreshes from the low quartile of rAF deltas | off the beat with timestamp jitter or on a slow device | beat on the display's clock from the last drawn frame |
| 9 | Touch look always smoothed | view trailed a drag ~10 ms at 30 fps | smoothing lets go on faster drags |
| 10 | Safari's WebGL2 waits ~5 ms in a GL fence | (would have cost that with fix 2) | no GPU timing where the fence is slow |
| 11 | Interface states new with the actions rework: the prompt's E chip (gradient, shadows, rounded border) at the pill's end, and the dot animating between dot and ring | a frame 67–200 ms late shortly after a prompt or dot change, in a quarter to three quarters of loads on `?auto` (none seen on the player's load path); found one cell at a time against the build before (`balagan turn`: 0 of 12 loads) | the chip is flat and borderless, the prompt does not fade, the dot's states switch at once: 0 of 16 loads |
| 12 | A model gained a mesh and the impostor atlas was not rebaked: its key no longer matched, so the atlas was baked at load, into play | 44–108 shaders built on a walk, in some runs only | `npm run bake-impostors` after any model change; `walkcheck` names an unnamed mesh's parents |

- Always-on blur removed with the UI rethink (2026-11-11): the prompt pill, the controls list, the F3 meter and every touch button and the stick had a backdrop blur; none has one now. The inspect stage and the journal add no blur, target or shader (`docs/ui.md`): 0 late frames, 0 builds while inspecting near, far and from the journal (medium, phone tier, the player's load path).

## Before → after
Headless on a MacBook Pro M3 Max, production builds, before and after in alternating runs: 18 areas × stand/walk/run/turn, 2 s each (`x4` = CPU ×4, `retina` = 1728×1117 at 2×, `gl` = WebGL2, `wk` = Playwright WebKit).

| tier | late frames | interval p99 / max, ms | frame JS p50, ms | lowest resolution |
|---|---|---|---|---|
| high | 17 → 9 | 1099.9 / 1099.9 → 400 / 400 | 6.5 → 5.7 | 100% → 100% |
| high-retina | 493 → 19 | 533.3 / 533.3 → 1483.3 / 1483.3 | 7 → 5.3 | 50% → 56% |
| medium | 7 → 0 | 33.4 / 33.4 → 16.8 / 16.8 | 4.7 → 3.9 | 100% → 100% |
| medium-retina | 46 → 0 | 33.4 / 83.3 → 16.8 / 16.8 | 4.9 → 4.4 | 92% → 88% |
| medium-x4 | 388 → 10 | 33.5 / 33.5 → 33.5 / 50 | 15.3 → 12.6 | 70% → 70% |
| low | 0 → 0 | 16.8 / 16.8 → 16.8 / 16.8 | 3.7 → 3.9 | 100% → 100% |
| low-x4 | 29 → 5 | 33.4 / 33.4 → 33.5 / 33.5 | 10.9 → 9.6 | 100% → 67% |
| phone | 1 → 0 | 100.1 / 100.1 → 33.5 / 33.5 | 3.1 → 2.9 | 97% → 84% |
| phone-x4 | 1 → 0 | 100 / 100 → 33.5 / 33.5 | 6 → 5.8 | 87% → 84% |
| lite | 0 → 0 | 33.5 / 33.5 → 33.5 / 33.5 | 4.2 → 3.2 | 87% → 84% |
| lite-x4 | 2 → 0 | 100 / 100 → 33.5 / 33.5 | 5.5 → 5.6 | 87% → 84% |
| medium-gl | 161 → 95 | 100 / 100 → 50.1 / 50.1 | 5.8 → 5.7 | 76% → 70% |
| low-gl | 1 → 0 | 16.8 / 83.4 → 16.8 / 16.8 | 4.9 → 4.8 | 100% → 100% |
| phone-gl | 0 → 0 | 33.5 / 33.5 → 33.5 / 33.5 | 5 → 4 | 97% → 98% |
| lite-gl | 0 → 0 | 33.5 / 33.5 → 33.5 / 33.5 | 4.9 → 3.9 | 87% → 84% |
| wk-high | 21 → 30 | 577 / 577 → 385 / 385 | 7 → 6 | 68% → 69% |
| wk-medium | 9 → 4 | 30 / 39 → 25 / 33 | 5 → 4 | 100% → 100% |
| wk-low | 9 → 5 | 30 / 33 → 24 / 33 | 4 → 4 | 100% → 100% |
| wk-mobile | 2 → 1 | 40 / 40 → 42 / 42 | 6 → 6 | 67% → 91% |

- iOS Simulator (iPhone 17, iOS 26.5, Mobile Safari, phone tier on WebGL2): late frames 314 of 6002 → 69 of 5432, worst interval 73 → 46 ms, resolution 67–89% → 100%.
- Job playthroughs (mowing, splitting, forge, bark vessel, kymys, fish trap; medium, the player's load path): 4–5 frames 100–133 ms late each → 0.
- Look latency: touch view trail 9.7 → 0 ms; GPU made the limit (high at 5120×2880): GPU done 18 ms median / 80 ms p95 after the JS → 10–17 / 17–33 ms.
- Left: `high` and WebKit `high` still show a rare 150–1500 ms stall (also before; one JS long task in the first cell, GPU stalls at the shore: cause not found); `medium` on WebGL2 at 1440×900 is GPU-bound on this Mac and keeps single 33 ms frames at its resolution floor; `x4` tiers settle on a slower beat with a few late frames while they step down.

## Not measurable here
A real phone's GPU, 120 Hz displays (simulated in `pace-sim`), iOS Safari on WebGPU (the Simulator has none), what Chrome's shader cache spares a returning player (headless always starts with a fresh profile).
