// Far trees as billboard impostors. At load every variant is rendered from 8 azimuths into one
// atlas (albedo×AO, and view-space normals), in a single orthographic render of 8×N rotated copies.
// At run time one instanced quad per tree faces the player, picks and blends the two nearest
// frames, and is lit as a normal-mapped surface. It fades in (screen dither) where the real trees
// fade out (R1 ± BAND) and never draws nearer than that.
import * as THREE from 'three/webgpu';
import {
  attribute, uv, vec2, vec3, vec4, float, texture, positionLocal, mix, atan, floor, fract, mod, cameraViewMatrix,
  screenCoordinate, positionPrevious, Fn, hash, normalViewGeometry, varying, sin, smoothstep, mx_noise_float,
} from 'three/tsl';
import { barkMaterial, leafMaterial, U, foliageTexture, gust } from './materials.js';
import { maps } from '../../engine/materials.js';
import { shippedAtlas, atlasKey, exposeBake } from '../../load/atlas.js';

const FRAMES = 8, CW = 128, CH = 256; // frame cell in pixels (1 × 2 world units in the bake)

function bakeMats(species, part) {
  const src = part === 'bark' ? barkMaterial(species, { wind: false, lod: false }) : leafMaterial(species, { wind: false, lod: false });
  const albedo = new THREE.MeshBasicNodeMaterial({ side: src.side });
  // gamma-2 encode so the 8-bit atlas keeps the shadowed greens
  albedo.colorNode = src.colorNode.mul(src.aoNode ?? 1).max(0).sqrt();
  const normal = new THREE.MeshBasicNodeMaterial({ side: src.side });
  normal.colorNode = normalViewGeometry.mul(0.5).add(0.5);
  for (const m of [albedo, normal]) {
    // write coverage as 0/1 so the atlas mips average it (colour is then divided by it)
    if (src.opacityNode) { m.opacityNode = src.opacityNode.greaterThan(src.alphaTest).select(float(1), float(0)); m.alphaTest = 0.5; }
  }
  return { albedo, normal };
}

async function texturesReady(list, timeout = 30000) {
  const t0 = performance.now();
  while (list.some((t) => !t.image || (t.image.complete === false)) && performance.now() - t0 < timeout) await new Promise((r) => setTimeout(r, 50));
}

