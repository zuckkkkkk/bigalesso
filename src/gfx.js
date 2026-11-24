// gfx.js — graphics runtime installed once by main.js (round 6, GRAFICA):
//  - shader warm-up while loading: every texture uploaded and every lit material compiled for each light
//    combination the game can reach (day / night lamps / Gulag bulbs …), so turning lights on or walking into
//    a new area never freezes the frame on a shader compile. window.__gfx.warmup() re-runs it after new content.
//  - world-space detail (materials.js triplanar) on the plain walls, wood, stone and grass of the house/garden;
//  - soft contact blobs under the characters (window.__gfx.addBlob(obj, radius) for NPCs/zombies);
//  - distance/height haze on the outdoor fog;
//  - window.__gfx: { apply(level), warmup(), addBlob(), gpu, level, stats(), aoDebug(on) }.
// Rules for modules that add content (quartiere, minigames, NPCs): build at start-up when possible (the first
// warm-up then covers it); if you build later, call window.__gfx.warmup() right after. Lights: create them at
// start-up and switch them with .visible per area/night (each area = one warm-up unit), never add/remove lights
// mid-game. Debug URL switches: ?nogfx ?nodetail ?nowarm ?nosky ?warmall ?warmdry ?noao ?tier=0..3.
import * as THREE from 'three';
import { detailMaterial } from './materials.js';
import { getAOPass, currentQuality, QUALITY_LEVELS, QUALITY_LABELS } from './scene.js';

// ---------- height haze on the scene fog (patched before any program compiles) ----------
(function installHeightFog() {
  const C = THREE.ShaderChunk;
  if (C.fog_vertex.includes('vFogH')) return;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogH;');
  C.fog_vertex = C.fog_vertex.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogH = ( transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) ).y;');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying float vFogH;');
  C.fog_fragment = C.fog_fragment.replace('gl_FragColor.rgb = mix(', 'fogFactor = max( fogFactor, exp( - max( vFogH, 0.0 ) * 0.3 ) * ( 1.0 - exp( - max( vFogDepth - 10.0, 0.0 ) * 0.016 ) ) * 0.5 );\n\tgl_FragColor.rgb = mix(');
})();

// ---------- the loading gate: the menu appears once the warm-up is done (or after maxMs) ----------
let gateResolve = null; const gate = new Promise(r => { gateResolve = r; });
export function gfxGate(cb, maxMs = 90000) { // generous: the preload (all models) + full warm-up happen behind the loading screen / intro
  let done = false; const go = () => { if (done) return; done = true; try { cb(); } catch (e) { console.error(e); } };
  gate.then(go); setTimeout(go, maxMs);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const isDefaultOBC = m => !m.onBeforeCompile || m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;

// ---------- contact blobs ----------
let blobTex = null;
function getBlobTex() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c); return blobTex;
}
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export function addBlob(obj, radius = 0.4, opacity = 0.3, y = 0.012) {
  if (!obj || obj.userData.gfxBlob) return obj && obj.userData.gfxBlob;
  const m = new THREE.MeshBasicMaterial({ map: getBlobTex(), color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, fog: false });
  const b = new THREE.Mesh(blobGeo, m); b.scale.set(radius * 2, 1, radius * 2); b.position.y = y; b.renderOrder = -1; b.castShadow = false; b.receiveShadow = false;
  b.name = 'gfx:blob'; obj.add(b); obj.userData.gfxBlob = b; return b;
}

