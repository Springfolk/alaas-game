// Alaas meadow: GPU blade grass, meadow flowers and lake-shore sedge/horsetail.
// Grass and flowers are camera-following instance grids: each instance hashes its world cell, so a
// blade never moves when the grid re-centres. Height, lake distance, forest, path, dry and grazed
// weights come from a baked field texture of the terrain; wind is a scrolling noise texture.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, texture, instanceIndex, hash, vec2, vec3, vec4, float, floor, length, normalize, cross, mix, smoothstep, max,
  min, clamp, select, positionLocal, positionWorld, cameraPosition, cameraViewMatrix, varyingProperty, attribute, dot, pow,
  sqrt, sin, cos, PI2, specularColor, specularColorBlended, specularF90, positionPrevious, normalView, diffuseContribution, BRDF_Lambert,
} from 'three/tsl';
import { LAKE } from '../world/terrain.js';
import { PLACEMENTS } from '../world/layout.js';
import { smooth, mulberry32, KEYART } from '../util.js';
import { FIELD, FLOOR, fieldTexels, maskTexels } from './grass/field.js';
import { job } from '../load/workers.js';
import { sourceRef } from '../engine/master.js';

const { res: RES, x0: X0, size: SIZE, hbase: HBASE } = FIELD; // field: 2.25 m texels over the alaas and its rim
const SPOTS = () => PLACEMENTS.filter((p) => ['kuruo', 'sele', 'serge', 'yardlife', 'lakeside'].includes(p.model)).map(({ x, z }) => ({ x, z }));

// ---------- shared field + wind (also used by lake.js and ground.js) ----------

export function natureField(world) {
  if (world._field) return world._field;
  // the texels are baked in a worker (src/load/worker.js) and filled in when they arrive (same size: no new texture)
  const a = new Uint16Array(RES * RES * 4), b = new Uint8Array(RES * RES * 4);
  const mk = (data, type) => {
    const tx = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat, type);
    tx.magFilter = tx.minFilter = THREE.LinearFilter;
    tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
    tx.needsUpdate = true;
    return tx;
  };
  const texA = mk(a, THREE.HalfFloatType), texB = mk(b, THREE.UnsignedByteType);
  const pads = world.terrain.pads, spots = SPOTS();
  const ready = job('field', { pads, spots }, () => fieldTexels(world.terrain, spots)).then((r) => {
    a.set(r.a); b.set(r.b); texA.needsUpdate = texB.needsUpdate = true;
  });
  const uvOf = (xz) => xz.sub(X0).div(SIZE);
  const mask = clearingMask(world);
  // the ground material samples the same texture, so soil, dung and sward line up with the blades
  const gh = world.ground?.material.userData.hooks;
  if (gh) {
    gh.maskNode.value = mask.tex;
    gh.maskXf.value.set(MASK.x0, MASK.z0, 1 / MASK.size);
  }
  world._field = {
    texA, texB, uvOf, mask, ready, // ready: the texels are in (until then every height reads 0)
    // TSL: (cut, mown) from the models' grass hints around the homestead
    sampleM: (xz) => texture(mask.tex, xz.sub(vec2(MASK.x0, MASK.z0)).div(MASK.size)).level(0),
    // TSL: { y, lakeD } and { forest, path, dry, grazed } at a world xz (vertex-safe: level 0)
    sampleA: (xz) => texture(texA, uvOf(xz)).level(0),
    sampleB: (xz) => texture(texB, uvOf(xz)).level(0),
    HBASE,
  };
  return world._field;
}

// Fine mask (0.33 m texels) over the homestead and its lake shore, from the models' hints:
// R = cut (paths, trodden pens and posts, the offering stone; FLOOR under earth floors), G = mown/short. Edges of the region stay 0.
const MASK = { x0: -170, z0: -370, size: 340, res: 1024 };
function clearingMask(world) {
  const { x0, z0, size, res } = MASK, px = size / res;
  const R = new Float32Array(res * res), G = new Float32Array(res * res);
  // stamp f(x, z) → 0..1 into ch over a world bbox
  const stamp = (ch, minX, minZ, maxX, maxZ, f) => {
    const i0 = Math.max(1, Math.floor((minX - x0) / px)), i1 = Math.min(res - 2, Math.ceil((maxX - x0) / px));
    const j0 = Math.max(1, Math.floor((minZ - z0) / px)), j1 = Math.min(res - 2, Math.ceil((maxZ - z0) / px));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = f(x0 + (i + 0.5) * px, z0 + (j + 0.5) * px), k = j * res + i;
      if (v > ch[k]) ch[k] = v;
    }
  };
  const segDist = (x, z, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  const stone = [];
  for (const p of world.placed || []) {
    const ud = p.object?.userData || {};
    const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
    const tw = ([x, z]) => [p.x + x * c + z * s, p.z - x * s + z * c];
    for (const path of ud.paths || []) {
      const pts = path.pts.map(tw), hw = path.w / 2;
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1], m = hw + 0.6;
        stamp(R, Math.min(ax, bx) - m, Math.min(az, bz) - m, Math.max(ax, bx) + m, Math.max(az, bz) + m,
          (x, z) => 1 - smooth(hw * 0.7, hw + 0.45, segDist(x, z, ax, az, bx, bz)));
      }
    }
    // earth floors: circles { x, z, r } or boxes { x, z, hw, hd } (model-local), stamped FLOOR (see field.js)
    for (const f of ud.bare || []) {
      const ext = f.r ?? Math.hypot(f.hw, f.hd), [cx, cz] = tw([f.x, f.z]);
      stamp(R, cx - ext, cz - ext, cx + ext, cz + ext, (x, z) => {
        const dx = x - p.x, dz = z - p.z, lx = dx * c - dz * s - f.x, lz = dx * s + dz * c - f.z;
        return (f.r ? Math.hypot(lx, lz) < f.r : Math.abs(lx) < f.hw && Math.abs(lz) < f.hd) ? FLOOR : 0;
      });
    }
    for (const e of ud.mown || []) {
      const [cx, cz] = tw([e.x, e.z]);
      stamp(G, cx - e.rx - 1, cz - e.rz - 1, cx + e.rx + 1, cz + e.rz + 1,
        (x, z) => 1 - smooth(0.85, 1.1, Math.hypot((x - cx) / e.rx, (z - cz) / e.rz)));
    }
    // trodden ground under the posts, the pen and the mare line
    if (['kuruo', 'sele', 'serge'].includes(p.model)) {
      const box = new THREE.Box3().setFromObject(p.object);
      const m = p.model === 'serge' ? 1.6 : 1.2;
      stamp(R, box.min.x - m - 1, box.min.z - m - 1, box.max.x + m + 1, box.max.z + m + 1, (x, z) => {
        const dx = Math.max(box.min.x - x, 0, x - box.max.x), dz = Math.max(box.min.z - z, 0, z - box.max.z);
        return 0.85 * (1 - smooth(m * 0.3, m, Math.hypot(dx, dz)));
      });
    }
    // the lakeside offering stone sits at the end of its path: keep it open and visible
    if (p.model === 'lakeside' && ud.paths?.[0]) {
      const [sx, sz] = tw(ud.paths[0].pts.at(-1));
      stone.push([sx, sz + 0.9]);
    }
  }
  for (const [sx, sz] of stone) {
    stamp(R, sx - 3, sz - 3, sx + 3, sz + 3, (x, z) => 1 - smooth(1.0, 2.2, Math.hypot(x - sx, z - sz)));
    stamp(G, sx - 7, sz - 7, sx + 7, sz + 7, (x, z) => 1 - smooth(3.5, 6, Math.hypot(x - sx, z - sz)));
  }
  // B = grazed (field formula, max mown), A = bare soil: baked in a worker, filled in when it arrives
  const d = new Uint8Array(res * res * 4), spots = SPOTS();
  job('mask', { R, G, spots, mask: MASK }, () => maskTexels(R, G, spots, MASK)).then((m) => { d.set(m); tex.needsUpdate = true; });
  const tex = new THREE.DataTexture(d, res, res, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, stone };
}

