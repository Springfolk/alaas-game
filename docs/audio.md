# Audio

Real recordings only (no synthesis). `src/audio/audio.js` (`AudioScape`) plays `public/audio/*.ogg` (Opus) listed in `public/audio/manifest.json`.

- Rebuild: `node tools/fetch-audio.mjs [name …]` — downloads sources (cached in `node_modules/.cache/audio-src`), trims, RMS-normalises, bakes equal-power loop crossfades, slices footsteps, encodes Opus (64 kbps mono / 96 kbps stereo). Sources and cuts are tables in that file. Credits: `docs/credits.md`.

| Layer | How |
|---|---|
| Beds | `wind-larch` (forest ring), `birch` (forest edge, sacred birch), `breeze` + `insects` (meadow), `birds` (always, more in forest), `mosquito` (near water/forest), `lake` (panner at the nearest shore point). Gains follow distance from `ALAAS`/`LAKE` and a slow gust random walk. |
| Calls | `cuckoo`, `thrush`, `crow`, `woodpecker` (forest ring), `lark` (overhead), `horse`, `cow` (far pasture, ≥110 m away) — random gaps, HRTF panner + distance lowpass. |
| Bird calls | From `src/nature/life/birds.js` via `shot()` on the outside bus: `crane`/`crane-2` while the crane pair passes within ~320 m, `crow` when a homestead crow takes off. |
| Indoors | Inside a house pad (`urasa`, `balagan`, `mogol-urasa`) or `engine.exposureTarget > 0.7`: outside bus lowpassed to ~650 Hz and −55 %, `room` tone fades in. |
| Fire | `fire` loop at every interactable with entry `ohokh` / `uot-ichchite`; muffled when it is in another room. |
| Steps | `step(surface, speed)`: sprite per surface (`grass dirt forest mud wood`, `water`→mud); random slice, never one of the last two, pitch/gain/filter jitter, alternating L/R; `speed > 2.6` = run. |
| Shots | `play(name, pos?)`: `discover` (one khomus pluck), `fire-feed`, `ribbon`, `pour`, `water-pour`, `churn`, `door`, `gate`, `bellows`, `bench` (sitting: cloth + soft settle), `wood-take` (1–2 dry knocks), `wood-lay`, `khomus` (18 s phrase). Variants `name-2` picked at random. Gain per name in `SHOTS` (default 0.75), 0.82–1× gain and 0.94–1.05× pitch jitter (not music); a shot at the ear is moved 0.6 m down. |

- Shot loudness: hand foley (sit, wood, ribbon) ≈ −30…−25 LUFS, the rest ≈ −26…−23, `khomus` −17. No held creaks or hinge squeals: they read as cartoonish.
- Cow bells left out on purpose: research says they are not traditional (distant lowing instead).
- Opus in Ogg: Chrome, Firefox, Safari 18.4+.
