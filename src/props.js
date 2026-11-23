// Interactive props: typewriter rig (keys, typebars, carriage, paper), shell, extinguisher,
// light switch, plus a small fallback particle system used when fx3d.js is not available.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------- typewriter ----------------
export function rigTypewriter(table, roomRef) {
  const tw = (roomRef && roomRef.typewriter) || table.children.find(c => c.isGroup && c.children.length > 10);
  if (!tw) return null;
  const insts = tw.children.filter(c => c.isInstancedMesh);
  const caps = insts.find(m => m.geometry.type === 'CylinderGeometry' && Math.abs((m.geometry.parameters.radiusTop || 0) - 0.0075) < 1e-4);
  const rims = insts.find(m => m.geometry.type === 'TorusGeometry' && m.count === (caps ? caps.count : -1));
  const stems = insts.find(m => m !== caps && m.geometry.type === 'CylinderGeometry' && m.count === (caps ? caps.count : -1));
  const bars = insts.find(m => m.geometry.type === 'BoxGeometry');
  const base = im => { if (!im) return null; const a = []; for (let i = 0; i < im.count; i++) { const m = new THREE.Matrix4(); im.getMatrixAt(i, m); a.push(m); } return a; };
  const capBase = base(caps), rimBase = base(rims), stemBase = base(stems), barBase = base(bars);
  const spaceBar = tw.children.find(c => c.isMesh && c.geometry.type === 'BoxGeometry' && Math.abs((c.geometry.parameters.width || 0) - 0.17) < 1e-3);
  const spaceY = spaceBar ? spaceBar.position.y : 0;
  // carriage = parts above/behind the body (platen, knobs, rail, paper plate, return lever)
  const carriage = new THREE.Group(); carriage.name = 'carriage'; tw.add(carriage);
  const parts = tw.children.filter(c => {
    if (!c.isMesh || c.isInstancedMesh || c === carriage) return false;
    const g = c.geometry, p = g.parameters || {};
    if (g.type === 'TubeGeometry') return true;
    if (c.position.y >= 0.125 && c.position.z < -0.03) {
      if (g.type === 'CylinderGeometry' && p.height < 0.012 && p.radiusTop > 0.02) return false; // ribbon spools
      return true;
    }
    return false;
  });
  for (const p of parts) carriage.attach(p);
  // paper
  const PW = 512, PH = 720, M_PER_PX = 0.17 / PW;
  const pc = document.createElement('canvas'); pc.width = PW; pc.height = PH;
  const px = pc.getContext('2d');
  const paperTex = new THREE.CanvasTexture(pc); paperTex.colorSpace = THREE.SRGBColorSpace; paperTex.anisotropy = 8;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(PW * M_PER_PX, PH * M_PER_PX), new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.92, side: THREE.DoubleSide }));
  const paperPivot = new THREE.Group(); paperPivot.position.set(0, 0.147, -0.07); paperPivot.rotation.x = -0.32; carriage.add(paperPivot);
  paperPivot.add(paper); paper.castShadow = true; paper.receiveShadow = true;
  const charW = 21.5, lineH = 42, marginL = 30, marginT = 62, cols = Math.floor((PW - 2 * marginL) / charW);
  const st = { lines: [''], col: 0, carriageX: 0, carriageTarget: 0, vis: 0, visTarget: 60, keyAnim: new Map(), barAnim: new Map(), inserted: false, dirty: true };
  paperTex.repeat.set(1, 0.01); paperTex.offset.set(0, 0.99);
  function redraw() {
    px.fillStyle = '#f4efe2'; px.fillRect(0, 0, PW, PH);
    const g = px.createLinearGradient(0, 0, PW, 0); g.addColorStop(0, 'rgba(0,0,0,0.05)'); g.addColorStop(0.1, 'rgba(0,0,0,0)'); g.addColorStop(0.9, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
    px.fillStyle = g; px.fillRect(0, 0, PW, PH);
    px.font = 'bold 35px "Courier New", Courier, monospace'; px.textBaseline = 'alphabetic';
    st.lines.forEach((l, i) => {
      for (let c = 0; c < l.length; c++) {
        const ink = 0.75 + ((l.charCodeAt(c) * 37 + c * 11 + i * 7) % 25) / 100;
        px.fillStyle = `rgba(22,18,30,${ink})`;
        px.fillText(l[c], marginL + c * charW + (((c * 13 + i) % 3) - 1) * 0.4, marginT + i * lineH + (((c * 7 + i) % 3) - 1) * 0.5);
      }
    });
    paperTex.needsUpdate = true; st.dirty = false;
  }
  const colX = c => (marginL + c * charW + charW / 2 - PW / 2) * M_PER_PX;
  function layout() {
    st.carriageTarget = -colX(st.col);
    // the sheet comes out of the platen: show the top part of the page down to the current line
    st.visTarget = Math.min(PH, Math.max(PH * 0.62, marginT + (st.lines.length - 1) * lineH + 14));
  }
  redraw(); layout(); paper.visible = false;
  const tmpM = new THREE.Matrix4(), tmpT = new THREE.Matrix4(), tmpR = new THREE.Matrix4();
  function pressKey(ch) {
    if (caps) {
      const i = ch === ' ' ? -1 : Math.abs((ch.toUpperCase().charCodeAt(0) * 7 + 3)) % caps.count;
      if (i >= 0) st.keyAnim.set(i, 0.12);
      else st.space = 0.12;
    }
    if (bars && ch !== ' ') st.barAnim.set(Math.abs(ch.charCodeAt(0) * 5) % bars.count, 0.14);
  }
  function insertPaper() { if (st.inserted) return; st.inserted = true; paper.visible = true; st.vis = 1; }
  function type(ch) {
    insertPaper();
    pressKey(ch);
    let l = st.lines[st.lines.length - 1];
    if (st.col >= cols) return { bell: false, full: true };
    l = l.padEnd(st.col, ' ');
    l = l.slice(0, st.col) + ch + l.slice(st.col + 1);
    st.lines[st.lines.length - 1] = l; st.col++;
    st.dirty = true; layout();
    return { bell: st.col === cols - 6, full: st.col >= cols };
  }
  function newline() {
    insertPaper();
    if ((st.lines.length + 1) * lineH + marginT > PH - 30) { st.lines = ['']; st.col = 0; st.dirty = true; layout(); st.vis = 1; return true; }
    st.lines.push(''); st.col = 0; st.dirty = true; layout(); return false;
  }
  function backspace() { if (st.col > 0) { st.col--; layout(); } }
  function update(dt) {
    if (st.dirty) redraw();
    st.carriageX += (st.carriageTarget - st.carriageX) * Math.min(1, dt * (Math.abs(st.carriageTarget - st.carriageX) > 0.03 ? 7 : 22));
    carriage.position.x = st.carriageX;
    if (st.inserted) {
      st.vis += (st.visTarget - st.vis) * Math.min(1, dt * 6);
      const r = Math.max(0.002, st.vis / PH);
      paper.scale.y = r; paper.position.y = r * PH * M_PER_PX / 2;
      paperTex.repeat.y = r; paperTex.offset.y = 1 - r;
    }
    if (caps) {
      for (const [i, t] of st.keyAnim) {
        const nt = t - dt; const k = Math.max(0, Math.sin(Math.max(0, nt) / 0.12 * Math.PI)) * 0.0045;
        tmpT.makeTranslation(0, -k, 0);
        caps.setMatrixAt(i, tmpM.multiplyMatrices(tmpT, capBase[i]));
        if (rims) rims.setMatrixAt(i, tmpM.multiplyMatrices(tmpT, rimBase[i]));
        if (stems) stems.setMatrixAt(i, tmpM.multiplyMatrices(tmpT, stemBase[i]));
        if (nt <= 0) st.keyAnim.delete(i); else st.keyAnim.set(i, nt);
      }
      caps.instanceMatrix.needsUpdate = true; if (rims) rims.instanceMatrix.needsUpdate = true; if (stems) stems.instanceMatrix.needsUpdate = true;
    }
    if (spaceBar) { st.space = Math.max(0, (st.space || 0) - dt); spaceBar.position.y = spaceY - Math.sin(st.space / 0.12 * Math.PI) * 0.003; }
    if (bars) {
      for (const [i, t] of st.barAnim) {
        const nt = t - dt; const a = Math.sin(Math.max(0, nt) / 0.14 * Math.PI) * 1.1;
        tmpR.makeRotationX(-a);
        bars.setMatrixAt(i, tmpM.multiplyMatrices(barBase[i], tmpR));
        if (nt <= 0) { bars.setMatrixAt(i, barBase[i]); st.barAnim.delete(i); } else st.barAnim.set(i, nt);
      }
      bars.instanceMatrix.needsUpdate = true;
    }
  }
  // world helpers: key area for the hands
  const keyCenter = () => tw.localToWorld(V(0, 0.095, 0.05));
  const keySide = (s) => tw.localToWorld(V(s * 0.065, 0.095, 0.05));
  return { tw, type, newline, backspace, update, keyCenter, keySide, state: st, cols, insertPaper };
}

