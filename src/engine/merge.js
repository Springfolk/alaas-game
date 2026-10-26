// Draw-call merging for the placed models (applied by world.js once the homestead is built).
//
// Shadow casters: every static, opaque caster of a model is merged into one depth-only proxy per shadow
// side, drawn only by the sun's cascade cameras (layer SHADOW_LAYER), and the originals stop casting.
// ~140 shadow draws per cascade become ~2 per model; shadows keep the exact shapes. Kept separate: wind-
// or vertex-animated materials (positionNode), alpha-tested/transparent ones, instanced/skinned meshes,
// the targets of hands-on acts and things to take, and anything marked `userData.dynamic`. A watchdog checks the merged
// sources every half second: one that moves or hides after all is given back its own shadow (and logged,
// so it can be marked `userData.dynamic`).
//
// Far LOD: beyond a cluster's switch distance its meshes move to an unrendered layer and its billboard
// impostor (lod.js) stands in; small parts also go once under ~2.5 px on screen (layers, not `visible`:
// no recompiles, no clash with the models' own visibility).
import * as THREE from 'three/webgpu';
import { lights } from 'three/tsl';
import { buildImpostors } from './lod.js';
import { TIER } from './tier.js';
import { LAKE } from '../world/terrain.js';
import { KEYART, urlFlag } from '../util.js';
import { work } from '../load/workers.js';

export const SHADOW_LAYER = 2, CULL_LAYER = 30;
// The loader (src/load/stream.js collect) renders once with the view camera on every layer to build every
// shader: culling must then step aside, in every pass.
export const compiling = (camera) => (camera.layers.mask | 0) === -1;
// a merged shadow caster: drawn only by the cascade cameras, with the shadow pass's material
export const isShadowProxy = (o) => o.userData.shadowProxy === true;
const _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Sphere();

// One BufferGeometry (positions + index) from [{ geometry, matrix }] in a common frame.
function mergePositions(parts) {
  let nv = 0, ni = 0;
  for (const { geometry: g } of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const { geometry: g, matrix } of parts) {
    const p = g.attributes.position, n = p.count;
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z;
    }
    const flip = matrix.determinant() < 0; // mirrored: keep the winding (and so the culled side) right
    const src = g.index ? g.index.array : null, m = src ? src.length : n;
    for (let t = 0; t + 2 < m; t += 3) {
      const a = src ? src[t] : t, b = src ? src[t + 1] : t + 1, c = src ? src[t + 2] : t + 2;
      idx[io++] = vo + a; idx[io++] = vo + (flip ? c : b); idx[io++] = vo + (flip ? b : c);
    }
    vo += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, io), 1));
  geo.computeBoundingSphere();
  return geo;
}

const plain = (o) => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.isBatchedMesh && !Array.isArray(o.material)
  && o.geometry?.attributes.position && !o.geometry.morphAttributes.position && !o.geometry.isInstancedBufferGeometry
  && o.geometry.drawRange.start === 0 && o.geometry.drawRange.count === Infinity;
const opaque = (m) => !m.transparent && !(m.alphaTest > 0) && !m.alphaMap && !m.positionNode && !m.castShadowNode
  && !m.castShadowPositionNode && !m.maskShadowNode && !m.displacementMap && m.colorWrite !== false;
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

// The proxy's triangles simplified in a load worker (src/load/simplify.js: ~1.5 cm, under a shadow texel; the
// shadow pass drew the models' full detail per cascade): a new geometry with the same position attribute, the
// swap the watchdog's rebuild does too (no new shader). Resolves when done; none on the main thread.
const SHADOW_ERROR = 0.015;
function simplified(proxy) {
  if (KEYART || urlFlag('fullshadow')) return null; // ?keyart: exact shadows; ?fullshadow: A/B
  const g = proxy.geometry, pos = g.attributes.position.array, idx = Uint32Array.from(g.index.array);
  return work('simplify', { pos, idx, error: SHADOW_ERROR }, () => null).then((out) => {
    if (!out || proxy.geometry !== g || out.length >= idx.length) return;
    const s = new THREE.BufferGeometry();
    s.setAttribute('position', g.attributes.position);
    s.setIndex(new THREE.BufferAttribute(g.index.array instanceof Uint16Array ? Uint16Array.from(out) : out, 1));
    s.boundingSphere = g.boundingSphere;
    proxy.geometry = s;
    console.info(`${proxy.name}: shadow ${idx.length / 3} → ${out.length / 3} triangles`);
  }).catch((e) => console.warn('shadow simplify', e));
}

