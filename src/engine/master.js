// Master materials. three builds one shader per distinct node graph (it keys a build by node identity), so
// materials that compute the same thing with different numbers or textures still cost a build each
// (~10 ms of main-thread JS: docs/materials.md). Two engine-level tools:
// - `shareGraphs(materials)`: materials whose node graphs have the same shape become instances of one
//   master: they all point at one graph, and the leaves that differ (constants, private uniforms, textures)
//   are read from each material (`_m<k>` properties) through reference nodes. Same maths, one build.
// - One light set for the whole homestead (the sun and two local lights read from the material), so a house
//   is still lit by its own fire only, and builds don't split by light set.
// three r186 internals (node fields, TextureNode.update, the shadow pass's override material): recheck on upgrade.
import * as THREE from 'three/webgpu';
import { MaterialReferenceNode, ReferenceNode, LightsNode, UniformNode, TextureNode, PointLightNode } from 'three/webgpu';
import { lights as lightsNode, cameraViewMatrix, positionView, vec4 } from 'three/tsl';
import { urlFlag } from '../util.js';

// A material reference that, in the sun's shadow pass (where three draws with its own override material),
// reads the material of the object being drawn.
const source = (state) => {
  const m = state.material;
  if (!m?.isShadowPassMaterial) return m;
  const own = state.object?.material;
  return own && !Array.isArray(own) ? own : m;
};
class SourceReference extends MaterialReferenceNode {
  updateReference(state) { this.reference = source(state); return this.reference; }
}
const refs = new Map();
export const sourceRef = (name, type) => refs.get(name + type) || refs.set(name + type, new SourceReference(name, type)).get(name + type);

// ---------- light set ----------
// The homestead's one light set: the sun and two "local" point lights whose colour, position and range come
// from the material, i.e. from the model's own lights (a house's fire and fill). A material is lit by its own
// model's lights only, as with a set per model, but every model shares the set (and so the builds).
// The sun is scaled by `_sun` (0: an interior the shadow map would leak into, the urasa).
export const LOCAL_LIGHTS = urlFlag('nolocal') ? 0 : 2; // ?nolocal: A/B (sun only)
const proto = THREE.Material.prototype; // (three draws a plain material through a node copy; references read the original)
proto._sun = 1;
for (let i = 0; i < LOCAL_LIGHTS; i++) Object.assign(proto, { [`_l${i}c`]: new THREE.Color(0, 0, 0), [`_l${i}p`]: new THREE.Vector3(), [`_l${i}d`]: 1, [`_l${i}k`]: 2 });
export const sunMask = sourceRef('_sun', 'float');

class LocalLight extends THREE.PointLight {
  constructor(slot) { super(0xffffff, 0, 1, 2); this.slot = slot; }
}
class LocalLightNode extends PointLightNode {
  constructor(light = null) {
    super(light);
    const i = light?.slot ?? 0;
    this.colorNode = sourceRef(`_l${i}c`, 'color');
    this.cutoffDistanceNode = sourceRef(`_l${i}d`, 'float');
    this.decayExponentNode = sourceRef(`_l${i}k`, 'float');
    this.worldPosition = sourceRef(`_l${i}p`, 'vec3');
  }
  update() {} // everything comes from the material
  getLightVector(builder) { return cameraViewMatrix.mul(vec4(this.worldPosition, 1)).xyz.sub(builder.context.positionView || positionView); }
}

