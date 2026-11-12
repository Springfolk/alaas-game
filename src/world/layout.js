// Where everything stands in the summer homestead (сайылык) — the single source of truth.
// Rules from the research: doors face east (+X); the hearth corner is NE; serge stand in front (east);
// the khoton is on the balagan's north wall; storage faces the house; the hay meadow lies downslope (south).
// yaw: radians about +Y; 0 = the model's own front (+X, east) faces east.
import { HOME } from './terrain.js';

const H = (dx, dz) => ({ x: HOME.x + dx, z: HOME.z + dz });

export const PLACEMENTS = [
  { model: 'urasa', ...H(-2, 0), yaw: 0, pad: 6.5 },           // main summer house, ~10 m across; door at H(3, 0)
  { model: 'balagan', ...H(-19, 5), yaw: 0, pad: 8 },             // light summer balagan + khoton on its north (pad reaches the khoton's end)
  { model: 'serge', ...H(10, 0), yaw: 0 },                     // row of three posts, N–S
  { model: 'ampaar', ...H(3, 19), yaw: Math.PI / 2, pad: 3.2 },  // storehouse, door facing north (towards the house)
  { model: 'kuruo', ...H(26, -20), yaw: 0 },                   // cattle pen
  { model: 'sele', ...H(46, 2), yaw: 0 },                      // mare-milking line
  { model: 'yardlife', ...H(0, 0), yaw: 0 },                   // smudge fire, craft spot, woodpile, hay stacks
  { model: 'chores', ...H(0, 0), yaw: 0 },                     // water pail, firewood billets, дьэдьэн patches (src/interact)
  { model: 'work', ...H(0, 0), yaw: 0 },                       // tools and materials of the hands-on work (src/interact/work)
  { model: 'barkwork', ...H(0, 0), yaw: 0 },                    // the bark sheet that becomes a тордуйа, on the craft spot's hide (src/interact/work/tuos.js)
  { model: 'drywood', ...H(0, 0), yaw: 0 },                     // dry branches at the forest's edge to the north (src/interact/work/gather.js)
  { model: 'fishery', x: 22, z: -44, yaw: 0 },                 // fish weir, trap and carrier in the shallows (src/interact/work/fish.js)
  { model: 'lakeside', x: 6, z: -58, yaw: 0 },                 // mungkha net on poles, the lake's offering spot
  { model: 'sacred-birch', x: -248, z: -128, yaw: 0 },          // lone revered birch at the alaas edge
  { model: 'balagan', x: 268, z: -96, yaw: -0.35, pad: 8, variant: 'winter' }, // the empty winter place (кыстык)
  { model: 'haybase', x: 257, z: -84, yaw: 0 },                // the hay crew's fire, forks and rakes, stack poles by the winter place's meadows
  { model: 'hayfield', x: 253.4, z: -83.2, yaw: 0 },           // the scythe on its post beside them (src/interact/work/hay.js)
  { model: 'hayfield', ...H(-6.5, 60), yaw: 0 },               // a second scythe on its post at the home meadow's edge
];

// Where the walk starts: on the track coming in from the east, looking at the homestead.
export const START = { ...H(62, -6), yaw: Math.PI / 2 + 0.12 };
