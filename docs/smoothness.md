# Smoothness

Targets: desktop 60 fps, phones 30. Priorities in order: no late frame, then a shorter frame and input-to-picture time. Never a higher average at the cost of a steady frame.

## Pacing and dynamic quality (`src/engine/pacing.js`)
- `Game.tick` → `Engine.pace`: a steady 60 everywhere (title, menus, cards, idle), 30 with the battery saver; no frames once the pause menu has settled. `frame(now)` steps time by the rAF timestamp.
- `pace` draws every n-th display refresh (120 Hz: every 2nd; 75/90 Hz every one, 144 Hz every 2nd), counted on the display's clock from the last drawn frame (interval from 31 rAF deltas): jitter and late callbacks do not shift the beat.
- `pace` holds a frame back while the GPU still has three (Chrome queues 3–4 before it slows rAF).
- `govern` (every ~0.5 s of frames) reads late frames, the frame's JS time and when the GPU finished each frame (`Engine.frameDone`: WebGPU queue promise, WebGL2 fence). Where the first 30 fences cost over 1 ms each (Safari's WebGL2) it uses late frames alone.
- Over (late frames, or the GPU behind): 5–20% fewer pixels a step, down to the tier's floor. At the floor, or when the JS alone is the limit, `KNOBS` one at a time: shadow range ×0.7 → lake mirror ×0.6 → a slower beat (60 → 30; 120 Hz 60 → 40 → 30; phones 30 → 20). No knob builds a shader.
- Room (no late frame, a quarter of frames done by the GPU within 0.8 of the interval, JS under 0.6): 4–8% more pixels; a slower beat comes back first, only when the faster one is measured to fit. A rate held with little to spare is not probed.
- F3 shows `res` (% of native), the knobs on and the GPU's ms.

## Measuring
| What | Command |
|---|---|
| Late frames, intervals, JS and GPU time, 18 areas × stand/walk/run/turn | `npm run smooth -- chrome\|webkit\|phone\|lite [query]` |
| The same in the iOS Simulator | `SIM=1 BASE=… node tools/iphone.mjs smooth "<query>" [areas] [moves]` |
| Uncapped ms per frame at every area in 12 directions (`RES=1` full resolution; `WHY=n` what the n worst spend it on) | `COST=1 npm run smooth -- …` |
| Look latency: event age, how far the view trails the aim | `LAT=1 npm run smooth -- chrome\|phone` |
| 1.2 km walk through every area: interval p50/p95/p99/max, hitches, pipelines after the fade | `npm run hitch -- chrome\|webkit\|phone` (`UNCAPPED=1`: frame cost) |
| Pacing logic on modelled devices (60–240 Hz, jitter, GPU- and CPU-bound, phones) | `node tools/pace-sim.mjs [name]`: rerun after touching `pacing.js`; the last third stays at 0 dips |

- `smooth` env: `THROTTLE=4` (CPU ×4), `AREAS`, `MOVES`, `SECS`, `SIZE=1728x1117@2` (a Retina laptop), `JSON=file`. `lite` = a phone reporting 2 GB.
- Late = a drawn frame a display refresh late or more. `gpu` = ms from the end of the frame's JS until the GPU finished it (≈7 ms at any load; near the paced interval = frames queueing).
- Headless Chrome and the Simulator use the Mac's GPU: CPU-side dips, pacing faults and latency are true, GPU cost only relative.
- Dips are rare: run alone on the machine (bakes and other benchmarks share the GPU), repeat a cell that dips, compare variants in alternating runs (timings drift over hours).
- Check UI and jobs on the player's load path (with the key art); `?auto` prewarms the interface only partly.
- Headless WebKit's rAF runs at ~77 Hz: 13 ms there is the 60 cap working.

## Not measurable here
A real phone's GPU, 120 Hz displays (only in `pace-sim`), iOS Safari on WebGPU (the Simulator has none), Chrome's shader cache for a returning player (headless starts with a fresh profile).
