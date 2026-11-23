// Garden mural: "CAPPELLETTI MAN vs TORTELLINO MAN" painted on a freestanding wall at the back of the garden,
// with paint cans, a ladder, night floodlights and a cinematic "look at the mural" interaction.
import * as THREE from 'three';
import { newsURL } from './newspaper.js';
import { smooth, clamp, makeNoise, canvas as mkCanvas, tex as canvasTex } from './util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// wall footprint (world): x 0..6.1, z 18.6..18.82, faces -z (toward the house)
const WX0 = 0.0, WX1 = 6.1, WZ0 = 18.6, WZ1 = 18.82, WH = 3.5;
const MW = 5.9, MH = 3.15, MY = 1.86, MX = (WX0 + WX1) / 2;

function plasterTex(seed = 4) {
  const c = mkCanvas(256, 256), x = c.getContext('2d'), n = makeNoise(seed);
  const im = x.createImageData(256, 256), d = im.data;
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const v = 0.82 + 0.12 * n(i * 0.05, j * 0.05, 12.8, 12.8) + 0.06 * n(i * 0.4, j * 0.4, 102.4, 102.4);
    const o = (j * 256 + i) * 4; d[o] = 214 * v; d[o + 1] = 196 * v; d[o + 2] = 168 * v; d[o + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  const t = canvasTex(c, { repeat: [3, 2] }); return t;
}
function glowTex() {
  const c = mkCanvas(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 20, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,236,190,1)'); g.addColorStop(0.35, 'rgba(255,214,150,0.55)'); g.addColorStop(1, 'rgba(255,200,130,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return canvasTex(c, { srgb: true });
}

export function buildMural(scene, { level = null, low = false, getFX = null } = {}) {
  const g = new THREE.Group(); g.name = 'mural'; scene.add(g);
  const loader = new THREE.TextureLoader();
  const map = loader.load(newsURL('mural.jpg')); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = low ? 4 : 8;
  const bump = loader.load(newsURL('mural_bump.jpg')); bump.anisotropy = 4;
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  // wall body + end pilasters + coping
  const plaster = new THREE.MeshStandardMaterial({ map: plasterTex(), roughness: 0.95 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x9a4a32, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b6, roughness: 0.85 });
  const wall = shadowy(new THREE.Mesh(new THREE.BoxGeometry(WX1 - WX0, WH, WZ1 - WZ0), plaster));
  wall.position.set(MX, WH / 2, (WZ0 + WZ1) / 2); g.add(wall);
  for (const x of [WX0 + 0.12, WX1 - 0.12]) { const p = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.3, WH + 0.1, 0.3), brick)); p.position.set(x, (WH + 0.1) / 2, (WZ0 + WZ1) / 2); g.add(p); }
  const cop = shadowy(new THREE.Mesh(new THREE.BoxGeometry(WX1 - WX0 + 0.2, 0.08, 0.34), stone)); cop.position.set(MX, WH + 0.04, (WZ0 + WZ1) / 2); g.add(cop);

  // the mural itself (painted on the -z face)
  const muralMat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughness: 0.86, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0 });
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), muralMat);
  mural.rotation.y = Math.PI; mural.position.set(MX, MY, WZ0 - 0.004); mural.receiveShadow = true; g.add(mural);

  // floodlights on arms (light pools fade in at night)
  const metal = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.45, metalness: 0.6 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 });
  const pools = [];
  const gt = glowTex();
  for (const x of [MX - 1.6, MX + 1.6]) {
    const arm = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), metal)); arm.position.set(x, WH - 0.02, WZ0 - 0.25); g.add(arm);
    const head = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.16, 16), metal)); head.position.set(x, WH - 0.06, WZ0 - 0.5); head.rotation.x = -0.9; g.add(head);
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), bulbMat); b.position.set(x, WH - 0.12, WZ0 - 0.46); b.rotation.x = Math.PI / 2 + 0.68; g.add(b);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.6), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true }));
    pool.rotation.y = Math.PI; pool.position.set(x, MY + 0.05, WZ0 - 0.012); g.add(pool); pools.push(pool);
  }

  // paint cans + brush + leaning ladder
  const canCols = [0xffd23a, 0xe23a3a, 0xc8f03c];
  [[0.55, 18.32, 0], [0.82, 18.36, 1], [0.66, 18.14, 2]].forEach(([x, z, k]) => {
    const can = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.19, 20), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.8 })));
    can.position.set(x, 0.095, z); g.add(can);
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0865, 0.0865, 0.1, 20, 1, true), new THREE.MeshStandardMaterial({ color: canCols[k], roughness: 0.6 }));
    lab.position.set(x, 0.1, z); g.add(lab);
    const paint = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), new THREE.MeshStandardMaterial({ color: canCols[k], roughness: 0.25 }));
    paint.rotation.x = -Math.PI / 2; paint.position.set(x, 0.185, z); g.add(paint);
    for (let i = 0; i < 3; i++) { const dr = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03 + i * 0.02, 0.004), paint.material); const a = i * 2.1 + k; dr.position.set(x + Math.cos(a) * 0.087, 0.17 - (0.015 + i * 0.01), z + Math.sin(a) * 0.087); dr.rotation.y = -a + Math.PI / 2; g.add(dr); }
  });
  { const br = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.26), new THREE.MeshStandardMaterial({ color: 0x8a5d36, roughness: 0.6 }))); br.position.set(0.55, 0.198, 18.32); br.rotation.y = 0.6; g.add(br); }
  // splatters on the gravel/grass in front
  { const sp = new THREE.Group(); const m = canCols.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
    for (let i = 0; i < 14; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.02 + (i % 4) * 0.012, 10), m[i % 3]); d.rotation.x = -Math.PI / 2; d.position.set(0.4 + ((i * 37) % 100) / 100 * 1.4, 0.008, 18.0 + ((i * 53) % 100) / 100 * 0.5); sp.add(d); }
    g.add(sp); }
  { // ladder leaning on the right end of the wall
    const L = new THREE.Group(); L.position.set(5.55, 0, WZ0 - 0.55); g.add(L);
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.8 });
    const ang = Math.atan2(0.5, 2.9), len = Math.hypot(0.5, 2.9);
    // rails: foot on the ground away from the wall, top resting against it (same slope as the rungs below)
    for (const s of [-0.22, 0.22]) { const r = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.035), wood)); r.position.set(s, len / 2 * Math.cos(ang), len / 2 * Math.sin(ang)); r.rotation.x = ang; L.add(r); }
    for (let i = 1; i < 10; i++) { const y = i * 0.29; const ru = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 8), wood)); ru.rotation.z = Math.PI / 2; ru.position.set(0, y, y * Math.tan(ang)); L.add(ru); }
  }

  // colliders + camera blockers (before createWorld merges level colliders)
  if (level) {
    level.colliders.push({ type: 'box', min: [WX0 - 0.05, WZ0 - 0.05], max: [WX1 + 0.05, WZ1 + 0.05] });
    level.colliders.push({ type: 'circle', c: [5.55, WZ0 - 0.35], r: 0.3 });
    level.colliders.push({ type: 'circle', c: [0.68, 18.27], r: 0.26 });
    level.cameraBlockers.push({ min: [WX0 - 0.05, 0, WZ0 - 0.05], max: [WX1 + 0.05, WH + 0.1, WZ1 + 0.05] });
  }

  let night = 0;
  function update(dt) {
    const f = getFX ? getFX() : null;
    const n = f && typeof f.nightAmount === 'number' ? f.nightAmount : (f && f.night ? 1 : 0);
    night += (n - night) * (1 - Math.exp(-dt * 3));
    muralMat.emissiveIntensity = night * 0.42;
    bulbMat.emissiveIntensity = night * 3.0;
    for (const p of pools) p.material.opacity = night * 0.55;
  }
  return {
    group: g, update,
    center: V(MX, MY, WZ0),
    viewPoint: V(MX, 0, 15.9),
  };
}

