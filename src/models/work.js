// Props for the hands-on work (logic in src/interact/work/): the axe (сүгэ) standing in the chopping block by
// the woodpile and two rounds of larch (чурбаан), each built as four mating quarters that split apart.
// Placed at the homestead centre (HOME); everything here moves, so src/interact reparents it to the scene.
// The parts are found in `object.userData.work`.
import { Bucket, boxUV, logGeo, mtx } from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';

// the woodpile's frame (yardlife PLACES.woodpile) and its chopping block (pieces.js `woodpile`)
export const CHOP = { pile: [-6.5, -11, 0.12], block: [1.5, 1.6], top: 0.5, r: 0.25 };
export const ROUND = { len: 0.5, r: 0.15, n: 2 }; // rounds that can be out at once (four quarters each)
export const AXE = { len: 0.72, head: 0.655, edge: 0.105 }; // haft along +Y; the head at `head`, its edge `edge` out along +X

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const ground = (x, z) => terrain.height(px + x, pz + z) - py;
  const M = yardMats();
  const object = new T.Group();
  object.name = 'work';
  const interactables = [];
  const hidden = new T.MeshBasicMaterial({ visible: false });
  const proxy = (w, h, d, x, y, z, yaw = 0) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), hidden);
    m.position.set(x, y, z); m.rotation.y = yaw; m.castShadow = false; m.receiveShadow = false;
    object.add(m);
    return m;
  };
  const air = () => -1; // movable things take no ground grime

  // the chopping block (local to HOME), as pieces.js places it
  const [wx, wz, wyaw] = CHOP.pile, c = Math.cos(wyaw), s = Math.sin(wyaw);
  const bx = wx + CHOP.block[0] * c + CHOP.block[1] * s, bz = wz - CHOP.block[0] * s + CHOP.block[1] * c;
  const by = ground(bx, bz) - 0.05 + 0.55;

  // ── the axe (сүгэ): a narrow forged wedge with a short beard on a straight birch haft ──
  const axe = new T.Group(); axe.name = 'axe';
  {
    const B = new Bucket(air);
    const haft = logGeo(AXE.len, 0.0165, 0.019, rng, { seg: 8, step: 0.12, bend: 0.012, wob: 0.03, caps: true });
    // an oval grip, swelling a little at the butt
    const hp = haft.side.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const y = hp.getY(i), k = 1 + 0.28 * Math.max(0, 1 - y / 0.1) ** 2;
      hp.setXYZ(i, hp.getX(i) * 1.22 * k, y, hp.getZ(i) * 0.86 * k);
    }
    haft.side.computeVertexNormals();
    B.add(haft.side, M.fresh, null, [0.72, 0.6, 0.48]);
    B.add(haft.caps, M.end, null, [0.8, 0.7, 0.6]);
    // the head: poll at −X, thinning to the edge at +X; the lower corner drawn down into a beard
    const L = 0.15, H = 0.046, W = 0.034;
    const head = new T.BoxGeometry(L, H, W, 8, 4, 2);
    const p = head.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.max(0, (p.getX(i) + L / 2) / L)), y = p.getY(i) / (H / 2), z = p.getZ(i);
      const flare = y < 0 ? 1 + 1.7 * t ** 1.7 : 1 + 0.55 * t ** 2;
      const thick = t < 0.3 ? 1 : 1 - 0.965 * ((t - 0.3) / 0.7) ** 0.85;
      const curve = 0.012 * t ** 3 * (1 - Math.min(1, Math.abs(y * flare) / 2.4) ** 2); // a slightly rounded edge
      p.setXYZ(i, p.getX(i) + curve, y * flare * H / 2, z * thick);
      const g = t > 0.86 ? 1.9 : t > 0.3 ? 0.95 + 0.1 * Math.sin(t * 40 + y * 9) : 0.8; // the ground bevel is bright, the rest forge-black
      col[i * 3] = g; col[i * 3 + 1] = g; col[i * 3 + 2] = g * (t > 0.86 ? 1.03 : 1);
    }
    head.setAttribute('color', new T.BufferAttribute(col, 3));
    head.computeVertexNormals(); boxUV(head, 4);
    B.add(head, M.iron, mtx([AXE.edge - L / 2 - 0.012, AXE.head, 0]));
    // the haft's head stands a finger proud of the eye, spread by a wedge
    B.add(boxUV(new T.BoxGeometry(0.03, 0.006, 0.006), 8), M.end, mtx([0, AXE.len + 0.001, 0]), [0.55, 0.45, 0.38]);
    for (const m of B.build(axe)) m.castShadow = true;
  }
  // at rest: the edge (local [edge, head, 0]) bitten 1.5 cm into the block's top, the haft leaning out over the yard
  {
    const q = new T.Quaternion().setFromEuler(new T.Euler(0, 0.9, Math.PI + 0.85, 'YXZ'));
    axe.quaternion.copy(q);
    axe.position.set(bx + 0.03, by - 0.015, bz).sub(new T.Vector3(AXE.edge, AXE.head, 0).applyQuaternion(q));
  }
  axe.userData.dynamic = true;
  object.add(axe);
  interactables.push({ target: axe, tool: 'axe', label: { sah: 'сүгэ', en: 'axe (сүгэ)', ru: 'топор (сүгэ)' } });

  // ── rounds: four quarters about the pith (local origin on the axis, base at y 0), mating along two seams ──
  const pieces = [];
  for (let r = 0; r < ROUND.n; r++) {
    const R = ROUND.r * (0.94 + rng() * 0.12), LEN = ROUND.len;
    const ph = [rng() * 7, rng() * 7, rng() * 7, rng() * 7, rng() * 7, rng() * 7];
    const tb = [(rng() - 0.5) * 0.06, (rng() - 0.5) * 0.06], tt = [(rng() - 0.5) * 0.07, (rng() - 0.5) * 0.07];
    const rr = (a) => R * (1 + 0.045 * Math.sin(2 * a + ph[0]) + 0.022 * Math.sin(5 * a + ph[1]));
    // how far a split face stands off its plane at (seam, s = pith…rim, t = base…top): long fibres torn, never flat
    const wav = (seam, s, t) => Math.min(1, s * 5) * (0.0035 * Math.sin(5.5 * t + ph[2] + seam * 2.1) * Math.sin(2.6 * s + ph[3] + seam)
      + 0.0016 * Math.sin(47 * s + ph[4] + seam * 3) + 0.0009 * Math.sin(91 * s + 19 * t + ph[5]));
    const yAt = (x, z, t) => (1 - t) * (tb[0] * x + tb[1] * z) + t * (LEN + tt[0] * x + tt[1] * z);
    // a point at angle a, radius fraction s, height fraction t (between seams k and k+1)
    const at = (k, a, s, t) => {
      const a0 = k * Math.PI / 2, f = (a - a0) / (Math.PI / 2);
      const off = wav(k % 4, s, t) * (1 - f) + wav((k + 1) % 4, s, t) * f;
      const rho = s * rr(a), x = Math.cos(a) * rho - Math.sin(a) * off, z = Math.sin(a) * rho + Math.cos(a) * off;
      return [x, yAt(x, z, t), z];
    };
    for (let k = 0; k < 4; k++) {
      const a0 = k * Math.PI / 2, a1 = a0 + Math.PI / 2;
      const arc = [a0, a0 + 0.07, ...[1, 2, 3, 4].map((i) => a0 + i * Math.PI / 10), a1 - 0.07, a1];
      const NT = 6, NS = 5;
      const g = new T.Group(); g.name = 'quarter';
      const B = new Bucket(air);
      const tint = [0.94 + rng() * 0.1, 0.92 + rng() * 0.08, 0.9 + rng() * 0.08];
      // the bark
      B.add(grid(T, arc.length - 1, NT, (i, j) => at(k, arc[i], 1, j / NT), (i, j) => [arcLen(arc, i, R), j / NT * LEN], (x, y, z) => [x, 0, z]), M.bark, null, tint);
      // the two split faces
      const face = (a, sgn) => grid(T, NS, NT, (i, j) => at(k, a, i / NS, j / NT), (i, j) => [i / NS, j / NT * LEN / 0.6 + k * 0.23], () => [sgn * Math.sin(a), 0, -sgn * Math.cos(a)]);
      const faces = [face(a0, 1), face(a1, -1)];
      for (const f of faces) B.add(f, M.splitFace, null, tint);
      // the ends: growth rings about the pith (uv = metres from it); the seam a round will open along shows as a
      // dark check (seams 0 and 2: the line through the pith), the other only as a hairline
      for (const end of [0, 1]) {
        const cap = grid(T, arc.length - 1, NS, (i, j) => at(k, arc[i], j / NS, end), (i, j) => { const q = at(k, arc[i], j / NS, end); return [q[0], q[2]]; }, () => [0, end ? 1 : -1, 0]);
        const cc = new Float32Array(cap.attributes.position.count * 3).fill(1);
        if (end) for (let i = 0; i < arc.length; i++) {
          const onSeam = i === 0 ? k : i === arc.length - 1 ? k + 1 : -1;
          if (onSeam < 0) continue;
          const d = onSeam % 2 === 0 ? 0.16 : 0.7;
          for (let j = 1; j <= NS; j++) { const v = j * arc.length + i; cc[v * 3] = cc[v * 3 + 1] = cc[v * 3 + 2] = d; }
        }
        cap.setAttribute('color', new T.BufferAttribute(cc, 3));
        B.add(cap, M.endFresh, null, tint);
      }
      for (const m of B.build(g)) m.castShadow = m.material === M.bark;
      g.visible = false;
      g.userData.dynamic = true;
      object.add(g);
      const piece = { obj: g, round: r, k, R, len: LEN };
      pieces.push(piece);
      interactables.push({ target: g, take: 'log', quarter: pieces.length - 1, off: true, label: { sah: 'оттук мас', en: 'firewood', ru: 'дрова' } });
    }
  }

  // look-at boxes: the rounds lying by the block (yardlife's), and the block's own top
  const heap = proxy(1.3, 0.4, 1.7, bx - 0.82, ground(bx - 0.82, bz + 0.2) + 0.17, bz + 0.2);
  heap.name = 'rounds';
  interactables.push({ target: heap, rounds: true, label: { sah: 'чурбаан', en: 'rounds of larch (чурбаан)', ru: 'чурбаки (чурбаан)' } });
  const top = proxy(0.5, 0.12, 0.5, bx, by - 0.05, bz);
  top.name = 'chopping-block';
  interactables.push({ target: top, block: true, entry: 'ottuk-mas', label: { sah: 'төҥүргэс', en: 'chopping block (төҥүргэс)', ru: 'колода (төҥүргэс)' } });

  object.userData.work = { object, axe, axeDims: AXE, pieces, rounds: ROUND.n, block: new T.Vector3(bx, by, bz), blockR: CHOP.r };
  return { object, colliders: [], floors: [], interactables };
}

const arcLen = (arc, i, R) => (arc[i] - arc[0]) * R;

// An (nu × nv)-cell sheet from pos(i, j) → [x, y, z] and uv(i, j) → [u, v], wound to face `out(x, y, z)` → [x, y, z].
function grid(T, nu, nv, pos, uv, out) {
  const p = [], t = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { p.push(...pos(i, j)); t.push(...uv(i, j)); }
  const row = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * row + i, b = a + row;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // which way do the triangles face, summed over the sheet?
  let facing = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const [a, b, c] = [idx[k] * 3, idx[k + 1] * 3, idx[k + 2] * 3];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const o = out((p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3);
    facing += (uy * vz - uz * vy) * o[0] + (uz * vx - ux * vz) * o[1] + (ux * vy - uy * vx) * o[2];
  }
  if (facing < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(t, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
