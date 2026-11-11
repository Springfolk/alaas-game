# Materials

three builds one shader per distinct node graph, keyed by **node identity**: materials with the same maths but their own nodes cost a build each. A build is main-thread JS (Chrome ~5–8 ms, slower in WebKit), mostly spent on the graph itself, not on the lights, environment and fog every lit material shares.

## Master materials (`src/engine/master.js`)
- `shareGraphs(materials)` (`world.js`, before the homestead and each nature module joins the scene) groups materials by graph **shape** (structure, plus identity for Fn bodies, light sets, references and shared nodes); each group gets one master graph. Leaves that differ are read from the material: a constant as a `_m<k>` property, a private uniform as a `_m<k>` getter, a texture via the shared TextureNode sampling `material[_m<k>]`. `?nomaster` off.
- `sourceRef(name, type)`: a material reference that, in the sun's shadow pass, reads the drawn object's own material.
- Derived materials (impostor bakes, `lod.js` `bakeMat`) and clones carry the values over: `inheritParams` (patched into `Material.copy`).
- `shapeKey(m)`: a material's shape key, for finding why two materials don't share.

## Writing factories that share
- Hoist `Fn`s to module level with their varying inputs as parameters (a per-call `Fn(...)` is its own graph: `yard/mat.js` `bumpFn`, `trees/materials.js` `windFns`).
- Express features as weights, not `if`s (`barkMaterial`: one graph for every species but birch).
- Per-material numbers go in `_`-prefixed properties (`grass.js` flowers `_f*` via `sourceRef`; kit `pmat` `_p*`): three keys builds by every other own number as zero/non-zero, so values in ordinary fields split builds.
- Don't merge unrelated graphs into one shader with branches on a per-material index: build time barely falls and 8+ branches double GPU time.
- Procedural detail can't be baked to textures: most model graphs work in `positionLocal` or world space on tiling metre-UVs (no unique unwraps).

## Light set
- One set for the homestead: the sun and two **local lights** (`LocalLightNode`) whose colour × intensity, position, range and decay come from the material (`_l<i>c|p|d|k`, getters on the model's own point lights; `useLights`, ≤2 per model). Every model shares the builds; a house is lit only by its own fire.
- The sun is scaled by `_sun` (sun colour × `sunMask`). Opt-outs: `noSun(m)` (urasa interior: shadow-map leaks), `noLocalLights(m)` (urasa cover: no fire through the bark).
- Nature keeps a sun-only set.

## Tools
- `node tools/shaders.mjs [chrome|webkit] [query] [out.json]` (`PORT`): every build from navigation to complete with object, material, pass, light set and geometry layout; counts per pass and material, main-thread build time, longest slice. `TOP=n` slowest; `COVERED=1` the key-art load.
