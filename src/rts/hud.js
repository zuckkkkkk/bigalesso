// rts/hud.js — DOM for the siege: lobby, resources/wave bar, zones, minimap, selection + command panel,
// recruit/build buttons, log, pause menu, results. Desktop-first (same style as the pause menu), tappable on touch.
import { ROLES, ROLE_KEYS, BUILDS, BUILD_KEYS, ZONES, COLORS, ZTYPE_KEYS, gridInfo } from '../../shared/siege.mjs';

const CSS = `
#rts{position:fixed;inset:0;z-index:40;pointer-events:none;font:600 13px/1.25 system-ui,'Segoe UI',sans-serif;color:#efe8ff;display:none}
#rts.on,#rts.lob{display:block}
#rts.lob:not(.on)>:not(.ov){display:none}
#rts .p{background:rgba(12,6,20,.82);border:1px solid rgba(255,255,255,.08);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:auto}
#rts .top{position:absolute;left:12px;top:10px;display:flex;gap:10px;align-items:stretch}
#rts .res{display:flex;gap:14px;padding:8px 14px;font-size:17px;font-weight:800;align-items:center}
#rts .res small{font-size:11px;opacity:.65;font-weight:600;margin-left:2px}
#rts .wave{padding:7px 14px;min-width:220px}
#rts .wave b{display:block;font:400 18px/1.1 var(--gta,Impact,sans-serif);letter-spacing:.04em;text-transform:uppercase}
#rts .wave small{opacity:.75}
#rts .hqbar{height:5px;border-radius:3px;background:rgba(255,255,255,.12);margin-top:5px;overflow:hidden}
#rts .hqbar i{display:block;height:100%;background:#c8f03c;transition:width .25s}
#rts .hold{margin-top:4px;color:#c8f03c;font-size:12px}
#rts .mm{position:absolute;right:12px;top:10px;padding:6px}
#rts .mm canvas{display:block;width:264px;height:180px;border-radius:6px;cursor:crosshair}
#rts .zl{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;max-width:264px}
#rts .zl span{font-size:10.5px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.08);white-space:nowrap}
#rts .zl span.p1{background:rgba(200,240,60,.22);color:#e6ff9a}
#rts .zl span.p2{background:rgba(255,122,89,.25);color:#ffc1ad}
#rts .bot{position:absolute;left:50%;transform:translateX(-50%);bottom:10px;display:flex;gap:8px;align-items:flex-end}
#rts .sel{padding:7px 10px;min-width:190px;max-width:280px;min-height:56px}
#rts .sel h4{margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
#rts .sel .ic{display:flex;flex-wrap:wrap;gap:4px}
#rts .sel .ic span{padding:2px 7px;border-radius:6px;background:rgba(255,255,255,.08);font-size:12px}
#rts .cmds{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}
#rts button{pointer-events:auto;font:inherit;color:inherit;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:5px 9px;cursor:pointer}
#rts button:hover{background:rgba(200,240,60,.18);border-color:rgba(200,240,60,.5)}
#rts button.on{background:rgba(200,240,60,.28);border-color:#c8f03c}
#rts button[disabled]{opacity:.38;cursor:default}
#rts kbd{font:700 10px/1 ui-monospace,Consolas,monospace;padding:2px 4px;border-radius:4px;background:rgba(255,255,255,.14);margin-right:4px}
#rts .rec,#rts .bld{padding:6px;display:grid;gap:4px}
#rts .rec{grid-template-columns:repeat(2,minmax(104px,1fr))}
#rts .bld{grid-template-columns:repeat(3,minmax(78px,1fr))}
#rts .rec button,#rts .bld button{text-align:left;font-size:12px;line-height:1.15;padding:4px 7px}
#rts .rec button small,#rts .bld button small{display:block;opacity:.7;font-weight:500}
#rts .log{position:absolute;left:12px;bottom:12px;max-width:min(40vw,420px);display:flex;flex-direction:column;gap:3px;pointer-events:none}
#rts .log div{background:rgba(12,6,20,.7);padding:4px 9px;border-radius:7px;font-weight:500;animation:rtsIn .25s}
@keyframes rtsIn{from{opacity:0;transform:translateY(6px)}}
#rts .tip{position:absolute;left:50%;top:62px;transform:translateX(-50%);padding:6px 12px;font-weight:600;opacity:0;transition:opacity .2s;pointer-events:none;background:rgba(12,6,20,.85);border-radius:8px}
#rts .tip.on{opacity:1}
#rts .box{position:absolute;border:1.5px solid #c8f03c;background:rgba(200,240,60,.08);display:none;pointer-events:none}
#rts .lab{position:absolute;transform:translate(-50%,-100%);font:700 11px/1 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000,0 0 2px #000;white-space:nowrap;pointer-events:none;display:none}
#rts .lab.zone{font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:5px;background:rgba(12,6,20,.55)}
#rts .exit{position:absolute;right:12px;bottom:12px}
#rts .ov{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(6,2,12,.62);pointer-events:auto}
#rts .ov.on{display:flex}
#rts .card{width:min(560px,92vw);max-height:88vh;overflow:auto;padding:22px 24px;background:rgba(14,7,24,.95);border-radius:14px;border:1px solid rgba(200,240,60,.25)}
#rts .card h2{margin:0 0 4px;font:400 34px/1 var(--gta,'Anton',Impact,sans-serif);letter-spacing:.02em;text-transform:uppercase}
#rts .card p{margin:6px 0 12px;font-weight:500;opacity:.85;line-height:1.4}
#rts .card .row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
#rts .card .row label{opacity:.7;font-size:12px;width:100%}
#rts .card .big{font-size:15px;padding:9px 16px;border-color:rgba(200,240,60,.6)}
#rts .card .games{display:flex;flex-direction:column;gap:6px;margin-top:8px}
#rts .card .games button{display:flex;justify-content:space-between;text-align:left}
#rts .card ul{margin:6px 0 12px 18px;padding:0;font-weight:500;opacity:.85;line-height:1.5}
body.rts-on #touch,body.rts-on #mobBar,body.rts-on #mobEmote,body.rts-on #mobPhone,body.rts-on #hint,body.rts-on #bubble,body.rts-on #rpgHud,body.rts-on #cbHud,body.rts-on #netBtn,body.rts-on #topbar,body.rts-on #loc,body.rts-on #obj,body.rts-on #hudl,body.rts-on #tzone,body.rts-on #phPill{display:none!important}
body.touchui #rts .mm canvas{width:200px;height:137px}
@media (max-height:620px),(max-width:1100px){#rts .bot{transform:translateX(-50%) scale(.82);transform-origin:50% 100%}#rts .mm canvas{width:210px;height:143px}#rts .zl{max-width:210px}#rts .top{transform:scale(.88);transform-origin:0 0}}
body.touchui #rts .rec{grid-template-columns:repeat(2,minmax(96px,1fr))}
`;

