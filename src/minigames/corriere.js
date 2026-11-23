// "Corriere AI": the newsroom desk in the arcade (under the left window; anchor 'redazione' overrides). Print a special
// edition of "Il Corriere delle Due Torri" about this session (minigame results, records, achievements): AI headlines,
// offline templates otherwise. The front page is drawn on a canvas in the paper's style, shown in a reader overlay,
// downloadable as JPEG and kept in localStorage (window.__corriereSpeciale + event 'bigalesso:corriere').
import * as THREE from 'three';
import { loadStatic, fitModel } from './zmodel.js';
import { requestWarmup, V, pick, clamp, persona, ask, SAFE, clean, esc, createOverlay, unlock, getRec, myAchievements, sessionLog, logEvent, anchor, cv, canvasTex, banterPool } from './shared.js';

const LS = 'bigalesso_corriere_speciale';
const W0 = 1000, H0 = 1414;
const CSS = `
#mg-corr .cr{position:relative;margin:auto;width:min(1200px,95vw);height:min(760px,92vh);display:grid;grid-template-columns:330px 1fr;gap:0;background:#1b1712;border:1px solid #4a3a24;border-radius:14px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.65);font:14px/1.45 system-ui,sans-serif;color:#efe6d0}
#mg-corr .l{padding:22px;border-right:1px solid #3a2e1c;display:flex;flex-direction:column;gap:12px;overflow:auto}
#mg-corr .l h2{margin:0;font:italic 700 24px Georgia,serif;color:#f3ecdc}#mg-corr .l .s{color:#b9a888;font-size:13px}
#mg-corr .ev{background:rgba(255,255,255,.04);border-radius:8px;padding:10px 12px;font-size:13px;color:#d8ccb0;max-height:220px;overflow:auto}
#mg-corr .ev div{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}
#mg-corr .tones{display:grid;grid-template-columns:1fr 1fr;gap:6px}#mg-corr .tones button.sel{background:#7a1a14;border-color:#e2c271}
#mg-corr .go{background:#a01010!important;border-color:#e2c271!important;font-size:16px!important;text-align:center!important}
#mg-corr .r{position:relative;display:grid;place-items:center;overflow:auto;background:radial-gradient(circle at 50% 30%,#3a3024,#141008)}
#mg-corr .r img{max-height:calc(100% - 30px);max-width:calc(100% - 30px);box-shadow:0 10px 50px rgba(0,0,0,.7);transform-origin:center;transition:transform .2s;cursor:zoom-in}
#mg-corr .r img.z{transform:scale(1.7);cursor:zoom-out}
#mg-corr .r .msg{font:italic 22px Georgia,serif;color:#e8dcc0;text-align:center}
#mg-corr .dl{font-size:13px;color:#e2c271}`;
const TONES = [['cronaca', 'Cronaca'], ['scandalo', 'Scandalo'], ['sport', 'Sport e compettine'], ['epico', 'Epico']];

