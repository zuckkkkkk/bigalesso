// 3D effects: particles (confetti, hearts, powder spray, sparkles, dust), coin flights,
// wall neon sign, night mode, light pulses, fake volumetric light shaft.
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import neonFont from './neonfont.js';
import { DN } from './daynight.js'; // the shared day/night cycle drives the global lights (no more night toggle)

const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];

// ---------- point-sprite pool (soft or additive) ----------
function makePool(max, additive, scaleRef) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: scaleRef },
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale;
      varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 1.0, 512.0); vC = aColor; vA = aAlpha; }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a;
        if (a * vA < 0.003) discard; gl_FragColor = vec4(vC, a * vA); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 3 : 2;
  const P = []; // live particles {x,y,z,vx,vy,vz,life,max,s0,s1,a,r,g,b,drag,grav,floor,kind,ph}
  return {
    pts, P,
    add(p) { if (!p.max) p.max = p.life; if (P.length < max) P.push(p); else P[(Math.random() * max) | 0] = p; },
    update(dt, t) {
      let n = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; p.life -= dt; if (p.life <= 0) continue;
        const dr = Math.exp(-(p.drag || 0) * dt);
        p.vx *= dr; p.vy = p.vy * dr - (p.grav || 0) * dt; p.vz *= dr;
        if (p.wob) { p.vx += Math.sin(t * 1.3 + p.ph) * p.wob * dt; p.vz += Math.cos(t * 1.1 + p.ph * 1.7) * p.wob * dt; p.vy += Math.sin(t * 0.7 + p.ph * 2.3) * p.wob * 0.5 * dt; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = 1 - p.life / p.max; // 0 -> 1
        const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
        if (p.floor && p.y < s * 0.3) { p.y = s * 0.3; p.vy = Math.abs(p.vy) * 0.05; p.vx *= 0.9; p.vz *= 0.9; }
        let a = p.a * (p.fadeIn ? Math.min(1, (p.max - p.life) / p.fadeIn) : 1) * Math.min(1, p.life / (p.fadeOut || 0.4));
        if (p.tw) a *= 0.55 + 0.45 * Math.sin(t * p.tw + p.ph);
        if (p.shaft) a *= p.shaft(p);
        P[n++] = p;
        const j = n - 1;
        pos[j * 3] = p.x; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z;
        col[j * 3] = p.r; col[j * 3 + 1] = p.g; col[j * 3 + 2] = p.b;
        size[j] = s; alpha[j] = a;
      }
      P.length = n;
      geo.setDrawRange(0, n);
      for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[k].needsUpdate = true;
    },
  };
}

function heartTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.translate(64, 70); x.scale(1.9, 1.9);
  const g = x.createRadialGradient(-8, -10, 2, 0, 0, 34); g.addColorStop(0, '#ffd0e0'); g.addColorStop(0.35, '#ff4d7a'); g.addColorStop(1, '#c0103e');
  x.fillStyle = g; x.beginPath(); x.moveTo(0, 22); x.bezierCurveTo(-34, -2, -18, -30, 0, -14); x.bezierCurveTo(18, -30, 34, -2, 0, 22); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c);
}