// ---------- detail on plain materials (house / garden / room) ----------
// explicit by colour (the materials world.js/room.js create), then a generic pass for big plain surfaces
const BY_COLOR = {
  0xe9e6e0: ['plaster', { scale: 1.1, bump: 0.8, albedo: 0.35 }], 0xeee4d6: ['plaster', { scale: 1.1, bump: 0.8, albedo: 0.35 }],
  0xf3f0e8: ['plaster', { scale: 1.6, bump: 0.5, albedo: 0.25 }], 0x4a6656: ['plaster', { scale: 1.2, bump: 0.9, albedo: 0.4 }],
  0x6d6158: ['concrete', { scale: 1.0, bump: 1.2, albedo: 0.6 }], 0xcfc6b6: ['stone', { scale: 1.2, bump: 1.8, albedo: 0.75, rough: 0.6 }],
  0x5a3b22: ['wood', { scale: 1.4, bump: 0.6, albedo: 0.7, rough: 0.4 }], 0x8a5d36: ['wood', { scale: 1.4, bump: 0.6, albedo: 0.7, rough: 0.4 }],
  0xece6da: ['wood', { scale: 2.0, bump: 0.4, albedo: 0.3 }], 0x6a8a7a: ['wood', { scale: 1.2, bump: 0.6, albedo: 0.5 }],
  0x6f8a52: ['grass', { scale: 0.6, bump: 0.8, albedo: 0.6 }], 0x4a3222: ['concrete', { scale: 2.0, bump: 1.4, albedo: 0.7 }],
  0x3d6a2c: ['grass', { scale: 1.5, bump: 1.0, albedo: 0.6 }], 0x1b1b1d: ['metal', { scale: 2.0, bump: 0.3, albedo: 0.2, rough: 0.6 }],
  0xd9d2c4: ['plaster', { scale: 3.0, bump: 0.4, albedo: 0.3 }], 0xb8673e: ['terracotta', { scale: 3.0, bump: 0.6, albedo: 0.4 }],
};
function upgradeMaterials(roots) {
  const done = new Set(); let n = 0;
  const sph = new THREE.Sphere(), s = new THREE.Vector3();
  for (const root of roots) {
    if (!root) continue;
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || done.has(m) || !m.isMeshStandardMaterial || m.userData.tri || m.userData.noDetail || !isDefaultOBC(m)) continue;
        if (m.transparent || m.alphaTest > 0 || m.map || m.normalMap || m.emissiveMap || m.vertexColors) continue;
        const rule = BY_COLOR[m.color.getHex()];
        if (rule) { detailMaterial(m, rule[0], rule[1]); done.add(m); n++; continue; }
        // generic: big, rough, non-metal plain surfaces get a light plaster grain
        if (m.metalness > 0.3 || m.roughness < 0.55 || (m.emissive && m.emissive.getHex() !== 0)) continue;
        const g = o.geometry; if (!g) continue; if (!g.boundingSphere) g.computeBoundingSphere();
        o.matrixWorld.decompose(sph.center, new THREE.Quaternion(), s);
        if (g.boundingSphere.radius * Math.max(s.x, s.y, s.z) < 0.9) continue;
        detailMaterial(m, 'plaster', { scale: 1.2, bump: 0.7, albedo: 0.3 }); done.add(m); n++;
      }
    });
  }
  return n;
}

