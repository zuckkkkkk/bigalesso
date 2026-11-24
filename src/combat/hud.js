// combat/hud.js — DOM HUD (desktop style, same palette as ui.js): health bottom-left, weapon/ammo + slots bottom-right,
// crosshair + hit marker, damage numbers and enemy bars projected from 3D (pooled), damage vignette, K.O. screen,
// boss bar, touch buttons (FIRE / MIRA / RICARICA / ARMA / VISTA) on coarse pointers only.
import * as THREE from 'three';
import { RARITY, BASES } from './weapons.js';

const CSS = `
#cbHud{position:fixed;inset:0;pointer-events:none;z-index:5;font-family:var(--ui,system-ui,-apple-system,Segoe UI,Roboto,sans-serif)}
#cbHud .glassy{background:rgba(14,6,34,.72);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 6px 20px rgba(0,0,0,.35)}
#cbHp{position:absolute;left:max(16px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));width:230px;padding:8px 12px 10px;border-radius:14px;opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s}
#cbHp.on{opacity:1;transform:none}
#cbHp .row{display:flex;align-items:baseline;justify-content:space-between;color:#fff;font-weight:900;letter-spacing:.04em;font-size:12px;text-transform:uppercase}
#cbHp .row b{font-size:20px;color:#c8ff3c;text-shadow:0 0 10px rgba(200,255,60,.45)}
#cbHp .bar{position:relative;height:9px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:5px}
#cbHp .bar i{position:absolute;inset:0 auto 0 0;width:100%;border-radius:6px;background:linear-gradient(90deg,#8ee022,#c8ff3c);transition:width .18s}
#cbHp .bar s{position:absolute;inset:0 auto 0 0;width:100%;background:rgba(255,80,90,.75);transition:width .6s .25s}
#cbHp.low .bar i{background:linear-gradient(90deg,#ff3b4a,#ff8a3c)} #cbHp.low b{color:#ff6a6a;text-shadow:0 0 10px rgba(255,60,60,.5)}
#cbHp .lv{font-size:11px;color:#bfa8ff;font-weight:800}
#cbAmmo{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));min-width:210px;padding:8px 12px 10px;border-radius:14px;opacity:0;transform:translateY(8px);transition:opacity .3s,transform .3s;color:#fff;text-align:right}
#cbAmmo.on{opacity:1;transform:none}
#cbAmmo .nm{font-weight:900;font-size:13px;letter-spacing:.03em}
#cbAmmo .rr{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;opacity:.85}
#cbAmmo .am{font-weight:900;font-size:26px;line-height:1.05;font-variant-numeric:tabular-nums}
#cbAmmo .am small{font-size:14px;opacity:.6}
#cbAmmo .rl{height:4px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:4px;opacity:0}
#cbAmmo .rl i{display:block;height:100%;width:0;background:#ffd21f}
#cbAmmo.reloading .rl{opacity:1} #cbAmmo.reloading .am{color:#ffd21f}
#cbAmmo .sl{display:flex;gap:5px;justify-content:flex-end;margin-top:6px}
#cbAmmo .sl span{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font-size:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);position:relative}
#cbAmmo .sl span em{position:absolute;left:3px;top:1px;font:800 9px/1 system-ui;font-style:normal;opacity:.6}
#cbAmmo .sl span.cur{border-color:#c8ff3c;box-shadow:0 0 0 1px #c8ff3c inset,0 0 12px rgba(200,255,60,.35)}
#cbAmmo .sl span.empty{opacity:.35}
#cbX{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;transition:opacity .15s}
#cbX.on{opacity:1}
#cbX i{position:absolute;background:#fff;box-shadow:0 0 2px #000,0 0 1px #000;border-radius:1px}
#cbX .d{width:4px;height:4px;left:-2px;top:-2px;border-radius:50%;background:#c8ff3c}
#cbX .h{width:9px;height:2px;top:-1px}#cbX .v{width:2px;height:9px;left:-1px}
#cbHit{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
#cbHit i{position:absolute;width:11px;height:2px;background:#fff;left:-5px;top:-1px;box-shadow:0 0 2px #000}
#cbHit.kill i{background:#ff3b4a;height:3px}
#cbVig{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 52%,rgba(190,10,30,.55) 100%)}
#cbKO{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:#000;opacity:0;pointer-events:none;transition:opacity .5s}
#cbKO.on{opacity:1}
#cbKO div{text-align:center;color:#fff;transform:scale(.6) rotate(-6deg);transition:transform .45s cubic-bezier(.2,1.6,.4,1)}
#cbKO.on div{transform:scale(1) rotate(-6deg)}
#cbKO b{display:block;font:900 clamp(64px,13vw,160px)/1 system-ui,sans-serif;color:#ffd21f;-webkit-text-stroke:4px #2a0b3e;text-shadow:6px 6px 0 #ff3d7f;letter-spacing:.02em}
#cbKO small{display:block;margin-top:14px;font:800 16px/1.3 system-ui,sans-serif;letter-spacing:.06em;opacity:.85}
#cbBoss{position:absolute;left:50%;top:max(70px,calc(env(safe-area-inset-top) + 64px));transform:translateX(-50%);width:min(520px,70vw);padding:7px 12px 9px;border-radius:12px;color:#fff;opacity:0;transition:opacity .4s}
#cbBoss.on{opacity:1}
#cbBoss .t{font-weight:900;font-size:13px;letter-spacing:.08em;text-transform:uppercase;display:flex;justify-content:space-between}
#cbBoss .t em{font-style:normal;color:#ffd21f}
#cbBoss .bar{height:10px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:5px}
#cbBoss .bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff3b4a,#ffb52e);transition:width .2s}
.cbN{position:absolute;left:0;top:0;font:900 18px/1 system-ui,sans-serif;color:#fff;-webkit-text-stroke:1px rgba(0,0,0,.6);text-shadow:0 2px 0 rgba(0,0,0,.5);white-space:nowrap;will-change:transform,opacity;opacity:0}
.cbN.crit{font-size:24px;color:#ffd21f}
.cbB{position:absolute;left:0;top:0;width:58px;height:6px;margin-left:-29px;border-radius:4px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.25);overflow:hidden;opacity:0}
.cbB i{display:block;height:100%;background:#ff4a5a;width:100%}
.cbB em{position:absolute;left:-26px;top:-5px;font:800 9px/1 system-ui;font-style:normal;color:#fff;text-shadow:0 1px 2px #000}
/* touch buttons */
.cbT{position:fixed;z-index:6;display:none;border-radius:50%;border:2px solid rgba(255,255,255,.55);color:#fff;font:900 11px/1.05 system-ui,sans-serif;text-align:center;touch-action:none;
  -webkit-tap-highlight-color:transparent;box-shadow:0 4px 0 rgba(0,0,0,.45);pointer-events:auto;user-select:none;-webkit-user-select:none;place-items:center;padding:2px}
.cbT.on{transform:translateY(2px) scale(.95);filter:brightness(1.3)}
body.touchui.cbOn[data-mode="explore"] .cbT,body.touchui.cbOn[data-mode="goto"] .cbT{display:grid}
body.touchui.cbOn:not(.cbArmed) #cbTFire,body.touchui.cbOn:not(.cbArmed) #cbTAim,body.touchui.cbOn:not(.cbArmed) #cbTRel{display:none!important}
body.touchui[data-overlay] .cbT{display:none!important}
#cbTFire{right:max(22px,env(safe-area-inset-right));bottom:max(166px,calc(env(safe-area-inset-bottom) + 156px));width:82px;height:82px;font-size:13px;background:radial-gradient(circle at 40% 30%,#ff6a70,#c0141e)}
#cbTAim{right:max(118px,env(safe-area-inset-right));bottom:max(178px,calc(env(safe-area-inset-bottom) + 168px));width:56px;height:56px;background:radial-gradient(circle at 40% 30%,#7ad0ff,#1a6cc0)}
#cbTAim.lock{box-shadow:0 0 0 3px #c8ff3c,0 4px 0 rgba(0,0,0,.45)}
#cbTRel{right:max(126px,env(safe-area-inset-right));bottom:max(244px,calc(env(safe-area-inset-bottom) + 234px));width:46px;height:46px;font-size:18px;background:rgba(20,8,46,.85)}
#cbTSw{right:max(30px,env(safe-area-inset-right));bottom:max(258px,calc(env(safe-area-inset-bottom) + 248px));width:62px;height:62px;font-size:24px;background:rgba(20,8,46,.85)}
#cbTView{right:max(180px,env(safe-area-inset-right));bottom:max(250px,calc(env(safe-area-inset-bottom) + 240px));width:42px;height:42px;font-size:18px;background:rgba(20,8,46,.85)}
@media (max-height:420px){#cbHp{width:170px;padding:6px 10px 8px}#cbAmmo{min-width:150px;padding:6px 10px}#cbAmmo .am{font-size:20px}}
body.touchui #cbAmmo{bottom:auto;top:max(64px,calc(env(safe-area-inset-top) + 58px));transform:none}
body.touchui #cbAmmo .sl{display:none}
`;

