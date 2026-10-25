// Sky: the Preetham/Perez clear-sky model (measured luminance and colour distribution, in absolute units
// matched to the sun) under one layer of fair-weather cumulus 1.8 km up. The cloud field is shared with
// the sun's cloud shadows (cloudField), so every cloud in the sky throws the shadow drifting over the alaas.
// Below the horizon the dome shows sunlit ground, so the environment map lights walls from below with
// grass-green bounce instead of more blue sky.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, acos, clamp, dot, exp, max, mix, normalize, pow, smoothstep, positionWorld, cameraPosition,
  time, mx_noise_float, uniform, mat3,
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

export const CLOUD_Y = 1800;                  // cloud base height, metres
export const WIND = vec2(-4.2, -3.1);         // cloud drift, m/s
export const cloudCover = uniform(0.3);      // noise threshold: lower = more sky covered
const TURBIDITY = 1.9;                 // dry, clean continental summer air
const KCD = 1 / 18;                           // scene radiance per kcd/m² (sun intensity 5 ≈ 90 klux direct)
// Preetham's chromaticities land slightly magenta in sRGB; this white balance gives a blue-white horizon
const WB = [0.88, 1.0, 0.93];
const GROUND_ALBEDO = new THREE.Color(0.075, 0.095, 0.045); // meadow + forest seen from afar

// Cloud density at a point of the cloud plane (metres). `detail` adds the small billows the eye sees;
// shadows use the coarse field only (the penumbra blurs it anyway).
export const cloudField = (p, detail = false) => {
  const q = p.add(WIND.mul(time));
  let n = mx_noise_float(q.mul(0.0012)).add(mx_noise_float(q.mul(0.0034)).mul(0.45)).add(mx_noise_float(q.mul(0.009)).mul(0.16));
  if (detail) {
    // billowing: ridged octaves eat into the edges and lump the cores like cauliflower
    const r1 = float(1).sub(mx_noise_float(q.mul(0.024).add(vec2(13.1, 7.7))).abs());
    const r2 = float(1).sub(mx_noise_float(q.mul(0.06).add(vec2(-3.3, 21.4))).abs());
    n = n.add(r1.mul(0.06)).add(r2.mul(0.03)).sub(0.06);
  }
  return n;
};

// ---- Perez distribution with Preetham's turbidity fits (CPU side: coefficients per sun position) ----
const perez = (T) => ({
  A: [0.1787 * T - 1.463, -0.0193 * T - 0.2592, -0.0167 * T - 0.2608],
  B: [-0.3554 * T + 0.4275, -0.0665 * T + 0.0008, -0.095 * T + 0.0092],
  C: [-0.0227 * T + 5.3251, -0.0004 * T + 0.2125, -0.0079 * T + 0.2102],
  D: [0.1206 * T - 2.5771, -0.0641 * T - 0.8989, -0.0441 * T - 1.6537],
  E: [-0.067 * T + 0.3703, -0.0033 * T + 0.0452, -0.0109 * T + 0.0529],
});
const F = (c, i, cosT, g) => (1 + c.A[i] * Math.exp(c.B[i] / Math.max(cosT, 0.01))) * (1 + c.C[i] * Math.exp(c.D[i] * g) + c.E[i] * Math.cos(g) ** 2);
function zenith(T, ts) {
  const chi = (4 / 9 - T / 120) * (Math.PI - 2 * ts);
  const Y = Math.max(0.05, (4.0453 * T - 4.971) * Math.tan(chi) - 0.2155 * T + 2.4192);
  const t2 = ts * ts, t3 = t2 * ts;
  const x = T * T * (0.00166 * t3 - 0.00375 * t2 + 0.00209 * ts) + T * (-0.02903 * t3 + 0.06377 * t2 - 0.03202 * ts + 0.00394) + (0.11693 * t3 - 0.21196 * t2 + 0.06052 * ts + 0.25886);
  const y = T * T * (0.00275 * t3 - 0.0061 * t2 + 0.00317 * ts) + T * (-0.04214 * t3 + 0.0897 * t2 - 0.04153 * ts + 0.00516) + (0.15346 * t3 - 0.26756 * t2 + 0.0667 * ts + 0.26688);
  return [Y * KCD, x, y];
}
const xyYtoRGB = (Y, x, y) => {
  const X = (x / y) * Y, Z = ((1 - x - y) / y) * Y;
  return new THREE.Color().setRGB(WB[0] * Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z), WB[1] * Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z), WB[2] * Math.max(0, 0.0557 * X - 0.204 * Y + 1.057 * Z), THREE.LinearSRGBColorSpace);
};

