# Interface

Principle: a visual show, not explanation. The picture is the game's own view or a photograph; type sits on it over a scrim, not in a window; portrait phone first. Styles in `index.html`, code in `src/ui/`.
- Aero glass frames (blur, chrome) only on pause and settings. Elsewhere: glossy pill buttons, key caps, the light reading sheet (`.client`), Open Sans + Noto Serif.

## Inspect stage (`src/ui/stage.js`, `ui.showEntry`)
- The game's camera goes to the thing in the live world; nothing is built for it (no copy, target or shader).
- Shows: the thing (drag or ← → turns it, wheel nearer/further, a slow turn of its own unless camera motion is low); Sakha name, category (a gold diamond on a first find), one line; the entry's saying (`say`); its photographs as a strip (tap: beside the thing, again: full screen); names of found things round it (tap: go there); E / "Read more": the reading sheet (text, facts, related, sources) beside the thing.
- Layout: landscape = thing left, type right; portrait = thing above, type below, the button under the thumb. `ui.layout()` gives the stage the free part of the screen.
- The body waits where it stood (`stage.body`, with what it carries); WASD, Esc or close return to it. Opened from the journal or a link: the entry's own thing (`pickThing`), wherever it stands; closing returns to the journal.

| Kind (`Stage.open`) | When | The view |
|---|---|---|
| `near` | a thing ≤ 1.5 m in radius | glides to it along the line it was seen on (0.55 s); orbit ±50°; `engine.closeLook` |
| `out` | a bigger thing (house, tree, fence) seen from outside | cut through a ~0.4 s dip to the baked side (`dir`), framed whole; orbit all round where `free` |
| `here` | the player stands inside it, or the entry has a `cam` | stays (or cuts to `cam`) and looks round |
| `photo` | an idea with no place (`photo`) | stays; the photograph fills the free part |

`src/data/views.json`, one row per entry: `dir` [yaw°, elevation°] and `free` baked by `npm run bake-journal` unless `fix`; `dist` distance scale; `cam` [x, y, z, yaw°, pitch°, fov°]; `it` (index or piece of the English label) / `as` (another entry's thing) pick the thing; `photo`; `say` {sah, en, ru}.

## Journal (`ui.showJournal`)
- Shows: the homestead from above, a blue dot where a found thing is, a gold ring where one waits (outside the picture: on its edge); rows by kind of square pictures, found = the thing as the stage shows it with its Sakha name, not found = a dim blur with "?"; the work log, a picture per job with its counts; found / total.
- Acts: a found picture or dot → that thing on the stage; a "?" or ring → the finder marker (again: off) and its where-to-look line; a job → its counts, or where it waits.
- Layout: landscape = map left, rows right; portrait = map above, three pictures a row.
- Pictures (`npm run bake-journal`): `public/assets/ui/journal/<id>.webp` (320 px), `<id>.s.webp` (20 px blur), `work-<job>.webp` (split, hay, tuos, gather; other jobs show their entry's), `map.webp` + its projection in `src/data/journal.json`.

## Title and loading
The key art, the name, a hairline bar that fills, then the start button and the three languages; version, source, credits and "open a ticket" small beneath; the Springfolk mark top left.

## In play
| Surface | Shows |
|---|---|
| Look prompt | the thing's name, the mouse glyph + what the hands would do, an E chip when it has a card; type on the view |
| Found by doing (`ui.discovered`) | the thing's journal picture in a gold ring and its name, top right, 2.6 s |
| Saying (`ui.toast`) | one italic line and its by-line, low in the view |
| Controls list (`#hints`) | off; a first walk shows it 14 s; H or the setting toggles it |
| Finder marker | gold diamond + metres over the place; at the screen edge with an arrow |
| Touch | stick bottom left; big hand, eye and put-down beside it; small jump and crouch; journal and pause top right; over a card or the journal: language and close |
| Pause | the Aero window (no frames drawn once settled); tabs Settings, Controls (keyboard), About (links, licence) |

## UI API (`game.ui`)
- `showEntry(id, { mode: 'peek'|'full', kind })` (`game.read` opens stage and card together); `close()`; `open` = `'card'|'journal'|null`, `modal`, `mode`, `current`.
- `scroll(dy)`; `setImage(i)`; `enlarge()`; `layout()` → `stage.area`; `frame()` moves the names on the stage.
- `toast(html, ms)`; `discovered(id)`; `setPrompt(label, action, { act, read })`.
- `onAction('close'|'lang'|'guide'|'learn'|'more'|'open', id, it, back)`: buttons, journal tiles, card links, stage names → `main.js`.
- `game.stage`: `on`, `open`, `close`, `orbit`, `zoomBy`. `game.paused`.
- Title progress is read from `#go`'s text (`N%` build → `… N%` warm-up); `#title.ready` once `game.ready`.
- Settings ids → `save.settings`: `s-sens`, `s-fov`, `s-vol`, `s-inv` `invertY`, `s-hints`, `s-motion`, `s-smooth`, `s-battery` `batterySaver`, `s-q` `quality` (auto/high/medium/low/mobile); `s-lang` → `save.lang`.
