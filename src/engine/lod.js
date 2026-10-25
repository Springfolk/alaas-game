// Far LOD for the placed models: billboard impostors, one instanced draw for the whole homestead.
// Each model is split into clusters (its parts whose bounds touch: a house, the smithy, a hay stack…).
// Once the textures have loaded every cluster is rendered from 8 azimuths into an atlas (albedo and
// view-space normals, as the tree impostors are); at run time a camera-facing quad per cluster blends the
// two nearest frames and is lit like any surface. merge.js moves a cluster's own meshes to an unrendered
// layer beyond its switch distance (`far`), where the impostor has dithered in.
import * as THREE from 'three/webgpu';
import { inheritParams } from './master.js';
import {
  attribute, uv, vec2, vec3, vec4, float, texture, positionLocal, mix, atan, floor, fract, mod, cameraPosition,
  uniform, cameraViewMatrix, screenCoordinate, positionPrevious, Fn, hash, normalViewGeometry, varying, materialColor, vertexColor,
} from 'three/tsl';
import { texturesLoaded } from './materials.js';
import { shippedAtlas, atlasKey, exposeBake } from '../load/atlas.js';

const FRAMES = 8, BAND = 14;
export const mirror = uniform(0); // set by lake.js around its reflection render // azimuth frames per cluster; dither band (m) inside the switch distance

// Bake materials for a source material: 'albedo' = unlit colour (its colorNode, or colour × map) times
// vertex colours, gamma-2 encoded so the 8-bit atlas keeps the dark tones; 'normal' = view-space normals.
// Both keep its vertex shaping (positionNode) and its cut-outs (maskNode, alpha test).
function bakeMat(m, kind) {
  const a = new THREE.MeshBasicNodeMaterial({ side: m.side, map: m.map || null, color: m.color || 0xffffff, alphaMap: m.alphaMap || null });
  let c = m.colorNode ? vec4(m.colorNode) : materialColor;
  if (m.vertexColors) c = c.mul(vertexColor());
  const cover = m.alphaTest > 0 ? c.a : float(1);
  a.colorNode = kind === 'albedo' ? vec4(c.rgb.max(0).sqrt(), cover) : vec4(normalViewGeometry.mul(0.5).add(0.5), cover);
  if (m.positionNode) a.positionNode = m.positionNode;
  if (m.maskNode) a.maskNode = m.maskNode;
  if (m.alphaTest > 0) { a.alphaTest = m.alphaTest; if (m.opacityNode) a.opacityNode = m.opacityNode; }
  return inheritParams(a, m); // the values its nodes read (src/engine/master.js)
}

