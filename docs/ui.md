# Interface

Principle: a visual show, not explanation; portrait phone first. Styles in `index.html`, code in `src/ui/`.

## Look
- Aero glass, drawn: `.glass` (window frame: tint, gloss band, streaks, bright edge), `.pane` (small glass on the view), `.client` (light reading sheet), glossy `.btn`, key caps, the red caption close (`.win-close`). No backdrop blur anywhere.
- Colours: blue = looking closer (inspect), green = the hands (do, and the next thing for them), gold = a place to go to.
- Names (`src/ui/names.js`, `docs/content.md`): Sakha 0.9 s, then a 0.5 s fade into the chosen language's. The fade belongs to the surface (prompt, stage, journal, toast: `fade(el)` drives `--nm`), so names drawn later in it never replay it.
- Glyphs: `src/ui/icons.js` (`icon`, `actIcon(act)` = an act's own tool, `glyph(control, touch)`, `MOUSE`).
- Scale: `--ui` (`UI.fit`): 1 up to 1600×900 and on phones, then with the screen (2560×1440: 1.6); every surface has `zoom: var(--ui)` (the finder marker: its parts).
- Select (`src/ui/select.js`, `.sel[data-sel]`): the current choice on a button, the list drops from it, the current one ticked. Language (`lang`: title, pause, stage, journal) and quality (`q`).
- Every surface and state is painted while loading (`src/ui/prewarm.js`); a new one must be added there.

## In play
| Surface | Shows |
|---|---|
| Dot | dot; larger and blue on a thing; a green ring when the hands can do something |
| Look prompt (`#prompt`, `ui.setPrompt`) | the thing's name under the dot. Left of the dot: blue lens + `E` = it can be looked at closer. Right of the dot: green plate = the act's tool, its verb, the mouse glyph. With nothing in view the plate alone, when what is carried can be used. Its parts are permanent elements (touch takes touches on them) |
| Put-down hint (`#puthint`) | low on the right while something is carried: where it goes (down / back) + right mouse |
| Found by doing (`ui.discovered`) | glass pill, top right: the thing's journal picture in a gold ring and its name, 2.6 s |
| Saying (`ui.toast`) | glass caption: one italic line and its by-line, low in the view (phones: under the corner buttons) |
| Finder marker (`#guide`) | gold diamond + metres over the destination set on the journal's map, at the edge with an arrow |
| Touch (`src/ui/touch.js`) | stick left; right: the hand (green square, the act's tool), the eye (blue, round), put down, jump, crouch; journal and pause top right. The prompt's lens and plate are the same two inputs at the thing. A touch on the view only looks |

## Lessons (`src/ui/teach.js`, `#teach`)
- One control at a time, at the moment it is first needed, drawn (keys and mouse, or the phone's stick, drag and buttons), with its word from `CONTROLS`; gone once done, for good (`save.taught`). Top centre; on a phone top left.
- On a phone the real stick or button gets a ring, and `look` / `turn` slide a finger across the view (`#teach-ghost`).
- `game.teach.note(id)` = the player did it (taught or not). Off with `?auto` unless `?teach`.

| Lesson | When | Done by |
|---|---|---|
| `look` | the walk begins | turning the view |
| `walk` | after `look` | walking 3 m |
| `aim` | 2.5 s beside a thing without looking at it | the dot on a thing |
| `read` | a thing with a card is in view | inspecting |
| `turn` | the stage is open | dragging the thing |
| `do` | the hands can do something (its own tool drawn) | doing it |
| `put` | carrying for 2.5 s | putting down |
| `journal` | something is found after a first `read` or `do`, nothing in view | opening it |
| `pause` | after `journal` | shown 9 s, once |

- A lesson shown 8 s gives way to another that waits and comes back later.

## Inspect stage (`src/ui/stage.js`, `ui.showEntry`)
- The view leaves the body and goes to the thing in the live world; no copy, render target or shader.
- Glass pane beside the thing (landscape: right; portrait: below): category, name, one line, the entry's saying (`say` in `views.json`), reference photographs as a strip (a tap puts one in the pane, again: full screen), `E` / "Read more" (the reading sheet: title, text, facts, related, sources), the language select, the close button. Names of found things round it on the view (a tap goes there).
- Turning: drag (mouse under the drawn cursor, finger, ← →), wheel = nearer / further, a slow turn of its own unless camera motion is low.
- Round a small thing the eye stops short of walls (thin long colliders, 16 cm clear) and of the ground.
- `ui.layout()` gives the stage the part of the screen the pane leaves free; the pane's text scrolls inside it, its buttons stay in view.

| Kind (`Stage.open` → `s.mode`) | When | The view |
|---|---|---|
| `near` | a thing ≤ 1.5 m in radius | glides up to it along the line it was seen on (0.55 s); orbit ±50°; `engine.closeLook`: the eye adapts fully |
| `out` | a house, tree, fence, seen from outside | cut (dip to dark 0.4 s) to the baked side (`dir`), framed whole; orbit all round where `free` |
| `here` | inside the thing, or an entry with a `cam` | stays (or cuts to `cam`) and looks round |
| `photo` | an idea with no place (`photo`) | the view stays; its photograph fills the free part |

- From the journal or a related link the view goes to the entry's own thing (`pickThing`: `it` = index or a piece of its English label; `as` = another entry's thing); closing returns to the journal.
- `src/data/views.json`: one row per entry. `dir` [yaw°, elevation°] and `free` are baked by `npm run bake-journal` unless `fix`; `dist` scales the distance; `cam` [x, y, z, yaw°, pitch°, fov°].
- The body waits where it stood (`stage.body`); WASD, Esc, the close button return to it.

## Journal (`src/ui/journal.js`, `ui.showJournal(tab, here)`, `ui.j`)
- A glass window with three leaves (tabs centred): map, finds, work; found / total; language select; close.
- Map: the alaas drawn from above, north up (`map.webp`, 2048 px for 820 m; closer than 0.3 m a device pixel, 256 px squares at 0.2 / 0.1 / 0.05 m drawn in a worker for what is in view, `src/ui/maptiles.js`; the layer is its own only while it moves, so it is drawn sharp at rest), the houses, pens and posts drawn from the placed models' bounds. Drag moves it, pinch / wheel / + − zoom (nearly the whole alaas to 10 cm a pixel), the arrow button centres on the player; opened in play it comes up round the player.
- Markers: red arrow = the player and where they face; blue dot = a found thing (a house or place with its name); gold "?" = one that waits; green square with its tool = a job; gold diamond = the destination. Markers that would overlap give way to the more important one until zoomed in.
- A marker chosen: a pane with its picture and name (a job: what the hands have made), the eye (found: that thing on the stage, closing returns here) and the gold walk button = be led there (`game.guide.go`, again: off). A tap on the bare map puts the destination there.
- Finds: square pictures by kind (found: the thing as the stage shows it → the stage; not found: a dim blur with "?" → its marker on the map).
- Work: a picture per job with glyphs and counts of what was made (`WORKS` in `work/list.js`) → its marker on the map.
- Pictures: `public/assets/ui/journal/<id>.webp` (320 px), `<id>.s.webp` (20 px), `work-<job>.webp`: `npm run bake-journal`. `map.webp` + its extent in `src/data/journal.json`: `npm run bake-map` (after a change to the terrain; both it and the squares draw with `src/ui/mapdraw.js`).

## Title and loading
- Key art, the name, a glass dock: the loading bar and its status, then the start button; under it the language select. Version (`package.json`, `.ver`), source, credits and the ticket call beneath.

## Pause (`#pause`, `game.pausePage`)
- Glass window, the version small in its head. Left: Continue (large), Settings, Controls, About, Exit. Right: the chosen page. A phone shows the list first and one page at a time with a back button.
- Settings: language; look speed, field of view, camera motion, look smoothing (each slider between two drawn extremes); invert Y, battery saver (switches); volume; quality (reload note); Advanced (folds open, `.settings.adv`): the video options, each a name over a one-line hint.
- Video options (`src/engine/video.js`): resolution (50–100% of the screen's), adaptive resolution, frame-rate cap (30/60, not on phones), shadow detail (512/1024/2048), shadow distance (45–150 m), ambient occlusion (not on low or phone: their sky light leaves the ground no texture slot), anti-aliasing (TRAA/FXAA/off), grass density, draw distance (forest rings), glow, lake reflection (off/low/high). They show the running preset's values; changing one makes the quality Custom (its preset + the options).
- Applied at once: resolution, adaptive resolution, frame-rate cap, shadow distance, lake reflection low ↔ high. The rest (built with the world or the post chain) and any other preset: the reload note.
- Controls: every control drawn (keys and mouse, or on a phone its stick, drag and buttons) with what it does.
- About: Springfolk mark, links, licence.

## UI API (`game.ui`)
- `showEntry(id, { mode: 'peek'|'full', kind })` (`game.read` opens stage and card together); `close()`; `open` = `'card'|'journal'|null`, `modal`, `mode`, `current`.
- `scroll(dy)`; `setImage(i)`; `enlarge()`; `layout()` → `stage.area`; `frame()` moves the names on the stage; `fit()` sets `--ui`.
- `toast(html, ms)`; `discovered(id)`; `setPrompt(label, { act, read, put })` (`act`, `put`: the act objects); `langSelect(up)`; `showJournal(tab, here)`.
- `onAction('close'|'learn'|'more'|'open', id, it, back)`: buttons, journal tiles, card links, stage names → `main.js`.
- `game.stage`: `on`, `open`, `close`, `orbit`, `zoomBy`. `game.paused`, `game.pausePage(id)`.
- Title progress is read from `#go`'s text (`N%` build → `… N%` warm-up); `#title.ready` once `game.ready`.
- Settings ids → `save.settings`: `s-sens`, `s-fov`, `s-vol`, `s-inv` `invertY`, `s-motion`, `s-smooth`, `s-battery` `batterySaver`; selects `q` → `quality` (auto/high/medium/low/mobile/custom), `v-<option>` → `video` (on preset `videoBase`), `lang` → `save.lang`.
