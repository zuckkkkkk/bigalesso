// Cronache (Corriere delle Due Torri n. 281): easter eggs from the side news of the page.
// buildCronache(scene, {level, low, getFX}) runs BEFORE createWorld (props + colliders into level.colliders);
// .plugin is an explore.js plugin (items + the 'cron' mode); .update(dt, t) runs every frame (after man.update).
// Eggs: pigeon on the Due Torri, 40 kg tortellino, Gratta e Vinci in the mortadella, accordion concert for cats,
// "nebbia fitta" radio, Madame Zdaura's horoscope, B. Piddy's freestyle (Gulag), striped pyjamas, calcetto derby, diploma.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const turnTo = (a, b, k) => a + wrapA(b - a) * Math.min(1, k);
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function drawTex(w, h, fn, srgb = true) { const c = cv(w, h); fn(c.getContext('2d'), w, h); return ctex(c, srgb); }

// merge the static meshes of a subtree (stopping at `stop` nodes) by material, in `group`-local space
function mergeLocal(group, stop = new Set()) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), buckets = new Map(), m4 = new THREE.Matrix4();
  const walk = o => { if (o !== group && stop.has(o)) return; if (o.isMesh && !Array.isArray(o.material)) { const k = o.material.uuid + (o.castShadow ? 'S' : ''); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(o); } for (const c of o.children) walk(c); };
  walk(group);
  for (const [k, list] of buckets) {
    if (list.length < 2) continue;
    const geos = list.map(o => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; });
    const mg = mergeGeometries(geos, false); geos.forEach(g => g.dispose()); if (!mg) continue;
    const mm = new THREE.Mesh(mg, list[0].material); mm.castShadow = k.endsWith('S'); group.add(mm);
    for (const o of list) o.parent.remove(o);
  }
}

const SECRETS = [
  { id: 'piccione', name: 'Residenza in cima', desc: 'Il piccione delle Due Torri non si sposta da tre giorni.', hint: 'In giardino c\'è una torre troppo alta per un piccione qualunque.' },
  { id: 'tortellino', name: 'Panna? No.', desc: 'Hai chiesto la panna sul tortellino da record.', hint: 'Il record mondiale è in giardino: guai a chiedere certe cose.' },
  { id: 'gratta', name: 'Due etti in omaggio', desc: 'Il Gratta e Vinci incartato nella mortadella.', hint: 'In salotto una mortadella nasconde qualcosa sotto la carta.' },
  { id: 'gatti', name: 'Concerto per gatti', desc: 'Fisarmonica, pubblico felino, crocchette.', hint: 'Qualcuno ha lasciato una fisarmonica in salotto.' },
  { id: 'nebbia', name: 'Nebbia in pianura', desc: '14°C, portici facilmente confondibili.', hint: 'La radio del salotto dà le previsioni del tempo.' },
  { id: 'zdaura', name: 'Madame Zdaura', desc: 'L\'oroscopo nella sfera di cristallo.', hint: 'Nella sala giochi una sfera conosce il futuro.' },
  { id: 'piddy', name: 'Freestyle di benvenuto', desc: 'B. Piddy rappa dal Gulag.', hint: 'Nel Gulag c\'è uno stereo che aspetta un nuovo compagno di cella.' },
  { id: 'pigiama', name: 'Usato una sola notte', desc: 'Hai provato il pigiama a righe.', hint: 'In giardino qualcosa è stato steso ad asciugare.' },
  { id: 'calcetto', name: 'Derby di via Zamboni', desc: 'Gol! Finisce 14 a 13 dopo tre ore.', hint: 'In giardino ci sono una porta da calcetto e una pallina.' },
  { id: 'laurea', name: 'Fuori corso dal 1998', desc: 'Laurea con 66 e festa fino all\'alba.', hint: 'In sala giochi c\'è una pergamena incorniciata.' },
];

const HOROSCOPE = [
  ['Ariete', 'giornata ideale per controllare chi entra in casa.'],
  ['Toro', 'evitate i termosifoni.'],
  ['Gemelli', 'un foulard vi porterà fortuna, ma solo se è vostro.'],
  ['Leone', 'nuove conoscenze in luoghi chiusi.'],
  ['Cancro', 'un barattolo di ragù nasconde più di quanto pensiate.'],
  ['Vergine', 'andate a letto alle 21. O no?'],
  ['Bilancia', 'due spritz sì, cinque no. Saturno consiglia la samba.'],
  ['Scorpione', 'un piccione vi chiederà la residenza: non firmate nulla.'],
  ['Sagittario', 'il fuori corso non è un fallimento, è un percorso. Lungo.'],
  ['Capricorno', 'Venere favorisce il calcetto condominiale. Occhio all\'amministratore.'],
  ['Acquario', 'nebbia in pianura, chiarezza nel cuore. Portici ovunque.'],
  ['Pesci', 'grattate con fiducia: la mortadella non mente.'],
];

const RAP = [
  'Yo! Benvenuto in cella, compagno di sventura,',
  'qui il termosifone è spento ma la rima è sicura.',
  'Io vendevo biglietti di un concerto mai esistito,',
  'tu aggiusti caloriferi: siamo un duo garantito.',
  'Casalecchio nel cuore, le sbarre fanno il beat,',
  'sistemami il termo e ti do il featuring. Easy.',
];

// ---------------------------------------------------------------- caption (desktop style, like the Gulag subtitles)
const CAP_CSS = `#ccap{position:fixed;left:50%;bottom:11vh;transform:translate(-50%,8px);z-index:7;max-width:min(860px,90vw);text-align:center;opacity:0;transition:opacity .35s,transform .35s,bottom .3s;pointer-events:none;text-shadow:0 1px 3px #000,0 0 14px rgba(0,0,0,.7)}
#ccap.on{opacity:1;transform:translate(-50%,0)}
#ccap b{display:block;margin:0 0 6px;font:700 11px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#ff5a64}
#ccap span{font:500 19px/1.35 Georgia,"Times New Roman",serif;color:#fff}
#ccap.big span{font:700 26px/1.25 Georgia,"Times New Roman",serif}
#gratta{position:fixed;inset:0;z-index:30;display:grid;place-items:center;background:radial-gradient(80% 70% at 50% 50%,rgba(10,5,18,.55),rgba(5,2,10,.85));opacity:0;transition:opacity .3s}
#gratta.on{opacity:1}
#gratta .card{position:relative;width:min(440px,90vw,100vh);aspect-ratio:440/280;border-radius:10px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);transform:rotate(-1.5deg)}
#gratta canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
#gratta canvas.top{cursor:crosshair}
#gratta .tip{margin-top:18px;font:500 13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:rgba(255,255,255,.8);text-align:center;letter-spacing:.04em}
#gratta .tip kbd{min-width:22px;height:21px;padding:0 6px;border-radius:4px;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.55);font:600 11px/21px system-ui,sans-serif;display:inline-block;text-align:center}
#gratta .res{margin-top:10px;min-height:28px;font:700 22px/1.2 Georgia,"Times New Roman",serif;color:#ffd83a;text-align:center;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .4s}
#gratta .res.on{opacity:1}
#gratta .wrap{display:grid;justify-items:center}`;

function capEl() {
  let el = document.getElementById('ccap');
  if (!el) {
    const st = document.createElement('style'); st.textContent = CAP_CSS; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'ccap'; el.innerHTML = '<b></b><span></span>'; document.body.appendChild(el);
  }
  return el;
}

// ---------------------------------------------------------------- small models
function buildPigeon() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x7c8592, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a515c, roughness: 0.8 });
  const neck = new THREE.MeshStandardMaterial({ color: 0x3f7a5c, roughness: 0.35, metalness: 0.45, emissive: 0x1a1030, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), grey); body.scale.set(0.055, 0.05, 0.09); body.position.y = 0.06; g.add(body);
  const nk = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), neck); nk.position.set(0, 0.095, 0.05); g.add(nk);
  const head = new THREE.Group(); head.position.set(0, 0.125, 0.07); g.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), grey));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, 6), new THREE.MeshStandardMaterial({ color: 0x2a2224, roughness: 0.6 })); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.004, 0.034); head.add(beak);
  const cere = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.9 })); cere.position.set(0, 0.004, 0.026); head.add(cere);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 6, 4), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.2 })); e.position.set(s * 0.019, 0.007, 0.016); head.add(e); }
  const wings = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 0.045, 0.085, 0.02); g.add(piv);
    const w = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), dark); w.scale.set(0.012, 0.04, 0.085); w.position.set(s * 0.008, -0.012, -0.03); piv.add(w);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2e36 })); bar.position.set(s * 0.017, -0.02, -0.05); piv.add(bar);
    wings.push(piv);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.07), dark); tail.position.set(0, 0.055, -0.11); tail.rotation.x = 0.25; g.add(tail);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 5), new THREE.MeshStandardMaterial({ color: 0xd06a7a })); l.position.set(s * 0.018, 0.012, 0.01); g.add(l); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, head, wings };
}

function buildCat(col, stripe) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), fur); body.scale.set(0.075, 0.105, 0.085); body.position.set(0, 0.105, -0.01); body.rotation.x = -0.25; g.add(body);
  if (stripe) { const s = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: stripe, roughness: 0.85 })); s.scale.set(0.06, 0.06, 0.05); s.position.set(0, 0.16, -0.05); g.add(s); }
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.11, 6), fur); l.position.set(sx * 0.03, 0.055, 0.05); g.add(l); }
  const head = new THREE.Group(); head.position.set(0, 0.215, 0.035); g.add(head);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 9), fur); hd.scale.set(1.05, 0.92, 0.95); head.add(hd);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.045, 4), fur); ear.position.set(sx * 0.03, 0.05, -0.004); ear.rotation.z = -sx * 0.25; head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9adf40, roughness: 0.15, emissive: 0x203a08, emissiveIntensity: 0.6 })); eye.position.set(sx * 0.021, 0.008, 0.045); head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshStandardMaterial({ color: 0xe98a9a })); nose.position.set(0, -0.008, 0.054); head.add(nose);
  const tailPiv = new THREE.Group(); tailPiv.position.set(0, 0.03, -0.085); g.add(tailPiv);
  const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.05, -0.02, -0.06), V(0.12, -0.015, -0.03), V(0.15, 0, 0.04)]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.011, 6), fur); tailPiv.add(tail);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { g, head, tailPiv };
}

