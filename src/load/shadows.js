// One shadow-pass shader for every opaque material. three builds the sun's shadow pass from a per-material
// copy of the colour's alpha (`Renderer._getShadowNodes`), so each material costs its own shadow shader even
// when nothing in it can cut the shadow. For a material with no alpha test, alpha map, mask, cast-shadow node
// or transparency that alpha is never read (the pass writes depth only), so they all keep the pass's own
// constant colour and share one build per geometry layout, side and vertex shaping. three r186 internals.
import * as THREE from 'three/webgpu';

const cuts = (m) => m.alphaTest > 0 || m.alphaMap || m.alphaHash || m.transparent || m.castShadowNode || m.maskShadowNode || m.maskNode;

// The pass draws every caster with one shared override material and copies each caster's alphaTest onto it; the
// setter bumps `version` whenever that crosses 0, so with leaves and walls mixed it changed many times a frame and
// every shadow render object rebuilt its material cache key (a string over all its properties): ~0.5 MB of
// garbage a frame, a 40–70 ms WebKit GC pause every ~20 s. A caster's render object is built with its own
// alphaTest and a caster never changes it in play (nothing compiles in play), so on the pass material the setter
// only stores the value.
const AT = Object.getOwnPropertyDescriptor(THREE.Material.prototype, 'alphaTest');
if (AT?.set) Object.defineProperty(THREE.Material.prototype, 'alphaTest', {
  ...AT, set(v) { if (this.isShadowPassMaterial) this._alphaTest = v; else AT.set.call(this, v); },
});

export function shareShadowShaders(renderer) {
  const own = renderer._getShadowNodes?.bind(renderer);
  if (!own) return;
  const none = { colorNode: null, depthNode: null, positionNode: null };
  renderer._getShadowNodes = (material) => (cuts(material) ? own(material) : none);
}
