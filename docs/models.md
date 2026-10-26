# Model modules (`src/models/*.js`)

One file per placeable thing in `src/world/layout.js` (`model: 'serge'` → `src/models/serge.js`).

## Contract
```js
export default async function build(ctx, placement) {
  // ctx: { THREE (three/webgpu), TSL (three/tsl), pbr, maps, tex, rng, terrain, world }
  // placement: { x, y, z, yaw, variant? } — world position is applied by the loader, build in local space
  return {
    object,          // THREE.Group, local origin = ground centre, +Y up, front/door faces +X (east)
    colliders,       // [{ x, z, hw, hd, rot?, y0?, y1? }] boxes or [{ x, z, r }] circles, local metres
    floors,          // [{ x, z, hw, hd, rot?, h }] walkable surfaces above ground (local h)
    lows,            // [{ x, z, hw, hd, rot?, h }] low lintels: clear height (local h); the player stoops under them
    interactables,   // [{ entry, target?, zone?: { x, z, r }, label?: { sah, en }, act? }]
    update,          // optional (dt, { time, camera, player, game }) => void
  };
}
```
- `entry` = an id in `src/data/entries.json`. `target` = the Object3D the player looks at (raycast ≤3.4 m; among hits within 0.6 m of the first the smallest target wins, so a proxy just inside a bigger one takes `side: BackSide` to answer from inside only — the uraha lining); `zone` = a circle the player stands in.
- `act` = `{ id, label: { sah, en }, once?: true, thenCard?: false, freeze?: true, run: async (game, it) => {} }` — the player keeps walking and looking unless `freeze` (only for acts that move the view or ask a choice). Hooks for `src/interact`: `docs/interactions.md`. It may animate via `update`; `game.audio?.play(name, pos)` plays sounds.
- Indoors: set `game.engine.exposureTarget` (base 0.62) higher when the player is inside, back to 0.62 outside.
- Materials: `pbr(id, { repeat, tint, normalScale })` from `public/assets/tex/<id>/`; add sets to `tools/fetch-assets.mjs` and run `npm run fetch-assets`. Procedural detail via TSL node materials is welcome. Real-world scale in metres.
- Shadows: placed meshes receive by default but cast only when the model sets `castShadow = true` (three's default is off); leave it off on tiny parts and ground cover. Static casters are merged into one shadow proxy per model (`src/engine/merge.js`): mark a part that moves or hides later `userData.dynamic = true` (act/take targets are kept out already).
- Collider `y0`/`y1` are compared with the player's world feet height: add `placement.y`.
- `envMapIntensity` only works with `material.envMap` set; to dim sky light indoors assign `scene.environment` as `envMap` (see `src/models/balagan/mats.js`).
- Grass: set `object.userData.paths = [{ w, pts: [[x, z], …] }]` (cut, a short sparse sward stays), `.mown = [{ x, z, rx, rz }]` (short) and `.bare = [{ x, z, r } | { x, z, hw, hd }]` (earth floors: no blade or flower), local coords.
- Scale: player eye 1.62 m (stoop/crouch 1.05). Doors: balagan 0.86 × 1.55 m and ampaar ~1.4 m over its threshold are low on purpose (stoop via `lows`). No measured balagan/khoton plans were found (Sakha/Russian Wikipedia, ethnographic searches); frame 5.7 × 4.7 m, khoton frame 5.2 × 5 m narrower than the house so its walls run into the north wall.
- Seams: nothing may cross the balagan's dark lining or plaster (roof underside starts just outside the lining, ceiling poles/bark/matitsa end inside the plaster, interior parts follow `inner(F, y)` of the leaning walls). Berm: curbed behind the retaining logs, a slumped toe elsewhere; door gaps slump to a rounded end (a small soil cap closes the rest); the khoton bank ends inside the house berm; door bays (house and khoton) lean back into the roof's underside; the passage's board sides follow the leaning wall, dark lining behind them.
- Balagan outdoor wood uses `M.outWood` / `M.doorWood`: `M.interior` materials get the indoor sky cut everywhere, and `indoorAO(positionLocal)` reads a part built in its own pivot space (door leaves) as deep indoors.
- Sod tops are one sheet drawn in from the edge ring to the middle line (per-ring rounded rects folded and left a slot open).
- Alpha-tested materials must carry alpha in `colorNode` (vec4): the shadow pass takes alpha from `colorNode.a`, so a vec3 casts no shadow (the plaster did not).
- Uraha: ~10 m across at the ground, ~11 m to the tie (profile `CTRL` in `urasa/frame.js`; sources in its entry's notes). 12 posts 2.03 m, three hoops, 96 inner poles reaching the middle hoop, top hoop and tie in turn, 36 outer poles; door 1.0 × 1.74 m. ~113k tris (viewer count), 21 materials; poles are sampled by profile bend (`frame.js` `poleRows`).
- Uraha seams: the inner bark is one watertight surface; the door cut runs straight up inside the leaning jambs and ends level inside the lintel (`DOOR.cutY`); a rolled rim closes the smoke hole; the cover runs 20 cm into the ground. Interior materials take the fire light only (`lightsNode`), so shadow-map leaks never light lines along poles and seams; the outside takes the sun only.
- Chorons hold kymys (`urasa/kymys.js` `kymysSurface`): a level surface fitted to the bowl's inside profile, re-fitted (geometry only) as the guest's choron fills, tilts and is drunk; what would rise over the lip is spilled.
- Yard props that sit by the uraha (`yardlife` paths, `chores` pail) take its position from `layout.js` and its door radius from `urasa/frame.js` `DOOR.r`.
- Budget: ≤150k triangles and ≤40 draw calls per building (merge static parts by material: `BufferGeometryUtils.mergeGeometries`). Small objects ≤10k triangles each.

## Baked geometry (`src/load/geocache.js`)
- Heavy, pure geometry goes in `section(fn)`: fn returns geometries, typed arrays or plain data (Vector3/Box3 ok) and may use the build's rng streams (their state is restored); no meshes, materials, scene-graph adds, collider pushes or material changes inside (yard pieces: `geoPiece(K, fn)` keeps `K.colliders`). Sections don't nest into buckets' `build()`.
- Buckets (`balagan/geo.js` `Buckets`, `yardlife/kit.js` `Bucket`) come merged from the pack; their materials need a stable key: a name in a `geoMats(dict)` dictionary, or a kit `pmat`/`decalMat` recipe.
- Behaviour (updates, acts, targets, colliders) stays in code. After a change: `npm run bake-geometry`.

## Checking a model
- `npm run dev`, then `viewer.html?m=<model>[&variant=][&cam=x,y,z][&look=x,y,z][&sun=elev,az]` (orbit camera, info line shows tris and interactables).
- Headless screenshot: `PORT=<port> node tools/shot.mjs "/viewer.html?m=serge&cam=4,1.6,3&look=0,1,0" out.png 1280 720 2000` (system Chrome, WebGPU). `EVAL="js"` runs code before the shot.
- In the game: `/?auto&at=x,z,yaw` places the player.