let homeSet = null;
/** The homestead light set (sun + local lights); registers the local light node with the renderer. */
export function homesteadLights(engine) {
  if (homeSet) return homeSet;
  engine.renderer.library.addLight(LocalLightNode, LocalLight);
  return (homeSet = lightsNode([engine.sun, ...Array.from({ length: LOCAL_LIGHTS }, (_, i) => new LocalLight(i))]));
}
const lightData = new WeakMap(); // light → live { colour × intensity, world position }
function live(l) {
  let d = lightData.get(l);
  if (!d) lightData.set(l, d = { c: new THREE.Color(), p: new THREE.Vector3() });
  return d;
}
/** Lights `material` by `own` (a model's point lights, ≤ LOCAL_LIGHTS) unless the model said otherwise. */
export function useLights(material, own) {
  if (material._ownLights) return;
  material._ownLights = true;
  if (own.length > LOCAL_LIGHTS && LOCAL_LIGHTS) console.warn(`master: ${own.length} local lights on ${material.name}, ${LOCAL_LIGHTS} used`);
  own.slice(0, LOCAL_LIGHTS).forEach((l, i) => {
    const d = live(l);
    Object.defineProperties(material, {
      [`_l${i}c`]: { get: () => d.c.copy(l.color).multiplyScalar(l.intensity), configurable: true },
      [`_l${i}p`]: { get: () => d.p.setFromMatrixPosition(l.matrixWorld), configurable: true },
      [`_l${i}d`]: { get: () => l.distance, configurable: true },
      [`_l${i}k`]: { get: () => l.decay, configurable: true },
    });
  });
}
/** Model helpers: no sunlight (an interior the shadow map would leak into) / none of the model's lights. */
export const noSun = (m) => { m._sun = 0; return m; };
export const noLocalLights = (m) => { m._ownLights = true; return m; };

// ---------- shared graphs ----------
const SKIP = new Set(['id', 'uuid', 'version', 'stackTrace', 'parents']);
const ids = new WeakMap();
let nextId = 1;
const idOf = (o) => ids.get(o) || ids.set(o, nextId++).get(o);
const isMath = (v) => v && (v.isVector2 || v.isVector3 || v.isVector4 || v.isColor || v.isMatrix3 || v.isMatrix4);
const valueKey = (v) => (isMath(v) ? `${v.constructor.name}(${v.toArray().map((x) => +x.toPrecision(7)).join(',')})` : typeof v === 'number' ? String(v) : JSON.stringify(v));
const refType = (v) => (typeof v === 'number' ? 'float' : v?.isColor ? 'color' : v?.isVector2 ? 'vec2' : v?.isVector3 ? 'vec3' : v?.isVector4 ? 'vec4' : null);
const texKind = (t) => [t.constructor.name, t.colorSpace, t.flipY, t.mapping, t.wrapS, t.wrapT, t.magFilter, t.minFilter, t.format, t.type,
  !!t.isRenderTargetTexture, !!t.isDepthTexture, !!t.isArrayTexture, !!t.isData3DTexture, t.generateMipmaps].join('/');
const slotsOf = (m) => Object.keys(m).filter((k) => k.endsWith('Node') && m[k]?.isNode).sort();

// Leaves a master reads per material: a constant (float/vec/colour), a private uniform, a texture.
// (A bare number as an int operand becomes a float reference that WGSL casts back: exact for whole numbers.)
const constLeaf = (n) => n.isConstNode && refType(n.value) && (n.nodeType == null || ['float', 'vec2', 'vec3', 'vec4', 'color'].includes(n.nodeType));
const uniformLeaf = (n) => n.constructor === UniformNode && n.updateType === 'none' && refType(n.value);
const textureLeaf = (n) => n.constructor === TextureNode && n.value?.isTexture && !n.value.isRenderTargetTexture;
// Nodes compared by identity, never entered: Fn bodies, light sets, references, data holders.
const isFnBody = (n) => typeof n.jsFunc === 'function'; // a Fn's body (ShaderNodeInternal: no flag)
const isRef = (n) => n instanceof ReferenceNode, freeRef = (n) => isRef(n) && !n.object && !n.material; // (no flags on these)
const opaque = (n) => isFnBody(n) || n instanceof LightsNode || isRef(n) || n.isBufferNode || n.isStorageBufferNode || n.isUniformGroup;

