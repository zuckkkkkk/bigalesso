// rpg/ui.js — DOM for the looter/RPG layer: HUD (level, XP bar, euro), loot feed, XP popups, level-up / mission
// banners, quest tracker + waypoint, the Zaino overlay (inventory · Personaggio · Banco dei pegni), the hero panel
// (also drawn in the pause menu "Personaggio" tab) and the quest list (phone "Missioni" app).
import { rarityOf, BASES, AMMO, STATS, TREE, power, modsText, xpNeed, MAX_LEVEL, perkInfo } from './data.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString('it-IT');
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const CSS = `
#rpgHud{position:fixed;z-index:7;left:max(20px,env(safe-area-inset-left));bottom:max(84px,calc(env(safe-area-inset-bottom) + 84px));display:flex;align-items:center;gap:12px;pointer-events:none;
 font:600 12px/1 var(--ui,system-ui);color:#fff;text-shadow:0 1px 4px #000a;opacity:0;transition:opacity .5s}
body[data-mode="explore"] #rpgHud,body[data-mode="goto"] #rpgHud,body[data-mode="vespa"] #rpgHud,body[data-mode="npcTalk"] #rpgHud{opacity:1}
body[data-overlay] #rpgHud{opacity:.25}
#rpgHud .lv{width:40px;height:40px;display:grid;place-items:center;font:400 22px/1 var(--gta,Impact,sans-serif);color:#ffd25a;background:radial-gradient(circle at 50% 35%,#3a1c5e,#150a24);
 border:2px solid #ffd25a;transform:rotate(45deg);box-shadow:0 0 14px #ffb52e55}
#rpgHud .lv span{transform:rotate(-45deg)}
#rpgHud .xb{width:210px}
#rpgHud .xb .t{display:flex;justify-content:space-between;letter-spacing:.14em;text-transform:uppercase;font-size:10px;opacity:.82;margin-bottom:5px}
#rpgHud .xb .bar{height:6px;background:rgba(255,255,255,.14);overflow:hidden;border-radius:1px}
#rpgHud .xb .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff3d7f,#ffb52e);transition:width .5s cubic-bezier(.2,.9,.3,1)}
#rpgHud .eu{font:400 22px/1 var(--gta,Impact,sans-serif);letter-spacing:.03em;color:#7dff8a;margin-left:6px}
#rpgHud .pt{display:none;font-size:10px;letter-spacing:.1em;color:#ffd25a;text-transform:uppercase}
#rpgHud .pt.on{display:block}
#rpgFeed{position:fixed;z-index:8;right:max(20px,env(safe-area-inset-right));bottom:max(136px,calc(env(safe-area-inset-bottom) + 136px));display:grid;gap:6px;justify-items:end;pointer-events:none;width:min(360px,70vw)}
.rf{display:flex;align-items:center;gap:10px;padding:7px 14px 7px 9px;background:linear-gradient(90deg,rgba(14,6,26,.0),rgba(14,6,26,.82) 30%);border-right:3px solid var(--c,#fff);
 font:600 13px/1.2 var(--ui,system-ui);color:#fff;transform:translateX(30px);opacity:0;transition:transform .35s cubic-bezier(.2,1.2,.35,1),opacity .35s}
.rf.in{transform:none;opacity:1}.rf i{font-style:normal;font-size:20px}.rf b{color:var(--c,#fff)}.rf small{display:block;font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-top:2px}
#rpgXp{position:fixed;z-index:8;left:max(80px,calc(env(safe-area-inset-left) + 80px));bottom:max(134px,calc(env(safe-area-inset-bottom) + 134px));pointer-events:none;font:400 18px/1 var(--gta,Impact,sans-serif);color:#ffd25a;text-shadow:0 2px 6px #000}
#rpgXp span{display:block;animation:rpgXp 1.4s ease-out forwards}
@keyframes rpgXp{0%{opacity:0;transform:translateY(8px)}15%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-22px)}}
#rpgBan{position:fixed;inset:0;z-index:58;pointer-events:none;display:grid;place-items:center;opacity:0}
#rpgBan.on{animation:rpgBan 3.6s ease forwards}
#rpgBan .fl{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(255,210,90,.38),rgba(255,61,127,.12) 40%,transparent 70%)}
#rpgBan .bx{position:relative;text-align:center;transform:scale(.94);animation:rpgBx 3.6s cubic-bezier(.2,1.2,.35,1) forwards}
#rpgBan .k{font:700 13px/1 var(--ui,system-ui);letter-spacing:.5em;text-transform:uppercase;color:#fff;opacity:.85}
#rpgBan .h{font:400 clamp(54px,8vw,112px)/.92 var(--gta,Impact,sans-serif);letter-spacing:.02em;text-transform:uppercase;background:linear-gradient(100deg,#ffd25a,#ff9a3c 50%,#ff3d7f);
 -webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 5px 0 #2a0640);margin:10px 0 8px}
#rpgBan .s{font:600 15px/1.4 var(--ui,system-ui);color:#f3e9ff;text-shadow:0 1px 6px #000}
@keyframes rpgBan{0%{opacity:0}8%{opacity:1}82%{opacity:1}100%{opacity:0}}
@keyframes rpgBx{0%{transform:scale(1.25)}12%{transform:scale(1)}100%{transform:scale(1.03)}}
#rpgTrack{position:fixed;z-index:7;right:max(24px,env(safe-area-inset-right));top:34vh;width:min(290px,46vw);pointer-events:none;color:#fff;font:500 13px/1.35 var(--ui,system-ui);text-shadow:0 1px 4px #000c;
 opacity:0;transition:opacity .4s}
#rpgTrack.on{opacity:1}
body[data-overlay] #rpgTrack{opacity:0}
#rpgTrack .k{font:700 10px/1 var(--ui,system-ui);letter-spacing:.3em;text-transform:uppercase;color:var(--c,#5ff7ff);margin-bottom:5px}
#rpgTrack .t{font:400 22px/1.02 var(--gta,Impact,sans-serif);letter-spacing:.02em;text-transform:uppercase}
#rpgTrack .d{opacity:.85;margin-top:4px}
#rpgTrack .p{margin-top:6px;height:4px;background:rgba(255,255,255,.15)}#rpgTrack .p i{display:block;height:100%;background:var(--c,#5ff7ff);width:0;transition:width .4s}
#rpgTrack .m{margin-top:5px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.7}
#rpgWp{position:fixed;z-index:6;left:0;top:0;pointer-events:none;display:none;transform:translate(-50%,-50%);text-align:center;color:#5ff7ff;font:700 11px/1 var(--ui,system-ui);letter-spacing:.08em;text-shadow:0 1px 3px #000}
#rpgWp .dm{width:16px;height:16px;margin:0 auto 4px;border:2px solid currentColor;background:rgba(95,247,255,.25);transform:rotate(45deg);box-shadow:0 0 12px currentColor}
#rpgWp.edge .dm{border-width:0 3px 3px 0;background:none;box-shadow:none;width:14px;height:14px}
body[data-overlay] #rpgWp{display:none!important}
#rpgInv{position:fixed;inset:0;z-index:55;display:none;color:#fff;font:500 14px/1.35 var(--ui,system-ui)}
#rpgInv.on{display:block}
#rpgInv .bg{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,rgba(70,20,110,.72),rgba(8,4,16,.9) 70%);backdrop-filter:blur(6px)}
#rpgInv .wr{position:absolute;inset:4vh 4vw;display:grid;grid-template-rows:auto 1fr;gap:14px}
#rpgInv header{display:flex;align-items:center;gap:22px}
#rpgInv nav{display:flex;gap:4px}
#rpgInv nav button{background:none;border:0;color:rgba(255,255,255,.45);font:400 clamp(22px,3.4vh,34px)/1 var(--gta,Impact,sans-serif);letter-spacing:.03em;text-transform:uppercase;padding:6px 14px;cursor:pointer;border-bottom:3px solid transparent}
#rpgInv nav button.on{color:#fff;border-color:#ff3d7f}
#rpgInv nav button[hidden]{display:none}
#rpgInv .mo{margin-left:auto;font:400 30px/1 var(--gta,Impact,sans-serif);color:#7dff8a}
#rpgInv .lvl{font:600 12px/1.2 var(--ui,system-ui);letter-spacing:.14em;text-transform:uppercase;opacity:.75}
#rpgInv .x{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fff;font-size:20px;cursor:pointer}
#rpgInv section{display:none;min-height:0}
#rpgInv section.on{display:grid}
#rpgInv section[data-t="bag"],#rpgInv section[data-t="shop"]{grid-template-columns:minmax(230px,1fr) minmax(320px,1.55fr) minmax(280px,1.15fr);gap:22px;min-height:0}
#rpgInv h3{margin:0 0 10px;font:700 11px/1 var(--ui,system-ui);letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,.6)}
#rpgInv .col{min-height:0;overflow:auto;padding-right:4px}
#rpgInv .slots{display:grid;gap:8px}
#rpgInv .slot{display:grid;grid-template-columns:52px 1fr;align-items:center;gap:10px;min-height:58px;padding:6px 10px 6px 6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);cursor:pointer;position:relative}
#rpgInv .slot .n{position:absolute;left:4px;top:3px;font:700 10px/1 ui-monospace,monospace;opacity:.6}
#rpgInv .slot.sel,#rpgInv .cell.sel{outline:2px solid #fff;outline-offset:1px}
#rpgInv .slot .ic,#rpgInv .cell .ic{width:52px;height:46px;display:grid;place-items:center;font-size:26px;background:linear-gradient(135deg,var(--c,#555) -40%,rgba(0,0,0,.2) 70%)}
#rpgInv .slot b{display:block;font-size:13px;line-height:1.2;color:var(--c,#fff)}#rpgInv .slot small{font-size:11px;opacity:.65}
#rpgInv .slot.act{border-color:#ffd25a}
#rpgInv .ammo{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:14px;font-size:12px}
#rpgInv .ammo span{padding:6px 8px;background:rgba(255,255,255,.05)}
#rpgInv .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:7px;align-content:start}
#rpgInv .cell{position:relative;aspect-ratio:1;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--c,#888) 60%,transparent);background:linear-gradient(160deg,color-mix(in srgb,var(--c,#888) 35%,transparent),rgba(10,5,20,.6));cursor:pointer;font-size:30px}
#rpgInv .cell .ic{background:none;width:auto;height:auto}
#rpgInv .cell em{position:absolute;right:4px;bottom:3px;font:700 10px/1 var(--ui,system-ui);font-style:normal;opacity:.85}
#rpgInv .cell s{position:absolute;left:4px;top:3px;font:700 10px/1 var(--ui,system-ui);text-decoration:none;color:#ffd25a}
#rpgInv .cell.empty{border-style:dashed;border-color:rgba(255,255,255,.08);background:none;cursor:default}
#rpgInv .cell .eq{position:absolute;right:3px;top:3px;font:700 9px/1 var(--ui,system-ui);padding:2px 4px;background:#ffd25a;color:#000}
#rpgInv .card{padding:16px 18px;border-top:4px solid var(--c,#fff);background:linear-gradient(180deg,color-mix(in srgb,var(--c,#888) 22%,rgba(14,6,26,.9)),rgba(14,6,26,.9) 55%)}
#rpgInv .card .r{font:700 11px/1 var(--ui,system-ui);letter-spacing:.3em;text-transform:uppercase;color:var(--c,#fff)}
#rpgInv .card h4{margin:8px 0 2px;font:400 30px/1 var(--gta,Impact,sans-serif);letter-spacing:.02em;text-transform:uppercase}
#rpgInv .card .sub{opacity:.7;font-size:12px}
#rpgInv table{width:100%;border-collapse:collapse;margin:12px 0 8px;font-size:13px}
#rpgInv td{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06)}#rpgInv td:last-child{text-align:right;font-variant-numeric:tabular-nums}
#rpgInv .up{color:#5dff7a}#rpgInv .dn{color:#ff5a5a}
#rpgInv .pk{margin:6px 0;padding:6px 9px;border-left:3px solid var(--c,#fff);background:rgba(255,255,255,.05);font-size:12px}#rpgInv .pk b{display:block;font-size:13px}
#rpgInv .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
#rpgInv .acts button,#rpgHero .acts button{flex:1 1 auto;min-height:40px;padding:8px 12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.07);color:#fff;font:600 13px/1 var(--ui,system-ui);cursor:pointer}
#rpgInv .acts button:hover{background:rgba(255,255,255,.16)}
#rpgInv .acts button.pri{background:#ff3d7f;border-color:#ff3d7f}
#rpgInv .acts kbd{font:700 10px/1 ui-monospace,monospace;padding:2px 4px;background:rgba(0,0,0,.35);margin-right:5px}
#rpgInv .foot{position:absolute;left:4vw;right:4vw;bottom:1.6vh;display:flex;gap:18px;justify-content:center;font-size:11px;letter-spacing:.08em;opacity:.55}
#rpgInv .foot kbd,#rpgTrack kbd{font:700 10px/1 ui-monospace,monospace;padding:2px 5px;border:1px solid rgba(255,255,255,.3);margin-right:4px}
#rpgInv .note{opacity:.6;font-size:12px;margin-top:8px}
.rpgHero{display:grid;grid-template-columns:minmax(260px,1fr) minmax(420px,2fr);gap:26px;color:#fff;font:500 14px/1.35 var(--ui,system-ui)}
.rpgHero .big{font:400 64px/.9 var(--gta,Impact,sans-serif);color:#ffd25a}
.rpgHero .bar{height:8px;background:rgba(255,255,255,.12);margin:8px 0 4px}.rpgHero .bar i{display:block;height:100%;background:linear-gradient(90deg,#ff3d7f,#ffb52e)}
.rpgHero .sts{display:grid;gap:7px;margin-top:14px}
.rpgHero .st{display:grid;grid-template-columns:28px 1fr auto 40px;align-items:center;gap:8px;padding:6px 8px;background:rgba(255,255,255,.05)}
.rpgHero .st b{font-size:14px}.rpgHero .st small{display:block;opacity:.6;font-size:11px}
.rpgHero .st button,.rpgHero .node{cursor:pointer}
.rpgHero .st button{width:36px;height:32px;border:1px solid #ffd25a;background:rgba(255,210,90,.12);color:#ffd25a;font:700 18px/1 var(--ui,system-ui)}
.rpgHero .st button[disabled]{opacity:.2;cursor:default}
.rpgHero .tree{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.rpgHero .br h5{margin:0 0 8px;font:400 22px/1 var(--gta,Impact,sans-serif);letter-spacing:.03em;text-transform:uppercase;color:var(--c)}
.rpgHero .node{display:block;width:100%;text-align:left;margin-bottom:6px;padding:8px 10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:rgba(255,255,255,.5);font:500 12px/1.3 var(--ui,system-ui)}
.rpgHero .node b{display:block;font-size:13px}
.rpgHero .node.got{border-color:var(--c);background:color-mix(in srgb,var(--c) 22%,transparent);color:#fff}
.rpgHero .node.can{border-color:#fff;color:#fff;box-shadow:0 0 0 1px var(--c) inset;animation:rpgPulse 1.4s infinite}
.rpgHero .node[disabled]{cursor:default}
@keyframes rpgPulse{50%{box-shadow:0 0 0 3px var(--c) inset}}
.rpgHero .mods{margin-top:14px;font-size:12px;opacity:.8;line-height:1.6}
.rpgHero .kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:14px}.rpgHero .kpi span{padding:8px;background:rgba(255,255,255,.05);font-size:11px;opacity:.85}.rpgHero .kpi b{display:block;font:400 22px/1 var(--gta,Impact,sans-serif)}
.rpgQ{display:flex;flex-direction:column;gap:8px;padding:10px}
.rpgQ .q{padding:10px 12px;border-radius:12px;background:#ffffff10;border-left:4px solid var(--c,#5ff7ff)}
.rpgQ .q b{display:block}.rpgQ .q small{display:block;opacity:.7;font-size:.82em;margin-top:2px}
.rpgQ .q .pb{height:4px;background:#ffffff20;border-radius:2px;margin:6px 0}.rpgQ .q .pb i{display:block;height:100%;background:var(--c,#5ff7ff);border-radius:2px}
.rpgQ .q .bt{display:flex;gap:6px;margin-top:6px}.rpgQ .q .bt button{flex:1;padding:7px;border:0;border-radius:9px;background:#ffffff1c;color:#fff;font:inherit;font-size:.85em;cursor:pointer}
.rpgQ .q.tr{background:#5ff7ff1f}
.rpgQ .em{opacity:.65;text-align:center;padding:18px 6px;font-size:.92em}
@media (pointer:coarse){
 #rpgHud{left:50%;transform:translateX(-50%);bottom:auto;top:max(8px,env(safe-area-inset-top));gap:8px}
 #rpgHud .xb{width:120px}#rpgHud .lv{width:30px;height:30px;font-size:16px}#rpgHud .eu{font-size:17px}
 #rpgXp{left:50%;top:52px;bottom:auto}
 #rpgTrack{top:auto;bottom:calc(env(safe-area-inset-bottom) + 170px);width:min(230px,44vw)}#rpgTrack .t{font-size:17px}
 #rpgFeed{bottom:auto;top:max(56px,calc(env(safe-area-inset-top) + 50px))}
 #rpgInv .wr{inset:2vh 2vw}
 #rpgInv section[data-t="bag"],#rpgInv section[data-t="shop"]{grid-template-columns:1fr 1.4fr 1.2fr;gap:10px}
 #rpgInv .grid{grid-template-columns:repeat(auto-fill,minmax(56px,1fr))}
 #rpgInv .foot{display:none}
 .rpgHero{grid-template-columns:1fr}
}
@media (max-width:820px){#rpgInv section[data-t="bag"],#rpgInv section[data-t="shop"]{grid-template-columns:1fr 1fr;grid-auto-rows:min-content;overflow:auto}#rpgInv .detail{grid-column:1/-1}}
@media (prefers-reduced-motion:reduce){#rpgBan.on,#rpgBan .bx,#rpgXp span,.rpgHero .node.can{animation-duration:.01s}}
`;

