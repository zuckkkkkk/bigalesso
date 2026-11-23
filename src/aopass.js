// Screen-space ambient occlusion from the depth the main RenderPass already writes (no extra scene render,
// no scene traversal): AO is computed at half resolution, then a depth-aware 4-tap upsample darkens the colour.
// Used by the 'high' (8 samples) and 'ultra' (16 samples) presets; disabled (pass.enabled = false) below.
// Requires the composer render targets to carry a DepthTexture (scene.js/createComposer does that).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';

const AO_FRAG = `
  uniform sampler2D tDepth; uniform mat4 projInv; uniform vec2 fullRes; uniform vec2 aoRes;
  uniform float radius, intensity, bias, projScale; uniform int samples; uniform int dbg;
  varying vec2 vUv;
  vec3 viewPos( vec2 uv ) { float d = textureLod( tDepth, uv, 0.0 ).x; vec4 p = projInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return p.xyz / p.w; }
  float hash( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
  void main() {
    float d = textureLod( tDepth, vUv, 0.0 ).x;
    if ( d >= 0.99999 ) { gl_FragColor = vec4( 1.0 ); return; }
    vec3 P = viewPos( vUv );
    vec2 px = 1.0 / fullRes;
    vec3 Pr = viewPos( vUv + vec2( px.x, 0.0 ) ), Pl = viewPos( vUv - vec2( px.x, 0.0 ) );
    vec3 Pu = viewPos( vUv + vec2( 0.0, px.y ) ), Pd = viewPos( vUv - vec2( 0.0, px.y ) );
    vec3 dx = abs( Pr.z - P.z ) < abs( P.z - Pl.z ) ? Pr - P : P - Pl;
    vec3 dy = abs( Pu.z - P.z ) < abs( P.z - Pd.z ) ? Pu - P : P - Pd;
    vec3 N = normalize( cross( dx, dy ) );
    if ( dot( N, -P ) < 0.0 ) N = -N;
    float rPix = clamp( radius * projScale / max( 0.05, -P.z ), 2.0, 40.0 );
    vec2 cell = mod( floor( gl_FragCoord.xy ), 4.0 ); float a0 = ( cell.x + 4.0 * cell.y + hash( floor( gl_FragCoord.xy / 4.0 ) ) * 0.5 ) / 16.0 * 6.2831853; // 4x4 pattern: the blur pass cancels it
    float occ = 0.0; float ns = float( samples );
    for ( int i = 0; i < 16; i++ ) {
      if ( i >= samples ) break;
      float t = ( float( i ) + 0.5 ) / ns;
      float a = a0 + float( i ) * 2.39996323;
      vec2 off = vec2( cos( a ), sin( a ) ) * rPix * t;
      vec3 Q = viewPos( vUv + off / aoRes );
      vec3 v = Q - P; float vv = dot( v, v );
      float fall = max( 0.0, 1.0 - vv / ( radius * radius ) ); fall *= fall;
      occ += fall * max( 0.0, dot( v, N ) - bias * -P.z ) / ( vv + 0.002 );
    }
    float ao = clamp( 1.0 - intensity * occ / ns * radius, 0.0, 1.0 );
    if ( dbg == 1 ) { gl_FragColor = vec4( -P.z / 10.0, N.y * 0.5 + 0.5, rPix / 48.0, 1.0 ); return; }
    if ( dbg == 2 ) { gl_FragColor = vec4( occ / ns * 0.1, N.x * 0.5 + 0.5, N.z * 0.5 + 0.5, 1.0 ); return; }
    gl_FragColor = vec4( ao, ao, ao, 1.0 );
  }`;

const BLUR_FRAG = `
  uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 aoRes; uniform float cameraNear, cameraFar;
  varying vec2 vUv;
  float linZ( float d ) { float z = d * 2.0 - 1.0; return 2.0 * cameraNear * cameraFar / ( cameraFar + cameraNear - z * ( cameraFar - cameraNear ) ); }
  void main() {
    float z0 = linZ( textureLod( tDepth, vUv, 0.0 ).x );
    float s = 0.0, w = 0.0;
    for ( int j = -2; j < 2; j++ ) for ( int i = -2; i < 2; i++ ) {
      vec2 uv = vUv + ( vec2( float( i ), float( j ) ) + 0.5 ) / aoRes;
      float zi = linZ( textureLod( tDepth, uv, 0.0 ).x );
      float wi = 1.0 / ( 0.003 + abs( zi - z0 ) / z0 * 30.0 );
      s += textureLod( tAO, uv, 0.0 ).r * wi; w += wi;
    }
    float ao = s / max( w, 1e-4 );
    gl_FragColor = vec4( ao, ao, ao, 1.0 );
  }`;

