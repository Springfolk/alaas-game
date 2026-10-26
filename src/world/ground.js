// Ground mesh (one warped grid: ~1.5 m cells at the homestead, ~40 m at the horizon) and its
// splatted PBR material: meadow grass, forest floor, lake-shore mud, trodden earth, dry grass.
import * as THREE from 'three/webgpu';
import { texture, attribute, positionWorld, cameraPosition, vec2, vec3, vec4, mix, normalMap, float, smoothstep, mx_noise_float, uniform, floor, hash, length, select } from 'three/tsl';
import { maps, firstTextureMax, onSharpen } from '../engine/materials.js';
import { LAKE } from './terrain.js';
import { groundSamples, groundArrays, packSet } from './ground-data.js';
import { job } from '../load/workers.js';
import { TIER } from '../engine/tier.js';

// The grid (N verts per side by tier: 640 → 420 on phones) and the splat textures are computed in a worker
// (src/load/worker.js, data code in ground-data.js; the grid's terrain samples are baked: src/load/geocache.js);
// on the main thread only if workers fail.
export async function buildGround(terrain) {
  const sizes = [TIER.ground, 200], pads = terrain.pads;
  const [fine, rough] = (await job('ground', { pads, sizes }, () => sizes.map((N) => groundSamples(terrain, N)))).map(groundArrays);
  const mesh = new THREE.Mesh(groundGeometry(fine), groundMaterial());
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  // a coarse copy (same material, so the same pipeline) the lake reflection draws instead (lake.js)
  const coarse = new THREE.Mesh(groundGeometry(rough), mesh.material);
  coarse.name = 'ground-coarse'; coarse.visible = false; coarse.receiveShadow = true;
  mesh.add(coarse);
  return mesh;
}

