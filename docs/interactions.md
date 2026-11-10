# Interactions

Code: E flow in `src/main.js` (`use`, `read`, `actOf`, `closeUI`, prompt in `frame`); windows in `src/ui/ui.js`, drawn cursor in `src/ui/cursor.js`, journal finder in `src/ui/guide.js`; hands-on logic in `src/interact/` (`index.js` wiring + berries, `hands.js` carrying, `seat.js` sitting, `work/` jobs); props in `src/models/chores.js` and `src/models/work.js` (built before the warm-up, so no runtime shader compiles).

## Flow
- E on a thing: its act if it has one, else its card as a **peek** (side panel, title + lead; you walk on, 3 m away closes it); E again on it (or with nothing in view) → **full** text, a centred window (you stand still); E again → closed.
- Full card and journal are mouse-driven: wheel, scrollbar drag, image arrows/thumbnails, related links, the red close button, the language button, a click on the backdrop closes. Keys: E (J for the journal) close (Esc too, but it drops the lock, so footers show only E / J), PgUp/PgDn/↑/↓ scroll, `[` `]` images, L language. Phones: native touch scrolling, the touch close + language buttons (window buttons hidden).
- **Pointer lock is taken once** (title click) and kept: browsers show their "Esc to return the mouse" banner on every grant. While a window or the pause menu is up, `movementX/Y` drive a drawn cursor (`#vcursor`) that hit-tests with `elementFromPoint` and dispatches clicks (sliders drag, a `<select>` steps to its next option); `.vh` / `.vdown` stand in for :hover / :active.
- **Pause:** P keeps the lock (`game.pause()`, `ui.setMenu(true)`): Continue / P / a backdrop click just hides the menu, no banner. Esc or losing focus: the browser drops the lock (no browser lets a page keep it), any window closes, the menu shows, and Continue re-locks exactly once (`Input.locking`: one request in flight; the menu hides only when the lock is granted). Safari therefore shows its banner only after an Esc. Keyboard Lock (`navigator.keyboard.lock(['Escape'])`) is not used: Chromium only, and only in element fullscreen, which the game has none of. **Exit** (`game.exit()`): saves, `window.close()` (refused only in a tab holding an earlier page), otherwise the title screen and back to that page (not when it is the game again).
- Acts run while you walk and look. Only `act.freeze: true` holds the player: the ribbon colour choice (serge, sacred birch), the birch bow, the choron sprinkle, the 0.9 s turn as you sit.
- `ui.showEntry(id, { mode: 'peek'|'full' })`, `ui.close()`, `ui.scroll(dy)`, `ui.modal` (journal or full card up: player and focus paused), `ui.onAction('close'|'lang'|'guide'|'learn', id)` (window buttons, journal tiles, card links → main.js), `game.paused`.
- Interactable hooks: `off` (not focusable), `take`, `berries`, `sit`, `fireplace: { pos(), upright, fuel() }`. `game.interact.actFor(it)` overrides `it.act` while carrying; `idleAct()` is E with nothing in focus. `game.useReady` = E would do something (touch act button). `game.choosing` = a `choose()` prompt is up (touch 1·2·3 row).

## Journal finder
- Journal: found / total, found tiles open their card, the rest show "?" and a where-to-look hint (`src/data/hints.json`, sah/en/ru by hand). Choosing one (`game.setGuide(id)`, again to drop) puts a gold diamond with the distance over its nearest place, clamped to the screen edge with an arrow when out of view, plus a soft shimmer within 7 m. Cleared when found. DOM only.
- Places come from `world.interactables` (bounding-box centre; zones at their centre). Entries with no place (`mogol-urasa`, `ornament`, `urung-aar-toyon-aiyy`, `baay-bayanay`, `algys`, `ysyakh`, `osuokhai`, `olonkho`) are found by following their dashed related link in a card that names them (`.chip.told`); the finder points at the nearest such card's place.
- Winter place (кыстык, `sayylyk-kystyk`): no marker unless chosen. In-world hint `src/interact/glint.js`: a brief additive star on the winter balagan's west window every 5–12 s, seen from 40–400 m while the sun lights that wall and it faces you; never once found. One sprite added before the warm-up; only its opacity uniform and scale change.
- First visit: language from `navigator.languages` (`detectLang` in `i18n.js`: `sah` anywhere → Sakha; first language ru / be / uk → Russian; else English). A pick on the title or in settings sets `save.langSet` and wins from then on.

## Hands-on acts
| Act | Where | Notes |
|---|---|---|
| Doors, gate rails | ampaar, balagan, күрүө | non-blocking |
| Carry the мас ыаҕас | wooden water pail by the uraha door | take, carry, set down anywhere (not into the lake) |
| Scoop water / pour it back | any shore, looking down at the water | pail shows water; pouring back only into the lake |
| Firewood | woodpile → billet in arms | set down, or lay it on the balagan or uraha fire: it burns down over 60 s, fire brighter; loose billets gather into an armful (≤4), E on the woodpile stacks it |
| Sit / stand | every орон bench | view turns to the room and lowers; E, a step or a jump stands up |
| Pick дьэдьэн | 8 wild-strawberry patches round the yard | tiny conical red berries; a handful, regrows after 4 min |
| Feed the fire, churn, bellows, tie a ribbon, khomus, lake milk | model acts (`act` in each model) | |
| Sprinkle, then drink (`urasa.js` `sprinkle`) | the guest's choron on the board in the kymys corner | the ladle fills it from the симиир; the view turns side-on to the fire (facing it the choron is a silhouette); drops to the fire, earth, sky (tilts ≤0.5 rad: drops only); drink: it tips about the near rim at the lips, the kymys running out over it, until what it held at the start is left; set back, view restored |

