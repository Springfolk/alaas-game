# Testing

- No unit tests: `npm run lint` (undefined/unused names), `npm run build`, and headless checks against a dev server (`PORT`, default 5190). Frame pacing checks: `docs/smoothness.md`.
- Tools launch system Chrome (`CHROME` overrides the path) or Playwright WebKit (`npx playwright-core install webkit`; it has WebGPU, builds shaders far slower than Chrome) via `tools/browser.mjs`; never on screen.
- Phone emulation: `{390×844, deviceScaleFactor 3, isMobile, hasTouch}`, which picks the `mobile` tier; drive stick and look with CDP `Input.dispatchTouchEvent`, buttons with `page.touchscreen.tap`. Keyboard play: set `game.input.locked = true`, add codes to `game.input.keys`. Pointer lock can't be granted headless; `?auto` starts without it.

| Check | Command |
|---|---|
| Screenshot (waits for `game.complete` and `game.sharp`; prints backend and console errors) | `npm run shot -- "/?auto&at=x,z,yaw" out.png [w h waitMs]`; `EVAL="js"` or `SCRIPT=file` runs code first (`window.game`, `window.viewer`); `DPR=2\|3` |
| A model alone (`window.ready` after 40 frames) | `viewer.html?m=<model>&cam=x,y,z&look=x,y,z` |
| Shaders and pipelines built on a walk: must be 0 / 0; a stale bake (geometry generated or an atlas baked at load) fails it | `npm run walkcheck -- chrome\|webkit\|phone` (walks once ready and complete; `EARLY=1`: from ready, no frame > 50 ms; `INIT=js` runs before the game, e.g. a save with custom video options) |
| First world pixel, playable, stalls before and 2.5 s after ready | `npm run loadprof -- chrome\|webkit\|phone [query] [shotPrefix]` (`THROTTLE=4` CPU ×4; shots at 1/2/4/8 s) |
| Load breakdown (`?prof`: ms per stage and bucket, worker and pipeline spans; Chrome CPU profile) | `npm run loadtrace -- chrome\|webkit [query] [profile.json]` (`AFTER=1`: the 2.5 s after ready) |
| Uncapped CPU ms, fps, calls, triangles at five views | `npm run bench -- chrome\|webkit\|phone [query]` (`?gputime`: GPU timestamps per pass, overcount on Apple GPUs: compare only relatively) |
| Clipping: welded parts floating, sunk, gaping over the ground, interpenetrating, surfaces crossing (open parts too; `sheets` = a cloth, hide or bark sheet crossed), sheets under the drawn ground at any depth (`sheetGround`), resting parts or loose things (a `dynamic` object's parts together) with their weight off what holds them (`unsupported`) or held by nothing within 3 cm (`hovering`), things (parts under 3 m joined where they touch) whose lowest point is 4 mm–4 cm into or 4 mm–10 cm over the drawn ground or a model's rest (`resting`; `Q=mobile` the phone tier, `QUERY=&nosettle` without the settling), z-fighting (also with the ground), walkable eye spots near geometry; `VIEW=1` what is near the eye (depth, near-plane cut, screen share) (`?nogeo&keepgeo&nomerge`; `MODEL=` regex, `loose/` = carried and set-down things and hands; `NEAR=m` other models within m; `REGION=x0,z0,x1,z1`; `STATE=` awaited js first; `SIZE=WxH`). Scripts import its `analyse` to check states mid-action | `node tools/clipcheck.mjs [out.json]` |
| Every shader build, by pass and material | `node tools/shaders.mjs` (`docs/materials.md`) |
| CPU profile of play, ms per frame by file and function | `node tools/jsprof.mjs [query] [x,z,yaw] [s]` |
| Phone tier on WebGL2 at an iPhone's pixel count: median GPU and JS ms | `node tools/gpuab.mjs "<query>\|<query>" [spots] [toggles]` |

- Load stages log to the console: `ground`, `homestead`, `nature/<module>: N ms`, `warm-up: …`. Compare load variants in alternating runs: timings drift over minutes.
- A/B switches: `?nomerge` (no shadow merging, impostors or size culling), `?nomaster`, `?touch` / `?notouch` (phone controls on/off); the rest in `AGENTS.md` and next to what they switch.

## iOS
- Simulator first (real Mobile Safari on the Mac's GPU; no WebGPU): `xcrun simctl boot <id>` (outside a sandboxed shell, where `simctl` hangs), `safaridriver -p 4723`, then `SIM=1 BASE=http://127.0.0.1:5199/ node tools/iphone.mjs …`.
- `tools/iphone.mjs` modes: `spots` (uncapped ms/frame, JS and GPU-fence ms per spot), `smooth`, `ab` (interleaved runtime A/B; `SEQ=` exact order; `hide:`/`mat:`/`light:` toggles), `play` (fps per 5 s while turning), `load` (boot marks and bytes). A real iPhone over USB (Safari › Advanced › Remote Automation) only for short targeted checks: on WebGL2 it flips between a slow (~45 ms) and a fast (~17 ms) state, so compare only within one state.
- On a phone over the tailnet: `npx vite preview --port 5199` + `tailscale serve --bg --https=8443 http://127.0.0.1:5199` (WebGPU needs HTTPS; `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` = the ts.net name); open with `?remotelog` and run `node tools/phonelog.mjs` mounted at `/__log` (`tailscale serve … --set-path /__log http://127.0.0.1:5200`): console, errors and a 2 s heartbeat (frames, longest gap, `cpu` JS ms, `gpu` WebGL2 fence ms, tier, resolution, audio). `?perftest` adds uncapped fps per bench spot with one layer hidden at a time.