const COMP_FRAG = `
  uniform sampler2D tDiffuse; uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 aoRes;
  uniform float cameraNear, cameraFar, strength; uniform int debug;
  varying vec2 vUv;
  float linZ( float d ) { float z = d * 2.0 - 1.0; return 2.0 * cameraNear * cameraFar / ( cameraFar + cameraNear - z * ( cameraFar - cameraNear ) ); }
  void main() {
    vec4 c = texture2D( tDiffuse, vUv );
    float d0 = textureLod( tDepth, vUv, 0.0 ).x;
    if ( d0 >= 0.99999 ) { gl_FragColor = c; return; }
    float z0 = linZ( d0 );
    vec2 h = 0.5 / aoRes;
    float s = 0.0, w = 0.0;
    for ( int i = 0; i < 4; i++ ) {
      vec2 o = vec2( ( i & 1 ) == 0 ? -h.x : h.x, ( i & 2 ) == 0 ? -h.y : h.y );
      float zi = linZ( textureLod( tDepth, vUv + o, 0.0 ).x );
      float wi = 1.0 / ( 0.002 + abs( zi - z0 ) / z0 * 40.0 );
      s += textureLod( tAO, vUv + o, 0.0 ).r * wi; w += wi;
    }
    float ao = s / max( w, 1e-4 );
    float lum = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    ao = mix( ao, 1.0, smoothstep( 1.2, 3.0, lum ) ); // emissive / very bright pixels keep their light
    if ( debug == 1 ) { gl_FragColor = vec4( vec3( ao ), 1.0 ); return; }
    gl_FragColor = vec4( c.rgb * mix( 1.0, ao, strength ), c.a );
  }`;

export class AOPass extends Pass {
  constructor(camera, { radius = 0.5, intensity = 3.2, strength = 0.8, samples = 8 } = {}) {
    super();
    this.camera = camera;
    this.needsSwap = true;
    this.aoTarget = new THREE.WebGLRenderTarget(2, 2, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.aoMat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, fullRes: { value: new THREE.Vector2(2, 2) }, aoRes: { value: new THREE.Vector2(1, 1) },
        radius: { value: radius }, intensity: { value: intensity }, bias: { value: 0.012 }, projScale: { value: 500 }, samples: { value: samples }, dbg: { value: 0 } },
      vertexShader: VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.blurTarget = this.aoTarget.clone();
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tAO: { value: this.aoTarget.texture }, tDepth: { value: null }, aoRes: { value: new THREE.Vector2(1, 1) }, cameraNear: { value: 0.1 }, cameraFar: { value: 100 } },
      vertexShader: VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tAO: { value: this.blurTarget.texture }, tDepth: { value: null }, aoRes: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 0.1 }, cameraFar: { value: 100 }, strength: { value: strength }, debug: { value: 0 } },
      vertexShader: VERT, fragmentShader: COMP_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    this.quad = new FullScreenQuad(this.aoMat);
    this.full = new THREE.Vector2(2, 2);
    this.strength = strength;
  }
  set samples(n) { this.aoMat.uniforms.samples.value = Math.max(1, Math.min(16, n | 0)); }
  get samples() { return this.aoMat.uniforms.samples.value; }
  setSize(w, h) {
    this.full.set(w, h);
    const aw = Math.max(1, Math.round(w / 2)), ah = Math.max(1, Math.round(h / 2));
    this.aoTarget.setSize(aw, ah); this.blurTarget.setSize(aw, ah); this.blurMat.uniforms.aoRes.value.set(aw, ah);
    this.aoMat.uniforms.fullRes.value.set(w, h); this.aoMat.uniforms.aoRes.value.set(aw, ah);
    this.compMat.uniforms.aoRes.value.set(aw, ah);
  }
  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture;
    const cam = this.camera, U = this.aoMat.uniforms;
    U.tDepth.value = depth; U.projInv.value.copy(cam.projectionMatrixInverse);
    U.projScale.value = this.aoTarget.height * cam.projectionMatrix.elements[5] * 0.5;
    if (depth) {
      renderer.setRenderTarget(this.aoTarget); this.quad.material = this.aoMat; this.quad.render(renderer);
      const B = this.blurMat.uniforms; B.tDepth.value = depth; B.cameraNear.value = cam.near; B.cameraFar.value = cam.far;
      renderer.setRenderTarget(this.blurTarget); this.quad.material = this.blurMat; this.quad.render(renderer);
    }
    const C = this.compMat.uniforms;
    C.tDiffuse.value = readBuffer.texture; C.tDepth.value = depth; C.cameraNear.value = cam.near; C.cameraFar.value = cam.far; C.strength.value = depth ? this.strength : 0; // no depth: plain copy
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.material = this.compMat; this.quad.render(renderer);
  }
  dispose() { this.aoTarget.dispose(); this.blurTarget.dispose(); this.blurMat.dispose(); this.aoMat.dispose(); this.compMat.dispose(); this.quad.dispose(); }
}
