# Model modules (`src/models/*.js`)

One file per placeable thing in `src/world/layout.js` (`model: 'serge'` → `src/models/serge.js`).

## Contract
```js
export default async function build(ctx, placement) {
  // ctx: { THREE (three/webgpu), TSL (three/tsl), pbr, maps, tex, rng, terrain, world }
  // placement: { x, y, z, yaw, variant? } — the loader applies the world position; build in local space
  return {
    object,          // THREE.Group, origin = ground centre, +Y up, front/door faces +X (east)
    colliders,       // [{ x, z, hw, hd, rot?, y0?, y1? }] boxes or [{ x, z, r }] circles, local metres
    floors,          // [{ x, z, hw, hd, rot?, h }] walkable surfaces above ground (local h)
    lows,            // [{ x, z, hw, hd, rot?, h }] low lintels: clear height; the player stoops under them
    interactables,   // [{ entry, target?, zone?: { x, z, r }, label?: { sah, en }, act? }]
    update,          // optional (dt, { time, camera, player, game }) => void
  };
}
```
- `entry` = an id in `src/data/entries.json`. `target` = the Object3D looked at (raycast ≤3.4 m; among hits within 0.6 m of the first the smallest target wins, so a proxy inside a bigger one takes `side: BackSide` to answer from inside only, as the uraha lining); `zone` = a circle the player stands in.
- `act` = `{ id, label: { sah, en }, once?: true, freeze?: true, run: async (game, it) => {} }`, run when the do input goes down on the thing (a lasting motion reads `game.input.doing`). `freeze` holds the player: only for acts that move the view or ask a choice. Hooks: `docs/interactions.md`. Sounds: `game.audio?.play(name, pos)`.
- Collider `y0`/`y1` compare with the player's world feet height: add `placement.y`.
- Indoors: raise `game.engine.exposureTarget` (base 0.62) while the player is inside, back to 0.62 outside.
- Materials: `pbr(id, { repeat, tint, normalScale })` from `public/assets/tex/<id>/`; new sets go in `tools/fetch-assets.mjs`, then `npm run fetch-assets`. TSL procedural detail welcome. Real-world metres.
- Forged iron (`yardlife/forged.js`): flat-shaded bars and blocks, wear and scale in vertex colours, no rng draws; thin plank-textured wood (hafts, laths) takes `grainAlong`, `haftGeo` or `addLog` `grain: true` (the grain along it, else it reads as ringed bamboo).
- Shadows: meshes receive by default and cast only with `castShadow = true` (not on tiny parts and ground cover). Static casters merge into one shadow proxy per model (`merge.js`): mark a part that moves or hides later `userData.dynamic = true` (act/take targets are kept out already).
- Log ends: `turned(…, { endGrain: true })` flags the caps (blue vertex colour); `larch` and `barkPole` draw rings, heart and checks there. `hew: n` (`turned`, the balagan's `log`) cuts both ends to a blunt axe wedge over n radii (fence rails, the berm's retaining logs).
- Alpha-tested materials carry alpha in `colorNode` (vec4): the shadow pass reads `colorNode.a`, so a vec3 casts no shadow.
- `envMapIntensity` works only with `material.envMap` set; to dim sky light indoors assign `scene.environment` as `envMap` (`balagan/mats.js`).
- Grass hints, local coords: `object.userData.paths = [{ w, pts: [[x, z], …] }]` (cut, a short sparse sward stays), `.mown = [{ x, z, rx, rz }]` (short), `.bare = [{ x, z, r } | { x, z, hw, hd }]` (earth floors: no blade or flower).
- Scale: eye 1.62 m (stoop/crouch 1.05). Low doors on purpose (stoop via `lows`): balagan 0.86 × 1.55 m, ampaar ~1.4 m over its threshold.
- Budget: ≤150k triangles and ≤40 draw calls per building (merge static parts by material); small objects ≤10k triangles.

## Buildings
- Balagan: frame 5.7 × 4.7 m, khoton 5.2 × 5 m (narrower, its walls run into the house's north wall); no measured plans found in sources. Nothing crosses the dark lining or the plaster: the roof underside starts just outside the lining, ceiling poles, bark and matitsa end inside the plaster, interior parts follow `inner(F, y)` of the leaning walls; door bays lean back into the roof's underside; the passage's board sides follow the leaning wall; the berm is curbed behind the retaining logs, slumps elsewhere, and the khoton bank ends inside the house berm; sod tops are one sheet from the edge ring to the middle line; outdoor wood uses `M.outWood` / `M.doorWood` (`M.interior` gets the indoor sky cut, and `indoorAO` reads door leaves as deep indoors).
- Balagan hearth: the hood's 26 poles are ribs in the shell (`hearth.js` `POLES`) and in the `clay` material (same count); its light stands before the mouth (reach 9 m). A close look (`closeLook`) moves the door light beside the eye (`NEAR_FILL`).
- Uraha: ~10 m across, ~11 m to the tie (profile `CTRL` in `urasa/frame.js`; sources in its entry's notes); 12 carved posts of 2.03 m, a horsehair cord with white tassels (салама) between them, three hoops, 96 inner poles (sampled by profile bend, `poleRows`), 36 outer; door 1.0 × 1.74 m; ~125k triangles, 25 materials (viewer). The inner bark is one watertight surface; the door cut runs up inside the leaning jambs and ends inside the lintel (`DOOR.cutY`); a rolled rim closes the smoke hole; the cover runs 20 cm into the ground. Interior materials take only the fire light, the outside only the sun.
- Chorons hold kymys (`urasa/kymys.js` `kymysSurface`): a volume (`vol`, m³) kept level as the cup tilts; past `capacity` it spills; the surface's uv.x runs 0 (middle) → 1 (wall): froth ring and thin edge (`kymys` material).
- Дьэдьэн (`chores/dyedyen.js`): colonies at `COLONIES` (yard margins, the slope above, the forest's edge), each a short-sward opening with crowns 0.6 m across (the pick targets) and runner plants between; leaves, berries and flower trusses instanced per ~45 m region, on the unrendered layer beyond 80 m, berries and flowers beyond 40 m (low and phones: 45 and 25 m, fewer leaves and berries); berries and flowers grow with distance past 3 m, up to ×3.
- An `InstancedMesh` in a model is `userData.dynamic`: `merge.js` size-culls by one instance's bounds at the model's origin.
- Yard props by the uraha (`yardlife` paths, `chores` pail) take its position from `layout.js` and its door radius from `urasa/frame.js` `DOOR.r`.

## Baked geometry (`src/load/geocache.js`)
- Heavy pure geometry goes in `section(fn)`: fn returns geometries, typed arrays or plain data and may use the build's rng streams; no meshes, materials, scene-graph adds or collider pushes inside (yard pieces: `geoPiece(K, fn)` keeps `K.colliders`). Sections don't nest into buckets' `build()`.
- Buckets (`balagan/geo.js` `Buckets`, `yardlife/kit.js` `Bucket`) come merged from the pack; their materials need a stable key: a name in a `geoMats(dict)` dictionary, or a kit `pmat`/`decalMat` recipe.
- Behaviour (updates, acts, targets, colliders) stays in code. After a change: `npm run bake-geometry`.

## Checking a model
- `viewer.html?m=<model>[&variant=][&cam=x,y,z][&look=x,y,z][&sun=elev,az]` on `npm run dev`: orbit camera, info line with triangles and interactables; headless via `npm run shot` (`docs/testing.md`).
- In the game: `/?auto&at=x,z,yaw` places the player.
