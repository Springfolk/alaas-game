// One shadow-pass shader for every opaque material. three builds the sun's shadow pass from a per-material
// copy of the colour's alpha (`Renderer._getShadowNodes`), so each material costs its own shadow shader even
// when nothing in it can cut the shadow. For a material with no alpha test, alpha map, mask, cast-shadow node
// or transparency that alpha is never read (the pass writes depth only), so they all keep the pass's own
// constant colour and share one build per geometry layout, side and vertex shaping. three r186 internals.
const cuts = (m) => m.alphaTest > 0 || m.alphaMap || m.alphaHash || m.transparent || m.castShadowNode || m.maskShadowNode || m.maskNode;

export function shareShadowShaders(renderer) {
  const own = renderer._getShadowNodes?.bind(renderer);
  if (!own) return;
  const none = { colorNode: null, depthNode: null, positionNode: null };
  renderer._getShadowNodes = (material) => (cuts(material) ? own(material) : none);
}