function wrapLines(x, text, maxW) { const words = String(text).split(/\s+/), out = []; let l = ''; for (const w of words) { const t = l ? l + ' ' + w : w; if (x.measureText(t).width > maxW && l) { out.push(l); l = w; } else l = t; } if (l) out.push(l); return out; }
function justify(x, lines, X, Y, w, lh, last = true) {
  lines.forEach((l, i) => {
    const words = l.split(' ');
    if (i === lines.length - 1 && last || words.length < 2) { x.fillText(l, X, Y + i * lh); return; }
    const tw = words.reduce((a, s) => a + x.measureText(s).width, 0), gap = (w - tw) / (words.length - 1);
    let cx = X; for (const s of words) { x.fillText(s, cx, Y + i * lh); cx += x.measureText(s).width + gap; }
  });
  return Y + lines.length * lh;
}
function illo(x, kind, X, Y, w, h) {
  // a duotone "photo" for the main story
  const g = x.createLinearGradient(X, Y, X, Y + h); g.addColorStop(0, '#5a5248'); g.addColorStop(1, '#2a2620'); x.fillStyle = g; x.fillRect(X, Y, w, h);
  x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip(); x.translate(X + w / 2, Y + h * 0.62);
  x.fillStyle = '#1a1712'; x.strokeStyle = '#d8cfbd'; x.lineWidth = 3;
  if (kind === 'zombata') { for (let i = -2; i <= 2; i++) { x.save(); x.translate(i * 120, Math.abs(i) * -12); x.beginPath(); x.ellipse(0, -110, 34, 40, 0, 0, 7); x.fill(); x.fillRect(-40, -70, 80, 120); x.fillRect(-90, -60, 60, 18); x.fillRect(30, -60, 60, 18); x.fillStyle = '#e8ff60'; x.fillRect(-14, -118, 8, 6); x.fillRect(8, -118, 8, 6); x.fillStyle = '#1a1712'; x.restore(); } x.fillStyle = '#d8cfbd'; x.beginPath(); x.arc(240, -200, 40, 0, 7); x.fill(); }
  else if (kind === 'sushi') { for (let i = -3; i <= 3; i++) { x.save(); x.translate(i * 95, 30); x.fillStyle = '#d8cfbd'; x.beginPath(); x.ellipse(0, 0, 42, 14, 0, 0, 7); x.fill(); x.fillStyle = '#8a8070'; x.fillRect(-26, -22, 52, 18); x.fillStyle = '#3a342c'; x.fillRect(-28, -30, 56, 10); x.restore(); } for (let k = 0; k < 6; k++) { x.fillStyle = '#d8cfbd'; x.fillRect(-320 + k * 4, -40 - k * 14, 70, 10); } }
  else if (kind === 'processo') { x.fillStyle = '#d8cfbd'; x.fillRect(-160, -40, 320, 26); x.save(); x.rotate(-0.5); x.fillRect(-20, -190, 40, 150); x.fillRect(-70, -220, 140, 60); x.restore(); x.font = '900 60px Georgia'; x.textAlign = 'center'; x.fillText('⚖', 230, -150); }
  else if (kind === 'discord') { x.fillStyle = '#d8cfbd'; x.fillRect(-220, -170, 440, 250); x.fillStyle = '#1a1712'; x.fillRect(-206, -156, 412, 222); x.fillStyle = '#d8cfbd'; for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(-170, -120 + i * 42, 14, 0, 7); x.fill(); x.fillRect(-145, -128 + i * 42, 120 + (i * 37) % 90, 14); } x.beginPath(); x.arc(110, -40, 46, 0, 7); x.stroke(); x.beginPath(); x.moveTo(110, -100); x.lineTo(110, 20); x.moveTo(50, -40); x.lineTo(170, -40); x.stroke(); }
  else { x.fillStyle = '#1a1712'; x.fillRect(-120, -260, 240, 320); x.fillStyle = '#d8cfbd'; x.fillRect(-100, -240, 200, 150); x.fillStyle = '#8a8070'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(-60 + (i % 3) * 30, -50 + Math.floor(i / 3) * 26, 9, 0, 7); x.fill(); } }
  x.restore();
  // halftone grain
  x.fillStyle = 'rgba(0,0,0,0.12)'; for (let yy = Y; yy < Y + h; yy += 4) for (let xx = X + ((yy / 4) % 2) * 2; xx < X + w; xx += 4) if (Math.random() < 0.35) x.fillRect(xx, yy, 1.4, 1.4);
}
function renderFront(d) {
  const c = cv(W0, H0), x = c.getContext('2d');
  x.fillStyle = '#f3ecdc'; x.fillRect(0, 0, W0, H0);
  x.fillStyle = 'rgba(120,90,40,0.05)'; for (let i = 0; i < 2600; i++) x.fillRect(Math.random() * W0, Math.random() * H0, 2, 2);
  const ink = '#16130f', red = '#a01010', M = 52;
  x.fillStyle = ink; x.textBaseline = 'alphabetic';
  // masthead
  x.font = 'italic 700 74px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.fillText('Il Corriere delle Due Torri', W0 / 2, 108);
  x.fillRect(M, 126, W0 - 2 * M, 4); x.fillRect(M, 134, W0 - 2 * M, 1.5);
  x.font = '600 17px Georgia, serif'; x.textAlign = 'left'; x.fillText(d.date, M, 160); x.textAlign = 'right'; x.fillText('€ 0,50 · gratis per i membri certificati', W0 - M, 160); x.textAlign = 'center';
  x.fillStyle = red; x.font = '800 18px Georgia, serif'; x.fillText('EDIZIONE SPECIALE · N. ' + d.num, W0 / 2, 160);
  x.fillStyle = ink; x.fillRect(M, 172, W0 - 2 * M, 1.5);
  // kicker + headline
  let y = 214;
  x.fillStyle = red; x.font = '800 22px Georgia, serif'; x.fillText(d.occhiello.toUpperCase(), W0 / 2, y); y += 14;
  x.fillStyle = ink;
  let size = 84; let lines;
  do { x.font = `900 ${size}px Impact, "Arial Narrow", "Arial Black", sans-serif`; lines = wrapLines(x, d.titolo.toUpperCase(), W0 - 2 * M); size -= 4; } while ((lines.length > 3 || lines.some(l => x.measureText(l).width > W0 - 2 * M)) && size > 40);
  for (const l of lines) { y += size + 2; x.fillText(l, W0 / 2, y); }
  y += 46; x.font = 'italic 26px Georgia, serif';
  for (const l of wrapLines(x, d.sommario, W0 - 2 * M - 80).slice(0, 3)) { x.fillText(l, W0 / 2, y); y += 32; }
  y += 8; x.fillRect(M, y, W0 - 2 * M, 1.5); y += 22;
  // picture + caption (left 2/3), records box (right 1/3)
  const PW = 590, PH = 340;
  illo(x, d.kind, M, y, PW, PH);
  x.font = 'italic 15px Georgia, serif'; x.textAlign = 'left'; x.fillStyle = '#4a4238'; x.fillText(clean(d.didascalia, 90), M, y + PH + 22);
  const RX = M + PW + 28, RW = W0 - M - RX;
  x.fillStyle = '#e8dcc0'; x.fillRect(RX, y, RW, PH); x.strokeStyle = ink; x.lineWidth = 2; x.strokeRect(RX, y, RW, PH);
  x.fillStyle = red; x.textAlign = 'center'; { let fs = 26; do { x.font = `900 ${fs}px Impact, "Arial Narrow", sans-serif`; fs -= 1; } while (x.measureText('I RECORD DELLA SERATA').width > RW - 20 && fs > 12); } x.fillText('I RECORD DELLA SERATA', RX + RW / 2, y + 36);
  x.textAlign = 'left'; x.fillStyle = ink; let ry = y + 74;
  for (const [k, v] of d.records) { x.font = '700 17px Georgia, serif'; x.fillText(k, RX + 16, ry); x.textAlign = 'right'; x.font = '900 22px Impact, sans-serif'; x.fillText(v, RX + RW - 16, ry); x.textAlign = 'left'; ry += 40; }
  x.font = 'italic 15px Georgia, serif'; x.fillText(`Obiettivi sbloccati: ${d.ach}`, RX + 16, y + PH - 18);
  y += PH + 78;
  // two articles
  const colW = (W0 - 2 * M - 34) / 2;
  d.articoli.slice(0, 2).forEach((a, i) => {
    const X = M + i * (colW + 34); let yy = y;
    x.fillStyle = ink; x.font = '900 30px Impact, "Arial Narrow", sans-serif'; x.textAlign = 'left';
    for (const l of wrapLines(x, a.titolo, colW).slice(0, 2)) { x.fillText(l, X, yy); yy += 34; }
    yy += 6; x.font = '17px Georgia, serif';
    const all = wrapLines(x, a.testo, colW), maxL = Math.max(3, Math.floor((H0 - 196 - yy) / 24));
    const body = all.slice(0, maxL); if (all.length > maxL) body[maxL - 1] = body[maxL - 1].replace(/\s+\S*$/, '') + '…';
    // drop cap
    justify(x, body, X, yy + 4, colW, 24);
  });
  x.fillRect(M + colW + 16, y - 26, 1.2, Math.max(40, H0 - 140 - 52 - (y - 26)));
  // breve + footer
  const by = H0 - 140; x.fillStyle = ink; x.fillRect(M, by - 26, W0 - 2 * M, 1.5);
  x.fillStyle = red; x.font = '900 20px Impact, sans-serif'; x.fillText('ULTIM\'ORA', M, by + 2);
  x.fillStyle = ink; x.font = 'italic 19px Georgia, serif'; justify(x, wrapLines(x, d.breve, W0 - 2 * M - 140).slice(0, 2), M + 140, by + 2, W0 - 2 * M - 140, 26);
  x.font = '600 13px Georgia, serif'; x.textAlign = 'center'; x.fillStyle = '#5a5045';
  x.fillText('Edizione generata nella sala giochi BIGALESSO · personaggi in versione da gioco, caricature affettuose · ' + (d.ai ? 'testi scritti con l\'AI' : 'testi della redazione'), W0 / 2, H0 - 40);
  return c;
}
function fallbackStory(events, tone) {
  const ev = events.slice().reverse();
  const top = ev.find(e => e.kind !== 'corriere') || null;
  const T = {
    zombata: ['ZOMBATA, SI SOPRAVVIVE', 'Notte di paura sotto i portici: il giocatore tiene botta', 'Seghino: «palese, quanto cazzo sono buono»'],
    quiz: ['QUIZ DEL GRUPPO, VERDETTO SHOCK', 'Chi l\'ha detto? Le frasi della chat tornano a colpire', 'In redazione nessuno ammette nulla'],
    sushi: ['ALL YOU CAN EAT: PIATTI A PERDITA D\'OCCHIO', 'Sfida al nastro trasportatore: il wasabi miete vittime', 'Polleg in allerta'],
    discord: ['COMPETTINA, IL VERDETTO DEL MOUSE', 'Su Discord si decide chi ha i riflessi migliori', '«Era lag, porca troia», dice lo sconfitto'],
    processo: ['PROCESSO DEL SECOLO: SENTENZA STORICA', 'Nel Gulag la corte si pronuncia tra applausi e proteste', 'Fino a tre anni di… birrette'],
  };
  const HL = banterPool('corriere'); if (HL.length && Math.random() < 0.5) { for (const k in T) T[k] = [pick(HL), T[k][1], T[k][2]]; }
  const t = top ? (T[top.kind] || ['SERATA MOVIMENTATA A TELETUBBYLANDIA', 'Cronaca di una serata tra cabinati e compettine', 'La redazione è sul posto']) : ['NESSUNA NOTIZIA (PER ORA)', 'Serata tranquilla a Teletubbylandia: il giornale esce lo stesso', 'Il direttore: «allora due precisazioni però»'];
  const txt = ev.length ? 'Nella serata appena trascorsa il nostro inviato ha registrato quanto segue: ' + ev.slice(0, 5).map(e => 'il giocatore ' + e.text).join('; ') + '. Fonti vicine al gruppo parlano di prestazioni «sgravate», ma la redazione invita alla prudenza.' : 'Nessun record, nessuna sentenza, nessuna zombata. Un silenzio sospetto che la redazione intende approfondire nelle prossime ore, possibilmente davanti a un cabinato.';
  return {
    occhiello: tone === 'scandalo' ? 'Scandalo' : tone === 'sport' ? 'Sport' : tone === 'epico' ? 'Leggenda' : 'Cronaca', titolo: t[0], sommario: t[1], kind: top ? top.kind : 'arcade',
    didascalia: 'Il luogo dei fatti, ricostruito dal nostro disegnatore', articoli: [{ titolo: t[2], testo: txt }, { titolo: 'Il commento del direttore', testo: 'Allora, due precisazioni però. Primo: tutto quello che è successo stasera resta tra noi e i lettori del Corriere. Secondo: chi si lamenta dei risultati può presentare ricorso al Gulag, dove il giudice riceve su appuntamento e a stomaco pieno di sushi.' }],
    breve: 'Il bot del gruppo, interpellato, ha risposto con un messaggio troppo lungo per questa pagina.', ai: false,
  };
}

