// rp/ui.js — roleplay DOM: job HUD (right column, above the quest tracker), waypoint, job overlays (barista pour,
// buttafuori card, vigile dialogue), end-of-shift card, phone apps (Lavori, Documenti, Casa) renderers.
const COARSE = matchMedia('(pointer: coarse)').matches;
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSS = `
#rpHud{position:fixed;z-index:7;right:max(24px,env(safe-area-inset-right));top:15vh;width:min(300px,48vw);pointer-events:none;color:#fff;font:500 13px/1.35 var(--ui,system-ui);
 text-shadow:0 1px 4px #000c;opacity:0;transition:opacity .35s}
#rpHud.on{opacity:1}
body[data-overlay]:not([data-overlay="rpjob"]) #rpHud{opacity:0}
#rpHud .k{font:700 10px/1 var(--ui,system-ui);letter-spacing:.3em;text-transform:uppercase;color:var(--c,#28c2a0);margin-bottom:5px}
#rpHud .t{font:400 22px/1.02 var(--gta,Impact,sans-serif);letter-spacing:.02em;text-transform:uppercase}
#rpHud .d{opacity:.88;margin-top:4px}
#rpHud .row{display:flex;gap:14px;margin-top:6px;font:700 12px/1 var(--ui,system-ui);letter-spacing:.06em}
#rpHud .row b{color:var(--c,#28c2a0)} #rpHud .row .warn{color:#ff6b6b}
#rpHud .p{margin-top:6px;height:4px;background:rgba(255,255,255,.15)}#rpHud .p i{display:block;height:100%;background:var(--c,#28c2a0);width:0;transition:width .3s}
#rpWp{position:fixed;z-index:6;left:0;top:0;pointer-events:none;display:none;text-align:center;color:var(--c,#28c2a0);font:700 11px/1 var(--ui,system-ui);letter-spacing:.08em;text-shadow:0 1px 3px #000}
#rpWp .dm{width:16px;height:16px;margin:0 auto 4px;border:2px solid currentColor;transform:rotate(45deg);box-shadow:0 0 12px currentColor;background:rgba(255,255,255,.12)}
#rpWp.edge .dm{border-width:0 3px 3px 0;background:none;box-shadow:none;width:14px;height:14px}
body[data-overlay] #rpWp{display:none!important}
#rpJob{position:fixed;z-index:9;left:50%;bottom:max(26px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(640px,94vw);display:none;color:#fff;
 font:500 14px/1.4 var(--ui,system-ui);background:rgba(10,8,18,.86);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px 16px;box-shadow:0 14px 40px rgba(0,0,0,.45);backdrop-filter:blur(6px)}
#rpJob.on{display:block}
#rpJob h4{margin:0 0 6px;font:400 22px/1 var(--gta,Impact,sans-serif);letter-spacing:.03em;text-transform:uppercase;color:var(--c,#28c2a0)}
#rpJob .sub{opacity:.8;font-size:13px}
#rpJob .keys{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}
#rpJob button{font:700 13px/1 var(--ui,system-ui);padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;min-height:40px}
#rpJob button:hover{background:rgba(255,255,255,.16)} #rpJob button.go{background:var(--c,#28c2a0);color:#071a16;border-color:transparent}
#rpJob button.no{background:#c8364a;border-color:transparent}
#rpJob kbd{display:inline-block;min-width:18px;padding:2px 5px;margin-right:6px;border-radius:5px;background:rgba(255,255,255,.16);font:700 11px/1.2 var(--ui,system-ui);text-align:center}
/* barista: the glass */
#rpJob .pour{display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:center}
#rpJob .glass{position:relative;width:90px;height:150px;margin:0 auto;border:3px solid rgba(255,255,255,.75);border-top:0;border-radius:0 0 14px 14px;overflow:hidden;background:rgba(255,255,255,.05);transform-origin:50% 100%}
#rpJob .glass .beer{position:absolute;left:0;right:0;bottom:0;height:0;background:var(--beer,#f2c14e)}
#rpJob .glass .foam{position:absolute;left:0;right:0;height:0;background:#fff8e6}
#rpJob .glass .line{position:absolute;left:-4px;right:-4px;height:0;border-top:2px dashed #ff3d7f}
#rpJob .glass .stream{position:absolute;left:50%;top:0;width:6px;margin-left:-3px;bottom:0;background:var(--beer,#f2c14e);opacity:0;transition:opacity .1s}
#rpJob .meter{height:6px;background:rgba(255,255,255,.12);border-radius:3px;margin-top:8px;overflow:hidden}#rpJob .meter i{display:block;height:100%;background:#ffd166;width:100%}
#rpJob .cust{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:12px}
#rpJob .cust span{padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.08)} #rpJob .cust span.cur{outline:2px solid var(--c)}
/* buttafuori: the guest card */
#rpJob .card{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-top:6px}
#rpJob .card div{font-size:13px} #rpJob .card b{color:#ffd166}
#rpJob .rules{margin-top:8px;font-size:12px;opacity:.85} #rpJob .rules span{display:inline-block;margin:2px 6px 2px 0;padding:3px 7px;border-radius:7px;background:rgba(255,61,127,.18);border:1px solid rgba(255,61,127,.45)}
#rpSum{position:fixed;z-index:60;inset:0;display:none;place-items:center;background:rgba(6,4,12,.55);backdrop-filter:blur(3px);color:#fff;font:500 15px/1.45 var(--ui,system-ui)}
#rpSum.on{display:grid}
#rpSum .box{width:min(420px,90vw);background:rgba(16,12,26,.96);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
#rpSum h3{margin:0 0 2px;font:400 30px/1 var(--gta,Impact,sans-serif);text-transform:uppercase;color:var(--c,#28c2a0)}
#rpSum table{width:100%;margin:12px 0;border-collapse:collapse}#rpSum td{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08)}#rpSum td:last-child{text-align:right;font-weight:700}
#rpSum button{width:100%;padding:12px;border-radius:10px;border:0;background:var(--c,#28c2a0);color:#071a16;font:800 14px/1 var(--ui,system-ui);cursor:pointer}
/* phone apps */
.rp-app{padding:8px 12px 16px;overflow:auto;color:#eee;font:13px/1.4 system-ui,sans-serif}
.rp-job{background:#1a1922;border-radius:14px;padding:12px;margin-bottom:10px;border-left:4px solid var(--c)}
.rp-job b{font-size:15px}.rp-job small{display:block;opacity:.7;margin-top:2px}
.rp-job .bar{height:5px;background:#333;border-radius:3px;margin:8px 0 4px;overflow:hidden}.rp-job .bar i{display:block;height:100%;background:var(--c)}
.rp-job button,.rp-app button.rp-b{margin-top:8px;padding:9px 12px;border-radius:10px;border:0;background:var(--c,#28c2a0);color:#0b0b0b;font-weight:800;cursor:pointer;width:100%}
.rp-app button.rp-b.ghost{background:#2a2934;color:#eee}
.rp-id{background:linear-gradient(135deg,#e8eef6,#c9d6e6);color:#1a2230;border-radius:12px;padding:10px;display:grid;grid-template-columns:38% 1fr;gap:8px;box-shadow:0 6px 20px rgba(0,0,0,.4);overflow-wrap:anywhere}
.rp-id .ph{width:100%;aspect-ratio:4/5;border-radius:6px;background:#9aa8b8 center/cover no-repeat}
.rp-id h5{grid-column:1/-1;margin:0 0 2px;font:800 9px/1.2 system-ui;letter-spacing:.1em;color:#3a4a60}
.rp-id div.f{font-size:11px;margin:1px 0 3px;line-height:1.25}.rp-id div.f i{font-style:normal;opacity:.65;font-size:10px;display:block;letter-spacing:.08em;text-transform:uppercase}
.rp-sec{margin:14px 0 6px;font:800 11px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
.rp-fed div{background:#1a1922;border-radius:10px;padding:8px 10px;margin-bottom:6px;font-size:12px}.rp-fed div b{color:#ff8a8a}
.rp-tags span{display:inline-block;margin:0 6px 6px 0;padding:4px 8px;border-radius:8px;background:#2a2934;font-size:12px}
.rp-shop button{display:flex;justify-content:space-between;align-items:center;width:100%;margin:0 0 6px;padding:10px 12px;border-radius:10px;border:0;background:#1a1922;color:#eee;font:600 13px system-ui;cursor:pointer;text-align:left}
.rp-shop button em{font-style:normal;color:#ffd166}.rp-shop button[disabled]{opacity:.45;cursor:default}
.rp-nick{display:flex;gap:6px;margin-top:10px}.rp-nick input{flex:1;padding:9px;border-radius:9px;border:0;background:#2a2934;color:#fff}
#rpTag{display:none}
`;