// Tiling value noise, 4 octaves in RGBA (periods 4, 8, 16, 32 cells over 256 px).
function noiseTexture() {
  const N = 256, d = new Uint8Array(N * N * 4), rnd = mulberry32(1234);
  const lat = [4, 8, 16, 32].map((p) => ({ p, v: Float32Array.from({ length: p * p }, rnd) }));
  const f = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    lat.forEach(({ p, v }, c) => {
      const u = x / N * p, w = y / N * p, i = Math.floor(u), j = Math.floor(w), fu = f(u - i), fw = f(w - j);
      const g = (a, b) => v[((b % p) * p) + (a % p)];
      const val = g(i, j) * (1 - fu) * (1 - fw) + g(i + 1, j) * fu * (1 - fw) + g(i, j + 1) * (1 - fu) * fw + g(i + 1, j + 1) * fu * fw;
      d[(y * N + x) * 4 + c] = val * 255;
    });
  }
  const tx = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.generateMipmaps = true; tx.needsUpdate = true;
  return tx;
}

export function natureWind(world) {
  if (world._wind) return world._wind;
  const noise = noiseTexture();
  const w = {
    noise,
    time: uniform(0),
    dir: uniform(new THREE.Vector2(0.8, 0.6).normalize()), // blowing towards +x+z (from the NW)
    strength: uniform(1),
    cam: uniform(new THREE.Vector3()),     // the player's eye (not the reflector's camera)
    player: uniform(new THREE.Vector3(0, -999, 0)),
    sunDir: uniform(new THREE.Vector3(0, 1, 0)),
    sunCol: uniform(new THREE.Color(1, 1, 1)),
    px: uniform(0.002),                    // metres per screen pixel per metre of distance
  };
  // gust 0..1: broad patches rolling downwind at ~5 m/s; flutter −1..1: small fast ripples
  w.gust = (xz) => smoothstep(0.32, 0.82, texture(noise, xz.mul(0.0045).sub(w.dir.mul(w.time.mul(0.024)))).level(0).x);
  w.flutter = (xz) => texture(noise, xz.mul(0.05).sub(w.dir.mul(w.time.mul(0.32)))).level(0).y.mul(2).sub(1);
  world.updaters.push((dt, { time, camera, player }) => {
    w.time.value = time;
    w.cam.value.copy(camera.position);
    if (player?.pos) w.player.value.copy(player.pos);
    const s = world.engine.sun;
    w.sunDir.value.copy(s.position).normalize();
    w.sunCol.value.copy(s.color).multiplyScalar(s.intensity);
    // follows fov, resize and dynamic resolution, so blades never go thinner than ~1 px
    const r = world.engine.renderer, cam = world.engine.camera;
    const hpx = r.domElement.height || innerHeight;
    w.px.value = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / hpx;
  });
  world._wind = w;
  return w;
}

// Leaves are matte, waxy only faintly: a weak specular with almost no grazing Fresnel, so blades seen
// edge-on against the sun or sky don't light up as hard silver lines.
// Thin leaves let light through: a blade with the sun behind it (looking towards the sun) shows what passes
// through it — about half its lit-side diffuse, greener — shadowed and cloud-dimmed like the sun itself.
const LEAF_T = vec3(0.42, 0.56, 0.22);
class LeafLighting extends THREE.PhysicalLightingModel {
  direct(inputs, builder) {
    super.direct(inputs, builder);
    const { lightDirection, lightColor, reflectedLight } = inputs;
    const through = normalView.dot(lightDirection).negate().clamp();
    reflectedLight.directDiffuse.addAssign(through.mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseContribution })).mul(LEAF_T));
  }
}
class BladeMaterial extends THREE.MeshStandardNodeMaterial {
  static get type() { return 'BladeMaterial'; }
  setupLightingModel() { return new LeafLighting(); }
  setupSpecular() {
    specularColor.assign(vec3(0.025));
    specularColorBlended.assign(vec3(0.025));
    specularF90.assign(0.3);
  }
}

