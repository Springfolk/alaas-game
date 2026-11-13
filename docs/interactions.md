# Interactions

Code: input flow in `src/main.js` (`act`, `put`, `run`, `inspect`, `read`, `actOf`, `closeUI`, the prompt in `frame`) and `src/input.js` (`doing`, `setDo`, `put`); hands-on logic in `src/interact/` (`index.js` wiring + berries, `hands.js` carrying, `seat.js` sitting, `rites.js` choron, lake cup, khomus, `work/` jobs); props in `src/models/chores.js` and `work.js`, built before the warm-up. Every action: `docs/actions.md`.

## Inputs
| | Keyboard and mouse | Touch |
|---|---|---|
| **Do**: a tap; the act of the thing in view; with nothing for the hands there, what the carried thing does or the work place the player stands at. A tap while an act runs goes to it (`act.tap`) | left button, F | the hand button (a drag starting on it looks); also the prompt's green plate. A touch on the view only looks |
| **Put down**: the carried thing back to its place when within reach (`thing.put()`: axe → block, scythe → post, bark → hide), else onto dry ground ahead (tipped to its slope, clear of what lies there, of walls and of eaves lower than it: `rest.js`); of an armful, one billet | right button, Q | the put-down button (shown while carrying) |
| **Inspect**: the inspect stage (`docs/ui.md`), never an act | E | the eye button (shown when the thing has a card) |

