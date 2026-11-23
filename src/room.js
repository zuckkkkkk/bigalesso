import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { rng, makeNoise, fbm, canvas, tex, normalFromHeight } from './util.js';

// ---------- stone ledgestone wall ----------
function stoneWallTextures() {
  const W = 1024, H = 512; // 3m x 1.5m
  const PXM = W / 3;
  const R = rng(42), noise = makeNoise(3), noise2 = makeNoise(11);
  const col = new Uint8ClampedArray(W * H * 4);
  const hgt = new Float32Array(W * H);
  const pal = [
    [168, 165, 158, 4], [184, 180, 172, 3], [140, 140, 140, 2], [190, 176, 152, 2], [172, 152, 124, 2],
    [158, 130, 104, 1], [128, 131, 136, 2], [198, 192, 182, 2], [150, 140, 128, 2], [136, 130, 122, 1]];
  const palW = pal.reduce((s, p) => s + p[3], 0);
  const pick = () => { let r = R() * palW; for (const p of pal) { if ((r -= p[3]) <= 0) return p; } return pal[0]; };
  // rows
  const rows = []; let y = 0;
  while (y < H) { let h = Math.round((0.032 + R() * 0.04) * PXM); if (H - y - h < 0.03 * PXM) h = H - y; rows.push([y, h]); y += h; }
  for (const [ry, rh] of rows) {
    let x = Math.floor(R() * W); const x0 = x;
    while (x < x0 + W) {
      let len = Math.round((0.1 + Math.pow(R(), 1.2) * 0.5) * PXM);
      if (x + len > x0 + W - 0.05 * PXM) len = x0 + W - x;
      const p = pick();
      const bri = 0.9 + R() * 0.18;
      const prot = 0.25 + R() * 0.75;
      const tilt = (R() - 0.5) * 0.6;
      const stain = R() < 0.3 ? R() : 0;
      const gap = 1 + (R() < 0.35 ? 1 : 0);
      const seedx = R() * 1000, seedy = R() * 1000;
      for (let yy = 0; yy < rh; yy++) {
        const py = ry + yy;
        for (let xx = 0; xx < len; xx++) {
          const px = (x + xx) % W;
          const i = py * W + px;
          const ex = Math.min(xx, len - 1 - xx), ey = Math.min(yy, rh - 1 - yy);
          const e = Math.min(ex, ey);
          if (e < gap) { // joint
            hgt[i] = 0.0 + noise(px * 0.3, py * 0.3, W * 0.3, H * 0.3) * 0.05;
            const g = 62 + (noise(px * 0.2, py * 0.2) * 30) | 0;
            col[i * 4] = g; col[i * 4 + 1] = g - 2; col[i * 4 + 2] = g - 4; col[i * 4 + 3] = 255;
            continue;
          }
          const bev = Math.min(1, (e - gap) / 4);
          const streak = fbm(noise, (seedx + xx) * 0.035, (seedy + yy) * 0.35, 3);
          const fine = noise2(px * 0.9, py * 0.9, W * 0.9, H * 0.9);
          const h = prot * 0.55 + streak * 0.5 + fine * 0.08 + tilt * (yy / rh - 0.5);
          hgt[i] = 0.15 + h * bev;
          let k = bri * (0.84 + streak * 0.3 + (fine - 0.5) * 0.14) * (0.88 + 0.12 * bev);
          let r = p[0] * k, g2 = p[1] * k, b = p[2] * k;
          if (stain) { const s = Math.max(0, fbm(noise2, (seedx + xx) * 0.02, (seedy + yy) * 0.08, 2) - 0.45) * 1.6 * stain; r += (175 - r) * s; g2 += (120 - g2) * s; b += (80 - b) * s; }
          col[i * 4] = r; col[i * 4 + 1] = g2; col[i * 4 + 2] = b; col[i * 4 + 3] = 255;
        }
      }
      x += len;
    }
  }
  const cc = canvas(W, H); const cx = cc.getContext('2d');
  cx.putImageData(new ImageData(col, W, H), 0, 0);
  const nc = normalFromHeight(hgt, W, H, 3.0, true);
  return { map: tex(cc, { repeat: [1, 1] }), normalMap: tex(nc, { srgb: false, repeat: [1, 1] }) };
}

