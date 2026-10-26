// low/mobile tiers: the sky light without three's PMREM lookups. Each time the environment map changes
// (Engine.setSun) it is baked at two blurs (roughness 0.5 and 1) into 64×32 equirect panoramas, clouds and the
// sun's glow included; a lit pixel then reads one texel of each along its normal / reflection instead of four
// cube-UV lookups (a face pick and two mips each), the largest block of every lit shader. Below roughness 0.5
// reflections come out blurrier than with the PMREM (no smooth materials on land).
import * as THREE from 'three/webgpu';
import { Fn, texture, pmremTexture, uniform, uv, vec2, vec3, vec4, float, atan, asin, sin, cos, mix, smoothstep, normalWorld } from 'three/tsl';

const W = 64, H = 32, LEVELS = [0.5, 1];

// equirect: u from the azimuth (atan(x, −z)), v from the elevation
const toUV = (d) => vec2(atan(d.x, d.z.negate()).div(2 * Math.PI).add(0.5), asin(d.y.clamp(-1, 1)).div(Math.PI).add(0.5));

class LeanEnvNode extends THREE.TempNode {
  static get type() { return 'LeanEnvNode'; }
  constructor(maps) { super('vec3'); this.maps = maps; }
  setup(builder) {
    const ctx = builder.context;
    const d = (ctx.getUV ? ctx.getUV(this, builder) : normalWorld).normalize();
    const level = ctx.getTextureLevel ? float(ctx.getTextureLevel(this)) : float(1);
    const p = toUV(d);
    const [a, b] = this.maps.map((rt) => texture(rt.texture, p).level(0).rgb);
    return mix(a, b, smoothstep(0.5, 1, level));
  }
}

export function leanEnvironment() {
  const maps = LEVELS.map(() => {
    const rt = new THREE.RenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  });
  const level = uniform(1);
  let env = null, quad = null;
  return {
    node: new LeanEnvNode(maps),
    // re-bake from the current environment map (its PMREM render target texture)
    bake(renderer, tex) {
      if (!quad) {
        // texel → direction, the inverse of toUV
        const dir = Fn(() => {
          const phi = uv().x.sub(0.5).mul(2 * Math.PI), th = uv().y.sub(0.5).mul(Math.PI);
          return vec3(sin(phi).mul(cos(th)), sin(th), cos(phi).mul(cos(th)).negate());
        })();
        env = pmremTexture(tex, dir, level);
        const mat = new THREE.NodeMaterial();
        mat.toneMapped = false;
        mat.fragmentNode = vec4(env.rgb, 1);
        quad = new THREE.QuadMesh(mat);
      }
      env.value = tex;
      const prev = renderer.getRenderTarget();
      LEVELS.forEach((l, i) => { level.value = l; renderer.setRenderTarget(maps[i]); quad.render(renderer); });
      renderer.setRenderTarget(prev);
    },
  };
}