// ---------------- extinguisher (detachable body) ----------------
export function rigExtinguisher(room) {
  const ext = room.extinguisher || room.room.children.find(c => c.isGroup && c.position.x > 1.0);
  if (!ext) return null;
  ext.updateMatrixWorld(true);
  const body = new THREE.Group(); body.name = 'extinguisherBody';
  const box = new THREE.Box3();
  const parts = ext.children.filter(c => {
    if (!c.isMesh) return false;
    if (c.geometry.type === 'TorusGeometry') return false;
    c.geometry.computeBoundingBox(); box.copy(c.geometry.boundingBox).applyMatrix4(c.matrix);
    const cz = (box.min.z + box.max.z) / 2;
    return box.min.y >= 0.315 && box.max.y <= 0.97 && box.min.x > -0.14 && box.max.x < 0.14 && cz > -0.02;
  });
  body.position.set(0, 0.6, 0.035); ext.add(body); body.updateMatrixWorld(true);
  for (const p of parts) body.attach(p);
  const home = { parent: ext, pos: body.position.clone(), quat: body.quaternion.clone() };
  const nozzleLocal = V(0.09, -0.2, 0.065);
  return { ext, body, home, nozzle: () => body.localToWorld(nozzleLocal.clone()), handle: () => body.localToWorld(V(-0.03, 0.31, 0)), bottom: () => body.localToWorld(V(0.0, -0.12, 0.08)), standPos: () => ext.getWorldPosition(V()) };
}

