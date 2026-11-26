// motor/tuning.js — the Officina: parts, prices, ownership (localStorage 'bigalesso_garage') and the tuning menu.
// Cosmetics are bought once and then switched for free; performance parts are levels (motore, gomme, freni, nitro).
// Money is the RPG's Euro (window.__rpg.money). The menu is a desktop-style overlay (↑↓ part, ←→ option, Invio
// compra, Esc esci) that also works with the mouse and on touch; the car previews every option live.
import { DEFAULT_LOOK } from './rig.js';
import { stats, BASE } from './physics.js';

const KEY = 'bigalesso_garage';
export const PAINTS = [[null, 'Crema originale'], ['#b3202a', 'Rosso Bologna'], ['#1d4fd6', 'Blu Petroni'], ['#3fae3a', 'Verde Teletubby'], ['#f2c230', 'Giallo Sole'],
  ['#141418', 'Nero Millennium'], ['#6a2fb8', 'Viola Gulag'], ['#ff6fa3', 'Rosa Confetto'], ['#ff7a1a', 'Arancio Spritz'], ['#f4f1e8', 'Bianco Tortellino'], ['#8a8f96', 'Grigio Portico']];
export const LIVERIES = ['Nessuna', 'Strisce racing', 'Fascia laterale', 'Scacchi', 'Fiamme'];
export const LIV_COLORS = [['#ffffff', 'Bianco'], ['#141418', 'Nero'], ['#f2c230', 'Giallo'], ['#b3202a', 'Rosso'], ['#1d4fd6', 'Blu'], ['#3fae3a', 'Verde'], ['#ff6fa3', 'Rosa']];
export const RIMS = ['Acciaio di serie', 'Oro 5 razze', 'Nere racing', 'Raggi cromati'];
export const SPOILERS = ['Niente', 'Alettone da tetto', 'Alettone GT'];
export const EXHAUSTS = ['Di serie', 'Sportivo', 'Doppio terminale'];
export const NEONS = [[null, 'Spento'], ['#3cf0ff', 'Ciano'], ['#ff3df0', 'Fucsia'], ['#c8f03c', 'Lime'], ['#ffd83a', 'Oro'], ['#ff2b2b', 'Rosso']];
export const PERF = {
  motore: { name: 'Motore', lv: ['Di serie', 'Elaborato', 'Truccato', 'Da Bellazzi'], cost: [120, 250, 450] },
  gomme: { name: 'Gomme', lv: ['Lisce', 'Sportive', 'Semi-slick', 'Slick'], cost: [80, 160, 300] },
  freni: { name: 'Freni', lv: ['Di serie', 'Sportivi', 'Racing', 'Carbo-ceramici'], cost: [70, 140, 260] },
  nitro: { name: 'Nitro', lv: ['Niente', 'Kit base', 'Doppia bombola', 'Missile'], cost: [150, 300, 500] },
};
const PRICE = { paint: 30, livery: 40, rims: [0, 50, 60, 70], spoiler: [0, 60, 90], exhaust: [0, 70, 110], neon: 80 };

export function loadGarage() {
  let g = null; try { g = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  g = g && typeof g === 'object' ? g : {};
  g.look = { ...DEFAULT_LOOK, ...(g.look || {}) };
  g.perf = { motore: 0, gomme: 0, freni: 0, nitro: 0, ...(g.perf || {}) };
  g.owned = { paint: {}, livery: {}, rims: {}, spoiler: {}, exhaust: {}, neon: false, ...(g.owned || {}) };
  g.stats = { races: 0, wins: 0, ...(g.stats || {}) };
  return g;
}
export function saveGarage(g) { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) { } }