const _v = new THREE.Vector3();
const perkName = id => { try { const R = window.__rpg, p = R && R.perkInfo && R.perkInfo(id); return (p && p.name) || id; } catch (e) { return id; } };
export function createCombatHUD({ camera }) {
  const st = document.createElement('style'); st.id = 'combatCss'; st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'cbHud';
  root.innerHTML = `<div id="cbVig"></div>
    <div id="cbX"><i class="d"></i><i class="h" style="left:-15px"></i><i class="h" style="left:6px"></i><i class="v" style="top:-15px"></i><i class="v" style="top:6px"></i></div>
    <div id="cbHit"><i style="transform:rotate(45deg) translateX(-9px)"></i><i style="transform:rotate(45deg) translateX(9px)"></i><i style="transform:rotate(-45deg) translateX(-9px)"></i><i style="transform:rotate(-45deg) translateX(9px)"></i></div>
    <div id="cbHp" class="glassy"><div class="row"><span>Salute <span class="lv"></span></span><b>100</b></div><div class="bar"><s></s><i></i></div></div>
    <div id="cbAmmo" class="glassy"><div class="nm"></div><div class="rr"></div><div class="am"></div><div class="rl"><i></i></div><div class="sl"></div></div>
    <div id="cbBoss" class="glassy"><div class="t"><span></span><em></em></div><div class="bar"><i></i></div></div>`;
  document.body.appendChild(root);
  const ko = document.createElement('div'); ko.id = 'cbKO'; ko.innerHTML = '<div><b>K.O.!</b><small></small></div>'; document.body.appendChild(ko);
  const $ = s => root.querySelector(s);
  const E = { vig: $('#cbVig'), x: $('#cbX'), hit: $('#cbHit'), hp: $('#cbHp'), hpB: $('#cbHp b'), hpI: $('#cbHp .bar i'), hpS: $('#cbHp .bar s'), lv: $('#cbHp .lv'),
    am: $('#cbAmmo'), nm: $('#cbAmmo .nm'), rr: $('#cbAmmo .rr'), num: $('#cbAmmo .am'), rl: $('#cbAmmo .rl i'), sl: $('#cbAmmo .sl'),
    boss: $('#cbBoss'), bossN: $('#cbBoss .t span'), bossL: $('#cbBoss .t em'), bossI: $('#cbBoss .bar i') };
  // pools
  const nums = Array.from({ length: 24 }, () => { const d = document.createElement('div'); d.className = 'cbN'; root.appendChild(d); return { el: d, alive: false, pos: new THREE.Vector3(), t: 0, vx: 0 }; });
  const bars = Array.from({ length: 10 }, () => { const d = document.createElement('div'); d.className = 'cbB'; d.innerHTML = '<i></i><em></em>'; root.appendChild(d); return { el: d, i: d.firstChild, em: d.lastChild, on: false, lv: -1 }; });
  let ni = 0, hitT = 0, vig = 0, lowPulse = 0;
  const S = { hp: -1, max: -1, lv: '', ammo: '', slots: '', boss: null };

  function num(pos, amount, o = {}) {
    let it = nums.find(n => !n.alive); if (!it) { it = nums[ni]; ni = (ni + 1) % nums.length; }
    it.alive = true; it.t = 0; it.pos.copy(pos); it.vx = (Math.random() - 0.5) * 40;
    it.el.textContent = o.text || String(Math.max(1, Math.round(amount)));
    it.el.className = 'cbN' + (o.crit ? ' crit' : ''); it.el.style.color = o.color || '';
  }
  function hitMarker(kill) { hitT = kill ? 0.32 : 0.16; E.hit.className = kill ? 'kill' : ''; }
  function hurt(k) { vig = Math.min(1, vig + 0.35 + k * 0.6); }
  function setHP(hp, max, lvText) {
    hp = Math.max(0, Math.round(hp)); max = Math.round(max);
    if (hp !== S.hp || max !== S.max) {
      E.hpB.textContent = hp; const w = (100 * hp / Math.max(1, max)).toFixed(1) + '%'; E.hpI.style.width = w; E.hpS.style.width = w;
      E.hp.classList.toggle('low', hp / max < 0.3); S.hp = hp; S.max = max;
    }
    if (lvText !== S.lv) { E.lv.textContent = lvText || ''; S.lv = lvText; }
  }
  function setWeapon(item, base, ammo, mag, slots, cur, reloadK) {
    if (!item) { E.am.classList.remove('on'); return; }
    const key = item.id + '|' + ammo + '|' + mag;
    if (key !== S.ammo) {
      S.ammo = key; const R = RARITY[item.rarity] || RARITY.comune;
      E.nm.textContent = (base.icon ? base.icon + ' ' : '') + item.name; E.nm.style.color = R.color;
      E.rr.textContent = item.rarity + (item.level > 1 ? ' · liv. ' + item.level : '') + (item.perks && item.perks.length ? ' · ' + item.perks.map(perkName).join(', ') : '');
      E.num.innerHTML = base.kind === 'melee' ? '∞' : `${ammo}<small> / ${mag}</small>`;
    }
    const sk = slots.map(s => s ? s.base + s.rarity : '-').join(',') + cur;
    if (sk !== S.slots) {
      S.slots = sk;
      E.sl.innerHTML = slots.map((s, i) => `<span class="${i === cur ? 'cur' : ''}${s ? '' : ' empty'}" style="${s ? 'color:' + (RARITY[s.rarity] || RARITY.comune).color : ''}"><em>${i + 1}</em>${s ? ((BASES[s.base] && BASES[s.base].icon) || '•') : ''}</span>`).join('');
    }
    E.am.classList.add('on'); E.am.classList.toggle('reloading', reloadK > 0); if (reloadK > 0) E.rl.style.width = (reloadK * 100).toFixed(0) + '%';
  }
  function setBoss(b) {
    if (!b) { if (S.boss) { E.boss.classList.remove('on'); S.boss = null; } return; }
    if (S.boss !== b.name) { E.bossN.textContent = b.name; S.boss = b.name; E.boss.classList.add('on'); }
    E.bossL.textContent = 'liv. ' + b.level; E.bossI.style.width = (100 * Math.max(0, b.hp) / b.max).toFixed(1) + '%';
  }
  function showKO(on, sub) { ko.classList.toggle('on', !!on); if (sub) ko.querySelector('small').textContent = sub; }

  // per frame, after the camera is placed: projected elements
  const W = () => innerWidth, H = () => innerHeight;
  function frame(dt, o) {
    E.x.classList.toggle('on', !!o.crosshair);
    if (o.crosshair) { const g = 6 + o.spread * 420; E.x.children[1].style.left = (-g - 9) + 'px'; E.x.children[2].style.left = g + 'px'; E.x.children[3].style.top = (-g - 9) + 'px'; E.x.children[4].style.top = g + 'px'; }
    hitT = Math.max(0, hitT - dt); E.hit.style.opacity = hitT > 0 ? Math.min(1, hitT * 8) : 0;
    vig = Math.max(0, vig - dt * 0.9);
    lowPulse += dt * (o.lowHp ? 5 : 0);
    E.vig.style.opacity = Math.min(1, vig + (o.lowHp ? 0.25 + 0.15 * Math.sin(lowPulse) : 0)).toFixed(3);
    E.hp.classList.toggle('on', !!o.showHp);
    for (const n of nums) {
      if (!n.alive) continue; n.t += dt; if (n.t > 0.9) { n.alive = false; n.el.style.opacity = 0; continue; }
      _v.copy(n.pos); _v.y += n.t * 0.9; _v.project(camera);
      if (_v.z > 1) { n.el.style.opacity = 0; continue; }
      const x = (_v.x + 1) / 2 * W() + n.vx * n.t, y = (1 - _v.y) / 2 * H();
      const s = n.t < 0.12 ? 0.6 + n.t / 0.12 * 0.7 : 1.3 - Math.min(0.3, (n.t - 0.12) * 1.2);
      n.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(2)})`; n.el.style.opacity = n.t > 0.6 ? (1 - (n.t - 0.6) / 0.3).toFixed(2) : 1;
    }
    // enemy bars: o.bars = [{pos, k, level}]
    const list = o.bars || [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], e = list[i];
      if (!e) { if (b.on) { b.on = false; b.el.style.opacity = 0; } continue; }
      _v.copy(e.pos).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { if (b.on) { b.on = false; b.el.style.opacity = 0; } continue; }
      b.on = true; b.el.style.opacity = e.a.toFixed(2);
      b.el.style.transform = `translate(${((_v.x + 1) / 2 * W()).toFixed(1)}px,${((1 - _v.y) / 2 * H()).toFixed(1)}px)`;
      b.i.style.width = (e.k * 100).toFixed(0) + '%'; if (b.lv !== e.level) { b.lv = e.level; b.em.textContent = 'L' + e.level; }
    }
  }
  // touch buttons
  const tb = {};
  function touch(handlers) {
    const mk = (id, html, down, up) => {
      const b = document.createElement('button'); b.className = 'cbT'; b.id = id; b.innerHTML = html; document.body.appendChild(b); tb[id] = b;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) { } if (navigator.vibrate) try { navigator.vibrate(6); } catch (x) { } down && down(); });
      const end = e => { if (!b.classList.contains('on')) return; b.classList.remove('on'); up && up(); };
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('contextmenu', e => e.preventDefault());
    };
    mk('cbTFire', 'SPARA', handlers.fireDown, handlers.fireUp);
    mk('cbTAim', 'MIRA', handlers.aim);
    mk('cbTRel', '⟳', handlers.reload);
    mk('cbTSw', '🔫', handlers.sw);
    mk('cbTView', '👁', handlers.view);
  }
  function touchState(o) { if (tb.cbTAim) tb.cbTAim.classList.toggle('lock', !!o.aim); if (tb.cbTSw && o.icon !== tb.cbTSw._ic) { tb.cbTSw._ic = o.icon; tb.cbTSw.textContent = o.icon; } }
  return { num, hitMarker, hurt, setHP, setWeapon, setBoss, showKO, frame, touch, touchState, root };
}
