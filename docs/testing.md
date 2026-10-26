# Testing

- No unit tests; verification is `npm run lint` (undefined/unused names), `npm run build` and headless checks against `npm run dev`.
- Tools launch system Chrome (`CHROME` overrides the path) or Playwright WebKit via `tools/browser.mjs`; `PORT` picks the dev server. npm scripts: `shot`, `walkcheck`, `hitch`, `loadprof`, `bench` (args after `--`).
- `node tools/shot.mjs "/?auto&at=x,z,yaw" out.png 1280 720 4000` — system Chrome headless with WebGPU (`playwright-core` dev dependency); never takes the screen. Waits for `game.sharp` (textures at the tier size). Prints the backend and console errors. `DPR=2|3` sets the pixel ratio (also `bench`).
- `EVAL="js"` runs code in the page before the shot (`window.game`, `window.viewer`).
- Models: `viewer.html?m=<model>&cam=x,y,z&look=x,y,z`; it sets `window.ready` after 40 frames.
- Pointer lock can't be granted headless; `?auto` starts without it.
- Safari: test with Playwright's WebKit (`npx playwright-core install webkit`, then `webkit.launch()`); it has WebGPU. Safari builds shaders far slower than Chrome.
- Load stages log to the console: `ground`, `homestead`, `nature/<module>: N ms`, `warm-up: …`.
- Loading: `node tools/loadprof.mjs [chrome|webkit|phone] [query] [shotPrefix]` (first world pixel, playable, main-thread stalls before and 2.5 s after; `THROTTLE=4`: CPU ×4; shots at 1/2/4/8 s) · `node tools/walkcheck.mjs [chrome|webkit|phone]` (shaders/pipelines built on a walk: must be 0/0; `EARLY=1` starts at ready: no frame >50 ms). Both take `PORT`. After changing a model or tree: `npm run bake-impostors` (`docs/loading.md`).
- Phone: Chrome context `{390×844, deviceScaleFactor 3, isMobile, hasTouch}`; drive the stick/look with CDP `Input.dispatchTouchEvent` (multi-touch), buttons with `page.touchscreen.tap`. Keyboard play headless: set `game.input.locked = true`, add codes to `game.input.keys`.
- Performance: `node tools/bench.mjs [chrome|webkit|phone] [query]` (uncapped; `?gputime` turns on GPU timestamp queries — summed per pass, overcounts on Apple GPUs, compare only relatively). Phone emulation with an iPhone UA or `isMobile`+touch auto-picks the `mobile` tier. Hitches: `node tools/hitch.mjs [chrome|webkit|phone]` (headless WebKit's rAF runs at ~77 Hz, so 13 ms there is the 60 cap working).
- Load breakdown: `node tools/loadtrace.mjs [chrome|webkit] [query] [profile.json]` (dev or `vite preview` on `PORT`; `?prof`: main-thread ms per stage and bucket, worker/pipeline spans, resources; Chrome adds a CPU profile; `AFTER=1` the 2.5 s after ready). Compare variants in alternating runs: timings drift over minutes.
- Shader builds: `node tools/shaders.mjs [chrome|webkit] [query] [out.json]` (per pass/material, main-thread build time; `TOP=n` slowest; `COVERED=1` the key-art load) · `?nomaster` turns off master materials (`docs/materials.md`).
- `?nomerge` turns off shadow merging, impostors and size culling (A/B screenshots).
- Real phone: serve a build on the tailnet (`npx vite preview --port 5199` + `tailscale serve --bg --https=8443 http://127.0.0.1:5199`; set `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` to the ts.net name, WebGPU needs HTTPS), open with `?remotelog`, and run `node tools/phonelog.mjs` mounted at `/__log` (`tailscale serve … --set-path /__log http://127.0.0.1:5200`): console, errors and a 2 s heartbeat (frames, rendered, longest gap, tier, resolution, audio state).