// ---------------- shell ----------------
export function rigShell(table, roomRef) {
  const sh = (roomRef && roomRef.shell) || table.children.find(c => c.isGroup && c.children.length <= 2 && c.children[0] && c.children[0].isMesh);
  if (!sh) return null;
  return { group: sh, home: { parent: sh.parent, pos: sh.position.clone(), quat: sh.quaternion.clone(), scale: sh.scale.clone() } };
}

// ---------------- light switch (new prop) ----------------
export function buildLightSwitch(scene, pos) {
  const g = new THREE.Group(); g.position.copy(pos); scene.add(g);
  const plateMat = new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.35, clearcoat: 0.6 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.008), plateMat); plate.position.z = 0.004; plate.castShadow = true; g.add(plate);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.006), new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.5 })); frame.position.z = 0.009; g.add(frame);
  const rockerPivot = new THREE.Group(); rockerPivot.position.z = 0.012; g.add(rockerPivot);
  const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.01), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 })); rockerPivot.add(rocker);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.003, 0.002), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff5a20, emissiveIntensity: 0 })); led.position.set(0, -0.006, 0.006); rocker.add(led);
  // conduit to the floor (surface-mounted cable like an old building)
  const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.018, pos.y - 0.05, 0.012), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6 }));
  conduit.position.set(0, -(pos.y - 0.05) / 2 - 0.045, 0.006); conduit.castShadow = true; g.add(conduit);
  let on = true;
  return {
    group: g, get on() { return on; },
    set(v) { on = v; rockerPivot.rotation.x = v ? -0.22 : 0.22; led.material.emissiveIntensity = v ? 0 : 2.2; },
    anchor: () => g.localToWorld(V(0, 0, 0.02)),
  };
}

