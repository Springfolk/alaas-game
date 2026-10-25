// The lived-in yard of the summer homestead (сайылык), placed at the uraha (homestead centre).
// The cattle smudge fire by the pen, the birch-bark craft spot in the uraha's shade, the firewood stack,
// the festive saddle under its shelter near the serge, the smith's lean-to downwind to the east,
// worn foot paths between them, and the fenced hay meadow on the way down to the lake.
// North is −Z, east +X. Kept clear of: the uraha (r ≈ 5, placed by layout.js; paths start at its door); balagan + khoton ≈ (−24…−15, −4.5…9.7);
// serge row x≈10, z −2…2; ampaar (3, 19); cattle pen (26, −20) 15 × 20 m; mare line (46, 2).
import { Bucket, decalMat, geoPiece, pmat, ribbonGeo } from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';
import { smudge, woodpile, craft } from './yardlife/pieces.js';
import { smithy } from './yardlife/smithy.js';
import { saddle } from './yardlife/saddle.js';
import { hayMeadow } from './yardlife/hay.js';
import { DOOR } from './urasa/frame.js';
import { PLACEMENTS } from '../world/layout.js';
import { HOME } from '../world/terrain.js';

// prevailing summer breeze: the smudge smoke drifts north-east over the pen (m/s, x/z)
const WIND = [0.55, -0.42];

const PLACES = {
  smudge: [15.5, -10.5],
  craft: [0.8, -7.6],
  woodpile: [-6.5, -11],
  saddle: [13.6, 7.2],
  smithy: [27, 13.5],
  gate: [4.5, 62.3],
  yard: [6.5, 8.5],
};

// worn foot paths (local x, z polylines) and their widths
const URASA = PLACEMENTS.find((p) => p.model === 'urasa');
const UD = URASA.x - HOME.x + DOOR.r + 0.1; // just outside the uraha door (local to HOME)
const PATHS = [
  [0.85, [[UD, -0.3], [7.5, -3.6], [13, -5.4], [22, -5], [32, -4.2], [42, -4.8], [52, -5.6], [62, -6]]], // door → east track
  [0.6, [[13, -5.4], [15, -8.6]]],                                                     // → smudge fire
  [0.7, [[UD, 0.8], [5.4, 4.6], [0, 6.3], [-6, 6.2], [-11, 5.8], [-14.5, 5.3]]],                  // door → balagan
  [0.65, [[UD, 0.8], [6.3, 5.5], [5, 12], [3.6, 16.2]]],                              // door → ampaar
  [0.6, [[6.3, 5.5], [11, 8.5], [18, 10.5], [24.5, 12]]],                              // yard → saddle → smithy
  [0.55, [[UD, -1.2], [5.6, -3.6], [3.4, -6.2], [1.6, -7.0]]],                                      // door → craft spot
  [0.55, [[-14, 4], [-11.5, -2.5], [-7.6, -8.7]]],                                       // balagan → firewood
  [0.6, [[32, -4.2], [38, -0.5], [42, 1.5]]],                                           // → mare line
];
const SOUTH = [0.75, [[5.4, 8.6], [6.2, 18], [8.2, 26], [6.5, 38], [5, 50], [4.5, 62.3], [5.2, 76], [7, 92], [5.5, 108], [6.5, 124], [5.8, 140]]];

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const ground = (x, z) => terrain.heightFast(px + x, pz + z) - py; // per-vertex grime (kit.js Bucket)
  const group = new T.Group();
  group.name = 'yardlife';
  const M = yardMats();
  const colliders = [], interactables = [], ups = [];
  const yardB = new Bucket(ground), meadowB = new Bucket(ground);
  const proxyMat = new T.MeshBasicMaterial({ visible: false });
  const K = {
    M, rng, group, colliders, ups, b: yardB, bm: meadowB, wind: WIND, gate: PLACES.gate,
    barkCraft: pmat('canvas:birch', { scale: 0.5, back: 'birchIn', double: true, dirt: 0.4, tint: 0xecd3a6 }),
    // an invisible box the player's ray can hit
    proxy(x, y, z, w, h, d, yaw = 0) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), proxyMat);
      m.position.set(x, y, z); m.rotation.y = yaw;
      m.castShadow = false; m.receiveShadow = false;
      group.add(m);
      return m;
    },
  };

  // ---- paths first, so props sit over them ----
  const pathMat = decalMat('brown_mud_dry', { scale: 2.4, tint: 0xd2c4a6, strength: 0.8 }); // dusty, trodden
  geoPiece(K, () => { // baked: src/load/geocache.js
    for (const [w, pts] of PATHS) yardB.add(ribbonGeo(ground, pts, w, rng), pathMat);
    meadowB.add(ribbonGeo(ground, SOUTH[1], SOUTH[0], rng, { step: 0.6 }), pathMat);
  });

  const sm = smudge(K, ...PLACES.smudge);
  interactables.push({ entry: 'tupte', target: sm.target });
  woodpile(K, ...PLACES.woodpile, 0.12);
  const cr = craft(K, ...PLACES.craft, 0.25);
  interactables.push({ entry: 'birch-bark', target: cr.target });
  const sd = saddle(K, ...PLACES.saddle, 0);
  interactables.push({ entry: 'saddle', target: sd.target });
  const sy = smithy(K, ...PLACES.smithy, -0.45);
  interactables.push({ entry: 'blacksmith', target: sy.target, act: sy.act });
  const hay = hayMeadow(K);
  for (const t of hay.targets) interactables.push({ entry: 'hay-making', target: t });
  interactables.push({ entry: 'homestead-layout', zone: { x: PLACES.yard[0], z: PLACES.yard[1], r: 3.2 } });

  yardB.build(group);
  const meadow = new T.Group();
  meadow.name = 'hay-meadow';
  meadowB.build(meadow);
  group.add(meadow);

  // for the grass pass: keep blades off the paths and thin on the mown strips (local coords)
  group.userData.paths = [...PATHS, SOUTH].map(([w, pts]) => ({ w, pts }));
  group.userData.mown = hay.mown;

  return {
    object: group,
    colliders,
    interactables,
    update: (dt, c) => { for (const u of ups) u(dt, c); },
  };
}
