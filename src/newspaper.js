// "Il Corriere delle Due Torri" N.313 (+ the previous issue N.281) in the house: folded copies to pick up and
// read (3D spread in the man's hands + reader overlay), and framed prints from the paper on the lounge walls.
// N.281's 3D textures (assets/news281/front.jpg, page3d.jpg) are sanitized: its photo is only shown in the reader.
import * as THREE from 'three';
import { createReader } from './reader.js';
import { smooth, clamp } from './util.js';

export const NEWS_PAGES = 12;
export const newsURL = (f, dir = 'news') => (window.__ASSETS && window.__ASSETS[dir] && window.__ASSETS[dir][f]) || ('./' + dir + '/' + f);
const pageFile = p => `page-${String(p).padStart(2, '0')}.jpg`;
// issues on the tables: N.313 (12 pages, A4) and the previous one, N.281 (a single tall page)
export const ISSUES = {
  313: { id: '313', dir: 'news', n: NEWS_PAGES, label: 'N. 313', sub: 'N. 313 · domenica 22 novembre 2026', asp: 842 / 595, tex3d: p => pageFile(p) },
  281: { id: '281', dir: 'news281', n: 1, label: 'N. 281', sub: 'N. 281 · venerdì 9 ottobre 2026', asp: 6660 / 3720, tex3d: () => 'page3d.jpg' },
};
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PW = 0.28, PH = 0.396; // one page (A4 x1.33)

const texCache = new Map();
const loader = new THREE.TextureLoader();
function tex(file, aniso = 8, dir = 'news') {
  const key = dir + '/' + file;
  if (texCache.has(key)) return texCache.get(key);
  const t = loader.load(newsURL(file, dir)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  texCache.set(key, t); return t;
}
const paperMat = new THREE.MeshStandardMaterial({ color: 0xefe9dc, roughness: 0.92 });
// small (512px) page textures for the 3D spread; the reader overlay shows the full-size images.
// LRU with a cap so flipping through the whole paper doesn't pile up GPU memory.
const pageTexCache = new Map();
function pageTex(p, keep = [], issue = '313') {
  const I = ISSUES[issue] || ISSUES[313];
  if (issue !== '313') p = issue + ':' + p; // cache key (313 keeps plain page numbers)
  if (pageTexCache.has(p)) { const t = pageTexCache.get(p); pageTexCache.delete(p); pageTexCache.set(p, t); return t; }
  const c = document.createElement('canvas'); c.width = 512; c.height = 724;
  const cx = c.getContext('2d'); cx.fillStyle = '#efe9dc'; cx.fillRect(0, 0, 512, 724);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const img = new Image(); img.onload = () => { cx.drawImage(img, 0, 0, 512, 724); t.needsUpdate = true; }; img.src = newsURL(I.tex3d(typeof p === 'string' ? +p.split(':')[1] : p), I.dir);
  pageTexCache.set(p, t);
  for (const [k, v] of pageTexCache) { if (pageTexCache.size <= 6) break; if (k === p || keep.includes(k)) continue; v.dispose(); pageTexCache.delete(k); }
  return t;
}

// a page leaf (front + back) with a gentle curl, pivoting on its spine edge
function leafGeo(w, h, side, curl = 0.012) {
  const g = new THREE.PlaneGeometry(w, h, 12, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + w / 2; p.setX(i, side * x); p.setZ(i, Math.sin(x / w * Math.PI) * curl); }
  g.computeVertexNormals();
  if (side < 0) { // keep UVs readable on the left leaf (x is mirrored)
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}
function makeLeaf(side) {
  const piv = new THREE.Group();
  const front = new THREE.Mesh(leafGeo(PW, PH, side), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  const backG = leafGeo(PW, PH, side); backG.translate(0, 0, -0.0012);
  // flip the back to face -z
  const idx = backG.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; }
  const uv = backG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  backG.computeVertexNormals();
  const back = new THREE.Mesh(backG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  front.castShadow = back.castShadow = true;
  piv.add(front, back);
  return { piv, front, back };
}

function foldedPaper(issue = '313') {
  const I = ISSUES[issue] || ISSUES[313];
  // folded in half (top half of the front page on top), a few sheets thick, slightly bowed
  const g = new THREE.Group();
  const top = new THREE.PlaneGeometry(PW, PH / 2, 10, 4);
  const p = top.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.004 * Math.cos(x / PW * Math.PI) + (y < -PH / 4 + 0.01 ? 0.002 : 0)); }
  top.computeVertexNormals();
  const uv = top.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 + uv.getY(i) * 0.5); // top half of page 1
  const front = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ map: tex('front.jpg', 8, I.dir), roughness: 0.88 }));
  front.rotation.x = -Math.PI / 2; front.position.y = 0.0065; front.castShadow = true; front.receiveShadow = true;
  const body = new THREE.Mesh(new THREE.BoxGeometry(PW, 0.006, PH / 2), paperMat); body.position.y = 0.003; body.castShadow = true; body.receiveShadow = true;
  // fold edge (rounded)
  const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, PW, 8, 1, false, 0, Math.PI), paperMat);
  fold.rotation.z = Math.PI / 2; fold.rotation.x = Math.PI / 2; fold.position.set(0, 0.0035, PH / 4); g.add(fold);
  g.add(body, front);
  return g;
}