// ---------- floor tiles ----------
function floorTextures() {
  const N = 1024; // 2x2 tiles of 0.6m => 1.2m
  const R = rng(9), noise = makeNoise(21);
  const cc = canvas(N, N), cx = cc.getContext('2d');
  const rc = canvas(N, N), rx = rc.getContext('2d');
  const hgt = new Float32Array(N * N);
  const img = cx.createImageData(N, N), d = img.data;
  const rimg = rx.createImageData(N, N), rd = rimg.data;
  const T = N / 2, grout = 3;
  const tint = [];
  for (let i = 0; i < 4; i++) tint.push([214 + R() * 8, 206 + R() * 7, 196 + R() * 6, R() * 100]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const tx = (x / T) | 0, ty = (y / T) | 0, lx = x % T, ly = y % T;
    const i = y * N + x, o = i * 4;
    const e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    if (e < grout) {
      const g = 150 + noise(x * 0.4, y * 0.4) * 20;
      d[o] = g; d[o + 1] = g - 3; d[o + 2] = g - 7; d[o + 3] = 255; hgt[i] = 0;
      rd[o] = rd[o + 1] = rd[o + 2] = 210; rd[o + 3] = 255; continue;
    }
    const t = tint[ty * 2 + tx];
    const v = fbm(noise, (x + t[3] * 13) * 0.006, (y + t[3] * 7) * 0.006, 4, N * 0.006, N * 0.006);
    const vein = Math.pow(1 - Math.abs(Math.sin((x * 0.004 + y * 0.002 + v * 3.5) * 6.28)), 18) * 0.06;
    const k = 0.975 + (v - 0.5) * 0.06 - vein;
    d[o] = t[0] * k; d[o + 1] = t[1] * k; d[o + 2] = t[2] * k; d[o + 3] = 255;
    hgt[i] = 1 - Math.max(0, 1 - (e - grout) / 3) * 0.6;
    const rough = 0.1 + (v - 0.5) * 0.06; rd[o] = rd[o + 1] = rd[o + 2] = rough * 255; rd[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0); rx.putImageData(rimg, 0, 0);
  const nc = normalFromHeight(hgt, N, N, 1.5, true);
  const rep = [10, 10];
  return { map: tex(cc, { repeat: rep }), roughnessMap: tex(rc, { srgb: false, repeat: rep }), normalMap: tex(nc, { srgb: false, repeat: rep }) };
}

function woodTexture(w = 1024, h = 256, seed = 5) {
  const noise = makeNoise(seed);
  const cc = canvas(w, h), cx = cc.getContext('2d');
  const img = cx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(noise, x * 0.004, y * 0.03, 4);
    const ring = Math.sin((y * 0.11 + n * 18) * 1.0) * 0.5 + 0.5;
    const fine = noise(x * 0.5, y * 2.5) * 0.12;
    const k = 0.72 + ring * 0.22 + fine + (n - 0.5) * 0.25;
    const o = (y * w + x) * 4;
    d[o] = 118 * k; d[o + 1] = 70 * k; d[o + 2] = 40 * k; d[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return tex(cc);
}

// ---------- reflective floor overlay ----------
function floorReflector(w, h, quality) {
  const shader = {
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, strength: { value: 0.55 }, texel: { value: new THREE.Vector2(1 / 512, 1 / 512) } },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vUv = textureMatrix * vec4(position,1.0); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float strength; uniform vec2 texel; varying vec4 vUv; varying vec3 vW;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec2 uv = vUv.xy / vUv.w;
        vec3 c = texture2D(tDiffuse, uv).rgb * 0.36;
        c += texture2D(tDiffuse, uv + vec2(texel.x*1.5, 0.)).rgb * 0.16;
        c += texture2D(tDiffuse, uv - vec2(texel.x*1.5, 0.)).rgb * 0.16;
        c += texture2D(tDiffuse, uv + vec2(0., texel.y*2.5)).rgb * 0.16;
        c += texture2D(tDiffuse, uv - vec2(0., texel.y*2.5)).rgb * 0.16;
        vec3 V = normalize(cameraPosition - vW);
        float f = 0.045 + 0.55 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
        // grout lines: no reflection
        vec2 g = abs(fract(vW.xz / 0.6) - 0.5);
        float grout = smoothstep(0.4968, 0.4985, max(g.x, g.y));
        gl_FragColor = vec4(c, f * strength * (1.0 - grout));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };
  const pr = Math.min(window.devicePixelRatio, 1.5);
  const ref = new Reflector(new THREE.PlaneGeometry(w, h), {
    shader, textureWidth: innerWidth * pr * quality, textureHeight: innerHeight * pr * quality, clipBias: 0.002, multisample: 0
  });
  ref.material.transparent = true; ref.material.depthWrite = false;
  ref.material.uniforms.texel.value.set(1 / (innerWidth * pr * quality), 1 / (innerHeight * pr * quality));
  ref.rotation.x = -Math.PI / 2; ref.position.y = 0.0008; ref.renderOrder = 1;
  return ref;
}

// ---------- typewriter ----------
function typewriter() {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const crinkle = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.18 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.85 });
  const keyMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.2, clearcoat: 1 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(new RoundedBoxGeometry(0.31, 0.05, 0.26, 4, 0.014), paint, 0, 0.03, 0);
  // feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.012, 0.014, 0.008, 12), rubber, sx * 0.13, 0.004, sz * 0.105);
  // sloped keyboard deck
  add(new RoundedBoxGeometry(0.30, 0.03, 0.14, 3, 0.01), crinkle, 0, 0.07, 0.045, 0.32);
  // rear body / top cover
  add(new RoundedBoxGeometry(0.29, 0.075, 0.11, 4, 0.02), paint, 0, 0.09, -0.07);
  // front frame arch where typebars live
  add(new THREE.TorusGeometry(0.075, 0.008, 8, 24, Math.PI), paint, 0, 0.105, 0.0, -Math.PI / 2 + 0.25, 0, 0);
  // typebars (fan)
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0018, 0.0012, 0.06), chrome, 34);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 34; i++) {
    const a = -Math.PI / 2 + (i / 33) * Math.PI;
    e.set(0.22, a * 0.9, 0); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(Math.sin(a) * 0.05, 0.1, -0.005 - Math.cos(a) * 0.02 + 0.03), q, new THREE.Vector3(1, 1, 1));
    bars.setMatrixAt(i, m4);
  }
  bars.castShadow = true; g.add(bars);
  // keys
  const rows = [11, 11, 10, 9];
  const nKeys = rows.reduce((a, b) => a + b, 0);
  const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.004, 18), keyMat, nKeys);
  const rims = new THREE.InstancedMesh(new THREE.TorusGeometry(0.0078, 0.0011, 6, 18), chrome, nKeys);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, 6), chrome, nKeys);
  let k = 0;
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.022 + (r % 2) * 0.006;
      const z = 0.02 + r * 0.021, y = 0.1 - r * 0.011;
      m4.makeTranslation(x, y, z); caps.setMatrixAt(k, m4);
      m4.compose(new THREE.Vector3(x, y + 0.0015, z), q.setFromEuler(e.set(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)); rims.setMatrixAt(k, m4);
      m4.makeTranslation(x, y - 0.012, z); stems.setMatrixAt(k, m4);
      k++;
    }
  });
  for (const im of [caps, rims, stems]) { im.castShadow = true; g.add(im); }
  add(new THREE.BoxGeometry(0.17, 0.006, 0.012), chrome, 0, 0.055, 0.118);
  // carriage
  const platen = add(new THREE.CylinderGeometry(0.019, 0.019, 0.34, 28), rubber, 0, 0.145, -0.055, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.021, 0.021, 0.018, 24), paint, s * 0.18, 0.145, -0.055, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 12), chrome, s * 0.2, 0.145, -0.055, 0, 0, Math.PI / 2);
  }
  add(new THREE.BoxGeometry(0.36, 0.012, 0.03), chrome, 0, 0.128, -0.085);
  // paper support plate
  add(new THREE.BoxGeometry(0.3, 0.003, 0.09), paint, 0, 0.18, -0.1, -0.95);
  // return lever
  const lever = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.17, 0.15, -0.04), new THREE.Vector3(-0.19, 0.17, 0.0), new THREE.Vector3(-0.16, 0.175, 0.05)]);
  add(new THREE.TubeGeometry(lever, 16, 0.003, 8), chrome, 0, 0, 0);
  // ribbon spools
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 28), chrome, s * 0.09, 0.131, -0.075);
    add(new THREE.CylinderGeometry(0.024, 0.024, 0.009, 24), rubber, s * 0.09, 0.133, -0.075);
  }
  return g;
}