export function createRPUI() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, html) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
  // ---------------- HUD
  const hud = mk('rpHud', `<div class="k"></div><div class="t"></div><div class="d"></div><div class="row"></div><div class="p"><i></i></div>`);
  const H = { k: hud.querySelector('.k'), t: hud.querySelector('.t'), d: hud.querySelector('.d'), row: hud.querySelector('.row'), p: hud.querySelector('.p'), pi: hud.querySelector('.p i') };
  let hudKey = '';
  function setHud(o) {
    if (!o) { if (hudKey) { hudKey = ''; hud.classList.remove('on'); } return; }
    const key = [o.k, o.t, o.d, o.row, o.p == null ? '' : Math.round(o.p * 100), o.color].join('|'); if (key === hudKey) return; hudKey = key;
    hud.style.setProperty('--c', o.color || '#28c2a0');
    H.k.textContent = o.k || ''; H.t.textContent = o.t || ''; H.d.textContent = o.d || ''; H.row.innerHTML = o.row || '';
    H.p.style.display = o.p == null ? 'none' : ''; if (o.p != null) H.pi.style.width = Math.max(0, Math.min(100, o.p * 100)) + '%';
    hud.classList.add('on');
  }
  // ---------------- waypoint
  const wp = mk('rpWp', `<div class="dm"></div><span></span>`); const wpT = wp.querySelector('span');
  let wpShown = false, wpTxt = '';
  function waypoint(x, y, dist, edge, ang, color) {
    if (x == null) { if (wpShown) { wp.style.display = 'none'; wpShown = false; } return; }
    if (!wpShown) { wp.style.display = 'block'; wpShown = true; }
    if (color) wp.style.setProperty('--c', color);
    wp.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-50%)`;
    wp.classList.toggle('edge', !!edge);
    wp.firstChild.style.transform = edge ? `rotate(${(ang * 180 / Math.PI - 45).toFixed(0)}deg)` : '';
    const t = Math.round(dist) + ' m'; if (t !== wpTxt) { wpTxt = t; wpT.textContent = t; }
  }
  // ---------------- job panel (minigames)
  const job = mk('rpJob', '');
  let jobOn = false;
  function panel(html, color) {
    if (html == null) { if (jobOn) { job.classList.remove('on'); jobOn = false; if (document.body.dataset.overlay === 'rpjob') delete document.body.dataset.overlay; } return null; }
    job.style.setProperty('--c', color || '#28c2a0'); job.innerHTML = html; job.classList.add('on'); jobOn = true;
    if (!document.body.dataset.overlay) document.body.dataset.overlay = 'rpjob';
    return job;
  }
  // ---------------- end of shift card
  const sum = mk('rpSum', `<div class="box"></div>`); const sumBox = sum.firstChild;
  let sumCb = null;
  function summary(o, cb) {
    if (!o) { sum.classList.remove('on'); sumCb = null; return; }
    sum.style.setProperty('--c', o.color || '#28c2a0');
    sumBox.innerHTML = `<h3>${esc(o.title)}</h3><div style="opacity:.8">${esc(o.sub || '')}</div><table>${(o.rows || []).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>${o.note ? `<p style="opacity:.85;margin:0 0 12px">${esc(o.note)}</p>` : ''}<button>Ok</button>`;
    sum.classList.add('on'); sumCb = cb || null;
    sumBox.querySelector('button').onclick = () => { sum.classList.remove('on'); const f = sumCb; sumCb = null; f && f(); };
  }
  addEventListener('keydown', e => { if (sum.classList.contains('on') && (e.code === 'Enter' || e.code === 'Escape' || e.code === 'KeyE')) { e.preventDefault(); e.stopPropagation(); sumBox.querySelector('button').click(); } }, true);
  return { setHud, waypoint, panel, summary, get panelOn() { return jobOn; }, get summaryOn() { return sum.classList.contains('on'); }, job, COARSE };
}
