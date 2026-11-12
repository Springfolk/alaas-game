# Actions

Every act is a tap of the do input; nothing is held (`docs/interactions.md`). Nothing has a fail state.

| Action | Where | A tap | The world answers |
|---|---|---|---|
| Doors | ampaar, balagan | a push; a push on the way turns the leaf back | it gathers speed by its weight, knocks on its stop and settles (`swing` in `yard/bits.js`); the leaf is solid wherever it stands and stops at the player (`leaf`) |
| Gate rails (сүрдьүгэс) | күрүө | opening: drawn out of the south post (0.8 s); closing: run home | once free they swing aside and knock |
| Мас ыаҕас | by the uraha door | takes it; put down anywhere dry. At water, looking down: a dip, half a pail. With water, looking down: a third tips out | the water stands as high as filled; the fuller pail hangs lower and trails more; a strand runs from the rim while it pours |
| Firewood | woodpile, loose billets, nine dry branches under the north trees (`gather.js`, `save.work.drywood`) | on the pile: a billet, taps that follow add one each (≤4); with billets: stacks one; put down by the pile stacks all, elsewhere drops one. On a hearth: lays one | each billet knocks; the view dips as the load comes on; a laid billet burns down over 60 s, the fire brighter (`fireplace.fuel()`); a branch lies again 5 min after use |
| Sit / stand | every орон bench | on the bench; with nothing in view, a step or a jump stands up | the view turns to the room and lowers |
| Дьэдьэн | the crowns of 24 colonies: yard margins, the slope above, the forest's edge | three berries | berries leave the plant (into a carried тордуйа); full again 4 min after the last |
| Tar tub lid | ampaar | once | the lid stays aside |
| Feed the fire | uraha hearth, summer balagan hearth (empty hands) | a pinch | carried slowly to the fire and set down on it; it flares softly |
| The guest's choron (`rites.js` `Choron`) | the board in the kymys corner | the ladle fills it, it comes into the hands. Aimed at the fire, down at the earth or up at the sky: the cup tips a little, sprinkling drops that way; else a sip. Put down (or tap the board): back in place | held upright, its kymys level; aimed at the hearth the fire flares; a sip stops at what it held before the ladle; it goes back by itself when you leave the uraha |
| Lake milk (`Cup`) | the cup on the offering stone | takes it; looking down at water, a third of it; put down: back on the stone | a white strand, rings on the water; only over water; empty for the rest of the visit |
| Khomus (`Khomus`) | its peg in the summer balagan | takes it to the lips; then one pluck, taps in rhythm play on; put down: back on the peg | the frame hums after a stroke; not after dark (the card says why) |
| Ribbon | salama on the serge; the sacred birch | serge: ties. Birch: the bow (head down a breath, up). Then three strips under the look: mouse, ← → or 1 2 3 choose, do ties, put down / Esc leaves (touch: tap a strip or ✕) | the ribbon unrolls from the knot; kept in the save |

## Jobs (`src/interact/work/`)
- A job's tool works at its object from anywhere near it, wherever the look is (`idleAct`, `it.around`). Taps in rhythm: a tap before the tool is back counts, lower (≈0.45–1 of a full stroke).

| Job | Where | Taps | Progress shows in |
|---|---|---|---|
| Мас хайытыы (`split.js`) | chopping block by the woodpile, within 2.2 m facing it | the axe from the block; a round onto the block (the axe comes out into free hands first); each tap a blow down the crack; a fallen half back onto the block; put down by the free block: the axe back in. Round: 1 full blow (a low one bites in, the next tap lifts and slams it open); half: 1 | round → 2 halves → 2 billets each, by the block; two rounds (8 quarters): stack or burn the billets to free them (`save.work.rounds`, `billets`, `stacked`) |
| Туу (`fish.js`) | weir in the lake shallows, east of the net rack (`fishery.js`), within 3.2 m | take the trap; set it in the gap; out: 3 taps; at the тымтай (2.6 m): each tap a third of the catch | мунду come in over minutes (~110 s to two thirds) and show through the wicker; the trap rises a third a tap; the carrier fills (`save.work.mundu`) |
| От охсуу (`hay.js`) | two scythe posts, each with its scythe: the home meadow's edge and the hay crew's camp by the winter place (`hayfield.js`, `haybase.js`), then anywhere | takes the саха хотуура; each tap a blow from above one shoulder down across to the other, right and left in turn; put down by the post hangs it up | mows the real meadow in a half-circle (`world._field.mask.mow`): full 2.1 m and ±60°, low shorter and narrower; cut wisps lie on the side the blade ends (`save.work.mown` m², `blows`); every blow is kept (`save.work.swaths`: x, z dm, yaw, power, side) and cut again at load once the meadow's texels are in (`mask.whenLoaded`) |
| Туос үлэтэ: тордуйа (`tuos.js`) | the bark sheet on the craft spot's hide (`barkwork.js`); any hearth within 3.2 m | takes the sheet (also on the craft spot); 3 passes over the fire; 4 folds, held before the eye or laid on the hide: the long sides, then each end with its corner flaps and peg (7 taps) | the long edges lift a step each pass and stand when soft (300 s, then warm again); each fold stays up; the pegs go in. The тордуйа is carried; дьэдьэн picked while it is held drop in (`save.work.torduya`, `berries`) |
| Уус кыһата (`yardlife/smithy.js`) | the smith's lean-to, within 3.4 m of the anvil | the helper's part: 3 presses of the bellows; the blank in the tongs to the anvil; 3 blows a pass, 3 passes; dark iron: back to the coals; the quench (about 13 taps) | coals and fire light answer each press, the blank (1.5× size) its heat in its colour (`NEED` 0.58, dark under 0.3); each blow on bright iron draws it longer, thinner and wider and throws sparks, each pass a new shape, the prompt names the pass (уһугун тарт, хаптат, биитин таптай); steam off the tub (`it.live()`; `save.work.hammer`, `blades`) |
| Кымыһы хамнатыы (`urasa.js` `churn`) | the симиир in the uraha | each tap a stroke: the хамнатар up and plunged; an early tap a short stroke | the sack swells; froth rises at the collar with the strokes and falls if left (8 full strokes: it foams over and stays 90 s; `save.work.churn`, `kymys`) |

- Journal: a picture per job (`work/list.js` `WORKS`); a tap shows its counts, or where it waits.

## Left out on purpose (research: "do not gamify")
- The forge is played only as the helper's part (the smith's craft is close to the shaman's); the smith's initiation and the patron Кудай Бахсы stay on the card.
- Skimming stones (Эбэ, the lake's иччи, is "grandmother": nothing is thrown in), pushing the salama or ribbons (offerings, not toys), anything put into a fire but the offering itself (the pinch, the drops of kymys) and a laid billet. No rite can go wrong: the choron, the lake's milk, the bow and the ribbon have no fail state.
