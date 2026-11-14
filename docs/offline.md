# Offline: installed web app and desktop app

## Web app (PWA)
- `public/manifest.webmanifest` + icons (`tools/readme-art.mjs`): the browser's Install / Add to Home Screen; fullscreen, any orientation.
- `src/load/offline.js` registers `public/sw.js` after ready, in a production build over http(s) only (no dev server, no desktop app).
- `vite.config.js` (`offlineList`) writes `dist/offline.json` (`shell` = built scripts, `files` = every file, `?v=` included) and stamps `BUILD` into `dist/sw.js`: each deploy installs a new worker.

| Request | Answer |
|---|---|
| The page | network, else the stored page |
| Built scripts, URLs with `?v=` or `?k=` | cache, else network (stored; older versions of the file dropped) |
| `cache: 'no-cache'` (manifests) | network, else cache |
| The rest (fonts) | cache, refreshed in the background |
| Offline miss | the stored file under any `?v=` |

- One cache per scope (`alaas:<path>`); main's worker leaves `canary/` alone. A new worker deletes files the build no longer ships.
- Installed (`display-mode` standalone or fullscreen, iOS `navigator.standalone`; `?offline` in a tab): after `game.sharp` the worker fetches every file but textures, plus textures at 256, the tier's edge and half of it; `game.offline` = done. A browser tab stores only what it loaded.
- A new public file loaded without `?v=` or `?k=` is served stale-first: load it through `versioned()` or `sized()`.

## Desktop app (`desktop/`, Electron)
- Its own package (the site's `npm ci` installs no Electron). `main.js` serves `dist/` (shipped as `resources/dist`) from `app://alaas/`; saves live under that origin in the app's user data.
- `npm run desktop` → installers in `desktop/out/` for the OS it runs on (`builder.config.cjs`: version from the root `package.json`; macOS dmg arm64 + x64, Windows NSIS x64, Linux AppImage x64).
- Unsigned: macOS ad-hoc (first launch: right-click → Open, or System Settings → Privacy & Security → Open Anyway), Windows SmartScreen (More info → Run anyway).
- Linux starts Chromium with WebGPU switched on; without it the game falls back to WebGL2.
- F11 or Alt+Enter: fullscreen (Windows, Linux; macOS has its menu). External links open in the browser.
- `.github/workflows/desktop.yml`: publishing a release (pre-releases too) builds all three and attaches them; the app's version is the tag.
- Headless check: `ALAAS_HIDDEN=1 ALAAS_QUERY='?auto'` (no window), driven with Playwright's `_electron.launch({ executablePath })`.