// Merged shadow proxies for one placed model root. `dynamic` = Object3Ds whose subtrees stay separate.
function shadowProxies(root, dynamic) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map();
  const walk = (o) => {
    if (dynamic.has(o) || o.userData.dynamic) return;
    if (plain(o) && o.castShadow && opaque(o.material) && shown(o)) {
      const m = o.material, side = `${m.side}|${m.shadowSide}`; // the shadow pass picks the culled side from both
      let g = groups.get(side);
      if (!g) groups.set(side, g = []);
      g.push(o);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  const out = [];
  for (const [, list] of groups) {
    // one mesh: only worth a proxy for its simplified triangles (the serge's posts: 82k)
    if (list.length < 2 && (list[0].geometry.index?.count ?? list[0].geometry.attributes.position.count) < 60000) continue;
    const m0 = list[0].material;
    const mat = new THREE.MeshBasicNodeMaterial({ side: m0.side, shadowSide: m0.shadowSide, colorWrite: false });
    mat.name = 'shadow-proxy';
    const sources = list.map((o) => ({ o, mw: o.matrixWorld.clone() })), inv = _inv.clone();
    const merged = () => mergePositions(proxy.userData.sources.map(({ o }) => ({ geometry: o.geometry, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) })));
    const proxy = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    proxy.userData.sources = sources; proxy.userData.shadowProxy = true;
    proxy.geometry = merged();
    proxy.userData.simplified = simplified(proxy);
    proxy.name = `${root.name || 'model'}-shadow`;
    proxy.castShadow = true; proxy.receiveShadow = false;
    proxy.layers.set(SHADOW_LAYER);
    const rebuild = () => { proxy.geometry.dispose(); proxy.geometry = merged(); };
    proxy.userData.rebuild = rebuild;
    for (const o of list) o.castShadow = false;
    root.add(proxy);
    out.push(proxy);
  }
  return out;
}

