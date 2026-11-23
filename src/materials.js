/**
 * materials.js — shared PBR material library (procedural, generated once and cached).
 *
 *   import { mat, matTex, MAT_KINDS, detailMaterial } from './materials.js';
 *   const m = mat('brick', { repeat: [2, 1.5], color: 0xffffff });   // MeshStandardMaterial, UV mapped
 *   const w = mat('plaster', { world: 1.2, color: 0xe8c9a0 });        // world-space (triplanar) mapping:
 *                                                                     //   no UVs needed, 1.2 tiles per metre
 *   const n = mat('neon', { color: 0xff3cac, intensity: 2.5 });        // emissive tube/sign material
 *   const g = mat('glass', { color: 0x9fd6ff, opacity: 0.25 });       // fake glass (no transmission pass)
 *   detailMaterial(existingMat, 'plaster', { scale: 1.5 });           // add triplanar detail to a plain material
 *
 * kinds: plaster, stucco, brick, stone, cobble, woodFloor, wood, tiles, terracotta, marble, fabric, leather,
 *        metal, chrome, glass, grass, asphalt, concrete, roofTiles, neon.
 * aliases: tile -> tiles, floor -> woodFloor, paving -> cobble, rock -> stone, wall -> plaster.
 * options: repeat [u,v] (tiles per UV unit), world (tiles per metre: triplanar, ignores UVs), color (tint),
 *          roughness, metalness, side, intensity (neon), opacity (glass), normalScale / bump (number).
 * Textures: 512 px procedural canvases built lazily on first use (albedo sRGB + normal + "rh": R = height,
 * G = roughness), shared by every variant (one GPU upload per kind). Materials are cached by kind+options:
 * asking twice returns the same instance (clone() before animating its properties).
 * Anisotropy is set once at start-up from the GPU tier (setMaterialAnisotropy): changing it later forces a
 * re-upload of every texture, so the quality presets don't touch it.
 */
import * as THREE from 'three';
import { makeNoise, fbm, rng, canvas, normalFromHeight } from './util.js';

const N = 512;
const texCache = new Map(); // kind -> { map, normal, rough, avg }
const matCache = new Map();
const allTex = new Set();
let ANISO = 8;

function mkTex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO;
  allTex.add(t); return t;
}
// paint(x, y) -> [r, g, b, height(0..1), rough(0..1)]
function bake(kind, paint, normalStrength = 2) {
  const col = canvas(N, N), cx = col.getContext('2d'), img = cx.createImageData(N, N), d = img.data;
  const rc = canvas(N, N), rx = rc.getContext('2d'), rimg = rx.createImageData(N, N), rd = rimg.data;
  const hgt = new Float32Array(N * N);
  let lum = 0, rsum = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = paint(x, y), i = y * N + x, o = i * 4;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = 255;
    const h = Math.max(0, Math.min(1, p[3])), r = Math.max(0, Math.min(1, p[4]));
    hgt[i] = h; rd[o] = h * 255; rd[o + 1] = r * 255; rd[o + 2] = 0; rd[o + 3] = 255;
    lum += Math.pow(Math.max(0, Math.min(255, 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2])) / 255, 2.2); rsum += r;
  }
  cx.putImageData(img, 0, 0); rx.putImageData(rimg, 0, 0);
  const out = { map: mkTex(col, true), rough: mkTex(rc, false), normal: mkTex(normalFromHeight(hgt, N, N, normalStrength, true), false), avg: lum / (N * N), avgRough: rsum / (N * N) };
  texCache.set(kind, out); return out;
}

