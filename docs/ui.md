# Interface

Principle: a visual show, not explanation; portrait phone first. Styles in `index.html`, code in `src/ui/`.

## Look
- Aero glass, drawn: `.glass` (window frame: tint, gloss band, streaks, bright edge), `.pane` (small glass on the view), `.client` (light reading sheet), glossy `.btn`, key caps, the red caption close (`.win-close`). No backdrop blur anywhere.
- Colours: blue = looking closer (inspect), green = the hands (do), gold = a place to go to.
- Glyphs: `src/ui/icons.js` (`icon`, `actIcon(act)` = an act's own tool, `actHeld(act)`, `glyph(control, touch)`, `MOUSE`).
- Scale: `--ui` (`UI.fit`): 1 up to 1600×900 and on phones, then with the screen (2560×1440: 1.6); every surface has `zoom: var(--ui)`.
- Select (`src/ui/select.js`, `.sel[data-sel]`): the current choice on a button, the list drops from it, the current one ticked. Language (`lang`: title, pause, stage, journal) and quality (`q`).
- Every surface and state is painted while loading (`src/ui/prewarm.js`); a new one must be added there.

## In play
| Surface | Shows |
|---|---|
| Dot | dot; larger and blue on a thing; a green ring when the hands can do something |
| Look prompt (`#prompt`, `ui.setPrompt`) | the thing's name under the dot. Left of the dot: blue lens + `E` = it can be looked at closer. Right of the dot: green plate = the act's tool, its verb, the mouse glyph (a bar beside it: hold). With nothing in view the plate alone, when what is carried can be used. Its parts are permanent elements (touch takes touches on them) |
| Put-down hint (`#puthint`) | low on the right while something is carried: where it goes (down / back) + right mouse |
| Found by doing (`ui.discovered`) | glass pill, top right: the thing's journal picture in a gold ring and its name, 2.6 s |
| Saying (`ui.toast`) | glass caption: one italic line and its by-line, low in the view (phones: under the corner buttons) |
| Finder marker | gold diamond + metres over the place, at the edge with an arrow |
| Touch (`src/ui/touch.js`) | stick left; right: the hand (green square, the act's tool, a bar = hold), the eye (blue, round), put down, jump, crouch; journal and pause top right. The prompt's lens and plate are the same two inputs at the thing. A touch on the view only looks |

## Inspect stage (`src/ui/stage.js`, `ui.showEntry`)
- The view leaves the body and goes to the thing in the live world; no copy, render target or shader.
- Glass pane beside the thing (landscape: right; portrait: below): category, Sakha name, one line, the entry's saying (`say` in `views.json`), reference photographs as a strip (a tap puts one in the pane, again: full screen), `E` / "Read more" (the reading sheet: title, text, facts, related, sources), the language select, the close button. Names of found things round it on the view (a tap goes there).
- Turning: drag (mouse under the drawn cursor, finger, ← →), wheel = nearer / further, a slow turn of its own unless camera motion is low.
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

## Journal (`ui.showJournal`)
- Shows: the homestead from above with a blue dot where a found thing is and a gold ring where one waits; rows by kind of square pictures (found: the thing as the stage shows it; not found: a dim blur with "?"); the work log as a picture per job with its counts; found / total; language select; close.
- Acts: a found picture or dot → that thing on the stage, closing returns here; a "?" or ring → the finder marker (again: off) and its where-to-look line; a job → its counts or where it waits.
- Pictures: `public/assets/ui/journal/<id>.webp` (320 px), `<id>.s.webp` (20 px), `work-<job>.webp`, `map.webp` + projection in `src/data/journal.json`: `npm run bake-journal`.

## Title and loading
- Key art, the name, a glass dock: the loading bar and its status, then the start button; under it the language select. Version, source, credits and the ticket call beneath.

## Pause (`#pause`, `game.pausePage`)
- Glass window. Left: Continue (large), Settings, Controls, About, Exit. Right: the chosen page. A phone shows the list first and one page at a time with a back button.
- Settings: language; look speed, field of view, camera motion, look smoothing (each slider between two drawn extremes); invert Y, battery saver (switches); volume; quality (reload note).
- Controls: every control drawn (keys and mouse, or on a phone its stick, drag and buttons) with what it does.
- About: Springfolk mark, links, licence.

## UI API (`game.ui`)
- `showEntry(id, { mode: 'peek'|'full', kind })` (`game.read` opens stage and card together); `close()`; `open` = `'card'|'journal'|null`, `modal`, `mode`, `current`.
- `scroll(dy)`; `setImage(i)`; `enlarge()`; `layout()` → `stage.area`; `frame()` moves the names on the stage; `fit()` sets `--ui`.
- `toast(html, ms)`; `discovered(id)`; `setPrompt(label, { act, read, put })` (`act`, `put`: the act objects); `langSelect(up)`.
- `onAction('close'|'guide'|'learn'|'more'|'open', id, it, back)`: buttons, journal tiles, card links, stage names → `main.js`.
- `game.stage`: `on`, `open`, `close`, `orbit`, `zoomBy`. `game.paused`, `game.pausePage(id)`.
- Title progress is read from `#go`'s text (`N%` build → `… N%` warm-up); `#title.ready` once `game.ready`.
- Settings ids → `save.settings`: `s-sens`, `s-fov`, `s-vol`, `s-inv` `invertY`, `s-motion`, `s-smooth`, `s-battery` `batterySaver`; selects `q` → `quality` (auto/high/medium/low/mobile), `lang` → `save.lang`.
