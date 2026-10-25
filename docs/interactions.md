# Interactions

Code: E flow in `src/main.js` (`use`, `read`, `actOf`, `closeUI`, prompt in `frame`); windows in `src/ui/ui.js`, drawn cursor in `src/ui/cursor.js`, journal finder in `src/ui/guide.js`; hands-on logic in `src/interact/` (`index.js` wiring + berries, `hands.js` carrying, `seat.js` sitting); props in `src/models/chores.js` (built before the warm-up, so no runtime shader compiles).

## Flow
- E on a thing: its act if it has one, else its card as a **peek** (side panel, title + lead; you walk on, 3 m away closes it); E again on it (or with nothing in view) → **full** text, a centred window (you stand still); E again → closed.
- Full card and journal are mouse-driven: wheel, scrollbar drag, image arrows/thumbnails, related links, the red close button, the language button, a click on the backdrop closes. Keys: E (J for the journal) close (Esc too, but it drops the lock, so footers show only E / J), PgUp/PgDn/↑/↓ scroll, `[` `]` images, L language. Phones: native touch scrolling, the touch close + language buttons (window buttons hidden).
- **Pointer lock is taken once** (title click) and kept: browsers show their "Esc to return the mouse" banner on every grant. While a window or the pause menu is up, `movementX/Y` drive a drawn cursor (`#vcursor`) that hit-tests with `elementFromPoint` and dispatches clicks (sliders drag, a `<select>` steps to its next option); `.vh` / `.vdown` stand in for :hover / :active.
- **Pause:** P keeps the lock (`game.pause()`, `ui.setMenu(true)`): Continue / P / a backdrop click just hides the menu, no banner. Esc or losing focus: the browser drops the lock (no browser lets a page keep it), any window closes, the menu shows, and Continue re-locks exactly once (`Input.locking`: one request in flight; the menu hides only when the lock is granted). Safari therefore shows its banner only after an Esc. Keyboard Lock (`navigator.keyboard.lock(['Escape'])`) is not used: Chromium only, and only in element fullscreen, which the game has none of.
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
| Firewood | woodpile → billet in arms | set down, or lay it on the balagan or uraha fire: it burns down over 60 s, fire brighter |
| Sit / stand | every орон bench | view turns to the room and lowers; E, a step or a jump stands up |
| Pick дьэдьэн | 8 wild-strawberry patches round the yard | tiny conical red berries; a handful, regrows after 4 min |
| Feed the fire, churn, bellows, tie a ribbon, khomus, lake milk | model acts (`act` in each model) | |

## Left out on purpose (research "do not gamify")
- Skimming stones on the lake (Эбэ, the lake's иччи, is "grandmother": no throwing things in), striking the smith's anvil (the smith's craft is close to the shaman's), pushing the salama or ribbons (offerings, not toys), anything thrown into a fire except a laid billet.