// ---------------------------------------------------------------- main builder
export function buildCronache(scene, opts = {}) {
  const { level, low = false } = opts;
  const root = new THREE.Group(); root.name = 'cronache'; scene.add(root);
  const COLS = level && level.colliders ? level.colliders : [];
  const M = (geo, mat, x = 0, y = 0, z = 0, parent = root, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; } parent.add(m); return m; };
  const G = (x, y, z, ry = 0, parent = root) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; };
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.6 });
  const woodLight = new THREE.MeshStandardMaterial({ color: 0xb88a56, roughness: 0.55 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.4 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 0.9, roughness: 0.35 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 });
  const blackPl = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.45 });
  const circle = (x, z, r) => COLS.push({ type: 'circle', c: [x, z], r });
  const box = (x0, z0, x1, z1) => COLS.push({ type: 'box', min: [x0, z0], max: [x1, z1] });

  // ---------- 1. Due Torri model + pigeon (garden) ----------
  const TW = V(-2.4, 0, 9.3);
  const towers = G(TW.x, 0, TW.z, 0.35);
  const brick = drawTex(64, 256, (x, w, h) => {
    x.fillStyle = '#9a5534'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 32; r++) for (let c = 0; c < 4; c++) { const off = r % 2 ? 8 : 0; x.fillStyle = `hsl(${16 + Math.random() * 8},${45 + Math.random() * 12}%,${34 + Math.random() * 12}%)`; x.fillRect(c * 16 + off - 8, r * 8 + 1, 15, 6); }
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(30,20,15,.6)'; x.fillRect(16 + (i % 2) * 24, 20 + i * 38, 5, 9); }
  });
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const brickM = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.85 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xbdb4a4, roughness: 0.9 });
  M(new THREE.BoxGeometry(1.0, 0.14, 0.62), stone, 0, 0.07, 0, towers);
  M(new THREE.BoxGeometry(0.17, 2.15, 0.17), brickM, -0.2, 0.14 + 1.075, 0, towers);
  M(new THREE.BoxGeometry(0.21, 0.05, 0.21), brickM, -0.2, 2.315, 0, towers);
  for (const [mx, mz] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) M(new THREE.BoxGeometry(0.035, 0.05, 0.035), brickM, -0.2 + mx, 2.365, mz, towers);
  const gari = G(0.22, 0.14, 0.02, 0, towers); gari.rotation.z = -0.075;
  M(new THREE.BoxGeometry(0.2, 1.3, 0.2), brickM, 0, 0.65, 0, gari);
  M(new THREE.BoxGeometry(0.22, 0.04, 0.22), brickM, 0, 1.32, 0, gari);
  const plaque = drawTex(512, 128, (x, w, h) => {
    x.fillStyle = '#2a2622'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c9a24a'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = '#e8d9a8'; x.textAlign = 'center'; x.font = '700 40px Georgia,serif'; x.fillText('LE DUE TORRI', w / 2, 56); x.font = 'italic 24px Georgia,serif'; x.fillText('in scala · residenza non concessa ai piccioni', w / 2, 98);
  });
  M(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.5, metalness: 0.2 }), 0.1, 0.075, 0.311, towers, false);
  circle(TW.x, TW.z, 0.6);
  const pg = buildPigeon(); pg.g.scale.setScalar(1.5); root.add(pg.g);
  towers.updateMatrixWorld(true);
  const PERCH = towers.localToWorld(V(-0.2, 2.34, 0.02));
  pg.g.position.copy(PERCH); pg.g.rotation.y = 0.9;

  // ---------- 2. Giant tortellino (garden table) ----------
  const TT = V(12.8, 0, 9.2);
  const tt = G(TT.x, 0, TT.z, -0.4);
  M(new THREE.CylinderGeometry(0.55, 0.55, 0.04, 40), wood, 0, 0.74, 0, tt);
  M(new THREE.CylinderGeometry(0.05, 0.07, 0.72, 12), wood, 0, 0.37, 0, tt);
  M(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 24), wood, 0, 0.015, 0, tt);
  const check = drawTex(128, 128, (x) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#c8202a' : '#f4f0e6'; x.fillRect(i * 16, j * 16, 16, 16); } });
  check.wrapS = check.wrapT = THREE.RepeatWrapping; check.repeat.set(3, 3);
  M(new THREE.CylinderGeometry(0.61, 0.61, 0.012, 40), new THREE.MeshStandardMaterial({ map: check, roughness: 0.9 }), 0, 0.766, 0, tt);
  M(new THREE.CylinderGeometry(0.36, 0.32, 0.025, 36), white, 0, 0.785, 0, tt);
  const pasta = new THREE.MeshStandardMaterial({ color: 0xf2cb74, roughness: 0.55 });
  const tort = G(0, 0.9, 0, 0, tt);
  { // tortellino: a filled belly wrapped into a ring (ends crossing at the "navel") + the folded pasta edge
    const N = 56, RS = 14, pts = [];
    for (let i = 0; i <= 12; i++) { const a = 0.15 + (i / 12) * (Math.PI * 2 - 0.05); const r = 0.15 + 0.012 * Math.sin(i); pts.push(V(Math.cos(a) * r, (i === 0 ? 0.035 : i === 12 ? -0.03 : 0), Math.sin(a) * r)); }
    const path = new THREE.CatmullRomCurve3(pts), geo = new THREE.TubeGeometry(path, N, 1, RS, false), pa = geo.attributes.position, c = V(), q = V();
    for (let i = 0; i <= N; i++) { path.getPointAt(i / N, c); const u = i / N, r = 0.03 + 0.088 * Math.pow(Math.sin(Math.PI * u), 0.6);
      for (let j = 0; j <= RS; j++) { const k = i * (RS + 1) + j; q.fromBufferAttribute(pa, k).sub(c).multiplyScalar(r); q.y *= 0.82; q.add(c); pa.setXYZ(k, q.x, q.y, q.z); } }
    geo.computeVertexNormals();
    const belly = new THREE.Mesh(geo, pasta); belly.castShadow = true; tort.add(belly);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.016, 6, 48, Math.PI * 1.55), pasta); edge.rotation.set(-Math.PI / 2, 0, 0.85); edge.scale.set(1, 1, 0.55); edge.position.y = -0.005; tort.add(edge);
    const flap = new THREE.Group(); flap.position.set(-0.19, 0.035, 0); flap.rotation.set(0, 0, -0.55); tort.add(flap); // the folded tip of the pasta square
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.016, 24, 1, false, Math.PI, Math.PI), pasta); fl.scale.set(1, 1, 1.25); fl.castShadow = true; flap.add(fl);
    const flE = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.011, 6, 24, Math.PI), pasta); flE.rotation.set(Math.PI / 2, 0, Math.PI / 2); flE.scale.set(1.25, 1, 1); flap.add(flE);
    tort.rotation.y = 0.6; }
  const brothM = new THREE.MeshStandardMaterial({ color: 0xd89a34, roughness: 0.15, transparent: true, opacity: 0.85 });
  const bowls = [];
  for (let i = 0; i < 3; i++) {
    const a = -0.9 + i * 0.9, b = G(Math.cos(a) * 0.43, 0.775, Math.sin(a) * 0.43 + 0.05, 0, tt);
    const pts = [[0, 0], [0.04, 0], [0.075, 0.035], [0.085, 0.05], [0.08, 0.05], [0.07, 0.034], [0.036, 0.008], [0, 0.008]].map(p => new THREE.Vector2(p[0], p[1]));
    M(new THREE.LatheGeometry(pts, 20), white, 0, 0, 0, b);
    M(new THREE.CylinderGeometry(0.068, 0.068, 0.004, 20), brothM, 0, 0.036, 0, b, false);
    for (let k = 0; k < 3; k++) { const t2 = M(new THREE.TorusGeometry(0.014, 0.008, 6, 12, Math.PI * 1.6), pasta, Math.cos(k * 2.1) * 0.03, 0.04, Math.sin(k * 2.1) * 0.03, b, false); t2.rotation.x = -1.2; }
    bowls.push(b);
  }
  const sign = drawTex(256, 160, (x, w, h) => {
    x.fillStyle = '#fff8e6'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c8202a'; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8);
    x.fillStyle = '#c8202a'; x.textAlign = 'center'; x.font = '800 30px Georgia,serif'; x.fillText('RECORD', w / 2, 46); x.fillText('MONDIALE', w / 2, 80);
    x.fillStyle = '#222'; x.font = '700 26px Arial,sans-serif'; x.fillText('40 KG · 900 porzioni', w / 2, 116); x.font = 'italic 20px Georgia,serif'; x.fillText('niente panna', w / 2, 144);
  });
  { const s = G(-0.32, 0.86, -0.34, 0.5, tt); const p = M(new THREE.PlaneGeometry(0.2, 0.125), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.8, side: THREE.DoubleSide }), 0, 0, 0, s); p.rotation.x = -0.25; }
  circle(TT.x, TT.z, 0.64);
  // steam
  const STEAM_N = 24;
  const steamGeo = new THREE.BufferGeometry(); steamGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(STEAM_N * 3), 3));
  const puff = drawTex(64, 64, (x) => { const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); });
  const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ map: puff, size: 0.11, transparent: true, opacity: 0.32, depthWrite: false, sizeAttenuation: true }));
  steam.frustumCulled = false; root.add(steam);
  const steamP = []; tt.updateMatrixWorld(true);
  for (let i = 0; i < STEAM_N; i++) { const b = bowls[i % 3]; const base = b.getWorldPosition(V()).add(V(0, 0.05, 0)); steamP.push({ base, t: Math.random() * 2, life: 1.6 + Math.random() }); }

  // ---------- 3. Mortadella + Gratta e Vinci (lounge, right wall) ----------
  const MO = V(10.0, 0, 4.7); // between the lounge radiator and the credenza (caso.js)
  const mo = G(MO.x, 0, MO.z);
  M(new THREE.BoxGeometry(0.36, 0.03, 0.58), woodLight, 0, 0.8, 0, mo);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M(new THREE.CylinderGeometry(0.016, 0.016, 0.79, 8), wood, sx * 0.15, 0.395, sz * 0.25, mo);
  M(new THREE.BoxGeometry(0.28, 0.022, 0.5), new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.6 }), -0.02, 0.826, 0, mo);
  const mortSide = drawTex(256, 128, (x, w, h) => { x.fillStyle = '#e48c96'; x.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,248,240,${0.6 + Math.random() * 0.4})`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 0, 7); x.fill(); } for (let i = 0; i < 20; i++) { x.fillStyle = '#5a8a3a'; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); } });
  const mortM = new THREE.MeshStandardMaterial({ map: mortSide, roughness: 0.55 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc86a6a, roughness: 0.5 });
  const mort = M(new THREE.CylinderGeometry(0.085, 0.085, 0.3, 28), [skin, mortM, mortM], -0.04, 0.925, -0.05, mo); mort.rotation.x = Math.PI / 2;
  const slices = [];
  for (let i = 0; i < 3; i++) { const s = M(new THREE.CylinderGeometry(0.083, 0.083, 0.005, 24), [skin, mortM, mortM], 0.05 - i * 0.012, 0.842 + i * 0.006, 0.17 + i * 0.02, mo); s.rotation.z = 0.12; slices.push(s); }
  const paperM = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.85, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
  const paper = M(new THREE.CylinderGeometry(0.095, 0.095, 0.32, 20, 1, true, 0, Math.PI * 1.25), paperM, -0.04, 0.93, -0.05, mo); paper.rotation.set(Math.PI / 2, 0, 0.6);
  const cardTex = drawTex(256, 160, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffd83a'); gr.addColorStop(1, '#ff5a3a'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = '#7a1a8a'; x.font = '900 34px Arial Black,Arial,sans-serif'; x.textAlign = 'center'; x.fillText('GRATTA', w / 2, 52); x.fillText('E VINCI', w / 2, 92); x.fillStyle = '#9aa0a8'; x.fillRect(30, 108, w - 60, 34); });
  const card = M(new THREE.BoxGeometry(0.12, 0.003, 0.075), [blackPl, blackPl, new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.5 }), blackPl, blackPl, blackPl], -0.11, 0.85, 0.06, mo, false); card.rotation.y = 0.5;
  box(MO.x - 0.2, MO.z - 0.31, 10.2, MO.z + 0.31);

  // ---------- 4. Accordion on a stool (lounge) + cats ----------
  const AC = V(6.35, 0, 1.25); // clear of the Gulag bookcase prompt
  const stool = G(AC.x, 0, AC.z);
  M(new THREE.CylinderGeometry(0.17, 0.16, 0.04, 20), wood, 0, 0.45, 0, stool);
  for (let i = 0; i < 3; i++) { const a = i * 2.094; const l = M(new THREE.CylinderGeometry(0.014, 0.018, 0.45, 6), wood, Math.cos(a) * 0.11, 0.225, Math.sin(a) * 0.11, stool); l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); }
  circle(AC.x, AC.z, 0.22);
  const accRed = new THREE.MeshPhysicalMaterial({ color: 0xa8141c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const acc = new THREE.Group(); root.add(acc);
  const accEnds = [], bellows = new THREE.Group(); acc.add(bellows);
  const keysTex = drawTex(64, 256, (x, w, h) => { x.fillStyle = '#f6f2e8'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; for (let i = 0; i < 16; i++) { x.fillRect(0, i * 16, w, 1.5); if ([1, 2, 4, 5, 6].includes(i % 7)) x.fillRect(0, i * 16 - 5, 38, 10); } });
  for (const s of [-1, 1]) {
    const e = M(new THREE.BoxGeometry(0.07, 0.3, 0.26), accRed, s * 0.15, 0, 0, acc); accEnds.push(e);
    const grill = M(new THREE.BoxGeometry(0.004, 0.2, 0.18), brass, s * 0.187, 0.02, 0, acc, false);
    if (s > 0) { const k = M(new THREE.BoxGeometry(0.03, 0.26, 0.045), new THREE.MeshStandardMaterial({ map: keysTex, roughness: 0.4 }), s * 0.12, 0, 0.145, acc, false); k.userData.keys = 1; }
    else for (let i = 0; i < 12; i++) M(new THREE.SphereGeometry(0.008, 6, 4), white, -0.12, -0.1 + (i % 6) * 0.04, 0.133 + Math.floor(i / 6) * 0.0, acc, false).position.z = 0.135;
    grill.userData.s = s;
  }
  for (let i = 0; i < 9; i++) { const f = M(new THREE.BoxGeometry(0.012, 0.29, 0.25), i % 2 ? new THREE.MeshStandardMaterial({ color: 0x1a1214, roughness: 0.7 }) : new THREE.MeshStandardMaterial({ color: 0x6a0a12, roughness: 0.6 }), -0.1 + i * 0.025, 0, 0, bellows); }
  const ACC_REST = V(AC.x, 0.47 + 0.15, AC.z);
  acc.position.copy(ACC_REST); acc.rotation.set(0, 0.3, 0);
  const CATS = [[0xd8872e, 0xa85a18], [0x1c1c22, null], [0xf0ede6, 0xd8872e], [0x8a8a94, 0x5a5a64], [0xe9e2d6, 0x2a2a2a]].map(([c, s]) => { const k = buildCat(c, s); k.g.visible = false; root.add(k.g); return k; });

  // ---------- 5. Radio + barometer (lounge, front wall) ----------
  const RA = V(6.0, 0, 6.62);
  const rt = G(RA.x, 0, RA.z);
  M(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 24), woodLight, 0, 0.6, 0, rt);
  M(new THREE.CylinderGeometry(0.025, 0.03, 0.59, 10), wood, 0, 0.3, 0, rt);
  M(new THREE.CylinderGeometry(0.16, 0.17, 0.02, 20), wood, 0, 0.01, 0, rt);
  const radioFace = drawTex(256, 160, (x, w, h) => {
    x.fillStyle = '#5a3418'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c9b48a'; x.fillRect(14, 14, 140, 132); for (let i = 0; i < 26; i++) { x.fillStyle = 'rgba(80,50,20,.35)'; x.fillRect(14, 18 + i * 5, 140, 2); }
    x.fillStyle = '#efe2b8'; x.fillRect(166, 24, 76, 46); x.fillStyle = '#3a2a1a'; x.font = '10px Arial'; ['MW', '540', '800', '1200', '1600'].forEach((s, i) => x.fillText(s, 170 + i * 14, 40)); x.fillStyle = '#c8202a'; x.fillRect(200, 28, 2, 38);
    for (const yy of [100, 132]) { x.fillStyle = '#2a1a0c'; x.beginPath(); x.arc(204, yy, 13, 0, 7); x.fill(); x.fillStyle = '#c9a24a'; x.beginPath(); x.arc(204, yy, 8, 0, 7); x.fill(); }
  });
  const radio = M(new THREE.BoxGeometry(0.36, 0.22, 0.16), [wood, wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: radioFace, roughness: 0.6 })], 0, 0.723, 0, rt);
  radio.rotation.y = Math.PI; // face -z (into the room)
  const ant = M(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 4), metal, 0.12, 0.98, 0.04, rt, false); ant.rotation.z = -0.4;
  circle(RA.x, RA.z, 0.24);
  const baro = G(6.12, 1.6, 6.985, Math.PI);
  const baroDial = drawTex(256, 256, (x, w, h) => {
    x.fillStyle = '#f4ecd6'; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill();
    x.fillStyle = '#3a2a1a'; x.textAlign = 'center'; x.font = '700 20px Georgia,serif';
    const L = [['TEMPESTA', -2.3], ['PIOGGIA', -1.4], ['VARIABILE', -0.45], ['BELTEMPO', 0.45], ['NEBBIA', 1.4]];
    for (const [s, a] of L) { x.save(); x.translate(128, 128); x.rotate(a); x.fillText(s, 0, -88); x.restore(); }
    for (let i = 0; i <= 40; i++) { const a = -2.4 + i * 0.12; x.save(); x.translate(128, 128); x.rotate(a); x.fillRect(-1, -122, 2, i % 5 ? 8 : 16); x.restore(); }
    x.font = 'italic 16px Georgia,serif'; x.fillText('Bologna e pianura', 128, 190);
  });
  M(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 32), brass, 0, 0, 0.015, baro).rotation.x = Math.PI / 2;
  M(new THREE.CircleGeometry(0.15, 32), new THREE.MeshStandardMaterial({ map: baroDial, roughness: 0.5 }), 0, 0, 0.032, baro, false);
  const needle = new THREE.Group(); needle.position.z = 0.036; baro.add(needle);
  M(new THREE.BoxGeometry(0.006, 0.12, 0.003), blackPl, 0, 0.055, 0, needle, false);
  needle.rotation.z = -0.45;

  // ---------- 6. Madame Zdaura's crystal ball (arcade, left wall) ----------
  const CB = V(-3.15, 0, 5.9); // arcade, back-left corner (the corkboard/phone of caso.js are further front)
  const ct = G(CB.x, 0, CB.z);
  M(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 28), wood, 0, 0.7, 0, ct);
  M(new THREE.CylinderGeometry(0.04, 0.06, 0.69, 10), wood, 0, 0.345, 0, ct);
  const velvet = new THREE.MeshStandardMaterial({ color: 0x3a1066, roughness: 0.9 });
  M(new THREE.CylinderGeometry(0.33, 0.38, 0.28, 28, 1, true), velvet, 0, 0.58, 0, ct).material.side = THREE.DoubleSide;
  M(new THREE.CylinderGeometry(0.33, 0.33, 0.012, 28), velvet, 0, 0.722, 0, ct);
  M(new THREE.CylinderGeometry(0.05, 0.075, 0.05, 16), brass, 0, 0.753, 0, ct);
  const swirl = drawTex(128, 128, (x) => { const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, '#f0d8ff'); gr.addColorStop(0.5, '#8a3ad0'); gr.addColorStop(1, '#2a0848'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(64, 64, 14 + i * 9, i, i + 2.2); x.stroke(); } });
  const ballM = new THREE.MeshStandardMaterial({ map: swirl, emissiveMap: swirl, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.05, transparent: true, opacity: 0.88 });
  const crystal = M(new THREE.SphereGeometry(0.1, 28, 20), ballM, 0, 0.87, 0, ct, false);
  const ballLight = { intensity: 0 }; // no real light: an extra PointLight would cost every lit shader
  for (const s of [-1, 1]) { M(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10), white, s * 0.2, 0.79, 0.08, ct); const fl = M(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb040 }), s * 0.2, 0.865, 0.08, ct, false); fl.scale.y = 1.8; fl.userData.flame = 1; }
  const zSign = drawTex(512, 200, (x, w, h) => { x.fillStyle = '#1a0a2a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#c9a24a'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#e8c86a'; x.textAlign = 'center'; x.font = '700 46px Georgia,serif'; x.fillText('MADAME ZDAURA', w / 2, 82); x.font = 'italic 30px Georgia,serif'; x.fillStyle = '#d9c6ff'; x.fillText('l\'oroscopo · offerta libera', w / 2, 140); });
  { const p = M(new THREE.PlaneGeometry(0.62, 0.24), new THREE.MeshStandardMaterial({ map: zSign, roughness: 0.6 }), -3.595, 1.55, CB.z, root, false); p.rotation.y = Math.PI / 2; }
  circle(CB.x, CB.z, 0.38);

  // ---------- 7. B. Piddy's boombox (Gulag, outside Cesco's cage) ----------
  const BB = V(36.4, 0, 9.62);
  const bb = G(BB.x, 0, BB.z, 0); // speakers + label face the visitor (cage behind)
  M(new THREE.BoxGeometry(0.44, 0.32, 0.34), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 }), 0, 0.16, 0, bb);
  const boom = G(0, 0.32, 0, 0, bb);
  M(new THREE.BoxGeometry(0.44, 0.22, 0.12), blackPl, 0, 0.11, 0, boom);
  const cones = [];
  for (const s of [-1, 1]) { M(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 24), metal, s * 0.13, 0.1, -0.061, boom).rotation.x = Math.PI / 2; const c2 = M(new THREE.CylinderGeometry(0.055, 0.03, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6 }), s * 0.13, 0.1, -0.066, boom); c2.rotation.x = Math.PI / 2; cones.push(c2); }
  M(new THREE.BoxGeometry(0.1, 0.06, 0.01), new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.2, metalness: 0.5 }), 0, 0.12, -0.062, boom);
  M(new THREE.TorusGeometry(0.15, 0.012, 6, 16, Math.PI), metal, 0, 0.22, 0, boom);
  const piddyTex = drawTex(256, 180, (x, w, h) => { x.fillStyle = '#f6f2e4'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.textAlign = 'center'; x.font = '900 40px Impact,Arial Black,sans-serif'; x.fillText('B. PIDDY', w / 2, 56); x.font = '700 22px Arial,sans-serif'; x.fillText('FREESTYLE', w / 2, 96); x.fillText('DI BENVENUTO', w / 2, 124); x.font = 'italic 18px Georgia,serif'; x.fillStyle = '#8a1010'; x.fillText('dal carcere · Casalecchio', w / 2, 160); });
  { const p = M(new THREE.PlaneGeometry(0.26, 0.18), new THREE.MeshStandardMaterial({ map: piddyTex, roughness: 0.9 }), 0, 0.17, -0.172, bb, false); p.rotation.y = Math.PI; }
  box(BB.x - 0.24, BB.z - 0.19, BB.x + 0.24, BB.z + 0.19);

  // ---------- 8. Clothesline with the striped pyjamas (side yard) ----------
  const P1 = V(10.95, 0, 3.2), P2 = V(12.85, 0, 3.2);
  for (const p of [P1, P2]) { M(new THREE.CylinderGeometry(0.035, 0.04, 1.85, 8), wood, p.x, 0.925, p.z); M(new THREE.BoxGeometry(0.06, 0.04, 0.3), wood, p.x, 1.82, p.z); circle(p.x, p.z, 0.08); }
  const lineCurve = new THREE.QuadraticBezierCurve3(V(P1.x, 1.78, P1.z), V((P1.x + P2.x) / 2, 1.58, P1.z), V(P2.x, 1.78, P2.z));
  M(new THREE.TubeGeometry(lineCurve, 24, 0.004, 4), new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.8 }), 0, 0, 0);
  const stripes = drawTex(256, 256, (x, w, h) => { for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#f2efe6' : '#2d4590'; x.fillRect(i * 16, 0, 16, h); } x.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 400; i++) x.fillRect(Math.random() * w, Math.random() * h, 2, 2); });
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
  const pjM = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.85, side: THREE.DoubleSide });
  const pj = new THREE.Group(); root.add(pj);
  const lineY = x => lineCurve.getPoint(clamp((x - P1.x) / (P2.x - P1.x), 0, 1)).y;
  { const shirt = G(11.55, lineY(11.55) - 0.32, P1.z, 0, pj);
    M(new THREE.BoxGeometry(0.46, 0.6, 0.02), pjM, 0, 0, 0, shirt);
    for (const s of [-1, 1]) { const sl = M(new THREE.BoxGeometry(0.34, 0.15, 0.018), pjM, s * 0.36, 0.2, 0, shirt); sl.rotation.z = s * -0.5; }
    M(new THREE.BoxGeometry(0.12, 0.05, 0.022), white, 0, 0.28, 0.003, shirt);
    const pants = G(12.25, lineY(12.25) - 0.4, P1.z, 0, pj);
    M(new THREE.BoxGeometry(0.4, 0.14, 0.02), pjM, 0, 0.33, 0, pants);
    for (const s of [-1, 1]) M(new THREE.BoxGeometry(0.17, 0.62, 0.02), pjM, s * 0.1, -0.03, 0, pants);
    for (const x of [11.4, 11.7, 12.1, 12.4]) M(new THREE.BoxGeometry(0.012, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0xe6b020 }), x, lineY(x) - 0.01, P1.z + 0.012, root, false);
    const sock = M(new THREE.BoxGeometry(0.08, 0.2, 0.015), new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.9 }), 11.15, lineY(11.15) - 0.12, P1.z);
    const tagT = drawTex(200, 120, (x, w, h) => { x.fillStyle = '#fff8dc'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.textAlign = 'center'; x.font = '800 26px Arial,sans-serif'; x.fillText('VENDESI', w / 2, 36); x.font = '18px Georgia,serif'; x.fillText('usato una sola notte', w / 2, 70); x.fillText('prezzo trattabile', w / 2, 98); });
    const tag = M(new THREE.PlaneGeometry(0.16, 0.096), new THREE.MeshStandardMaterial({ map: tagT, roughness: 0.9, side: THREE.DoubleSide }), 11.95, lineY(11.95) - 0.08, P1.z + 0.02, root, false); tag.rotation.z = 0.1; }

  // ---------- 9. Calcetto goal + scoreboard (garden lawn, west) ----------
  const GX0 = -2.0, GX1 = -2.55, GZ0 = 14.25, GZ1 = 15.55, GH = 0.85;
  const post = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35 });
  const P = (x, z, h) => M(new THREE.CylinderGeometry(0.025, 0.025, h, 10), post, x, h / 2, z);
  P(GX0, GZ0, GH); P(GX0, GZ1, GH); P(GX1, GZ0, 0.6); P(GX1, GZ1, 0.6);
  { const cb = M(new THREE.CylinderGeometry(0.025, 0.025, GZ1 - GZ0, 10), post, GX0, GH, (GZ0 + GZ1) / 2); cb.rotation.x = Math.PI / 2; }
  const netTex = drawTex(64, 64, (x) => { x.clearRect(0, 0, 64, 64); x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 5; for (let i = 0; i <= 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); } });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(6, 3);
  const netM = new THREE.MeshStandardMaterial({ map: netTex, alphaTest: 0.12, side: THREE.DoubleSide, roughness: 0.9 });
  { const back = M(new THREE.PlaneGeometry(GZ1 - GZ0, 0.6), netM, GX1, 0.3, (GZ0 + GZ1) / 2, root, false); back.rotation.y = Math.PI / 2;
    const topL = Math.hypot(GX0 - GX1, GH - 0.6); const top = M(new THREE.PlaneGeometry(topL, GZ1 - GZ0), netM, (GX0 + GX1) / 2, (GH + 0.6) / 2, (GZ0 + GZ1) / 2, root, false); top.rotation.set(-Math.PI / 2, Math.atan2(GH - 0.6, GX0 - GX1) * 0, 0); top.rotateY(-Math.atan2(GH - 0.6, GX0 - GX1));
    for (const z of [GZ0, GZ1]) { const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute([GX0, 0, z, GX1, 0, z, GX1, 0.6, z, GX0, 0, z, GX1, 0.6, z, GX0, GH, z], 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 2, 1.4, 0, 0, 2, 1.4, 0, 2], 2)); sg.computeVertexNormals(); M(sg, netM, 0, 0, 0, root, false); } }
  box(GX1 - 0.07, GZ0 - 0.05, GX1 + 0.05, GZ1 + 0.05);
  box(GX1 - 0.05, GZ0 - 0.06, GX0 + 0.02, GZ0 + 0.02); box(GX1 - 0.05, GZ1 - 0.02, GX0 + 0.02, GZ1 + 0.06);
  const SBP = V(-2.3, 0, 16.3);
  M(new THREE.CylinderGeometry(0.03, 0.035, 1.5, 8), wood, SBP.x, 0.75, SBP.z);
  const sbC = cv(512, 280), sbX = sbC.getContext('2d'); const sbT = ctex(sbC);
  const score = { a: 13, b: 13 };
  function drawBoard(flash) {
    const x = sbX, w = 512, h = 280; x.fillStyle = '#16301e'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f2f2f2'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '700 30px Arial,sans-serif'; x.fillText('DERBY DI VIA ZAMBONI', w / 2, 52);
    x.font = '600 22px Arial,sans-serif'; x.fillStyle = '#b8e0c0'; x.fillText('PRIMO PIANO', 128, 100); x.fillText('SECONDO PIANO', 384, 100);
    x.font = '900 96px Arial Black,Arial,sans-serif'; x.fillStyle = flash ? '#ffd83a' : '#fff'; x.fillText(String(score.a), 128, 196); x.fillStyle = '#fff'; x.fillText(String(score.b), 384, 196); x.fillText('–', 256, 190);
    x.font = 'italic 20px Georgia,serif'; x.fillStyle = '#b8e0c0'; x.fillText(score.a > 13 ? 'il secondo piano annuncia ricorso' : 'si gioca da tre ore', w / 2, 252);
    sbT.needsUpdate = true;
  }
  drawBoard(false);
  { const b = G(SBP.x, 1.45, SBP.z, Math.PI / 2); M(new THREE.BoxGeometry(0.84, 0.48, 0.04), wood, 0, 0, -0.022, b); M(new THREE.PlaneGeometry(0.8, 0.44), new THREE.MeshStandardMaterial({ map: sbT, roughness: 0.7 }), 0, 0, 0.001, b, false); }
  circle(SBP.x, SBP.z, 0.1);

  // ---------- 10. Diploma (arcade side of the partition wall) ----------
  const DP = V(4.185, 1.55, 1.2);
  const dipTex = drawTex(640, 460, (x, w, h) => {
    x.fillStyle = '#efe2bc'; x.fillRect(0, 0, w, h); for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(120,90,40,${Math.random() * 0.05})`; x.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    x.strokeStyle = '#8a6a2a'; x.lineWidth = 3; x.strokeRect(22, 22, w - 44, h - 44); x.strokeRect(30, 30, w - 60, h - 60);
    x.fillStyle = '#3a2a12'; x.textAlign = 'center';
    x.font = '600 26px Georgia,serif'; x.fillText('ATENEO DI PIAZZA VERDI', w / 2, 82);
    x.font = '700 50px Georgia,serif'; x.fillText('Diploma di Laurea', w / 2, 150);
    x.font = 'italic 24px Georgia,serif'; x.fillText('conferito allo studente fuori corso dal 1998', w / 2, 200);
    x.fillText('Tesi: «La gestione del tempo»', w / 2, 242);
    x.font = '700 64px Georgia,serif'; x.fillStyle = '#8a1010'; x.fillText('66/110', w / 2, 330);
    x.font = 'italic 20px Georgia,serif'; x.fillStyle = '#3a2a12'; x.fillText('festa fino all\'alba · il relatore era il compagno di banco', w / 2, 384);
    x.fillStyle = '#b8201c'; x.beginPath(); x.arc(w - 96, h - 86, 34, 0, 7); x.fill(); x.fillStyle = '#e8c86a'; x.font = '700 16px Georgia,serif'; x.fillText('1998', w - 96, h - 80);
  });
  const dip = G(DP.x, DP.y, DP.z, -Math.PI / 2);
  M(new THREE.BoxGeometry(0.62, 0.46, 0.03), new THREE.MeshStandardMaterial({ color: 0x2a1a0c, roughness: 0.4, metalness: 0.2 }), 0, 0, 0.0, dip);
  M(new THREE.PlaneGeometry(0.56, 0.4), new THREE.MeshStandardMaterial({ map: dipTex, roughness: 0.8 }), 0, 0, 0.016, dip, false);
  M(new THREE.PlaneGeometry(0.56, 0.4), new THREE.MeshPhysicalMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, roughness: 0.06 }), 0, 0, 0.018, dip, false);

  // ---------- perf: static props are merged by material (few draw calls), the rest keeps frozen matrices ----------
  const flames = [];
  { const ANIM = new Set([pg.g, acc, tort, needle, crystal, boom, pj, steam, paper, ...CATS.map(c => c.g)]);
    ct.traverse(o => { if (o.userData.flame) { ANIM.add(o); flames.push(o); } });
    root.updateMatrixWorld(true);
    const buckets = new Map(), kill = [];
    const walk = o => { if (ANIM.has(o)) return;
      if (o.isMesh && !Array.isArray(o.material) && o.geometry && !o.geometry.morphAttributes.position) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const sc = o.getWorldScale(V()), small = o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z) < 0.045;
        const key = o.material.uuid + (o.castShadow && !small ? 'S' : '') + (o.receiveShadow ? 'R' : '');
        if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(o);
      }
      for (const c of o.children) walk(c); };
    walk(root);
    for (const [key, list] of buckets) {
      if (list.length < 2) continue;
      const geos = list.map(o => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; });
      const mg = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
      if (!mg) continue;
      const mm = new THREE.Mesh(mg, list[0].material); mm.castShadow = key.includes('S'); mm.receiveShadow = key.includes('R'); mm.name = 'cron-merged';
      root.add(mm); kill.push(...list);
    }
    for (const o of kill) o.parent && o.parent.remove(o);
    root.updateMatrixWorld(true);
    const freeze = o => { if (ANIM.has(o)) return; if (o !== root) { o.matrixAutoUpdate = false; o.updateMatrix(); } for (const c of o.children) freeze(c); };
    freeze(root);
    // animated models: merge their rigid parts, only the moving joints keep auto matrices
    mergeLocal(pg.g, new Set([pg.head, ...pg.wings])); mergeLocal(pg.head);
    for (const c of CATS) { mergeLocal(c.g, new Set([c.head, c.tailPiv])); mergeLocal(c.head); }
    mergeLocal(bellows); mergeLocal(acc, new Set([bellows, ...accEnds]));
    const keep = new Set([pg.head, ...pg.wings, ...CATS.flatMap(c => [c.head, c.tailPiv]), bellows, ...accEnds]);
    for (const m of [pg.g, acc, ...CATS.map(c => c.g)]) m.traverse(o => { if (o !== m && !keep.has(o)) { o.matrixAutoUpdate = false; o.updateMatrix(); } }); }

  // ======================================================================== runtime state
  const S = {
    t: 0, ctx: null, W: null, h: null, CM: null,
    pig: { mode: 'perch', t: 0, bob: 0, cool: 0, ang: 0 },
    acc: { held: false, phase: 0 }, cats: [], fog: { on: false, k: 0, base: null, bg: null },
    goal: { armed: true, saveCd: 0, flash: 0 }, pj: { on: false, t: 0, orig: null }, boomK: 0, crystalK: 0, panna: 0, scratchN: 0, won: false,
  };
  const found = id => { try { window.__eggs && window.__eggs.found(id); } catch (e) { } };

  // ---------------------------------------------------------------- caption helper
  let capT = 0;
  function cap(rubric, text, dur = 4, big = false) {
    const el = capEl(); el.querySelector('b').textContent = rubric; el.querySelector('span').textContent = text;
    el.classList.toggle('big', !!big); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(capT); capT = setTimeout(() => el.classList.remove('on'), dur * 1000);
  }

  // ---------------------------------------------------------------- Gratta e Vinci overlay
  const PRIZES = [
    { k: 'mort', txt: 'DUE ETTI DI MORTADELLA', note: 'Il salumiere: «Gli avevo dato anche due etti in omaggio».' },
    { k: 'spritz', txt: 'UNO SPRITZ (2€)', note: 'Da ritirare al carrello del salotto.' },
    { k: 'x', txt: 'RITENTA, SARAI PIÙ FORTUNATO', note: 'Quasi. La mortadella però è buona.' },
    { k: 'isee', txt: 'UN ISEE AGEVOLATO', note: 'Stesso trattamento del piccione delle Due Torri.' },
  ];
  function drawSym(x, k, cx, cy, s) {
    x.save(); x.translate(cx, cy);
    if (k === 'eur') { x.fillStyle = '#e8b820'; x.beginPath(); x.arc(0, 0, s, 0, 7); x.fill(); x.fillStyle = '#7a5a08'; x.font = `900 ${s * 1.3}px Arial Black,Arial,sans-serif`; x.textAlign = 'center'; x.fillText('€', 0, s * 0.45); }
    else if (k === 'mort') { x.fillStyle = '#c86a6a'; x.beginPath(); x.arc(0, 0, s, 0, 7); x.fill(); x.fillStyle = '#ec97a0'; x.beginPath(); x.arc(0, 0, s * 0.86, 0, 7); x.fill(); x.fillStyle = '#fff6f0'; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(Math.cos(i * 2.4) * s * 0.5, Math.sin(i * 1.7) * s * 0.5, s * 0.09, 0, 7); x.fill(); } }
    else if (k === 'spritz') { x.fillStyle = '#ff6a1a'; x.beginPath(); x.moveTo(-s * 0.6, -s * 0.6); x.lineTo(s * 0.6, -s * 0.6); x.lineTo(s * 0.25, s * 0.2); x.lineTo(-s * 0.25, s * 0.2); x.fill(); x.fillStyle = '#ddd'; x.fillRect(-2, s * 0.2, 4, s * 0.55); x.fillRect(-s * 0.35, s * 0.72, s * 0.7, 4); }
    else if (k === 'isee') { x.fillStyle = '#7c8592'; x.beginPath(); x.ellipse(0, s * 0.2, s * 0.75, s * 0.5, 0, 0, 7); x.fill(); x.beginPath(); x.arc(s * 0.45, -s * 0.35, s * 0.32, 0, 7); x.fill(); x.fillStyle = '#ff7a1a'; x.beginPath(); x.arc(s * 0.55, -s * 0.4, s * 0.07, 0, 7); x.fill(); }
    else { x.strokeStyle = '#b01a1a'; x.lineWidth = s * 0.25; x.beginPath(); x.moveTo(-s * 0.6, -s * 0.6); x.lineTo(s * 0.6, s * 0.6); x.moveTo(s * 0.6, -s * 0.6); x.lineTo(-s * 0.6, s * 0.6); x.stroke(); }
    x.restore();
  }
  let scratch = null;
  function openScratch(onDone) {
    document.body.dataset.overlay = 'gratta'; // main.js: no pointer lock while an overlay is open (released via input.releaseLock)
    S.scratchN++;
    const jackpot = !S.won && (S.scratchN >= 4 || Math.random() < 0.17);
    const prize = jackpot ? { k: 'eur', txt: 'HAI VINTO 50.000 €!', note: 'Vince 50 mila euro con il Gratta e Vinci incartato nella mortadella.' } : PRIZES[(Math.random() * PRIZES.length) | 0];
    const syms = prize.k === 'x' ? ['mort', 'spritz', 'x'] : [prize.k, prize.k, prize.k];
    const ov = document.createElement('div'); ov.id = 'gratta';
    ov.innerHTML = '<div class="wrap"><div class="card"><canvas class="bot" width="880" height="560"></canvas><canvas class="top" width="880" height="560"></canvas></div><div class="res"></div><div class="tip">Gratta con il mouse (o il dito) · <kbd>Esc</kbd> per chiudere</div></div>';
    capEl(); document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('on'));
    const bot = ov.querySelector('.bot'), top = ov.querySelector('.top'), res = ov.querySelector('.res');
    const b = bot.getContext('2d'), t = top.getContext('2d'), W2 = 880, H2 = 560;
    // card art
    const gr = b.createLinearGradient(0, 0, W2, H2); gr.addColorStop(0, '#ffd83a'); gr.addColorStop(0.55, '#ff8a2a'); gr.addColorStop(1, '#c8202a'); b.fillStyle = gr; b.fillRect(0, 0, W2, H2);
    b.fillStyle = '#5a0a6a'; b.font = '900 64px Arial Black,Arial,sans-serif'; b.textAlign = 'center'; b.fillText('GRATTA E VINCI', W2 / 2, 86);
    b.font = 'italic 700 30px Georgia,serif'; b.fillStyle = '#fff6e0'; b.fillText('La Mortadella Fortunata · Casalecchio', W2 / 2, 132);
    b.fillStyle = 'rgba(255,255,255,.92)'; b.fillRect(60, 170, W2 - 120, 300); b.strokeStyle = '#5a0a6a'; b.lineWidth = 6; b.strokeRect(60, 170, W2 - 120, 300);
    syms.forEach((k, i) => drawSym(b, k, 200 + i * 240, 290, 70));
    b.fillStyle = '#5a0a6a'; b.font = '700 30px Arial,sans-serif'; b.fillText(prize.txt, W2 / 2, 438);
    b.font = '18px Arial,sans-serif'; b.fillStyle = '#5a0a6a'; b.fillText('Tre simboli uguali vincono. Il gioco è vietato ai minori di 21 ore.', W2 / 2, 528);
    // scratch layer
    const sg = t.createLinearGradient(0, 0, W2, H2); sg.addColorStop(0, '#c9ccd2'); sg.addColorStop(0.5, '#9ea3ab'); sg.addColorStop(1, '#cfd2d8'); t.fillStyle = sg; t.fillRect(60, 170, W2 - 120, 300);
    for (let i = 0; i < 1400; i++) { t.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; t.fillRect(60 + Math.random() * (W2 - 120), 170 + Math.random() * 300, 3, 1); }
    t.fillStyle = 'rgba(70,70,80,.8)'; t.font = '800 40px Arial Black,Arial,sans-serif'; t.textAlign = 'center'; t.fillText('GRATTA QUI', W2 / 2, 330);
    t.globalCompositeOperation = 'destination-out';
    let down = false, last = null, moves = 0, revealed = false;
    const pt = e => { const r = top.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W2, (e.clientY - r.top) / r.height * H2]; };
    const scr = (a, b2) => { t.lineCap = 'round'; t.lineWidth = 54; t.beginPath(); t.moveTo(a[0], a[1]); t.lineTo(b2[0], b2[1]); t.stroke(); if ((moves++ % 4) === 0) S.ctx && S.ctx.audio.sfx('cardscratch'); if (moves % 10 === 0) check(); };
    function check() {
      if (revealed) return;
      const d = t.getImageData(60, 170, W2 - 120, 300).data; let clear = 0, n = 0;
      for (let i = 3; i < d.length; i += 4 * 37) { n++; if (d[i] < 40) clear++; }
      if (clear / n > 0.52) reveal();
    }
    function reveal() {
      if (revealed) return; revealed = true;
      t.globalCompositeOperation = 'source-over'; top.style.transition = 'opacity .5s'; top.style.opacity = '0';
      res.textContent = prize.txt; res.classList.add('on');
      onDone && onDone(prize, jackpot);
    }
    top.addEventListener('pointerdown', e => { down = true; last = pt(e); top.setPointerCapture(e.pointerId); scr(last, [last[0] + 0.1, last[1]]); });
    top.addEventListener('pointermove', e => { if (!down) return; const p = pt(e); scr(last, p); last = p; });
    top.addEventListener('pointerup', () => { down = false; check(); });
    const close = () => { if (!ov.isConnected) return; if (document.body.dataset.overlay === 'gratta') delete document.body.dataset.overlay; ov.classList.remove('on'); setTimeout(() => ov.remove(), 300); scratch = null; };
    scratch = { close, reveal, get revealed() { return revealed; } };
    return scratch;
  }

  // ======================================================================== explore plugin
  function plugin(ctx, W, h) {
    S.ctx = ctx; S.W = W; S.h = h;
    for (const d of SECRETS) { try { window.__eggs && window.__eggs.register(d); } catch (e) { } }
    const { man, dog, audio } = ctx;
    const has = (o, k) => o && typeof o[k] === 'function';
    const fx = () => (h.fx ? h.fx() : null) || (ctx.getFX ? ctx.getFX() : null) || null;
    const busy = () => { if (W.carry) { h.toast('Prima posa l\'estintore'); return true; } W.dancing && W.stopDance && W.stopDance(); return false; };
    const startMode = (kind, extra = {}) => { h.setMode('cron'); S.CM = { kind, t: 0, ...extra }; };
    const tw = towers;
    const items = [
      { id: 'cron-pigeon', label: () => 'Chiedi al piccione di scendere', alt: () => 'Fischia', altAct: () => { audio.sfx('whistle'); if (has(man, 'gesture')) man.gesture('whistle'); pigeonFly(); },
        anchor: () => V(TW.x + 0.75, 0, TW.z + 0.6), top: () => PERCH.clone().add(V(0, 0.45, 0)), range: 1.2,
        act: () => { if (busy()) return; startMode('look', { at: PERCH.clone(), dur: 4.2, cam: { pos: V(TW.x + 2.3, 1.25, TW.z + 2.1), look: PERCH.clone().add(V(0, -0.35, 0)), fov: 46 } }); audio.sfx('coo'); S.pig.bob = 1.4; cap('Centro storico', 'Piccione occupa la cima della Torre degli Asinelli e chiede la residenza. Da tre giorni non si sposta.', 5); setTimeout(() => cap('Centro storico', 'Il Comune valuta di concedergli un ISEE agevolato.', 4), 4200); found('piccione'); } },
      { id: 'cron-tort', label: () => 'Chiedi la panna', alt: () => 'Assaggia il brodo', altAct: tasteBroth,
        anchor: () => V(TT.x - 0.95, 0, TT.z - 0.2), top: () => V(TT.x, 1.35, TT.z), range: 1.1, act: askPanna },
      { id: 'cron-mort', label: () => S.scratchN ? 'Gratta un altro biglietto' : 'Scarta la mortadella', anchor: () => V(MO.x - 0.68, 0, MO.z), top: () => V(MO.x - 0.04, 1.15, MO.z), range: 0.8,
        act: () => { if (busy()) return; h.goTo(V(MO.x - 0.6, 0, MO.z), Math.PI / 2, () => { startMode('scratch'); audio.sfx(S.scratchN ? 'paper' : 'unwrap'); paper.visible = false; }); } },
      { id: 'cron-acc', label: () => 'Suona la fisarmonica', anchor: () => V(AC.x, 0, AC.z + 0.7), top: () => ACC_REST.clone().add(V(0, 0.3, 0)), range: 0.85,
        act: () => { if (busy()) return; h.goTo(V(AC.x, 0, AC.z + 0.67), Math.PI, () => startMode('accPick')); } },
      { id: 'cron-radio', label: () => S.fog.on ? 'Spegni la nebbia' : 'Accendi il meteo', anchor: () => V(RA.x, 0, RA.z - 0.66), top: () => V(RA.x, 1.0, RA.z), range: 0.85, act: toggleFog },
      { id: 'cron-zdaura', label: () => 'Leggi l\'oroscopo', anchor: () => V(CB.x + 0.7, 0, CB.z), top: () => V(CB.x, 1.15, CB.z), range: 0.9,
        act: () => { if (busy()) return; h.goTo(V(CB.x + 0.66, 0, CB.z), -Math.PI / 2, () => { startMode('crystal'); audio.sfx('mystic'); }); } },
      { id: 'cron-piddy', label: () => 'Accendi lo stereo', anchor: () => V(BB.x, 0, BB.z - 0.67), top: () => V(BB.x, 0.95, BB.z), range: 0.9,
        act: () => { if (busy()) return; h.goTo(V(BB.x, 0, BB.z - 0.65), 0, () => { startMode('rap', { line: -1 }); audio.sfx('beat'); cap('Dal carcere', 'B. Piddy accoglie il nuovo compagno di cella con un freestyle di benvenuto', 2.2); }); } },
      { id: 'cron-pj', label: () => S.pj.on ? 'Rimetti il pigiama ad asciugare' : 'Prova il pigiama a righe', anchor: () => V(11.9, 0, P1.z - 0.7), top: () => V(11.9, 1.95, P1.z), range: 1.1, act: togglePJ },
      { id: 'cron-board', label: () => 'Leggi il tabellone', anchor: () => V(SBP.x + 0.75, 0, SBP.z - 0.2), top: () => V(SBP.x, 1.85, SBP.z), range: 1.0,
        act: () => cap('Sport', `Derby di calcetto tra condomini di via Zamboni: ${score.a} a ${score.b}. Tira la pallina in porta per chiudere la partita.`, 5) },
      { id: 'cron-dip', label: () => 'Leggi la pergamena', anchor: () => V(DP.x - 0.62, 0, DP.z), top: () => V(DP.x - 0.05, DP.y + 0.42, DP.z), range: 0.9,
        act: () => { if (busy()) return; h.goTo(V(DP.x - 0.6, 0, DP.z), Math.PI / 2, () => startMode('diploma')); } },
    ];
    function askPanna() {
      if (busy()) return;
      h.goTo(V(TT.x - 0.9, 0, TT.z - 0.2), Math.atan2(TT.x - (TT.x - 0.9), TT.z - (TT.z - 0.2)), () => {
        startMode('panna', { dur: 4.6 }); if (has(man, 'gesture')) man.gesture('shrug');
        cap('Gastronomia', '«Scusi… non ci andrebbe un filo di panna?»', 2.2);
      });
    }
    function tasteBroth() {
      if (busy()) return;
      h.goTo(V(TT.x - 0.9, 0, TT.z - 0.2), Math.atan2(0.9, 0.2), () => { startMode('look', { at: V(TT.x, 0.95, TT.z), dur: 2.4 }); audio.sfx('gulp'); cap('Gastronomia', 'Tortellino da 40 chili in Piazza Maggiore: 900 porzioni in brodo. Questa era la 901.', 4); });
    }
    function toggleFog() {
      S.fog.on = !S.fog.on; audio.sfx('radio');
      if (S.fog.on) { cap('Meteo', 'Nebbia fitta in pianura, 14°C. Visibilità ridotta: possibile confondere i portici con altri portici.', 6); found('nebbia'); }
      else cap('Meteo', 'Domani sole sui colli.', 3);
    }
    function togglePJ() {
      if (busy()) return;
      if (S.pj.on) { setPJ(false); return; }
      h.goTo(V(11.9, 0, P1.z - 0.65), 0, () => { startMode('look', { at: V(11.9, 1.4, P1.z), dur: 1.0, then: () => { setPJ(true); found('pigiama'); cap('Vendesi', 'Pigiama a righe, usato una sola notte. Prezzo trattabile.', 4.5); } }); audio.sfx('pickup'); });
    }
    function pigeonFly(src) {
      if (S.pig.mode !== 'perch' || S.pig.cool > 0) return;
      S.pig.mode = 'fly'; S.pig.t = 0; S.pig.cool = 6;
      const mp = h.manPos(), near = Math.hypot(mp.x - TW.x, mp.z - TW.z) < 7;
      if (near) audio.sfx('flutter');
      if (src === 'dog' || !near) return;
      setTimeout(() => cap('Centro storico', 'Vola via… e torna. Ha chiesto la residenza, non si muove più di così.', 3.5), 2600); found('piccione');
    }
    S.pigeonFly = pigeonFly;
    const pjCache = new Map();
    function pjMat(m0) {
      if (pjCache.has(m0)) return pjCache.get(m0);
      const m = m0.clone(), src = m0.map && m0.map.image;
      const w = (src && src.width) || 512, hh = (src && src.height) || 512, c = cv(w, hh), x = c.getContext('2d');
      const sw = Math.max(6, Math.round(w / 56));
      for (let i = 0; i * sw < w; i++) { x.fillStyle = i % 2 ? '#eeeadf' : '#34509a'; x.fillRect(i * sw, 0, sw, hh); }
      if (src) { x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.55; x.drawImage(src, 0, 0, w, hh); }
      const t2 = new THREE.CanvasTexture(c); if (m0.map) { t2.flipY = m0.map.flipY; t2.colorSpace = m0.map.colorSpace; t2.wrapS = m0.map.wrapS; t2.wrapT = m0.map.wrapT; } else t2.colorSpace = THREE.SRGBColorSpace;
      m.map = t2; m.color && m.color.set(0xffffff); m.roughness = 0.9; m.name = m0.name + '_Pigiama';
      pjCache.set(m0, m); return m;
    }
    function setPJ(on) {
      S.pj.on = on; pj.visible = !on; S.pj.t = 0;
      let n = 0;
      man.model.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const m0 = o.userData.cronMat0 || o.material;
        if (!/Outfit_Top|Outfit_Bottom/.test(m0.name)) return;
        n++;
        if (on) { o.userData.cronMat0 = m0; o.material = pjMat(m0); }
        else if (o.userData.cronMat0) { o.material = o.userData.cronMat0; delete o.userData.cronMat0; }
      });
      if (on && !n) h.toast('Il pigiama non ti entra');
      if (on) { audio.sfx('pickup'); fx() && fx().sparkles && fx().sparkles(h.headPos().add(V(0, -0.4, 0)), 30); }
      else { audio.sfx('pickup'); h.toast('Pigiama restituito: usato due notti, ora vale meno'); }
    }

    // ---------------- mode update ('cron')
    function end() { S.CM = null; h.setMode('explore'); return {}; }
    function update(mode, dt, I, keys) {
      const C = S.CM; if (!C) return end();
      C.t += dt;
      const head = h.headPos(), f = h.fwdOf(W.yaw), side = V(Math.cos(W.yaw), 0, -Math.sin(W.yaw));
      switch (C.kind) {
        case 'look': {
          if (C.t > C.dur || (C.t > 0.6 && (keys.actP || keys.backP))) { const th = C.then; end(); th && th(); return {}; }
          return { lookW: 1, lookAt: C.at };
        }
        case 'panna': {
          if (C.t > 1.9 && !C.boo) { C.boo = 1; audio.sfx('boo'); S.panna = 1.2; cap('Gastronomia', '«LA PANNA?! NEL BRODO?!» — polemica in Piazza Maggiore', 3.2, true); if (has(dog, 'react')) dog.react('bark'); found('tortellino'); fx() && fx().sparkles && fx().sparkles(V(TT.x, 1.1, TT.z), 20); }
          if (C.t > C.dur || (C.t > 2.4 && keys.backP)) return end();
          return { lookW: 1, lookAt: V(TT.x, 0.95, TT.z), leanT: C.t < 1.9 ? 0.12 : 0 };
        }
        case 'scratch': {
          if (!C.open && C.t > 0.55) {
            C.open = true;
            openScratch((prize, jp) => {
              C.revealed = true; C.rt = C.t; found('gratta');
              if (jp) { S.won = true; audio.sfx('life'); fx() && fx().confetti && fx().confetti(h.headPos().add(V(0, 0.5, 0)), 160); cap('Economia', 'Vince 50 mila euro con il Gratta e Vinci incartato nella mortadella!', 5, true); setTimeout(() => cap('Economia', 'Il salumiere di Casalecchio: «Gli avevo dato anche due etti in omaggio».', 4), 5200); if (has(man, 'gesture')) setTimeout(() => man.gesture('cheer'), 200); }
              else { audio.sfx(prize.k === 'x' ? 'whine' : 'coin'); cap('Economia', prize.note, 4); }
            });
          }
          if (C.open && (keys.backP || keys.actP || (C.revealed && C.t - C.rt > 3.2))) { scratch && scratch.close(); return end(); }
          const board = V(MO.x - 0.04, 0.86, MO.z);
          const k = smooth(C.t / 0.5);
          return { rR: { pos: head.clone().addScaledVector(f, 0.34).add(V(0, -0.3, 0)).addScaledVector(side, -0.06), w: k, palm: 'in', grip: 0.5 }, rL: { pos: head.clone().addScaledVector(f, 0.34).add(V(0, -0.32, 0)).addScaledVector(side, 0.1), w: k, palm: 'in', grip: 0.5 }, lookW: 1, lookAt: C.open ? head.clone().addScaledVector(f, 0.4).add(V(0, -0.3, 0)) : board, leanT: 0.1 };
        }
        case 'accPick': {
          const k = smooth(C.t / 0.6);
          if (C.t > 0.65 && !S.acc.held) { S.acc.held = true; audio.sfx('pickup'); }
          if (C.t > 1.0) { S.CM = { kind: 'accPlay', t: 0, phrase: -1, cats: 0, run: false }; S.cats.length = 0; cap('Spettacoli', 'Al Teatro Duse il primo concerto di fisarmonica dedicato ai gatti', 4); return {}; }
          return { rR: { pos: ACC_REST.clone().add(V(-0.17, 0.02, 0)), w: k, palm: 'in', grip: 0.6 }, rL: { pos: ACC_REST.clone().add(V(0.17, 0.02, 0)), w: k, palm: 'in', grip: 0.6 }, lookW: 1, lookAt: ACC_REST, crouchT: 0.25 * k, leanT: 0.25 * k };
        }
        case 'accPlay': {
          const ph = Math.floor(C.t / 3.6);
          if (ph !== C.phrase && ph < 4 && !C.run) { C.phrase = ph; audio.sfx('accordion', ph); }
          const catT = [1.2, 2.0, 2.8, 3.6, 4.4];
          while (C.cats < 5 && C.t > catT[C.cats]) { spawnCat(C.cats); C.cats++; }
          if (!C.run && (C.t > 14.4 || (C.t > 2 && (keys.backP || keys.actP)))) { C.run = true; C.rt = C.t; catsRun(); }
          if (C.run && C.t - C.rt > 2.2) { S.CM = { kind: 'accPut', t: 0 }; return {}; }
          W.yaw = turnTo(W.yaw, 0, dt * 4);
          const c = accPos(head, f), sway = Math.sin(C.t * 5.2) * 0.05;
          return { rR: { pos: c.clone().addScaledVector(side, -0.19 - sway), w: 1, palm: 'in', grip: 0.7 }, rL: { pos: c.clone().addScaledVector(side, 0.19 + sway), w: 1, palm: 'in', grip: 0.7 }, lookW: 0.8, lookAt: head.clone().addScaledVector(f, 1.2).add(V(0, -0.9, 0)), leanT: 0.05 };
        }
        case 'accPut': {
          W.yaw = turnTo(W.yaw, Math.PI, dt * 5);
          const k = 1 - smooth((C.t - 0.9) / 0.5);
          if (C.t < 0.55) { const c = accPos(head, f); return { rR: { pos: c.clone().addScaledVector(side, -0.19), w: 1, palm: 'in', grip: 0.7 }, rL: { pos: c.clone().addScaledVector(side, 0.19), w: 1, palm: 'in', grip: 0.7 }, lookW: 0.5, lookAt: ACC_REST }; }
          if (C.t > 0.95 && S.acc.held) { S.acc.held = false; acc.position.copy(ACC_REST); acc.rotation.set(0, 0.3, 0); bellows.scale.x = 1; audio.sfx('pickup'); }
          if (C.t > 1.5) return end();
          return { rR: { pos: ACC_REST.clone().add(V(-0.17, 0.02, 0)), w: k, palm: 'in', grip: 0.6 }, rL: { pos: ACC_REST.clone().add(V(0.17, 0.02, 0)), w: k, palm: 'in', grip: 0.6 }, lookW: 1, lookAt: ACC_REST, crouchT: 0.25 * k, leanT: 0.2 * k };
        }
        case 'crystal': {
          S.crystalK = smooth(C.t / 0.8) * (1 - smooth((C.t - 4.6) / 0.6));
          if (!C.said && C.t > 1.1) { C.said = 1; const [sg, tx] = HOROSCOPE[(Math.random() * HOROSCOPE.length) | 0]; cap('L\'oroscopo di Madame Zdaura', `${sg}: ${tx}`, 4.6); found('zdaura'); }
          if (C.t > 5.2 || (C.t > 1.5 && keys.backP)) { S.crystalK = 0; return end(); }
          const bp = V(CB.x, 0.9, CB.z), w = smooth(C.t / 0.6) * (1 - smooth((C.t - 4.4) / 0.6));
          return { rR: { pos: bp.clone().add(V(0.1, 0.12, 0.13)), w, palm: 'down', grip: 0.1 }, rL: { pos: bp.clone().add(V(0.1, 0.12, -0.13)), w, palm: 'down', grip: 0.1 }, lookW: 1, lookAt: bp, leanT: 0.25 * w };
        }
        case 'rap': {
          const li = Math.floor((C.t - 1.0) / 1.35);
          if (li >= 0 && li < RAP.length && li !== C.line) { C.line = li; cap('B. Piddy · freestyle di benvenuto', RAP[li], 1.6); }
          if (!C.out && C.t > 1.0 + RAP.length * 1.35 + 0.4) { C.out = 1; cap('Dal carcere', 'Gli chiede di sistemare il termosifone della cella. Lui rifiuta.', 3.4); found('piddy'); }
          S.boomK = C.t < 10.6 ? 1 : 0;
          if (C.t > 12.4 || (C.t > 1 && keys.backP)) { S.boomK = 0; return end(); }
          const nod = Math.sin(C.t * Math.PI * 2 * (92 / 60)) * 0.5 + 0.5;
          return { lookW: 0.8, lookAt: head.clone().addScaledVector(f, 1).add(V(0, -0.25 - nod * 0.35, 0)), leanT: 0.04 + nod * 0.05 };
        }
        case 'diploma': {
          if (!C.party && C.t > 0.6) { C.party = 1; audio.sfx('partyhorn'); fx() && fx().confetti && fx().confetti(V(DP.x - 0.25, DP.y + 0.35, DP.z), 110); if (has(man, 'gesture')) man.gesture('cheer'); cap('Università', 'Fuori corso dal 1998, si laurea con 66: festa fino all\'alba in piazza Verdi', 4.5); found('laurea'); }
          if (C.t > 1.8 && !C.second) { C.second = 1; setTimeout(() => cap('Università', 'Tesi sulla gestione del tempo. In commissione il suo ex compagno di banco, oggi professore.', 4.2), 2600); }
          if (C.t > 3.2 || (C.t > 1 && keys.backP)) return end();
          return { lookW: 1, lookAt: V(DP.x, DP.y, DP.z) };
        }
      }
      return end();
    }
    function accPos(head, f) { return head.clone().addScaledVector(f, 0.3).add(V(0, -0.42, 0)); }
    S.accPos = accPos;
    function spawnCat(i) {
      const base = V(AC.x, 0, AC.z + 0.67), ang = [-60, -30, 0, 30, 55][i] * Math.PI / 180, r = 0.85;
      const p = V(base.x + Math.sin(ang) * r, 0, base.z + Math.cos(ang) * r);
      const c = CATS[i]; c.g.visible = true; c.g.position.copy(p); c.g.scale.setScalar(0.01);
      c.g.rotation.y = Math.atan2(base.x - p.x, base.z - p.z);
      S.cats.push({ c, t: 0, run: false, v: V(), ph: Math.random() * 6 }); audio.sfx('meow', i);
      fx() && fx().sparkles && fx().sparkles(p.clone().add(V(0, 0.15, 0)), 12);
    }
    function catsRun() {
      cap('Spettacoli', 'Pubblico felino entusiasta… fino all\'arrivo delle crocchette!', 3.6); found('gatti'); audio.sfx('meow', 4);
      const exit = level && level.anchors && level.anchors.gardenDoor ? level.anchors.gardenDoor : V(7.7, 0, 7.07);
      for (const k of S.cats) { k.run = true; k.rt = 0; const d = V(exit.x - k.c.g.position.x, 0, exit.z + 1.5 - k.c.g.position.z).normalize(); k.v.copy(d).multiplyScalar(2.6 + Math.random()); k.c.g.rotation.y = Math.atan2(d.x, d.z); }
      if (has(dog, 'setMode')) dog.setMode('goto', { goal: V(exit.x, 0, exit.z - 0.5), speedGoal: 3.0, after: 'idle' });
      if (has(dog, 'react')) dog.react('bark');
    }
    function camera(pose) {
      const C = S.CM; if (!C || W.mode !== 'cron') return null;
      if (C.kind === 'accPlay' || C.kind === 'accPut') { const b = V(AC.x, 0, AC.z + 0.67); return { pos: V(b.x - 1.15, 1.45, b.z + 2.45), look: V(b.x + 0.15, 0.72, b.z + 0.45), fov: 52 }; }
      if (C.kind === 'crystal') return { pos: V(CB.x + 1.0, 1.5, CB.z + 1.3), look: V(CB.x + 0.3, 1.05, CB.z), fov: 48 };
      if (C.cam) return C.cam;
      if (C.kind === 'panna') return { pos: V(TT.x - 0.35, 1.65, TT.z - 1.75), look: V(TT.x - 0.45, 1.0, TT.z - 0.15), fov: 50 };
      if (C.kind === 'rap') return { pos: V(BB.x + 1.7, 1.75, BB.z - 1.25), look: V(BB.x - 0.1, 0.95, BB.z - 0.35), fov: 56 };
      if (C.kind === 'diploma') return { pos: V(DP.x - 1.55, 1.7, DP.z + 0.95), look: V(DP.x - 0.1, 1.45, DP.z), fov: 48 };
      return null;
    }
    return { items, owns: m => m === 'cron', update, camera };
  }

  // ======================================================================== per frame
  const tmpV = V();
  function update(dt, t) {
    const ctx = S.ctx; if (!ctx) return;
    if (ctx.ui && ctx.ui.menuOpen) dt = 0;
    S.t += dt;
    const { man, dog, audio } = ctx, W = S.W;
    // pigeon
    const pgS = S.pig; pgS.cool = Math.max(0, pgS.cool - dt);
    if (pgS.mode === 'perch') {
      pgS.bob = Math.max(0, pgS.bob - dt);
      const b = pgS.bob > 0 ? Math.sin(S.t * 18) : Math.sin(S.t * 2.3) * 0.25;
      pg.head.position.z = 0.07 + b * 0.012; pg.head.rotation.y = Math.sin(S.t * 0.7) * 0.6;
      pg.wings[0].rotation.z = pg.wings[1].rotation.z = 0;
      pg.g.position.copy(PERCH);
      // flutter if the ball whizzes by or the dog comes close
      const B = W && W.DP && (W.DP.ball || (W.DP.props && W.DP.props.ball));
      if (B && B.mesh && (B.state === 'flying' || B.state === 'rolling')) { const p = B.mesh.position; if (Math.hypot(p.x - TW.x, p.z - TW.z) < 1.7) S.pigeonFly && S.pigeonFly(); }
      if (dog && Math.hypot(dog.root.position.x - TW.x, dog.root.position.z - TW.z) < 0.95) S.pigeonFly && S.pigeonFly('dog');
    } else {
      pgS.t += dt; const T = pgS.t, dur = 4.2;
      const a = T * 1.6, r = 2.4 * smooth(T / 0.8) * (1 - smooth((T - dur + 0.9) / 0.9)), y = PERCH.y + Math.sin(Math.min(T / dur, 1) * Math.PI) * 1.4;
      pg.g.position.set(TW.x + Math.cos(a) * r, y, TW.z + Math.sin(a) * r);
      pg.g.rotation.y = -a; const fl = Math.sin(S.t * 38) * 1.1; pg.wings[0].rotation.z = fl; pg.wings[1].rotation.z = -fl;
      if (T > dur) { pgS.mode = 'perch'; pg.g.rotation.y = 0.9; const mp = S.h.manPos(); if (Math.hypot(mp.x - TW.x, mp.z - TW.z) < 7) audio.sfx('coo'); }
    }
    // steam
    { const pos = steamGeo.attributes.position, arr = pos.array, jig = S.panna > 0 ? 1 : 0;
      for (let i = 0; i < STEAM_N; i++) { const s = steamP[i]; s.t += dt * (1 + jig); if (s.t > s.life) s.t = 0; const k = s.t / s.life; arr[i * 3] = s.base.x + Math.sin(s.t * 2 + i) * 0.03; arr[i * 3 + 1] = s.base.y + k * 0.45; arr[i * 3 + 2] = s.base.z + Math.cos(s.t * 1.7 + i) * 0.03; }
      pos.needsUpdate = true; }
    if (S.panna > 0) { S.panna = Math.max(0, S.panna - dt); const j = Math.sin(S.t * 40) * 0.06 * S.panna; tort.scale.set(1 + j, 1 - j, 1 + j); } else tort.scale.set(1, 1, 1);
    // accordion
    if (S.acc.held) {
      const head = S.h.headPos(), f = tmpV.set(Math.sin(W.yaw), 0, Math.cos(W.yaw));
      acc.position.copy(S.accPos(head, f)); acc.rotation.set(0, W.yaw + Math.PI, 0);
      const playing = S.CM && S.CM.kind === 'accPlay' && !S.CM.run;
      bellows.scale.x = playing ? 1 + Math.sin(S.t * 5.2) * 0.35 : 1; accEnds[0].position.x = -0.15 * bellows.scale.x; accEnds[1].position.x = 0.15 * bellows.scale.x;
    } else { accEnds[0].position.x = -0.15; accEnds[1].position.x = 0.15; }
    // cats
    for (let i = S.cats.length - 1; i >= 0; i--) {
      const k = S.cats[i], g = k.c.g; k.t += dt;
      if (!k.run) { g.scale.setScalar(1.35 * Math.min(1, smooth(k.t / 0.35) * 1.15)); k.c.head.rotation.z = Math.sin(S.t * 2.6 + k.ph) * 0.22; k.c.tailPiv.rotation.y = Math.sin(S.t * 3 + k.ph) * 0.5; g.position.y = Math.abs(Math.sin(S.t * 2.6 + k.ph)) * 0.01; }
      else { k.rt += dt; g.position.addScaledVector(k.v, dt); g.position.y = Math.abs(Math.sin(k.rt * 14)) * 0.04; k.c.tailPiv.rotation.y = 0.6; if (k.rt > 1.6) g.scale.setScalar(1.35 * Math.max(0.001, 1 - (k.rt - 1.6) / 0.6)); if (k.rt > 2.2) { g.visible = false; S.cats.splice(i, 1); } }
    }
    // crystal ball glow + candle flicker
    S.crystalK = S.CM && S.CM.kind === 'crystal' ? S.crystalK : Math.max(0, S.crystalK - dt);
    ballM.emissiveIntensity = 0.25 + S.crystalK * 1.6 + Math.sin(S.t * 3) * 0.05; ballLight.intensity = S.crystalK * 1.2;
    crystal.rotation.y += dt * (0.3 + S.crystalK * 3);
    // boombox pulse
    if (S.boomK > 0) { const beat = Math.pow(Math.max(0, Math.sin(S.t * Math.PI * 2 * (92 / 60))), 8); for (const c of cones) c.scale.set(1 + beat * 0.25, 1, 1 + beat * 0.25); boom.position.y = 0.32 + beat * 0.006; }
    // fog (radio)
    const fog = scene.fog;
    if (fog && fog.isFog) {
      const F = S.fog, inG = level && level.zone === 'Il Gulag';
      F.k += ((F.on && !inG ? 1 : 0) - F.k) * (1 - Math.exp(-dt * 1.2));
      if (F.k > 0.002) {
        if (!F.active) { F.active = true; F.base = { near: fog.near, far: fog.far }; } // whatever the world had when the fog rolled in
        const out = level && level.outdoor;
        fog.near = lerp(F.base.near, out ? 0.6 : 2.2, F.k); fog.far = lerp(F.base.far, out ? 11 : 18, F.k);
        const thick = F.k >= 0.6;
        if (thick !== !!F.swapped) { F.swapped = thick; if (level && level.sky) level.sky.visible = !thick; if (thick) { F.bg = scene.background; scene.background = fog.color; } else scene.background = F.bg; }
      } else if (F.active) { F.active = false; F.k = 0; fog.near = F.base.near; fog.far = F.base.far; if (F.swapped) { F.swapped = false; if (level && level.sky) level.sky.visible = true; scene.background = F.bg; } }
      needle.rotation.z = lerp(-0.45, -1.4, F.k);
    }
    // calcetto: goal detection
    { const B = W && W.DP && (W.DP.ball || (W.DP.props && W.DP.props.ball)), Gs = S.goal; Gs.saveCd = Math.max(0, Gs.saveCd - dt); Gs.flash = Math.max(0, Gs.flash - dt);
      if (B && B.mesh) {
        const p = B.holder ? null : B.mesh.position;
        if (p) {
          const inside = p.x < GX0 - 0.03 && p.x > GX1 - 0.1 && p.z > GZ0 && p.z < GZ1 && p.y < GH;
          if (inside && Gs.armed && (B.state === 'flying' || B.state === 'rolling')) {
            Gs.armed = false; score.a++; Gs.flash = 2.4; drawBoard(true); audio.sfx('refwhistle'); setTimeout(() => audio.sfx('goal'), 350);
            ctx.getFX && ctx.getFX() && ctx.getFX().confetti && ctx.getFX().confetti(V(GX0 - 0.2, 1.2, (GZ0 + GZ1) / 2), 80);
            if (score.a === 14) { cap('Sport', 'GOL! Rigore assegnato dall\'amministratore: finisce 14 a 13 dopo tre ore.', 4.5, true); setTimeout(() => cap('Sport', 'Il secondo piano annuncia ricorso.', 3.2), 4700); found('calcetto'); }
            else cap('Sport', `GOL! Via Zamboni, ${score.a} a ${score.b}. Il secondo piano chiede il VAR condominiale.`, 3.5);
            B.vel && B.vel.multiplyScalar(0.25);
          }
          if (!inside && (p.x > GX0 + 0.6 || B.state === 'rest')) Gs.armed = true;
        } else if (B.state === 'mouth' && dog && Gs.saveCd <= 0 && Math.hypot(dog.root.position.x - (GX0 + 0.4), dog.root.position.z - (GZ0 + GZ1) / 2) < 1.0 && S.goal.armed) {
          Gs.saveCd = 8; cap('Sport', 'PARATA DEL CANE! Il portiere del primo piano non sbaglia.', 3); audio.sfx('goal');
        }
      }
      if (Gs.flash > 0 && Math.floor(Gs.flash * 4) % 2 === 0 && !Gs._f) { Gs._f = 1; drawBoard(true); } else if (Gs.flash > 0 && Math.floor(Gs.flash * 4) % 2 === 1 && Gs._f) { Gs._f = 0; drawBoard(false); } }
    // pyjama on the line sways; pyjamas expire
    if (pj.visible) pj.rotation.x = 0;
    if (S.pj.on) { S.pj.t += dt; }
    // caption: step above the desktop toasts (Segreto trovato…) instead of overlapping them
    if ((S._ct = (S._ct || 0) + dt) > 0.2) { S._ct = 0; const el = document.getElementById('ccap');
      if (el && el.classList.contains('on')) { const tz = document.getElementById('toasts'), r = tz && tz.children.length ? tz.getBoundingClientRect() : null;
        const lift = r && r.height > 0 && r.top > innerHeight * 0.45 ? Math.round(innerHeight - r.top + 10) : 0;
        if (lift !== S._lift) { S._lift = lift; el.style.bottom = lift ? lift + 'px' : ''; } } }
    // flames
    if ((S._fl = (S._fl || 0) + dt) > 0.08) { S._fl = 0; for (const o of flames) o.scale.set(1, 1.6 + Math.random() * 0.5, 1); }
  }

  return { root, plugin, update, anchors: { towers: TW, tortellino: TT, mortadella: MO, accordion: AC, radio: RA, zdaura: CB, boombox: BB, pyjamas: V(11.9, 0, P1.z), goal: V(GX0, 0, (GZ0 + GZ1) / 2), diploma: DP }, state: S, setScene(sc) { S.fogRef = sc && sc.fog; } };
}
