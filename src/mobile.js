// mobile.js — phones and tablets (coarse pointer). The desktop UI stays exactly as it is; on touch devices this adds
// what the round-3 touch cluster in ui.js (#touch: floating stick, AZIONE / ALTRO / ESCI, cabinet SPARA / BOMBA / START)
// was missing after the desktop-first rounds:
//  - AZIONE and ESCI in every interaction mode (dog play, reader, mural, NPC talk, minigames…), not only a few;
//  - a ✕ that closes any overlay (phone, minigame screens, newspaper, gratta e vinci, NPC dialogue) by sending Escape;
//  - Telefono and Emote buttons, a fullscreen button, two-finger pinch to zoom the camera;
//  - "Tocca per iniziare" on the opening, a rotate-to-landscape card, no page zoom / pull-to-refresh,
//    pixel ratio capped (phones would otherwise render at 3x).
// Quality: scene.js autoQualityLevel() already picks Bassa on coarse pointers when the setting is Auto.
import * as THREE from 'three';

const IS_TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const isTouch = () => IS_TOUCH;

// cap the drawing-buffer ratio before the renderer exists (phones report 2.6–3.5)
if (IS_TOUCH) {
  const sp = THREE.WebGLRenderer.prototype.setPixelRatio;
  THREE.WebGLRenderer.prototype.setPixelRatio = function (v) { return sp.call(this, Math.min(v || 1, 1.5)); };
}

const CSS = `
body.touchui{overscroll-behavior:none}
html:has(body.touchui){overscroll-behavior:none}
/* buttons in every interaction mode (the explore/goto/cabinet rules in index.html stay as they are) */
body.touchui[data-mode]:not([data-mode=""]):not([data-mode="cabinet"]):not([data-mode="explore"]):not([data-mode="goto"]) #tAct,
body.touchui[data-mode]:not([data-mode=""]):not([data-mode="explore"]):not([data-mode="goto"]) #tBack{display:block}
body.touchui[data-overlay] #touch .tb,body.touchui[data-overlay] #tzone,body.touchui[data-overlay] #stick{display:none!important}
body.touchui #tBack{min-width:64px;height:48px;font-size:14px}
/* extra row: phone + emote, under the corner HUD */
#mobBar{position:fixed;left:max(10px,env(safe-area-inset-left));top:max(96px,calc(env(safe-area-inset-top) + 90px));z-index:5;display:none;gap:10px}
body.touchui[data-mode="explore"] #mobBar,body.touchui[data-mode="goto"] #mobBar{display:flex}
body.touchui[data-overlay] #mobBar{display:none!important}
/* emote wheel: bigger sectors for fingers */
body.touchui #emoteWheel{touch-action:none}
#mobBar button{width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(20,8,46,.78);color:#fff;font-size:22px;line-height:1;display:grid;place-items:center;
  box-shadow:0 3px 0 rgba(0,0,0,.45);touch-action:none;-webkit-tap-highlight-color:transparent;position:relative}
#mobBar button.on{transform:translateY(2px) scale(.95);filter:brightness(1.3)}
#mobBar button em{position:absolute;right:-3px;top:-3px;min-width:18px;height:18px;border-radius:9px;background:#ff3d7f;font:700 11px/18px system-ui,sans-serif;font-style:normal;padding:0 4px}
/* close any overlay */
#mobX{position:fixed;left:max(10px,env(safe-area-inset-left));top:max(10px,env(safe-area-inset-top));z-index:2147483000;display:none;width:52px;height:52px;border-radius:50%;
  border:2px solid rgba(255,255,255,.7);background:rgba(10,4,24,.82);color:#fff;font:700 26px/1 system-ui,sans-serif;place-items:center;touch-action:none;box-shadow:0 4px 14px #0008}
body.touchui[data-overlay] #mobX,body.touchui.rdr-on #mobX{display:grid}
/* fullscreen button in the top bar */
body:not(.touchui) #fsBtn{display:none}
/* opening: tap wording */
body.touchui #opening .splash .press{font-size:0!important;letter-spacing:0}
body.touchui #opening .splash .press:after{content:"Tocca per iniziare";font:600 15px/1 var(--ui,system-ui);letter-spacing:.42em;text-transform:uppercase}
body.touchui #opening .skip{font-size:0!important}
body.touchui #opening .skip:after{content:"Tocca per saltare";font:500 12px/1 var(--ui,system-ui);letter-spacing:.18em}
/* rotate card */
#mobRotate{position:fixed;inset:0;z-index:2147483600;display:none;place-items:center;text-align:center;background:radial-gradient(90% 70% at 50% 40%,#2a0b3e,#07030d);color:#fff;
  font:700 18px/1.4 system-ui,-apple-system,sans-serif;padding:24px}
#mobRotate i{display:block;font-style:normal;font-size:64px;margin-bottom:14px;animation:mobRot 1.8s ease-in-out infinite}
#mobRotate small{display:block;margin-top:8px;font-weight:500;font-size:14px;opacity:.7}
@keyframes mobRot{0%,30%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
@media (orientation:portrait){body.touchui #mobRotate{display:grid}}
/* menus, phone, minigame overlays: bigger targets, scroll inside short landscape screens */
body.touchui .panel{max-height:calc(100dvh - 20px);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y}
body.touchui .mg-ov.on{overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y}
body.touchui .mg-ov .mg-x{font-size:15px;padding:10px 12px}
body.touchui .mbtn{min-height:52px}
body.touchui button,body.touchui [role="button"]{touch-action:manipulation}
body.touchui #phone{--h:min(96dvh,760px)}
body.touchui #npcDlg{width:min(760px,86vw);bottom:2vh}
/* phone notifications at the top centre (bottom-right is where the action buttons are); the badge is on 📱 */
body.touchui #phNotes{right:auto;left:50%;transform:translateX(-50%);bottom:auto;top:max(60px,calc(env(safe-area-inset-top) + 56px));align-items:center}
body.touchui #phPill{display:none!important}
`;