// ---------- shell (logarithmic spiral) ----------
function shell() {
  const turns = 3.0, segU = 220, segV = 26;
  const pos = [], nor = [], uv = [], idx = [];
  const a = 0.0042, b = 0.143;
  for (let i = 0; i <= segU; i++) {
    const t = (i / segU) * turns * Math.PI * 2;
    const r0 = a * Math.exp(b * t);
    const cx = Math.cos(t) * r0, cz = Math.sin(t) * r0, cy = 0;
    const tr = r0 * 0.43;
    const T = new THREE.Vector3(-Math.sin(t), 0, Math.cos(t));
    const N = new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
    const B = new THREE.Vector3(0, 1, 0);
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * Math.PI * 2;
      const rib = 1 + 0.07 * Math.pow(Math.abs(Math.sin(t * 9)), 4);
      const rr = tr * rib;
      const p = new THREE.Vector3(cx, cy, cz).addScaledVector(N, Math.cos(v) * rr).addScaledVector(B, Math.sin(v) * rr * 0.8);
      pos.push(p.x, p.y, p.z);
      const n = N.clone().multiplyScalar(Math.cos(v)).addScaledVector(B, Math.sin(v)).normalize();
      nor.push(n.x, n.y, n.z); uv.push(i / segU, j / segV);
    }
  }
  for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) {
    const A = i * (segV + 1) + j, B2 = A + segV + 1;
    idx.push(A, B2, A + 1, B2, B2 + 1, A + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const c = canvas(512, 64), x = c.getContext('2d');
  for (let i = 0; i < 512; i++) { const k = 0.8 + 0.2 * Math.sin(i * 0.3) + Math.random() * 0.06; x.fillStyle = `rgb(${215 * k | 0},${208 * k | 0},${196 * k | 0})`; x.fillRect(i, 0, 1, 64); }
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex(c), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: 0xffeedd }));
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); m.rotation.set(Math.PI / 2 - 0.25, 0, 0.3);
  return g;
}

