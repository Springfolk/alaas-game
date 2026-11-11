# Interface

Principle: a visual show, not explanation. The picture is the game's own view or a photograph; type is set on it over a scrim, not in a window; portrait phone first. Styles in `index.html`, code in `src/ui/`.

Look: the Aero glass frames (blurred, with chrome) stay only on system surfaces (pause, settings); the show surfaces have none. Kept from it: the glossy pill buttons, key caps, the light reading sheet (`.client`), Open Sans + Noto Serif.

## Inspect stage (`src/ui/stage.js`, `ui.showEntry`)
- Purpose: looking closer at a thing. The view leaves the body and goes to the thing in the live world; no copy, render target or shader is made (it is the game's camera).
- Shows: the thing, turned by dragging (mouse under the drawn cursor, finger, ← →; wheel = nearer / further; a slow turn of its own unless camera motion is low); its Sakha name, category, one line; the entry's own saying where it has one (`say` in `views.json`); its reference photographs as a strip, one tap puts a photograph beside the thing (again: full screen); the names of found things round it (a tap goes to that thing); E / "Read more": the reading sheet (title, text, facts, related, sources) beside the thing.
- Layout: landscape = thing left, type column right; portrait = thing above, type below, the button under the thumb; `ui.layout()` gives the stage the free part of the screen.
- Cut: the peek window, the centred card window with its title bar, the gallery arrows, key hints in a footer, the "added to the journal" toast for a thing being inspected (a gold diamond by the category instead).

| Kind (`Stage.open` → `s.mode`) | When | The view |
|---|---|---|
| `near` | a thing ≤ 1.5 m in radius | glides up to it along the line it was seen on (0.55 s); orbit ±50°; `engine.closeLook`: the eye adapts fully, a dark corner is seen |
| `out` | a house, tree, fence, seen from outside | cut (dip to dark 0.4 s, the eye adapts under it) to the baked side (`dir`), framed whole; orbit all round where `free` |
| `here` | inside the thing (uraha lining and frame), or an entry with a `cam` | stays (or cuts to `cam`) and looks round |
| `photo` | an idea with no place (`photo`) | the view stays; its photograph fills the free part |

- From the journal or a related link the view goes to the entry's own thing (`pickThing`: `it` = index or a piece of its English label; `as` = another entry's thing) wherever it stands; closing returns to the journal.
- `src/data/views.json`: one row per entry (all 52). `dir` [yaw°, elevation°] and `free` are baked by `npm run bake-journal` unless `fix`; `dist` scales the distance; `cam` [x, y, z, yaw°, pitch°, fov°].
- The body waits where it stood (`stage.body`; what is carried stays with it); WASD, Esc, the close button return to it.

## Journal (`ui.showJournal`)
- Purpose: browsing what was found and seeing what still waits.
- Shows: the homestead from above with a blue dot where a found thing is and a gold ring where one waits (places outside the picture sit on its edge); rows by kind of square pictures: a found entry is its thing as the stage shows it (an idea: its photograph) with its Sakha name, one not found is a dim blur with "?"; the work log as a picture per job with its counts; found / total.
- Acts: a found picture or dot → that thing on the stage, closing returns here; a "?" or ring → the finder marker (again: off) and, only then, its where-to-look line at the foot; a job → its counts or where it waits, at the foot.
- Layout: landscape = picture of the homestead left, rows right; portrait = picture above, three pictures a row.
- Cut: the window frame, the list of hint sentences, the instruction paragraph as a heading, the orb.
- Pictures: `public/assets/ui/journal/<id>.webp` (320 px) and `<id>.s.webp` (20 px, the blur), `work-<job>.webp`, `map.webp` + its projection in `src/data/journal.json`: `npm run bake-journal`.