const GEN = {
  plaster: () => { const n = makeNoise(3), m = makeNoise(9); return bake('plaster', (x, y) => { const f = fbm(n, x / 48, y / 48, 4, N / 48, N / 48), g = m(x / 3, y / 3, N / 3, N / 3); const k = 0.93 + f * 0.1 + (g - 0.5) * 0.03; return [236 * k, 230 * k, 220 * k, f * 0.6 + g * 0.15, 0.82 + f * 0.1]; }, 1.2); },
  stucco: () => { const n = makeNoise(31), m = makeNoise(5); return bake('stucco', (x, y) => { const f = fbm(n, x / 26, y / 26, 5, N / 26, N / 26), g = m(x / 2, y / 2, N / 2, N / 2); const k = 0.86 + f * 0.22; return [224 * k, 168 * k, 120 * k, f * 0.8 + g * 0.3, 0.9]; }, 2.2); },
  brick: () => {
    const n = makeNoise(11), m = makeNoise(4), R = rng(7), BW = 64, BH = 24, cols = [];
    for (let i = 0; i < 400; i++) cols.push([150 + R() * 50, 62 + R() * 30, 42 + R() * 18]);
    return bake('brick', (x, y) => {
      const row = Math.floor(y / BH), off = (row % 2) * BW / 2, bx = Math.floor((x + off) / BW) % (N / BW), lx = (x + off) % BW, ly = y % BH;
      const mortar = lx < 3 || ly < 3; const c = cols[(row * 13 + bx * 7) % cols.length];
      const f = fbm(n, x / 14, y / 14, 3, N / 14, N / 14), g = m(x / 2, y / 2, N / 2, N / 2);
      if (mortar) { const k = 0.8 + f * 0.25; return [178 * k, 170 * k, 158 * k, 0.05 + g * 0.05, 0.95]; }
      const k = 0.82 + f * 0.3 + (g - 0.5) * 0.08; const edge = Math.min(lx - 3, ly - 3, BW - lx, BH - ly);
      return [c[0] * k, c[1] * k, c[2] * k, 0.55 + Math.min(1, edge / 4) * 0.35 + f * 0.15, 0.78 + f * 0.15];
    }, 3.5);
  },
  // irregular ashlar blocks (old walls, bases, steps)
  stone: () => {
    const n = makeNoise(13), m = makeNoise(29), R = rng(19), rows = [], H0 = 0;
    for (let y = H0; y < N;) { const h = [48, 64, 80][Math.floor(R() * 3)]; const hh = Math.min(h, N - y); const cuts = [0]; for (let x = 0; x < N;) { x += 60 + Math.floor(R() * 70); if (x < N - 30) cuts.push(x); else break; } rows.push({ y, h: hh, cuts, tints: cuts.map(() => 0.82 + R() * 0.3) }); y += hh; }
    return bake('stone', (x, y) => {
      let r = rows[rows.length - 1]; for (const q of rows) if (y < q.y + q.h) { r = q; break; }
      let ci = 0; for (let i = 0; i < r.cuts.length; i++) if (x >= r.cuts[i]) ci = i;
      const x0 = r.cuts[ci], x1 = r.cuts[ci + 1] ?? N, ly = y - r.y, lx = x - x0;
      const e = Math.min(lx, x1 - x, ly, r.h - ly); const f = fbm(n, x / 22, y / 22, 4, N / 22, N / 22), g = m(x / 2.5, y / 2.5, N / 2.5, N / 2.5);
      if (e < 3) { const k = 0.62 + f * 0.2; return [150 * k, 144 * k, 134 * k, 0.05, 0.95]; }
      const k = r.tints[ci] * (0.78 + f * 0.3 + (g - 0.5) * 0.1); const bev = Math.min(1, (e - 3) / 6);
      return [196 * k, 186 * k, 168 * k, 0.45 + bev * 0.35 + f * 0.25, 0.8 + f * 0.12];
    }, 3.0);
  },
  // square cobbles ("sampietrini") for streets and squares
  cobble: () => {
    const n = makeNoise(37), m = makeNoise(6), R = rng(23), T = 64, tints = []; for (let i = 0; i < 64; i++) tints.push(0.75 + R() * 0.4);
    return bake('cobble', (x, y) => {
      const row = Math.floor(y / T), off = (row % 2) * T / 2, cx = Math.floor((x + off) / T), lx = (x + off) % T, ly = y % T;
      const e = Math.min(lx, ly, T - lx, T - ly); const f = fbm(n, x / 12, y / 12, 3, N / 12, N / 12), g = m(x / 2, y / 2, N / 2, N / 2);
      if (e < 4) { const k = 0.45 + f * 0.2; return [120 * k, 112 * k, 100 * k, 0.0, 1.0]; }
      const dome = Math.sin(Math.min(1, (e - 4) / 18) * Math.PI / 2); const k = tints[(cx * 7 + row * 13) % 64] * (0.8 + f * 0.3 + (g - 0.5) * 0.12);
      return [128 * k, 124 * k, 120 * k, 0.3 + dome * 0.6 + f * 0.1, 0.62 + f * 0.25 - dome * 0.08];
    }, 3.2);
  },
  woodFloor: () => {
    const n = makeNoise(17), R = rng(5), PW = 64, PL = 256, tints = []; for (let i = 0; i < 64; i++) tints.push(0.85 + R() * 0.3);
    return bake('woodFloor', (x, y) => {
      const col = Math.floor(x / PW), off = (col * 97) % PL, row = Math.floor((y + off) / PL), lx = x % PW, ly = (y + off) % PL;
      const seam = lx < 2 || ly < 2; const t = tints[(col * 7 + row * 3) % 64];
      const gr = fbm(n, x / 90 + col * 3, y / 6, 4) ; const ring = Math.sin((x * 0.09 + gr * 9 + col * 2) * 1.3) * 0.5 + 0.5;
      const k = t * (0.72 + ring * 0.18 + gr * 0.2) * (seam ? 0.55 : 1);
      return [168 * k, 112 * k, 66 * k, seam ? 0 : 0.6 + ring * 0.1, seam ? 0.9 : 0.42 + gr * 0.2];
    }, 1.6);
  },
  wood: () => { const n = makeNoise(23); return bake('wood', (x, y) => { const gr = fbm(n, x / 120, y / 7, 4, N / 120, N / 7); const ring = Math.sin((y * 0.11 + gr * 14)) * 0.5 + 0.5; const k = 0.7 + ring * 0.2 + gr * 0.2; return [140 * k, 88 * k, 50 * k, ring * 0.3, 0.45 + gr * 0.2]; }, 1.0); },
  tiles: () => { const n = makeNoise(41); const T = 128; return bake('tiles', (x, y) => { const lx = x % T, ly = y % T, e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly); const f = fbm(n, x / 40, y / 40, 3, N / 40, N / 40); if (e < 2) return [160, 156, 150, 0, 0.85]; const k = 0.95 + f * 0.06; return [232 * k, 228 * k, 220 * k, 1 - Math.max(0, 1 - (e - 2) / 3) * 0.5, 0.14 + f * 0.06]; }, 1.4); },
  terracotta: () => { const n = makeNoise(43), R = rng(3), tints = []; for (let i = 0; i < 32; i++) tints.push(0.85 + R() * 0.25); const T = 128; return bake('terracotta', (x, y) => { const lx = x % T, ly = y % T, e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly); const t = tints[(Math.floor(x / T) * 5 + Math.floor(y / T) * 3) % 32]; const f = fbm(n, x / 18, y / 18, 4, N / 18, N / 18); if (e < 3) return [150, 140, 128, 0, 0.95]; const k = t * (0.85 + f * 0.25); return [190 * k, 98 * k, 62 * k, 0.6 + f * 0.3, 0.75]; }, 2.4); },
  marble: () => { const n = makeNoise(57), m = makeNoise(14); return bake('marble', (x, y) => { const f = fbm(n, x / 60, y / 60, 5, N / 60, N / 60); const v = Math.abs(Math.sin((x + y * 0.6) / 40 + f * 9)); const vein = Math.pow(1 - v, 18); const g = m(x / 3, y / 3, N / 3, N / 3); const k = 0.95 - vein * 0.35 + (g - 0.5) * 0.03; return [236 * k, 232 * k, 226 * k, 0.5 + f * 0.1, 0.18 + vein * 0.2]; }, 0.6); },
  fabric: () => { const n = makeNoise(51); return bake('fabric', (x, y) => { const w = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5, f = fbm(n, x / 30, y / 30, 3, N / 30, N / 30); const k = 0.82 + w * 0.12 + f * 0.1; return [200 * k, 200 * k, 200 * k, w * 0.5, 0.92]; }, 1.4); },
  leather: () => { const n = makeNoise(53); return bake('leather', (x, y) => { const f = fbm(n, x / 6, y / 6, 4, N / 6, N / 6); const k = 0.8 + f * 0.25; return [120 * k, 70 * k, 42 * k, f, 0.5 + f * 0.25]; }, 1.8); },
  metal: () => { const n = makeNoise(61); return bake('metal', (x, y) => { const f = fbm(n, x / 200, y / 3, 3, N / 200, N / 3), g = n(x / 40, y / 40, N / 40, N / 40); const k = 0.85 + f * 0.15; return [200 * k, 202 * k, 206 * k, f * 0.1, 0.32 + f * 0.18 + g * 0.08]; }, 0.4); },
  grass: () => { const n = makeNoise(71), m = makeNoise(2); return bake('grass', (x, y) => { const f = fbm(n, x / 40, y / 40, 4, N / 40, N / 40), g = m(x / 1.5, y / 1.5, N / 1.5, N / 1.5); const k = 0.7 + f * 0.35 + (g - 0.5) * 0.25; return [70 * k, 112 * k, 44 * k, g * 0.6 + f * 0.4, 0.92]; }, 2.6); },
  asphalt: () => { const n = makeNoise(81), m = makeNoise(8); return bake('asphalt', (x, y) => { const f = fbm(n, x / 50, y / 50, 4, N / 50, N / 50), g = m(x, y, N, N); const pebble = g > 0.82 ? 1.25 : 1; const k = (0.32 + f * 0.12) * pebble; return [255 * k * 0.32, 255 * k * 0.32, 255 * k * 0.34, g * 0.5, 0.78 + f * 0.12]; }, 2.0); },
  concrete: () => { const n = makeNoise(91), m = makeNoise(12); return bake('concrete', (x, y) => { const f = fbm(n, x / 34, y / 34, 5, N / 34, N / 34), g = m(x / 2, y / 2, N / 2, N / 2); const k = 0.72 + f * 0.25 + (g - 0.5) * 0.06; return [168 * k, 166 * k, 160 * k, f * 0.5 + g * 0.1, 0.86]; }, 1.5); },
  roofTiles: () => { const n = makeNoise(93); const TW = 48, TH = 40; return bake('roofTiles', (x, y) => { const row = Math.floor(y / TH), lx = (x + (row % 2) * TW / 2) % TW, ly = y % TH; const curve = Math.sin(lx / TW * Math.PI); const f = fbm(n, x / 20, y / 20, 3, N / 20, N / 20); const sh = ly / TH; const k = (0.6 + curve * 0.35) * (0.75 + sh * 0.35) * (0.9 + f * 0.2); return [176 * k, 84 * k, 52 * k, curve * 0.7 + sh * 0.3, 0.72]; }, 3.0); },
};
const ALIAS = { tile: 'tiles', floor: 'woodFloor', paving: 'cobble', sampietrini: 'cobble', rock: 'stone', wall: 'plaster', roof: 'roofTiles', bricks: 'brick', cement: 'concrete' };
const canon = k => ALIAS[k] || k;
export const MAT_KINDS = [...Object.keys(GEN), 'chrome', 'glass', 'neon', ...Object.keys(ALIAS)];