// ---------- extinguisher + red stand ----------
function extinguisher() {
  const g = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ color: 0xb50d10, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
  const redStand = new THREE.MeshPhysicalMaterial({ color: 0xc8141a, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.22 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const tube = (pts, r = 0.0125, mat = redStand) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.1), 64, r, 12), mat, 0, 0, 0);
  // stand: pole and base
  tube([[0, 0.02, -0.08], [0, 1.0, -0.08], [0, 2.3, -0.08]], 0.015);
  tube([[-0.26, 0.015, -0.1], [-0.1, 0.015, -0.1], [0.1, 0.015, -0.1], [0.26, 0.015, -0.1]], 0.014);
  tube([[0, 0.015, -0.1], [0.0, 0.015, 0.15], [0.02, 0.02, 0.32], [0.0, 0.03, 0.42]], 0.014);
  tube([[-0.25, 0.015, -0.1], [-0.27, 0.06, -0.1], [-0.26, 0.12, -0.08]], 0.012);
  tube([[0.25, 0.015, -0.1], [0.27, 0.06, -0.1], [0.26, 0.12, -0.08]], 0.012);
  // cradle ring + support arm
  add(new THREE.TorusGeometry(0.092, 0.008, 10, 40), redStand, 0, 0.36, 0.035, Math.PI / 2);
  tube([[0, 0.36, -0.08], [0, 0.36, -0.06]], 0.01);
  tube([[0, 0.31, -0.08], [0, 0.3, 0.035]], 0.009);
  add(new THREE.TorusGeometry(0.06, 0.007, 8, 24, Math.PI), redStand, 0, 0.92, -0.02, 0, 0, 0);
  // extinguisher body
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; const y = 0.33 + t * 0.5; let r = 0.085; if (t > 0.86) { const k = (t - 0.86) / 0.14; r = 0.085 * Math.cos(k * 1.2); } if (t < 0.03) r = 0.08 + t * 0.15; pts.push(new THREE.Vector2(Math.max(0.025, r), y)); }
  add(new THREE.LatheGeometry(pts, 48), red, 0, 0, 0.035);
  add(new THREE.CylinderGeometry(0.083, 0.083, 0.03, 40), black, 0, 0.335, 0.035);
  // label
  const lc = canvas(512, 512), lx = lc.getContext('2d');
  lx.fillStyle = '#f2efe8'; lx.fillRect(0, 0, 512, 512);
  lx.fillStyle = '#c00'; lx.fillRect(0, 0, 512, 70);
  lx.fillStyle = '#fff'; lx.font = 'bold 44px Arial'; lx.textAlign = 'center'; lx.fillText('ESTINTORE', 256, 52);
  lx.fillStyle = '#111'; lx.font = 'bold 36px Arial'; lx.fillText('A POLVERE  6 kg', 256, 118);
  lx.font = '22px Arial'; for (let i = 0; i < 7; i++) { lx.fillRect(40, 150 + i * 30, 300 - i * 25, 6); }
  ['#1c6', '#36c', '#fc0'].forEach((c, i) => { lx.fillStyle = c; lx.fillRect(60 + i * 140, 380, 110, 90); lx.fillStyle = '#fff'; lx.font = 'bold 60px Arial'; lx.fillText('ABC'[i], 115 + i * 140, 448); });
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0862, 0.0862, 0.2, 40, 1, true, -0.9, 1.8), new THREE.MeshPhysicalMaterial({ map: tex(lc), roughness: 0.45, clearcoat: 0.5 }));
  label.position.set(0, 0.55, 0.035); label.rotation.y = 0.2; g.add(label);
  // valve head
  add(new THREE.CylinderGeometry(0.024, 0.03, 0.04, 20), black, 0, 0.845, 0.035);
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 16), chrome, 0, 0.885, 0.035);
  add(new THREE.BoxGeometry(0.15, 0.012, 0.03), chrome, -0.03, 0.915, 0.035, 0, 0, 0.18);
  add(new THREE.BoxGeometry(0.13, 0.01, 0.028), black, -0.035, 0.895, 0.035, 0, 0, 0.05);
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 20), black, 0.032, 0.88, 0.055, Math.PI / 2);
  add(new THREE.CircleGeometry(0.015, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }), 0.032, 0.88, 0.061);
  // hose
  tube([[0.02, 0.87, 0.0], [0.07, 0.86, -0.02], [0.1, 0.7, 0.0], [0.095, 0.48, 0.04], [0.09, 0.42, 0.09]], 0.009, black);
  add(new THREE.CylinderGeometry(0.012, 0.016, 0.05, 14), black, 0.09, 0.405, 0.1);
  // wall sign at top
  const sc = canvas(256, 256), sx = sc.getContext('2d');
  sx.fillStyle = '#c4151c'; sx.fillRect(0, 0, 256, 256); sx.fillStyle = '#fff';
  sx.fillRect(108, 70, 44, 130); sx.fillRect(96, 54, 60, 20); sx.beginPath(); sx.moveTo(150, 60); sx.lineTo(196, 40); sx.lineTo(196, 56); sx.fill();
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.005), [black, black, black, black, new THREE.MeshStandardMaterial({ map: tex(sc), roughness: 0.4 }), black]);
  sign.position.set(0, 2.05, -0.06); g.add(sign);
  return g;
}