// ---------- neon sign ----------
function buildNeon() {
  const g = new THREE.Group(); g.name = 'neon';
  const font = new FontLoader().parse(neonFont);
  const tubeGeo = (text, size, x0, y0) => {
    const geos = [];
    for (const sh of font.generateShapes(text, size)) {
      for (const path of [sh, ...sh.holes]) {
        const pts = path.getSpacedPoints(Math.max(24, Math.round(path.getLength() / 0.006))).map(p => new THREE.Vector3(p.x + x0, p.y + y0, 0));
        if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) pts.pop();
        const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
        geos.push(new THREE.TubeGeometry(curve, pts.length * 2, 0.0058, 6, true));
      }
    }
    const m = mergeGeometries(geos); geos.forEach(q => q.dispose()); m.computeBoundingBox(); return m;
  };
  const top = tubeGeo('BIGALESSO', 0.115, 0, 0);
  const tb = top.boundingBox; const w = tb.max.x - tb.min.x;
  top.translate(-w / 2 - tb.min.x, 0, 0);
  const bot = tubeGeo('GAMES', 0.062, 0, 0); bot.computeBoundingBox();
  const bb = bot.boundingBox; bot.translate(w / 2 - (bb.max.x - bb.min.x) - bb.min.x - 0.01, -0.112, 0);
  const lime = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.27, 0.18) });
  const purple = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.24, 0.18, 0.27) });
  const mTop = new THREE.Mesh(top, lime), mBot = new THREE.Mesh(bot, purple);
  g.add(mTop, mBot);
  // acrylic backing + standoffs + cable
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.26, 0.006), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.08, clearcoat: 1, depthWrite: false }));
  plate.position.set(0, 0.005, -0.012); g.add(plate);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.2 });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 12), chrome); s.rotation.x = Math.PI / 2; s.position.set(sx * (w / 2 + 0.025), 0.005 + sy * 0.105, -0.02); g.add(s); }
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(w / 2 + 0.02, -0.12, -0.02), new THREE.Vector3(w / 2 + 0.05, -0.4, -0.028), new THREE.Vector3(w / 2 + 0.04, -1.2, -0.03), new THREE.Vector3(w / 2 + 0.06, -1.74, -0.03)]), 40, 0.003, 6), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5 }));
  g.add(cable);
  // light spill on the wall
  const glowTex = radialTexture();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, 0.75), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(0.55, 1.0, 0.25), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(0, -0.02, -0.03); glow.renderOrder = 2; g.add(glow);
  const light = new THREE.PointLight(0xa8ff40, 0, 1.9, 2); light.position.set(0, 0, 0.22); g.add(light);
  const ON_TOP = new THREE.Color(0.55, 2.5, 0.04), ON_BOT = new THREE.Color(2.2, 0.35, 3.0);
  const OFF_TOP = lime.color.clone(), OFF_BOT = purple.color.clone();
  const st = { target: 0, k: 0, flick: 0, boost: 0 };
  g.userData = {
    width: w,
    setOn(on) { if (on && st.target === 0) st.flick = 1.6; st.target = on ? 1 : 0; },
    update(dt, t) {
      let k = st.target;
      if (st.flick > 0) { st.flick -= dt; const n = Math.sin(t * 53) + Math.sin(t * 17.3) + Math.sin(t * 7.1); k = (n > 0.6 - (1.6 - st.flick) * 0.9) ? 1 : 0.08; if (st.flick <= 0) k = st.target; }
      st.k += (k - st.k) * Math.min(1, dt * (st.flick > 0 ? 40 : 8));
      const hum = 1 + Math.sin(t * 120) * 0.012 + (Math.random() < 0.004 ? -0.25 : 0);
      const kk = st.k * hum * (1 + st.boost * 0.25);
      lime.color.copy(OFF_TOP).lerp(ON_TOP, kk);
      purple.color.copy(OFF_BOT).lerp(ON_BOT, Math.min(1, kk * (st.flick > 0 ? (Math.sin(t * 31) > 0 ? 1 : 0.2) : 1)));
      glow.material.opacity = (0.05 + 0.25 * st.boost) * kk;
      light.intensity = 0.35 * kk * (1 + 1.1 * st.boost);
    },
    _st: st,
  };
  return g;
}