/** Base textures of a kind ({map, normal, rough(R=height, G=roughness), avg, avgRough}), built on first request. */
export function matTex(kind) { kind = canon(kind); return texCache.get(kind) || (GEN[kind] ? GEN[kind]() : null); }

/** Bakes the textures of these kinds now (call during loading so nothing is generated mid-game). */
export function prebakeMaterials(kinds = Object.keys(GEN)) { for (const k of kinds) matTex(k); }

function variant(t, rep) { if (!rep || (rep[0] === 1 && rep[1] === 1)) return t; const v = t.clone(); v.repeat.set(rep[0], rep[1]); v.needsUpdate = true; allTex.add(v); return v; }

// ---------------- world-space (triplanar) mapping ----------------
// mode 'albedo': the texture is the surface (colour x tint); mode 'detail': only its relative light/dark,
// roughness and relief are added on top of the material's own colour/map (plain walls, painted wood…).
const TRI_VERT_DECL = 'varying vec3 vTriW;\nvarying vec3 vTriN;\n';
const TRI_VERT = `
  { vec4 triP = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
    triP = batchingMatrix * triP;
    #endif
    #ifdef USE_INSTANCING
    triP = instanceMatrix * triP;
    #endif
    vTriW = ( modelMatrix * triP ).xyz;
    vTriN = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz ); }
`;
const TRI_FRAG_DECL = `
uniform sampler2D triMap; uniform sampler2D triRH; uniform float triScale; uniform float triBump; uniform vec4 triMix;
varying vec3 vTriW; varying vec3 vTriN;
vec3 triWeights() { vec3 b = pow( abs( normalize( vTriN ) ), vec3( 4.0 ) ); return b / ( b.x + b.y + b.z + 1e-5 ); }
vec4 triSample( sampler2D t, vec3 w ) { vec3 p = vTriW * triScale; return texture2D( t, p.zy ) * w.x + texture2D( t, p.xz ) * w.y + texture2D( t, vec2( p.x, -p.y ) ) * w.z; }
vec3 triPerturb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir ) {
  vec3 vSigmaX = normalize( dFdx( surf_pos ) ), vSigmaY = normalize( dFdy( surf_pos ) );
  vec3 R1 = cross( vSigmaY, surf_norm ), R2 = cross( surf_norm, vSigmaX );
  float fDet = dot( vSigmaX, R1 ) * faceDir;
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * surf_norm - vGrad );
}
`;
function installTriplanar(m, T, { scale = 1, bump = 1, mode = 'albedo', albedo = 0.55, rough = 0.5 } = {}) {
  const avg = Math.max(0.02, T.avg), avgR = Math.max(0.05, T.avgRough);
  // triMix: x = albedo amount, y = roughness amount, z = 1/avg luminance, w = 1/avg roughness
  const U = { triMap: { value: T.map }, triRH: { value: T.rough }, triScale: { value: scale }, triBump: { value: bump }, triMix: { value: new THREE.Vector4(mode === 'albedo' ? 1 : albedo, mode === 'albedo' ? 1 : rough, 1 / avg, 1 / avgR) } };
  m.userData.tri = U; // live uniforms: tweak scale/bump at runtime without recompiling
  const albedoGLSL = mode === 'albedo'
    ? 'diffuseColor.rgb *= triA.rgb;'
    : 'diffuseColor.rgb *= mix( 1.0, clamp( dot( triA.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * triMix.z, 0.4, 1.6 ), triMix.x );';
  const roughGLSL = mode === 'albedo'
    ? 'roughnessFactor *= triRHs.g;'
    : 'roughnessFactor = clamp( roughnessFactor * mix( 1.0, triRHs.g * triMix.w, triMix.y ), 0.03, 1.0 );';
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + TRI_VERT_DECL)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + TRI_VERT);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + TRI_FRAG_DECL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n  vec3 triWt = triWeights(); vec4 triA = triSample( triMap, triWt ); vec4 triRHs = triSample( triRH, triWt );\n  ' + albedoGLSL)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  ' + roughGLSL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  { float triH = triRHs.r; normal = triPerturb( - vViewPosition, normal, vec2( dFdx( triH ), dFdy( triH ) ) * triBump, faceDirection ); }');
  };
  const prev = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
  m.customProgramCacheKey = () => 'tri:' + mode + (prev ? ':' + prev() : '');
  m.needsUpdate = true;
  return m;
}