export function createHUD(cb) {
  if (!document.getElementById('rtsCss')) { const s = document.createElement('style'); s.id = 'rtsCss'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.id = 'rts';
  const rk = ROLE_KEYS.map(r => { const R = ROLES[r]; return `<button data-rec="${r}" title="${R.desc}"><kbd>${R.key}</kbd><b>${R.name}</b><small>🍺${R.cost.b} 🥟${R.cost.t}</small></button>`; }).join('');
  const bk = BUILD_KEYS.map(k => { const B = BUILDS[k]; return `<button data-bld="${k}" title="${B.desc}"><kbd>${B.key}</kbd><b>${B.name}</b><small>🍺${B.cost.b} 🥟${B.cost.t}</small></button>`; }).join('');
  root.innerHTML = `
    <div class="top"><div class="p res"><span>🍺 <b class="rb">0</b><small>birre</small></span><span>🥟 <b class="rt">0</b><small>tortellini</small></span><span>👥 <b class="ru">0</b></span></div>
      <div class="p wave"><b class="wt">Preparatevi</b><small class="ws"></small><div class="hqbar"><i class="hq"></i></div><div class="hold"></div></div></div>
    <div class="p mm"><canvas width="264" height="180"></canvas><div class="zl"></div></div>
    <div class="tip"></div>
    <div class="log"></div>
    <div class="box"></div>
    <div class="labs"></div>
    <div class="bot">
      <div class="p rec">${rk}</div>
      <div class="p sel"><h4 class="st">Nessuno selezionato</h4><div class="ic"></div>
        <div class="cmds"><button data-cmd="amove"><kbd>T</kbd>Attacca-muovi</button><button data-cmd="hold"><kbd>H</kbd>Tieni</button><button data-cmd="stop"><kbd>Y</kbd>Stop</button><button data-cmd="all"><kbd>F</kbd>Tutti</button><button data-cmd="demolish" hidden><kbd>Canc</kbd>Smonta</button></div></div>
      <div class="p bld">${bk}<button data-cmd="next" title="Fa arrivare subito la prossima ondata: +2 birre e +2 tortellini"><kbd>G</kbd><b>Ondata!</b><small>+2 🍺 +2 🥟</small></button></div>
    </div>
    <button class="p exit" data-cmd="menu"><kbd>Esc</kbd>Menu</button>
    <div class="ov lobby"><div class="card">
      <h2>Assedio al quartiere</h2>
      <p>Comandi gli amici dall'alto. Prendete le zone del quartiere (birre e tortellini a ogni giro), costruite barricate e torrette e tenete gli zombie lontano da casa. Arriva anche il Vigile Urbano Zombie.</p>
      <div class="row"><label>Difficoltà</label><button data-diff="facile">Facile</button><button data-diff="normale" class="on">Normale</button><button data-diff="difficile">Difficile</button></div>
      <div class="row"><label>Ondate da reggere (oppure tenete tutte le zone per 90 s)</label><button data-waves="8">8</button><button data-waves="12" class="on">12</button><button data-waves="16">16</button></div>
      <div class="row"><button class="big" data-go="solo">Gioca da solo</button><button class="big" data-go="online">Crea partita online</button><button data-go="close">Chiudi</button></div>
      <div class="games"></div>
      <p class="note" style="font-size:12px;opacity:.6;margin-bottom:0"></p>
    </div></div>
    <div class="ov menu"><div class="card"><h2>Assedio</h2><p class="mi"></p>
      <ul><li>Clic e trascina: seleziona · clic destro: muovi/attacca · doppio clic: tutti quelli dello stesso tipo</li><li>WASD/frecce o bordo dello schermo: sposta la visuale · rotella: zoom · Q/E: ruota · Spazio: casa</li><li>Ctrl+1…9 crea un gruppo, 1…9 lo richiama · Z X C V reclutano · B N costruiscono (R ruota, Maiusc per piazzarne tante)</li><li>T attacca-muovi · H tieni posizione · Y stop · F tutti i tuoi · G chiama l'ondata · P segnala agli altri</li></ul>
      <div class="row"><button class="big" data-m="resume">Riprendi</button><button data-m="surrender">Arrenditi</button><button data-m="exit">Esci dall'assedio</button></div></div></div>
    <div class="ov res"><div class="card"><h2 class="rh">Fine</h2><p class="rp"></p><div class="row"><button class="big" data-m="again">Rigioca</button><button data-m="exit">Torna al quartiere</button></div></div></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const el = { rb: $('.rb'), rt: $('.rt'), ru: $('.ru'), wt: $('.wt'), ws: $('.ws'), hq: $('.hq'), hold: $('.hold'), zl: $('.zl'), tip: $('.tip'), log: $('.log'), box: $('.box'), labs: $('.labs'),
    st: $('.st'), ic: $('.ic'), dem: $('[data-cmd="demolish"]'), lobby: $('.ov.lobby'), games: $('.games'), note: $('.note'), menu: $('.ov.menu'), mi: $('.mi'), res: $('.ov.res'), rh: $('.rh'), rp: $('.rp'), mm: $('.mm canvas') };
  const opts = { difficulty: 'normale', waves: 12 };
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rec) cb.recruit(b.dataset.rec);
    else if (b.dataset.bld) cb.build(b.dataset.bld);
    else if (b.dataset.cmd) cb.cmd(b.dataset.cmd);
    else if (b.dataset.diff) { opts.difficulty = b.dataset.diff; $$('[data-diff]').forEach(x => x.classList.toggle('on', x === b)); }
    else if (b.dataset.waves) { opts.waves = +b.dataset.waves; $$('[data-waves]').forEach(x => x.classList.toggle('on', x === b)); }
    else if (b.dataset.go === 'solo') cb.start({ online: false, opts: { ...opts } });
    else if (b.dataset.go === 'online') cb.start({ online: true, opts: { ...opts } });
    else if (b.dataset.go === 'close') cb.closeLobby();
    else if (b.dataset.join) cb.start({ online: true, matchId: b.dataset.join, opts: { ...opts } });
    else if (b.dataset.m) cb.menu(b.dataset.m);
    cb.click && cb.click();
  });
  // keep clicks on panels from reaching the 3D view
  for (const p of $$('.p, .ov')) for (const ev of ['pointerdown', 'mousedown', 'contextmenu', 'wheel']) p.addEventListener(ev, e => e.stopPropagation(), { passive: ev === 'wheel' });

  // ---------------- minimap ----------------
  const mm = el.mm, mctx = mm.getContext('2d');
  const G = gridInfo(), MX0 = G.x0, MZ0 = G.z0, MWm = G.w * G.cell, MHm = G.h * G.cell; // metres
  const bg = document.createElement('canvas'); bg.width = mm.width; bg.height = mm.height;
  { const c = bg.getContext('2d'), im = c.createImageData(bg.width, bg.height);
    for (let y = 0; y < bg.height; y++) for (let x = 0; x < bg.width; x++) {
      const wx = MX0 + (x + 0.5) / bg.width * MWm, wz = MZ0 + (1 - (y + 0.5) / bg.height) * MHm;
      const i = Math.floor((wx - G.x0) / G.cell), j = Math.floor((wz - G.z0) / G.cell), w = G.walk[j * G.w + i];
      const o = (y * bg.width + x) * 4; im.data[o] = w ? 92 : 22; im.data[o + 1] = w ? 88 : 14; im.data[o + 2] = w ? 104 : 30; im.data[o + 3] = 255;
    }
    c.putImageData(im, 0, 0); }
  const toMM = (x, z) => [(x - MX0) / MWm * mm.width, (1 - (z - MZ0) / MHm) * mm.height];
  const fromMM = (px, py) => [MX0 + px / mm.width * MWm, MZ0 + (1 - py / mm.height) * MHm];
  let mmDown = 0;
  const mmEv = (e) => { const r = mm.getBoundingClientRect(); return fromMM((e.clientX - r.left) / r.width * mm.width, (e.clientY - r.top) / r.height * mm.height); };
  mm.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const p = mmEv(e); if (e.button === 2) { cb.mmOrder(p[0], p[1]); return; } mmDown = 1; mm.setPointerCapture(e.pointerId); cb.mmLook(p[0], p[1]); });
  mm.addEventListener('pointermove', e => { if (mmDown) cb.mmLook(...mmEv(e)); });
  mm.addEventListener('pointerup', () => { mmDown = 0; });
  mm.addEventListener('contextmenu', e => e.preventDefault());
  const TEAM = COLORS;
  function drawMinimap(view, R, camCorners, myIdx) {
    mctx.drawImage(bg, 0, 0);
    if (!view) return;
    for (let i = 0; i < ZONES.length; i++) {
      const z = ZONES[i], [own] = view.zones[i] || [0], [x, y] = toMM(z.x, z.z), r = Math.max(3, z.r / MWm * mm.width);
      mctx.fillStyle = own === 1 ? 'rgba(200,240,60,.45)' : own === 2 ? 'rgba(255,122,89,.5)' : 'rgba(255,255,255,.22)';
      mctx.beginPath(); mctx.arc(x, y, r, 0, 6.283); mctx.fill();
    }
    const h = view.hq; { const [x, y] = toMM(h[0], h[1]); mctx.fillStyle = '#c8f03c'; mctx.fillRect(x - 3, y - 3, 6, 6); }
    for (const e of R.zs.values()) { if (!e.alive) continue; const [x, y] = toMM(e.x, e.z); mctx.fillStyle = e.ty === 3 ? '#ffffff' : '#ff5a45'; const s = e.ty >= 2 ? 3 : 2; mctx.fillRect(x - s / 2, y - s / 2, s, s); }
    for (const e of R.blds.values()) { if (!e.alive) continue; const [x, y] = toMM(e.x, e.z); mctx.fillStyle = '#f0c048'; mctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    for (const e of R.units.values()) { if (!e.alive) continue; const [x, y] = toMM(e.x, e.z); mctx.fillStyle = TEAM[e.o % 4]; mctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    if (camCorners) { mctx.strokeStyle = 'rgba(255,255,255,.8)'; mctx.lineWidth = 1; mctx.beginPath(); camCorners.forEach((c, i) => { const [x, y] = toMM(c[0], c[1]); i ? mctx.lineTo(x, y) : mctx.moveTo(x, y); }); mctx.closePath(); mctx.stroke(); }
  }

  // ---------------- labels (zone names + selected friends) ----------------
  const labs = []; const LAB_N = 24;
  for (let i = 0; i < LAB_N; i++) { const d = document.createElement('div'); d.className = 'lab'; el.labs.appendChild(d); labs.push(d); }
  let labI = 0;
  const labBegin = () => { labI = 0; };
  const lab = (txt, x, y, zone) => { if (labI >= LAB_N) return; const d = labs[labI++]; if (d.textContent !== txt) d.textContent = txt; d.className = zone ? 'lab zone' : 'lab'; d.style.display = 'block'; d.style.left = x + 'px'; d.style.top = y + 'px'; };
  const labEnd = () => { for (let i = labI; i < LAB_N; i++) if (labs[i].style.display !== 'none') labs[i].style.display = 'none'; };

  // ---------------- per-frame text ----------------
  let lastKey = '';
  function update(view, R, sel, myIdx) {
    if (!view) return;
    const [b, t] = view.res; if (el.rb.textContent != b) el.rb.textContent = b; if (el.rt.textContent != t) el.rt.textContent = t;
    let mine = 0; for (const e of R.units.values()) if (e.alive && e.o === myIdx) mine++;
    const ru = `${view.u.length / 8 | 0}/${view.cap}`; if (el.ru.textContent !== ru) el.ru.textContent = ru;
    const wt = view.ph === 'prep' ? `Preparatevi · ondata 1 tra ${view.nw} s` : view.queued ? `Ondata ${view.wave}/${view.waves}: arrivano!` : view.wave >= view.waves ? `Ultima ondata: finitela!` : `Ondata ${view.wave}/${view.waves}`;
    if (el.wt.textContent !== wt) el.wt.textContent = wt;
    const zAlive = view.z.length / 6 | 0;
    const ws = `${zAlive} zombie in giro${view.ph !== 'prep' && view.wave < view.waves && !view.queued ? ` · prossima tra ${view.nw} s` : ''} · Casa ${view.hq[2]}/${view.hq[3]}`;
    if (el.ws.textContent !== ws) el.ws.textContent = ws;
    el.hq.style.width = Math.max(0, view.hq[2] / view.hq[3] * 100) + '%';
    el.hq.style.background = view.hq[2] / view.hq[3] > 0.5 ? '#c8f03c' : view.hq[2] / view.hq[3] > 0.25 ? '#ffd23f' : '#ff4b3a';
    const owned = view.zones.filter(z => z[0] === 1).length;
    const hold = owned === ZONES.length ? `Tutte le zone sono vostre: tenetele ancora ${Math.max(0, Math.ceil(view.holdNeed - view.hold))} s` : `Zone: ${owned}/${ZONES.length}`;
    if (el.hold.textContent !== hold) el.hold.textContent = hold;
    const zk = view.zones.map(z => z[0]).join('');
    if (zk !== lastKey) { lastKey = zk; el.zl.innerHTML = ZONES.map((z, i) => `<span class="p${view.zones[i][0]}">${view.zones[i][0] === 1 ? '🚩' : view.zones[i][0] === 2 ? '🧟' : '⚪'} ${z.name} <small>${z.inc.b ? '🍺' + z.inc.b : ''}${z.inc.t ? '🥟' + z.inc.t : ''}</small></span>`).join(''); }
    // buttons: affordable?
    for (const bt of root.querySelectorAll('[data-rec]')) { const C = ROLES[bt.dataset.rec].cost; bt.disabled = b < C.b || t < C.t || (view.u.length / 8) >= view.cap; }
    for (const bt of root.querySelectorAll('[data-bld]')) { const C = BUILDS[bt.dataset.bld].cost; bt.disabled = b < C.b || t < C.t; }
  }
  function selection(units, bld) {
    if (bld) { el.st.textContent = BUILDS[bld.k === 0 ? 'barricata' : 'torretta'].name + ` · ${bld.hp}%`; el.ic.innerHTML = ''; el.dem.hidden = false; return; }
    el.dem.hidden = true;
    if (!units.length) { el.st.textContent = 'Nessuno selezionato'; el.ic.innerHTML = '<span>Trascina col mouse sugli amici</span>'; return; }
    const by = {}; for (const u of units) by[u.r] = (by[u.r] || 0) + 1;
    el.st.textContent = units.length === 1 ? units[0].name + ' · ' + ROLES[ROLE_KEYS[units[0].r]].name : `${units.length} amici selezionati`;
    el.ic.innerHTML = Object.entries(by).map(([r, n]) => `<span>${n}× ${ROLES[ROLE_KEYS[r]].name}</span>`).join('');
  }
  function log(txt) { const d = document.createElement('div'); d.textContent = txt; el.log.appendChild(d); while (el.log.children.length > 5) el.log.firstChild.remove(); setTimeout(() => { if (d.parentNode) d.remove(); }, 9000); }
  let tipT = 0;
  function tip(txt, ms = 1800) { el.tip.textContent = txt; el.tip.classList.add('on'); clearTimeout(tipT); tipT = setTimeout(() => el.tip.classList.remove('on'), ms); }
  function box(r) { if (!r) { el.box.style.display = 'none'; return; } Object.assign(el.box.style, { display: 'block', left: r[0] + 'px', top: r[1] + 'px', width: r[2] + 'px', height: r[3] + 'px' }); }
  function markButtons(placing, amove) { for (const bt of root.querySelectorAll('[data-bld]')) bt.classList.toggle('on', bt.dataset.bld === placing); root.querySelector('[data-cmd="amove"]').classList.toggle('on', !!amove); }
  async function openLobby(listP, online) {
    root.classList.add('lob'); el.lobby.classList.add('on'); el.games.innerHTML = ''; el.note.textContent = online ? 'Cerco partite aperte…' : 'Per giocare con gli amici entra prima in una stanza dal menu Online (o crea la partita: se il server c\'è, gli altri la vedono qui).';
    try { const list = await listP; el.games.innerHTML = (list || []).filter(g => !g.started || g.dropIn !== false).map(g => `<button data-join="${g.id}"><span>Assedio di ${g.host || g.players && g.players[0] || '?'}</span><span>${(g.players && g.players.length) || g.n || 1}/${g.max || 4} · unisciti</span></button>`).join(''); if (online) el.note.textContent = (list && list.length) ? 'Partite aperte:' : 'Nessuna partita aperta: creane una.'; } catch (e) { }
  }
  const closeLobby = () => { el.lobby.classList.remove('on'); root.classList.remove('lob'); };
  const lobbyOpen = () => el.lobby.classList.contains('on');
  function menu(on, info) { el.menu.classList.toggle('on', !!on); if (info) el.mi.textContent = info; }
  const menuOpen = () => el.menu.classList.contains('on');
  function results(o) { el.res.classList.add('on'); el.rh.textContent = o.win ? 'Il quartiere tiene!' : 'La casa è caduta'; el.rp.innerHTML = `${o.summary}.<br>Ondata ${o.wave} · ${o.kills} zombie abbattuti · zone tenute al massimo: ${o.zones} · ${Math.floor(o.time / 60)}:${String(o.time % 60).padStart(2, '0')}<br><b>Punteggio ${o.score}</b>${o.reward ? `<br>${o.reward}` : ''}`; }
  const closeResults = () => el.res.classList.remove('on');
  return { root, show(on) { root.classList.toggle('on', !!on); document.body.classList.toggle('rts-on', !!on); }, update, selection, log, tip, box, markButtons, openLobby, closeLobby, lobbyOpen, menu, menuOpen, results, closeResults, drawMinimap, labBegin, lab, labEnd, opts };
}
