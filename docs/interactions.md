# Interactions

Code: input flow in `src/main.js` (`act`, `put`, `run`, `inspect`, `read`, `actOf`, `closeUI`, the prompt in `frame`) and `src/input.js` (`doing`, `setDo`, `put`); hands-on logic in `src/interact/` (`index.js` wiring + berries, `hands.js` carrying, `seat.js` sitting, `rites.js` choron, lake cup, khomus, `work/` jobs); props in `src/models/chores.js` and `work.js`, built before the warm-up. Every action: `docs/actions.md`.

## Inputs
| | Keyboard and mouse | Touch |
|---|---|---|
| **Do**: the act of the thing in view; with nothing in view, what the carried thing does. Held where the motion lasts (`input.doing`) | left button, F | the hand button, held (a drag starting on it looks, so a held tool can be aimed); also the prompt's green plate. A touch on the view only looks |
| **Put down**: the carried thing back to its place when within reach (`thing.put()`: axe → block, scythe → post, bark → hide), else onto dry ground ahead; of an armful, one billet | right button, Q | the put-down button (shown while carrying) |
| **Inspect**: the inspect stage (`docs/ui.md`), never an act | E | the eye button (shown when the thing has a card) |

- The prompt (`docs/ui.md`): the thing's name under the dot; left of the dot the blue lens + E when it has a card; right of it the green plate with the act's own tool (`actIcon`, `src/ui/icons.js`), its verb and the mouse glyph (a bar beside it: the motion lasts while held, `actHeld`). The dot becomes a green ring when the hands can do something; with nothing in view the plate still shows what the carried thing would do. While carrying: a put-down hint low on the right.
- An act never opens a card; doing a thing adds its entry to the journal.
- One thing in the hands at a time (or an armful of billets); nothing goes into the lake.
- Acts run while you walk and look; only `act.freeze` holds the player (the ribbon choice, the birch bow, the 0.9 s turn as you sit).

## Inspect flow
- E on a thing: the stage, with its name and one line (`mode: 'peek'`) → E: its text beside it (`'full'`) → E: closed, the view back in the body. You stand still throughout; WASD, Esc or close also close. `game.inspect(it)` is the one entry point; `game.read(id, it, back)` opens an entry (no `it`: its own view, as from the journal).
- Stage and journal are mouse-driven: drag turns the thing or moves the map, the wheel moves nearer, zooms the map or scrolls the sheet under the cursor; photographs, names, related links, close and the language select are clickable. Keys: E next step, ← → turn, PgUp/PgDn/↑/↓ scroll, `[` `]` photographs, L language, J journal. Phones: drag to turn, native scrolling, the touch close and language buttons.

