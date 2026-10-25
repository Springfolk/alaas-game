// The scene's environment light (the sky PMREM), sampled exactly as three's PMREMNode / textureCubeUV do,
// but with the cube-UV arithmetic in one native WGSL function instead of inlined TSL graphs. Same maths,
// same pixels; it only makes each material's shader build cheaper: three's version re-traverses ~35% of
// a lit material's node graph (two lookups × two mips of bilinearCubeUV) in every build (docs/loading.md).
// Mirrors three r186 src/nodes/pmrem/PMREMUtils.js (textureCubeUV, bilinearCubeUV, getFace, getUV,
// roughnessToMip) and PMREMNode.setup: recheck on upgrade. WebGPU only (WGSL); WebGL keeps three's.
import { PMREMNode, PMREMGenerator } from 'three/webgpu';
import { wgslFn, vec2, vec3, float, fract, floor, mix, If, materialEnvRotation } from 'three/tsl';

const lookup = wgslFn(/* wgsl */`
fn cubeUVLookup( direction: vec3<f32>, mipInt: f32, texelWidth: f32, texelHeight: f32, maxMip: f32 ) -> vec4<f32> {
  return vec4<f32>( cubeUVBilinear( direction, mipInt, texelWidth, texelHeight, maxMip ), cubeUVBilinear( direction, mipInt + 1.0, texelWidth, texelHeight, maxMip ) );
}
fn cubeUVBilinear( direction: vec3<f32>, mipIn: f32, texelWidth: f32, texelHeight: f32, maxMip: f32 ) -> vec2<f32> {
  var mipInt = mipIn;
  var face = cubeUVFace( direction );
  let filterInt = max( 4.0 - mipInt, 0.0 );
  mipInt = max( mipInt, 4.0 );
  let faceSize = exp2( mipInt );
  var uv = ( cubeUVFaceUV( direction, face ) * ( faceSize - 2.0 ) ) + 1.0;
  if ( face > 2.0 ) {
    uv.y = uv.y + faceSize;
    face = face - 3.0;
  }
  uv.x = uv.x + ( face * faceSize );
  uv.x = uv.x + ( filterInt * ( 3.0 * 16.0 ) );
  uv.y = uv.y + ( 4.0 * ( exp2( maxMip ) - faceSize ) );
  uv.x = uv.x * texelWidth;
  uv.y = uv.y * texelHeight;
  return uv;
}
fn cubeUVFace( direction: vec3<f32> ) -> f32 {
  let a = abs( direction );
  var face = -1.0;
  if ( a.x > a.z ) {
    if ( a.x > a.y ) { face = select( 3.0, 0.0, direction.x > 0.0 ); } else { face = select( 4.0, 1.0, direction.y > 0.0 ); }
  } else {
    if ( a.z > a.y ) { face = select( 5.0, 2.0, direction.z > 0.0 ); } else { face = select( 4.0, 1.0, direction.y > 0.0 ); }
  }
  return face;
}
fn cubeUVFaceUV( direction: vec3<f32>, face: f32 ) -> vec2<f32> {
  var uv: vec2<f32>;
  if ( face == 0.0 ) { uv = vec2<f32>( direction.z, direction.y ) / abs( direction.x ); }
  else if ( face == 1.0 ) { uv = vec2<f32>( -direction.x, -direction.z ) / abs( direction.y ); }
  else if ( face == 2.0 ) { uv = vec2<f32>( -direction.x, direction.y ) / abs( direction.z ); }
  else if ( face == 3.0 ) { uv = vec2<f32>( -direction.z, direction.y ) / abs( direction.x ); }
  else if ( face == 4.0 ) { uv = vec2<f32>( -direction.x, direction.z ) / abs( direction.y ); }
  else { uv = vec2<f32>( direction.x, direction.y ) / abs( direction.z ); }
  return 0.5 * ( uv + 1.0 );
}
`);
const toMip = wgslFn(/* wgsl */`
fn cubeUVMip( roughness: f32, maxMip: f32 ) -> f32 { return clamp( cubeUVRoughnessToMip( roughness ), -2.0, maxMip ); }
fn cubeUVRoughnessToMip( roughness: f32 ) -> f32 {
  var mip = 0.0;
  if ( roughness >= 0.8 ) {
    mip = ( ( ( 1.0 - roughness ) * ( -1.0 - -2.0 ) ) / ( 1.0 - 0.8 ) ) + -2.0;
  } else if ( roughness >= 0.4 ) {
    mip = ( ( ( 0.8 - roughness ) * ( 2.0 - -1.0 ) ) / ( 0.8 - 0.4 ) ) + -1.0;
  } else if ( roughness >= 0.305 ) {
    mip = ( ( ( 0.4 - roughness ) * ( 3.0 - 2.0 ) ) / ( 0.4 - 0.305 ) ) + 2.0;
  } else if ( roughness >= 0.21 ) {
    mip = ( ( ( 0.305 - roughness ) * ( 4.0 - 3.0 ) ) / ( 0.305 - 0.21 ) ) + 3.0;
  } else {
    mip = -2.0 * log2( 1.16 * roughness );
  }
  return mip;
}
`);

class FastPMREMNode extends PMREMNode {
  static get type() { return 'FastPMREMNode'; }
  setup(builder) {
    if (!builder.renderer.backend.isWebGPUBackend) return super.setup(builder);
    if (this._generator === null) this._generator = new PMREMGenerator(builder.renderer);
    this.updateBefore(builder);
    let uvNode = this.uvNode;
    if (uvNode === null && builder.context.getUV) uvNode = builder.context.getUV(this, builder);
    uvNode = this._pmrem === null || this._pmrem.isRenderTargetTexture
      ? materialEnvRotation.mul(vec3(uvNode.x, uvNode.y.negate(), uvNode.z))
      : materialEnvRotation.mul(uvNode);
    let levelNode = this.levelNode;
    if (levelNode === null && builder.context.getTextureLevel) levelNode = builder.context.getTextureLevel(this);
    const mip = toMip({ roughness: float(levelNode), maxMip: this._maxMip });
    const mipF = fract(mip);
    const uv = lookup({ direction: vec3(uvNode), mipInt: floor(mip), texelWidth: this._width, texelHeight: this._height, maxMip: this._maxMip }).toVar();
    const color0 = vec3(this._texture.sample(uv.xy).grad(vec2(), vec2())).toVar(); // grad: no anisotropic filtering
    If(mipF.notEqual(0.0), () => {
      const color1 = vec3(this._texture.sample(uv.zw).grad(vec2(), vec2())).toVar();
      color0.assign(mix(color0, color1, mipF));
    });
    return color0;
  }
}

// scene.environmentNode for a PMREM texture (engine.js setSun keeps `.value` on the current one)
export const fastPMREM = (tex) => new FastPMREMNode(tex);
