// Newspaper reader overlay: two-page spreads with a CSS 3D page turn, zoom & pan.
// Self-contained (injects its own DOM + CSS). Desktop-first; single page on narrow/portrait screens.
//   const r = createReader({ issues: [{ id, label, title, sub, pages: [url…], asp }], sfx });  (or { pages, title, sub } for one issue)
//   r.open(page1based, issueId); r.close(); r.key(e) -> bool; r.setIssue(id)
//   r.onClose(cb), r.onView(cb([leftPage|null, rightPage|null], issueId)), r.isOpen, r.page, r.issue
const CSS = `
#rdr{position:fixed;inset:0;z-index:12;display:grid;grid-template-rows:auto 1fr auto;opacity:0;pointer-events:none;transition:opacity .45s;font:500 13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#efe9f8}
#rdr.on{opacity:1;pointer-events:auto}
#rdr.on.peek{opacity:0;pointer-events:none}
#rdr .bg{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 45%,rgba(14,8,22,.72),rgba(4,2,8,.93));-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px)}
#rdr .top{position:relative;display:flex;align-items:center;gap:18px;padding:16px 26px 8px;letter-spacing:.06em;text-shadow:0 1px 3px #000}
#rdr .top .t{font:600 13px/1 Georgia,"Times New Roman",serif;letter-spacing:.04em;color:#fff}
#rdr .top .t i{font-style:normal;color:#b9aecf;font-family:system-ui,sans-serif;font-size:12px;margin-left:10px}
#rdr .iss{display:flex;gap:4px;margin-left:14px;flex:none}
#rdr .iss button{background:none;border:0;border-bottom:1px solid transparent;color:#9d92b6;font:600 12px/1 system-ui,sans-serif;letter-spacing:.08em;padding:6px 6px 5px;cursor:pointer;white-space:nowrap}
#rdr .iss button:hover{color:#fff}
#rdr .iss button.on{color:#fff;border-bottom-color:#c8f03c}
#rdr .iss.one{display:none}
#rdr .top .n{margin-left:auto;color:#cfc6de;font-variant-numeric:tabular-nums;white-space:nowrap}
#rdr .x{color:#cfc6de;font:500 13px/1 system-ui,sans-serif;background:none;border:0;cursor:pointer;padding:6px 0 6px 10px;display:flex;align-items:center;gap:8px}
#rdr .x:hover{color:#fff}
#rdr kbd{display:inline-grid;place-items:center;min-width:22px;height:20px;padding:0 6px;border-radius:4px;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.35);color:#fff;font:600 11px/1 system-ui,sans-serif}
#rdr .stage{position:relative;overflow:hidden;cursor:zoom-in;touch-action:none}
#rdr.zoomed .stage{cursor:grab}#rdr.zoomed.drag .stage{cursor:grabbing}
#rdr .pan{position:absolute;left:50%;top:50%;transform-origin:0 0;will-change:transform}
#rdr .book{position:relative;perspective:2600px;transform-style:preserve-3d}
#rdr .pg{position:absolute;top:0;background:#f3eee2;box-shadow:0 26px 60px rgba(0,0,0,.55);overflow:hidden}
#rdr .pg img,#rdr .leaf img{display:block;width:100%;height:100%;object-fit:cover;-webkit-user-drag:none;user-select:none}
#rdr .pg.L::after,#rdr .pg.R::after{content:"";position:absolute;top:0;bottom:0;width:9%;pointer-events:none}
#rdr .pg.L::after{right:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.16))}
#rdr .pg.R::after{left:0;background:linear-gradient(270deg,transparent,rgba(0,0,0,.18))}
#rdr .pg.empty{background:none;box-shadow:none}#rdr .pg.empty img{display:none}#rdr .pg.empty::after{display:none}
#rdr .leaf{position:absolute;top:0;transform-style:preserve-3d;z-index:3;display:none}
#rdr .leaf.go{display:block}
#rdr .leaf .f,#rdr .leaf .b{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:#f3eee2;overflow:hidden}
#rdr .leaf .b{transform:rotateY(180deg)}
#rdr .leaf .f::after,#rdr .leaf .b::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;animation:rdrShade var(--dur) ease-in-out}
#rdr .leaf.fw .f::after{background:linear-gradient(270deg,rgba(0,0,0,.35),rgba(0,0,0,0) 60%)}
#rdr .leaf.fw .b::after{background:linear-gradient(90deg,rgba(0,0,0,.35),rgba(0,0,0,0) 60%)}
#rdr .leaf.bw .f::after{background:linear-gradient(90deg,rgba(0,0,0,.35),rgba(0,0,0,0) 60%)}
#rdr .leaf.bw .b::after{background:linear-gradient(270deg,rgba(0,0,0,.35),rgba(0,0,0,0) 60%)}
#rdr .leaf.empty-b .b{background:none}#rdr .leaf.empty-b .b img{display:none}
@keyframes rdrShade{0%{opacity:0}50%{opacity:1}100%{opacity:0}}
@keyframes rdrFw{from{transform:rotateY(0)}to{transform:rotateY(-180deg)}}
@keyframes rdrBw{from{transform:rotateY(0)}to{transform:rotateY(180deg)}}
#rdr .nav{position:absolute;top:50%;width:64px;height:120px;margin-top:-60px;border:0;background:none;color:#fff;cursor:pointer;opacity:.28;transition:opacity .2s;z-index:5;display:grid;place-items:center}
#rdr .nav:hover{opacity:1}#rdr .nav[disabled]{opacity:0;pointer-events:none}
#rdr .nav svg{width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 3px #000)}
#rdr .prev{left:10px}#rdr .next{right:10px}
#rdr .foot{position:relative;display:flex;justify-content:center;gap:22px;padding:6px 20px 14px;color:#b9aecf;font-size:12px;text-shadow:0 1px 3px #000}
#rdr .foot span{display:inline-flex;gap:6px;align-items:center}
#rdr .zl{position:absolute;right:26px;bottom:14px;color:#b9aecf;font-size:12px;font-variant-numeric:tabular-nums}
body:not(.desk) #rdr .nav{opacity:.8;width:52px}
body:not(.desk) #rdr .foot{display:none}
`;
const ICON = {
  l: '<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8"/></svg>', r: '<svg viewBox="0 0 24 24"><path d="M9 4l8 8-8 8"/></svg>',
};