export function corrierePlugin(M) {
  return (ctx, W, H) => {
    const { goTo, setMode, toast } = H;
    const { audio, input, scene } = ctx;
    const A = anchor(ctx.level, 'redazione', { pos: V(-1.6, 0, 6.62), yaw: 0 });
    const yaw = A.yaw ?? 0;
    const g = new THREE.Group(); g.position.copy(A.pos); g.position.y = 0; g.rotation.y = yaw; scene.add(g);
    const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; p.add(o); return o; };
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.55 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.45, metalness: 0.6 });
    add(new THREE.BoxGeometry(1.2, 0.04, 0.55), wood, 0, 0.74, 0);
    for (const sx of [-0.56, 0.56]) add(new THREE.BoxGeometry(0.05, 0.72, 0.5), wood, sx, 0.36, 0);
    // the "rotativa": a little vintage press/printer with a paper tray
    const press = new THREE.Group(); press.position.set(-0.2, 0.76, 0.02); g.add(press);
    add(new THREE.BoxGeometry(0.52, 0.22, 0.36), iron, 0, 0.11, 0, press);
    for (const sx of [-0.27, 0.27]) add(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xa01010, roughness: 0.4, metalness: 0.3 }), sx, 0.15, 0, press).rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.25 }), 0, 0.25, -0.04, press).rotation.z = Math.PI / 2;
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xf3ecdc, roughness: 0.9 });
    const sheet = add(new THREE.PlaneGeometry(0.21, 0.3), paperMat.clone(), 0, 0.12, -0.24, press); sheet.rotation.x = -Math.PI / 2 + 0.3;
    // the printed stack (front page texture once printed)
    // blank paper until the first special edition is printed (same material defines: swapping the map won't recompile)
    const blank = cv(8, 8); { const bx = blank.getContext('2d'); bx.fillStyle = '#f3ecdc'; bx.fillRect(0, 0, 8, 8); }
    const stackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, map: canvasTex(blank) });
    const stack = add(new THREE.BoxGeometry(0.3, 0.03, 0.42), [paperMat, paperMat, stackMat, paperMat, paperMat, paperMat], 0.33, 0.775, -0.02);
    // lamp
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.02, 16), iron, 0.48, 0.77, 0.15); add(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 8), iron, 0.48, 0.94, 0.15);
    add(new THREE.ConeGeometry(0.09, 0.1, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a5a3a, emissive: 0xffe0a0, emissiveIntensity: 0.25, side: THREE.DoubleSide }), 0.42, 1.1, 0.1);
    // small "REDAZIONE" plate
    const pc = cv(512, 96), px = pc.getContext('2d'); px.fillStyle = '#1a120a'; px.fillRect(0, 0, 512, 96); px.fillStyle = '#e2c271'; px.font = 'italic 700 44px Georgia, serif'; px.textAlign = 'center'; px.fillText('Redazione', 256, 62);
    const plate = add(new THREE.BoxGeometry(0.34, 0.07, 0.015), [iron, iron, iron, iron, new THREE.MeshStandardMaterial({ map: canvasTex(pc), roughness: 0.4 }), iron], 0.05, 0.8, -0.26); plate.rotation.x = -0.25;
    loadStatic('tortellini_plate').then(o => { if (!o) return; const w = fitModel(o, 0.14); w.position.set(0.12, 0.762, -0.2); g.add(w); requestWarmup(); }); // the director's dinner
    g.updateMatrixWorld(true);
    const cw = [[-0.62, -0.3], [0.62, -0.3], [-0.62, 0.3], [0.62, 0.3]].map(([x, z]) => g.localToWorld(V(x, 0, z)));
    if (W.boxes) W.boxes.push({ id: 'mg-corriere', min: V(Math.min(...cw.map(p => p.x)), 0, Math.min(...cw.map(p => p.z))), max: V(Math.max(...cw.map(p => p.x)), 0, Math.max(...cw.map(p => p.z))) });
    const stand = g.localToWorld(V(0, 0, -0.78)); stand.y = 0;
    // restore the last special edition
    let lastURL = null; try { lastURL = localStorage.getItem(LS); } catch (e) { }
    const setStackTex = url => { if (!url) return; new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.rotation = Math.PI; t.center.set(0.5, 0.5); const old = stackMat.map; stackMat.map = t; if (old && old !== t) old.dispose(); }); window.__corriereSpeciale = url; };
    setStackTex(lastURL);

    let ov = null, tone = 'cronaca', busy = false, printT = 0;
    function ensure() {
      if (ov) return ov;
      ov = createOverlay('mg-corr', `<div class="cr"><div class="l"><h2>Redazione</h2><div class="s">Il Corriere delle Due Torri · edizione speciale sulla tua serata</div>
        <div class="s" style="color:#e8dcc0;font-weight:600">Cosa è successo</div><div class="ev"></div>
        <div class="s" style="color:#e8dcc0;font-weight:600">Taglio del pezzo</div><div class="tones">${TONES.map(([k, n]) => `<button class="mg-b" data-t="${k}">${n}</button>`).join('')}</div>
        <button class="mg-b go">🗞️ Stampa l'edizione speciale</button><a class="dl" download="corriere-edizione-speciale.jpg" style="display:none">⬇ Scarica la prima pagina</a>
        <div class="s" style="margin-top:auto">Clic sulla pagina per ingrandire · <kbd>Esc</kbd> esci</div></div><div class="r"><div class="msg">La rotativa è pronta.</div></div></div>`, {
        input, onKey: e => { if (e.code === 'Enter' && !busy) { e.preventDefault(); print(); } }, onClose: () => { if (W.mode === 'mg_corriere') setMode('standup'); },
      });
      const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
      ov.$$('.tones button').forEach(b => b.onclick = () => { tone = b.dataset.t; ov.$$('.tones button').forEach(x => x.classList.toggle('sel', x === b)); });
      ov.$('.go').onclick = () => print();
      return ov;
    }
    function events() { return sessionLog().events.filter(e => e.kind !== 'corriere'); }
    function records() {
      const r = [];
      const z = getRec('zombata_hi', 0); r.push(['Zombata di Seghino', z ? String(z) : '—']);
      const c = getRec('chi_hi', 0); r.push(["Chi l'ha detto?", c ? String(c) : '—']);
      const s = getRec('sushi_record', 0); r.push(['Sushi (punti)', s ? String(s) : '—']);
      const d = getRec('discord_best_ms', 0); r.push(['Riflessi Discord', d ? d + ' ms' : '—']);
      try { const hi = +localStorage.getItem('direttore_hi'); if (hi) r.push(['Il Direttore Incassa', String(hi)]); } catch (e) { }
      return r.slice(0, 5);
    }
    function showPage(url) {
      const r = ov.$('.r'); r.innerHTML = `<img alt="Prima pagina" src="${url}">`;
      const img = r.querySelector('img'); img.onclick = () => img.classList.toggle('z');
      const a = ov.$('.dl'); a.href = url; a.style.display = '';
    }
    async function print() {
      if (busy) return; busy = true; printT = 2.4;
      const ev = events();
      ov.$('.r').innerHTML = '<div class="msg">La rotativa gira… <span class="mg-dots"><span>●</span><span>●</span><span>●</span></span></div>';
      try { audio.ctx && audio.sfx('carriage'); } catch (e) { }
      const facts = ev.length ? ev.slice(-10).map(e => '- il giocatore ' + e.text).join('\n') : '- nessun evento particolare: serata tranquilla in sala giochi';
      const off = fallbackStory(ev, tone);
      const raw = await ask({ model: 'smart', maxTokens: 700,
        system: `Sei la redazione del "Corriere delle Due Torri", giornale goliardico di un gruppo di amici bolognesi (fondato e diretto da ${persona('ciccio').name}). Scrivi una prima pagina di EDIZIONE SPECIALE sulla serata del giocatore nella sala giochi BIGALESSO, in italiano, stile giornalistico enfatico e ironico, taglio: ${tone}. Rispondi SOLO con JSON valido con queste chiavi: {"occhiello": max 4 parole, "titolo": max 9 parole, "sommario": max 22 parole, "didascalia": max 12 parole, "kind": uno tra zombata|quiz|sushi|discord|processo|arcade, "articoli": [{"titolo": max 8 parole, "testo": 70-90 parole}, {"titolo": max 8 parole, "testo": 70-90 parole}], "breve": max 25 parole}. Usa solo i fatti forniti (puoi romanzarli). ${SAFE}`,
        prompt: `Fatti della serata:\n${facts}\nObiettivi sbloccati finora: ${myAchievements().length}.` }, null, 20000);
      let d = null;
      if (raw) { try { const m = String(raw).match(/\{[\s\S]*\}/); const j = m && JSON.parse(m[0]); if (j && j.titolo && Array.isArray(j.articoli) && j.articoli.length) d = { ...off, ...j, ai: true }; } catch (e) { } }
      d = d || off;
      d.articoli = (d.articoli || []).map(a => ({ titolo: clean(a.titolo || '', 70), testo: clean(a.testo || '', 700) }));
      while (d.articoli.length < 2) d.articoli.push(off.articoli[d.articoli.length]);
      d.titolo = clean(d.titolo, 80); d.sommario = clean(d.sommario, 180); d.occhiello = clean(d.occhiello || 'Cronaca', 30); d.breve = clean(d.breve || off.breve, 200); d.didascalia = clean(d.didascalia || off.didascalia, 90);
      if (!['zombata', 'quiz', 'sushi', 'discord', 'processo', 'arcade'].includes(d.kind)) d.kind = off.kind;
      const now = new Date();
      const num = 314 + (+(localStorage.getItem('bigalesso_corriere_n') || 0));
      try { localStorage.setItem('bigalesso_corriere_n', String(num - 313)); } catch (e) { }
      d.date = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
      d.num = num; d.records = records(); d.ach = myAchievements().length;
      const c = renderFront(d);
      const url = c.toDataURL('image/jpeg', 0.84);
      try { localStorage.setItem(LS, url); } catch (e) { }
      setStackTex(url);
      try { window.dispatchEvent(new CustomEvent('bigalesso:corriere', { detail: { url, titolo: d.titolo } })); } catch (e) { }
      if (ov && ov.isOpen) showPage(url);
      try { audio.ctx && audio.sfx('paper'); } catch (e) { }
      unlock('corriere_speciale', { title: 'In prima pagina', desc: 'Hai stampato un\'edizione speciale del Corriere', icon: '🗞️' });
      logEvent('corriere', 'ha stampato un\'edizione speciale del Corriere');
      busy = false;
    }
    function open() {
      ensure(); ov.open();
      const ev = events();
      ov.$('.ev').innerHTML = ev.length ? ev.slice(-12).reverse().map(e => `<div>• ${esc(e.text)}</div>`).join('') : '<div style="color:#9a8a70">Ancora niente: gioca ai cabinati, al sushi, su Discord o nel Gulag e torna qui. Si può stampare lo stesso.</div>';
      ov.$$('.tones button').forEach(x => x.classList.toggle('sel', x.dataset.t === tone));
      if (lastURL || window.__corriereSpeciale) showPage(window.__corriereSpeciale || lastURL);
      return true;
    }
    W.mgOpen = W.mgOpen || {}; W.mgOpen.corriere = () => open();
    return {
      items: [{ id: 'mg-corriere', label: () => 'Stampa un\'edizione speciale del Corriere', anchor: () => stand, top: () => g.localToWorld(V(-0.2, 1.15, 0)), range: 1.0,
        act: () => { if (W.carry) { toast('Prima posa l\'estintore'); return; } goTo(stand.clone(), yaw, () => setMode('mg_corriere')); } }],
      owns: m => m === 'mg_corriere',
      update() {
        if (W.t > 0.35 && !W.m.opened) { W.m.opened = true; open(); }
        return { lookW: 1, lookAt: g.localToWorld(V(-0.2, 0.85, 0)), rR: { pos: g.localToWorld(V(-0.05, 0.82, -0.12)), w: 0.6, palm: 'down', grip: 0.3 } };
      },
      tick(dt, camPos) {
        if (printT > 0) { printT -= dt; press.position.y = 0.76 + Math.sin(printT * 60) * 0.002; sheet.position.z = -0.24 - (1 - (printT % 0.6) / 0.6) * 0.12; }
        else if (press.position.y !== 0.76) { press.position.y = 0.76; sheet.position.z = -0.24; }
        void camPos;
      },
    };
  };
}
