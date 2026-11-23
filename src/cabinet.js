import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvas, tex, rng, makeNoise } from './util.js';

const W = 0.64, T = 0.018, IW = W - 2 * T; // outer width, panel thickness, inner width

// pixel camo (control panel / apron) in the purple-lime palette of the art
function camo(w, h, cells, seed, mode, pal) {
  const P = pal || ['#120a1c', '#2d1046', '#5a1f8f', '#8c2fc4', '#4f6e14', '#9fd21f', '#c8f03c', '#d14be0'];
  const c = canvas(w, h), x = c.getContext('2d');
  const n = makeNoise(seed), R = rng(seed);
  const cw = w / cells, rows = Math.ceil(h / cw);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cells; i++) {
    let v = n(i * 0.16, j * 0.22) * 0.65 + n(i * 0.5, j * 0.5) * 0.35;
    if (mode === 'apron') v = v * 0.7 + (Math.sin(j / rows * Math.PI * 2.2 + n(i * 0.1, 3) * 3) * 0.5 + 0.5) * 0.3;
    let col;
    if (v < 0.32) col = P[0];
    else if (v < 0.43) col = P[1];
    else if (v < 0.55) col = P[2];
    else if (v < 0.6) col = P[3];
    else if (v < 0.66) col = P[4];
    else if (v < 0.76) col = P[5];
    else col = P[6];
    if (R() < 0.03) col = P[7];
    x.fillStyle = col; x.fillRect(Math.floor(i * cw), Math.floor(j * cw), Math.ceil(cw), Math.ceil(cw));
  }
  return c;
}

function sideShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) s.quadraticCurveTo(p[2], p[3], p[0], p[1]); else s.lineTo(p[0], p[1]);
  }
  s.closePath();
  return s;
}

