// The festive saddle (ыҥыыр) on a crossed-leg trestle under a small plank shelter near the serge.
// Saddle tree: two birch side boards, front and rear bows after Sieroszewski's Rys. 76 clad in silver, a hair-stuffed
// leather seat, a saddle cloth (кычым) after REM 437-49, a woven horsehair girth and forged round-arched stirrups.
import * as THREE from 'three/webgpu';
import { addLog, blob, boxUV, frame, geoPiece, jitterTint, mtx, sheetGeo } from './kit.js';

// Bow outlines, half (x ≥ 0), [x, y] metres from the base, top to bottom; the opening from its top down.
// Front: Sieroszewski 1902, Rys. 76 «Szkielet jakuckiego siodła. Łęk» (1/8 natural size, measured at 600 dpi);
// rear: the same, «Tył». Both mirrored about the drawing's axis (docs/patterns.md).
const BOW_F = { outer: [[0.1448, 0.317], [0.1458, 0.3109], [0.1431, 0.3048], [0.1411, 0.2987], [0.1411, 0.2926], [0.1397, 0.2865], [0.1384, 0.2804], [0.1373, 0.2743], [0.1363, 0.2683], [0.1353, 0.2622], [0.134, 0.2561], [0.1333, 0.25], [0.1326, 0.2439], [0.1312, 0.2378], [0.1306, 0.2317], [0.1292, 0.2256], [0.1282, 0.2195], [0.1272, 0.2134], [0.1258, 0.2073], [0.1248, 0.2012], [0.1235, 0.1951], [0.1231, 0.189], [0.1224, 0.1829], [0.1211, 0.1768], [0.1194, 0.1707], [0.1191, 0.1646], [0.1194, 0.1585], [0.117, 0.1524], [0.116, 0.1463], [0.1163, 0.1402], [0.1157, 0.1341], [0.1157, 0.128], [0.1157, 0.1219], [0.1157, 0.1158], [0.1167, 0.1097], [0.117, 0.1036], [0.1184, 0.0975], [0.1201, 0.0914], [0.1207, 0.0854], [0.1218, 0.0793], [0.1235, 0.0732], [0.1241, 0.0671], [0.1373, 0.061], [0.1424, 0.0549], [0.1421, 0.0488], [0.138, 0.0427], [0.1326, 0.0366], [0.135, 0.0305], [0.1367, 0.0244], [0.1394, 0.0183], [0.1411, 0.0122], [0.1428, 0.0061], [0.1411, 0]],
  hole: [[0.0212, 0.1138], [0.0273, 0.1077], [0.0303, 0.1016], [0.0327, 0.0955], [0.0357, 0.0894], [0.0378, 0.0833], [0.0395, 0.0772], [0.0418, 0.0711], [0.0439, 0.065], [0.0462, 0.0589], [0.0486, 0.0528], [0.0517, 0.0467], [0.0564, 0.0406], [0.0601, 0.0345], [0.0676, 0.0285], [0.0757, 0.0224], [0.0886, 0.0163], [0.1079, 0.0102], [0.1231, 0.0041], [0.138, 0]] };
const BOW_R = { outer: [[0.1432, 0.1534], [0.1479, 0.1473], [0.1483, 0.1412], [0.1449, 0.1351], [0.1422, 0.129], [0.1405, 0.1229], [0.1378, 0.1169], [0.1351, 0.1108], [0.1323, 0.1047], [0.13, 0.0986], [0.1283, 0.0925], [0.1256, 0.0864], [0.1225, 0.0803], [0.1215, 0.0742], [0.1212, 0.0681], [0.1235, 0.062], [0.1256, 0.0559], [0.1286, 0.0498], [0.131, 0.0437], [0.1334, 0.0376], [0.1357, 0.0315], [0.1374, 0.0254], [0.1408, 0.0193], [0.1412, 0.0132], [0.1415, 0.0071], [0.1415, 0.001]],
  hole: [[0.0297, 0.0884], [0.0392, 0.0823], [0.045, 0.0762], [0.05, 0.0701], [0.0538, 0.064], [0.0582, 0.0579], [0.0612, 0.0518], [0.0636, 0.0457], [0.068, 0.0396], [0.0741, 0.0335], [0.0812, 0.0274], [0.0893, 0.0213], [0.0992, 0.0152], [0.1141, 0.0091], [0.1317, 0.003], [0.1371, 0.001]] };

