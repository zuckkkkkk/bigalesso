// "Il caso della collana" — easter-egg quest from Il Corriere delle Due Torri N.281 (the previous issue).
// Props: two cast-iron radiators (the crochet foulard is stuck behind one), a kitchen credenza in the lounge with
// a moka pot and a jar of ragù (the gold necklace is inside), a corkboard with the paper's small ads and a wall
// phone in the arcade. Calling 112 (phone, or typing 112 on the typewriter) starts IL BLITZ: flashing
// lights, sirens, the dog as "unità cinofila", the paper's timeline as captions, and the case is solved if
// you found both items. Jokes are built around objects only (no imagery of people).
//   const caso = buildCaso(scene, { level, room, low, getFX })   // before createWorld (pushes colliders)
//   plugins.push(casoPlugin(caso));  …  caso.update(dt) every frame
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const LS = 'bigalesso_caso_v1';

const SECRETS = [
  { id: 'n281', name: 'Il numero precedente', desc: 'Hai letto il Corriere N. 281.', hint: 'Accanto al Corriere c\'è anche un numero vecchio.' },
  { id: 'annunci', name: 'Piccoli annunci', desc: 'Cercasi, offresi, vendesi: la bacheca della sala giochi.', hint: 'In sala giochi c\'è una bacheca di sughero.' },
  { id: 'foulard', name: 'Il foulard della nonna', desc: 'Era incastrato dietro un termosifone.', hint: 'Il tecnico lavorava sui termosifoni…' },
  { id: 'collana', name: 'Collana al ragù', desc: 'La collana d\'oro era nel barattolo di ragù.', hint: 'Dove si nasconde una collana d\'oro? Lo dice il Corriere N. 281.' },
  { id: 'blitz', name: 'Blitz all\'alba', desc: 'Hai chiamato il 112.', hint: 'Il telefono della sala giochi funziona. Anche la macchina da scrivere conosce il numero.' },
  { id: 'caffeagenti', name: 'Caffè agli agenti', desc: '«Ho offerto il caffè agli agenti».', hint: 'Durante il blitz fai come il titolare: c\'è una moka in salotto.' },
  { id: 'casorisolto', name: 'Caso risolto', desc: 'Collana e foulard tornano alla signora Adelina.', hint: 'Trova collana e foulard, poi chiama i carabinieri.' },
];
const ADS = [
  ['CERCASI', 'Foulard all\'uncinetto smarrito. Ricompensa: un barattolo di ragù.'],
  ['OFFERTA LAVORO', 'Ditta di via Rizzoli cerca tecnico termoidraulico. Astenersi perditempo e ladri.'],
  ['VENDESI', 'Pigiama a righe, usato una sola notte. Prezzo trattabile.'],
];
const TIMELINE = [
  [0.6, 'Lunedì, 10:30 · Intervento sui termosifoni in zona Mazzini', 'Spariscono collana e foulard'],
  [4.4, 'Lunedì, 12:00 · Il tecnico si dà alla fuga', 'e accusa il titolare'],
  [8.2, 'Giovedì, 16:15 · Le volanti circondano l\'ufficio di via Rizzoli', 'tra lo stupore di passanti e turisti'],
  [12.0, 'Giovedì, 17:40 · Il titolare si dichiara estraneo', 'e fornisce l\'indirizzo'],
  [15.8, 'Venerdì, 5:50 · Blitz dei carabinieri', 'con l\'unità cinofila'],
];
const BLITZ_LEN = 27;

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// crochet granny squares (the foulard)
function grannyTex() {
  const c = cv(256, 256), x = c.getContext('2d');
  const cols = ['#c8324a', '#f2c230', '#3a8a4a', '#2f62b0', '#e8742a', '#8a3aa8', '#e8e0d0'];
  x.fillStyle = '#1c1714'; x.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const cx = i * 64 + 32, cy = j * 64 + 32;
    for (let r = 3; r >= 0; r--) {
      x.fillStyle = cols[(i * 3 + j * 5 + r * 2) % cols.length];
      const s = 9 + r * 6.5; x.fillRect(cx - s, cy - s, s * 2, s * 2);
      x.fillStyle = '#1c1714'; // crochet holes
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; x.fillRect(cx + Math.cos(a) * (s - 3) - 1.5, cy + Math.sin(a) * (s - 3) - 1.5, 3, 3); }
    }
  }
  for (let n = 0; n < 1600; n++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5); }
  const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function noteTex(title, body, tint) {
  const c = cv(256, 200), x = c.getContext('2d');
  x.fillStyle = tint; x.fillRect(0, 0, 256, 200);
  for (let n = 0; n < 500; n++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; x.fillRect(Math.random() * 256, Math.random() * 200, 2, 2); }
  x.strokeStyle = 'rgba(0,0,0,.65)'; x.lineWidth = 3; x.strokeRect(10, 10, 236, 180);
  x.fillStyle = '#16120e'; x.textAlign = 'center';
  x.font = 'bold 24px Georgia, "Times New Roman", serif'; x.fillText(title, 128, 46);
  x.font = '17px Georgia, "Times New Roman", serif';
  const words = body.split(' '); let line = '', y = 82;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > 210) { x.fillText(line, 128, y); y += 22; line = w; } else line = t; }
  x.fillText(line, 128, y);
  return ctex(c);
}