const isNode = (v) => typeof v === 'object' && v?.isNode === true; // (a Fn is a function that also says isNode)
function children(n, fn) { // fn(kind, value, property, index): kind 'node' | 'prim'
  for (const p of Object.getOwnPropertyNames(n)) {
    if (p.startsWith('_') || SKIP.has(p)) continue;
    const v = n[p];
    if (Array.isArray(v)) v.forEach((x, i) => fn(isNode(x) ? 'node' : 'prim', x, p, i));
    else if (isNode(v)) fn('node', v, p);
    else if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) { for (const k in v) if (!k.startsWith('_')) fn(isNode(v[k]) ? 'node' : 'prim', v[k], p, k); }
    else fn('prim', v, p);
  }
}
const primKey = (v) => (v === null || v === undefined || ['number', 'string', 'boolean'].includes(typeof v) ? String(v) : isMath(v) ? valueKey(v) : `@${idOf(v)}`);

// How many materials reach each node (a node two materials reach is compared by identity, never entered),
// over every material seen so far: a node an earlier call's materials reach is never changed later.
const owners = new WeakMap();
function countOwners(materials) {
  for (const m of materials) {
    const seen = new Set(), stack = slotsOf(m).map((k) => m[k]);
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      owners.set(n, (owners.get(n) || 0) + 1);
      if (!opaque(n) && !constLeaf(n) && !uniformLeaf(n)) children(n, (k, v) => { if (k === 'node') stack.push(v); });
    }
  }
}

// The shape of a material's graph (structure, compared-by-identity nodes, leaf kinds) and its leaves in order.
function shape(m) {
  const order = new Map(), leaves = [], leafOf = new Map(), parts = [m.type, m.lightsNode ? `L${idOf(m.lightsNode)}` : ''];
  const edges = []; // per leaf: every [parent, property, index] that uses it (for swapping)
  const leaf = (n, edge, l) => { leafOf.set(n, leaves.length); leaves.push(l); edges.push([edge]); };
  const walk = (n, edge) => {
    if (order.has(n)) { parts.push(`#${order.get(n)}`); if (leafOf.has(n)) edges[leafOf.get(n)].push(edge); return; }
    order.set(n, order.size);
    if (uniformLeaf(n)) { leaf(n, edge, { kind: 'u', node: n, type: refType(n.value) }); parts.push(`U${refType(n.value)}`); return; }
    if ((owners.get(n) || 0) > 1 || opaque(n)) { parts.push(freeRef(n) ? `R${n.constructor.name}:${n.property}:${n.uniformType}` : `I${idOf(n)}`); return; }
    if (constLeaf(n)) { leaf(n, edge, { kind: 'c', node: n, type: refType(n.value), key: valueKey(n.value) }); parts.push(`C${refType(n.value)}`); return; }
    parts.push(`(${n.constructor.name}`);
    if (textureLeaf(n)) { leaf(n, null, { kind: 't', node: n }); parts.push(`T${texKind(n.value)}`); }
    children(n, (k, v, p, i) => {
      if (n.isTextureNode && p === 'value') return;
      parts.push(`${p}${i ?? ''}:`);
      if (k === 'node') walk(v, [n, p, i]); else parts.push(primKey(v));
    });
    parts.push(')');
  };
  for (const k of slotsOf(m)) { if (k === 'lightsNode') continue; parts.push(`${k}=`); walk(m[k], [m, k]); }
  return { key: parts.join(' '), leaves, edges, nodes: [...order.keys()] };
}

const swap = ([parent, p, i], node) => {
  if (i === undefined) parent[p] = node; else parent[p][i] = node;
};
// a texture node shared by a master's instances samples each instance's own texture
function perMaterialTexture(node, prop) {
  const own = node.update.bind(node);
  Object.defineProperty(node, 'updateType', { get: () => 'object', set() {}, configurable: true });
  node.update = function (frame) {
    const t = source(frame)?.[prop];
    if (t) this.value = t;
    own(frame);
  };
}