// ---------------------------------------------------------------- props + reader
export function buildNewspapers(scene, { room, low = false, audio = null } = {}) {
  const copies = [];
  const add = (parent, local, ry, standOff, id, issue = '313') => {
    const g = foldedPaper(issue); g.position.copy(local); g.rotation.y = ry; parent.add(g);
    parent.updateMatrixWorld(true);
    const c = { id, issue, group: g, parent, home: { pos: g.position.clone(), quat: g.quaternion.clone() }, standOff };
    copies.push(c); return c;
  };
  // arcade: on the glass table, left of the typewriter (N.281 behind it)
  if (room && room.table) { const a = add(room.table, V(-0.31, 0.4495, 0.06), -0.22, 0.56, 'news-arcade'); a.other = add(room.table, V(-0.34, 0.4497, -0.15), 0.12, 0.77, 'news-arcade-281', '281'); }
  // lounge: on the coffee table (world.js: table top ~0.445 at (7.3, 3.0)); N.281 next to it
  { const g = new THREE.Group(); scene.add(g); const a = add(g, V(7.33, 0.4455, 2.97), 0.14, 0.6, 'news-lounge'); a.other = add(g, V(6.99, 0.4457, 3.05), -0.28, 0.52, 'news-lounge-281', '281'); }

  // held spread (shown while reading)
  const held = new THREE.Group(); held.visible = false; scene.add(held);
  const L = makeLeaf(-1), R = makeLeaf(1);
  held.add(L.piv, R.piv);
  L.back.material.map = pageTex(1); R.back.material.map = pageTex(NEWS_PAGES);
  const blank = paperMat;
  function setSpread(a, b, issue = '313') {
    const keep = issue === '313' ? [a, b, 1, NEWS_PAGES].filter(Boolean) : [];
    const set = (leaf, p) => { if (p) { leaf.front.material.map = pageTex(p, keep, issue); leaf.front.material.color.set(0xffffff); } else { leaf.front.material.map = null; leaf.front.material.color.copy(blank.color); } leaf.front.material.needsUpdate = true; };
    set(L, a); set(R, b);
    // closed paper: cover (1) on the outside of the right leaf, last page on the left one
    const n = (ISSUES[issue] || ISSUES[313]).n;
    L.back.material.map = pageTex(n > 1 ? 1 : 1, keep, issue); R.back.material.map = pageTex(n > 1 ? n : 1, keep, issue);
    L.back.material.needsUpdate = R.back.material.needsUpdate = true;
  }
  setSpread(2, 3);
  const reader = createReader({
    issues: Object.values(ISSUES).sort((a, b) => b.id - a.id).map(I => ({
      id: I.id, label: I.label, sub: I.sub, asp: I.asp,
      pages: Array.from({ length: I.n }, (_, i) => newsURL(pageFile(i + 1), I.dir)),
    })),
    sfx: n => audio && audio.sfx(n),
  });
  reader.onView(([a, b], issue) => {
    setSpread(a, b, issue);
    if (issue === '281') { try { window.__eggs && window.__eggs.found('n281'); } catch (e) { } }
  });
  // q: 0 folded (closed) .. 1 open
  function setOpen(q) {
    const e = smooth(q);
    L.piv.rotation.y = -Math.PI + 0.05 + (Math.PI + 0.1) * e; // closes onto the right leaf
    R.piv.rotation.y = -0.15 * e;
    L.piv.position.z = 0.0015 * (1 - e);
  }
  setOpen(0);
  return { copies, held, reader, setOpen, setSpread, update() { } };
}