// Applies the optimisations to the world's placed models: shadow proxies, far impostors (lod.js) and size
// culling. Returns { update, proxies, impostors } — `update` (dt) runs the culling and the watchdog.
export function optimizePlaced(world, camera, sun) {
  const dynamic = new Set();
  // targets that do more than show a card (acts, things to take, switched off/on) may move or hide
  const PLAIN = new Set(['entry', 'target', 'zone', 'label']);
  for (const it of world.interactables) if (it.target && Object.keys(it).some((k) => !PLAIN.has(k))) dynamic.add(it.target);
  const isDynamic = (o) => { for (let p = o; p; p = p.parent) if (dynamic.has(p) || p.userData.dynamic) return true; return false; };
  // built in slices (a model per task) while the rest loads; World.build awaits `ready`
  const proxies = [], parts = [];
  let imp = null, far = null, baked = false; // until the impostors are baked (late in the load stream) the real meshes stay
  const breathe = () => new Promise((r) => setTimeout(r, 0));
  const init = async () => {
    for (const { object } of world.placed) { proxies.push(...shadowProxies(object, dynamic)); await breathe(); }
    await Promise.all(proxies.map((p) => p.userData.simplified)); // before the loader builds their pipelines
    // the cascade cameras draw layer 0 (as before) plus the proxies; the view and the lake mirror don't
    // and, while the loader compiles everything (the view camera on all layers), the culled parts too
    const cams = [];
    for (let i = 0; i < (sun.shadow.getViewportCount?.() ?? 1); i++) { const c = sun.shadow.getCamera?.(i); if (c) { c.layers.enable(SHADOW_LAYER); cams.push(c); } }
    const fit = sun.shadow.updateMatrices.bind(sun.shadow);
    sun.shadow.updateMatrices = (light, cam) => {
      const all = compiling(cam);
      for (const c of cams) c.layers.mask = (1 << SHADOW_LAYER) | 1 | (all ? 1 << CULL_LAYER : 0);
      return fit(light, cam);
    };

    const isProxy = (o) => o.layers.mask === 1 << SHADOW_LAYER;
    // impostors stand in for the models in the lake mirror too, except near the water (seen up close there)
    const mirrorOk = (c) => !KEYART && Math.hypot(c.x - LAKE.x, c.z - LAKE.z) - LAKE.r - c.R > 40; // ?keyart: real meshes in the mirror
    const built = await buildImpostors(world, { skip: isProxy, cell: TIER.name === 'mobile' ? 64 : 128, mirrorOk });
    built.mesh.material.lightsNode = lights([sun]); // lit by the sun and sky only, as nature is
    built.mesh.visible = !KEYART;
    THREE.Object3D.prototype.add.call(world.scene, built.mesh); // past World.build's staging of scene.add
    await breathe();
    const clusterOf = new Map();
    built.clusters.forEach((c, i) => { for (const it of c.parts) clusterOf.set(it.o, i); });
    far = new Uint8Array(built.clusters.length);

    // every mesh of the models: culled when far (its cluster's impostor stands in) or tiny on screen; parts
    // not in the bake (smoke, flames, glows) go with the cluster whose bounds hold them, so nothing live
    // shows through an impostor
    const inside = (c, p) => Math.hypot(p.x - c.x, p.z - c.z) < c.R + 0.3 && p.y > c.y - 0.3 && p.y < c.y + c.H;
    for (const { object } of world.placed) object.traverse((o) => {
      if (!o.isMesh || isProxy(o) || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      let cl = clusterOf.get(o) ?? -1;
      if (cl < 0) cl = built.clusters.findIndex((c) => c.object === object && inside(c, _s.center));
      if (isDynamic(o) && cl < 0) return;
      if (_s.radius >= 3 && cl < 0) return;
      parts.push({ o, parent: o.parent, x: _s.center.x, y: _s.center.y, z: _s.center.z, r: _s.radius, cl, mask: o.layers.mask, culled: false });
    });
    imp = built;
    built.baked.then(() => { baked = true; });
  };
  const ready = init();

  let t = 0, cursor = 0, warned = 0;
  const update = (dt) => {
    if (!imp || KEYART) return; // ?keyart: every mesh at every distance, no impostors
    const cam = camera.position;
    for (let i = 0; i < far.length; i++) {
      const c = imp.clusters[i], d = Math.hypot(c.x - cam.x, c.z - cam.z);
      far[i] = !baked ? 0 : d > c.far ? 1 : d < c.far - 2 ? 0 : far[i]; // 2 m hysteresis
    }
    // a slice per frame: tiny = under ~2.5 px at the current FOV and height
    const k = 2.5 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, innerHeight);
    const n = Math.min(parts.length, 96);
    for (let j = 0; j < n; j++) {
      const s = parts[cursor = (cursor + 1) % parts.length];
      if (s.o.parent !== s.parent) { if (s.culled) s.o.layers.mask = s.mask; s.culled = false; s.gone = true; } // re-parented: hands off
      if (s.gone) continue;
      const cull = (s.cl >= 0 && far[s.cl] === 1) || 2 * s.r < Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z) * k;
      if (cull !== s.culled) { s.culled = cull; s.o.layers.mask = cull ? 1 << CULL_LAYER : s.mask; }
    }
    // watchdog: a merged source that moved or hid gets its own shadow back
    t += dt;
    if (t < 0.5) return;
    t = 0;
    for (const p of proxies) {
      const src = p.userData.sources;
      const moved = src.filter(({ o, mw }) => !shown(o) || !o.matrixWorld.equals(mw));
      if (!moved.length) continue;
      for (const { o } of moved) o.castShadow = true;
      p.userData.sources = src.filter((s) => !moved.includes(s));
      if (warned++ < 8) console.warn(`merge: ${moved.map(({ o }) => o.name || o.material?.name).join(', ')} in ${p.name} moved; mark it userData.dynamic`);
      if (p.userData.sources.length) p.userData.rebuild(); else p.visible = false;
    }
  };
  // for the lake mirror (lake.js): the model meshes an impostor stands in for there
  const mirrored = () => (imp ? parts.filter((p) => p.cl >= 0 && imp.clusters[p.cl].mirror && !p.gone).map((p) => p.o) : []);
  return { update, ready, proxies, mirrored, get impostors() { return imp; } };
}