const sameLeaf = (a, b) => (a.kind === 'c' ? a.key === b.key : a.kind === 't' ? a.node.value === b.node.value : a.node === b.node);
const masters = []; // { key, first, plan: [{ keep } | { prop, kind, type }] } across calls (nature can join the homestead's)
let slot = 0;
const done = new WeakSet();
export const masterStats = { materials: 0, instances: 0, masters: 0 };

/**
 * Turns materials of one graph shape into instances of one master graph. Call before the materials are
 * first drawn. Materials keep their identity, flags and non-node properties; only their `*Node` slots
 * change (every instance points at the master's nodes).
 */
export function shareGraphs(list) {
  const fresh = [...new Set(list)].filter((m) => m?.isNodeMaterial && !done.has(m));
  for (const m of fresh) done.add(m);
  countOwners(fresh);
  const mats = fresh.filter((m) => !m.userData.ownGraph && slotsOf(m).some((k) => k !== 'lightsNode'));
  const groups = new Map();
  for (const m of mats) {
    const s = shape(m);
    masterStats.materials++;
    (groups.get(s.key) || groups.set(s.key, []).get(s.key)).push({ m, ...s });
  }
  for (const [key, members] of groups) {
    const old = masters.find((g) => g.key === key);
    if (old) members.unshift(old.first);
    if (members.length < 2) continue;
    const [A] = members;
    // per leaf: kept as is (the same in every instance) or read from each instance
    const plan = old ? old.plan : A.leaves.map((leaf, i) => {
      const same = members.every((x) => sameLeaf(leaf, x.leaves[i]));
      return same ? { keep: true } : { prop: `_m${slot++}`, kind: leaf.kind, type: leaf.type };
    });
    if (old && !members.slice(1).every((x) => plan.every((p, i) => !p.keep || sameLeaf(A.leaves[i], x.leaves[i])))) continue;
    for (const x of members) {
      if (x === A && old) continue;
      plan.forEach((p, i) => {
        if (p.keep) return;
        const leaf = x.leaves[i];
        if (leaf.kind === 'c') x.m[p.prop] = leaf.node.value;
        else if (leaf.kind === 't') x.m[p.prop] = leaf.node.value;
        else Object.defineProperty(x.m, p.prop, { get: () => leaf.node.value, configurable: true });
      });
    }
    if (!old) {
      plan.forEach((p, i) => {
        if (p.keep) return;
        if (p.kind === 't') perMaterialTexture(A.leaves[i].node, p.prop);
        else for (const e of A.edges[i]) swap(e, sourceRef(p.prop, p.type));
      });
      for (const n of A.nodes) n._cacheKey = null;
      masters.push({ key, first: A, plan });
      masterStats.masters++;
    }
    for (const x of members) {
      if (x === A) continue;
      for (const k of slotsOf(A.m)) if (k !== 'lightsNode') x.m[k] = A.m[k];
      x.m.userData.master = A.m.name || A.m.type;
      masterStats.instances++;
    }
  }
  return masterStats;
}

// The per-material values a master (and the light set) reads, copied onto a material made from another's
// nodes (impostor bakes) or cloned from it.
const PARAM = /^_(m\d+|l\d[cpdk]|sun|p[A-Z]\w*)$/;
export function inheritParams(target, from) {
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(from))) if (PARAM.test(k)) Object.defineProperty(target, k, d);
  return target;
}
const copy = THREE.Material.prototype.copy;
THREE.Material.prototype.copy = function (from) { copy.call(this, from); return inheritParams(this, from); };

/** Every node material under the given roots (meshes, points, sprites). */
export function materialsOf(...roots) {
  const out = new Set();
  for (const r of roots) r.traverse((o) => { for (const m of [o.material].flat()) if (m) out.add(m); });
  return [...out];
}

// debugging (tools): a material's graph shape key
export const shapeKey = (m) => shape(m).key;