// ---------- geometry ----------

// A tuft of `nb` blades: pairs of verts at t = k/segs plus a tip. attribute `blade` = (side −½..½, t 0..1, blade #).
function bladeGeometry(segs, nb = 1) {
  const bl = [], idx = [], per = segs * 2 + 1;
  for (let b = 0; b < nb; b++) {
    const o = b * per;
    for (let k = 0; k < segs; k++) bl.push(-0.5, k / segs, b, 0.5, k / segs, b);
    bl.push(0, 1, b);
    for (let k = 0; k < segs - 1; k++) { const a = o + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const a = o + (segs - 1) * 2; idx.push(a, a + 1, o + segs * 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  const n = bl.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('blade', new THREE.Float32BufferAttribute(bl, 3));
  g.setIndex(idx);
  return g;
}

// A well-mixed uint seed for an integer cell (plain x·K + z shows stripes through the hash).
const cellSeed = (c) => hash(c.x.add(16384).toUint().mul(73856093).bitXor(c.y.add(16384).toUint().mul(19349663))).mul(4294967000).toUint();

// sRGB hex → linear vec3 constant
const lin = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };

// Bend of a stem at a world xz: (natural lean + wind + player push) as an xz offset per metre of height.
function bendAt(W, xz, lean, h) {
  const gust = W.gust(xz), flut = W.flutter(xz.add(h.mul(3.1)));
  const wind = W.dir.mul(gust.mul(gust).mul(0.42).add(0.06).add(flut.mul(0.06)).mul(W.strength));
  const away = xz.sub(W.player.xz), dp = length(away);
  const reach = select(W.player.y.greaterThan(-900), float(1).sub(smoothstep(0.15, 0.75, dp)), float(0));
  const push = normalize(away.add(vec2(0.0001, 0))).mul(reach.mul(1.1));
  const b = lean.add(wind).add(push);
  const bl = length(b);
  return b.mul(min(bl, 0.92).div(max(bl, 0.0001)));
}

// ---------- camera-following chunks ----------

// K×K chunk meshes of C×C instance cells (cell size S) re-centred on the player each frame, so three
// frustum-culls them. Matrices stay identity; `origin` (first cell) is per object.
// TRAA velocity: every vertex-built material here sets positionPrevious to its built position, or three
// reprojects from the raw (zero) attribute and TRAA throws its history away — the grass then aliases
// and shimmers. Wind sway between two frames is ignored (sub-pixel).
let origin = null; // one for every chunked material (it reads the drawn object's origin)
function originUniform() {
  return (origin ||= uniform(new THREE.Vector2()).onObjectUpdate(({ object }) => object.userData.origin));
}
function chunked(world, W, mat, geo, { S, C, K, name }) {
  const group = new THREE.Group();
  group.name = name;
  const size = S * C, meshes = [];
  for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
    const g = new THREE.InstancedBufferGeometry();
    for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
    g.setIndex(geo.index);
    g.instanceCount = C * C;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), size * 0.75 + 3);
    const m = new THREE.Mesh(g, mat);
    m.userData = { origin: new THREE.Vector2(), i, j };
    m.castShadow = false; m.receiveShadow = true;
    meshes.push(m); group.add(m);
  }
  let last = '';
  world.updaters.push(() => {
    const bx = Math.floor(W.cam.value.x / size) - (K >> 1), bz = Math.floor(W.cam.value.z / size) - (K >> 1);
    const key = bx + ',' + bz;
    if (key === last) return;
    last = key;
    for (const m of meshes) {
      const cx = bx + m.userData.i, cz = bz + m.userData.j;
      m.userData.origin.set(cx * C, cz * C);
      const x = (cx + 0.5) * size, z = (cz + 0.5) * size;
      m.geometry.boundingSphere.center.set(x, world.terrain.height(x, z) + 0.5, z);
    }
  });
  return group;
}

// ---------- meadow grass ----------