export async function buildImpostors(world, variants, trees, { R1, BAND }) {
  const renderer = world.engine?.renderer;
  const group = new THREE.Group(); group.name = 'forest-impostors';
  if (!renderer) return { object: group };
  const NV = variants.length, PER_ROW = 2, COLS = FRAMES * PER_ROW, ROWS = Math.ceil(NV / PER_ROW);

  const fit = new Float32Array(NV * 2); // world width/height of a cell for each variant
  const scale = variants.map((v, vi) => {
    const W = v.radius * 2.1, H = v.box.max.y * 1.03, k = Math.min(1 / W, 2 / H);
    fit[vi * 2] = 1 / k; fit[vi * 2 + 1] = 2 / k;
    return k;
  });
  // the shipped atlas (src/load/atlas.js) when it was baked for these variants; bump `v` when the bake changes
  const key = atlasKey('v1|' + variants.map((v, vi) => `${v.species}/${scale[vi].toFixed(5)}/` + ['bark', 'leaves'].map((p) => v.lod0[p]?.attributes.position.count ?? 0).join('/')).join('|'));
  const shipped = await shippedAtlas('forest', key);
  let atlasA, atlasN;
  if (shipped) [atlasA, atlasN] = shipped;
  else {
    // wait for the textures the bake samples
    const texs = [];
    for (const sp of ['larch', 'birch', 'pine', 'shrub']) texs.push(foliageTexture(sp));
    for (const id of ['pine_bark', 'birch_bark', 'bark_brown_02']) { const m = maps(id); texs.push(m.diff, m.nor, m.arm); }
    await texturesReady(texs);

    // ---- bake scene: each variant scaled into a 1×2 cell, 8 rotated copies per row ----
    const scene = new THREE.Scene();
    const mats = {};
    const getMats = (sp, part) => (mats[sp + part] ||= bakeMats(sp, part));
    const copies = [];
    variants.forEach((v, vi) => {
      const row = Math.floor(vi / PER_ROW), col0 = (vi % PER_ROW) * FRAMES;
      for (let f = 0; f < FRAMES; f++) {
        const g = new THREE.Group();
        g.position.set(col0 + f + 0.5, (ROWS - 1 - row) * 2, 0);
        g.rotation.y = -(f / FRAMES) * Math.PI * 2;
        g.scale.setScalar(scale[vi]);
        for (const part of ['bark', 'leaves']) {
          const geo = v.lod0[part];
          if (!geo) continue;
          const m = new THREE.Mesh(geo, getMats(v.species, part).albedo);
          m.userData.part = [v.species, part];
          m.frustumCulled = false;
          g.add(m); copies.push(m);
        }
        scene.add(g);
      }
    });
    const cam = new THREE.OrthographicCamera(0, COLS, ROWS * 2, 0, -50, 50);
    cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
    cam.left = 0; cam.right = COLS; cam.top = ROWS * 2; cam.bottom = 0; cam.position.set(0, 0, 10); cam.updateProjectionMatrix();
    const opts = { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
    const rtA = new THREE.RenderTarget(COLS * CW, ROWS * CH, opts);
    const rtN = new THREE.RenderTarget(COLS * CW, ROWS * CH, opts);
    // the bake's shaders built ahead in time slices (the loading stream, src/load/stream.js): the bake is then quick
    if (world.prewarm) {
      await world.prewarm(scene, cam, rtA);
      for (const m of copies) m.material = getMats(...m.userData.part).normal;
      await world.prewarm(scene, cam, rtN);
      for (const m of copies) m.material = getMats(...m.userData.part).albedo;
    }
    const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const prevTM = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(scene, cam);
    for (const m of copies) m.material = getMats(...m.userData.part).normal;
    renderer.setClearColor(0x808080, 0);
    renderer.setRenderTarget(rtN); renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevAlpha); renderer.toneMapping = prevTM;
    for (const k in mats) { mats[k].albedo.dispose(); mats[k].normal.dispose(); }
    exposeBake('forest', key, rtA, rtN, Promise.resolve());
    [atlasA, atlasN] = [rtA.texture, rtN.texture];
  }

  // ---- instances ----
  const { N, X, Y, Z, ROT, S, VI } = trees;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const ipos = new Float32Array(N * 4), isz = new Float32Array(N * 4);
  for (let k = 0; k < N; k++) {
    const vi = VI[k];
    ipos.set([X[k], Y[k], Z[k], ROT[k]], k * 4);
    isz.set([fit[vi * 2] * S[k], fit[vi * 2 + 1] * S[k], vi, Math.round(trees.DEPTH[k] * 100) + Math.random() * 0.99], k * 4);
  }
  geo.setAttribute('ipos', new THREE.InstancedBufferAttribute(ipos, 4));
  geo.setAttribute('isz', new THREE.InstancedBufferAttribute(isz, 4));
  geo.instanceCount = N;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const P = attribute('ipos', 'vec4'), Z4 = attribute('isz', 'vec4');
  const center = P.xyz;
  const toEye = vec3(U.eye.x.sub(center.x), 0, U.eye.z.sub(center.z));
  const dist = toEye.length();
  const D = toEye.div(dist.max(0.001));
  const right = vec3(D.z, 0, D.x.negate()); // cross(up, D)
  // camera azimuth in the tree's own frame → frame index and blend
  const psi = P.w;
  const cx = D.x.mul(psi.cos()).sub(D.z.mul(psi.sin())), cz = D.x.mul(psi.sin()).add(D.z.mul(psi.cos()));
  const th = atan(cx, cz).div(Math.PI * 2).mul(FRAMES).add(FRAMES);
  const vi = Z4.z;
  const row = floor(vi.div(PER_ROW)), col0 = mod(vi, PER_ROW).mul(FRAMES);
  // per-instance values packed into two varyings (the vertex output limit is 16)
  const VA = varying(vec4(mod(floor(th), FRAMES), fract(th), row, col0));
  const fA = VA.x, fW = VA.y, rowV = VA.z, col0V = VA.w;
  const depth0 = floor(Z4.w).div(100), hue0 = fract(Z4.w);
  const patch0 = mx_noise_float(center.xz.mul(0.006)).mul(0.5).add(mx_noise_float(center.xz.mul(0.025)).mul(0.25));
  // fade against the near rings (complementary dither to lod1's)
  const VB = varying(vec4(float(R1 + BAND).sub(dist).div(2 * BAND).clamp(0, 1), hue0.mul(0.28).add(0.62), depth0, patch0));
  const f1 = VB.x;
  const hidden = dist.lessThan(R1 - BAND - 1);
  // gentle sway of the top in the wind
  const sway = uv().y.mul(uv().y).mul(gust(center)).mul(U.wind).mul(sin(U.time.mul(0.8).add(center.x.mul(0.05))).mul(0.15).add(0.25));
  const wpos = center.add(right.mul(positionLocal.x.sub(0.5).mul(Z4.x))).add(vec3(0, positionLocal.y.mul(Z4.y), 0))
    .add(vec3(U.windDir.x, 0, U.windDir.y).mul(sway));
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  mat.positionNode = Fn(() => {
    const p = hidden.select(center, wpos).toVar();
    positionPrevious.assign(p); // velocity from the billboard, not the unit quad (unused since SMAA)
    return p;
  })();
  const cellUV = (f) => {
    const col = col0V.add(mod(f, FRAMES));
    return vec2(col.add(uv().x).div(COLS), rowV.add(float(1).sub(uv().y)).div(ROWS)); // render targets: v = 0 at the top
  };
  const uvA = cellUV(fA), uvB = cellUV(fA.add(1));
  const a0 = texture(atlasA, uvA), a1 = texture(atlasA, uvB);
  const n0 = texture(atlasN, uvA), n1 = texture(atlasN, uvB);
  const alb = mix(a0, a1, fW);
  const nb = mix(n0.xyz, n1.xyz, fW).mul(2).sub(1);
  const Dv = varying(D), Rv = varying(right);
  const nWorld = Rv.mul(nb.x).add(vec3(0, 1, 0).mul(nb.y)).add(Dv.mul(nb.z)).normalize();
  // per-tree tone; trees inside the forest are darker, most of all low down (shaded by the canopy)
  const tone = VB.y, depth = VB.z;
  const shade = depth.mul(0.55).add(0.45).mul(float(1).sub(smoothstep(0.25, 0.85, uv().y))).mul(0.85);
  const toneAll = tone.mul(float(1).sub(shade)).mul(float(1).sub(depth.mul(0.25)));
  const c = alb.rgb.div(alb.a.max(0.02)).min(1);
  // stand-scale patches so the far forest is not one flat tone; a little extra saturation against the haze
  const patch = VB.w;
  const lin = c.mul(c).mul(toneAll).mul(patch.mul(0.45).add(0.92));
  const lum = lin.dot(vec3(0.3, 0.55, 0.15));
  mat.colorNode = mix(vec3(lum), lin, 1.3).max(0).mul(vec3(patch.mul(0.08).add(1), 1, patch.mul(-0.1).add(1)));
  mat.normalNode = cameraViewMatrix.mul(vec4(nWorld, 0)).xyz.normalize();
  mat.opacityNode = alb.a;
  mat.alphaTest = 0.45;
  const d = hash(screenCoordinate.x.floor().add(screenCoordinate.y.floor().mul(4099.0)));
  mat.maskNode = d.greaterThanEqual(f1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'forest-impostors';
  group.add(mesh);
  return { object: group, atlas: atlasA, normals: atlasN, fit };
}