function groundGeometry({ pos, uvs, nor, spl, idx }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// One set's diff × AO in RGB and roughness in A, packed on the CPU once its images load, so five sets fit in
// ten textures (diff+arm+nor for five sets would exceed the 16 sampled textures a WebGPU stage allows).
function packed(id) {
  const t = new THREE.DataTexture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  // starts at 256 like every texture, then the device tier's cap (2048 → 1024 on low, 512 on phones) in play
  // (sharpenTextures); decoded and packed in a worker; the swap drops the GPU texture first (a rebind, no new shader)
  const base = `${import.meta.env.BASE_URL}assets/tex/${id}/`;
  const load = (max, swap) => job('pack', { base, max }, () => packSet(base, max)).then((img) => {
    if (swap) t.dispose();
    t.image = img;
    t.needsUpdate = true;
  }).catch((e) => console.warn('ground texture', id, e));
  t.userData.ready = load(firstTextureMax(), false);
  onSharpen((max) => load(max, true));
  return t;
}

// Filled by src/nature/grass.js once the models are placed (before the first frame):
// the homestead mask (cut, mown, grazed, bare soil) the grass grows from, so the ground under it agrees.
// One texture only: the five splat sets already use ten of the sixteen a WebGPU stage allows. xf = (x0, z0, 1/size).
// A 1×1 placeholder until then; grass.js points `maskNode` at its own mask texture (a binding change, not
// a new shader), so no texture is ever resized in place.
const blank = () => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
const makeHooks = () => ({ maskXf: uniform(new THREE.Vector3(0, 0, 0)) });

function groundMaterial() {
  const ids = { grass: 'sparse_grass', dry: 'leafy_grass', forest: 'forest_leaves_04', shore: 'mud_forest', path: 'forest_ground_04' };
  const sets = {};
  for (const [k, id] of Object.entries(ids)) sets[k] = { ar: packed(id), nor: maps(id).nor };
  const s = attribute('splat', 'vec4');
  const wp = positionWorld.xz;
  const dist = positionWorld.sub(cameraPosition).length();
  // break the tiling: a slow noise picks between two scales/offsets of each set
  const brk = mx_noise_float(wp.mul(0.11)).mul(0.5).add(0.5).smoothstep(0.3, 0.7);
  const uvA = wp.div(3.2), uvB = vec2(wp.x.mul(0.8).sub(wp.y.mul(0.6)), wp.x.mul(0.6).add(wp.y.mul(0.8))).div(6.1).add(vec2(0.37, 0.61));
  // edge noise so splat borders are ragged, not smooth gradients
  const edge = mx_noise_float(wp.mul(0.45)).mul(0.22);
  const w = (v) => v.add(edge).clamp(0, 1).smoothstep(0.25, 0.75);
  const sample = (m, key) => mix(texture(m[key], uvA), texture(m[key], uvB), brk);
  const lum = (c) => c.dot(vec3(0.3, 0.55, 0.15));
  const lin = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };

  // meadow ground re-graded to the colour of the grass mass: darker under the near blades,
  // green-gold with hay-yellow patches from afar (the textures alone read as brown dirt)
  const macro = mx_noise_float(wp.mul(0.009)).mul(0.5).add(0.5);
  const macro2 = mx_noise_float(wp.mul(0.04).add(7.3)).mul(0.5).add(0.5);
  const far = smoothstep(8, 45, dist);
  const meadowTint = mix(mix(lin(0x3d4a1f), lin(0x55632a), macro2), mix(lin(0x617a2b), lin(0x84863c), macro.smoothstep(0.35, 0.8)), far);
  // texture detail fades with distance so its tiling never shows as a pattern across the meadow
  const regrade = (c, mean, tint, k) => mix(c, tint.mul(mix(lum(c).div(mean), float(1), far.mul(0.75))), k);
  const H = makeHooks();
  const fM = (H.maskNode = texture(blank(), wp.sub(H.maskXf.xy).mul(H.maskXf.z)));
  const grazed = fM.z, bareG = fM.w;
  const layer = (key) => {
    const get = (n) => sample(sets[n], key);
    if (key === 'ar') {
      // trodden earth: dusty and pale, not dark mud bands
      const pv = get('path'), path = vec4(mix(pv.rgb.mul(1.3), lin(0x8a7c5e), 0.4), pv.a);
      let v = get('grass'); v = vec4(regrade(v.rgb, 0.045, meadowTint, 0.9), v.a);
      const dv = get('dry'); v = mix(v, vec4(regrade(dv.rgb, 0.2, mix(meadowTint, lin(0x9a9050), 0.4), 0.85), dv.a), w(s.w));
      // grazed sward: tighter, greener-yellow, broken by bare trodden soil (same patches the grass leaves)
      v = vec4(mix(v.rgb, regrade(v.rgb, 0.045, mix(lin(0x55622a), lin(0x6c6d34), macro2), 0.9), grazed), v.a);
      v = mix(v, path, bareG.mul(0.8));
      v = mix(v, get('forest'), w(s.x));
      v = mix(v, path, w(s.z).mul(0.85));
      v = mix(v, get('shore'), w(s.y));
      return v;
    }
    let v = get('grass');
    v = mix(v, get('dry'), w(s.w));
    v = mix(v, get('forest'), w(s.x));
    v = mix(v, get('path'), w(s.z));
    v = mix(v, get('shore'), w(s.y));
    return v;
  };
  const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 1, metalness: 0 });
  const ar = layer('ar');
  // the wet band at the waterline and the lake bed below it: darker and smoother
  const wet = float(1).sub(smoothstep(LAKE.level + 0.05, LAKE.level + 0.45, positionWorld.y));
  const tone = mx_noise_float(wp.mul(0.012)).mul(0.08).add(1);
  // cow pats on grazed ground, rare (one in ~14 cells of 2.4 m where grazing is heaviest): a lumpy outline,
  // pale cracked dry crust, a browner moist middle and a dark rim where the low mound meets the grass
  const cell = floor(wp.div(2.4)), seed = cell.x.add(16384).toUint().mul(73856093).bitXor(cell.y.add(16384).toUint().mul(19349663));
  const hc = hash(seed), pc = cell.add(vec2(hash(seed.add(1)), hash(seed.add(2))).mul(0.7).add(0.15)).mul(2.4);
  const pr = hash(seed.add(3)).mul(0.08).add(0.13);
  const pd = length(wp.sub(pc).mul(vec2(1, hash(seed.add(4)).mul(0.4).add(0.8)))).div(pr)
    .add(mx_noise_float(wp.mul(4)).mul(0.22)).add(mx_noise_float(wp.mul(13)).mul(0.08));
  const pat = float(1).sub(smoothstep(0.85, 1, pd)).mul(select(hc.lessThan(grazed.mul(0.07)), float(1), float(0)));
  // the slumped layers show as faint rings; cracks split the dry top
  const ring = pd.mul(15).sin().mul(0.5).add(0.5).mul(smoothstep(0.15, 0.4, pd));
  const crack = smoothstep(0.01, 0.05, mx_noise_float(wp.mul(30)).abs());
  const crust = mix(lin(0x4a4130), mix(lin(0x5e5641), lin(0x6f6750), ring.mul(0.6).add(mx_noise_float(wp.mul(9)).mul(0.2))), crack);
  const dung = mix(crust, lin(0x2f281d), smoothstep(0.78, 0.97, pd));
  mat.colorNode = mix(ar.rgb, dung, pat.mul(0.95)).mul(vec3(tone, tone, tone.mul(0.97))).mul(mix(1, 0.5, wet));
  mat.roughnessNode = mix(ar.a.mul(0.12).add(0.86), float(0.45), wet);
  mat.metalnessNode = float(0);
  // rough soil has almost no specular: kills the grey sky sheen at grazing angles
  mat.specularIntensityNode = mix(float(0.25), float(0.8), wet);
  mat.normalNode = normalMap(layer('nor').rgb.mul(2).sub(1).normalize().mul(0.5).add(0.5));
  mat.name = 'ground';
  mat.userData.hooks = H; // filled by src/nature/grass.js
  // resolves once every map has its image (world.js shows the ground then, not black)
  const loaded = (t) => new Promise((ok) => { const f = () => (t.image ? ok() : setTimeout(f, 50)); f(); });
  mat.userData.ready = Promise.all(Object.values(sets).flatMap(({ ar, nor }) => [ar.userData.ready, loaded(nor)]));
  return mat;
}
