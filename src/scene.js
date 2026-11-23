import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AOPass } from './aopass.js';
import { setMaterialAnisotropy } from './materials.js';

export function createRenderer(container, low) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.25 : 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  window.__renderer = renderer; window.__THREE = THREE; // perf/debug hooks
  // GPU tier -> 'auto' preset + texture filtering (anisotropy is fixed for the session: changing it re-uploads textures)
  try { GPU = detectGPU(renderer); } catch (e) { GPU = { name: '?', tier: 1, cores: navigator.hardwareConcurrency || 4, maxAniso: 4 }; }
  (window.__gfx = window.__gfx || {}).gpu = GPU;
  try { setMaterialAnisotropy(Math.min(GPU.maxAniso || 4, GPU.tier >= 2 ? 16 : GPU.tier === 1 ? 8 : 4)); } catch (e) { }
  return renderer;
}

export const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.035 }, vignette: { value: 0.32 }, fade: { value: 1 }, bars: { value: 0 }, aspect: { value: 1.7 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, fade, bars, aspect; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float v = 1.0 - dot(d*vec2(1.0,0.85), d*vec2(1.0,0.85)) * vignette * 2.2;
      c *= v;
      float n = h(uv*vec2(1931.0,1173.0) + fract(time*7.13)) - 0.5;
      c += n * grain;
      c *= fade;
      float bh = bars * 0.12;
      if(uv.y < bh || uv.y > 1.0 - bh) c = vec3(0.0);
      gl_FragColor = vec4(c, 1.0);
    }`
};

// the AO pass lives here so applyQuality can reach it without new arguments from main.js
let AO = null;

export function createComposer(renderer, scene, camera, low) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // depth texture on the composer targets: the AO pass reads the depth the main render already wrote
  const noAO = new URLSearchParams(location.search).has('noao'); // debug switch
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: low ? 0 : 4, depthTexture: noAO ? null : new THREE.DepthTexture(size.x, size.y) });
  const composer = new EffectComposer(renderer, rt);
  // own depth texture for the second target: clone() shares the texture source = one GL texture = feedback loop
  if (!noAO) composer.renderTarget2.depthTexture = new THREE.DepthTexture(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  if (!noAO) { AO = new AOPass(camera); AO.enabled = false; composer.addPass(AO); }
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.45, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  window.__composer = composer; // perf/debug hook
  return { composer, bloom, final, ao: AO };
}
export const getAOPass = () => AO;

export function setupLights(scene, renderer, low) {
  RectAreaLightUniformsLib.init();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.42;
  scene.background = new THREE.Color(0x000000);
  window.__scene = scene; // perf/debug hook

  const hemi = new THREE.HemisphereLight(0xfffaf2, 0x8c8278, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
  key.position.set(-3.2, 4.6, 4.4);
  key.target.position.set(0.1, 0.5, 0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  const sc = key.shadow.camera; sc.left = -2.6; sc.right = 2.6; sc.top = 2.6; sc.bottom = -2.2; sc.near = 1; sc.far = 12;
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.015;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe8eeff, 0.55);
  fill.position.set(3.5, 2.5, 5); fill.target.position.set(0, 0.8, 0.3);
  scene.add(fill, fill.target);
  const bounce = new THREE.PointLight(0xffe8d0, 0.0, 6, 2); // used for "lights on" overhead
  bounce.position.set(0.3, 2.9, 2.2); bounce.visible = false; bounce.userData.noWarm = true; scene.add(bounce); // perf: unused (intensity 0) -> off
  return { hemi, key, fill, bounce, base: { hemi: 0.55, key: 2.6, fill: 0.55, env: 0.42 } };
}

// ---------------- GPU detection ----------------
// tier 0 = software / old integrated, 1 = modern integrated / entry GPUs, 2 = mid-range, 3 = high-end.
export function detectGPU(renderer) {
  const gl = renderer.getContext();
  let name = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { }
  const s = name.toLowerCase();
  let tier = 1;
  const software = /swiftshader|llvmpipe|softpipe|basic render|software|mesa offscreen/.test(s);
  const mobile = /mali|adreno|powervr|apple gpu|videocore/.test(s) || matchMedia('(pointer: coarse)').matches;
  if (software) tier = 0;
  else if (/apple m\d/.test(s)) tier = /(pro|max|ultra)/.test(s) ? 3 : 2;
  else if (/nvidia|geforce|quadro|rtx|gtx/.test(s)) {
    if (/rtx\s*\d{4}/.test(s) || /rtx a\d{4}/.test(s)) tier = 3;
    else if (/gtx\s*(16\d\d|10[6-8]0|980|970)/.test(s)) tier = 2;
    else if (/\bmx\s*\d{3}|gtx\s*(9[0-6]0|10[35]0)|gt\s*\d{3}/.test(s)) tier = 1;
    else tier = 2;
  } else if (/radeon|amd/.test(s)) {
    if (/rx\s*(5[5-9]|6[4-9]|7[6-9]|9[0-9])\d\d/.test(s) || /rx\s*(6|7|9)\d{3}/.test(s)) tier = 3;
    else if (/rx\s*(4|5)\d\d|7[68]0m|6[68]0m|vega\s*(56|64)/.test(s)) tier = 2;
    else tier = 1; // APUs: "AMD Radeon(TM) Graphics", Vega 8…
  } else if (/intel/.test(s)) {
    if (/\barc\b/.test(s)) tier = 3;
    else if (/iris|xe/.test(s)) tier = 1;
    else tier = 0; // HD / UHD
  } else if (mobile) tier = 0;
  const ov = new URLSearchParams(location.search).get('tier'); if (ov !== null && ov !== '') tier = Math.max(0, Math.min(3, +ov | 0)); // test override
  const caps = renderer.capabilities;
  return { name, tier, software, mobile, maxAniso: caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 4, parallel: renderer.extensions.has('KHR_parallel_shader_compile'), cores: navigator.hardwareConcurrency || 4 };
}

// ---------------- quality presets ----------------
// 'auto' picks by GPU tier and is lowered at runtime if the frame rate drops. Switching presets never
// rebuilds the scene and never forces material recompiles: only pixel ratio, render-target samples,
// shadow-map size and pass toggles change (all cheap). The shadow filter type is fixed at start-up.
export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];
export const QUALITY_LABELS = { auto: 'Auto', low: 'Bassa', medium: 'Media', high: 'Alta', ultra: 'Ultra' };
export const QUALITY = {
  low: { pr: 1.0, maxPx: 1.6e6, shadow: 1024, soft: false, refl: false, bloom: false, dust: false, msaa: 0, grain: 0.02, ao: 0, bloomR: 0.4 },
  medium: { pr: 1.3, maxPx: 2.8e6, shadow: 1536, soft: true, refl: false, bloom: true, dust: true, msaa: 2, grain: 0.03, ao: 0, bloomR: 0.45 },
  high: { pr: 1.6, maxPx: 4.6e6, shadow: 2048, soft: true, refl: true, bloom: true, dust: true, msaa: 4, grain: 0.035, ao: 8, bloomR: 0.45 },
  ultra: { pr: 2.0, maxPx: 8.4e6, shadow: 4096, soft: true, refl: true, bloom: true, dust: true, msaa: 4, grain: 0.035, ao: 16, bloomR: 0.55 },
};
let GPU = null;
export function setGPUInfo(g) { GPU = g; }
export function autoQualityLevel(gpu = GPU) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 500;
  if (coarse || small) return 'low';
  if (gpu) {
    let lv = QUALITY_LEVELS[Math.max(0, Math.min(3, gpu.tier))];
    if (gpu.cores <= 2 && (lv === 'high' || lv === 'ultra')) lv = 'medium';
    return lv;
  }
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4) return 'medium';
  return 'high';
}
/** One preset lower (runtime auto-adjust). */
export function lowerQuality(level) { const i = QUALITY_LEVELS.indexOf(level); return QUALITY_LEVELS[Math.max(0, (i < 0 ? 2 : i) - 1)]; }

// ctx: { renderer, composer, bloom, final, lights, room, fx, resize, scene }
let lastCtx = null, shadowTypeLocked = false, current = null;
export function applyQuality(level, ctx) {
  const t0 = performance.now(); if (ctx) lastCtx = ctx; ctx = lastCtx;
  if (!window.__gfx) window.__gfx = {};
  const G = window.__gfx; if (!G.log) G.log = []; if (!G.apply) G.apply = l => applyQuality(l, lastCtx);
  const q = QUALITY[level] || QUALITY.high;
  const { renderer, composer, bloom, final, lights, room, fx, resize } = ctx;
  // pixel ratio: preset cap, also capped by the total pixel count (4K screens)
  const el = renderer.domElement, w = Math.max(1, el.clientWidth || innerWidth), h = Math.max(1, el.clientHeight || innerHeight);
  const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, q.pr, Math.sqrt(q.maxPx / (w * h))));
  const prChanged = Math.abs(renderer.getPixelRatio() - pr) > 1e-3;
  if (prChanged) renderer.setPixelRatio(pr);
  // shadow filter: decided once (a change would recompile every lit material = seconds of freeze)
  if (!shadowTypeLocked) {
    const t = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (renderer.shadowMap.type !== t) { renderer.shadowMap.type = t; renderer.shadowMap.needsUpdate = true; if (ctx.scene) ctx.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; }); }
    shadowTypeLocked = true;
  }
  if (lights && lights.key) {
    const sh = lights.key.shadow, size = Math.min(q.shadow, renderer.capabilities.maxTextureSize || 4096);
    if (sh.mapSize.x !== size) { sh.mapSize.set(size, size); if (sh.map) { sh.map.dispose(); sh.map = null; } window.__perfApi && window.__perfApi.forceShadow(); }
  }
  // reflections: the camera simply stops seeing the mirror (world.js toggles .visible per zone on its own)
  if (room && room.reflector) { if (q.refl) room.reflector.layers.enable(0); else room.reflector.layers.disable(0); }
  if (bloom) { bloom.enabled = q.bloom; bloom.radius = q.bloomR; }
  if (final) final.uniforms.grain.value = q.grain;
  if (fx && fx.dust) try { fx.dust(q.dust); } catch (e) { }
  if (AO) { AO.enabled = q.ao > 0; if (q.ao) AO.samples = q.ao; }
  if (composer) {
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      if (rt && rt.samples !== q.msaa) { rt.samples = q.msaa; rt.dispose(); }
    }
    if (prChanged) composer.setPixelRatio && composer.setPixelRatio(renderer.getPixelRatio());
  }
  if (prChanged) resize && resize();
  current = level;
  G.level = level; G.log.push({ level, ms: +(performance.now() - t0).toFixed(2) });
  if (G.log.length > 40) G.log.shift();
  return q;
}
export const currentQuality = () => current;