// ---------------- fallback particles (used only if fx3d.js is absent) ----------------
export function fallbackFX(scene) {
  const mkTex = draw => canvasTex(64, 64, draw);
  const puffTex = mkTex((x, w) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  const heartTex = mkTex(x => { x.fillStyle = '#ff3b6b'; x.beginPath(); x.moveTo(32, 54); x.bezierCurveTo(4, 34, 8, 8, 32, 22); x.bezierCurveTo(56, 8, 60, 34, 32, 54); x.fill(); x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(22, 24, 5, 0, 7); x.fill(); });
  const parts = [];
  const add = (tex, pos, vel, life, size, color = 0xffffff, grow = 0, grav = 0, blend = THREE.NormalBlending) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: blend }));
    m.position.copy(pos); m.scale.setScalar(size); scene.add(m);
    parts.push({ m, vel, life, max: life, size, grow, grav });
  };
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd040, metalness: 1, roughness: 0.25 });
  const coins = [];
  const confCols = [0xc8f03c, 0xf2c400, 0x8a34d0, 0xff3b6b, 0x2a6ad8];
  return {
    fallback: true,
    spray(origin, dir, sec = 0.1) {
      const n = Math.max(1, Math.round(sec * 60));
      for (let i = 0; i < n; i++) {
        const v = dir.clone().multiplyScalar(2.4 + Math.random() * 1.4).add(V((Math.random() - 0.5) * 0.7, (Math.random() - 0.3) * 0.5, (Math.random() - 0.5) * 0.7));
        add(puffTex, origin.clone(), v, 0.9 + Math.random() * 0.6, 0.06, 0xf4f4f8, 0.9, -0.2);
      }
    },
    hearts(pos) { for (let i = 0; i < 3; i++) add(heartTex, pos.clone().add(V((Math.random() - 0.5) * 0.12, 0.05, (Math.random() - 0.5) * 0.12)), V((Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.2, (Math.random() - 0.5) * 0.15), 1.3, 0.06, 0xffffff, 0.02, 0); },
    sparkles(pos) { for (let i = 0; i < 14; i++) add(puffTex, pos.clone(), V((Math.random() - 0.5) * 1.2, Math.random() * 1.2, (Math.random() - 0.5) * 1.2), 0.6, 0.03, 0xfff2a0, -0.03, -1.5, THREE.AdditiveBlending); },
    confetti(pos, n = 80) { for (let i = 0; i < n; i++) add(puffTex, pos.clone(), V((Math.random() - 0.5) * 2.2, 1.5 + Math.random() * 1.8, (Math.random() - 0.5) * 2.2), 2.2, 0.025, confCols[i % confCols.length], 0, -3.2); },
    coin(from, to, onDone) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.002, 20), coinMat); m.rotation.z = Math.PI / 2; m.castShadow = true; scene.add(m);
      coins.push({ m, from: from.clone(), to: to.clone(), t: 0, onDone });
    },
    dust() { }, setNight() { }, pulse() { },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt;
        if (p.life <= 0) { scene.remove(p.m); p.m.material.dispose(); parts.splice(i, 1); continue; }
        p.vel.y += p.grav * dt; p.vel.multiplyScalar(1 - dt * 1.2); p.m.position.addScaledVector(p.vel, dt);
        p.m.scale.setScalar(Math.max(0.005, p.m.scale.x + p.grow * dt));
        p.m.material.opacity = Math.min(1, p.life / p.max * 1.6);
      }
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i]; c.t += dt / 0.55; const k = Math.min(1, c.t);
        c.m.position.lerpVectors(c.from, c.to, k); c.m.position.y += Math.sin(k * Math.PI) * 0.12; c.m.rotation.x += dt * 18;
        if (k >= 1) { scene.remove(c.m); coins.splice(i, 1); c.onDone && c.onDone(); }
      }
    },
  };
}