export function installMobile({ ui } = {}) {
  if (!IS_TOUCH) return null;
  document.body.classList.add('touchui');
  const vp = document.querySelector('meta[name=viewport]');
  if (vp) vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  const st = document.createElement('style'); st.id = 'mobileCss'; st.textContent = CSS; document.head.appendChild(st);
  // iOS: block double-tap zoom and the pinch on the page itself (the canvas pinch below drives the camera instead)
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });

  const buzz = () => { if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { } };
  // synthetic keys: the overlays, the phone and the emote wheel all listen to keydown/keyup
  const key = (type, code, keyName) => {
    const ev = new KeyboardEvent(type, { code, key: keyName || code, bubbles: true, cancelable: true });
    (document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body).dispatchEvent(ev);
  };
  const tapKey = (code, keyName) => { key('keydown', code, keyName); setTimeout(() => key('keyup', code, keyName), 60); };

  // ✕: closes whatever overlay is open
  const X = document.createElement('button'); X.id = 'mobX'; X.setAttribute('aria-label', 'Chiudi'); X.textContent = '✕';
  X.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); buzz();
    const ov = document.body.dataset.overlay;
    if (ov === 'phone' && window.__phone) { window.__phone.close(); return; }
    tapKey('Escape', 'Escape');
  });
  document.body.appendChild(X);
  // newspaper reader has no overlay flag: mirror its open state
  const syncRdr = () => { const r = document.getElementById('rdr'); document.body.classList.toggle('rdr-on', !!(r && r.classList.contains('on'))); };
  setInterval(syncRdr, 400);

  // phone + emote row
  const bar = document.createElement('div'); bar.id = 'mobBar';
  bar.innerHTML = '<button id="mobPhone" aria-label="Telefono">📱<em hidden></em></button><button id="mobEmote" aria-label="Emote">😎</button>';
  document.body.appendChild(bar);
  const press = (b, down, up) => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); buzz(); try { b.setPointerCapture(e.pointerId); } catch (x) { } down && down(); });
    const end = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); up && up(); };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
  };
  press(bar.querySelector('#mobPhone'), () => { if (window.__phone) window.__phone.toggle(); else tapKey('KeyP', 'p'); });
  // the emote wheel (interact/: opens on B keydown, picks on B keyup): on touch a tap opens it and stays open,
  // a tap on a sector picks the emote (wheel.js listens to mousedown, which touch taps emit), a 2nd tap on 😎 closes it
  const wheelOpen = () => { const w = document.getElementById('emoteWheel'); return !!(w && w.classList.contains('on')); };
  press(bar.querySelector('#mobEmote'), () => {
    if (wheelOpen()) { key('keydown', 'Escape', 'Escape'); return; }
    key('keydown', 'KeyB', 'b');
  });
  // tap outside the sectors closes the wheel (it covers the 😎 button)
  addEventListener('pointerdown', e => { if (wheelOpen() && !(e.target && e.target.closest && e.target.closest('#emoteWheel .it'))) { e.preventDefault(); key('keydown', 'Escape', 'Escape'); } }, true);
  // unread badge mirrors the phone pill
  setInterval(() => { const pill = document.getElementById('phPill'), em = bar.querySelector('em'); if (!pill || !em) return; const t = (pill.textContent || '').replace(/\D/g, ''); em.hidden = pill.hidden || !t; em.textContent = t; }, 700);

  // fullscreen (Android/iPad; iPhone Safari has no element fullscreen: the button stays hidden there)
  const de = document.documentElement;
  const canFs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !(matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches);
  const top = document.getElementById('topbar');
  if (canFs && top) {
    const fb = document.createElement('button'); fb.className = 'tbtn glass'; fb.id = 'fsBtn'; fb.setAttribute('aria-label', 'Schermo intero');
    fb.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    fb.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
        await (de.requestFullscreen || de.webkitRequestFullscreen).call(de, { navigationUI: 'hide' });
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { });
      } catch (e) { }
    });
    top.insertBefore(fb, top.firstChild);
  }

  // rotate card
  const rot = document.createElement('div'); rot.id = 'mobRotate';
  rot.innerHTML = '<div><i>📱</i>Gira il telefono in orizzontale<small>BIGALESSO si gioca in landscape</small></div>';
  document.body.appendChild(rot);

  // two-finger pinch on the 3D view = camera zoom (same channel as the mouse wheel)
  let pinch = null;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  addEventListener('touchstart', e => { if (e.touches.length === 2 && e.target && e.target.tagName === 'CANVAS') pinch = dist(e.touches); }, { passive: true });
  addEventListener('touchmove', e => {
    if (pinch === null || e.touches.length !== 2) return;
    const d = dist(e.touches), I = window.__app && window.__app.input;
    if (I && I.drag) I.drag.wheel += (pinch - d) * 4;
    pinch = d;
  }, { passive: true });
  addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { passive: true });

  // no pointer lock / edge-turn on touch: a refused lock would switch explore.js to edge-turn, and the compat
  // mousemove after a tap near a screen edge would then keep the camera spinning
  const patchInput = () => {
    const i = window.__app && window.__app.input;
    if (!i) return setTimeout(patchInput, 500);
    i.requestLock = () => { }; i.edgeMode = () => false; if (i.look) i.look.failed = false;
  };
  patchInput();

  // read-only joystick state for other modules (interact/vespa.js steers with it): x right +, y down +, -1..1
  const I = () => window.__app && window.__app.input;
  const api = {
    key: tapKey,
    get active() { const i = I(); return !!(i && i.touch && i.touch.active); },
    get stick() { const i = I(); return i && i.touch ? { x: i.touch.x || 0, y: i.touch.y || 0 } : { x: 0, y: 0 }; },
    isTouch: true,
  };
  window.__mobile = api;
  return api;
}