// ---------------------------------------------------------------- explore plugin
// interactables + 'read' mode (pick up → open → reader overlay → fold → put back)
export function newspaperPlugin(news) {
  return (ctx, W, H) => {
    const { audio, ui, input, man } = ctx;
    const { goTo, setMode, toast, manPos, headPos, fwdOf } = H;
    const items = news.copies.filter(c => c.issue === '313').map(c => ({
      id: c.id,
      label: () => 'Leggi il Corriere',
      alt: () => c.other ? 'Leggi il N. 281' : null,
      anchor: () => standPoint(c),
      top: () => c.group.getWorldPosition(V()).add(V(0, 0.16, 0)),
      range: 0.75,
      act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } start(c); },
      altAct: () => { if (!c.other) return; if (W.carry) { toast('Prima posa l\'estintore'); return; } start(c.other); },
    }));
    function standPoint(c) {
      const p = c.group.getWorldPosition(V());
      return V(p.x, 0, p.z + c.standOff);
    }
    let R = null; // reading state
    function start(c) {
      W.dancing && W.stopDance && W.stopDance();
      const sp = standPoint(c);
      goTo(sp, Math.PI, () => { setMode('read'); R = { c, phase: 0, t: 0, q: 0 }; news.setSpread(c.issue === '281' ? null : 2, c.issue === '281' ? 1 : 3, c.issue); });
    }
    news.reader.onClose(() => { if (R && R.phase === 2) { R.phase = 3; R.t = 0; input.capture = R.prevCapture || null; audio.sfx('paper'); } });

    // reading pose of the spread in front of the chest
    const tmpQ = new THREE.Quaternion(), m4 = new THREE.Matrix4();
    function readPose(out) {
      const yaw = W.yaw, f = fwdOf(yaw), hp = headPos();
      const c = hp.clone().addScaledVector(f, 0.42).add(V(0, -0.3, 0));
      const look = hp.clone().add(V(0, -0.05, 0));
      m4.lookAt(look, c, V(0, 1, 0)); // +z of the spread toward the face
      tmpQ.setFromRotationMatrix(m4);
      // tilt the top away a little (like holding a broadsheet)
      const tilt = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.0);
      out.pos.copy(c); out.quat.copy(tmpQ).multiply(tilt);
      return out;
    }
    const pose = { pos: V(), quat: new THREE.Quaternion() };
    function edge(side, k = 0) { // world pos of the outer edge of the spread (side -1 left, +1 right)
      return news.held.localToWorld(V(side * (PW - 0.02), -0.04 + k, 0.02));
    }

    function update(mode, dt, I, keys) {
      const o = {}; if (!R) { setMode('explore'); return o; }
      R.t += dt; const c = R.c, held = news.held;
      const cPos = c.group.getWorldPosition(V()), cQuat = c.group.getWorldQuaternion(new THREE.Quaternion());
      if (R.phase === 0) { // reach down to the copy
        o.crouchT = 0.5; o.leanT = 0.32; o.lookW = 1; o.lookAt = cPos;
        o.rR = { pos: cPos.clone().add(V(0.05, 0.05, 0.08)), w: smooth(R.t / 0.5), palm: 'down', grip: 0.5 };
        if (R.t > 0.55) {
          R.phase = 1; R.t = 0; audio.sfx('paper');
          c.group.visible = false; held.visible = true; news.setOpen(0);
          // the held paper starts where the folded copy was (it is a closed spread: flip so the cover faces up)
          R.fromP = cPos.clone().add(V(0, 0.02, 0)); R.fromQ = cQuat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2));
        }
      } else if (R.phase === 1) { // lift + unfold
        const k = smooth(R.t / 0.75);
        readPose(pose);
        held.position.lerpVectors(R.fromP, pose.pos, k); held.quaternion.slerpQuaternions(R.fromQ, pose.quat, k);
        news.setOpen(clamp((R.t - 0.3) / 0.6, 0, 1));
        o.crouchT = 0.5 * (1 - k); o.leanT = 0.32 * (1 - k) + 0.06 * k; o.lookW = 1; o.lookAt = held.position.clone();
        held.updateMatrixWorld(true);
        o.rR = { pos: edge(1), w: 1, palm: 'in', grip: 0.7 };
        o.rL = { pos: edge(-1), w: smooth((R.t - 0.25) / 0.4), palm: 'in', grip: 0.7 };
        if (R.t > 0.95) {
          R.phase = 2; R.t = 0;
          R.prevCapture = input.capture;
          input.capture = e => news.reader.key(e);
          news.reader.open(null, c.issue);
          toast(c.issue === '281' ? 'Il numero precedente · Tab per cambiare numero · Esc per chiudere' : '← → per sfogliare · Tab per cambiare numero · Esc per chiudere');
        }
      } else if (R.phase === 2) { // reading
        readPose(pose);
        const sway = Math.sin(W.t * 1.3) * 0.012;
        held.position.copy(pose.pos).add(V(0, Math.sin(W.t * 0.9) * 0.006, 0));
        held.quaternion.copy(pose.quat).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), sway));
        news.setOpen(1); held.updateMatrixWorld(true);
        o.leanT = 0.06; o.lookW = 1; o.lookAt = held.position.clone();
        o.rR = { pos: edge(1), w: 1, palm: 'in', grip: 0.7 }; o.rL = { pos: edge(-1), w: 1, palm: 'in', grip: 0.7 };
        if (!news.reader.isOpen) { R.phase = 3; R.t = 0; }
      } else if (R.phase === 3) { // fold + put back
        const k = smooth(R.t / 0.8);
        readPose(pose);
        if (!R.backFrom) { R.backFrom = held.position.clone(); R.backQ = held.quaternion.clone(); }
        news.setOpen(1 - clamp(R.t / 0.45, 0, 1));
        const toP = cPos.clone().add(V(0, 0.02, 0)), toQ = cQuat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2));
        const k2 = smooth((R.t - 0.3) / 0.6);
        held.position.lerpVectors(R.backFrom, toP, k2); held.quaternion.slerpQuaternions(R.backQ, toQ, k2);
        held.updateMatrixWorld(true);
        o.crouchT = 0.5 * k2; o.leanT = 0.06 + 0.26 * k2; o.lookW = 1; o.lookAt = held.position.clone();
        o.rR = { pos: k2 > 0.5 ? toP.clone().add(V(0.05, 0.05, 0.08)) : edge(1), w: 1 - smooth((R.t - 0.85) / 0.25), palm: k2 > 0.5 ? 'down' : 'in', grip: 0.6 };
        o.rL = { pos: edge(-1), w: 1 - smooth(R.t / 0.4), palm: 'in', grip: 0.7 };
        if (R.t > 0.92 && held.visible) { held.visible = false; c.group.visible = true; audio.sfx('paper'); }
        if (R.t > 1.15) { R = null; setMode('explore'); }
      }
      return o;
    }
    function camera(p, dt) {
      if (W.mode !== 'read' || !R) return null;
      const hp = headPos(), f = fwdOf(W.yaw), rt = V(-Math.cos(W.yaw), 0, Math.sin(W.yaw));
      const target = news.held.visible ? news.held.getWorldPosition(V()) : R.c.group.getWorldPosition(V());
      const pos = hp.clone().add(V(0, 0.4, 0)).addScaledVector(f, -0.5).addScaledVector(rt, 0.55);
      return { pos, look: target, fov: 46 };
    }
    return { items, owns: m => m === 'read', update, camera, get reading() { return !!R; } };
  };
}