// ---------------------------------------------------------------- caption overlay (cinematic subtitles)
const CAP_CSS = `#mcap{position:fixed;left:50%;bottom:11vh;transform:translateX(-50%);z-index:7;max-width:min(860px,88vw);text-align:center;pointer-events:none;opacity:0;transition:opacity .6s}
#mcap.on{opacity:1}
#mcap b{display:block;font:600 22px/1.3 Georgia,"Times New Roman",serif;color:#fff;text-shadow:0 2px 6px #000,0 0 22px rgba(0,0,0,.7)}
#mcap small{display:block;margin-top:8px;font:500 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.72);text-shadow:0 1px 3px #000}`;
function captionEl() {
  let el = document.getElementById('mcap');
  if (!el) {
    const s = document.createElement('style'); s.textContent = CAP_CSS; document.head.appendChild(s);
    el = document.createElement('div'); el.id = 'mcap'; el.innerHTML = '<b></b><small></small>'; document.body.appendChild(el);
  }
  return el;
}

const LINES = [
  [0.5, 'La battaglia di via Rizzoli', 'Il Corriere delle Due Torri · n. 313 · pagina 5'],
  [3.0, 'Cappelletti Man: cilindro, monocolo, mantello nero. Apre con la Pioggia di Cappelletti.', 'Round 1'],
  [5.8, 'Tortellino Man, alla prima uscita con la tuta rossoblù, risponde con la Sfoglia Infinita.', 'Round 3'],
  [8.6, 'Verdetto: pareggio. Il boccale di Re Enzo è illeso.', 'Via Rizzoli'],
];