// cast-iron radiator (front faces +z in its local frame)
function radiator(mat, sections = 12) {
  const g = new THREE.Group();
  const colG = new THREE.CylinderGeometry(0.03, 0.03, 0.54, 10);
  const im = new THREE.InstancedMesh(colG, mat, sections * 2); const m4 = new THREE.Matrix4();
  for (let i = 0; i < sections; i++) for (let k = 0; k < 2; k++) { m4.makeTranslation((i - (sections - 1) / 2) * 0.072, 0.4, k ? 0.03 : -0.02); im.setMatrixAt(i * 2 + k, m4); }
  im.castShadow = true; im.receiveShadow = true; g.add(im);
  const w = sections * 0.072;
  for (const y of [0.13, 0.67]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.05, 0.085), mat); b.position.set(0, y, 0.005); b.castShadow = true; g.add(b); }
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.05), mat); f.position.set(s * (w / 2 - 0.06), 0.06, 0); g.add(f); }
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8913a, metalness: 1, roughness: 0.35 });
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), brass); valve.position.set(w / 2 + 0.05, 0.65, 0.01); valve.rotation.z = Math.PI / 2; g.add(valve);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.4 })); knob.position.set(w / 2 + 0.05, 0.7, 0.01); g.add(knob);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.65, 8), mat); pipe.position.set(w / 2 + 0.05, 0.32, 0.01); g.add(pipe);
  g.userData.width = w;
  return g;
}

function loop(pts) { return new THREE.CatmullRomCurve3(pts.map(p => V(...p)), true, 'centripetal'); }
function scarfMesh(tex) {
  const g = new THREE.Group();
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(6, 1);
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  const tailMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide });
  // a chunky crochet collar wrapped around the neck (local frame: +z = chest, +y = up)
  const collar = new THREE.Mesh(new THREE.TubeGeometry(loop([[0, 0.02, -0.08], [-0.075, 0.01, -0.05], [-0.095, -0.01, 0.02], [-0.05, -0.035, 0.09], [0, -0.045, 0.105], [0.05, -0.035, 0.09], [0.095, -0.01, 0.02], [0.075, 0.01, -0.05]]), 48, 0.03, 8, true), mat);
  g.add(collar);
  for (const s of [-1, 1]) { // two tails hanging over the chest, crossed under the knot
    const geo = new THREE.PlaneGeometry(0.085, 0.3, 2, 8); geo.translate(0, -0.15, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, 0.012 * Math.sin(y * 22 + s)); }
    geo.computeVertexNormals();
    const tail = new THREE.Mesh(geo, tailMat); tail.position.set(s * 0.025, -0.05, 0.115); tail.rotation.set(-0.32, s * 0.12, s * 0.16); g.add(tail);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), mat); knot.position.set(0, -0.055, 0.12); knot.scale.set(1.2, 0.9, 0.7); g.add(knot);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function necklaceMesh(gold) {
  const g = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.TubeGeometry(loop([[0, 0.0, -0.08], [-0.075, -0.005, -0.045], [-0.1, -0.035, 0.03], [-0.07, -0.12, 0.15], [0, -0.17, 0.185], [0.07, -0.12, 0.15], [0.1, -0.035, 0.03], [0.075, -0.005, -0.045]]), 64, 0.0045, 6, true), gold);
  g.add(chain);
  const pend = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), gold); pend.position.set(0, -0.195, 0.19); pend.scale.set(1, 1.4, 0.5); g.add(pend);
  return g;
}