const STAT_ROWS = [
  ['Danno', s => s.damage, 1, v => v.toFixed(v < 10 ? 1 : 0)],
  ['Cadenza', s => s.fireRate, 1, v => v.toFixed(1) + '/s'],
  ['Caricatore', s => s.magazine || Infinity, 1, v => v === Infinity ? '∞' : v],
  ['Ricarica', s => s.reloadTime, -1, v => v ? v.toFixed(1) + ' s' : '—'],
  ['Portata', s => s.range, 1, v => v.toFixed(0) + ' m'],
  ['Precisione', s => 1 / (0.004 + s.spread), 1, v => Math.round(Math.min(100, v / 2.5)) + '%'],
  ['Esplosione', s => s.splashRadius || 0, 1, v => v ? v.toFixed(1) + ' m' : '—'],
  ['Spinta', s => s.knockback || 0, 1, v => v.toFixed(1)],
];

export function createRPGUI(R) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, html = '', tag = 'div') => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; document.body.appendChild(e); return e; };
  // ---------------------------------------------------------------- HUD
  const hud = mk('rpgHud', `<div class="lv"><span>1</span></div><div class="xb"><div class="t"><span class="xt">Livello 1</span><span class="xn"></span></div><div class="bar"><i></i></div><div class="pt"></div></div><div class="eu">€ 0</div>`);
  const H = { lv: hud.querySelector('.lv span'), xt: hud.querySelector('.xt'), xn: hud.querySelector('.xn'), bar: hud.querySelector('.bar i'), eu: hud.querySelector('.eu'), pt: hud.querySelector('.pt') };
  let hudKey = '';
  function refreshHud() {
    const s = R.state, need = s.level >= MAX_LEVEL ? 1 : xpNeed(s.level), picks = R.talentPicks();
    const key = [s.level, s.xp, s.money, s.points, picks].join('|'); if (key === hudKey) return; hudKey = key;
    H.lv.textContent = s.level; H.xt.textContent = 'Livello ' + s.level; H.xn.textContent = s.level >= MAX_LEVEL ? 'MAX' : fmt(s.xp) + ' / ' + fmt(need) + ' XP';
    H.bar.style.width = (s.level >= MAX_LEVEL ? 100 : Math.min(100, s.xp / need * 100)).toFixed(1) + '%';
    H.eu.textContent = '€ ' + fmt(s.money);
    const pts = []; if (s.points) pts.push(s.points + (s.points === 1 ? ' punto' : ' punti')); if (picks) pts.push(picks + (picks === 1 ? ' talento' : ' talenti'));
    H.pt.textContent = pts.length ? pts.join(' · ') + ' da spendere · ' + (COARSE ? '🎒' : 'I') : ''; H.pt.classList.toggle('on', pts.length > 0);
  }
  // ---------------------------------------------------------------- feed + xp popups + banner
  const feed = mk('rpgFeed'); const xpEl = mk('rpgXp');
  function feedAdd(icon, title, sub, color = '#fff') {
    const e = document.createElement('div'); e.className = 'rf'; e.style.setProperty('--c', color);
    e.innerHTML = `<i>${esc(icon)}</i><div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    feed.prepend(e); requestAnimationFrame(() => requestAnimationFrame(() => e.classList.add('in')));
    while (feed.children.length > 5) feed.lastChild.remove();
    setTimeout(() => { e.classList.remove('in'); setTimeout(() => e.remove(), 400); }, 3600);
  }
  let xpAcc = 0, xpT = 0;
  function xpPop(n) { xpAcc += n; clearTimeout(xpT); xpT = setTimeout(() => { const s = document.createElement('span'); s.textContent = '+' + fmt(xpAcc) + ' XP'; xpAcc = 0; xpEl.replaceChildren(s); }, 120); }
  const ban = mk('rpgBan', `<div class="fl"></div><div class="bx"><div class="k"></div><div class="h"></div><div class="s"></div></div>`);
  const banQ = []; let banOn = false;
  function banner(k, h, s) { banQ.push([k, h, s]); if (!banOn) nextBan(); }
  function nextBan() {
    const b = banQ.shift(); if (!b) { banOn = false; return; } banOn = true;
    ban.querySelector('.k').textContent = b[0]; ban.querySelector('.h').textContent = b[1]; ban.querySelector('.s').textContent = b[2] || '';
    ban.classList.remove('on'); void ban.offsetWidth; ban.classList.add('on');
    setTimeout(nextBan, 3500);
  }
  // ---------------------------------------------------------------- quest tracker + waypoint
  const track = mk('rpgTrack', `<div class="k"></div><div class="t"></div><div class="d"></div><div class="p"><i></i></div><div class="m"></div>`);
  const T = { k: track.querySelector('.k'), t: track.querySelector('.t'), d: track.querySelector('.d'), p: track.querySelector('.p'), pi: track.querySelector('.p i'), m: track.querySelector('.m') };
  let trKey = '';
  function setTracker(q) {
    if (!q) { if (trKey) { trKey = ''; track.classList.remove('on'); } return; }
    const key = [q.id, q.state, q.have, q.need, q.hint || ''].join('|'); if (key === trKey) return; trKey = key;
    track.style.setProperty('--c', q.color || '#5ff7ff');
    T.k.textContent = 'Missione · ' + q.giverName; T.t.textContent = q.title; T.d.textContent = q.step || q.desc;
    T.p.style.display = q.need > 1 ? '' : 'none'; T.pi.style.width = Math.min(100, q.have / q.need * 100) + '%';
    T.m.innerHTML = q.hint ? esc(q.hint) : (COARSE ? 'Telefono → Missioni' : '<kbd>J</kbd>missioni · <kbd>I</kbd>zaino');
    track.classList.add('on');
  }
  const wp = mk('rpgWp', `<div class="dm"></div><span></span>`); const wpT = wp.querySelector('span');
  let wpShown = false, wpTxt = '';
  function waypoint(x, y, dist, edge, ang) {
    if (x == null) { if (wpShown) { wp.style.display = 'none'; wpShown = false; } return; }
    if (!wpShown) { wp.style.display = 'block'; wpShown = true; }
    wp.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(-50%,-50%)`;
    wp.classList.toggle('edge', !!edge);
    wp.firstChild.style.transform = edge ? `rotate(${(ang * 180 / Math.PI - 45).toFixed(0)}deg)` : '';
    const t = Math.round(dist) + ' m'; if (t !== wpTxt) { wpTxt = t; wpT.textContent = t; }
  }

  // ---------------------------------------------------------------- inventory overlay
  const inv = mk('rpgInv', `<div class="bg"></div><div class="wr">
    <header><nav><button data-tab="bag">Zaino</button><button data-tab="hero">Personaggio</button><button data-tab="shop" hidden>Banco dei pegni</button></nav>
      <div class="mo"></div><div class="lvl"></div><button class="x" aria-label="Chiudi">✕</button></header>
    <section data-t="bag"><div class="col"><h3>Equipaggiamento</h3><div class="slots" data-eq></div><h3 style="margin-top:16px">Munizioni</h3><div class="ammo"></div></div>
      <div class="col"><h3 class="bh">Zaino</h3><div class="grid" data-grid></div></div><div class="col detail" data-detail></div></section>
    <section data-t="hero"><div class="col" id="rpgHero"></div></section>
    <section data-t="shop"><div class="col"><h3>Il banco</h3><p class="note">«Compro oro, vendo armi ad acqua. Non fate domande.» Si vende dallo zaino: seleziona un oggetto e premi Vendi.</p><div class="acts" data-reroll></div></div>
      <div class="col"><h3>In vendita</h3><div class="grid" data-stock></div></div><div class="col detail" data-sdetail></div></section>
  </div><div class="foot"><span><kbd>I</kbd><kbd>Esc</kbd>chiudi</span><span><kbd>Tab</kbd>scheda</span><span><kbd>←↑→↓</kbd>scegli</span><span><kbd>E</kbd>equipaggia</span><span><kbd>1-4</kbd>slot</span><span><kbd>X</kbd>smonta/vendi</span><span><kbd>G</kbd>butta</span><span><kbd>U</kbd>usa</span></div>`);
  const $ = s => inv.querySelector(s);
  let tab = 'bag', sel = null, shopOpen = false, shopSel = null, open_ = false;
  const tabs = () => ['bag', 'hero'].concat(shopOpen ? ['shop'] : []);
  function show(t) {
    tab = t;
    for (const b of inv.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.tab === t);
    for (const s of inv.querySelectorAll('section')) s.classList.toggle('on', s.dataset.t === t);
    render();
  }
  function open(t = 'bag', shop = false) {
    shopOpen = shop; $('nav [data-tab="shop"]').hidden = !shop;
    open_ = true; inv.classList.add('on'); document.body.dataset.overlay = 'inv'; R.onOverlay(true);
    if (!sel || !R.byId(sel)) sel = (R.bag()[0] || {}).id || R.state.eq.w.find(Boolean) || null;
    show(t);
  }
  function close() { if (!open_) return; open_ = false; inv.classList.remove('on'); if (document.body.dataset.overlay === 'inv') delete document.body.dataset.overlay; R.onOverlay(false); }
  inv.querySelector('.x').onclick = close;
  inv.querySelector('nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { R.sfx('tab'); show(b.dataset.tab); } });

  const cellHTML = (it, cls = '') => {
    if (!it) return `<div class="cell empty ${cls}"></div>`;
    const c = rarityOf(it.rarity).color, eq = R.slotOf(it.id);
    return `<div class="cell ${cls}${it.id === sel || it.id === shopSel ? ' sel' : ''}" data-id="${esc(it.id)}" style="--c:${c}" title="${esc(it.name)}"><span class="ic">${esc(it.icon || '?')}</span>${it.kind === 'consumable' || it.kind === 'ammo' ? `<em>x${it.n}</em>` : `<em>${it.level}</em>`}${it.perks && it.perks.length ? `<s>${'•'.repeat(it.perks.length)}</s>` : ''}${eq ? `<span class="eq">${esc(eq.label)}</span>` : ''}</div>`;
  };
  function renderBag() {
    const S = R.state;
    $('.mo').textContent = '€ ' + fmt(S.money); $('.lvl').innerHTML = `Livello ${S.level}<br>${fmt(S.xp)} / ${fmt(xpNeed(S.level))} XP`;
    const eqEl = $('[data-eq]'); let h = '';
    for (let i = 0; i < 4; i++) { const it = R.byId(S.eq.w[i]); h += slotHTML(it, 'Arma ' + (i + 1), i + 1, 'w' + i, i === S.eq.active); }
    for (let i = 0; i < 2; i++) { const it = R.byId(S.eq.g[i]); h += slotHTML(it, 'Accessorio ' + (i + 1), 'A' + (i + 1), 'g' + i, false); }
    eqEl.innerHTML = h;
    $('.ammo').innerHTML = Object.entries(AMMO).map(([k, a]) => `<span>${a.icon} ${esc(a.short)} <b>${fmt(S.ammo[k] || 0)}</b><small style="opacity:.5">/${a.max}</small></span>`).join('');
    const bag = R.bag();
    $('.bh').textContent = `Zaino ${bag.length}/${R.BAG}`;
    let g = ''; for (let i = 0; i < R.BAG; i++) g += cellHTML(bag[i]); $('[data-grid]').innerHTML = g;
    renderDetail($('[data-detail]'), R.byId(sel), shopOpen ? 'sell' : 'bag');
  }
  function slotHTML(it, label, n, key, act) {
    if (!it) return `<div class="slot" data-slot="${key}"><span class="n">${esc(n)}</span><div class="ic" style="--c:#333">·</div><div><b style="opacity:.4">${esc(label)}</b><small>vuoto</small></div></div>`;
    const R_ = rarityOf(it.rarity);
    return `<div class="slot${act ? ' act' : ''}${it.id === sel ? ' sel' : ''}" data-slot="${key}" data-id="${esc(it.id)}" style="--c:${R_.color}"><span class="n">${esc(n)}</span><div class="ic">${esc(it.icon)}</div><div><b>${esc(it.name)}</b><small>${esc(R_.name)} · liv. ${it.level} · ${it.kind === 'weapon' ? 'potenza ' + power(it) : esc(it.desc || '')}</small></div></div>`;
  }
  function cmpRows(it, ref) {
    if (it.kind !== 'weapon') return '';
    const s = it.stats, r = ref && ref.stats;
    let h = '<table>';
    for (const [lab, f, dir, out] of STAT_ROWS) {
      const v = f(s), w = r ? f(r) : null; let cls = '', arr = '';
      if (w != null && isFinite(v) && isFinite(w) && Math.abs(v - w) > 1e-6 * Math.max(1, Math.abs(w))) { const better = (v - w) * dir > 0; cls = better ? 'up' : 'dn'; arr = better ? ' ▲' : ' ▼'; }
      else if (w != null && v !== w && (v === Infinity || w === Infinity)) { const better = (v === Infinity) === (dir > 0); cls = better ? 'up' : 'dn'; arr = better ? ' ▲' : ' ▼'; }
      h += `<tr><td>${lab}</td><td class="${cls}">${out(v)}${arr}</td></tr>`;
    }
    const p = power(it), q = ref ? power(ref) : null;
    h += `<tr><td><b>Potenza</b></td><td class="${q == null || p === q ? '' : p > q ? 'up' : 'dn'}"><b>${p}</b>${q == null || p === q ? '' : p > q ? ' ▲' : ' ▼'}</td></tr></table>`;
    return h;
  }
  function renderDetail(el, it, mode) {
    if (!it) { el.innerHTML = `<div class="card" style="--c:#555"><div class="r">Niente selezionato</div><h4>Zaino</h4><p class="note">Raccogli roba in giro: casse, frighi, bauletti delle Vespe, nemici stesi. Le armi più rare brillano di più.</p></div>`; return; }
    const Rr = rarityOf(it.rarity), eq = R.slotOf(it.id);
    const ref = it.kind === 'weapon' && !eq ? R.compareRef(it) : null;
    let h = `<div class="card" style="--c:${Rr.color}"><div class="r">${it.kind === 'consumable' ? 'Consumabile' : it.kind === 'ammo' ? 'Munizioni' : esc(Rr.name) + ' · livello ' + it.level}</div><h4>${esc(it.icon)} ${esc(it.name)}</h4>`;
    h += `<div class="sub">${it.kind === 'ammo' ? esc(it.desc) : it.kind === 'weapon' ? esc(BASES[it.base].name) + (BASES[it.base].ammo ? ' · ' + AMMO[BASES[it.base].ammo].icon + ' ' + AMMO[BASES[it.base].ammo].short : ' · corpo a corpo') : it.kind === 'gadget' ? 'Accessorio' : esc(it.desc)}${it.starter ? ' · munizioni infinite' : ''}${ref ? ' · confronto con ' + esc(ref.name) : ''}</div>`;
    h += cmpRows(it, ref);
    if (it.kind === 'gadget') h += `<div class="pk" style="--c:${Rr.color}"><b>Bonus</b>${esc(it.desc)}</div>`;
    for (const p of (it.perks || []).map(perkInfo)) h += `<div class="pk" style="--c:${p.legendary ? '#ffb52e' : Rr.color}"><b>${p.legendary ? '★ ' : ''}${esc(p.name)}</b>${esc(p.desc)}</div>`;
    h += '<div class="acts">';
    if (mode === 'buy') {
      const price = R.buyPrice(it);
      h += `<button class="pri" data-a="buy" ${R.state.money < price ? 'disabled' : ''}>Compra · € ${fmt(price)}</button>`;
    } else {
      if (it.kind === 'weapon') { if (eq) h += `<button data-a="unequip">Togli</button>`; else for (let i = 0; i < 4; i++) h += `<button data-a="eq" data-s="${i}" class="${i === 0 ? 'pri' : ''}"><kbd>${i + 1}</kbd>Slot ${i + 1}</button>`; }
      if (it.kind === 'gadget') { if (eq) h += `<button data-a="unequip">Togli</button>`; else for (let i = 0; i < 2; i++) h += `<button data-a="eq" data-s="${i}" class="${i === 0 ? 'pri' : ''}"><kbd>${i + 1}</kbd>Accessorio ${i + 1}</button>`; }
      if (it.kind === 'consumable') h += `<button class="pri" data-a="use"><kbd>U</kbd>Usa</button>`;
      if (!it.starter) h += mode === 'sell' ? `<button data-a="sell"><kbd>X</kbd>Vendi · € ${fmt(R.sellPrice(it))}</button>` : (it.kind !== 'consumable' ? `<button data-a="scrap"><kbd>X</kbd>Smonta · € ${fmt(R.scrapPrice(it))}</button>` : '');
      if (!it.starter) h += `<button data-a="drop"><kbd>G</kbd>Butta</button>`;
    }
    h += '</div></div>';
    el.innerHTML = h;
  }
  function renderShop() {
    const st_ = R.shopStock();
    $('[data-stock]').innerHTML = st_.map(it => cellHTML(it)).join('');
    if (!shopSel || !st_.find(x => x.id === shopSel)) shopSel = st_[0] && st_[0].id;
    renderDetail($('[data-sdetail]'), st_.find(x => x.id === shopSel), 'buy');
    $('[data-reroll]').innerHTML = `<button data-a="reroll">Fammi vedere altra roba · € ${fmt(R.rerollPrice())}</button>`;
    $('.mo').textContent = '€ ' + fmt(R.state.money);
  }
  function render() {
    if (!open_) return;
    { const S = R.state; $('.mo').textContent = '€ ' + fmt(S.money); $('.lvl').innerHTML = `Livello ${S.level}<br>${S.level >= MAX_LEVEL ? 'MAX' : fmt(S.xp) + ' / ' + fmt(xpNeed(S.level)) + ' XP'}`; }
    if (tab === 'bag') renderBag(); else if (tab === 'hero') renderHero($('#rpgHero')); else if (tab === 'shop') renderShop();
  }
  inv.addEventListener('click', e => {
    const a = e.target.closest('[data-a]');
    if (a && !a.disabled) { act(a.dataset.a, a.dataset.s); return; }
    const c = e.target.closest('[data-id]'); if (c) { R.sfx('tick'); if (tab === 'shop' && c.closest('[data-stock]')) shopSel = c.dataset.id; else sel = c.dataset.id; render(); return; }
    const sl = e.target.closest('[data-slot]'); if (sl && !sl.dataset.id) { const it = R.byId(sel); if (it && sl.dataset.slot[0] === (it.kind === 'weapon' ? 'w' : 'g')) act('eq', sl.dataset.slot.slice(1)); }
  });
  function act(a, s) {
    const it = R.byId(sel);
    if (a === 'buy') { const st_ = R.shopStock(), x = st_.find(y => y.id === shopSel); if (x) R.buy(x); render(); return; }
    if (a === 'reroll') { R.reroll(); render(); return; }
    if (!it) return;
    if (a === 'eq') R.equip(it.id, +s);
    else if (a === 'unequip') R.unequip(it.id);
    else if (a === 'use') R.use(it.id);
    else if (a === 'scrap') { const next = neighbour(it.id); if (R.scrap(it.id)) sel = next; }
    else if (a === 'sell') { const next = neighbour(it.id); if (R.sell(it.id)) sel = next; }
    else if (a === 'drop') { const next = neighbour(it.id); if (R.dropItem(it.id)) sel = next; }
    render();
  }
  const neighbour = id => { const b = R.bag(), i = b.findIndex(x => x.id === id); return (b[i + 1] || b[i - 1] || {}).id || null; };
  // keys while open (capture: the game never sees them)
  addEventListener('keydown', e => {
    if (!open_) return;
    const c = e.code;
    if (e.target && e.target.tagName === 'INPUT') return;
    e.stopImmediatePropagation(); // the phone / menu / game listeners never see keys while the Zaino is open
    if (c === 'Escape' || c === 'KeyI') { e.preventDefault(); close(); return; }
    if (c === 'Tab') { e.preventDefault(); const t = tabs(); show(t[(t.indexOf(tab) + (e.shiftKey ? t.length - 1 : 1)) % t.length]); return; }
    if (tab === 'hero') return;
    const list = tab === 'shop' ? R.shopStock() : R.equippedList().concat(R.bag());
    const cur = tab === 'shop' ? shopSel : sel;
    const i = list.findIndex(x => x.id === cur);
    const cols = Math.max(1, Math.round(($(tab === 'shop' ? '[data-stock]' : '[data-grid]').clientWidth || 400) / 77));
    let ni = null;
    if (c === 'ArrowRight' || c === 'KeyD') ni = i + 1; else if (c === 'ArrowLeft' || c === 'KeyA') ni = i - 1;
    else if (c === 'ArrowDown' || c === 'KeyS') ni = i + cols; else if (c === 'ArrowUp' || c === 'KeyW') ni = i - cols;
    if (ni != null) { e.preventDefault(); ni = Math.max(0, Math.min(list.length - 1, ni)); if (list[ni]) { if (tab === 'shop') shopSel = list[ni].id; else sel = list[ni].id; R.sfx('tick'); render(); } return; }
    if (tab === 'shop') { if (c === 'Enter' || c === 'KeyE') act('buy'); return; }
    const it = R.byId(sel); if (!it) return;
    if (/^Digit[1-4]$/.test(c)) act('eq', String(+c.slice(5) - 1));
    else if (c === 'Enter' || c === 'KeyE') { if (R.slotOf(it.id)) act('unequip'); else if (it.kind === 'consumable') act('use'); else act('eq', String(R.firstFree(it.kind))); }
    else if (c === 'KeyU') act('use');
    else if (c === 'KeyX') act(shopOpen ? 'sell' : 'scrap');
    else if (c === 'KeyG') act('drop');
  }, true);

  // ---------------------------------------------------------------- hero (Zaino tab + pause menu page)
  function renderHero(el) {
    if (!el) return;
    const S = R.state, need = xpNeed(S.level), picks = R.talentPicks(), M = R.mods();
    const stats = Object.entries(STATS).map(([k, d]) => `<div class="st"><span>${d.icon}</span><span><b>${d.name} · ${S.stats[k]}</b><small>${d.desc}</small></span><span></span><button data-stat="${k}" ${S.points && !(d.cap && S.stats[k] >= d.cap) ? '' : 'disabled'} aria-label="Aggiungi a ${d.name}">+</button></div>`).join('');
    const tree = TREE.map(b => {
      const got = S.talents.filter(id => b.perks.some(p => p.id === id)).length;
      return `<div class="br" style="--c:${b.color}"><h5>${b.icon} ${esc(b.name)}</h5>` + b.perks.map((p, i) => {
        const g = S.talents.includes(p.id), can = !g && i === got && picks > 0;
        return `<button class="node${g ? ' got' : ''}${can ? ' can' : ''}" data-perk="${p.id}" ${can ? '' : 'disabled'}><b>${esc(p.name)}</b>${esc(p.desc)}</button>`;
      }).join('') + '</div>';
    }).join('');
    const mods = modsText(Object.fromEntries(Object.entries(M).filter(([k, v]) => (k === 'regen' || k === 'healOnKill') ? v : Math.abs(v - 1) > 0.004)));
    el.innerHTML = `<div class="rpgHero"><div>
      <div class="lvl" style="letter-spacing:.3em;text-transform:uppercase;font-size:11px;opacity:.7">Zuck · il titolare</div>
      <div class="big">Livello ${S.level}</div>
      <div class="bar"><i style="width:${S.level >= MAX_LEVEL ? 100 : Math.min(100, S.xp / need * 100).toFixed(1)}%"></i></div>
      <div style="font-size:12px;opacity:.75">${S.level >= MAX_LEVEL ? 'Livello massimo' : fmt(S.xp) + ' / ' + fmt(need) + ' XP al prossimo livello'}</div>
      <h3 style="margin-top:18px">Abilità · ${S.points} ${S.points === 1 ? 'punto' : 'punti'} da spendere</h3><div class="sts">${stats}</div>
      <div class="mods"><b>Bonus attivi</b><br>${esc(mods || 'nessuno, per ora')}</div>
      <div class="kpi"><span><b>${fmt(S.kills)}</b>nemici stesi</span><span><b>${fmt(S.questsDone)}</b>missioni</span><span><b>${fmt(S.crates)}</b>casse aperte</span></div>
    </div><div><h3>Talenti · ${picks} da scegliere <small style="opacity:.6;letter-spacing:.05em;text-transform:none">(uno ogni 5 livelli, in ordine dentro ogni ramo)</small></h3><div class="tree">${tree}</div></div></div>`;
    el.onclick = e => {
      const s = e.target.closest('[data-stat]'); if (s && !s.disabled) { R.spendPoint(s.dataset.stat); renderHero(el); return; }
      const p = e.target.closest('[data-perk]'); if (p && !p.disabled) { R.pickTalent(p.dataset.perk); renderHero(el); }
    };
  }
  // ---------------------------------------------------------------- quests (phone app)
  function renderQuests(el) {
    if (!el) return;
    el.classList.add('rpgQ');
    const qs = R.quests.list();
    let h = '';
    if (!qs.length) h += `<div class="em">Nessuna missione.<br>Parla con gli amici (E, poi <b>6 · Hai qualcosa da fare?</b>) per farti dare qualcosa da fare.</div>`;
    for (const q of qs) h += `<div class="q${q.id === R.state.tracked ? ' tr' : ''}" style="--c:${q.color}"><b>${esc(q.title)}</b><small>${esc(q.giverName)} · ${esc(q.step || q.desc)}</small>${q.need > 1 ? `<div class="pb"><i style="width:${Math.min(100, q.have / q.need * 100)}%"></i></div>` : ''}<small>Premio: ${fmt(q.reward.xp)} XP · € ${fmt(q.reward.euro)}${q.reward.loot ? ' · bottino' : ''}</small><div class="bt"><button data-qt="${q.id}">${q.id === R.state.tracked ? 'Seguita ✓' : 'Segui'}</button><button data-qx="${q.id}">Lascia perdere</button></div></div>`;
    h += `<div class="em" style="padding:8px">Missioni completate: ${fmt(R.state.questsDone)}</div>`;
    el.innerHTML = h;
    el.onclick = e => {
      const t = e.target.closest('[data-qt]'); if (t) { R.quests.track(t.dataset.qt); renderQuests(el); return; }
      const x = e.target.closest('[data-qx]'); if (x) { if (x.dataset.arm) { R.quests.abandon(x.dataset.qx); renderQuests(el); } else { x.dataset.arm = 1; x.textContent = 'Sicuro?'; } }
    };
  }

  return { refreshHud, feedAdd, xpPop, banner, setTracker, waypoint, open, close, render, renderHero, renderQuests, get isOpen() { return open_; }, get tab() { return tab; } };
}
