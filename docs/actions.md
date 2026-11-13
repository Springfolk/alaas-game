# Actions

Every act is a tap of the do input and one tap plays the whole act; nothing is held (`docs/interactions.md`). Nothing has a fail state.

| Action | Where | A tap | The world answers |
|---|---|---|---|
| Doors | ampaar, balagan | a push; a push on the way turns the leaf back | it gathers speed by its weight, knocks on its stop and settles (`swing` in `yard/bits.js`); the leaf is solid wherever it stands and stops at the player (`leaf`) |
| Gate rails (сүрдьүгэс) | күрүө | opening: drawn out of the south post (0.8 s); closing: run home | once free they swing aside and knock |
| Мас ыаҕас | by the uraha door | takes it; put down anywhere dry. At water, looking down: a dip, full. With water, looking down: tipped until empty | the water stands as high as filled; the fuller pail hangs lower and trails more; a strand runs from the rim while it pours |
| Firewood | woodpile, loose billets, nine dry branches under the north trees (`gather.js`, `save.work.drywood`) | on the pile: an armful (4), one after another; with billets on the pile, or put down by it: stacks them all; put down elsewhere drops one. On a hearth: leans every carried billet into the fire between its billets | each billet knocks; the view dips as the load comes on; a laid billet burns down over 60 s, the fire brighter (`fireplace.fuel()`); a branch lies again 5 min after use |
| Sit / stand | every орон bench | on the bench; with nothing in view, a step or a jump stands up | the view turns to the room and lowers |
| Дьэдьэн | the crowns of 24 colonies: yard margins, the slope above, the forest's edge | the whole crown, berry by berry | berries leave the plant (into a carried тордуйа); full again 4 min after the last |
| Tar tub lid | ampaar | once | the lid stays aside |
| Feed the fire | uraha hearth, summer balagan hearth (empty hands) | a pinch | rises from below the view, glides low and slowly to the fire and is set down in it (`offerPath`, src/models/yard/offer.js); it flares softly |
| The guest's choron (`rites.js` `Choron`) | the board in the kymys corner | the ladle fills it, it comes into the hands; the view is led to the fire, the earth, the sky: the cup tips slowly, a few drops each (for the fire set down on it like the pinch); a sip; back on its board | held upright, its kymys level; the fire flares as the drops reach it; sky drops rise a hand's breadth and fall; the sip stops at what it held before the ladle |
| Lake milk (`Cup`) | the cup on the offering stone | carried from the stone out over the nearest open water, tipped until empty, set back | a white strand, rings on the water; empty for the rest of the visit |
| Khomus (`Khomus`) | its peg in the summer balagan | takes it to the lips; then one pluck, taps in rhythm play on; put down: back on the peg | the frame hums after a stroke; not after dark (the card says why) |
| Ribbon | salama on the serge; the sacred birch: a white, a blue and a red ribbon draped over a low limb at eye height, each its own target | serge: ties a white ribbon. Birch: the one aimed at; the bow (head down a breath, up), it glides to its place nearer the trunk | the ribbon unrolls from the knot; the other two stay draped, no longer offered; kept in the save |

## Jobs (`src/interact/work/`)
- A job starts with one tap at any of its things, or with free hands near it (`idleAct`, `it.around`). Watched jobs play in a framed work view (`docs/interactions.md`); leaving stops at the next step and the next tap goes on from there.

| Job | Where | The player | It plays |
|---|---|---|---|
| Уус кыһата (`yardlife/smithy.js`) | the smith's lean-to, within 3.4 m of the anvil | one tap, watches (~16 s) | the bags press in turn and the coals flare, the blank glows; the tongs carry it to the anvil; 3 passes of 3 blows in the smith's beat, each drawing it longer, flatter, wider (point, flatten, edge), sparks, the iron dulling to red; back to the coals when dull; held over the tub, quenched in steam; the knife close up on the anvil (`save.work.hammer`, `blades`) |
| Мас хайытыы (`split.js`) | chopping block by the woodpile, within 2.2 m facing it | one tap frames the block; every tap a blow (an early tap is kept) | the axe lifts out of the block; a round stands up by itself, a blow opens it, the halves fall aside; each half stands up by itself and opens into 2 billets, which fall aside for the carrying code; nothing left: the view returns, the axe back in the block. Two rounds (8 quarters); stack or burn the billets to free them (`save.work.rounds`, `billets`, `stacked`) |
| Туу (`fish.js`) | weir in the lake shallows, east of the net rack (`fishery.js`), within 3.2 m | two taps, two scenes (~4 s, ~8 s) | set: the trap carried from the shore into the gap, rings. Lift (after мунду came in: ~110 s to two thirds): up out of the water streaming, the fish flapping, carried over the тымтай, tipped tail-down, the catch slides in, the trap back on the shore (`save.work.mundu`) |
| От охсуу (`hay.js`) | two scythe posts, each with its scythe: the home meadow's edge and the hay crew's camp by the winter place (`hayfield.js`, `haybase.js`), then anywhere | takes the саха хотуура; each tap a blow from above one shoulder down across to the other, right and left in turn; put down by the post hangs it up | mows the real meadow in a half-circle (`world._field.mask.mow`): full 2.1 m and ±60°, low shorter and narrower; cut wisps lie on the side the blade ends (`save.work.mown` m², `blows`); every blow is kept (`save.work.swaths`: x, z dm, yaw, power, side) and cut again at load once the meadow's texels are in (`mask.whenLoaded`) |
| Туос үлэтэ: тордуйа (`tuos.js`) | the bark sheet on the craft spot's hide (`barkwork.js`): take it; any hearth within 3.2 m | one tap by the fire, watches (~11 s) | held over the hearth's rim: 3 passes through the heat, the long edges lifting each time; the two long walls fold up, then each end with its corner flaps and peg; the vessel close up, then carried; дьэдьэн picked while it is held drop in (`save.work.torduya`, `berries`) |
| Кымыһы хамнатыы (`urasa.js` `churn`) | the симиир in the uraha | one tap, watches (~8 s) | the хамнатар up and plunged, a turn of the wrist each stroke, the sack swelling at each plunge; the froth rises with the strokes and foams over the collar after 8 (stays 90 s; `save.work.churn`, `kymys`) |

- Journal: a picture per job (`work/list.js` `WORKS`); a tap shows its counts, or where it waits.

## Left out on purpose (research: "do not gamify")
- The forge is only watched (the smith's craft is close to the shaman's); the smith's initiation and the patron Кудай Бахсы stay on the card.
- Skimming stones (Эбэ, the lake's иччи, is "grandmother": nothing is thrown in), pushing the salama or ribbons (offerings, not toys), anything put into a fire but the offering itself (the pinch, the drops of kymys) and a laid billet. No rite can go wrong: the choron, the lake's milk, the bow and the ribbon have no fail state.