// ---------- fake volumetric light shaft ----------
function buildShaft(from, to, r0, r1) {
  const dir = new THREE.Vector3().subVectors(to, from); const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, 32, 12, true);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, strength: { value: 1 } },
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vW; varying float vY;
      void main(){ vY = uv.y; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float time, strength; varying vec3 vN; varying vec3 vW; varying float vY;
      float h(float x){ return fract(sin(x*127.1)*43758.5453); }
      float n1(float x){ float i=floor(x), f=fract(x); return mix(h(i),h(i+1.0),f*f*(3.0-2.0*f)); }
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float edge = pow(abs(dot(normalize(vN), V)), 1.6);
        float ends = smoothstep(0.0, 0.25, vY) * smoothstep(1.0, 0.55, vY);
        float streak = 0.75 + 0.25 * n1(vW.x*9.0 + vW.z*7.0 + time*0.25) ;
        float a = 0.045 * edge * ends * streak * strength * smoothstep(0.8, 2.2, distance(cameraPosition, vW));
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 1;
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  return m;
}

export function createFX(scene, camera, opts = {}) {
  const { lights = null, cab = null, renderer = null } = opts;
  const low = !!opts.low;
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  const scaleRef = { value: 600 };
  const soft = makePool(low ? 700 : 1800, false, scaleRef);
  const glow = makePool(low ? 500 : 1400, true, scaleRef);
  root.add(soft.pts, glow.pts);
  let t = 0;

  // ---- confetti (instanced tumbling paper) ----
  const CMAX = low ? 300 : 700;
  const confMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.014, 0.022), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, metalness: 0.1 }), CMAX);
  confMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); confMesh.count = 0; confMesh.frustumCulled = false; confMesh.castShadow = false;
  confMesh.setColorAt(0, new THREE.Color(1, 1, 1));
  root.add(confMesh);
  const conf = [];
  const CCOLS = ['#c8f03c', '#8a34d0', '#ffd83a', '#ff4dc8', '#ffffff', '#4ad8ff', '#ff5a2a'].map(c => new THREE.Color(c));

  // ---- hearts (instanced billboards) ----
  const HMAX = 48;
  const heartMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: heartTexture(), transparent: true, depthWrite: false, color: new THREE.Color(1.3, 1.1, 1.15) }), HMAX);
  heartMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); heartMesh.count = 0; heartMesh.frustumCulled = false; heartMesh.renderOrder = 4;
  root.add(heartMesh);
  const hearts = [];

  // ---- coins ----
  const coinGeo = new THREE.CylinderGeometry(0.0125, 0.0125, 0.0022, 32);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 1, roughness: 0.22, envMapIntensity: 1.6 });
  const coins = [];

  // ---- spray emitters ----
  const sprays = [];

  // ---- dust + light shaft ----
  const W0 = lights && lights.key ? lights.key.position.clone() : new THREE.Vector3(-3.2, 4.6, 4.4);
  const T0 = lights && lights.key ? lights.key.target.position.clone() : new THREE.Vector3(0.1, 0.5, 0.6);
  const axisDir = new THREE.Vector3().subVectors(T0, W0).normalize();
  const shaftFrom = W0.clone().addScaledVector(axisDir, 1.6), shaftTo = T0.clone().addScaledVector(axisDir, 0.35);
  const shaft = buildShaft(shaftFrom, shaftTo, 0.42, 0.95);
  root.add(shaft);
  const tmpA = new THREE.Vector3();
  const shaftWeight = p => {
    tmpA.set(p.x - W0.x, p.y - W0.y, p.z - W0.z);
    const along = tmpA.dot(axisDir); tmpA.addScaledVector(axisDir, -along);
    const r = 0.35 + along * 0.08;
    return Math.exp(-tmpA.lengthSq() / (r * r)) * state.dustK;
  };
  const state = { dust: !low, dustK: low ? 0 : 1, night: 0, nightT: 0, pulse: 0 };
  const DUSTN = low ? 0 : 520;
  const spawnDust = (init) => {
    const p = { x: rand(-1.3, 1.8), y: rand(0.05, 2.5), z: rand(0.15, 2.8), vx: rand(-0.01, 0.01), vy: rand(-0.006, 0.006), vz: rand(-0.01, 0.01), life: rand(8, 20), s0: rand(0.004, 0.009), s1: rand(0.004, 0.009), a: rand(0.35, 0.9), r: 1.0, g: 0.95, b: 0.85, wob: 0.01, ph: Math.random() * 99, tw: rand(0.6, 2), fadeIn: 2, fadeOut: 2, shaft: shaftWeight, dust: true };
    p.max = p.life; if (init) p.life *= Math.random(); glow.add(p);
  };
  for (let i = 0; i < DUSTN; i++) spawnDust(true);

  // ---- neon ----
  const neon = buildNeon();
  neon.position.set(1.13, 1.52, 0.038);
  root.add(neon);
  neon.userData.setOn(true);

  // ---- night mode ----
  const moon = new THREE.DirectionalLight(0x7f95d8, 0); moon.position.set(-3.5, 3.5, 3.2); moon.target.position.set(0.3, 0.4, 0.6);
  root.add(moon, moon.target);
  const pulseLight = new THREE.PointLight(0xffffff, 0, 3.2, 2);
  root.add(pulseLight);
  const screenFront = () => {
    if (cab && cab.bz) { const p = cab.bz.getWorldPosition(new THREE.Vector3()); const n = new THREE.Vector3(0, 0, 1).applyQuaternion(cab.bz.getWorldQuaternion(new THREE.Quaternion())); return p.addScaledVector(n, 0.7); }
    return new THREE.Vector3(0.35, 1.25, 1.0);
  };
  // robust multiplicative override: works whether main rewrites values each frame or not
  const track = new Map();
  const scaleProp = (obj, key, f) => {
    if (!obj) return;
    let r = track.get(obj); if (!r) { r = {}; track.set(obj, r); }
    const cur = obj[key];
    const src = (r[key] && Math.abs(cur - r[key].written) < 1e-6) ? r[key].src : cur;
    const v = src * f; obj[key] = v; r[key] = { src, written: v };
  };

  // the light switch in the arcade: since the day/night cycle (daynight.js) it only turns the HOUSE lamp off
  // (arcade + lounge, state.house); the sky, the sun and the street lamps follow the shared clock
  function setNight(on) { state.lampOffT = on ? 1 : 0; neon.userData.setOn(true); }
  // outdoor factor (0 = arcade room / interiors, ~0.2 lounge, 1 = garden + quartiere streets); house = 1 in the arcade/lounge
  state.out = 0; state.house = 1; state.lampOff = 0; state.lampOffT = 0; state.snap = -1;
  const hemiBase = lights && lights.hemi ? { sky: lights.hemi.color.clone(), gnd: lights.hemi.groundColor.clone() } : null;
  // Bologna art direction (outdoors): a soft warm sky and a terracotta bounce from the ochre walls / portico floors;
  // the sun colour, the sky ambient and the bounce now come from the time of day (daynight.js ramps).
  // Indoors (o = 0) the original intro lighting is kept by day; at night the rooms are lamp-lit (warmer, a bit dimmer).
  const lampCol = new THREE.Color(0xffd2a0), lampSky = new THREE.Color(0xffe6cc);
  const keyCol = lights && lights.key ? lights.key.color.clone() : null;
  const moonIn = new THREE.Vector3(-3.8, 3.1, 2.6).normalize(), moonD = new THREE.Vector3(), tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
  function setOutdoor(k, house) { state.out = Math.max(0, Math.min(1, k)); if (house !== undefined) state.house = Math.max(0, Math.min(1, house)); }
  const mix = (a, b, k) => a + (b - a) * k;

  function update(dt) {
    dt = Math.min(dt, 0.05); t += dt;
    const h = renderer ? renderer.getDrawingBufferSize(new THREE.Vector2()).y : innerHeight * Math.min(devicePixelRatio, 1.75);
    scaleRef.value = h * camera.projectionMatrix.elements[5] * 0.5;
    // night factor: the shared clock (smoothed; a debug jump of the clock snaps)
    const D = DN.update();
    if (D.snap !== state.snap) { state.snap = D.snap; state.night = D.night; }
    state.night += (D.night - state.night) * Math.min(1, dt * 1.6);
    state.lampOff += (state.lampOffT - state.lampOff) * Math.min(1, dt * 5);
    const n = state.night;
    const o = state.out || 0;
    const off = state.lampOff * state.house * (1 - o); // house lamp off (only where you are inside the house)
    if (lights) {
      // indoor (lamp on): unchanged by day, lamp-lit at night; lamp off: daylight through the windows only
      // (the old "modalità sala giochi" at night: key 3 %, hemi 7 %, fill 5 %, env 10 %)
      const kIn = mix(mix(1, 0.62, n), mix(0.85, 0.03, n), off), hIn = mix(mix(1, 0.8, n), mix(0.3, 0.07, n), off);
      const fIn = mix(mix(1, 0.75, n), mix(0.28, 0.05, n), off), eIn = mix(mix(1, 0.8, n), mix(0.36, 0.1, n), off);
      // outdoor: the sun (key), the sky (hemi / env / fill) from the time of day; at night the old art-directed levels
      const kOut = D.sunK * 1.2 * (1 + 0.12 * D.golden), amb = D.dayK * (1 - 0.28 * D.golden); // golden hour: less sky, more sun
      const hOut = mix(0.07, 1, amb) * 1.9, fOut = mix(0.05, 1, amb) * 1.3, eOut = mix(0.1, 1, amb) * 1.5;
      scaleProp(lights.key, 'intensity', mix(kIn, kOut, o));
      scaleProp(lights.hemi, 'intensity', mix(hIn, hOut, o));
      scaleProp(lights.fill, 'intensity', mix(fIn, fOut, o));
      scaleProp(scene, 'environmentIntensity', mix(eIn, eOut, o));
      if (hemiBase) {
        tmpC.copy(hemiBase.sky).lerp(lampSky, n * (1 - off) * 0.5).lerp(D.hemiSky, o * 0.85); lights.hemi.color.copy(tmpC);
        tmpC.copy(hemiBase.gnd).lerp(D.hemiGnd, o * 0.8); lights.hemi.groundColor.copy(tmpC);
      }
      if (keyCol) {
        // indoors the window light takes a little of the sun's colour (golden at sunset), lamp-warm at night
        tmpC2.copy(keyCol).lerp(D.sunCol, 0.25 * (1 - n)).lerp(lampCol, n * (1 - off) * 0.6);
        lights.key.color.copy(tmpC2).lerp(D.sunCol, o);
      }
    }
    const dark = Math.max(off * (0.6 + 0.4 * n), n * 0.4); // how dark the arcade room is: the neon and the marquee pop
    if (cab) { if (dark > 0.001) scaleProp(cab.marqueeMat, 'emissiveIntensity', 1 + 0.5 * dark); if (cab.screenMat) cab.screenMat.uniforms.bright.value = 1.55 + 0.25 * dark; }
    // cold, dim moonlight: through the arcade window indoors, from the moon's real direction outdoors
    moon.intensity = mix(0.28 * n * mix(0.35, 1, off), 0.6 * D.moonK, o);
    moonD.copy(moonIn).lerp(D.moonDir, o).normalize();
    moon.position.copy(moon.target.position).addScaledVector(moonD, 5);
    // gfx: the moon stays in the light list (intensity 0 by day): toggling it changed the light count and
    // recompiled every lit shader at dusk; one unshadowed directional light is cheap
    neon.userData._st.boost = dark;
    neon.userData.update(dt, t);
    state.dustK += ((state.dust ? 1 : 0) * (0.15 + 0.85 * D.sunK) - state.dustK) * Math.min(1, dt * 2); // the window shaft follows the sun
    shaft.material.uniforms.time.value = t; shaft.material.uniforms.strength.value = state.dustK;
    shaft.visible = state.dustK > 0.01;
    // keep dust alive
    if (state.dust && DUSTN) { let c = 0; for (const p of glow.P) if (p.dust) c++; for (let i = c; i < DUSTN; i++) spawnDust(false); }
    // pulse light
    state.pulse = Math.max(0, state.pulse - dt * 7);
    pulseLight.intensity = 3.2 * state.pulse * state.pulse;
    // sprays
    for (let i = sprays.length - 1; i >= 0; i--) {
      const s = sprays[i]; s.left -= dt; if (s.left <= 0) { sprays.splice(i, 1); continue; }
      s.acc += dt * (low ? 110 : 240);
      while (s.acc >= 1) {
        s.acc--;
        const d = s.dir.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.16)).normalize();
        const sp = rand(2.2, 3.6);
        const gray = rand(0.86, 1.0), life = rand(1.6, 3.2);
        soft.add({ x: s.origin.x, y: s.origin.y, z: s.origin.z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, drag: 2.6, grav: 0.35, floor: true, life, max: life, s0: 0.03, s1: rand(0.3, 0.55), a: rand(0.18, 0.32), r: gray, g: gray, b: gray * 1.02, wob: 0.15, ph: Math.random() * 99, fadeIn: 0.05, fadeOut: 1.2 });
      }
    }
    soft.update(dt, t); glow.update(dt, t);
    // confetti
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), p3 = new THREE.Vector3();
    let ci = 0;
    for (let i = 0; i < conf.length; i++) {
      const c = conf[i]; c.life -= dt; if (c.life <= 0) continue;
      if (!c.rest) {
        const dr = Math.exp(-1.9 * dt); c.vx *= dr; c.vz *= dr; c.vy = c.vy * Math.exp(-1.2 * dt) - 3.2 * dt;
        if (c.vy < -0.55) c.vy = -0.55 + Math.sin(t * 3 + c.ph) * 0.1;
        c.vx += Math.sin(t * 4 + c.ph) * 0.4 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
        if (c.y < 0.003) { c.y = 0.0025; c.rest = true; c.rx = -Math.PI / 2; c.ry = 0; c.life = Math.min(c.life, rand(4, 7)); }
      }
      const shrink = Math.min(1, c.life / 0.6);
      conf[ci] = c;
      p3.set(c.x, c.y, c.z); q.setFromEuler(e.set(c.rx, c.ry, c.rz)); sc.setScalar(shrink);
      m4.compose(p3, q, sc); confMesh.setMatrixAt(ci, m4); confMesh.setColorAt(ci, c.col); ci++;
    }
    conf.length = ci; confMesh.count = ci; confMesh.instanceMatrix.needsUpdate = true; if (confMesh.instanceColor) confMesh.instanceColor.needsUpdate = true;
    // hearts
    let hi = 0;
    for (let i = 0; i < hearts.length; i++) {
      const hh = hearts[i]; hh.life -= dt; if (hh.life <= 0) continue;
      hh.y += hh.vy * dt; hh.x += Math.sin(t * 3 + hh.ph) * 0.05 * dt; hh.vy *= Math.exp(-0.6 * dt);
      const age = hh.max - hh.life; const s = hh.s * Math.min(1, age / 0.18) * (1 + 0.1 * Math.sin(t * 9 + hh.ph)) * Math.min(1, hh.life / 0.35);
      hearts[hi] = hh;
      m4.compose(p3.set(hh.x, hh.y, hh.z), camera.quaternion, sc.setScalar(s)); heartMesh.setMatrixAt(hi++, m4);
    }
    hearts.length = hi; heartMesh.count = hi; heartMesh.instanceMatrix.needsUpdate = true;
    // coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i]; c.t += dt / c.dur; const k = Math.min(1, c.t);
      const a = c.from, b = c.to; const mid = c.mid;
      c.mesh.position.set((1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * mid.x + k * k * b.x, (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * mid.y + k * k * b.y, (1 - k) * (1 - k) * a.z + 2 * (1 - k) * k * mid.z + k * k * b.z);
      c.mesh.rotation.set(Math.PI / 2 * (1 - k) + k * c.endRot.x, c.t * 18 * (1 - k * 0.8), 0);
      if (k > 0.85) c.mesh.scale.setScalar(Math.max(0.01, (1 - k) / 0.15));
      if (Math.random() < 0.5) glow.add({ x: c.mesh.position.x, y: c.mesh.position.y, z: c.mesh.position.z, vx: 0, vy: 0.05, vz: 0, life: 0.3, max: 0.3, s0: 0.012, s1: 0.002, a: 0.8, r: 2.2, g: 1.6, b: 0.5 });
      if (k >= 1) { root.remove(c.mesh); coins.splice(i, 1); try { c.onDone && c.onDone(); } catch (err) { console.error(err); } }
    }
  }

  function confetti(pos, n = 200) {
    n = Math.min(n, low ? 120 : 400);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, up = rand(2.2, 4.2), sp = rand(0.4, 1.6);
      conf.push({ x: pos.x + rand(-0.05, 0.05), y: pos.y, z: pos.z + rand(-0.05, 0.05), vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp, rx: rand(0, 6), ry: rand(0, 6), rz: rand(0, 6), wx: rand(-14, 14), wy: rand(-14, 14), wz: rand(-14, 14), life: rand(6, 9), ph: Math.random() * 99, col: pick(CCOLS) });
    }
    if (conf.length > CMAX) conf.splice(0, conf.length - CMAX);
    sparkles(pos, 30);
  }
  function hearts_(pos, n = 6) {
    for (let i = 0; i < n; i++) hearts.push({ x: pos.x + rand(-0.08, 0.08), y: pos.y + rand(0, 0.08), z: pos.z + rand(-0.08, 0.08), vy: rand(0.25, 0.45), life: rand(1.4, 2.2) + i * 0.08, s: rand(0.045, 0.075), ph: Math.random() * 9 });
    for (const h of hearts) h.max = h.max || h.life;
    if (hearts.length > HMAX) hearts.splice(0, hearts.length - HMAX);
  }
  function spray(origin, dir, seconds = 1.5) { sprays.push({ origin: origin.clone(), dir: dir.clone().normalize(), left: seconds, acc: 0 }); }
  function sparkles(pos, n = 40) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.4), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1.5));
      const gold = Math.random() < 0.6;
      const life = rand(0.5, 1.2);
      glow.add({ x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z, drag: 2.2, grav: 0.6, life, max: life, s0: rand(0.02, 0.035), s1: 0.004, a: 1, r: gold ? 2.4 : 2.0, g: gold ? 1.8 : 2.0, b: gold ? 0.6 : 2.2, tw: 30, ph: Math.random() * 9 });
    }
  }
  function coin(from, to, onDone) {
    const mesh = new THREE.Mesh(coinGeo, coinMat); mesh.castShadow = true;
    const mid = from.clone().lerp(to, 0.5); mid.y = Math.max(from.y, to.y) + 0.28;
    root.add(mesh);
    const c = { mesh, from: from.clone(), to: to.clone(), mid, t: 0, dur: Math.max(0.45, from.distanceTo(to) * 0.9), endRot: new THREE.Vector3(0, 0, 0), onDone };
    coins.push(c);
    return new Promise(res => { const o = c.onDone; c.onDone = () => { o && o(); res(); }; });
  }
  function pulse(color = 0xffffff, strength = 1) {
    pulseLight.color.set(color); pulseLight.position.copy(screenFront()); state.pulse = Math.min(1.4, Math.max(state.pulse, strength));
  }
  function dust(on) { state.dust = !!on && !low; }

  return { root, update, confetti, hearts: hearts_, spray, sparkles, coin, dust, setNight, setOutdoor, neon, pulse, get night() { return state.night > 0.5; }, get lampOff() { return state.lampOffT > 0; }, get nightAmount() { return state.night; } };
}