// clusters of one model root: connected parts (bounding spheres touching, +0.5 m)
function clusters(root, inv, skip) {
  const items = [];
  const sp = new THREE.Sphere();
  root.traverse((o) => {
    if (!o.isMesh || skip(o) || !o.geometry?.attributes.position) return;
    const m = o.material;
    if (Array.isArray(m) || m.transparent || m.visible === false || m.colorWrite === false || o.isInstancedMesh) return;
    for (let p = o; p && p !== root.parent; p = p.parent) if (!p.visible) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sp.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    if (sp.radius > 15) return; // one huge part (a long fence, a path): stays live
    items.push({ o, c: sp.center.clone(), r: sp.radius, local: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
  });
  // union-find over touching parts, but no cluster wider than MAX m (a yard of scattered things would
  // otherwise chain into one card)
  const MAX = 30;
  const parent = items.map((_, i) => i), bx = items.map((it) => [it.c.x - it.r, it.c.x + it.r, it.c.z - it.r, it.c.z + it.r]);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const gap = items[i].c.distanceTo(items[j].c) - items[i].r - items[j].r;
    if (gap < 0.5) pairs.push([gap, i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [, i, j] of pairs) {
    const a = find(i), b = find(j);
    if (a === b) continue;
    const u = [Math.min(bx[a][0], bx[b][0]), Math.max(bx[a][1], bx[b][1]), Math.min(bx[a][2], bx[b][2]), Math.max(bx[a][3], bx[b][3])];
    if (u[1] - u[0] > MAX || u[3] - u[2] > MAX) continue;
    parent[a] = b; bx[b] = u;
  }
  const by = new Map();
  items.forEach((it, i) => { const k = find(i); if (!by.has(k)) by.set(k, []); by.get(k).push(it); });
  return [...by.values()];
}

// Builds the impostor mesh (added to the scene now, so warm-up compiles it) with the shipped atlas
// (src/load/atlas.js), or bakes one once the textures are in. Returns { mesh, clusters: [{ meshes, x, z, far }], baked: Promise }.
export async function buildImpostors(world, { skip = () => false, cell = 128, mirrorOk = () => true } = {}) {
  const renderer = world.engine.renderer;
  const list = [];
  for (const { object } of world.placed) {
    object.updateMatrixWorld(true);
    const inv = object.matrixWorld.clone().invert();
    for (const parts of clusters(object, inv, skip)) {
      // bounds in the model's frame
      const box = new THREE.Box3();
      for (const it of parts) {
        const g = it.o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        box.union(g.boundingBox.clone().applyMatrix4(it.local));
      }
      const size = box.getSize(new THREE.Vector3());
      if (Math.max(size.x, size.y, size.z) < 2.5) continue; // small things: culled by size instead (merge.js)
      const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      let R = 0;
      for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) R = Math.max(R, Math.hypot(x - cx, z - cz));
      const H = box.max.y - box.min.y;
      const yaw = object.rotation.y;
      const w = new THREE.Vector3(cx, box.min.y, cz).applyMatrix4(object.matrixWorld);
      const S = Math.max(2 * R, H); // square cell: uniform scale keeps the baked normals true
      list.push({ object, parts, cx, cz, y0: box.min.y, R, H, S, yaw, x: w.x, y: w.y, z: w.z, far: Math.max(110, 6 * S) });
    }
  }
  const N = list.length, COLS = 16, ROWS = Math.ceil(N * FRAMES / COLS);
  // what the bake shows: the clusters' frames and their parts (geometry size, material) — bump `v` when the bake changes
  const key = atlasKey('v1|' + list.map((c) => [c.x, c.y, c.z, c.S, c.yaw].map((v) => v.toFixed(2)).join(',') + ':' + c.parts.map(({ o }) =>
    `${o.geometry.index?.count ?? o.geometry.attributes.position.count}/${o.material.name}/${o.material.color?.getHexString() ?? ''}/${o.material.map?.name ?? ''}`).join(';')).join('|'));
  const shipped = N ? await shippedAtlas('homestead', key) : null;
  const opts = { type: THREE.UnsignedByteType, samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
  const rtA = shipped ? null : new THREE.RenderTarget(COLS * cell, Math.max(1, ROWS) * cell, opts);
  const rtN = shipped ? null : new THREE.RenderTarget(COLS * cell, Math.max(1, ROWS) * cell, opts);
  const [atlasA, atlasN] = shipped || [rtA.texture, rtN.texture];

  // ---- instances: (x, y0, z, yaw), (cell size S, S, index of frame 0, ±switch distance: negative = the
  // lake mirror shows the real meshes, not the impostor) ----
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const ipos = new Float32Array(Math.max(1, N) * 4), isz = new Float32Array(Math.max(1, N) * 4);
  list.forEach((c, i) => { c.mirror = mirrorOk(c); ipos.set([c.x, c.y, c.z, c.yaw], i * 4); isz.set([c.S, c.S, i * FRAMES, c.mirror ? c.far : -c.far], i * 4); });
  geo.setAttribute('ipos', new THREE.InstancedBufferAttribute(ipos, 4));
  geo.setAttribute('isz', new THREE.InstancedBufferAttribute(isz, 4));
  geo.instanceCount = N;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const P = attribute('ipos', 'vec4'), Z4 = attribute('isz', 'vec4');
  const base = P.xyz;
  const toEye = vec3(cameraPosition.x.sub(base.x), 0, cameraPosition.z.sub(base.z));
  const dist = toEye.length();
  const D = toEye.div(dist.max(0.001));
  const right = vec3(D.z, 0, D.x.negate());
  // camera azimuth in the model's frame → frame and blend (frame f was baked looking from yaw f/8 · 2π)
  const psi = P.w;
  const cx = D.x.mul(psi.cos()).sub(D.z.mul(psi.sin())), cz = D.x.mul(psi.sin()).add(D.z.mul(psi.cos()));
  const th = atan(cx, cz).div(Math.PI * 2).mul(FRAMES).add(FRAMES);
  // `mirror` = 1 while the lake reflection renders: the impostors stand in for the models there at any distance
  const far = Z4.w.abs(), all = mirror.mul(Z4.w.greaterThan(0).select(float(1), float(0)));
  const VA = varying(vec4(mod(floor(th), FRAMES), fract(th), Z4.z, dist.sub(far.sub(BAND)).div(BAND).clamp(0, 1).max(all)));
  const hidden = dist.lessThan(far.sub(BAND)).and(all.lessThan(0.5));
  const wpos = base.add(right.mul(positionLocal.x.sub(0.5).mul(Z4.x))).add(vec3(0, positionLocal.y.mul(Z4.y), 0));
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'impostor';
  mat.positionNode = Fn(() => {
    const p = hidden.select(base, wpos).toVar();
    positionPrevious.assign(p);
    return p;
  })();
  const cellUV = (f) => {
    const k = VA.z.add(mod(f, FRAMES)), col = mod(k, COLS), row = floor(k.div(COLS));
    return vec2(col.add(uv().x).div(COLS), row.add(float(1).sub(uv().y)).div(Math.max(1, ROWS))); // render targets: v = 0 at the top
  };
  const uvA = cellUV(VA.x), uvB = cellUV(VA.x.add(1));
  const alb = mix(texture(atlasA, uvA), texture(atlasA, uvB), VA.y);
  const nb = mix(texture(atlasN, uvA).xyz, texture(atlasN, uvB).xyz, VA.y).mul(2).sub(1);
  const Dv = varying(D), Rv = varying(right);
  const nWorld = Rv.mul(nb.x).add(vec3(0, 1, 0).mul(nb.y)).add(Dv.mul(nb.z)).normalize();
  const c = alb.rgb.div(alb.a.max(0.02)).min(1);
  mat.colorNode = c.mul(c);
  mat.normalNode = cameraViewMatrix.mul(vec4(nWorld, 0)).xyz.normalize();
  mat.opacityNode = alb.a;
  mat.alphaTest = 0.5;
  // dithers in over the band before the switch distance, where the real meshes still draw
  mat.maskNode = hash(screenCoordinate.x.floor().add(screenCoordinate.y.floor().mul(4099.0))).lessThan(VA.w);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'impostors';
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.visible = N > 0;

  // ---- bake: every cluster's parts (unlit albedo, then normals) into its 8 cells ----
  // Each frame is rendered in place (real world positions, from 130 m out on the frame's azimuth), so
  // materials whose look depends on the eye's distance (LOD dithers, fades) bake their far state.
  const bake = async () => {
    const albedo = new Map(), normal = new Map();
    const scenes = list.map((cl) => {
      const scene = new THREE.Scene();
      for (const it of cl.parts) {
        const src = it.o.material;
        if (!albedo.has(src)) { albedo.set(src, bakeMat(src, 'albedo')); normal.set(src, bakeMat(src, 'normal')); }
        const m = new THREE.Mesh(it.o.geometry, albedo.get(src));
        m.userData.src = src;
        m.matrixAutoUpdate = false; m.matrix.copy(it.o.matrixWorld);
        m.frustumCulled = false;
        scene.add(m);
      }
      return scene;
    });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    // frame f looks from model-local azimuth f/8 · 2π (x = sin, z = cos), turned by the model's yaw
    const frame = (cl, f) => {
      const h = cl.S / 2, cy = cl.y + h;
      cam.left = -h; cam.right = h; cam.top = h; cam.bottom = -h; cam.far = 130 + cl.S * 2; cam.updateProjectionMatrix();
      const al = (f / FRAMES) * Math.PI * 2, lx = Math.sin(al), lz = Math.cos(al), c = Math.cos(cl.yaw), sn = Math.sin(cl.yaw);
      cam.position.set(cl.x + (lx * c + lz * sn) * 130, cy, cl.z + (-lx * sn + lz * c) * 130);
      cam.lookAt(cl.x, cy, cl.z);
      cam.updateMatrixWorld();
    };
    // shaders first, in the loader's time slices (world.prewarm), so the bake renders build nothing
    for (const [i, sc] of scenes.entries()) for (const kind of ['albedo', 'normal']) {
      sc.traverse((m) => { if (m.isMesh) m.material = (kind === 'albedo' ? albedo : normal).get(m.userData.src); });
      frame(list[i], 0);
      const tm = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping; // the state the shaders are queued with (read synchronously)
      const ready = world.prewarm?.(sc, cam, kind === 'albedo' ? rtA : rtN);
      renderer.toneMapping = tm;
      await ready;
    }
    const pass = async (rt, kind, clear) => {
      for (const [i, cl] of list.entries()) {
        const prev = { rt: renderer.getRenderTarget(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), tm: renderer.toneMapping, auto: renderer.autoClear };
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.autoClear = false;
        renderer.setRenderTarget(rt);
        if (i === 0) { renderer.setClearColor(clear, 0); renderer.clear(); }
        scenes[i].traverse((m) => { if (m.isMesh) m.material = (kind === 'albedo' ? albedo : normal).get(m.userData.src); });
        for (let f = 0; f < FRAMES; f++) {
          frame(cl, f);
          const n = i * FRAMES + f, col = n % COLS, row = Math.floor(n / COLS);
          rt.viewport.set(col * cell, row * cell, cell, cell); // WebGPU viewports count rows from the top, as the sampling v does
          renderer.render(scenes[i], cam);
        }
        rt.viewport.set(0, 0, rt.width, rt.height);
        renderer.setRenderTarget(prev.rt); renderer.setClearColor(prev.clear, prev.alpha);
        renderer.toneMapping = prev.tm; renderer.autoClear = prev.auto;
        await new Promise((r) => setTimeout(r, 0)); // a cluster per task: no long main-thread stall
      }
    };
    await pass(rtA, 'albedo', 0x000000);
    await pass(rtN, 'normal', 0x808080);
    for (const m of [...albedo.values(), ...normal.values()]) m.dispose();
  };
  const baked = N && !shipped ? texturesLoaded().then(bake).catch((e) => console.warn('impostor bake', e)) : Promise.resolve();
  exposeBake('homestead', key, rtA, rtN, baked);
  return { mesh, clusters: list, baked };
}