export function buildCaso(scene, { level = null, room = null, low = false, getFX = null } = {}) {
  const root = new THREE.Group(); root.name = 'caso'; scene.add(root);
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const paint = new THREE.MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.42, metalness: 0.25 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c45a, metalness: 1, roughness: 0.18, emissive: 0x3a2400, emissiveIntensity: 0.25 });
  const col = (b) => level && level.colliders && level.colliders.push(b);

  // ---- radiators ----
  const radL = radiator(paint, 13); radL.position.set(10.12, 0, 3.6); radL.rotation.y = -Math.PI / 2; root.add(radL);    // lounge, under the window
  const radA = radiator(paint, 10); radA.position.set(-3.53, 0, 4.4); radA.rotation.y = Math.PI / 2; root.add(radA);    // arcade, left wall
  col({ type: 'box', min: [10.0, 3.6 - 0.52], max: [10.2, 3.6 + 0.52] });
  col({ type: 'box', min: [-3.6, 4.4 - 0.42], max: [-3.46, 4.4 + 0.42] });
  // the foulard corner peeking over the top of the lounge radiator
  const granny = grannyTex();
  const peek = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.16, 1, 4), new THREE.MeshStandardMaterial({ map: granny, roughness: 0.95, side: THREE.DoubleSide }));
  { const p = peek.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.02 * Math.cos(p.getY(i) * 12)); peek.geometry.computeVertexNormals(); }
  peek.position.set(radL.userData.width / 2 - 0.12, 0.66, -0.05); peek.rotation.set(-0.35, 0, 0.18); peek.castShadow = true; radL.add(peek);

  // ---- credenza with moka + ragù (lounge, right wall between window and sideboard) ----
  const cred = new THREE.Group(); cred.position.set(9.95, 0, 5.78); cred.rotation.y = -Math.PI / 2; root.add(cred);
  const woodC = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.55 });
  const top = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.35 });
  { const m = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.84, 0.44), woodC)); m.position.set(0, 0.42, 0); cred.add(m); }
  { const m = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.03, 0.47), top)); m.position.set(0, 0.855, 0.01); cred.add(m); }
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.7, 0.012), new THREE.MeshStandardMaterial({ color: 0x7a563a, roughness: 0.5 })); d.position.set(s * 0.225, 0.43, 0.226); cred.add(d);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xb8913a, metalness: 1, roughness: 0.3 })); h.position.set(s * 0.04, 0.55, 0.24); cred.add(h);
  }
  col({ type: 'box', min: [9.7, 5.78 - 0.5], max: [10.2, 5.78 + 0.5] });
  const topY = 0.87;
  // moka (octagonal aluminium)
  const alu = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.9, roughness: 0.32 });
  const moka = new THREE.Group(); moka.position.set(-0.28, topY, 0.05); cred.add(moka);
  { const lo = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.09, 8), alu)); lo.position.y = 0.045; moka.add(lo);
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.02, 8), alu); waist.position.y = 0.1; moka.add(waist);
    const up = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.05, 0.1, 8), alu)); up.position.y = 0.16; moka.add(up);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.04, 0.025, 8), alu); lid.position.y = 0.222; moka.add(lid);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 })); knob.position.y = 0.24; moka.add(knob);
    const hdl = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.085, 0.022), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 })); hdl.position.set(-0.07, 0.16, 0); moka.add(hdl);
    const spout = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 6), alu); spout.position.set(0.05, 0.2, 0); spout.rotation.z = -1.0; moka.add(spout); }
  // two espresso cups
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.25 });
  const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x2a160a, roughness: 0.2 });
  const cups = [];
  const mkCup = () => { const c = new THREE.Group(); const b = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.045, 16, 1, true), cupMat)); b.position.y = 0.025; c.add(b);
    const bt = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), cupMat); bt.rotation.x = -Math.PI / 2; bt.position.y = 0.003; c.add(bt);
    const sau = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.042, 0.008, 20), cupMat)); c.add(sau);
    const liq = new THREE.Mesh(new THREE.CircleGeometry(0.023, 16), coffeeMat); liq.rotation.x = -Math.PI / 2; liq.position.y = 0.038; liq.visible = false; c.add(liq); c.userData.liq = liq; return c; };
  for (let i = 0; i < 2; i++) { const c = mkCup(); c.position.set(-0.05 + i * 0.1, topY, 0.08); cred.add(c); cups.push(c); }
  const handCup = mkCup(); handCup.userData.liq.visible = true; handCup.visible = false; root.add(handCup);
  // jar of ragù with label
  const jar = new THREE.Group(); jar.position.set(0.27, topY, 0.04); cred.add(jar);
  const jarGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, transparent: true, opacity: 0.32, depthWrite: false, clearcoat: 1 });
  { const body = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.13, 24), jarGlass); body.position.y = 0.065; jar.add(body);
    const sauce = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.105, 20), new THREE.MeshStandardMaterial({ color: 0x7a1e0e, roughness: 0.55 }))); sauce.position.y = 0.056; jar.add(sauce);
    const lc = cv(256, 96), lx = lc.getContext('2d'); lx.fillStyle = '#f3e6c4'; lx.fillRect(0, 0, 256, 96); lx.strokeStyle = '#7a1e0e'; lx.lineWidth = 6; lx.strokeRect(6, 6, 244, 84);
    lx.fillStyle = '#7a1e0e'; lx.textAlign = 'center'; lx.font = 'bold 30px Georgia, serif'; lx.fillText('RAGÙ', 128, 44); lx.font = 'italic 18px Georgia, serif'; lx.fillText('della nonna · 2026', 128, 74);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0535, 0.0535, 0.05, 24, 1, true, -1.1, 2.2), new THREE.MeshStandardMaterial({ map: ctex(lc), roughness: 0.7 })); label.position.y = 0.06; jar.add(label); }
  const lid = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0xb8913a, metalness: 0.8, roughness: 0.35 }))); lid.position.y = 0.14; jar.add(lid);
  const lidHome = lid.position.clone();
  const necklace = necklaceMesh(gold); necklace.visible = false; necklace.scale.setScalar(0.5); root.add(necklace);

  // ---- corkboard with the small ads + wall phone (arcade, left wall) ----
  const board = new THREE.Group(); board.position.set(-3.585, 1.52, 2.3); board.rotation.y = Math.PI / 2; root.add(board);
  { const fr = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.66, 0.03), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.6 }))); fr.position.z = 0.015; board.add(fr);
    const cc = cv(256, 176), cx = cc.getContext('2d'); cx.fillStyle = '#b4834e'; cx.fillRect(0, 0, 256, 176);
    for (let n = 0; n < 4000; n++) { cx.fillStyle = `rgba(${60 + Math.random() * 60},${30 + Math.random() * 30},10,${Math.random() * 0.35})`; cx.fillRect(Math.random() * 256, Math.random() * 176, 1.5, 1.5); }
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.58), new THREE.MeshStandardMaterial({ map: ctex(cc), roughness: 0.95 })); cork.position.z = 0.031; board.add(cork);
    const tints = ['#f4efe2', '#f6eaa0', '#e9f0f4'];
    ADS.forEach(([t, b], i) => {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.195), new THREE.MeshStandardMaterial({ map: noteTex(t, b, tints[i]), roughness: 0.9 }));
      n.position.set(-0.29 + i * 0.29, 0.02 - (i % 2) * 0.05, 0.034 + i * 0.0005); n.rotation.z = (i - 1) * 0.06; board.add(n);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), new THREE.MeshStandardMaterial({ color: ['#d22', '#1a6ad8', '#2a9a3a'][i], roughness: 0.3 })); pin.position.set(n.position.x, n.position.y + 0.085, 0.045); board.add(pin);
    });
    const hc = cv(256, 48), hx = hc.getContext('2d'); hx.fillStyle = '#f4efe2'; hx.fillRect(0, 0, 256, 48); hx.fillStyle = '#16120e'; hx.font = 'bold 22px Georgia, serif'; hx.textAlign = 'center'; hx.fillText('PICCOLI ANNUNCI · N. 281', 128, 32);
    const hd = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.08), new THREE.MeshStandardMaterial({ map: ctex(hc), roughness: 0.9 })); hd.position.set(0, 0.235, 0.034); board.add(hd); }
  const phone = new THREE.Group(); phone.position.set(-3.585, 1.36, 3.25); phone.rotation.y = Math.PI / 2; root.add(phone);
  const bakelite = new THREE.MeshPhysicalMaterial({ color: 0x8a1410, roughness: 0.25, clearcoat: 1 });
  const handset = new THREE.Group();
  { const base = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.07), bakelite)); base.position.z = 0.035; phone.add(base);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 24), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.4 })); dial.rotation.x = Math.PI / 2; dial.position.set(0, -0.035, 0.075); phone.add(dial);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.006, 6, 24), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })); ring.position.set(0, -0.035, 0.083); phone.add(ring);
    const h1 = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.035), bakelite)); handset.add(h1);
    for (const s of [-1, 1]) { const cup = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.03, 14), bakelite)); cup.rotation.x = Math.PI / 2; cup.position.set(0, s * 0.1, 0.018); handset.add(cup); }
    handset.position.set(0.1, 0.0, 0.09); phone.add(handset);
    const cordGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.1, -0.1, 0.09), V(0.09, -0.2, 0.07), V(0.05, -0.18, 0.05), V(0.02, -0.11, 0.04)]), 20, 0.004, 6);
    phone.add(new THREE.Mesh(cordGeo, new THREE.MeshStandardMaterial({ color: 0x2a0806, roughness: 0.5 }))); }
  const handsetHome = { pos: handset.position.clone(), quat: handset.quaternion.clone() };

  // ---- blitz: police lights as a CSS edge glow (no extra PointLight: it would cost every lit shader) ----
  let flashEl = null;
  function flashDiv() {
    if (flashEl) return flashEl;
    const s = document.createElement('style');
    s.textContent = `#caso-flash{position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;mix-blend-mode:screen}
#caso-flash.b{background:radial-gradient(120% 100% at 100% 35%,rgba(40,90,255,.7),rgba(40,90,255,.12) 45%,rgba(40,90,255,0) 70%)}
#caso-flash.r{background:radial-gradient(120% 100% at 0% 35%,rgba(255,40,40,.65),rgba(255,40,40,.12) 45%,rgba(255,40,40,0) 70%)}
#ccap{position:fixed;left:50%;bottom:11vh;transform:translateX(-50%);z-index:7;max-width:min(880px,88vw);text-align:center;pointer-events:none;opacity:0;transition:opacity .5s}
#ccap.on{opacity:1}
body.desk #ccap{bottom:auto;top:12vh}
#ccap b{display:block;font:600 21px/1.3 Georgia,"Times New Roman",serif;color:#fff;text-shadow:0 2px 6px #000,0 0 22px rgba(0,0,0,.7)}
#ccap small{display:block;margin-top:8px;font:500 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.72);text-shadow:0 1px 3px #000}`;
    document.head.appendChild(s);
    flashEl = document.createElement('div'); flashEl.id = 'caso-flash'; document.body.appendChild(flashEl);
    const c = document.createElement('div'); c.id = 'ccap'; c.innerHTML = '<b></b><small></small>'; document.body.appendChild(c);
    return flashEl;
  }
  let capT = 0;
  function caption(big, small = '', dur = 3.4) {
    flashDiv(); const c = document.getElementById('ccap');
    c.querySelector('b').textContent = big; c.querySelector('small').textContent = small;
    c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); capT = dur;
  }

  // steam (tiny instanced puffs)
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
  const steam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), steamMat, 24); steam.count = 0; steam.frustumCulled = false; root.add(steam);
  const puffs = [];

  // ---- persistent progress ----
  let save = {};
  try { save = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { save = {}; }
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(save)); } catch (e) { } };
  if (save.foulard && !save.solved) peek.visible = false;

  const st = { blitz: null, brew: 0, ready: 0, wornF: null, wornN: null, mode: null, siren: null, dogT: 0, lastLine: -1 };
  const caso = {
    root, st, save, peek, radL, radA, jar, lid, moka, cups, handCup, necklace, board, phone, handset,
    granny, gold, caption, ctx: null, W: null, H: null,
  };

  // ---------------------------------------------------------------- helpers bound after attach
  const found = id => { try { window.__eggs && window.__eggs.found(id); } catch (e) { } };
  function wear(which) {
    const c = caso.ctx; if (!c || !c.man || !c.man.bones) return;
    const neck = c.man.bones.Neck || c.man.bones.Spine2; if (!neck) return;
    c.man.root.updateMatrixWorld(true);
    // facing of the upper body (head forward, flattened): the root can disagree with the bones mid-animation
    const hb = c.man.bones.Head, hl = c.man.headLocalFwd;
    const bf = hb && hl ? hl.clone().applyQuaternion(hb.getWorldQuaternion(new THREE.Quaternion())) : V(0, 0, 1).applyQuaternion(c.man.root.getWorldQuaternion(new THREE.Quaternion()));
    const yaw = Math.atan2(bf.x, bf.z);
    const m = which === 'f' ? scarfMesh(granny) : necklaceMesh(gold);
    const np = neck.getWorldPosition(V());
    const fwd = V(Math.sin(yaw), 0, Math.cos(yaw));
    m.position.copy(np).add(V(0, which === 'f' ? 0.06 : 0.03, 0)).addScaledVector(fwd, 0.01);
    m.rotation.set(0, yaw, 0);
    scene.add(m); m.updateMatrixWorld(true); neck.attach(m);
    if (which === 'f') { if (st.wornF) st.wornF.removeFromParent(); st.wornF = m; } else { if (st.wornN) st.wornN.removeFromParent(); st.wornN = m; }
  }
  caso.wear = wear;

  // sirens: two-tone, sustained (WebAudio)
  function siren(audio, dur = 20) {
    const a = audio && audio.ctx; if (!a || audio.muted) return null;
    const t0 = a.currentTime + 0.05;
    const o = a.createOscillator(), o2 = a.createOscillator(); o.type = 'sawtooth'; o2.type = 'triangle';
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1900;
    const g = a.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.045, t0 + 3); g.gain.setValueAtTime(0.045, t0 + dur - 5); g.gain.linearRampToValueAtTime(0, t0 + dur);
    for (let i = 0, t = t0; t < t0 + dur; i++, t += 0.62) { const fr = i % 2 ? 622 : 466; o.frequency.setValueAtTime(fr, t); o2.frequency.setValueAtTime(fr, t); }
    o.connect(f); o2.connect(f); f.connect(g); g.connect(audio.room || audio.master);
    o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.1); o2.stop(t0 + dur + 0.1);
    return { stop() { try { g.gain.cancelScheduledValues(a.currentTime); g.gain.setTargetAtTime(0, a.currentTime, 0.2); } catch (e) { } } };
  }
  function startBlitz() {
    const c = caso.ctx; if (!c || st.blitz) return;
    st.blitz = { t: 0, line: -1, flashT: 0, resolved: false, dogStage: 0 };
    flashDiv();
    st.siren = siren(c.audio, BLITZ_LEN - 3);
    found('blitz');
    if (c.dog && c.dog.react) c.dog.react('bark');
    c.ui && c.ui.toast && c.ui.toast('112 · «Pronto, carabinieri?» Stanno arrivando.', 'gold');
  }
  caso.startBlitz = startBlitz;

  // ---------------------------------------------------------------- per-frame
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  caso.update = function (dt) {
    const c = caso.ctx; if (!c) return;
    const W = caso.W;
    // typewriter: 112 -> blitz (wrap the easter-egg hook once eggs.js has installed it)
    if (W && W.onTyped !== caso._typed) {
      const prev = W.onTyped;
      caso._typed = (buf, ch) => { try { prev && prev(buf, ch); } catch (e) { console.warn(e); } if (/112$/.test(buf)) { if (st.blitz) c.ui.toast('I carabinieri sono già qui'); else startBlitz(); } };
      W.onTyped = caso._typed;
    }
    if (st.rewear && W && W.mode === 'explore' && W.t > 1.5) {
      st.rewear = false;
      if (save.foulard && !st.wornF) wear('f');
      if (save.necklace && !st.wornN) wear('n');
    }
    if (capT > 0) { capT -= dt; if (capT <= 0) { const el = document.getElementById('ccap'); el && el.classList.remove('on'); } }
    // moka: brewing -> ready
    if (st.brew > 0) {
      st.brew -= dt;
      if (Math.random() < dt * 10) puffs.push({ p: moka.localToWorld(V(0.06, 0.21, 0)), v: V((Math.random() - 0.5) * 0.04, 0.16 + Math.random() * 0.08, (Math.random() - 0.5) * 0.04), t: 0, life: 1.6 });
      if (st.brew <= 0) { st.ready = 1; cups.forEach(cu => cu.userData.liq.visible = true); c.audio && c.audio.sfx && c.audio.sfx('ding'); c.ui.toast('Il caffè è pronto. Ma per chi?'); }
    } else if (st.ready && Math.random() < dt * 2.5) puffs.push({ p: cups[0].localToWorld(V(0, 0.05, 0)), v: V(0, 0.1, 0), t: 0, life: 1.4 });
    let k = 0;
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; if (p.t > p.life) { puffs.splice(i, 1); continue; } p.p.addScaledVector(p.v, dt); }
    for (const p of puffs.slice(-24)) { const s = 0.012 + p.t * 0.03; m4.compose(p.p, q, V(s, s, s)); steam.setMatrixAt(k++, m4); }
    if (k || steam.count) { steam.count = k; steam.instanceMatrix.needsUpdate = true; }
    // the blitz
    const B = st.blitz;
    if (B) {
      B.t += dt;
      const on = B.t < BLITZ_LEN - 2;
      // police double-flash: blue blue . red red .
      const ph = (B.t * 2.4) % 2, blue = ph < 1, pulse = on ? Math.max(0, Math.sin((ph % 1) * Math.PI * 2)) : 0;
      const env = smooth(B.t / 1.5) * (1 - smooth((B.t - (BLITZ_LEN - 4)) / 2));
      const mp = c.man.root.position;
      if (flashEl) { flashEl.className = blue ? 'b' : 'r'; flashEl.style.opacity = String(0.9 * pulse * env); }
      // timeline captions
      for (let i = TIMELINE.length - 1; i >= 0; i--) if (B.t >= TIMELINE[i][0]) { if (B.line !== i) { B.line = i; caption(TIMELINE[i][1], TIMELINE[i][2] + ' · Il Corriere N. 281', 3.5); } break; }
      // the dog as "unità cinofila": sniff to what is still hidden, bark there
      const dog = c.dog;
      if (dog && dog.setMode && B.t > 2 && B.dogStage === 0) {
        B.dogStage = 1;
        const target = !save.foulard ? V(9.55, 0, 3.6) : !save.necklace ? V(9.4, 0, 5.9) : mp.clone().add(V(0.7, 0, 0.5));
        B.dogGoal = target; dog.setMode('goto', { goal: target, speedGoal: 2.0, after: 'idle' });
      }
      if (dog && B.dogStage === 1 && B.dogGoal) {
        const dp = dog.root.position; if (Math.hypot(dp.x - B.dogGoal.x, dp.z - B.dogGoal.z) < 0.45 || B.t > 12) {
          B.dogStage = 2; dog.react && dog.react('bark');
          if (!save.foulard) c.ui.toast('L\'unità cinofila punta il termosifone sotto la finestra');
          else if (!save.necklace) c.ui.toast('L\'unità cinofila annusa il barattolo di ragù');
          else c.ui.toast('L\'unità cinofila scodinzola: qui è tutto in regola');
        }
      }
      // resolution
      if (!B.resolved && B.t > 20) {
        B.resolved = true;
        if (save.foulard && save.necklace && !save.solved) {
          save.solved = 1; persist();
          const F = c.getFX && c.getFX(); const hp = c.man.root.position.clone().add(V(0, 1.6, 0));
          F && F.confetti && F.confetti(hp.clone().add(V(0, 0.4, 0)), 160);
          F && F.sparkles && F.sparkles(hp, 50);
          setTimeout(() => { if (st.wornF) { st.wornF.removeFromParent(); st.wornF = null; } if (st.wornN) { st.wornN.removeFromParent(); st.wornN = null; } }, 600);
          caption('«Il foulard me l\'aveva fatto mia nonna nel \'51»', 'Adelina B., 84 anni · Caso risolto', 5.5);
          c.audio && c.audio.sfx && c.audio.sfx('clear');
          found('casorisolto');
        } else if (!save.solved) {
          const miss = [!save.foulard && 'il foulard', !save.necklace && 'la collana'].filter(Boolean);
          caption('Gli agenti se ne vanno: il caso resta aperto', miss.length ? 'Manca ancora ' + miss.join(' e ') : '', 4.5);
        } else caption('Gli agenti ringraziano e se ne vanno', 'Il caso è chiuso da tempo', 3.5);
      }
      if (B.t > BLITZ_LEN) { st.blitz = null; if (flashEl) flashEl.style.opacity = '0'; st.siren && st.siren.stop(); st.siren = null; }
    }
  };
  return caso;
}