## Pointer lock and pause
- The lock is taken once (title click) and kept: browsers show their "Esc to return the mouse" banner on every grant. While a window or the pause menu is up, `movementX/Y` drive a drawn cursor (`#vcursor`, `src/ui/cursor.js`) that hit-tests with `elementFromPoint` and dispatches clicks (sliders drag; selects are the game's own, `src/ui/select.js`); `.vh` / `.vdown` stand in for :hover / :active.
- P keeps the lock (`game.pause()`, `ui.setMenu(true)`): Continue, P or a backdrop click only hide the menu. Esc or lost focus: the browser drops the lock, any window closes, the menu shows; Continue re-locks once (`Input.locking`) and the menu hides when the lock is granted.
- Keyboard Lock (`navigator.keyboard.lock`) is not used: Chromium only, and only in element fullscreen.
- Exit (`game.exit()`): saves, `window.close()` (refused only in a tab holding an earlier page), else the title screen and back to that earlier page (not when it is the game again).

## Hooks
- Interactable: `off` (not focusable), `take`, `berries`, `sit`, `fireplace: { pos(), upright, fuel(), stir(k) }`. Things with a home (`hands.homed`): `guest` (choron), `offering` (lake stone), `khomus` flags; parts in the model's `userData`.
- `game.interact.actFor(it)` overrides `it.act` while carrying; `idleAct()` = the do input with nothing in focus; `putAct()` = put down. `game.doReady` / `readReady` / `putReady` light the touch buttons; `game.choosing` = a `choose()` strip is up (touch hides its controls).
- Jobs: a placed model names its job in `object.userData.work.job` (`JOBS` in `work/index.js`). `Work` (`game.work`) is asked before the carrying code: `actFor(it)` → act, `null` = nothing, `undefined` = not mine; `count(key)` → `save.work`; `say()` = a saying, once.
- Tools are carried things: `hands.addKind(kind, hold, lie)`, `hands.addThing({ kind, obj, it, name })`, `it.thing`, `thing.put()`; `hands.pose(dt, cam)` → `{ p, q, world? }` drives a held tool. Carried things have weight: they trail the turning view, sit nearer the middle on a narrow screen, and `weigh()` dips the view.
- A job's movable parts are scene children marked `userData.dynamic`; after moving one, clear its `userData.sphere` (the look-at cache).

## Hints (`src/interact/hints.js` `next()`, `game.hints`)
No sentence and no mark says the next step: the thing itself answers, as in life. One rule table, read from the jobs' own state; nothing while acting, sitting or choosing; it stops once the step is done.

| In the hands / state | The world's hint |
|---|---|
| empty pail | a fish rises in open water off the nearest shore |
| billets | the nearer of: the woodpile (resin glints on the billet ends), a hearth (a log settles: a knock, the fire lifts, sparks) |
| axe | the round on the block, else a fallen half, the heap of rounds, the loose billets: resin glints on it |
| nothing, ≤ 8 m from the block | a round stands ready: the sun glints on the axe's edge; a fallen half: resin glints |
| fish trap | empty: fish rise and jump in the weir's gap, water laps there; with fish: the тымтай's bark glints |
| nothing, trap set with ≥ 3 fish, ≤ 45 m | the catch splashes in the trap, water laps |
| scythe, standing off the standing grass | insects buzz from the nearest standing grass |
| bark sheet | cold: the nearest hearth's fire lifts; warm: a glint on the hide where it lies |
| warm bark on the hide, nothing held | the sheet's satin glints |
| тордуйа | the nearest full дьэдьэн patch ≤ 80 m: its berries glint, a thrush calls from there |
| nothing, forge begun, ≤ 14 m | the blank spits an ember when it is ready for the hands, else the bellows glint |
| the guest's choron | the nearest hearth's fire lifts |
| the lake's milk | a fish rises off the shore by the stone |

- Glints: one additive sprite (`glintMaterial`, `src/interact/glint.js`) made before the warm-up, ≤45 m, on a point of the thing's surface picked by a ray from the eye; a beat every 1.2–3.2 s (resin, bark, berries: two sparkles). Ripples are the lake's own (`world.life.water.ring`); the fire's lift is `fireplace.stir(k)`.

## Finder (`src/ui/guide.js`, DOM only)
- `game.guide.go({ key, id, at })` (the journal's map; `clear()`, `dest`): a gold diamond with the distance over the destination, at the screen edge with an arrow when out of view, a soft shimmer within 7 m. An entry (`id`): its nearest place, until found. A job or a spot (`at`): until within 3 m.
- Places: `world.interactables` (bounding-box centre; zones at their centre). Entries with no place (`mogol-urasa`, `ornament`, `urung-aar-toyon-aiyy`, `baay-bayanay`, `algys`, `ysyakh`, `osuokhai`, `olonkho`) are found through the dashed related link in a card that names them (`.chip.told`); their marker is that card's place.
- Winter place (`sayylyk-kystyk`): no marker unless chosen; `src/interact/glint.js` flashes a star on the winter balagan's west window every 5–12 s, seen from 40–400 m while the sun lights that wall and it faces you, until found (one sprite added before the warm-up).
- First visit: language from `navigator.languages` (`detectLang`: `sah` anywhere → Sakha; first language ru/be/uk → Russian; else English); a pick on the title or in settings sets `save.langSet` and wins.