/**
 * Adds world-space detail (relative albedo variation, roughness, relief) of a library kind to an existing
 * MeshStandard/Physical material, keeping its colour and maps. scale = tiles per metre.
 */
export function detailMaterial(m, kind, { scale = 1, bump = 1.2, albedo = 0.55, rough = 0.5 } = {}) {
  if (!m || !(m.isMeshStandardMaterial) || m.userData.tri) return m;
  const T = matTex(kind); if (!T) return m;
  return installTriplanar(m, T, { scale, bump, mode: 'detail', albedo, rough });
}

/** Cached material of a kind (see header). */
export function mat(kind, o = {}) {
  kind = canon(kind);
  const key = kind + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (kind === 'neon') {
    const c = new THREE.Color(o.color ?? 0xff3cac);
    m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.25), emissive: c, emissiveIntensity: o.intensity ?? 2.4, roughness: 0.4, toneMapped: true });
  } else if (kind === 'glass') {
    m = new THREE.MeshPhysicalMaterial({ color: o.color ?? 0xbfe4ff, roughness: o.roughness ?? 0.05, metalness: 0, transparent: true, opacity: o.opacity ?? 0.22, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5, side: o.side ?? THREE.FrontSide });
  } else if (kind === 'chrome') {
    m = new THREE.MeshStandardMaterial({ color: o.color ?? 0xdedede, metalness: 1, roughness: o.roughness ?? 0.16 });
  } else {
    const T = matTex(kind); if (!T) throw new Error('materials: unknown kind ' + kind);
    const metal = o.metalness ?? (kind === 'metal' ? 1 : 0);
    if (o.world) {
      m = new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff, roughness: o.roughness ?? 1, metalness: metal, side: o.side ?? THREE.FrontSide });
      installTriplanar(m, T, { scale: o.world, bump: o.bump ?? 1.5, mode: 'albedo' });
    } else {
      const rep = o.repeat || [1, 1];
      m = new THREE.MeshStandardMaterial({ map: variant(T.map, rep), normalMap: variant(T.normal, rep), roughnessMap: variant(T.rough, rep), color: o.color ?? 0xffffff, roughness: o.roughness ?? 1, metalness: metal, side: o.side ?? THREE.FrontSide });
      const ns = o.normalScale ?? 1; m.normalScale.set(ns, ns);
    }
  }
  m.name = 'lib:' + kind;
  matCache.set(key, m); return m;
}

/** Anisotropic filtering for every library texture. Set once at start-up (changing it re-uploads them all). */
export function setMaterialAnisotropy(n) { ANISO = n; for (const t of allTex) { if (t.anisotropy !== n) { t.anisotropy = n; t.needsUpdate = true; } } }