export function makeSky(engine) {
  const sky = new SkyMesh();
  sky.scale.setScalar(5500);
  sky.cloudCoverage.value = 0; // SkyMesh's own clouds and atmosphere are replaced below
  const P = sky.perez = { A: uniform(new THREE.Vector3()), B: uniform(new THREE.Vector3()), C: uniform(new THREE.Vector3()), D: uniform(new THREE.Vector3()), E: uniform(new THREE.Vector3()), zen: uniform(new THREE.Vector3()) };
  sky.ground = uniform(new THREE.Color());
  sky.horizon = uniform(new THREE.Color());
  const sunRadiance = engine.sunColor; // sun colour × intensity (kept by Engine.setSun)
  const toRGB = mat3(vec3(3.2406, -0.9689, 0.0557), vec3(-1.5372, 1.8758, -0.204), vec3(-0.4986, 0.0415, 1.057));

  sky.material.colorNode = Fn(() => {
    const L = normalize(sky.sunPosition);
    const dir = normalize(positionWorld.sub(cameraPosition));
    const up = max(dir.y, 0.01);
    const cosG = dot(dir, L).toVar();
    const g = acos(clamp(cosG, -1, 1));
    // Perez: (1 + A e^(B/cosθ)) (1 + C e^(Dγ) + E cos²γ), for Y, x, y at once; zen = zenith xyY / F(0, θs)
    const f = vec3(1).add(P.A.mul(exp(P.B.div(up)))).mul(vec3(1).add(P.C.mul(exp(P.D.mul(g)))).add(P.E.mul(cosG.mul(cosG))));
    const xyY = f.mul(P.zen);
    const Y = xyY.x, x = xyY.y, y = xyY.z;
    const air = toRGB.mul(vec3(x.div(y).mul(Y), Y, float(1).sub(x).sub(y).div(y).mul(Y))).max(0).mul(vec3(...WB)).toVar();
    // the sun disc (~0.53°), hidden in the env-map capture
    const disc = smoothstep(0.99996, 0.999975, cosG).mul(sky.showSunDisc);
    const col = air.add(sunRadiance.mul(2600).mul(disc)).toVar();

    // --- cumulus layer ---
    const t = float(CLOUD_Y).sub(cameraPosition.y).div(up);
    const p = cameraPosition.xz.add(dir.xz.mul(t));
    const n = cloudField(p, true);
    const T = smoothstep(cloudCover.sub(0.02), cloudCover.add(0.3), n);          // normalised thickness
    const alpha = float(1).sub(exp(T.mul(-7))).mul(smoothstep(0.02, 0.16, dir.y));
    // light reaching this column: denser cloud between it and the sun shades it
    const toSun = normalize(L.xz.add(vec2(1e-4, 0)));
    // (low quality skips this second lookup)
    const selfShadow = engine.opts.quality === 'low' ? float(1) : exp(max(cloudField(p.add(toSun.mul(90))).sub(cloudCover), 0).mul(-5));
    // from below, thick cores show grey flat bases; thin edges glow with light passing through
    // seen low, the sunlit sides show (darker on the side facing away from us… towards the sun); overhead, the bases
    const core = mix(float(0.95).sub(cosG.mul(0.5).add(0.5).mul(0.3)), float(0.55), smoothstep(0.12, 0.75, dir.y));
    const lit = mix(float(1), core, pow(T, 0.6)).mul(mix(0.55, 1, selfShadow));
    const silver = float(0.36).div(pow(float(1.64).sub(cosG.mul(1.6)), 1.5)).mul(float(1).sub(T)).mul(0.3); // HG g = 0.8
    const paper = sunRadiance.mul(1 / Math.PI);
    const cloud = paper.mul(0.85).mul(lit.add(silver)).add(sky.horizon.mul(0.25)).add(sky.ground.mul(0.6));
    // far clouds dissolve into the horizon haze
    const aerial = exp(t.mul(-1 / 16000));
    col.assign(mix(col, mix(air, cloud, aerial), alpha));
    // below the horizon: sunlit ground, blending through the haze band
    return vec4(mix(sky.ground, col, smoothstep(-0.06, 0.0, dir.y)), 1);
  })();
  return sky;
}

// Called by Engine.setSun: Perez coefficients for this sun, and the colours the haze and ground take.
// Returns sky radiance 2° above the horizon at 90° from the sun (horizon) and towards it (towardSun).
export function updateSky(sky, L, sunRadiance) {
  const ts = Math.acos(Math.min(1, Math.max(-1, L.y)));
  const c = perez(TURBIDITY), z = zenith(TURBIDITY, ts);
  const P = sky.perez;
  for (const k of ['A', 'B', 'C', 'D', 'E']) P[k].value.set(...c[k]);
  P.zen.value.set(z[0] / F(c, 0, 1, ts), z[1] / F(c, 1, 1, ts), z[2] / F(c, 2, 1, ts));
  const at = (d) => {
    const g = Math.acos(Math.min(1, Math.max(-1, d.dot(L))));
    return xyYtoRGB(z[0] * F(c, 0, d.y, g) / F(c, 0, 1, ts), z[1] * F(c, 1, d.y, g) / F(c, 1, 1, ts), z[2] * F(c, 2, d.y, g) / F(c, 2, 1, ts));
  };
  const h = new THREE.Vector3(L.x, 0, L.z).normalize();
  const e = Math.sin(THREE.MathUtils.degToRad(2)), ce = Math.cos(THREE.MathUtils.degToRad(2));
  const horizon = at(new THREE.Vector3(-h.z * ce, e, h.x * ce));
  const towardSun = at(new THREE.Vector3(h.x * ce, e, h.z * ce));
  const zen = at(new THREE.Vector3(0, 1, 0));
  // ground: albedo × (sun + sky irradiance) / π; sky irradiance ≈ π × (zenith + horizon) / 2
  const irr = sunRadiance.clone().multiplyScalar(Math.max(L.y, 0)).add(zen.clone().add(horizon).multiplyScalar(Math.PI / 2));
  sky.ground.value.copy(irr.multiply(GROUND_ALBEDO).multiplyScalar(1 / Math.PI));
  sky.horizon.value.copy(horizon);
  return { horizon, towardSun, zenith: zen };
}