// ---------- sky: same uniforms as world.js (shared objects, so its night fade keeps driving it) ----------
const SKY_FRAG = `uniform float uTime, uNight; uniform vec3 uSun; uniform vec3 uFog; varying vec3 vD;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  float fb(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
  void main(){
    vec3 d = normalize(vD); float y = d.y; vec3 sun = normalize(uSun); float mu = dot(d, sun);
    float hh = pow(clamp(y, 0.0, 1.0), 0.42);
    vec3 day = mix(vec3(0.66,0.77,0.90), vec3(0.15,0.33,0.70), hh);
    day += vec3(1.0,0.84,0.6) * (pow(max(mu,0.0), 6.0) * 0.22 + pow(max(mu,0.0), 48.0) * 0.5) * (1.0 - 0.4 * hh);
    day += vec3(1.0,0.96,0.88) * smoothstep(0.9991, 0.9996, mu) * 5.0;
    vec3 night = mix(vec3(0.06,0.08,0.15), vec3(0.012,0.02,0.055), hh);
    vec3 c = mix(day, night, uNight);
    if (y > 0.0) {
      vec2 uv = d.xz / (y + 0.22) * 1.5 + vec2(uTime*0.006, uTime*0.002);
      float n1 = fb(uv), n2 = n(uv * 4.3 + 7.1);
      float cov = smoothstep(0.5, 0.78, n1 * 0.85 + n2 * 0.15) * smoothstep(0.0, 0.22, y);
      float toward = fb(uv + sun.xz * 0.07);
      float lit = clamp(1.0 - (toward - n1) * 4.0, 0.35, 1.25);
      vec3 cl = mix(vec3(0.58,0.62,0.70), vec3(1.02,1.0,0.97), lit * 0.8) + vec3(1.0,0.82,0.55) * pow(max(mu,0.0), 5.0) * 0.35;
      c = mix(c, mix(cl, vec3(0.10,0.11,0.16), uNight), cov * 0.9);
      float st = step(0.9965, h(floor(d.xz/(y+0.3)*160.0))) * uNight * smoothstep(0.05,0.3,y) * (1.0 - cov);
      c += vec3(st);
      float m = max(dot(d, normalize(vec3(0.4,0.55,-0.6))), 0.0); c += vec3(0.9,0.92,1.0) * (pow(m, 900.0) * 2.0 + pow(m, 40.0) * 0.06) * uNight;
    }
    c = mix(c, uFog, (1.0 - smoothstep(-0.02, 0.16, y)) * 0.8); // the horizon melts into the fog: distant hills meet the sky
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
function upgradeSky(level, scene) {
  const sky = level && level.sky, old = sky && sky.material;
  if (!old || !old.uniforms || !old.uniforms.uNight || old.userData.gfx) return false;
  const U = old.uniforms;
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: U.uTime || { value: 0 }, uNight: U.uNight, uSun: U.uSun || { value: new THREE.Vector3(-0.55, 0.62, 0.55) }, uFog: { value: scene.fog ? scene.fog.color : new THREE.Color(0xd6dde6) } },
    vertexShader: old.vertexShader, fragmentShader: SKY_FRAG });
  m.userData.gfx = true; sky.material = m; return true;
}

// ---------- warm-up ----------
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'lightMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'specularIntensityMap', 'displacementMap', 'gradientMap', 'matcap'];
function texturesOf(m, out) {
  for (const k of TEX_KEYS) if (m[k] && m[k].isTexture) out.add(m[k]);
  if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) out.add(v); }
  if (m.userData && m.userData.tri) { out.add(m.userData.tri.triMap.value); out.add(m.userData.tri.triRH.value); }
}
const uploadable = t => !t.isRenderTargetTexture && !t.isDepthTexture && !t.isCubeTexture && t.image && (t.image.width > 0 || (t.image.data && t.image.data.length) || t.isCompressedTexture) && !(t.image instanceof HTMLImageElement && !t.image.complete);

function effVisible(o, root) { for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false; return true; }
function topOf(o, root) { let p = o; while (p.parent && p.parent !== root) p = p.parent; return p; }
function countLights(scene, camera) {
  const c = { p: 0, s: 0, d: 0, r: 0, h: 0, ps: 0, ss: 0, ds: 0 };
  scene.traverseVisible(o => {
    if (!o.isLight || !o.layers.test(camera.layers)) return;
    if (o.isPointLight) { c.p++; if (o.castShadow) c.ps++; } else if (o.isSpotLight) { c.s++; if (o.castShadow) c.ss++; }
    else if (o.isDirectionalLight) { c.d++; if (o.castShadow) c.ds++; } else if (o.isRectAreaLight) c.r++; else if (o.isHemisphereLight) c.h++;
  });
  return Object.values(c).join(',');
}
// dormant lights (hidden now, may turn on later) grouped by their module root = the units that toggle together
function lightUnits(scene) {
  const units = new Map();
  scene.traverse(o => {
    if (!o.isLight || o.userData.noWarm || effVisible(o, scene)) return;
    const top = topOf(o, scene); const k = top === o ? o.uuid : top.uuid;
    if (!units.has(k)) units.set(k, { name: top.name || top.type, lights: [] });
    units.get(k).lights.push(o);
  });
  return [...units.values()];
}
function activate(unitsOn, scene) {
  const changed = [];
  for (const u of unitsOn) for (const L of u.lights) for (let p = L; p && p !== scene; p = p.parent) if (!p.visible) { p.visible = true; changed.push(p); }
  return () => { for (const p of changed) p.visible = false; };
}

export function installGfx(ctx) {
  const { renderer, scene, camera, composer, room, level, man, dog } = ctx;
  if (new URLSearchParams(location.search).has('nogfx')) { gateResolve && gateResolve(); return window.__gfx; } // debug: bisect
  const G = window.__gfx = Object.assign(window.__gfx || {}, { log: (window.__gfx && window.__gfx.log) || [] });
  const W = { ms: 0, programs: 0, combos: 0, textures: 0, runs: 0, units: 0 };
  G.levels = QUALITY_LEVELS; G.labels = QUALITY_LABELS;
  G.addBlob = addBlob;
  G.aoDebug = on => { const ao = getAOPass(); if (ao) ao.compMat.uniforms.debug.value = on ? 1 : 0; };
  G.stats = () => ({ gpu: G.gpu, level: currentQuality(), warm: { ...W }, programs: renderer.info.programs ? renderer.info.programs.length : -1, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });

  // materials + blobs before the warm-up (they change programs)
  const roots = [level && level.root, room && room.room].filter(Boolean);
  if (!roots.length) roots.push(scene);
  const QS = new URLSearchParams(location.search);
  if (!QS.has('nodetail')) try { W.detailed = upgradeMaterials(roots); } catch (e) { console.warn('gfx: detail', e); }
  try { if (man && man.root) addBlob(man.root, 0.36, 0.34); if (dog && dog.root) addBlob(dog.root, 0.26, 0.3); } catch (e) { console.warn('gfx: blob', e); }
  if (!QS.has('nosky')) try { W.sky = upgradeSky(level, scene); } catch (e) { console.warn('gfx: sky', e); }

  const uploaded = new WeakSet();
  let running = null, texBudget = (G.gpu && G.gpu.tier >= 2 ? 160 : 72) * 1048576; // bytes the warm-up may upload in total
  const qs = new URLSearchParams(location.search);
  async function warm({ maxMs = 20000, texMs = 4000, all = false } = {}) {
    if (all) { maxMs = 40000; texMs = 20000; texBudget = Math.max(texBudget, (G.gpu && G.gpu.tier >= 2 ? 420 : G.gpu && G.gpu.tier >= 1 ? 260 : 160) * 1048576); }
    const t0 = performance.now(), p0 = renderer.info.programs ? renderer.info.programs.length : 0;
    const prog = k => { if (all && G.onProgress) try { G.onProgress(Math.min(1, k)); } catch (e) { } }; // loading card (main.js)
    // 1) textures of the meshes that are shown (frustum-culled ones would upload the first time you look at
    //    them): small/medium images only and a memory budget, big pages stay lazy (VRAM on small GPUs)
    const texs = new Set();
    scene.traverse(o => { if (o.material && (all || effVisible(o, scene))) for (const m of [].concat(o.material)) if (m) texturesOf(m, texs); });
    let slice = performance.now(), budget = texBudget, ti = 0;
    for (const t of texs) {
      if ((++ti & 15) === 0) prog(0.45 * ti / texs.size);
      if (uploaded.has(t) || !uploadable(t)) continue;
      const px = (t.image.width || 0) * (t.image.height || 0), bytes = px * 4 * (t.generateMipmaps ? 1.34 : 1);
      if (px > 2.2e6 || bytes > budget) continue;
      if (performance.now() - t0 > texMs) break;
      try { renderer.initTexture(t); uploaded.add(t); W.textures++; budget -= bytes; texBudget = budget; } catch (e) { }
      if (performance.now() - slice > 10) { await frame(); slice = performance.now(); }
    }
    // 2) every reachable light combination, compiled as the composer will render it (into a float target)
    // software renderers (llvmpipe/SwiftShader) JIT every program on the CPU (~1-2 s and tens of MB each):
    // there the programs keep compiling lazily as before; real GPUs get the full warm-up
    const soft = G.gpu && G.gpu.software && !qs.has('warmall') && !qs.has('warmdry');
    const units = soft ? [] : lightUnits(scene); W.units = units.length; W.unitNames = units.map(u => u.name + ':' + u.lights.length);
    // all: hidden content (interiors, other areas, NPC bodies, street life) temporarily shown so compileAsync sees it;
    // lights that would light up only because their parent got shown stay off (they'd change the light count/key)
    let unhide = () => { };
    if (all && !soft) {
      const litBefore = new Set(); scene.traverse(L => { if (L.isLight && effVisible(L, scene)) litBefore.add(L); });
      const shown = [], dimmed = [];
      scene.traverse(o => { if (!o.visible && !o.isLight && !(o.userData && o.userData.noWarm)) { o.visible = true; shown.push(o); } });
      scene.traverse(L => { if (L.isLight && L.visible && !litBefore.has(L) && effVisible(L, scene)) { L.visible = false; dimmed.push(L); } });
      W.shown = shown.length;
      unhide = () => { for (const o of shown) o.visible = false; for (const L of dimmed) L.visible = true; };
    }
    const combos = [], seen = new Set();
    const n = Math.min(units.length, 4);
    // each area alone and every pair (lamps at night next to the Gulag…); three at once is rare: compiles lazily
    for (let mask = 0; mask < (1 << n); mask++) { const on = units.filter((u, i) => i < n && (mask >> i) & 1); if (on.length <= 2) combos.push(on); }
    combos.sort((a, b) => a.length - b.length);
    let ci = 0;
    for (const on of combos) {
      prog(0.45 + 0.45 * (ci++) / combos.length);
      if (soft || performance.now() - t0 > maxMs) break;
      const restore = activate(on, scene);
      if (window.__lightpad) window.__lightpad.update(); // padded light count (lightpad.js): every combo compiles the same programs
      const key = countLights(scene, camera);
      if (seen.has(key) || seen.size >= 8) { restore(); continue; }
      seen.add(key); (W.keys = W.keys || []).push(on.map(u => u.name + ':' + u.lights.length).join('+') + ' -> ' + key);
      const prev = renderer.getRenderTarget(); let p = null;
      try { renderer.setRenderTarget(composer.readBuffer); if (!qs.has('warmdry')) p = renderer.compileAsync(scene, camera); }
      catch (e) { console.warn('gfx: compile', e); }
      finally { renderer.setRenderTarget(prev); restore(); }
      W.combos++;
      if (p) await Promise.race([p, sleep(6000)]);
      await frame();
    }
    // all: ONE tiny off-screen render of the whole world with frustum culling off, so every vertex/index buffer,
    // texture and shadow/depth program is on the GPU before the menu (compileAsync alone doesn't upload geometry:
    // walking into an interior for the first time used to stall on those uploads)
    prog(0.92);
    if (all) try {
      const culled = []; scene.traverse(o => { if (o.frustumCulled && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) { o.frustumCulled = false; culled.push(o); } });
      const rt = composer.readBuffer, prev = renderer.getRenderTarget(), vp = rt.viewport.clone(), sc = rt.scissor.clone(), st = rt.scissorTest;
      rt.viewport.set(0, 0, 8, 8); rt.scissor.set(0, 0, 8, 8); rt.scissorTest = true;
      const t1 = performance.now();
      renderer.shadowMap.needsUpdate = true; // shadow depth programs too (shadow casters' variants compile now, not when they first cast)
      const sc0 = []; scene.traverse(L => { if (L.isLight && L.castShadow && L.shadow && L.shadow.camera && L.shadow.camera.isOrthographicCamera) { const c = L.shadow.camera; sc0.push([c, c.left, c.right, c.top, c.bottom, c.near, c.far]); c.left = c.bottom = -400; c.right = c.top = 400; c.near = 0.1; c.far = 800; c.updateProjectionMatrix(); } });
      try { renderer.setRenderTarget(rt); renderer.render(scene, camera); }
      finally { for (const [c, l, r, t, b, n, f] of sc0) { c.left = l; c.right = r; c.top = t; c.bottom = b; c.near = n; c.far = f; c.updateProjectionMatrix(); } renderer.shadowMap.needsUpdate = true;
        renderer.setRenderTarget(prev); rt.viewport.copy(vp); rt.scissor.copy(sc); rt.scissorTest = st; for (const o of culled) o.frustumCulled = true; }
      W.renderAll = Math.round(performance.now() - t1); W.geometries = renderer.info.memory.geometries; W.texturesGPU = renderer.info.memory.textures;
      await frame();
    } catch (e) { console.warn('gfx: render-all', e); }
    unhide();
    // 3) post passes: one render with every optional pass on (their programs compile now, not on a preset switch)
    if (!soft) try {
      const ao = getAOPass(), bl = ctx.bloom; const aoOn = ao && ao.enabled, blOn = bl && bl.enabled;
      if (ao) ao.enabled = true; if (bl) bl.enabled = true;
      const refl = room && room.reflector; const rl = refl ? refl.layers.mask : 0; if (refl) refl.layers.enable(0);
      composer.render(0);
      if (ao) ao.enabled = aoOn; if (bl) bl.enabled = blOn; if (refl) refl.layers.mask = rl;
    } catch (e) { console.warn('gfx: passes', e); }
    prog(1);
    W.ms = Math.round(performance.now() - t0); W.programs = (renderer.info.programs ? renderer.info.programs.length : 0) - p0; W.runs++;
    return W;
  }
  let firstP = null, firstDone = false;
  G.warmup = opts => {
    const all = !!(opts && opts.all);
    if (!all && !firstDone && firstP) return firstP; // the full start-up warm-up covers it
    if (running) return all ? running.then(() => G.warmup(opts)) : running;
    running = warm(opts).catch(e => { console.warn('gfx: warmup', e); return W; }).finally(() => { running = null; }); return running;
  };
  // first warm-up right after load (gates the menu); later runs are on demand.
  // It waits for main.js's preload (quartiere + models + NPC bodies), then uploads and compiles everything in one go
  firstP = QS.has('nowarm') ? Promise.resolve(W) : Promise.resolve(window.__preloadP).catch(() => { }).then(() => G.warmup({ all: true }));
  firstP.finally(() => { firstDone = true; G.ready = true; gateResolve && gateResolve(); });
  return G;
}