- The prompt (`docs/ui.md`): the thing's name; under it, apart, the blue lens + E when it has a card and the green plate with the act's own tool (`actIcon`, `src/ui/icons.js`), its verb and the mouse glyph. The dot becomes a green ring when the hands can do something; with nothing in view the plate still shows what the carried thing would do. While carrying: a put-down hint low on the right.
- An act never opens a card; doing a thing adds its entry to the journal.
- One thing in the hands at a time (or an armful of billets); nothing goes into the lake.
- Acts run while you walk and look; only `act.freeze` holds the player (the birch bow, the choron's rite, the 0.9 s turn as you sit) and a framed work view holds the view.

## Framed work view (`src/interact/framed.js`, `Stage.work` in `src/ui/stage.js`)
- A watched job or a job with a tap per step: `game.framed.open({ c, r, yaw, el, fov, act? })` glides the view (the stage's glide, 0.55 s; back 0.32 s) to look at `c` from (yaw, el), far enough that `r` fits the narrower side of the screen (portrait: field of view ×1.45, `r` ×0.75: as near as on a wide screen); never through a thin wall, never under the ground. `aim(v)` moves it on, eased.
- The body stays where it stood; what it carries is hidden (a job's worker eye, `hands.eye`, poses its own tool by the work).
- Leaves at once: WASD, arrows, E, Space, C, Esc, put down (right button, Q, the touch put button drawn as "back"), the touch stick. The job reads `framed.on` and stops at its next step.
- The prompt shows only `v.act()` (the act a tap does now) and the "back" hint; no hints, no dot; lessons only `do` and `back`.

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
- `game.interact.actFor(it)` overrides `it.act` while carrying; `idleAct()` = the do input with nothing in focus; `putAct()` = put down. `game.doReady` / `readReady` / `putReady` light the touch buttons.
- Aim (`pickFocus`): among hits within 0.6 m behind the first, the smallest thing wins.
- Aim, near misses (things ≤ 1.2 m radius): with nothing hit, a thing whose centre the look passes within 0.8 × its radius (≥ 0.3 m); smaller than what was hit and in front of it, within half its radius (≥ 0.12 m).
- Work places: `it.around = { at(), r }` with `it.live()`: empty hands within `r` get its act (the forge).
- Jobs: a placed model names its job in `object.userData.work.job` (`JOBS` in `work/index.js`). `Work` (`game.work`) is asked before the carrying code: `actFor(it)` → act, `null` = nothing, `undefined` = not mine; `count(key)` → `save.work`; `say()` = a saying, once.
- Tools are carried things: `hands.addKind(kind, hold, lie)`, `hands.addThing({ kind, obj, it, name })`, `it.thing`, `thing.put()`; `hands.pose(dt, cam)` → `{ p, q, world? }` drives a held tool. Carried things have weight: they trail the turning view, sit nearer the middle on a narrow screen, and `weigh()` dips the view.
- A job's movable parts are scene children marked `userData.dynamic`; after moving one, clear its `userData.sphere` (the look-at cache).

## Hints (`src/interact/hints.js` `next()`, `game.hints`)
No sentence and no mark says the next step: light catches the thing, as in a photograph. One rule table, read from the jobs' own state; nothing while acting, sitting, mowing or in a framed view; it stops once the step is done. Sound only accompanies.

| In the hands / state | The world's hint |
|---|---|
| empty pail | a fish rises in open water off the nearest shore: sun glitter and a glare on the rings |
| billets | the nearer of: the woodpile (resin glints and glares on the billet ends), a hearth (the fire lifts with a knock; its light swells round the hearth, from outside in the smoke over the roof) |
| nothing, ≤ 8 m from the block, a round or a half to split | the sun glints on the axe's edge |
| nothing, ≤ 12 m from the weir, trap on the shore | fish rise and jump in the weir's gap, sun glitter on the rings, water laps |
| nothing, trap set with ≥ 3 fish, ≤ 45 m | the catch splashes in the trap, sun glitter on the water |
| player and thing in different rooms (uraha, balagan, khoton, ampaar) | the doorway first: daylight in it, its jamb glints (from inside the player's room, from outside the thing's); a hearth from beyond 14 m keeps its smoke glow |
| bark sheet | the nearest hearth's light swells |
| тордуйа | the nearest full дьэдьэн patch ≤ 80 m: its berries glint and glare, a thrush calls from there |
| nothing, a knife begun, ≤ 14 m | hot iron: the blank spits an ember and glows; cold: the bellows glint |

- Lights: three additive sprites on layer 1 made before the warm-up (`glintMaterial`, `lightMaterial`, `src/interact/glint.js`); in play only uniforms, transforms and `visible` change. `LOOK` sets each hint's colours and sizes, `gain` the strengths: all kept faint, a catch of light a curious eye finds, never a beacon.
- Glint: a sun star ≤ 45 m on a point of the thing's surface picked by a ray from the eye (water: round the spot; doorway: along the jamb), ≥ 2.5 % of the view's height; a beat every 1.1–3.6 s, some kinds 2 sparkles.
- Bloom: swells and fades over 1.8 s each beat: ≤ 14 m (hearth 7 m) a glare at the thing (hearth: a faint halo; water: flat; doorway: tall), farther a soft shaft of sunlight leaning from the sun's side (hearth: the glow in the smoke over the roof).
- Edge glare: the thing out of view: the same swell in the thing's colour warmed, a thin faint band at the view's edge on its side (behind: the nearer shoulder); as the thing comes into view it slides from the edge onto it, shrinks and hands over to the bloom.
- Strength by need (eased 0.4 s): full from 18 m, 30 % within 2 m (a doorway: by the thing's distance), × 0.15 with the thing within ~4° of the view's middle (fading out to 13°).
- Rooms: `ROOMS` in `hints.js`, in each placement's local space; doorways from `urasa/frame.js` and `balagan/dims.js`.
- Ripples are the lake's own (`world.life.water.ring`); the fire's lift is `fireplace.stir(k)`.

## Finder (`src/ui/guide.js`, DOM only)
- `game.guide.go({ key, id, at })` (the journal's map; `clear()`, `dest`): a gold diamond with the distance over the destination, at the screen edge with an arrow when out of view, a soft shimmer within 7 m. An entry (`id`): its nearest place, until found. A job: the nearest of its things, re-chosen as you go (mowing: the nearer scythe; with one in the hands, the standing grass nearest you); a spot (`at`) or a job: until within 3 m.
- Places: `world.interactables` (bounding-box centre; zones at their centre). Entries with no place (`mogol-urasa`, `ornament`, `urung-aar-toyon-aiyy`, `baay-bayanay`, `algys`, `ysyakh`, `osuokhai`, `olonkho`) are found through the dashed related link in a card that names them (`.chip.told`); their marker is that card's place.
- Winter place (`sayylyk-kystyk`): no marker unless chosen; `src/interact/glint.js` flashes a star on the winter balagan's west window every 5–12 s, seen from 40–400 m while the sun lights that wall and it faces you, until found (one sprite added before the warm-up).
- First visit: language from `navigator.languages` (`detectLang`: `sah` anywhere → Sakha; first language ru/be/uk → Russian; else English); a pick on the title or in settings sets `save.langSet` and wins.