function bowGeo(B, d) {
  const s = new THREE.Shape();
  const o = B.outer; // top → bottom on the right; mirrored for the left
  s.moveTo(-o[o.length - 1][0], o[o.length - 1][1]);
  for (let i = o.length - 1; i >= 0; i--) s.lineTo(-o[i][0], o[i][1]);
  for (const [x, y] of o) s.lineTo(x, y);
  // the opening under the bow that clears the horse's withers
  const hp = new THREE.Path(), h = B.hole;
  hp.moveTo(-h[h.length - 1][0], h[h.length - 1][1]);
  for (let i = h.length - 1; i >= 0; i--) hp.lineTo(-h[i][0], h[i][1]);
  for (const [x, y] of h) hp.lineTo(x, y);
  s.holes.push(hp);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -d / 2);
  // uvs: planar in metres (the bow plate texture spans x −0.17…0.17, y 0…0.34)
  const p = g.attributes.position, uvA = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uvA.setXY(i, p.getX(i), p.getY(i));
  return g;
}

export function saddle(K, x, z, yaw) {
  const { M, rng } = K;
  const F = frame(K.b, x, z, yaw);
  const g = F.ground;
  const Wy = (lx, y, lz) => { const [wx, wz] = F.tw(lx, lz); return [wx, y, wz]; };
  const y0 = g(0, 0);

  const top = geoPiece(K, () => {
    // shelter: four posts, a shed roof of split planks sloping back (east), open on all sides
    const FH = y0 + 2.05, BH = y0 + 1.8;
    for (const [px, pz, top] of [[-0.95, -0.85, FH], [-0.95, 0.85, FH], [0.95, -0.85, BH], [0.95, 0.85, BH]]) {
      addLog(K.b, [...Wy(px, g(px, pz) - 0.3, pz)], Wy(px + (rng() - 0.5) * 0.03, top, pz), 0.07, 0.06, rng, M.wood, M.end, { seg: 8 });
      K.colliders.push(F.col({ x: px, z: pz, r: 0.1 }));
    }
    for (const [bx, by] of [[-0.97, FH], [0.97, BH]]) addLog(K.b, Wy(bx, by - 0.02, -1.1), Wy(bx, by - 0.01, 1.1), 0.06, 0.055, rng, M.wood, M.end, { seg: 8 });
    const slope = Math.atan2(FH - BH, 1.9);
    for (let i = 0; i < 11; i++) {
      const pz = -1.15 + i * 0.23;
      const pl = boxUV(new THREE.BoxGeometry(2.45, 0.035, 0.22 + rng() * 0.03, 6, 1, 1));
      const p = pl.attributes.position;
      for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) - 0.02 * Math.sin((p.getX(k) + 1.2) / 2.4 * Math.PI) + (rng() - 0.5) * 0.004);
      pl.computeVertexNormals();
      F.add(pl, M.planks, mtx([0, (FH + BH) / 2 + 0.06 + (i % 2) * 0.012, pz], [(rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03, -slope]), jitterTint(rng, 0.12));
    }

    // trestle: a horizontal log in the crotches of two crossed-leg supports, top at ~0.8 m
    const TY = y0 + 0.8, TR = 0.1;
    for (const lz of [-0.5, 0.5]) {
      addLog(K.b, Wy(-0.42, g(-0.42, lz) - 0.05, lz), Wy(0.17, TY + 0.12, lz + 0.02), 0.045, 0.04, rng, M.wood, M.end, { seg: 7 });
      addLog(K.b, Wy(0.42, g(0.42, lz) - 0.05, lz + 0.03), Wy(-0.17, TY + 0.12, lz), 0.045, 0.04, rng, M.wood, M.end, { seg: 7 });
      F.add(new THREE.TorusGeometry(0.06, 0.008, 4, 10), M.lash, mtx([0, TY - 0.1, lz], [0, 0, 0]));
    }
    addLog(K.b, Wy(0, TY, -0.75), Wy(0, TY + 0.01, 0.75), TR, TR * 0.92, rng, M.wood, M.end, { seg: 10 });
    K.colliders.push(F.col({ x: 0, z: 0, hw: 0.45, hd: 0.78 }));

    // ---- the saddle, spine along z (front = +z) ----
    const top = TY + TR;
    // saddle cloth (кычым) after the saddle skirts REM 437-49 (docs/patterns.md), one skirt each side of the spine,
    // measured on the photo in its pixels (P, 1.556 mm each, x 345 at the spine → 70 at the hem, y 35…395 along the
    // horse): black velvet with a braid edge; a red field framed on three sides by rows of white beads, brass discs and
    // white beads. The skirt's bead-embroidered scrolls and girth slit are not modelled.
    {
      const P = 0.56 / 360, half = 275 * P, len = 360 * P;
      const pos = [], uvs = [], col = [], idx = [];
      const R = TR + 0.015, arc = R * Math.PI / 2;
      const drape = (s, zz) => { // across-distance from the spine s, along zz → [x, y] on the cloth
        const as = Math.abs(s);
        let px, py;
        if (as < arc) { const a = s / R; px = Math.sin(a) * R; py = Math.cos(a) * R - R; }
        else { const d = as - arc; px = Math.sign(s) * (R + d * 0.12); py = -R - d; }
        px += Math.sign(s) * Math.max(0, as - arc) * 0.08 * Math.sin(zz * 30 + s * 4); // soft folds in the hanging part
        return [px, py + TR + 0.004];
      };
      const tone = (s, zz) => { // colour from the photo's regions
        const x = 345 - Math.abs(s) / P, y = 215 + zz / P;
        if (x < 74 || y < 39 || y > 391) return [0.42, 0.33, 0.18];                  // braid edge
        if (x < 112 || y < 94 || y > 341 || x > 328) return [0.035, 0.025, 0.02];    // black velvet
        return [0.58, 0.07, 0.06];                                                   // red cloth
      };
      // a sparse grid with lines hugging each colour border (±0.4 px), so the bands stay sharp: was 200 × 90 cells (36k tris)
      const ticks = (lo, hi, n, cuts) => [...new Set([...Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n),
        ...cuts.flatMap((c) => [c - 0.4 * P, c + 0.4 * P])].filter((v) => v >= lo && v <= hi).map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);
      const sb = [17 * P, 233 * P, 271 * P];
      const S = ticks(-half, half, 36, [...sb, ...sb.map((v) => -v), arc, -arc]);
      const Z = ticks(-len / 2, len / 2, 24, [39, 94, 341, 391].map((y) => (y - 215) * P));
      const nx = S.length - 1, nz = Z.length - 1;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const s = S[i], zz = Z[j];
        const [px, py] = drape(s, zz);
        pos.push(px, py, zz); uvs.push(s, zz); col.push(...tone(s, zz));
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      cg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      cg.setIndex(idx); cg.computeVertexNormals();
      F.add(cg, M.cloth, mtx([0, y0 + 0.8, 0]));
      // the frame rows: [hem-side x, top y, bottom y, pitch, kind] in photo px; each runs top → hem side → bottom
      const rows = [[116, 100, 332, 6.9, 'w'], [127, 109, 324, 7.6, 'b'], [136, 117, 317, 6.9, 'w']];
      const bead = new THREE.OctahedronGeometry(0.0035, 0), disc = new THREE.CylinderGeometry(0.0055, 0.0055, 0.0012, 7); // 3.5 mm beads, 5.5 mm discs: few facets do
      for (const sd of [-1, 1]) for (const [hx, ty, by, pitch, kind] of rows) {
        const path = [[328, ty], [hx, ty], [hx, by], [328, by]], L = [0];
        for (let k = 1; k < path.length; k++) L.push(L[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
        for (let d = pitch / 2; d < L[3]; d += pitch) {
          let k = 1; while (k < 3 && L[k] < d) k++;
          const f = (d - L[k - 1]) / (L[k] - L[k - 1]);
          const x = path[k - 1][0] + (path[k][0] - path[k - 1][0]) * f, y = path[k - 1][1] + (path[k][1] - path[k - 1][1]) * f;
          const s = sd * (345 - x) * P, zz = (y - 215) * P;
          const [px, py] = drape(s, zz), [qx, qy] = drape(s + sd * 0.002, zz);
          const nxx = -(qy - py), nyy = qx - px, nl = Math.hypot(nxx, nyy) || 1; // outward normal of the cloth
          const at = [px + sd * nxx / nl * 0.003, y0 + 0.8 + py + sd * nyy / nl * 0.003, zz];
          if (kind === 'w') F.add(bead.clone(), M.bone, mtx(at), [0.92, 0.9, 0.85]); // add() consumes non-indexed geometry
          else F.add(disc.clone(), M.silver, mtx(at, [0, 0, Math.atan2(sd * nyy, sd * nxx) - Math.PI / 2]), [1.0, 0.72, 0.38]);
        }
      }
    }
    // side boards lying on the cloth either side of the log
    for (const sd of [-1, 1]) {
      const b = boxUV(new THREE.BoxGeometry(0.1, 0.016, 0.44, 1, 1, 4), 4);
      const p = b.attributes.position;
      for (let k = 0; k < p.count; k++) { const zz = p.getZ(k); p.setY(k, p.getY(k) + 0.012 * (zz / 0.22) ** 2); }
      b.computeVertexNormals();
      F.add(b, M.wood, mtx([sd * 0.085, top - 0.02, 0], [0, 0, -sd * 0.72]), [0.75, 0.62, 0.48]);
    }
    // bows after Rys. 76: the front one 32 cm tall, its plate engraved with the drawing's frame lines (bowplate), the
    // rear one 15 cm, plain silver (its engraving is not legible in the drawing)
    F.add(bowGeo(BOW_F, 0.025), M.bowplate, mtx([0, top - 0.02, 0.19], [0.17, 0, 0]));
    F.add(bowGeo(BOW_R, 0.025), M.silver, mtx([0, top - 0.02, -0.19], [-0.17, 0, 0]));
    // iron hook on the front bow
    F.add(new THREE.TorusGeometry(0.02, 0.003, 4, 10, Math.PI * 1.2), M.iron, mtx([0, top + 0.19, 0.27], [0, Math.PI / 2, 0]));
    // seat: leather cushion stuffed with hair
    F.add(blob(0.105, 0.075, 0.16, rng, { detail: 2, rough: 0.05 }), M.leather, mtx([0, top + 0.005, 0]), [1.5, 1.25, 1.05]);
    // stirrups hanging on leathers, a horsehair girth hanging down one side
    for (const sd of [-1, 1]) {
      const sx = sd * 0.16;
      F.add(boxUV(new THREE.BoxGeometry(0.004, 0.36, 0.025), 4), M.leather, mtx([sx + sd * 0.03, top - 0.2, 0.02], [0, 0, sd * 0.12]));
      const sy = top - 0.42;
      F.add(new THREE.TorusGeometry(0.065, 0.007, 6, 16, Math.PI), M.iron, mtx([sx + sd * 0.055, sy, 0.02], [0, Math.PI / 2, 0]));
      F.add(boxUV(new THREE.BoxGeometry(0.03, 0.008, 0.14), 6), M.iron, mtx([sx + sd * 0.055, sy, 0.02]));
    }
    {
      const gb = sheetGeo(0.06, 0.7, rng, { curl: 0, warp: 0.004, res: 10 });
      const p = gb.attributes.position;
      for (let k = 0; k < p.count; k++) { const t = (p.getZ(k) + 0.35) / 0.7; p.setXYZ(k, p.getX(k), -t * 0.62 + 0.06 * t * t, 0.04 * Math.sin(t * 3) + p.getY(k)); }
      gb.computeVertexNormals();
      // woven horsehair, plain dark: the banded lozenge weave drawn here before had no image source
      const c = new Float32Array(p.count * 3).fill(0.06);
      gb.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      F.add(gb, M.cloth, mtx([-0.215, top - 0.06, -0.06], [0, 0, 0.05]));
    }
    return top;
  });
  const target = K.proxy(...Wy(0, top + 0.05, 0), 0.75, 0.55, 0.8, yaw);
  return { target };
}