// ---------------------------------------------------------------- explore plugin
export function casoPlugin(caso) {
  return (ctx, W, H) => {
    caso.ctx = ctx; caso.W = W; caso.H = H;
    const { audio, ui, man } = ctx;
    const { goTo, setMode, toast, manPos, headPos, handPos, fwdOf } = H;
    const st = caso.st, save = caso.save;
    for (const s of SECRETS) { try { window.__eggs && window.__eggs.register(s); } catch (e) { } }
    const persist = () => { try { localStorage.setItem(LS, JSON.stringify(save)); } catch (e) { } };
    const found = id => { try { window.__eggs && window.__eggs.found(id); } catch (e) { } };
    // restore what the man was wearing (case not yet solved)
    const busy = () => { if (W.carry) { toast('Prima posa l\'estintore'); return true; } W.dancing && W.stopDance && W.stopDance(); return false; };
    const wp = o => o.getWorldPosition(V());
    const radStand = (r, out) => { const p = wp(r); const n = V(0, 0, 1).applyQuaternion(r.getWorldQuaternion(new THREE.Quaternion())); return V(p.x + n.x * out, 0, p.z + n.z * out); };
    const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
    const credStand = () => V(9.42, 0, 5.78);

    const items = [
      { id: 'caso-radL', label: () => 'Controlla il termosifone', anchor: () => radStand(caso.radL, 0.62), top: () => wp(caso.radL).add(V(0, 0.95, 0)), range: 0.9,
        act: () => { if (busy()) return; const s = radStand(caso.radL, 0.62); goTo(s, yawTo(s, wp(caso.radL)), () => { setMode('caso-rad'); st.m = { t: 0, rad: caso.radL, good: true }; }); } },
      { id: 'caso-radA', label: () => 'Controlla il termosifone', anchor: () => radStand(caso.radA, 0.62), top: () => wp(caso.radA).add(V(0, 0.95, 0)), range: 0.9,
        act: () => { if (busy()) return; const s = radStand(caso.radA, 0.62); goTo(s, yawTo(s, wp(caso.radA)), () => { setMode('caso-rad'); st.m = { t: 0, rad: caso.radA, good: false }; }); } },
      { id: 'caso-jar', label: () => save.necklace ? 'Assaggia il ragù' : 'Apri il barattolo di ragù', anchor: () => credStand().add(V(0, 0, 0.27)), top: () => wp(caso.jar).add(V(0, 0.32, 0)), range: 0.8,
        act: () => { if (busy()) return; const s = credStand().add(V(0, 0, 0.27)); goTo(s, Math.PI / 2, () => { setMode('caso-jar'); st.m = { t: 0 }; }); } },
      { id: 'caso-moka', label: () => st.ready && st.blitz ? 'Offri il caffè agli agenti' : st.brew > 0 ? 'Il caffè sta salendo…' : st.ready ? 'Il caffè è pronto' : 'Prepara il caffè',
        anchor: () => credStand().add(V(0, 0, -0.2)), top: () => wp(caso.moka).add(V(0, 0.42, 0)), range: 0.8,
        act: () => {
          if (busy()) return;
          if (st.brew > 0) { toast('Ancora un attimo: la moka borbotta'); return; }
          if (st.ready && st.blitz) { offerCoffee(); return; }
          if (st.ready) { toast('Il caffè è pronto. Magari arriva qualcuno…'); return; }
          const s = credStand().add(V(0, 0, -0.2)); goTo(s, Math.PI / 2, () => { setMode('caso-moka'); st.m = { t: 0 }; });
        } },
      { id: 'caso-board', label: () => 'Leggi gli annunci', anchor: () => V(-3.0, 0, 2.3), top: () => wp(caso.board).add(V(0, 0.45, 0)), range: 0.95,
        act: () => { if (busy()) return; goTo(V(-3.0, 0, 2.3), -Math.PI / 2, () => { setMode('caso-board'); st.m = { t: 0, i: -1 }; }); } },
      { id: 'caso-phone', label: () => st.blitz ? 'I carabinieri sono già qui' : 'Chiama il 112', anchor: () => V(-3.05, 0, 3.25), top: () => wp(caso.phone).add(V(0, 0.3, 0)), range: 0.85,
        act: () => { if (st.blitz) { toast('Sirene in arrivo: sono già qui'); return; } if (busy()) return; goTo(V(-3.05, 0, 3.25), -Math.PI / 2, () => { setMode('caso-phone'); st.m = { t: 0 }; }); } },
    ];
    function offerCoffee() {
      const door = (ctx.level && ctx.level.anchors && ctx.level.anchors.gardenDoor) ? ctx.level.anchors.gardenDoor.clone().add(V(0, 0, -0.55)) : V(7.7, 0, 6.5);
      goTo(door, 0, () => { setMode('caso-offer'); st.m = { t: 0 }; caso.handCup.visible = true; caso.cups[0].visible = false; });
    }
    const END = o => { st.m = null; setMode('explore'); return o || {}; };

    function update(mode, dt, I, keys) {
      const m = st.m; if (!m) return END();
      m.t += dt; const o = {};
      if (mode === 'caso-rad') {
        const top = m.rad.localToWorld(V(m.rad.userData.width / 2 - 0.15, 0.7, -0.02));
        o.crouchT = 0.75; o.leanT = 0.2; o.lookW = 1; o.lookAt = top;
        o.rR = { pos: top.clone().add(V(0, 0.02 + Math.sin(m.t * 9) * 0.015, 0)), w: smooth(m.t / 0.5) * (1 - smooth((m.t - 2.0) / 0.4)), palm: 'down', grip: 0.3 };
        if (m.t > 1.2 && !m.done) {
          m.done = true;
          if (m.good && !save.foulard) {
            save.foulard = 1; persist(); caso.peek.visible = false; audio.sfx && audio.sfx('pickup');
            caso.caption('Il foulard all\'uncinetto!', 'Era incastrato dietro il termosifone · Il Corriere N. 281', 3.6);
            found('foulard'); setTimeout(() => caso.wear('f'), 700);
          } else if (m.good) toast('Dietro il termosifone ora c\'è solo polvere');
          else toast('Solo polvere e un calzino spaiato. Il foulard dev\'essere altrove.');
        }
        if (m.t > 2.45) return END(o);
      } else if (mode === 'caso-jar') {
        const jp = wp(caso.jar);
        o.crouchT = 0.12; o.leanT = 0.32; o.lookW = 1; o.lookAt = jp.clone().add(V(0, 0.1, 0));
        o.rL = { pos: jp.clone().add(V(-0.04, 0.08, -0.07)), w: smooth(m.t / 0.4) * (1 - smooth((m.t - 2.6) / 0.4)), palm: 'in', grip: 0.8 };
        o.rR = { pos: caso.lid.getWorldPosition(V()).add(V(-0.02, 0.03, 0.02)), w: smooth(m.t / 0.4) * (1 - smooth((m.t - 2.6) / 0.4)), palm: 'down', grip: 0.7 };
        const open = smooth((m.t - 0.4) / 0.6) * (1 - smooth((m.t - 2.3) / 0.5));
        caso.lid.position.copy(V(0, 0.14 + open * 0.07, 0)); caso.lid.rotation.y = open * 6; caso.lid.position.x = open * 0.08;
        if (m.t > 1.0 && !m.done) {
          m.done = true;
          if (!save.necklace) {
            save.necklace = 1; persist(); audio.sfx && audio.sfx('power');
            const F = ctx.getFX && ctx.getFX(); F && F.sparkles && F.sparkles(jp.clone().add(V(0, 0.18, 0)), 40);
            caso.necklace.visible = true; m.neck = 1;
            caso.caption('«La collana è stata recuperata in un barattolo di ragù»', 'Il Corriere delle Due Torri · N. 281', 4);
            found('collana');
          } else toast('Buono. Sa leggermente di oro.');
        }
        if (m.neck) { // necklace rises out of the jar, then the man puts it on
          const k = smooth((m.t - 1.0) / 0.8); caso.necklace.position.copy(jp).add(V(0, 0.15 + k * 0.12, 0)); caso.necklace.rotation.y += dt * 2.5;
          if (m.t > 2.1 && caso.necklace.visible) { caso.necklace.visible = false; caso.wear('n'); toast('Collana d\'oro al collo. Andrebbe restituita…'); }
        }
        if (m.t > 3.0) { caso.lid.position.set(0, 0.14, 0); caso.lid.rotation.y = 0; return END(o); }
      } else if (mode === 'caso-moka') {
        const mp = wp(caso.moka);
        o.leanT = 0.3; o.lookW = 1; o.lookAt = mp.clone().add(V(0, 0.12, 0));
        const w = smooth(m.t / 0.4) * (1 - smooth((m.t - 1.6) / 0.4));
        o.rL = { pos: mp.clone().add(V(-0.05, 0.07, -0.06)), w, palm: 'in', grip: 0.8 }; o.rR = { pos: mp.clone().add(V(-0.05, 0.17, 0.06)), w, palm: 'in', grip: 0.8 };
        if (m.t > 1.0 && !m.done) { m.done = true; st.brew = 6; toast('Moka sul fuoco: tra poco sale'); setTimeout(() => gurgle2(), 3800); }
        if (m.t > 2.0) return END(o);
      } else if (mode === 'caso-board') {
        o.lookW = 1; o.lookAt = wp(caso.board).add(V(0, 0.05, 0));
        const i = Math.min(2, Math.floor(m.t / 2.6));
        if (i !== m.i) { m.i = i; caso.caption(ADS[i][0], ADS[i][1], 2.6); audio.sfx && audio.sfx('paper'); }
        if (m.t > 2.6 * 3 - 0.2 || (m.t > 0.8 && (keys.actP || keys.backP))) { found('annunci'); return END(o); }
      } else if (mode === 'caso-phone') {
        const hs = caso.handset;
        const ear = headPos().add(V(0, -0.02, 0)).addScaledVector(V(-Math.cos(W.yaw), 0, Math.sin(W.yaw)), 0.09);
        const lift = smooth((m.t - 0.4) / 0.5) * (1 - smooth((m.t - 3.2) / 0.5));
        o.lookW = 1; o.lookAt = wp(caso.phone);
        o.rR = { pos: lift > 0.05 ? ear : wp(hs), w: smooth(m.t / 0.4) * (1 - smooth((m.t - 3.6) / 0.3)), palm: lift > 0.5 ? 'face' : 'in', grip: 0.85 };
        // the handset follows the hand while lifted
        if (lift > 0.02) { const hp = handPos('Right'); caso.phone.worldToLocal(hp); hs.position.lerpVectors(V(0.1, 0, 0.09), hp, lift); hs.rotation.z = lift * 1.2; }
        else { hs.position.set(0.1, 0, 0.09); hs.rotation.set(0, 0, 0); }
        if (m.t > 0.7 && !m.dial) { m.dial = 1; dial(); }
        if (m.t > 2.4 && !m.done) { m.done = true; caso.caption('«Pronto, 112?»', 'Dall\'altra parte prendono nota', 2.4); }
        if (m.t > 3.9) { hs.position.set(0.1, 0, 0.09); hs.rotation.set(0, 0, 0); caso.startBlitz(); return END(o); }
      } else if (mode === 'caso-offer') {
        const f = fwdOf(W.yaw), hp = headPos();
        const target = hp.clone().addScaledVector(f, 0.42).add(V(0.0, -0.35, 0));
        o.lookW = 1; o.lookAt = hp.clone().addScaledVector(f, 2).add(V(0, -0.1, 0));
        o.rR = { pos: target, w: smooth(m.t / 0.5) * (1 - smooth((m.t - 2.6) / 0.4)), palm: 'up', grip: 0.6 };
        caso.handCup.position.copy(handPos('Right')).add(V(0, 0.02, 0)); caso.handCup.rotation.set(0, W.yaw, 0);
        if (m.t > 1.0 && !m.done) { m.done = true; caso.caption('«Ho offerto il caffè agli agenti»', 'Il titolare, dopo l\'assedio · Il Corriere N. 281', 4); found('caffeagenti'); }
        if (m.t > 3.0) { caso.handCup.visible = false; caso.cups[0].visible = true; st.ready = 0; caso.cups.forEach(cu => cu.userData.liq.visible = false); return END(o); }
      }
      return o;
    }
    function gurgle2() { if (!audio || !audio.noise) return; for (let i = 0; i < 9; i++) audio.noise(0.22, 0.05 + Math.random() * 0.04, 380 + Math.random() * 300, 900, audio.room, i * 0.32 + Math.random() * 0.1, 3, 'bandpass'); }
    function dial() {
      if (!audio) return;
      let t = 0.1; for (const n of [1, 1, 2]) { for (let k = 0; k < n; k++) { const d = t + k * 0.1; setTimeout(() => audio.sfx && audio.sfx('click'), d * 1000); } t += n * 0.1 + 0.4; }
      if (audio.tone) setTimeout(() => audio.tone('sine', 425, 425, 0.8, 0.06, audio.room), 1500);
    }
    // re-wear what was found (and not yet returned) after a reload: done in caso.update once the man walks around
    st.rewear = !save.solved && (save.foulard || save.necklace);
    return { items, owns: m => typeof m === 'string' && m.startsWith('caso-'), update };
  };
}