const money = () => { try { return window.__rpg && window.__rpg.money ? window.__rpg.money.get() : null; } catch (e) { return null; } };
const spend = n => { if (!n) return true; try { if (!window.__rpg || !window.__rpg.money) return true; return window.__rpg.money.spend(n); } catch (e) { return false; } };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
#mtGarage{position:fixed;inset:0;z-index:40;display:none;pointer-events:none;font-family:var(--ui,system-ui)}
#mtGarage.on{display:block}
#mtGarage .pan{pointer-events:auto;position:absolute;left:0;top:0;bottom:0;width:min(480px,92vw);padding:4.5vh 34px 24px max(28px,env(safe-area-inset-left));
  background:linear-gradient(90deg,rgba(6,2,12,.94) 0,rgba(6,2,12,.86) 72%,rgba(6,2,12,0) 100%);color:#fff;overflow-y:auto;box-sizing:border-box}
#mtGarage h2{font:400 clamp(34px,5.2vw,58px)/.9 var(--gta,Impact,sans-serif);text-transform:uppercase;margin:0;letter-spacing:.01em}
#mtGarage h2 small{display:block;font:600 12px/1.4 var(--ui);letter-spacing:.24em;color:#c8f03c;margin-top:6px}
#mtGarage .eur{margin:14px 0 10px;font:900 15px/1 var(--ui);letter-spacing:.06em;color:#ffd83a}
#mtGarage .rows{display:flex;flex-direction:column;gap:2px}
#mtGarage .row{display:grid;grid-template-columns:118px 1fr auto;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;cursor:pointer;border:1px solid transparent}
#mtGarage .row.sel{background:rgba(255,255,255,.09);border-color:rgba(200,240,60,.55)}
#mtGarage .row .k{font:400 19px/1 var(--gta,Impact,sans-serif);text-transform:uppercase;letter-spacing:.02em;color:#dcd2f0}
#mtGarage .row.sel .k{color:#fff}
#mtGarage .opt{display:flex;align-items:center;gap:6px;min-width:0}
#mtGarage .opt b{flex:1;font:700 13px/1.2 var(--ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
#mtGarage .opt button{width:30px;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font:900 14px/1 var(--ui);cursor:pointer;flex:none}
#mtGarage .opt i{width:13px;height:13px;border-radius:50%;flex:none;border:1px solid rgba(255,255,255,.4);display:inline-block}
#mtGarage .pr{font:800 12px/1 var(--ui);color:#ffd83a;min-width:54px;text-align:right}
#mtGarage .pr.own{color:#7be08a}
#mtGarage .sec{margin:14px 0 4px;font:700 11px/1 var(--ui);letter-spacing:.28em;color:#9f8fc4;text-transform:uppercase}
#mtGarage .stats{margin-top:14px;display:grid;grid-template-columns:96px 1fr 52px;gap:5px 10px;align-items:center;font:700 11px/1 var(--ui);letter-spacing:.12em;text-transform:uppercase;color:#cfc4ea}
#mtGarage .bar{height:7px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;position:relative}
#mtGarage .bar u{position:absolute;left:0;top:0;bottom:0;background:#c8f03c;border-radius:4px}
#mtGarage .bar s{position:absolute;left:0;top:0;bottom:0;background:#ffd83a;opacity:.8;border-radius:4px}
#mtGarage .acts{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
#mtGarage .acts button{padding:11px 18px;border-radius:12px;border:0;font:900 13px/1 var(--ui);letter-spacing:.12em;text-transform:uppercase;cursor:pointer;background:#c8f03c;color:#14082e}
#mtGarage .acts button.ghost{background:rgba(255,255,255,.1);color:#fff}
#mtGarage .acts button:disabled{opacity:.45;cursor:default}
#mtGarage .msg{margin-top:10px;min-height:16px;font:600 12px/1.3 var(--ui);color:#ffb3c8}
#mtGarage .keys{position:absolute;right:24px;bottom:22px;font:600 11px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.75)}
#mtGarage .keys kbd{display:inline-block;border:1px solid rgba(255,255,255,.6);border-radius:4px;padding:3px 6px;margin:0 4px 0 12px;font:inherit}
#mtGarage input.plate{width:120px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:#f4f4f0;color:#111;font:900 15px/1 "Arial Narrow",Arial,sans-serif;text-transform:uppercase;text-align:center}
body.touchui #mtGarage .keys{display:none}
body.touchui #mtGarage .opt button{width:40px;height:40px}
`;

export function createGarageUI({ onPreview, onClose, sfx }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'mtGarage'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="pan"><h2>Officina<small>BIGALESSO MOTORS · VIA TELETUBBYLANDIA</small></h2><div class="eur"></div><div class="rows"></div>
    <div class="stats"></div><div class="acts"><button class="buy">Compra</button><button class="ghost done">Fatto</button></div><div class="msg"></div></div>
    <div class="keys"><kbd>↑</kbd><kbd>↓</kbd>pezzo<kbd>←</kbd><kbd>→</kbd>scegli<kbd>Invio</kbd>compra<kbd>Esc</kbd>esci</div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  let G = null, sel = 0, open = false, draft = null, msgT = 0;
  // rows: [key, label, kind]
  const ROWS = [
    ['sec', 'Carrozzeria'], ['paint', 'Vernice'], ['livery', 'Livrea'], ['livery2', 'Colore livrea'], ['plate', 'Targa'],
    ['sec', 'Pezzi'], ['rims', 'Cerchi'], ['spoiler', 'Alettone'], ['exhaust', 'Scarico'], ['neon', 'Neon'],
    ['sec', 'Prestazioni'], ['motore', 'Motore'], ['gomme', 'Gomme'], ['freni', 'Freni'], ['nitro', 'Nitro'],
  ];
  const sels = ROWS.map((r, i) => i).filter(i => ROWS[i][0] !== 'sec');
  const idx = { paint: () => PAINTS.findIndex(p => p[0] === draft.look.paint), livery: () => draft.look.livery | 0, livery2: () => Math.max(0, LIV_COLORS.findIndex(c => c[0] === draft.look.livery2)),
    rims: () => draft.look.rims | 0, spoiler: () => draft.look.spoiler | 0, exhaust: () => draft.look.exhaust | 0, neon: () => Math.max(0, NEONS.findIndex(c => c[0] === draft.look.neon)) };
  const count = { paint: PAINTS.length, livery: LIVERIES.length, livery2: LIV_COLORS.length, rims: RIMS.length, spoiler: SPOILERS.length, exhaust: EXHAUSTS.length, neon: NEONS.length };
  function setOpt(k, i) {
    const L = draft.look;
    if (k === 'paint') L.paint = PAINTS[i][0]; else if (k === 'livery') L.livery = i; else if (k === 'livery2') L.livery2 = LIV_COLORS[i][0];
    else if (k === 'rims') L.rims = i; else if (k === 'spoiler') L.spoiler = i; else if (k === 'exhaust') L.exhaust = i; else if (k === 'neon') L.neon = NEONS[i][0];
  }
  // cost to own what the draft shows (0 if owned)
  function costOf(k) {
    const L = draft.look, O = G.owned;
    if (k === 'paint') return L.paint && !O.paint[L.paint] ? PRICE.paint : 0;
    if (k === 'livery') return L.livery && !O.livery[L.livery] ? PRICE.livery : 0;
    if (k === 'rims') return L.rims && !O.rims[L.rims] ? PRICE.rims[L.rims] : 0;
    if (k === 'spoiler') return L.spoiler && !O.spoiler[L.spoiler] ? PRICE.spoiler[L.spoiler] : 0;
    if (k === 'exhaust') return L.exhaust && !O.exhaust[L.exhaust] ? PRICE.exhaust[L.exhaust] : 0;
    if (k === 'neon') return L.neon && !O.neon ? PRICE.neon : 0;
    if (PERF[k]) { let c = 0; for (let l = G.perf[k]; l < draft.perf[k]; l++) c += PERF[k].cost[l]; return c; }
    return 0;
  }
  const totalCost = () => ['paint', 'livery', 'rims', 'spoiler', 'exhaust', 'neon', 'motore', 'gomme', 'freni', 'nitro'].reduce((a, k) => a + costOf(k), 0);
  function label(k) {
    const L = draft.look;
    if (k === 'paint') { const p = PAINTS[idx.paint()] || PAINTS[0]; return `<i style="background:${p[0] || '#ece4c8'}"></i><b>${p[1]}</b>`; }
    if (k === 'livery') return `<b>${LIVERIES[L.livery | 0]}</b>`;
    if (k === 'livery2') { const c = LIV_COLORS[idx.livery2()]; return `<i style="background:${c[0]}"></i><b>${c[1]}</b>`; }
    if (k === 'rims') return `<b>${RIMS[L.rims | 0]}</b>`;
    if (k === 'spoiler') return `<b>${SPOILERS[L.spoiler | 0]}</b>`;
    if (k === 'exhaust') return `<b>${EXHAUSTS[L.exhaust | 0]}</b>`;
    if (k === 'neon') { const c = NEONS[idx.neon()]; return `${c[0] ? `<i style="background:${c[0]}"></i>` : ''}<b>${c[1]}</b>`; }
    if (PERF[k]) return `<b>${PERF[k].lv[draft.perf[k]]}</b>`;
    return '';
  }
  function render() {
    const m = money();
    $('.eur').textContent = m === null ? 'Euro: —' : `€ ${m} nel portafoglio`;
    $('.rows').innerHTML = ROWS.map((r, i) => {
      if (r[0] === 'sec') return `<div class="sec">${r[1]}</div>`;
      const k = r[0];
      if (k === 'plate') return `<div class="row${sels[sel] === i ? ' sel' : ''}" data-i="${i}"><span class="k">${r[1]}</span><div class="opt"><input class="plate" maxlength="8" value="${esc(draft.look.plate || '')}"></div><span class="pr own">gratis</span></div>`;
      const c = costOf(k), own = !c;
      return `<div class="row${sels[sel] === i ? ' sel' : ''}" data-i="${i}"><span class="k">${r[1]}</span><div class="opt"><button data-d="-1" aria-label="precedente">◀</button>${label(k)}<button data-d="1" aria-label="successivo">▶</button></div><span class="pr${own ? ' own' : ''}">${own ? 'tuo' : '€ ' + c}</span></div>`;
    }).join('');
    // stats: current (yellow) vs draft (lime)
    const a = stats(G.perf), b = stats(draft.perf);
    const rowsS = [['Velocità', a.vmax / (BASE.vmax * 1.33), b.vmax / (BASE.vmax * 1.33), Math.round(b.vmax * 3.6) + ' km/h'], ['Scatto', a.accel / (BASE.accel * 1.48), b.accel / (BASE.accel * 1.48), ''],
      ['Frenata', a.brake / (BASE.brake * 1.48), b.brake / (BASE.brake * 1.48), ''], ['Tenuta', a.grip / (BASE.grip * 1.42), b.grip / (BASE.grip * 1.42), ''], ['Nitro', a.nitroTank ? a.nitroBoost * a.nitroTank / 3.5 : 0, b.nitroTank ? b.nitroBoost * b.nitroTank / 3.5 : 0, b.nitroTank ? b.nitroTank.toFixed(1) + ' s' : '—']];
    $('.stats').innerHTML = rowsS.map(([n, x, y, t]) => `<span>${n}</span><span class="bar"><u style="width:${Math.min(100, y * 100).toFixed(0)}%"></u><s style="width:${Math.min(100, Math.min(x, y) * 100).toFixed(0)}%"></s></span><span>${t}</span>`).join('');
    const tc = totalCost(); const b2 = $('.buy'); b2.textContent = tc ? `Compra · € ${tc}` : 'Già tutto tuo'; b2.disabled = !tc;
    const inp = $('.plate'); if (inp) { inp.oninput = () => { draft.look.plate = inp.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8); onPreview(draft); }; inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); }; }
  }
  function cycle(d) {
    const k = ROWS[sels[sel]][0];
    if (PERF[k]) { draft.perf[k] = Math.max(0, Math.min(3, draft.perf[k] + d)); if (draft.perf[k] < G.perf[k]) draft.perf[k] = G.perf[k]; } // can't downgrade
    else if (count[k]) { const n = count[k]; setOpt(k, ((idx[k]() + d) % n + n) % n); }
    else return;
    sfx && sfx('click'); onPreview(draft); render();
  }
  function msg(t) { $('.msg').textContent = t; clearTimeout(msgT); msgT = setTimeout(() => { if (open) $('.msg').textContent = ''; }, 3200); }
  function buy() {
    const tc = totalCost(); if (!tc) return;
    if (!spend(tc)) { const m = money(); msg(`Non bastano i soldi: servono € ${tc}${m !== null ? `, hai € ${m}` : ''}. Vai a fare qualche gara o qualche missione.`); sfx && sfx('click'); return; }
    const L = draft.look, O = G.owned;
    if (L.paint) O.paint[L.paint] = 1; if (L.livery) O.livery[L.livery] = 1; if (L.rims) O.rims[L.rims] = 1; if (L.spoiler) O.spoiler[L.spoiler] = 1; if (L.exhaust) O.exhaust[L.exhaust] = 1; if (L.neon) O.neon = true;
    G.perf = { ...draft.perf }; G.look = { ...draft.look }; saveGarage(G);
    sfx && sfx('buy'); msg(`Fatto! Spesi € ${tc}. Bella lì.`); render();
    api.onBuy && api.onBuy(G, tc);
  }
  // owned-only look (what stays on the car when you leave without paying)
  function ownedLook() {
    const L = { ...draft.look }, O = G.owned;
    if (L.paint && !O.paint[L.paint]) L.paint = G.look.paint; if (L.livery && !O.livery[L.livery]) { L.livery = G.look.livery; }
    if (L.rims && !O.rims[L.rims]) L.rims = G.look.rims; if (L.spoiler && !O.spoiler[L.spoiler]) L.spoiler = G.look.spoiler; if (L.exhaust && !O.exhaust[L.exhaust]) L.exhaust = G.look.exhaust;
    if (L.neon && !O.neon) L.neon = G.look.neon; return L;
  }
  function close() {
    if (!open) return; open = false; el.classList.remove('on'); el.setAttribute('aria-hidden', 'true');
    G.look = ownedLook(); saveGarage(G); if (document.body.dataset.overlay === 'motor') delete document.body.dataset.overlay;
    removeEventListener('keydown', onKey, true); onClose && onClose(G);
  }
  function onKey(e) {
    if (!open) return; if (document.activeElement && document.activeElement.classList.contains('plate')) return;
    const c = e.code; let used = true;
    if (c === 'ArrowUp' || c === 'KeyW') { sel = (sel - 1 + sels.length) % sels.length; render(); sfx && sfx('click'); }
    else if (c === 'ArrowDown' || c === 'KeyS') { sel = (sel + 1) % sels.length; render(); sfx && sfx('click'); }
    else if (c === 'ArrowLeft' || c === 'KeyA') cycle(-1); else if (c === 'ArrowRight' || c === 'KeyD') cycle(1);
    else if (c === 'Enter') buy();
    else if (c === 'Escape' || c === 'KeyQ' || c === 'Backspace') close();
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    const row = e.target.closest('.row'); if (row) { const i = +row.dataset.i; const s = sels.indexOf(i); if (s >= 0 && s !== sel) { sel = s; if (!b) { render(); return; } } }
    if (!b) return;
    if (b.dataset.d) cycle(+b.dataset.d); else if (b.classList.contains('buy')) buy(); else if (b.classList.contains('done')) close();
  });
  const api = {
    get open() { return open; },
    show(g) {
      G = g; draft = { look: { ...g.look }, perf: { ...g.perf } }; sel = 0; open = true;
      el.classList.add('on'); el.setAttribute('aria-hidden', 'false'); document.body.dataset.overlay = 'motor';
      addEventListener('keydown', onKey, true); render(); onPreview(draft);
    },
    close, render,
  };
  return api;
}