const crtShader = {
  uniforms: { tex: { value: null }, power: { value: 1 }, time: { value: 0 }, bright: { value: 1.55 }, flick: { value: 0 }, crisp: { value: 0 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tex; uniform float power, time, bright, flick, crisp; varying vec2 vUv;
    vec2 curve(vec2 uv){ uv = uv*2.0-1.0; vec2 o = abs(uv.yx)/vec2(5.5,4.5); uv += uv*o*o; return uv*0.5+0.5; }
    void main(){
      vec2 uv = curve(vUv);
      vec3 glass = vec3(0.018,0.02,0.019);
      if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor = vec4(glass*0.4,1.0);
        #include <colorspace_fragment>
        return; }
      // power-on: line then open vertically
      float p = power;
      float vy = clamp(p*2.0-1.0, 0.0, 1.0);
      float hx = clamp(p*3.0, 0.0, 1.0);
      vec2 cuv = uv;
      float on = 1.0;
      if(p < 1.0){
        float hh = max(vy, 0.004);
        cuv.y = (uv.y-0.5)/hh + 0.5;
        float lineMask = step(abs(uv.y-0.5), hh*0.5) * step(abs(uv.x-0.5), hx*0.5);
        on = lineMask;
      }
      vec2 px = vec2(1.0/320.0, 1.0/240.0);
      float ca = 0.35*px.x*(1.0-0.75*crisp); // crisp: camera inside the cabinet -> sharper text
      vec3 c;
      c.r = texture2D(tex, cuv + vec2(ca,0.0)).r;
      c.g = texture2D(tex, cuv).g;
      c.b = texture2D(tex, cuv - vec2(ca,0.0)).b;
      // soft glow from neighbours
      vec3 gl = texture2D(tex, cuv + px*vec2(1.5,0.0)).rgb + texture2D(tex, cuv - px*vec2(1.5,0.0)).rgb + texture2D(tex, cuv + px*vec2(0.0,1.5)).rgb + texture2D(tex, cuv - px*vec2(0.0,1.5)).rgb;
      c = c*0.82 + gl*0.07;
      // scanlines (fade out when too small on screen to avoid moire)
      float sl = sin(cuv.y*240.0*3.14159265);
      float d = fwidth(cuv.y*240.0);
      float scan = mix(mix(0.62, 0.84, crisp) + mix(0.38, 0.16, crisp)*sl*sl, 1.0, clamp(d*1.6-0.6, 0.0, 1.0));
      // aperture grille
      float gx = fract(gl_FragCoord.x/3.0);
      vec3 mask = vec3(gx<0.34?1.0:0.86, (gx>=0.34&&gx<0.67)?1.0:0.86, gx>=0.67?1.0:0.86);
      c *= scan * mix(vec3(1.0), mask, 0.5*(1.0-crisp));
      float vig = pow(16.0*uv.x*uv.y*(1.0-uv.x)*(1.0-uv.y), 0.22);
      float roll = fract(time*0.11);
      float band = smoothstep(0.0, 0.05, uv.y - roll + 0.05) * smoothstep(0.12, 0.05, uv.y - roll + 0.05);
      c *= vig * bright * (1.0 - flick*0.08*sin(time*120.0)) * (1.0 + 0.035*band) * (0.985 + 0.015*sin(time*377.0));
      if(p < 1.0){ c = mix(vec3(1.4), c, vy) * on; c += vec3(1.6)*on*(1.0-hx*0.5)*(1.0-vy); }
      c += glass;
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

export function buildCabinet(textures, opts = {}) {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.55 });
  const blackGloss = new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.25, clearcoat: 0.6 });
  const yellow = new THREE.MeshPhysicalMaterial({ color: opts.trim ?? 0xf2c400, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };

  // ---------- side panels ----------
  const prof = [
    [0, 0.402], [0.64, 0.402], [0.64, 0.80], [0.80, 0.86], [0.80, 0.94], [0.78, 0.958, 0.80, 0.958], [0.60, 1.006], [0.575, 1.03],
    [0.52, 1.49], [0.605, 1.585, 0.55, 1.56], [0.625, 1.77], [0.595, 1.80, 0.625, 1.80], [0, 1.80]];
  const shape = sideShape(prof);
  const extr = { depth: T - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 2, curveSegments: 10 };
  const sideTex = textures.side; sideTex.wrapS = sideTex.wrapT = THREE.ClampToEdgeWrapping;
  sideTex.repeat.set(-1 / 0.63, 1 / 1.40); sideTex.offset.set(1, -0.40 / 1.40);
  const sideMat = new THREE.MeshPhysicalMaterial({ map: sideTex, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.25 });
  const baseTex = textures.baseSide; baseTex.repeat.set(-1 / 0.70, 1 / 0.40); baseTex.offset.set(1, 0);
  const baseSideMat = new THREE.MeshPhysicalMaterial({ map: baseTex, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.25 });
  const bshape = sideShape([[0, 0.004], [0.70, 0.004], [0.70, 0.396], [0, 0.396]]);
  for (const s of [-1, 1]) {
    for (const [shp, mat] of [[shape, sideMat], [bshape, baseSideMat]]) {
      const geo = new THREE.ExtrudeGeometry(shp, extr);
      geo.rotateY(-Math.PI / 2); // extrude toward -x, shape x -> z
      const m = new THREE.Mesh(geo, [mat, yellow]);
      m.castShadow = m.receiveShadow = true;
      m.position.x = s > 0 ? W / 2 - 0.002 : -W / 2 + T - 0.002;
      g.add(m);
      const ig = new THREE.ShapeGeometry(shp, 10); ig.rotateY(-Math.PI / 2);
      const inner = new THREE.Mesh(ig, black);
      inner.position.x = s * (W / 2 - T - 0.0015);
      if (s < 0) inner.scale.x = -1;
      g.add(inner);
    }
  }

  // ---------- front structure ----------
  const boxMats = (front) => [black, black, black, black, front, black];
  // base front with mushroom art
  const bfMat = new THREE.MeshPhysicalMaterial({ map: textures.baseFront, roughness: 0.42, clearcoat: 0.45 });
  add(new THREE.BoxGeometry(IW, 0.392, 0.018), boxMats(bfMat), 0, 0.2, 0.70 - 0.009);
  add(new THREE.BoxGeometry(IW, 0.012, 0.07), black, 0, 0.396, 0.665);
  add(new THREE.BoxGeometry(W - 0.004, 0.012, 0.014), yellow, 0, 0.398, 0.70);
  add(new THREE.BoxGeometry(W - 0.004, 0.01, 0.014), yellow, 0, 0.006, 0.70);
  // lower body (coin door section)
  const lam = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.62 });
  add(new THREE.BoxGeometry(IW, 0.41, 0.018), lam, 0, 0.605, 0.64 - 0.009);
  // coin door
  const cd = new THREE.Group(); cd.position.set(0, 0.615, 0.64); g.add(cd);
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0x111113, roughness: 0.38, clearcoat: 0.3 });
  add(new RoundedBoxGeometry(0.27, 0.37, 0.014, 3, 0.014), plastic, 0, -0.005, 0.007, cd);
  add(new RoundedBoxGeometry(0.225, 0.31, 0.012, 3, 0.012), new THREE.MeshPhysicalMaterial({ color: 0x1a1a1d, roughness: 0.42, clearcoat: 0.3 }), 0, -0.01, 0.016, cd);
  const coinLight = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2a2a, emissiveIntensity: 1.6, roughness: 0.3 });
  const coinLights = [];
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(0.062, 0.062, 0.01, 2, 0.006), blackGloss, s * 0.05, 0.11, 0.022, cd);
    coinLights.push(add(new THREE.BoxGeometry(0.04, 0.042, 0.006), coinLight, s * 0.05, 0.11, 0.026, cd));
    for (let r = 0; r < 3; r++) add(new THREE.BoxGeometry(0.055, 0.005, 0.006), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }), s * 0.05, 0.01 - r * 0.055, 0.023, cd);
  }
  // control panel underside
  const under = add(new THREE.BoxGeometry(IW, 0.012, 0.17), black, 0, 0.83, 0.72);
  under.rotation.x = -Math.atan2(0.06, 0.16);
  // apron (front of control panel)
  const apronTex = tex(camo(1024, 160, 110, 77, 'apron', opts.palette), { nearest: true });
  add(new THREE.BoxGeometry(IW, 0.094, 0.02), boxMats(new THREE.MeshPhysicalMaterial({ map: apronTex, roughness: 0.4, clearcoat: 0.5 })), 0, 0.907, 0.79);
  add(new THREE.BoxGeometry(W - 0.004, 0.008, 0.024), yellow, 0, 0.957, 0.795);
  add(new THREE.BoxGeometry(W - 0.004, 0.008, 0.024), yellow, 0, 0.859, 0.795);
  // control panel top (sloped)
  const th = Math.atan2(0.05, 0.2), cpLen = 0.208;
  const cp = new THREE.Group(); cp.rotation.x = th; cp.position.set(0, 0.981, 0.70); g.add(cp);
  const cpTex = tex(camo(1024, 352, 120, 31, 'panel', opts.palette), { nearest: true });
  add(new THREE.BoxGeometry(IW, 0.02, cpLen), boxMats(black).map((m, i) => i === 2 ? new THREE.MeshPhysicalMaterial({ map: cpTex, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }) : m), 0, -0.01, 0, cp);
  // controls
  const btnMat = c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const COLORS = { red: 0xd41c24, white: 0xf1f1ee, blue: 0x1f45d6 };
  const buttons = {};
  const mkButton = (name, color, x, z, r = 0.0145) => {
    const b = new THREE.Group(); b.position.set(x, 0, z); cp.add(b);
    const m = btnMat(COLORS[color]);
    add(new THREE.CylinderGeometry(r + 0.0035, r + 0.004, 0.006, 28), m, 0, 0.003, 0, b);
    const cap = add(new THREE.CylinderGeometry(r, r, 0.01, 28), m, 0, 0.007, 0, b);
    buttons[name] = { group: b, cap, base: 0.007 };
  };
  const mkStick = (x, z) => {
    const base = new THREE.Group(); base.position.set(x, 0, z); cp.add(base);
    add(new THREE.CylinderGeometry(0.022, 0.024, 0.003, 28), blackGloss, 0, 0.0015, 0, base);
    const piv = new THREE.Group(); piv.position.y = 0.002; base.add(piv);
    add(new THREE.CylinderGeometry(0.0042, 0.0042, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 1, roughness: 0.25 }), 0, 0.025, 0, piv);
    const ball = add(new THREE.SphereGeometry(0.0175, 32, 24), new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.18, clearcoat: 1 }), 0, 0.063, 0, piv);
    return { base, piv, ball };
  };
  const stick1 = mkStick(-0.215, 0.006);
  const stick2 = mkStick(0.0, 0.006);
  [['p1a', 'red', -0.137, -0.03], ['p1b', 'white', -0.095, -0.036], ['p1c', 'blue', -0.053, -0.03],
   ['p1d', 'red', -0.153, 0.014], ['p1e', 'white', -0.111, 0.008], ['p1f', 'blue', -0.069, 0.014],
   ['p2a', 'red', 0.079, -0.03], ['p2b', 'white', 0.121, -0.036], ['p2c', 'blue', 0.163, -0.03],
   ['p2d', 'red', 0.063, 0.014], ['p2e', 'white', 0.105, 0.008], ['p2f', 'blue', 0.147, 0.014]].forEach(b => mkButton(...b));
  mkButton('start1', 'white', -0.1, -0.078, 0.0105);
  mkButton('start2', 'white', 0.115, -0.078, 0.0105);

  // riser between panel and bezel
  const riser = add(new THREE.BoxGeometry(IW, 0.04, 0.012), black, 0, 1.016, 0.588); riser.rotation.x = -0.7;
  // ---------- screen bezel + CRT ----------
  const bzLen = Math.hypot(0.055, 0.46), bzAng = Math.atan2(0.055, 0.46);
  const bz = new THREE.Group(); bz.position.set(0, (1.03 + 1.49) / 2, (0.575 + 0.52) / 2 - 0.004); bz.rotation.x = -bzAng; g.add(bz);
  add(new THREE.BoxGeometry(IW, bzLen, 0.01), blackGloss, 0, 0, -0.005, bz);
  // screen surround (slight recess frame)
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.7 });
  for (const [w, h, x, y] of [[0.56, 0.02, 0, 0.212], [0.56, 0.02, 0, -0.212], [0.02, 0.44, 0.278, 0], [0.02, 0.44, -0.278, 0]]) add(new THREE.BoxGeometry(w, h, 0.012), frameMat, x, y, 0.004, bz);
  const sg = new THREE.PlaneGeometry(0.53, 0.3975, 40, 30);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) { const u = sp.getX(i) / 0.265, v = sp.getY(i) / 0.19875; sp.setZ(i, 0.013 * (1 - 0.5 * (u * u + v * v))); }
  sg.computeVertexNormals();
  const screenMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(crtShader.uniforms), vertexShader: crtShader.vertexShader, fragmentShader: crtShader.fragmentShader, toneMapped: true });
  screenMat.uniforms.tex.value = textures.screen;
  const screen = add(sg, screenMat, 0, 0, 0.0, bz); screen.castShadow = false;
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.03 });
  const glass = add(new THREE.PlaneGeometry(0.6, 0.455), glassMat, 0, 0, 0.02, bz); glass.castShadow = false; glass.receiveShadow = false;

  // ---------- marquee ----------
  const mqAng = Math.atan2(0.02, 0.215);
  const mq = new THREE.Group(); mq.position.set(0, 1.6925, 0.615); mq.rotation.x = mqAng; g.add(mq);
  add(new THREE.BoxGeometry(IW, 0.215, 0.012), black, 0, 0, -0.006, mq);
  const marqueeMat = new THREE.MeshStandardMaterial({ map: textures.marquee, emissiveMap: textures.marquee, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.18 });
  const marquee = add(new THREE.PlaneGeometry(0.585, 0.1625), marqueeMat, 0, 0.004, 0.002, mq); marquee.castShadow = false;
  add(new THREE.PlaneGeometry(0.585, 0.1625), new THREE.MeshPhysicalMaterial({ color: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, roughness: 0.05, envMapIntensity: 1.2 }), 0, 0.004, 0.006, mq);
  // speaker strip under marquee
  const sp2 = add(new THREE.BoxGeometry(IW, 0.012, Math.hypot(0.085, 0.095)), black, 0, 1.5375, 0.5625); sp2.rotation.x = -Math.atan2(0.095, 0.085);
  // top + back
  add(new THREE.BoxGeometry(IW, 0.018, 0.615), black, 0, 1.791, 0.3075);
  add(new THREE.BoxGeometry(IW, 1.79, 0.012), black, 0, 0.9, 0.006);

  // ---------- ambient life (self-driven, restores values after each draw) ----------
  const clockT = () => performance.now() / 1000;
  const shimmer = (mesh, fn) => {
    let saved = 0;
    mesh.onBeforeRender = () => { saved = mesh.material.emissiveIntensity; mesh.material.emissiveIntensity = saved * fn(clockT()); };
    mesh.onAfterRender = () => { mesh.material.emissiveIntensity = saved; };
  };
  // fluorescent tube behind the marquee: tiny hum + rare dips
  let dipUntil = 0;
  shimmer(marquee, t => { if (Math.random() < 0.0008) dipUntil = t + 0.06 + Math.random() * 0.08; return (t < dipUntil ? 0.72 : 1) * (1 + 0.025 * Math.sin(t * 100 * Math.PI * 2) + 0.015 * Math.sin(t * 2.3)); });
  coinLights.forEach((m, i) => shimmer(m, t => 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.6 + i * Math.PI))));
  // soft glow halo around the tube (follows CRT power)
  const haloC = canvas(256, 192), hx = haloC.getContext('2d');
  const hg = hx.createRadialGradient(128, 96, 40, 128, 96, 128); hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.55, 'rgba(170,120,255,0.55)'); hg.addColorStop(1, 'rgba(120,60,255,0)');
  hx.fillStyle = hg; hx.fillRect(0, 0, 256, 192); hx.clearRect(36, 30, 184, 132);
  const haloMat = new THREE.MeshBasicMaterial({ map: tex(haloC), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0.5, 0.35, 0.9) });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.56), haloMat); halo.position.z = 0.024; halo.renderOrder = 2; halo.castShadow = false; bz.add(halo);
  halo.onBeforeRender = () => { const p = screenMat.uniforms.power.value; haloMat.opacity = 0.18 * p * (0.92 + 0.08 * Math.sin(clockT() * 7)); };

  // light that the screen throws into the room
  return { group: g, screenMat, marqueeMat, glassMat, coinLight, coinLights, stick1, stick2, buttons, cp, bz };
}
