// The living alaas: birds in the sky and on the lake, insects and falling leaves, midges, fluff and
// dust motes catching the sun, ripples, fish rises and water striders on the lake. Everything follows
// the shared wind (natureWind); four draw calls in all; amounts follow the device tier. See src/nature/life/.
import { natureField, natureWind } from './grass.js';
import { lifeTier, lifeClock } from './life/common.js';
import { buildBirds } from './life/birds.js';
import { buildLakeFx } from './life/lakefx.js';
import { buildBugs } from './life/bugs.js';
import { buildMotes } from './life/motes.js';

export default async function build(ctx, world) {
  const F = natureField(world), W = natureWind(world), K = lifeClock(world);
  const tier = lifeTier(world.engine);
  const water = buildLakeFx(ctx, world, { tier, W, K });
  const birds = buildBirds(ctx, world, { tier, W, onWater: water.ring });
  const bugs = buildBugs(ctx, world, { tier, W, F, K });
  const motes = buildMotes(ctx, world, { tier, W, F, K });
  world.life = { birds, water, bugs, motes };
}
