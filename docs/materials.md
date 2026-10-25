# Materials

three builds one shader per distinct node graph: it keys a build by **node identity**, so materials with the same maths but their own nodes cost a build each. A build is main-thread JS: Chrome ~5–8 ms each, more for big procedural graphs, slower in WebKit. Most of that cost is in generating the graph itself, not in the lights, environment and fog every lit material shares (measured: a bare unlit material costs ~60% of a lit one).

## Master materials (`src/engine/master.js`)
- `shareGraphs(materials)` (`world.js`, before the homestead and each nature module joins the scene) groups materials by graph **shape**: structure, plus identity for Fn bodies, light sets, references and nodes several materials share. Each group becomes one master graph. Leaves that differ per material are read from that material:
  - a constant, as a `_m<k>` property;
  - a private uniform, as a `_m<k>` getter on the live uniform;
  - a texture: the shared TextureNode samples `material[_m<k>]`.
  Same maths, one build. `?nomaster` turns it off (A/B).
- `sourceRef(name, type)`: a material reference that, in the sun's shadow pass, reads the drawn object's own material (three draws that pass with its override material).
- Derived materials (impostor bakes, `lod.js` `bakeMat`) and clones carry the values over: `inheritParams` (patched into `Material.copy`).
- To let materials share, write factories whose per-material differences are values, not structure:
  - Hoist `Fn`s to module level, with their varying inputs as parameters. A per-call `Fn(...)` makes its own graph: see `yard/mat.js` `bumpFn` and `trees/materials.js` `windFns`.
  - Express features as weights rather than `if`s (`barkMaterial`: one graph for every species but birch).
  - Pass per-material numbers as properties (`grass.js` flowers: `_f*` through `sourceRef`; kit `pmat`: `_p*`).
- Material properties a shader reads go in `_`-prefixed fields. three keys builds by every other own number as zero/non-zero, so values in ordinary fields split builds.

## Light set
- One set for the whole homestead: the sun and two **local lights** (`LocalLightNode`). Each local light's colour × intensity, position, range and decay come from the material: `_l<i>c|p|d|k`, getters on the model's own point lights (`useLights`, ≤2 per model).
- Every model shares the set, and so the builds, but a house is still lit only by its own fire.
- The sun is scaled by `_sun` (`engine.js` sun colour × `sunMask`). Models may opt out: `noSun(m)` (the urasa interior: shadow-map leaks), `noLocalLights(m)` (the urasa cover: no fire through the bark).
- Nature keeps a sun-only set: its pixels never evaluate the fires.

## Not done (measured, rejected)
- Switched masters: unrelated graphs merged into one shader with branches on a per-material index. Builds 195 → 128, but main-thread build time fell only ~10%, because branches cost their own graph. Shaders with 8+ branches doubled the GPU time inside the urasa, and one build stalled ~100 ms. Removed.
- Baking procedural detail into textures: most model graphs are procedural in `positionLocal` or world space, on tiling metre-UVs, so a uv-space bake would need unique unwraps per mesh.

## Tools
- `node tools/shaders.mjs [chrome|webkit] [query] [out.json]` (`PORT`): every build from navigation to complete, with object, material, pass, light set and geometry layout. Prints counts per pass and material, the main-thread build time and the longest slice. `TOP=n` lists the slowest builds.
- `shapeKey(m)` (master.js): a material's shape key, for finding why two materials don't share.