function grassMesh(world, F, W, lod) {
  const { C, S, segs, rIn, rOut, wMul, upBlend, minPx } = lod;
  const geo = bladeGeometry(segs, lod.nb);
  const uOrigin = originUniform();
  const mat = new BladeMaterial({ side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  const vN = varyingProperty('vec3', 'gN'), vC = varyingProperty('vec3', 'gC'), vT = varyingProperty('float', 'gT');
  const vF = varyingProperty('float', 'gF'); // 0 near → 1 far: how much a blade is averaged into the sward
  const blade = attribute('blade', 'vec3');

  mat.positionNode = Fn(() => {
    const ix = instanceIndex.mod(C).toFloat(), iz = instanceIndex.div(C).toFloat();
    const cell = uOrigin.add(vec2(ix, iz));
    const seed = cellSeed(cell);
    const r = (k) => hash(seed.add(k * 7919 + lod.salt));
    const bi = blade.z.toUint().mul(104729);
    const rb = (k) => hash(seed.add(k * 7919 + lod.salt).add(bi));
    // tufts: blades gather towards hashed clump centres and fan out from them
    const raw = cell.add(vec2(r(1), r(2))).mul(S).add(vec2(rb(13), rb(14)).sub(0.5).mul(lod.tuft));
    // (clump lattice rotated ~31° so its rows never line up with the instance grid)
    const rot = vec2(raw.x.mul(0.857).sub(raw.y.mul(0.515)), raw.x.mul(0.515).add(raw.y.mul(0.857)));
    const cc = floor(rot.div(0.5)), cs = cellSeed(cc);
    const cr = cc.add(vec2(hash(cs), hash(cs.add(17)))).mul(0.5);
    const centre = vec2(cr.x.mul(0.857).add(cr.y.mul(0.515)), cr.y.mul(0.857).sub(cr.x.mul(0.515)));
    const xz = mix(raw, centre, lod.near ? 0.22 : 0.0).toVar();
    const fan = raw.sub(centre);
    const d = length(xz.sub(W.cam.xz));
    const A = F.sampleA(xz), B = F.sampleB(xz);
    const y = A.x.add(F.HBASE), lakeD = A.y;
    const M = F.sampleM(xz);
    const forest = B.x, path = max(B.y, M.x), dry = B.z, grazed = max(B.w, M.y);

    // where it grows and how much of it this ring draws
    const shore = float(1).sub(smoothstep(0.5, 9, lakeD));                  // lush sedge belt
    // paths are trodden, not bare: a sparse, short sward stays on them (dusty, see ground.js)
    let dens = float(1).sub(path).pow(2).mul(0.72).add(0.28).mul(float(1).sub(forest.mul(0.75)));
    dens = dens.mul(smoothstep(-0.5, 0.6, lakeD));                            // not in the water
    // grazed ground is patchy: bare soil between tight swards (hoof prints, dung, cattle paths)
    const bare = M.w; // baked with the mask, shared with the ground
    dens = dens.mul(float(1).sub(bare)).mul(mix(1, 1.15, grazed));
    // the two rings cross-fade over the same 11–16.5 m band so the meadow has no seam
    const ring = lod.near
      ? float(1).sub(smoothstep(rIn, rOut, d))
      : smoothstep(rIn, rIn + 5.5, d);
    const alive = r(3).lessThan(dens.mul(ring)).and(d.lessThan(rOut));

    // size: meadow 25–65 cm (hay not yet mown), sedge 55–95 cm, grazed 6–14 cm
    const patch = texture(W.noise, xz.mul(0.011)).level(0).z.mul(0.7).add(0.65);
    let H = rb(4).pow(1.4).mul(0.42).add(0.24).mul(patch);
    H = mix(H, rb(4).mul(0.4).add(0.55), shore.mul(0.85));
    // grazed sward 3–12 cm, with rank tufts left long where the cattle would not bite (around dung)
    const rank = select(rb(17).greaterThan(0.96), float(1), float(0));
    H = mix(H, mix(rb(4).mul(0.09).add(0.03), rb(4).mul(0.15).add(0.2), rank), grazed);
    H = mix(H, rb(4).mul(0.07).add(0.03), smoothstep(0.25, 0.85, path));   // trodden: 3–10 cm
    H = H.mul(mix(1, 0.8, dry)).mul(mix(1, 0.55, forest));
    if (!lod.near) H = H.mul(float(1).sub(smoothstep(rOut - 12, rOut, d)));   // sink away at the far edge
    // never thinner than ~minPx screen pixels (sub-pixel blades alias into a shimmering carpet):
    // widen with distance and thin the blades out by the same factor, so the sward keeps its cover
    const W0 = rb(5).mul(0.01).add(0.014).mul(mix(1, 1.6, shore)).mul(wMul(d));
    const Wd = max(W0, d.mul(W.px).mul(minPx));
    const keep = W0.div(Wd).max(0.2);
    H = H.mul(clamp(keep.sub(rb(18)).mul(8).add(1), 0, 1));              // thinned blades shrink, never pop
    H = H.mul(select(alive, float(1), float(0)));
    const far = smoothstep(4, 22, d);
    vF.assign(far);

    // orientation, lean, bend
    const th = rb(6).mul(PI2);
    const wdir = vec2(cos(th), sin(th)), fdir = vec2(sin(th).negate(), cos(th));
    // trodden edges of pens and paths: blades flattened one way by hooves and feet
    const trod = smoothstep(0.05, 0.5, M.x).mul(float(1).sub(smoothstep(0.6, 0.9, M.x)));
    const flatDir = texture(W.noise, xz.mul(0.02)).level(0).xy.sub(0.5).add(vec2(0.001, 0)).normalize();
    const lean = fdir.mul(rb(7).mul(0.3).add(0.04)).add(fan.mul(1.2)).mul(mix(1, 0.4, shore)).add(flatDir.mul(trod.mul(0.85)));
    // flowering stems (timothy, brome, fescue panicles) among the leaves
    const stemF = select(rb(12).greaterThan(0.8), float(1), float(0)).mul(float(1).sub(grazed)).mul(float(1).sub(shore));
    const bend = bendAt(W, xz, lean, rb(8));
    const t = blade.y, side = blade.x;
    const k = sqrt(float(1).sub(dot(bend, bend).mul(0.55)));
    const leafW = pow(float(1).sub(t), 0.6).mul(0.85).add(0.15);
    const stemW = mix(float(0.25), float(1.5).mul(float(1).sub(t).mul(4).add(0.2)), smoothstep(0.7, 0.78, t));
    const width = Wd.mul(mix(leafW, stemW, stemF)).mul(select(t.greaterThan(0.999), float(0), float(1)));
    const Hs = H.mul(mix(1, 1.4, stemF));
    const off = vec3(wdir.x, 0, wdir.y).mul(side.mul(width));
    const p = vec3(xz.x, y.sub(0.03), xz.y).add(vec3(bend.x, 0, bend.y).mul(Hs.mul(t).mul(t))).add(vec3(0, Hs.mul(k).mul(t), 0)).add(off);

    // normal: across the bent blade, turned to the viewer, rounded, eased towards up
    const tan = vec3(bend.x.mul(t.mul(2)), k, bend.y.mul(t.mul(2)));
    let n = normalize(cross(vec3(wdir.x, 0, wdir.y), tan));
    n = select(dot(n, W.cam.sub(p)).lessThan(0), n.negate(), n);
    n = normalize(n.add(vec3(wdir.x, 0, wdir.y).mul(side.mul(mix(0.9, 0.3, far)))));
    // two-sided: a face turned from the sun (seen looking towards it) is mirrored across the sun's
    // vertical plane and lights like its sunward side, so the sward reads the same both ways round
    // (the near ring went dark and too green against the ground; LeafLighting transmission was all it got)
    const sH = normalize(vec3(W.sunDir.x, 0, W.sunDir.z).add(vec3(0.0001, 0, 0)));
    const ns = dot(n, sH);
    n = n.sub(sH.mul(min(ns, 0).mul(2)));
    // rounded near, eased into the ground normal with distance: no per-blade light/dark stripes
    vN.assign(normalize(mix(n, vec3(0, 1, 0), mix(upBlend, 0.72, far))));

    // colour: July alaas greens, yellow-green patches, straw on dry ground, blue-green sedge
    // variance lives at tuft scale (clump hash, broad noise); single blades differ only slightly
    const macro = texture(W.noise, xz.mul(0.0035)).level(0).w, tuftN = texture(W.noise, xz.mul(0.09)).level(0).x;
    const ch = (k) => hash(cs.add(k));
    let c = mix(lin(0x56741f), lin(0x8f9637), clamp(ch(9).mul(0.35).add(rb(9).mul(0.15)).add(macro.mul(0.6)).add(tuftN.mul(0.3)).sub(0.3), 0, 1));
    c = mix(c, lin(0x9d9050), dry.mul(0.55));
    c = mix(c, lin(0xb3a26c), select(rb(10).greaterThan(0.94), float(0.45), float(0)).mul(float(1).sub(far)));   // dead stalks
    c = mix(c, lin(0x4d6e38), shore.mul(0.8));
    c = mix(c, mix(lin(0x6f8a37), lin(0xa09a58), rb(16).mul(rb(16))), grazed.mul(0.6)); // grazed/mown: stubble among regrowth
    c = c.mul(ch(11).mul(0.3).add(0.82)).mul(mix(rb(11).mul(0.16).add(0.92), float(1), far)).mul(0.93);
    c = c.mul(W.gust(xz).mul(0.12).add(0.95));   // gusts roll across as soft lighter waves (blades turn their pale sides)
    vC.assign(c);
    vT.assign(t.add(stemF.mul(2)));
    positionPrevious.assign(p);
    return p;
  })();

  mat.normalNode = cameraViewMatrix.mul(vec4(vN, 0)).xyz.normalize();
  const tt = vT.mod(2), isStem = vT.greaterThan(1.5);
  // self-shadowed bases near; far off the gaps between blades must not read as dark lines
  const ao = mix(mix(0.2, 0.52, vF), 1, pow(tt, 0.8));
  const tip = mix(vec3(1), vec3(1.08, 1.06, 0.86), smoothstep(0.6, 1, tt).mul(float(1).sub(vF)));
  const head = select(isStem, smoothstep(0.68, 0.8, tt), float(0)).mul(mix(0.75, 0.25, vF));
  const headCol = mix(lin(0x8f8460), lin(0x7a6c52), vC.y.mul(9).fract());
  mat.colorNode = mix(vC.mul(tip), headCol, head).mul(ao);
  mat.roughnessNode = mix(0.88, 1, vF);
  // light through the blades when looking towards the sun (soft lobe, strongest in the upper blade)
  const toFrag = normalize(positionWorld.sub(cameraPosition));
  const back = pow(max(dot(toFrag, W.sunDir), 0), 2);
  mat.emissiveNode = vC.mul(W.sunCol).mul(back.mul(0.14).mul(tt.mul(0.7).add(0.3))).mul(vec3(0.95, 1.1, 0.55));

  return chunked(world, W, mat, geo, { S, C, K: lod.K, name: `grass-${lod.name}` });
}

// ---------- flowers ----------

// One species as a small merged mesh in unit-height space; attributes: position, normal, color, part (0 stem → 1 top).
function flowerGeometry(kind) {
  const P = [], N = [], C = [], idx = [];
  const add = (verts, col) => { const b = P.length / 3; for (const v of verts) { P.push(...v); N.push(0, 1, 0); C.push(...col); } return b; };
  const quad = (a, b, c, d, col) => { const o = add([a, b, c, d], col); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  const stem = (h, w, col, x = 0, z = 0) => { quad([x - w, 0, z], [x + w, 0, z], [x + w * 0.6, h, z], [x - w * 0.6, h, z], col); quad([x, 0, z - w], [x, 0, z + w], [x, h, z + w * 0.6], [x, h, z - w * 0.6], col); };
  const disc = (cx, cy, cz, r, n, col, cup = 0.3, ctr) => {
    const o = add([[cx, cy, cz]], ctr || col);
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; add([[cx + Math.cos(a) * r, cy + r * cup, cz + Math.sin(a) * r]], col); }
    for (let i = 0; i < n; i++) idx.push(o, o + 1 + i + 1, o + 1 + i);
  };
  const green = [0.07, 0.12, 0.018];
  const rnd = mulberry32(kind.length * 31);
  if (kind === 'buttercup') {          // Ranunculus: glossy yellow cups on forked stems
    const y = [0.95, 0.62, 0.02];
    stem(1, 0.006, green);
    disc(0, 1, 0, 0.055, 5, y, 0.35, [0.6, 0.45, 0.03]);
    stem(0.8, 0.005, green, 0.06, 0.02); disc(0.06, 0.8, 0.02, 0.045, 5, y, 0.4);
    disc(-0.04, 0.72, -0.03, 0.03, 5, [0.5, 0.42, 0.05], 0.8);  // bud
  } else if (kind === 'vetch') {       // Vicia cracca: one-sided violet racemes
    const v = [0.22, 0.12, 0.55];
    stem(1, 0.005, green);
    for (let i = 0; i < 9; i++) {
      const yy = 0.78 + i * 0.026, s = 0.018 * (1 - i * 0.06), x = 0.012;
      quad([x, yy, -s], [x, yy, s], [x + s * 1.6, yy + s, s], [x + s * 1.6, yy + s, -s], v);
    }
    quad([-0.07, 0.5, 0], [0.07, 0.52, 0], [0.07, 0.54, 0.01], [-0.07, 0.52, 0.01], [0.09, 0.17, 0.04]); // leaflets
  } else if (kind === 'yarrow') {      // Achillea: flat white corymbs
    stem(1, 0.006, green);
    disc(0, 1, 0, 0.075, 9, [0.82, 0.8, 0.72], 0.18, [0.7, 0.66, 0.5]);
    for (let i = 0; i < 3; i++) { const a = rnd() * 6.28, y = 0.25 + i * 0.2; quad([0, y, 0], [Math.cos(a) * 0.12, y + 0.05, Math.sin(a) * 0.12], [Math.cos(a) * 0.12, y + 0.07, Math.sin(a) * 0.12 + 0.02], [0, y + 0.02, 0.01], [0.1, 0.17, 0.05]); }
  } else if (kind === 'clover') {      // Trifolium repens: white globes over trefoil leaves, grazed ground
    stem(1, 0.02, green);
    disc(0, 0.92, 0, 0.13, 7, [0.86, 0.84, 0.78], 0.9, [0.62, 0.5, 0.42]);
    disc(0, 1.04, 0, 0.1, 7, [0.9, 0.88, 0.82], -0.6);
    for (let i = 0; i < 3; i++) { const a = i * 2.09 + 0.3; disc(Math.cos(a) * 0.16, 0.45, Math.sin(a) * 0.16, 0.15, 6, [0.1, 0.2, 0.05], 0.1, [0.16, 0.26, 0.09]); }
    for (let i = 0; i < 3; i++) { const a = i * 2.09 + 1.4; disc(0.35 + Math.cos(a) * 0.15, 0.3, 0.1 + Math.sin(a) * 0.15, 0.14, 6, [0.1, 0.2, 0.05], 0.1, [0.16, 0.26, 0.09]); }
  } else if (kind === 'fireweed') {    // Chamerion: tall magenta spikes, narrow leaves
    const m = [0.55, 0.06, 0.28];
    stem(1, 0.008, [0.12, 0.08, 0.04]);
    for (let i = 0; i < 12; i++) {
      const yy = 0.7 + i * 0.024, a = i * 2.4, r = 0.05 * (1 - i / 14);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, s = 0.022 * (1 - i / 16);
      quad([cx - s, yy, cz], [cx + s, yy, cz], [cx + s, yy + s * 1.5, cz], [cx - s, yy + s * 1.5, cz], i > 8 ? [0.35, 0.05, 0.2] : m);
      quad([cx, yy, cz - s], [cx, yy, cz + s], [cx, yy + s * 1.5, cz + s], [cx, yy + s * 1.5, cz - s], m);
    }
    for (let i = 0; i < 7; i++) { const a = i * 2.2, y = 0.12 + i * 0.08, L = 0.11; quad([0, y, 0], [Math.cos(a) * L, y + 0.04, Math.sin(a) * L], [Math.cos(a) * L + 0.01, y + 0.05, Math.sin(a) * L + 0.012], [0, y + 0.015, 0.012], green); }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(idx);
  return g;
}

// One master for every species (one shader build): the species' numbers are material properties read per
// draw (src/engine/master.js); where it grows = meadow·mix(dry) + grazed sward + the forest-edge band, weighted.
let flowerMaster = null;
function flowerNodes(F, W) {
  if (flowerMaster) return flowerMaster;
  const P = (k, t = 'float') => sourceRef(`_f${k}`, t);
  const uOrigin = originUniform();
  const vS = varyingProperty('float', 'fS'), vD = varyingProperty('float', 'fD');
  const position = Fn(() => {
    const S = P('S'), C = P('C', 'uint'), salt = P('Salt', 'uint');
    const ix = instanceIndex.mod(C).toFloat(), iz = instanceIndex.div(C).toFloat();
    const cell = uOrigin.add(vec2(ix, iz));
    const seed = cellSeed(cell);
    const r = (k) => hash(seed.add(k * 7919).add(salt));
    const xz = cell.add(vec2(r(1), r(2))).mul(S).toVar();
    const d = length(xz.sub(W.cam.xz));
    const A = F.sampleA(xz), B = F.sampleB(xz);
    const M = F.sampleM(xz);
    const forest = B.x, path = max(B.y, M.x), dry = B.z, grazed = max(B.w, M.y), lakeD = A.y;
    // patchy: flowers grow in drifts
    const drift = smoothstep(0.45, 0.8, texture(W.noise, xz.mul(P('Drift')).add(P('SaltF'))).level(0).x);
    const meadow = float(1).sub(path).mul(float(1).sub(forest)).mul(smoothstep(1, 4, lakeD)).mul(mix(1, 0.3, grazed));
    const where = meadow.mul(mix(P('Dry0'), P('Dry1'), dry)).mul(P('Meadow'))
      .add(grazed.mul(float(1).sub(path)).mul(0.6).mul(P('Grazed')))
      .add(smoothstep(0.08, 0.35, forest).mul(float(1).sub(smoothstep(0.6, 0.9, forest))).mul(float(1).sub(path)).mul(0.9).mul(P('Edge')));
    // none on fully cut ground (earth floors, trodden yards): the boost would otherwise let one through
    const R = P('R');
    const dens = where.mul(drift).mul(float(1).sub(smoothstep(R.sub(12), R, d))).mul(float(1).sub(smoothstep(0.8, 0.95, path)));
    const alive = r(3).lessThan(dens.mul(P('Boost')));
    const H = r(4).mul(P('H1').sub(P('H0'))).add(P('H0')).mul(select(alive, float(1), float(0))).mul(mix(1, 0.4, grazed));
    const th = r(6).mul(PI2), c = cos(th), s = sin(th);
    const lp = positionLocal, headScale = P('Head');
    // stems (verts near the axis) widen to ~1 px, heads grow a little with distance: soft dots, no pins
    const stemPx = d.mul(W.px).div(H.mul(headScale).mul(0.012).max(0.001)).clamp(1, 3);
    const far = smoothstep(5, 18, d);
    const grow = mix(mix(1, 1.35, far), stemPx, float(1).sub(smoothstep(0.008, 0.02, length(lp.xz))));
    const q = vec3(lp.x.mul(c).sub(lp.z.mul(s)), lp.y, lp.x.mul(s).add(lp.z.mul(c))).mul(vec3(grow, 1, grow));
    vD.assign(far);
    const bend = bendAt(W, xz, vec2(r(7).sub(0.5), r(8).sub(0.5)).mul(0.25), r(9));
    const yy = q.y.mul(H);
    const p = vec3(xz.x, A.x.add(F.HBASE).sub(0.02), xz.y).add(vec3(q.x, 0, q.z).mul(H.mul(headScale))).add(vec3(bend.x, 0, bend.y).mul(yy.mul(q.y)).mul(0.9)).add(vec3(0, yy, 0));
    vS.assign(r(10));
    positionPrevious.assign(p);
    return p;
  })();
  const color = attribute('color', 'vec3').mul(vS.mul(0.3).add(0.85)).mul(mix(1, 0.82, vD))
    .mul(mix(0.45, 1, smoothstep(0, 0.85, positionLocal.y)));   // stems shaded in the sward like the blades
  const normal = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize();
  return (flowerMaster = { position, color, normal });
}
function flowerMesh(world, F, W, sp) {
  const geo = flowerGeometry(sp.kind);
  const mat = new BladeMaterial({ side: THREE.DoubleSide, roughness: sp.kind === 'buttercup' ? 0.45 : 0.8, metalness: 0 });
  const n = flowerNodes(F, W);
  mat.positionNode = n.position; mat.colorNode = n.color; mat.normalNode = n.normal;
  const [dry0, dry1] = sp.dry || [1, 1];
  Object.assign(mat, {
    _fS: sp.S, _fC: sp.C, _fSalt: sp.salt, _fSaltF: sp.salt * 0.013, _fDrift: sp.drift, _fR: sp.R, _fBoost: sp.boost, _fH0: sp.h[0], _fH1: sp.h[1],
    _fHead: sp.headScale, _fMeadow: sp.where === 'meadow' ? 1 : 0, _fGrazed: sp.where === 'grazed' ? 1 : 0, _fEdge: sp.where === 'edge' ? 1 : 0, _fDry0: dry0, _fDry1: dry1,
  });
  mat.name = `flowers-${sp.kind}`;
  return chunked(world, W, mat, geo, { S: sp.S, C: sp.C, K: sp.K, name: `flowers-${sp.kind}` });
}

// ---------- lake edge: sedge tussocks and horsetail in the shallows (static, chunked) ----------

function shoreMeshes(world, F, W, rng) {
  F = natureField(world);
  const t = world.terrain;
  const stems = []; // x, z, y, h, yaw, kind (0 sedge leaf, 1 horsetail)
  for (let k = 0; k < 7000; k++) {
    const a = rng() * Math.PI * 2, rr = LAKE.r + (rng() * 2 - 1) * 26;
    const x = LAKE.x + Math.cos(a) * rr * 1.25, z = LAKE.z + Math.sin(a) * rr * 1.25;
    const ld = t.lakeDist(x, z) - LAKE.r, h = t.height(x, z), depth = LAKE.level - h;
    if (F.mask.stone.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 6)) continue; // keep the offering stone in view
    const horse = depth > 0.05 && depth < 0.55;
    const sedge = ld > -2.5 && ld < 2.5 && rng() < 0.6;
    if (!horse && !sedge) continue;
    // clumps: tussocks of 20–40 leaves, horsetail stands of 15–30 stems
    const n = horse ? 30 + rng() * 40 : 30 + rng() * 25, R = horse ? 1.6 : 0.22;
    const H0 = horse ? 0.55 + depth : 0.55 + rng() * 0.3;
    for (let s = 0; s < n; s++) {
      const u = Math.sqrt(rng()) * R, v = rng() * Math.PI * 2;
      const sx = x + Math.cos(v) * u, sz = z + Math.sin(v) * u;
      stems.push(sx, sz, t.height(sx, sz), H0 * (0.6 + rng() * 0.5), rng() * Math.PI * 2, horse ? 1 : 0);
    }
  }
  const count = stems.length / 6;
  // split into sectors around the lake so they frustum-cull
  const SECT = 16, buckets = Array.from({ length: SECT }, () => []);
  for (let i = 0; i < count; i++) {
    const a = Math.atan2(stems[i * 6 + 1] - LAKE.z, stems[i * 6] - LAKE.x);
    buckets[Math.floor((a / (Math.PI * 2) + 0.5) * SECT) % SECT].push(i);
  }
  const mat = new BladeMaterial({ side: THREE.DoubleSide, roughness: 0.6, metalness: 0 });
  const vN = varyingProperty('vec3', 'sN'), vC = varyingProperty('vec3', 'sC'), vT = varyingProperty('float', 'sT');
  const blade = attribute('blade', 'vec3'), st = attribute('stemA', 'vec3'), sb = attribute('stemB', 'vec3');
  mat.positionNode = Fn(() => {
    const xz = vec2(st.x, st.y), y = st.z, H = sb.x, th = sb.y, horse = sb.z;
    const wdir = vec2(cos(th), sin(th)), fdir = vec2(sin(th).negate(), cos(th));
    const seed = hash(th.mul(1000).toUint());
    const lean = fdir.mul(mix(seed.mul(0.28).add(0.06), seed.mul(0.08), horse)); // sedge leaves arch out, horsetail stands up
    const bend = bendAt(W, xz, lean, seed).mul(mix(1, 0.45, horse));
    const t = blade.y, side = blade.x;
    const k = sqrt(float(1).sub(dot(bend, bend).mul(0.55)));
    const Wd = mix(float(0.016), float(0.007), horse);
    const width = Wd.mul(mix(pow(float(1).sub(t), 0.5).mul(0.85).add(0.15), float(1).sub(t.mul(0.5)), horse)).mul(select(t.greaterThan(0.999), float(0), float(1)));
    const p = vec3(xz.x, y.sub(0.04), xz.y).add(vec3(bend.x, 0, bend.y).mul(H.mul(t).mul(t))).add(vec3(0, H.mul(k).mul(t), 0)).add(vec3(wdir.x, 0, wdir.y).mul(side.mul(width)));
    const tan = vec3(bend.x.mul(t.mul(2)), k, bend.y.mul(t.mul(2)));
    let n = normalize(cross(vec3(wdir.x, 0, wdir.y), tan));
    n = select(dot(n, W.cam.sub(p)).lessThan(0), n.negate(), n);
    vN.assign(normalize(n.add(vec3(wdir.x, 0, wdir.y).mul(side.mul(1.4))).add(vec3(0, 0.3, 0))));
    // sedge blue-green with straw tips; horsetail darker green with black nodes (in the fragment)
    vC.assign(mix(mix(lin(0x40602c), lin(0x56703a), seed), lin(0x557537), horse));
    vT.assign(t.add(horse.mul(10)));
    positionPrevious.assign(p);
    return p;
  })();
  mat.normalNode = cameraViewMatrix.mul(vec4(vN, 0)).xyz.normalize();
  const tt = vT.mod(10), horseF = vT.greaterThan(5);
  const nodes = select(horseF, select(sin(tt.mul(70)).greaterThan(0.93), float(0.25), float(1)), float(1));
  const tipS = select(horseF, float(0), smoothstep(0.75, 1, tt));
  mat.colorNode = mix(vC, lin(0xa8955a), tipS.mul(0.7)).mul(mix(0.35, 1, pow(tt, 0.6))).mul(nodes);
  const toFrag = normalize(positionWorld.sub(cameraPosition));
  mat.emissiveNode = vC.mul(W.sunCol).mul(pow(max(dot(toFrag, W.sunDir), 0), 3).mul(0.1).mul(tt));

  const group = new THREE.Group();
  group.name = 'shore-plants';
  for (const b of buckets) {
    if (!b.length) continue;
    const g = bladeGeometry(3);
    const A = new Float32Array(b.length * 3), Bv = new Float32Array(b.length * 3);
    const box = new THREE.Box3();
    b.forEach((i, j) => {
      const o = i * 6;
      A.set([stems[o], stems[o + 1], stems[o + 2]], j * 3);
      Bv.set([stems[o + 3], stems[o + 4], stems[o + 5]], j * 3);
      box.expandByPoint(new THREE.Vector3(stems[o], stems[o + 2], stems[o + 1]));
    });
    box.max.y += 2; box.expandByScalar(1.5);
    g.setAttribute('stemA', new THREE.InstancedBufferAttribute(A, 3));
    g.setAttribute('stemB', new THREE.InstancedBufferAttribute(Bv, 3));
    g.instanceCount = b.length;
    g.boundingBox = box;
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, mat);
    m.castShadow = false; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

// ---------- module ----------

export default async function build(ctx, world) {
  const F = natureField(world), W = natureWind(world);
  // device tier (perf's `engine.tier` when present, else the quality preset): phones and `low` halve
  // the near blades (same 5.6 m chunks, wider cells) and draw two blades per mid tuft instead of three
  const eng = world.engine, tier = eng.tier ?? eng.opts?.tier ?? eng.opts?.quality ?? 'medium';
  const low = tier === 'low' || tier === 'mobile' || tier === 'phone' || (eng.opts?.dpr ?? 1) < 1;
  const near = grassMesh(world, F, W, {
    name: 'near', near: true, C: low ? 40 : 56, K: 7, S: low ? 0.14 : 0.1, segs: 3, nb: 3, tuft: 0.1, rIn: 11, rOut: 16.5, salt: 11, upBlend: 0.25, minPx: 1.3,
    wMul: () => float(1),
  });
  near.traverse((o) => o.layers.set(1)); // layer 1 only: the lake reflector's camera skips it
  world.engine.camera.layers.enable(1);
  const mid = grassMesh(world, F, W, {
    // ?keyart: the mid ring reaches over the whole alaas (90 m chunks); beyond 60 m the px rule alone widens blades
    name: 'mid', near: false, C: KEYART ? 252 : 84, K: KEYART ? 17 : 5, S: 0.36, segs: 2, nb: low ? 2 : 3, tuft: 0.35, rIn: 11, rOut: KEYART ? 700 : 60, salt: 23, upBlend: 0.3, minPx: 1.6,
    wMul: (d) => (KEYART ? d.min(60) : d).mul(0.065).add(1.3).mul(low ? 1.4 : 1),
  });
  mid.traverse((o) => o.layers.set(1)); // the reflection keeps only the static shore plants
  world.scene.add(near, mid);

  // where: 'meadow' (× mix(dry[0], dry[1], dry)), 'grazed' sward, or the forest 'edge'
  const species = [
    { kind: 'buttercup', C: 18, K: 3, S: 1.1, boost: 7, R: 20, h: [0.3, 0.55], headScale: 1.5, salt: 31, drift: 0.05, where: 'meadow', dry: [0.55, 0.2] },
    { kind: 'vetch', C: 17, K: 3, S: 1.2, boost: 6, R: 20, h: [0.3, 0.5], headScale: 1.5, salt: 37, drift: 0.04, where: 'meadow', dry: [0.4, 0.4] },
    { kind: 'yarrow', C: 16, K: 3, S: 1.3, boost: 5, R: 20, h: [0.3, 0.55], headScale: 1.3, salt: 41, drift: 0.035, where: 'meadow', dry: [0.25, 0.6] },
    { kind: 'clover', C: 30, K: 3, S: 0.45, boost: 2.5, R: 13, h: [0.14, 0.24], headScale: 1.5, salt: 47, drift: 0.09, where: 'grazed' },
    { kind: 'fireweed', C: 20, K: 3, S: 2.0, boost: 3, R: 40, h: [0.9, 1.4], headScale: 1, salt: 43, drift: 0.02, where: 'edge' },
  ];
  for (const sp of species) {
    if (KEYART) { sp.C *= Math.ceil(60 / (sp.C * sp.S)); sp.R = 250; sp.K = 2 * Math.ceil(sp.R / (sp.C * sp.S)) + 1; } // ?keyart: to 250 m
    const f = flowerMesh(world, F, W, sp);
    f.traverse((o) => o.layers.set(1));
    world.scene.add(f);
  }
  world.scene.add(shoreMeshes(world, F, W, ctx.rng));
  await F.ready; // the blades join the scene only with their heights (empty, they float at y 0)
}