// ---------- the room ----------
export function buildRoom(scene, opts) {
  const room = new THREE.Group(); scene.add(room);
  const wall = stoneWallTextures();
  const wallMat = new THREE.MeshStandardMaterial({ map: wall.map, normalMap: wall.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.92 });
  const setRep = (m, sx, sy) => { const mm = m.clone(); mm.map = m.map.clone(); mm.map.repeat.set(sx, sy); mm.map.needsUpdate = true; mm.normalMap = m.normalMap.clone(); mm.normalMap.repeat.set(sx, sy); mm.normalMap.needsUpdate = true; return mm; };
  // with opts.level the room is part of a bigger level (world.js builds the other walls/ceiling):
  // the back wall is trimmed to the room (x -3.6..4.2) with the texture offset so it looks identical.
  const lvl = !!opts.level;
  const back = lvl ? new THREE.Mesh(new THREE.PlaneGeometry(7.8, 3.2), setRep(wallMat, 7.8 / 3, 3.2 / 1.5)) : new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), setRep(wallMat, 3, 3.2 / 1.5));
  if (lvl) { back.material.map.offset.x = 0.6 / 3; back.material.normalMap.offset.x = 0.6 / 3; }
  back.position.set(0.3, 1.6, 0); back.receiveShadow = true; room.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.2), setRep(wallMat, 7 / 3, 3.2 / 1.5));
  left.position.set(-3.6, 1.6, 3.5); left.rotation.y = Math.PI / 2; left.receiveShadow = true; room.add(left);
  const plaster = new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.95 });
  if (!lvl) {
    const right = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.2), plaster); right.position.set(4.2, 1.6, 3.5); right.rotation.y = -Math.PI / 2; room.add(right);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), plaster); front.position.set(0.3, 1.6, 7); front.rotation.y = Math.PI; room.add(front);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), plaster); ceil.position.set(0.3, 3.2, 3.5); ceil.rotation.x = Math.PI / 2; room.add(ceil);
  }

  const fl = floorTextures();
  const floorMat = new THREE.MeshStandardMaterial({ map: fl.map, roughnessMap: fl.roughnessMap, normalMap: fl.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(lvl ? new THREE.PlaneGeometry(7.95, 7.15) : new THREE.PlaneGeometry(12, 12), floorMat);
  if (lvl) { for (const t of [fl.map, fl.roughnessMap, fl.normalMap]) { t.repeat.set(7.95 / 1.2, 7.15 / 1.2); t.offset.set(((-3.6 + 5.7) / 1.2) % 1, ((9.5 - 7.15) / 1.2) % 1); } } // same tile grid as the old 12x12 floor
  floor.rotation.x = -Math.PI / 2; floor.position.set(lvl ? 0.3 + 0.075 : 0.3, 0, lvl ? 3.5 + 0.075 : 3.5); floor.receiveShadow = true; room.add(floor);
  let reflector = null;
  if (opts.reflections) { reflector = floorReflector(7.8, 7, opts.reflQuality); reflector.position.set(0.3, 0.0008, 3.5); room.add(reflector); }

  // ---- table (mid-century wood + glass) ----
  const table = new THREE.Group(); table.position.set(-1.42, 0, 0.36); room.add(table);
  const wood = new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const tb = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.006), wood); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; table.add(m); return m; };
  tb(0.055, 0.42, 0.44, -0.4, 0.21, 0);
  tb(0.055, 0.42, 0.44, 0.4, 0.21, 0);
  tb(0.75, 0.04, 0.42, 0, 0.12, 0);
  tb(0.05, 0.28, 0.4, -0.05, 0.28, 0);
  tb(0.8, 0.045, 0.05, 0, 0.41, -0.19);
  tb(0.8, 0.045, 0.05, 0, 0.41, 0.19);
  const glass = new THREE.Mesh(new RoundedBoxGeometry(0.98, 0.012, 0.52, 2, 0.004), new THREE.MeshPhysicalMaterial({ color: 0xcfeadf, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3, depthWrite: false }) /* perf: fake glass, no transmission pass */);
  glass.position.set(0, 0.442, 0); glass.receiveShadow = true; table.add(glass);
  const tw = typewriter(); tw.position.set(0.05, 0.448, -0.02); tw.rotation.y = 0.12; table.add(tw);
  const sh = shell(); sh.position.set(0.27, 0.52, 0.1); sh.rotation.y = -0.5; table.add(sh);

  // ---- wall clock (real local time, self-updating) ----
  const clock = new THREE.Group(); clock.position.set(-1.38, 1.95, 0.03); room.add(clock);
  const cc = canvas(512, 512), cx2 = cc.getContext('2d');
  cx2.fillStyle = '#f4f1ea'; cx2.beginPath(); cx2.arc(256, 256, 250, 0, 7); cx2.fill();
  cx2.fillStyle = '#1a1a1a';
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, L = i % 5 ? 14 : 38, w = i % 5 ? 4 : 10; cx2.save(); cx2.translate(256, 256); cx2.rotate(a); cx2.fillRect(-w / 2, -236, w, L); cx2.restore(); }
  cx2.font = 'bold 34px Arial'; cx2.textAlign = 'center'; cx2.fillText('BIGALESSO', 256, 170); cx2.font = '22px Arial'; cx2.fillText('ROMA', 256, 352);
  const rimMat = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.3, clearcoat: 1 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.012, 12, 48), rimMat); rim.position.z = 0.012; rim.castShadow = true; clock.add(rim);
  const cBack = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.025, 48), rimMat); cBack.rotation.x = Math.PI / 2; cBack.castShadow = true; clock.add(cBack);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.152, 48), new THREE.MeshStandardMaterial({ map: tex(cc), roughness: 0.6 })); face.position.z = 0.0128; clock.add(face);
  const handMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const mkHand = (len, w, z, mat = handMat) => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.002), mat); m.position.y = len / 2 - 0.015; g.add(m); g.position.z = z; clock.add(g); return g; };
  const hH = mkHand(0.085, 0.009, 0.016), hM = mkHand(0.125, 0.006, 0.018), hS = mkHand(0.135, 0.002, 0.02, new THREE.MeshStandardMaterial({ color: 0xc81e1e }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 16), handMat); cap.rotation.x = Math.PI / 2; cap.position.z = 0.022; clock.add(cap);
  const glassC = new THREE.Mesh(new THREE.CircleGeometry(0.152, 48), new THREE.MeshPhysicalMaterial({ color: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, roughness: 0.05, envMapIntensity: 1.2 })); glassC.position.z = 0.024; clock.add(glassC);
  face.onBeforeRender = () => {
    const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    const tick = Math.floor(s) + Math.min(1, (s % 1) * 8) ** 0.5; // little second-hand snap
    hS.rotation.z = -tick / 60 * Math.PI * 2; hM.rotation.z = -m / 60 * Math.PI * 2; hH.rotation.z = -h / 12 * Math.PI * 2;
  };

  // ---- extinguisher ----
  const ext = extinguisher(); ext.position.set(1.62, 0, 0.13); ext.rotation.y = -0.25; room.add(ext);

  return { room, floor, reflector, table, back, clock };
}

export function powerCable(points) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.0035, 8), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.55 }));
  m.castShadow = true; return m;
}
