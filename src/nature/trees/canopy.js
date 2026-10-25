// The taiga beyond the last impostor trees: a ring-shaped canopy sheet that follows the terrain
// ~17 m up, with a spiky top edge (crowns) and normals leaning towards the alaas, so it reads as a
// dark, sunlit-on-one-side wall of forest fading into the haze at the horizon.
import * as THREE from 'three/webgpu';
import { positionWorld, mx_noise_float, vec3, mix, smoothstep } from 'three/tsl';
import { hash2 } from '../../util.js';

export function canopyGeometry(terrain, rIn, rOut = 3300) {
  const SEG = 1400, RING = 34;
  const pos = [], nor = [], edge = [], idx = [];
  for (let j = 0; j <= RING; j++) {
    // rings bunched near the inner edge where detail shows
    const t = j / RING, r = rIn + (rOut - rIn) * t * t;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // crown spikes: every other vertex a bit higher, plus clumps
      const spike = (hash2(i, j, 5) - 0.3) * 4.5 * (1 - t * 0.6);
      const h = terrain.height(x, z) + 15.5 + spike + (hash2(i >> 3, j, 9) - 0.5) * 3;
      pos.push(x, j === 0 ? terrain.height(x, z) - 1 : h, z);
      const k = 0.75; // lean the normal towards the alaas centre
      const nx = -Math.cos(a) * k, nz = -Math.sin(a) * k, ny = 0.65;
      const l = Math.hypot(nx, ny, nz);
      nor.push(nx / l, ny / l, nz / l);
      edge.push(t);
    }
  }
  const W = SEG + 1;
  for (let j = 0; j < RING; j++) for (let i = 0; i < SEG; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // ring 0 → ring 1 forms the inner wall (from the ground up to the crowns)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function buildCanopyBand(g) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const p = positionWorld;
  const n1 = mx_noise_float(p.xz.mul(0.004)), n2 = mx_noise_float(p.xz.mul(0.02)), n3 = mx_noise_float(p.xz.mul(0.09));
  const larch = vec3(0.045, 0.062, 0.03), birch = vec3(0.07, 0.09, 0.035), dark = vec3(0.022, 0.03, 0.02);
  let col = mix(larch, birch, smoothstep(0.15, 0.5, n1));
  col = mix(col, dark, smoothstep(-0.1, 0.4, n3).mul(0.6));
  mat.colorNode = col.mul(n2.mul(0.25).add(1));
  mat.name = 'forest-canopy';
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'forest-canopy';
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  return mesh;
}
