// interact/wheel.js — GTA-style radial emote wheel (desktop): hold B (or the middle mouse button), move the mouse
// towards an emote, release to do it. 1-8 pick directly. Pure DOM; selection driven by the game's mouse deltas
// (pointer lock) or by hovering when the cursor is free.
const CSS = `
#emoteWheel{position:fixed;inset:0;z-index:40;display:grid;place-items:center;pointer-events:none;opacity:0;transition:opacity .12s}
#emoteWheel.on{opacity:1;pointer-events:auto}
#emoteWheel .ring{position:relative;width:min(440px,62vmin);height:min(440px,62vmin);border-radius:50%;
  background:radial-gradient(circle at 50% 50%,rgba(10,8,20,.0) 0 27%,rgba(10,8,20,.78) 27.5% 100%);box-shadow:0 0 0 2px rgba(255,255,255,.12),0 20px 60px rgba(0,0,0,.6)}
#emoteWheel .it{position:absolute;left:50%;top:50%;width:104px;margin:-46px 0 0 -52px;text-align:center;color:#ddd;font:600 13px/1.15 var(--ui,system-ui);
  letter-spacing:.04em;text-transform:uppercase;transition:transform .1s,color .1s;cursor:pointer}
#emoteWheel .it i{display:block;font-style:normal;font-size:34px;line-height:1.25;filter:drop-shadow(0 3px 4px #000)}
#emoteWheel .it kbd{display:inline-block;margin-top:3px;font:600 10px var(--ui,system-ui);color:#999;border:1px solid #555;border-radius:4px;padding:0 4px}
#emoteWheel .it.sel{color:#ffd25a;transform:scale(1.16)}
#emoteWheel .mid{position:absolute;left:50%;top:50%;width:46%;height:46%;margin:-23% 0 0 -23%;border-radius:50%;display:grid;place-items:center;text-align:center;
  color:#fff;font:400 28px/1 var(--gta,Impact,sans-serif);text-transform:uppercase;letter-spacing:.02em}
#emoteWheel .mid small{display:block;margin-top:8px;font:500 11px var(--ui,system-ui);letter-spacing:.16em;color:#aaa}
#emoteWheel .arc{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:conic-gradient(from var(--a,0deg),rgba(255,210,90,.28) 0 45deg,transparent 45deg 360deg);
  -webkit-mask:radial-gradient(circle,transparent 0 27.5%,#000 28%);mask:radial-gradient(circle,transparent 0 27.5%,#000 28%);opacity:0;transition:opacity .1s}
#emoteWheel .arc.on{opacity:1}`;

export function createWheel(items) {
  if (!document.getElementById('emoteWheelCss')) { const st = document.createElement('style'); st.id = 'emoteWheelCss'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.id = 'emoteWheel'; root.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('div'); ring.className = 'ring'; root.appendChild(ring);
  const arc = document.createElement('div'); arc.className = 'arc'; ring.appendChild(arc);
  const mid = document.createElement('div'); mid.className = 'mid'; ring.appendChild(mid);
  const N = items.length, R = 38; // % of the ring
  const els = items.map((it, i) => {
    const a = -Math.PI / 2 + i * (2 * Math.PI / N); // first item at the top, clockwise
    const e = document.createElement('div'); e.className = 'it';
    e.style.transform = '';
    e.style.left = (50 + Math.cos(a) * R) + '%'; e.style.top = (50 + Math.sin(a) * R) + '%';
    e.innerHTML = `<i>${it.icon}</i><span></span><br><kbd>${i + 1}</kbd>`; e.querySelector('span').textContent = it.label;
    e.addEventListener('mouseenter', () => select(i));
    e.addEventListener('mousedown', ev => { ev.preventDefault(); select(i); api.onPick && api.onPick(i); });
    ring.appendChild(e); return e;
  });
  document.body.appendChild(root);
  let sel = -1, vx = 0, vy = 0, open = false;
  function select(i) {
    if (i === sel) return; sel = i;
    els.forEach((e, k) => e.classList.toggle('sel', k === i));
    if (i < 0) { mid.innerHTML = 'Emote<small>muovi il mouse · rilascia B</small>'; arc.classList.remove('on'); return; }
    mid.innerHTML = ''; mid.textContent = items[i].label; const s = document.createElement('small'); s.textContent = items[i].hint || 'rilascia B'; mid.appendChild(s);
    arc.style.setProperty('--a', (i * 360 / N - 22.5) + 'deg'); arc.classList.add('on');
  }
  const api = {
    onPick: null,
    get open() { return open; },
    get selected() { return sel; },
    show() { if (open) return; open = true; vx = vy = 0; select(-1); root.classList.add('on'); root.setAttribute('aria-hidden', 'false'); },
    hide() { if (!open) return; open = false; root.classList.remove('on'); root.setAttribute('aria-hidden', 'true'); },
    // mouse deltas (pointer lock): a virtual stick, the direction picks the sector
    move(dx, dy) {
      if (!open || (!dx && !dy)) return;
      vx = vx * 0.9 + dx; vy = vy * 0.9 + dy;
      const L = Math.hypot(vx, vy); if (L > 160) { vx *= 160 / L; vy *= 160 / L; }
      if (L < 22) return;
      let a = Math.atan2(vy, vx) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
      select(Math.round(a / (2 * Math.PI / N)) % N);
    },
    select,
  };
  return api;
}