export function createReader({ issues = null, pages = null, title = 'Il Corriere delle Due Torri', sub = 'N. 313 · domenica 22 novembre 2026', sfx = () => { } }) {
  if (!issues) issues = [{ id: '313', label: 'N. 313', title, sub, pages }];
  for (const is of issues) { is.title = is.title || title; is.asp = is.asp || 842 / 595; is.label = is.label || 'N. ' + is.id; }
  let cur = 0, N = issues[0].pages.length; pages = issues[0].pages;
  const lsKey = i => 'bigalesso_news_page' + (i === 0 && issues[0].id === '313' ? '' : '_' + issues[i].id);
  if (!document.getElementById('rdr-css')) { const s = document.createElement('style'); s.id = 'rdr-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.id = 'rdr'; root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<div class="bg"></div>
<div class="top"><span class="t"><span class="tt"></span><i></i></span><span class="iss${issues.length < 2 ? ' one' : ''}">${issues.map((is, i) => `<button data-i="${i}" title="Tab per cambiare numero">${is.label}</button>`).join('')}</span><span class="n"></span><button class="x" aria-label="Chiudi"><kbd>Esc</kbd> chiudi</button></div>
<div class="stage"><div class="pan"><div class="book">
  <div class="pg L"><img alt=""></div><div class="pg R"><img alt=""></div>
  <div class="leaf"><div class="f"><img alt=""></div><div class="b"><img alt=""></div></div>
</div></div>
<button class="nav prev" aria-label="Pagina precedente">${ICON.l}</button><button class="nav next" aria-label="Pagina successiva">${ICON.r}</button></div>
<div class="foot"><span><kbd>←</kbd><kbd>→</kbd> sfoglia</span><span>rotella o clic · ingrandisci</span><span>trascina · sposta</span><span><kbd>V</kbd> guarda la scena</span>${issues.length > 1 ? '<span><kbd>Tab</kbd> cambia numero</span>' : ''}<span><kbd>E</kbd> / <kbd>Esc</kbd> chiudi</span></div>
<div class="zl"></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const el = { stage: $('.stage'), pan: $('.pan'), book: $('.book'), L: $('.pg.L'), R: $('.pg.R'), Li: $('.pg.L img'), Ri: $('.pg.R img'), leaf: $('.leaf'), lf: $('.leaf .f img'), lb: $('.leaf .b img'), n: $('.top .n'), zl: $('.zl'), prev: $('.prev'), next: $('.next') };
  const imgs = {}; // preload (per issue)
  function preload(i = cur) { if (imgs[i]) return; imgs[i] = issues[i].pages.map(u => { const im = new Image(); im.decoding = 'async'; im.src = u; return im; }); }
  const head = () => { root.querySelector('.tt').textContent = issues[cur].title; root.querySelector('.t i').textContent = issues[cur].sub || ''; root.querySelectorAll('.iss button').forEach((b, i) => b.classList.toggle('on', i === cur)); };

  let isOpen = false, spread = true, view = 0, busy = false, z = 1, px = 0, py = 0, pw = 0, ph = 0;
  const cbs = { close: [], view: [], issue: [] };
  // views: spread mode -> [null,1],[2,3],…,[12,null]; single -> [p]
  const nViews = () => spread ? Math.floor(N / 2) + 1 : N;
  const viewPages = v => spread ? [v === 0 ? null : 2 * v, 2 * v + 1 <= N ? 2 * v + 1 : null] : [v + 1];
  const pageToView = p => spread ? Math.floor(p / 2) : p - 1;
  const firstPage = v => { const vp = viewPages(v); return vp[0] || vp[1]; };

  function layout() {
    spread = issues[cur].pages.length > 1 && innerWidth >= 860 && innerWidth / innerHeight > 1.05;
    const sw = el.stage.clientWidth || innerWidth, sh = el.stage.clientHeight || innerHeight - 90;
    const asp = issues[cur].asp; // page h / w
    const cols = spread ? 2 : 1;
    pw = Math.floor(Math.min((sw - (spread ? 150 : 70)) / cols, (sh - 16) / asp)); ph = Math.floor(pw * asp);
    el.book.style.width = pw * cols + 'px'; el.book.style.height = ph + 'px';
    el.L.style.cssText = `left:0;width:${pw}px;height:${ph}px;${spread ? '' : 'display:none'}`;
    el.R.style.cssText = `left:${spread ? pw : 0}px;width:${pw}px;height:${ph}px`;
    applyPan();
  }
  function setImg(img, wrap, p) {
    if (!p) { wrap && wrap.classList.add('empty'); img.removeAttribute('src'); return; }
    wrap && wrap.classList.remove('empty'); img.src = pages[p - 1]; img.alt = 'Pagina ' + p;
  }
  function render() {
    const [a, b] = viewPages(view);
    if (spread) { setImg(el.Li, el.L, a); setImg(el.Ri, el.R, b); }
    else setImg(el.Ri, el.R, a);
    const ps = viewPages(view).filter(Boolean);
    el.n.textContent = (ps.length > 1 ? `Pagine ${ps[0]}–${ps[1]}` : `Pagina ${ps[0]}`) + ` / ${N}`;
    el.prev.disabled = view <= 0; el.next.disabled = view >= nViews() - 1;
    try { localStorage.setItem(lsKey(cur), String(firstPage(view))); } catch (e) { }
    for (const c of cbs.view) c(spread ? viewPages(view) : [null, a], issues[cur].id);
  }
  function applyPan() {
    const bw = el.book.offsetWidth || pw * 2, bh = ph;
    if (z <= 1.001) { z = 1; px = 0; py = 0; root.classList.remove('zoomed'); } else root.classList.add('zoomed');
    // keep the book on screen
    const sw = el.stage.clientWidth, sh = el.stage.clientHeight;
    const mx = Math.max(0, (bw * z - sw) / 2 + 40), my = Math.max(0, (bh * z - sh) / 2 + 40);
    px = Math.max(-mx, Math.min(mx, px)); py = Math.max(-my, Math.min(my, py));
    el.pan.style.transform = `translate(${px - bw * z / 2}px,${py - bh * z / 2}px) scale(${z})`;
    el.zl.textContent = z > 1.01 ? Math.round(z * 100) + '%' : '';
  }
  function zoomAt(nz, cx, cy) {
    nz = Math.max(1, Math.min(3.2, nz));
    const r = el.stage.getBoundingClientRect(); const ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
    // keep the point under the cursor fixed
    px = ox - (ox - px) * nz / z; py = oy - (oy - py) * nz / z; z = nz; applyPan();
  }
  function turn(dir) {
    if (busy) return;
    const nv = view + dir; if (nv < 0 || nv >= nViews()) return;
    if (z > 1) { z = 1; applyPan(); }
    sfx('paper');
    const dur = spread ? 620 : 420;
    root.style.setProperty('--dur', dur + 'ms');
    const leaf = el.leaf; leaf.className = 'leaf';
    const [a, b] = viewPages(view), [c, d] = viewPages(nv);
    busy = true;
    if (spread) {
      if (dir > 0) { // right page flips to the left
        leaf.style.cssText = `left:${pw}px;width:${pw}px;height:${ph}px;transform-origin:0 50%;animation:rdrFw ${dur}ms cubic-bezier(.45,.05,.3,1) forwards`;
        el.lf.src = b ? pages[b - 1] : ''; setImg(el.lb, null, c); if (!c) leaf.classList.add('empty-b');
        setImg(el.Ri, el.R, d); leaf.classList.add('go', 'fw');
      } else {
        leaf.style.cssText = `left:0;width:${pw}px;height:${ph}px;transform-origin:100% 50%;animation:rdrBw ${dur}ms cubic-bezier(.45,.05,.3,1) forwards`;
        el.lf.src = a ? pages[a - 1] : ''; setImg(el.lb, null, d); if (!d) leaf.classList.add('empty-b');
        setImg(el.Li, el.L, c); leaf.classList.add('go', 'bw');
      }
    } else {
      const from = a, to = c;
      leaf.style.cssText = `left:0;width:${pw}px;height:${ph}px;transform-origin:${dir > 0 ? '0' : '100%'} 50%;animation:${dir > 0 ? 'rdrFw' : 'rdrBw'} ${dur}ms ease-in forwards`;
      el.lf.src = pages[from - 1]; el.lb.removeAttribute('src'); leaf.classList.add('go', 'empty-b', dir > 0 ? 'fw' : 'bw');
      setImg(el.Ri, el.R, to);
    }
    setTimeout(() => { leaf.className = 'leaf'; leaf.style.animation = 'none'; view = nv; render(); busy = false; }, dur + 20);
  }
  function savedPage(i) { let p = 1; try { p = +localStorage.getItem(lsKey(i)) || 1; } catch (e) { } return Math.max(1, Math.min(issues[i].pages.length, p | 0)); }
  function setIssue(id, page) {
    const i = typeof id === 'number' ? id : Math.max(0, issues.findIndex(x => x.id === String(id)));
    if (busy) return;
    if (i !== cur) { cur = i; pages = issues[i].pages; N = pages.length; sfx('paper'); }
    preload(i); head();
    if (isOpen) { z = 1; layout(); view = Math.min(pageToView(page || savedPage(i)), nViews() - 1); render(); for (const c of cbs.issue) c(issues[cur].id); }
  }
  root.querySelectorAll('.iss button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); setIssue(+b.dataset.i); }));
  // ---- input ----
  el.prev.addEventListener('click', e => { e.stopPropagation(); turn(-1); });
  el.next.addEventListener('click', e => { e.stopPropagation(); turn(1); });
  $('.x').addEventListener('click', () => close());
  el.stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(z * Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY); }, { passive: false });
  const ptrs = new Map(); let down = null, pinch = null;
  el.stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.nav')) return;
    el.stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, px, py, t: performance.now(), moved: 0 };
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), z, cx: (p.x + q.x) / 2, cy: (p.y + q.y) / 2 }; down = null; }
  });
  el.stage.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { const [p, q] = [...ptrs.values()]; const d = Math.hypot(p.x - q.x, p.y - q.y); zoomAt(pinch.z * d / pinch.d, pinch.cx, pinch.cy); return; }
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down.moved = Math.max(down.moved, Math.hypot(dx, dy));
    if (z > 1) { root.classList.add('drag'); px = down.px + dx; py = down.py + dy; applyPan(); }
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); root.classList.remove('drag');
    if (ptrs.size < 2) pinch = null;
    if (!down) return;
    const dx = e.clientX - down.x, dt = performance.now() - down.t;
    if (z <= 1 && Math.abs(dx) > 60 && dt < 700) turn(dx < 0 ? 1 : -1); // swipe
    else if (down.moved < 6 && dt < 400) { // click: zoom toggle
      if (z > 1) { z = 1; applyPan(); } else zoomAt(2.2, e.clientX, e.clientY);
    }
    down = null;
  };
  el.stage.addEventListener('pointerup', up); el.stage.addEventListener('pointercancel', up);
  addEventListener('resize', () => { if (isOpen) { const p = firstPage(view); layout(); view = Math.min(pageToView(p), nViews() - 1); render(); } });

  function key(e) {
    if (!isOpen) return false;
    const c = e.code;
    if (c === 'ArrowRight' || c === 'KeyD' || c === 'PageDown' || c === 'Space') { e.preventDefault(); if (!e.repeat) turn(1); }
    else if (c === 'ArrowLeft' || c === 'KeyA' || c === 'PageUp') { e.preventDefault(); if (!e.repeat) turn(-1); }
    else if (c === 'Home') turn(-view); else if (c === 'End') { if (view < nViews() - 1) turn(nViews() - 1 - view); }
    else if (c === 'Equal' || c === 'NumpadAdd') { const r = el.stage.getBoundingClientRect(); zoomAt(z * 1.3, r.left + r.width / 2, r.top + r.height / 2); }
    else if (c === 'Minus' || c === 'NumpadSubtract') { const r = el.stage.getBoundingClientRect(); zoomAt(z / 1.3, r.left + r.width / 2, r.top + r.height / 2); }
    else if (c === 'KeyV') { root.classList.toggle('peek'); }
    else if ((c === 'Tab' || c === 'KeyI') && issues.length > 1) { e.preventDefault(); if (!e.repeat) setIssue((cur + 1) % issues.length); }
    else if (c === 'Escape' || c === 'KeyE' || c === 'KeyQ') { e.preventDefault(); if (root.classList.contains('peek')) root.classList.remove('peek'); else close(); }
    return true;
  }
  function open(page, issueId) {
    if (issueId != null) { const i = issues.findIndex(x => x.id === String(issueId)); if (i >= 0 && i !== cur) { cur = i; pages = issues[i].pages; N = pages.length; } }
    preload(); head();
    let p = page || savedPage(cur);
    p = Math.max(1, Math.min(N, p | 0));
    isOpen = true; root.classList.remove('peek'); root.classList.add('on'); root.setAttribute('aria-hidden', 'false');
    z = 1; layout(); view = pageToView(p); render(); for (const c of cbs.issue) c(issues[cur].id);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; root.classList.remove('on'); root.setAttribute('aria-hidden', 'true');
    for (const c of cbs.close) c();
  }
  return {
    open, close, key, preload, turn, setIssue,
    get issue() { return issues[cur].id; }, onIssue(cb) { cbs.issue.push(cb); },
    get isOpen() { return isOpen; },
    get page() { return firstPage(view); },
    onClose(cb) { cbs.close.push(cb); }, onView(cb) { cbs.view.push(cb); },
    root,
  };
}