// ---------------------------------------------------------------- explore plugin
export function muralPlugin(mural) {
  return (ctx, W, H) => {
    const { audio } = ctx;
    const { goTo, setMode, toast } = H;
    const cap = captionEl();
    let S = null;
    const item = {
      id: 'mural', label: () => 'Guarda il murales',
      anchor: () => mural.viewPoint, top: () => mural.center.clone().add(V(0, 1.0, 0)), range: 2.4,
      act: () => { W.dancing && W.stopDance && W.stopDance(); goTo(mural.viewPoint, 0, () => { setMode('mural'); S = { t: 0, line: -1 }; audio && audio.sfx('whoosh'); }); },
    };
    function showLine(i) {
      const L = LINES[i]; cap.querySelector('b').textContent = L[1]; cap.querySelector('small').textContent = L[2];
      cap.classList.remove('on'); void cap.offsetWidth; cap.classList.add('on');
    }
    function end() { cap.classList.remove('on'); S = null; setMode('explore'); }
    function update(mode, dt, I, keys) {
      if (!S) { setMode('explore'); return {}; }
      S.t += dt;
      for (let i = LINES.length - 1; i >= 0; i--) if (S.t >= LINES[i][0]) { if (S.line !== i) { S.line = i; showLine(i); } break; }
      if (S.line >= 0 && S.t > LINES[S.line][0] + 2.5) cap.classList.remove('on');
      if ((S.t > 1.2 && (keys.actP || keys.backP)) || S.t > 12) { end(); return {}; }
      const c = mural.center;
      // the man looks across the painting, left (Cappelletti) to right (Tortellino)
      const sweep = clamp((S.t - 2) / 6, 0, 1);
      return { lookW: 1, lookAt: V(c.x + 1.6 - 3.2 * smooth(sweep), c.y, c.z), leanT: 0 };
    }
    const K = [
      // the painting is seen from the house side: its left half (Cappelletti Man) is at world +x
      { t: 2.4, pos: V(4.75, 1.75, 15.45), look: V(4.4, 1.95, 18.6), fov: 46 },
      { t: 5.4, pos: V(1.35, 1.75, 15.45), look: V(1.7, 1.95, 18.6), fov: 46 },
      { t: 8.4, pos: V(1.2, 2.05, 13.7), look: V(3.25, 1.8, 18.6), fov: 46 },
    ];
    function camera(p, dt) {
      if (W.mode !== 'mural' || !S) return null;
      if (!S.k0) S.k0 = { t: 0, pos: p.pos.clone(), look: p.look.clone(), fov: p.fov || 50 };
      const keys = [S.k0, ...K];
      let i = 0; while (i < keys.length - 2 && S.t > keys[i + 1].t) i++;
      const a = keys[i], b = keys[i + 1];
      const k = smooth(clamp((S.t - a.t) / (b.t - a.t), 0, 1));
      return { pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k), fov: a.fov + (b.fov - a.fov) * k };
    }
    return { items: [item], owns: m => m === 'mural', update, camera };
  };
}