// ---------------------------------------------------------------- framed prints in the lounge
export function buildPrints(scene, { low = false } = {}) {
  const g = new THREE.Group(); g.name = 'news-prints'; scene.add(g);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.45, metalness: 0.2 });
  const matMat = new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, roughness: 0.06, envMapIntensity: 1.1 });
  const list = [
    // file, w, h, position, rotation.y (plane faces +z before rotation)
    ['print-over80.jpg', 0.62, 0.62, V(5.35, 1.58, 6.985), Math.PI],          // lounge front wall (faces -z)
    ['print-tortellino.jpg', 0.9, 0.6, V(4.365, 1.6, 6.3), Math.PI / 2],      // partition wall (faces +x)
    ['print-fakenews.jpg', 0.56, 0.74, V(10.185, 1.62, 1.35), -Math.PI / 2],  // right wall (faces -x)
    ['print-ciclostile.jpg', 0.78, 0.52, V(9.6, 1.6, 6.985), Math.PI],         // above the record player
  ];
  for (const [file, w, h, pos, ry] of list) {
    const f = new THREE.Group(); f.position.copy(pos); f.rotation.y = ry; g.add(f);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.028), frameMat); fr.position.z = 0.014; fr.castShadow = true; f.add(fr);
    const mt = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, h + 0.1), matMat); mt.position.z = 0.0285; f.add(mt);
    const t = tex(file, low ? 4 : 8);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); pic.position.z = 0.0295; f.add(pic);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, h + 0.1), glass); gl.position.z = 0.031; f.add(gl);
  }
  return g;
}