## Work (`src/interact/work/`)
- A placed model names its job in `object.userData.work.job` (`JOBS` in `index.js`).
- `Work` (`index.js`, `game.work`): jobs are asked for an act before the carrying code (`actFor(it)` → act, `null` = nothing, `undefined` = not mine; `idleAct()`); `meter(v, lo, hi)` = the gauge by the crosshair (`#gauge`), `hint(key, text)` = advice toast (once a visit, 3 in all), `count(key)` → `save.work`.
- Tools are carried things: `hands.addKind(kind, hold, lie)`, `hands.addThing({ kind, obj, it, name })`, `it.thing`; `hands.pose(dt, cam)` → `{ p, q, world? }` drives the held tool during a job.
- A job's movable parts are scene children marked `userData.dynamic`; after moving one, clear its `userData.sphere` (the look-at cache).
- Keys: every job plays with E alone (hold and release, or two taps on touch) and the look direction.

| Job | Where | How |
|---|---|---|
| Мас хайытыы (`split.js`) | chopping block by the woodpile | take the axe from the block → E on the rounds: one stands on the block → hold E (gauge up and down), release: the blow lands where you look. In line with the dark crack (≤4.5 cm off, ≤26° turned) and above the gauge's mark it splits: round → 2 halves (tumble off, stand each again) → 2 billets each. Right line but weak: the axe sticks, E lifts the round on it and brings it down. Across the grain: stuck, E pulls it free. Over the top mark: a wild blow (scatter). Two rounds (8 quarters) exist: stack or burn the billets to free them. |
| Туу (`fish.js`) | weir in the lake shallows, east of the net rack (`src/models/fishery.js`) | take the trap → E on the weir's gap sets it → мунду come in over minutes (fast at first, ~110 s to two thirds) → hold E on the trap lifts it → E on the тымтай on the shore opens the tail clamp and tips the catch in (count: `save.work.mundu`) |
| От охсуу (`hay.js`) | the scythe post by the hay meadow fence (`src/models/hayfield.js`) | take the саха хотуура → hold E anywhere (gauge), release: the blow mows the real meadow in a half-circle before you (reach 2.1 m, ±60°; `world._field.mask.mow` rewrites the grass mask, only the touched block is uploaded) and lays cut wisps; E on the post hangs it up (`save.work.mown` m², `blows`) |
| Туос үлэтэ: тордуйа (`tuos.js`) | the bark sheet on the craft spot's hide (`src/models/barkwork.js`) | take the sheet → hold E at a hearth fire (gauge: release in the band; under: stiff, over: scorched) → soft for 150 s → E on the craft spot lays it on the hide → E ×2 folds the long sides, E ×2 folds each end with its corner flaps and pegs → the тордуйа is carried; дьэдьэн picked while it is held go into it (`save.work.torduya`, `berries`) |
| Хаппыт мас (`gather.js`) | under the first trees north of the homestead (`src/models/drywood.js`) | nine dry branches: each is a 'log' of the carrying code (armful of four → woodpile or a fire); one lies there again 5 min after it was used (`save.work.drywood`) |
| Уус кыһата (`src/models/yardlife/smithy.js`) | the smith's lean-to | the helper's part: each E on the forge presses one bag (the gauge = the blast; even strokes 0.1–1.25 s apart build it) → the blank in the coals heats with it → E on the blank: tongs to the anvil → E: hammer blows, three passes of five while it glows (уһугун тардыы, хаптатыы, биитин таптайыы; the gauge = its heat), back to the coals when it cools → quench in the tub. A full blast held on a hot blank burns it (the pass again). `it.live()` gives the blank's act of the moment (`save.work.hammer`, `blades`) |
| Кымыһы хамнатыы (`src/models/urasa.js` `churn`) | the симиир in the uraha | one stroke per E; the gauge is the pause since the last stroke (even: 0.12–1.1 s); 12 even strokes in a row: the kymys foams, its card opens (`save.work.churn`, `kymys`) |
- Journal: the Work section lists every job (`src/interact/work/list.js` `WORKS`): its counts once done, else where it waits.

## Left out on purpose (research "do not gamify")
- The forge work was left out at first (the smith's craft is close to the shaman's); added 2026-11-10 at the maintainer's request as the helper's part. The smith's initiation and the patron Кудай Бахсы stay on the card.
- Skimming stones on the lake (Эбэ, the lake's иччи, is "grandmother": no throwing things in), pushing the salama or ribbons (offerings, not toys), anything thrown into a fire except a laid billet.
