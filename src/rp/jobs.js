// rp/jobs.js — the four jobs. One shift at a time; each shift = N tasks, pay per task (Euro via window.__rpg.money),
// job XP → ranks (Stagista … Titolare, pay ×1.15 per rank), tips, fails with consequences (3 fails = sent home).
//   Rider       pick up at Sushi / Celtic / Piadineria, deliver to a friend's door (timer + food condition → tip)
//   Barista     behind the Celtic counter (mode rp_bar): hold to pour, tilt the glass, serve; Guinness = two-step pour
//   Buttafuori  at the Millennium door (mode rp_door): tonight's rules vs the guest's card, in / out / take the bribe
//   Vigile      find the badly parked car, pick the right infraction (mode rp_fine), then handle the owner
import * as THREE from 'three';
import { JOBS, RANKS, rankOf, payMul, CAST, PICKUPS, DROPS, RIDER_LINES, BEERS, SIZES, BAR_LINES, RULES, VIP, OUTFITS, SHOES, DRUNK, DOOR_NOTES, DOOR_LINES, BAD_SPOTS, INFRACTIONS, PLATES, FINE_LINES } from './data.js';
import { persona } from '../ai.js';
import { esc } from './ui.js';
import { MIL_DZ } from '../quartiere/layout.js'; // the Millennium's distance from the end of Via Petroni

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI, FAR = V(1e5, 0, 1e5);
const rnd = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const nm = id => (persona(id) || {}).name || id;
const emo = id => (persona(id) || {}).emoji || '🙂';
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const kb = (k, label) => `<kbd>${k}</kbd>${label}`;

// spots
const BAR = { stand: V(3, 0, 42.95), yaw: PI, stools: [V(1.7, 0, 41.25), V(3.0, 0, 41.25), V(4.3, 0, 41.25)], door: V(3, 0, 33.2), cam: { pos: V(5.4, 1.95, 43.05), look: V(2.6, 1.05, 41.9) }, item: V(3, 0, 41.45), glass: V(3, 1.12, 42.3) };
// the Millennium is MIL_DZ m north of the end of Via Petroni (quartiere/layout.js): door, queue and camera move with it
const MZ = MIL_DZ;
const DOOR = { stand: V(44, 0, 76.35 + MZ), yaw: PI, slots: [V(44.55, 0, 75.0 + MZ), V(44.55, 0, 74.05 + MZ), V(44.55, 0, 73.1 + MZ), V(44.55, 0, 72.15 + MZ)], from: V(44.6, 0, 64), inside: V(44, 0, 84.2 + MZ), away: V(44, 0, 56), cam: { pos: V(43.0, 2.15, 77.6 + MZ), look: V(44.5, 1.25, 74.2 + MZ) }, item: V(44, 0, 75.9 + MZ) };

export function createJobs(X) {
  const { scene, camera, man, R, st } = X;
  let J = null;           // current shift
  let W = null, H = null; // explore world + helpers (plugin)
  const tmp = V(), tmp2 = V(), _proj = V(), _look = V(), _cp = V(), _cl = V(), _cP = V(), _cL = V();

  // ---------------------------------------------------------------- helpers
  const anchor = k => { const a = X.level && X.level.anchors && X.level.anchors[k]; return a ? V(a.x, 0, a.z) : null; };
  const pos = () => man.root.position;
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const job = () => J && JOBS[J.id];
  const jst = id => st.jobs[id];
  const rank = id => rankOf(jst(id).xp);
  function pay(base, why) {
    const e = Math.max(0, Math.round(base * payMul(rank(J.id))));
    if (e > 0) { X.money(e); J.earned += e; }
    return e;
  }
  function tip(n) { n = Math.max(0, Math.round(n)); if (n > 0) { X.money(n); J.tips += n; st.stats.tips += n; } return n; }
  function xp(n) {
    const j = jst(J.id), before = rank(J.id);
    j.xp = Math.max(0, j.xp + n); J.xp += n;
    const after = rank(J.id);
    if (after > before) {
      X.toast(`${JOBS[J.id].icon} Promosso: ${RANKS[after].name} (${JOBS[J.id].name}) · paga +${Math.round((payMul(after) - 1) * 100)}%`, 'gold'); X.sfx('power');
      if (after === RANKS.length - 1) { X.unlock('rp_' + J.id); if (!st.titles.includes(JOBS[J.id].title)) st.titles.push(JOBS[J.id].title); }
    }
    X.save();
  }
  function fail(why, { euro = 0, fedina = null } = {}) {
    J.fails++; J.errors++;
    if (euro > 0) { X.charge(euro); J.fined += euro; }
    if (fedina) X.fedina(fedina, euro);
    xp(-5);
    X.toast(`❌ ${why}${euro ? ' · −' + euro + '€' : ''}`, 'warn'); X.sfx('buzz');
    if (J.fails >= 3) { setTimeout(() => end('fired'), 900); return true; }
    return false;
  }
  function ok(msg, e, t) { J.done++; X.toast(`✅ ${msg} · +${e}€${t ? ' (+' + t + '€ mancia)' : ''}`, 'gold'); X.sfx('coin'); }
  function setTarget(p, label) { if (J) J.target = p ? { p: p.clone(), label } : null; }
  function teleport(p, yaw) {
    man.root.position.set(p.x, 0, p.z);
    if (W) { W.yaw = yaw; if (W.vel) W.vel.set(0, 0, 0); W.camYaw = yaw + PI; }
  }
  function fade(cb) { X.fade(cb); }

  // friends as customers / guests / owners (npcs.js bodies, scripted with a custom state like sport/)
  const held = new Map(); // id -> { n, target, arrived, onArrive }
  function grab(id, at, walkTo, onArrive) {
    const api = X.npcs; if (!api) return null;
    let n = api.get(id);
    if (!n) n = api.spawn(id, { at });
    if (!n) return null;
    if (n.root.position.distanceTo(at) > 14) n.root.position.copy(at);
    n.chatCD = 1e9; n.greeted = true; n.leaving = false; n.yawGoal = null;
    if (walkTo) { n.state = 'walk'; n.target = walkTo.clone(); n.arrive = true; }
    else { n.state = 'rp'; n.target = null; }
    const h = { n, target: walkTo ? walkTo.clone() : null, arrived: !walkTo, onArrive, t: 0 };
    held.set(id, h); return h;
  }
  function release(id, to, { despawn = true, say = null } = {}) {
    const h = held.get(id); held.delete(id); if (!h) return;
    const n = h.n; if (!n || !n.root) return;
    if (say) n.say(say, 4);
    if (to) { n.state = 'walk'; n.target = to.clone(); n.leaving = despawn; n.chatCD = 20; }
    else { n.state = 'idle'; n.wait = 3; n.leaving = false; n.chatCD = 15; }
  }
  function releaseAll(to) { for (const id of [...held.keys()]) release(id, to); }
  function updateHeld(dt) {
    for (const [id, h] of held) {
      const n = h.n;
      if (!n || !n.root || !X.npcs.get(id)) { held.delete(id); continue; }
      h.t += dt;
      if (!h.arrived && h.target) {
        const d = dist2(n.root.position, h.target);
        if (d < 0.35 || (n.state === 'idle' && d < 1.2) || h.t > 25) { if (d > 0.35) n.root.position.set(h.target.x, 0, h.target.z); h.arrived = true; n.state = 'rp'; n.target = null; n.leaving = true; if (h.onArrive) h.onArrive(n); }
        else if (n.state !== 'walk') { n.state = 'walk'; n.target = h.target.clone(); } // npcs.js gave up (stuck): keep walking, teleport after 25 s
      } else { n.state = 'rp'; n.target = null; n.leaving = true; n.speed = 0; }
      if (h.face != null && h.arrived) n.yawGoal = h.face; // npcs.js turns them (state != walk)
    }
  }
  const pickCast = (n, exclude = []) => shuffle(CAST.filter(id => !exclude.includes(id) && !held.has(id))).slice(0, n);

  // ---------------------------------------------------------------- shift lifecycle
  function start(id) {
    if (J) { X.toast(`Sei già di turno come ${JOBS[J.id].name}: finiscilo dal telefono (Lavori)`, 'warn'); return false; }
    const d = JOBS[id]; if (!d) return false;
    if (!W) { X.toast('Prima entra nel gioco'); return false; }
    J = { id, t: 0, done: 0, fails: 0, errors: 0, earned: 0, tips: 0, fined: 0, xp: 0, task: null, target: null, phase: 'start' };
    X.wear(d.gear);
    X.toast(`${d.icon} Turno da ${d.name} iniziato · ${d.tasks} ${id === 'barista' ? 'clienti' : id === 'buttafuori' ? 'persone alla porta' : id === 'vigile' ? 'multe' : 'consegne'}`, 'gold');
    X.sfx('whistle');
    X.event('rp_shift_start', { job: id });
    if (id === 'rider') riderNext();
    if (id === 'barista') { J.phase = 'goto'; setTarget(BAR.item, 'Bancone del Celtic'); X.toast('Vai al bancone del Celtic e premi E'); }
    if (id === 'buttafuori') { J.phase = 'goto'; setTarget(DOOR.item, 'Porta del Millennium'); X.toast('Vai alla porta del Millennium (in fondo a Via Petroni) e premi E'); }
    if (id === 'vigile') vigileNext();
    return true;
  }
  function end(reason = 'done') {
    if (!J) return;
    const d = JOBS[J.id], s = J; J = null;
    R.panel(null); X.wear(null); setTarget(null); releaseAll(null);
    if (X.car) X.car.visible = false;
    if (W && /^rp_(bar|door|fine)$/.test(W.mode)) H.setMode('explore');
    const j = st.jobs[s.id];
    if (s.done > 0) { j.shifts++; j.earned += s.earned + s.tips; j.best = Math.max(j.best, s.earned + s.tips); X.unlock('rp_first'); if (reason === 'done' && s.errors === 0) X.unlock('rp_perfect'); }
    if (JOB_LIST.every(k => st.jobs[k].shifts > 0)) X.unlock('rp_all');
    if (window.__rpg && window.__rpg.addXP && s.done > 0) try { window.__rpg.addXP(10 * s.done, 'turno da ' + d.name); } catch (e) { }
    X.save(true);
    const r = rank(s.id), nx = RANKS[r + 1];
    X.event('rp_shift_end', { job: s.id, euro: s.earned + s.tips, reason });
    R.summary({
      title: reason === 'fired' ? 'Mandato a casa' : 'Fine turno', color: d.color,
      sub: `${d.icon} ${d.name} · ${RANKS[r].name}`,
      rows: [['Fatti', String(s.done)], ['Paga', s.earned + '€'], ['Mance', s.tips + '€'], ...(s.fined ? [['Multe e danni', '−' + s.fined + '€']] : []), ['Errori', String(s.errors)], ['Esperienza', (s.xp >= 0 ? '+' : '') + s.xp + (nx ? ` · ${nx.name} a ${nx.xp}` : '')]],
      note: reason === 'fired' ? 'Tre casini e il titolare ti ha detto di tornare domani.' : reason === 'quit' ? 'Hai staccato prima. Paga solo per quello che hai fatto.' : '',
    });
  }
  const JOB_LIST = Object.keys(JOBS);

  // ---------------------------------------------------------------- RIDER
  function riderNext() {
    if (J.done >= JOBS.rider.tasks) { end('done'); return; }
    const p = rnd(PICKUPS), d = rnd(DROPS.filter(x => anchor(x.anchor)));
    const pa = anchor(p.anchor), da = anchor(d.anchor);
    J.task = { kind: 'rider', p, d, pa, da, phase: 'pickup', food: rnd(p.food), cond: 100, time: 0, limit: 0 };
    J.phase = 'pickup';
    setTarget(pa, 'Ritira da ' + p.name);
    if (J.done === 0) X.toast((window.__vehicles || window.__vespa) ? 'Con la Vespa si fa prima: prendila e vai' : 'Corri, la roba si raffredda', '');
  }
  function riderUpdate(dt) {
    const T = J.task; if (!T) return;
    const p = pos();
    if (T.phase === 'pickup') {
      if (dist2(p, T.pa) < 2.2) {
        T.phase = 'deliver'; const L = dist2(T.pa, T.da);
        T.limit = Math.round(22 + L / 2.4); T.time = 0;
        setTarget(T.da, 'Consegna: ' + T.d.where);
        X.toast(`${T.p.icon} Ritirato ${T.food} per ${nm(T.d.who)} · ${T.d.where} · ${T.limit}s`, 'gold'); X.sfx('pickup');
      }
    } else if (T.phase === 'deliver') {
      T.time += dt; T.cond = Math.max(0, T.cond - dt * (T.time > T.limit ? 1.6 : 0.35));
      if (dist2(p, T.da) < 2.3) {
        T.phase = 'done';
        const fast = T.time < T.limit * 0.65, late = T.time > T.limit;
        const base = 5 + dist2(T.pa, T.da) * 0.08;
        const e = pay(base);
        const t = late ? 0 : tip((T.cond / 100) * (fast ? 6 : 3) * (0.6 + Math.random() * 0.8));
        // the friend comes to the door
        const at = T.da.clone(), face = Math.atan2(p.x - at.x, p.z - at.z);
        const h = grab(T.d.who, at.clone().add(V(0.4, 0, 0.3)), null); if (h) { h.face = face; h.n.man && h.n.man.gesture && h.n.man.gesture('wave'); }
        const line = T.cond < 45 ? rnd(RIDER_LINES.broken) : late ? rnd(RIDER_LINES.late) : fast ? rnd(RIDER_LINES.fast) : rnd(RIDER_LINES.ok);
        if (h) h.n.say(line, 4.5);
        setTimeout(() => release(T.d.who, null), 5000);
        st.stats.deliveries++;
        if (late && T.cond < 30) { fail(`${nm(T.d.who)} ha lasciato una recensione da una stella`); }
        else { ok(`Consegnato a ${nm(T.d.who)}${late ? ' (in ritardo)' : ''}`, e, t); xp(late ? 4 : fast ? 16 : 10); }
        J.task = null; setTarget(null);
        setTimeout(() => { if (J && J.id === 'rider') riderNext(); }, 1800);
      }
    }
  }
  function onDamage(n) { if (J && J.id === 'rider' && J.task && J.task.phase === 'deliver') { J.task.cond = Math.max(0, J.task.cond - Math.min(25, 6 + n * 0.4)); } }

  // ---------------------------------------------------------------- BARISTA
  function barEnter() {
    if (!J || J.id !== 'barista') return;
    fade(() => {
      teleport(BAR.stand, BAR.yaw); H.setMode('rp_bar'); J.phase = 'bar'; setTarget(null);
      J.bar = { queue: [], served: 0, cur: null, glass: null, tilt: 0.2, pouring: false, spawnT: 0.5, holdBtn: false, msgT: 0, msg: '' };
      newGlass();
      barPanel();
    });
  }
  function newOrder() {
    const used = J.bar.queue.map(c => c.id);
    const id = pickCast(1, used)[0]; if (!id) return;
    const free = BAR.stools.findIndex(s => !J.bar.queue.some(c => c.stool === s)); if (free < 0) return;
    const r = rank('barista'), beer = rnd(r >= 2 ? BEERS : BEERS.filter(b => !b.settle || Math.random() < 0.35)), size = rnd(SIZES);
    const c = { id, stool: BAR.stools[free], beer, size, patience: 34 - r * 2, max: 34 - r * 2, ready: false };
    const h = grab(id, BAR.door, c.stool, () => { c.ready = true; const n = held.get(id) && held.get(id).n; if (n) n.say(fill(rnd(BAR_LINES.order), { b: `una ${size.name} ${beer.name}` }), 4); });
    if (!h) return;
    h.face = 0; // facing the counter (+z)
    J.bar.queue.push(c);
  }
  function newGlass() { J.bar.glass = { beer: 0, foam: 0, spill: 0, settled: 1, phase2: false }; }
  function barPanel() {
    const B = J.bar, c = B.cur;
    const html = `<h4>🍺 Barista al Celtic</h4>
      <div class="pour"><div><div class="glass" id="rpGlass"><div class="beer"></div><div class="foam"></div><div class="line"></div><div class="stream"></div></div></div>
      <div><div class="sub" id="rpOrder"></div><div class="meter"><i id="rpPat"></i></div><div class="cust" id="rpCust"></div>
      <div class="keys"><button class="go" id="rpPourB">${R.COARSE ? '' : kb('Spazio', '')}Tieni per spinare</button><button id="rpTiltL">${R.COARSE ? '' : kb('A', '')}Inclina</button><button id="rpTiltR">${R.COARSE ? '' : kb('D', '')}Raddrizza</button><button id="rpServe">${R.COARSE ? '' : kb('Invio', '')}Servi</button><button id="rpTrash">${R.COARSE ? '' : kb('X', '')}Butta</button><button id="rpQuit">${R.COARSE ? '' : kb('Esc', '')}Stacca</button></div>
      <div class="sub" id="rpMsg" style="margin-top:6px;min-height:18px"></div></div></div>`;
    const el = R.panel(html, JOBS.barista.color);
    const pb = el.querySelector('#rpPourB');
    const down = e => { e.preventDefault(); B.holdBtn = true; }, up = () => { B.holdBtn = false; };
    pb.addEventListener('pointerdown', down); pb.addEventListener('pointerup', up); pb.addEventListener('pointerleave', up); pb.addEventListener('pointercancel', up);
    el.querySelector('#rpTiltL').onclick = () => { B.tilt = clamp(B.tilt + 0.25, 0, 1); };
    el.querySelector('#rpTiltR').onclick = () => { B.tilt = clamp(B.tilt - 0.25, 0, 1); };
    el.querySelector('#rpServe').onclick = () => barServe();
    el.querySelector('#rpTrash').onclick = () => { newGlass(); barMsg('Bicchiere buttato. Ricomincia'); };
    el.querySelector('#rpQuit').onclick = () => end('quit');
    B.el = { glass: el.querySelector('#rpGlass'), beer: el.querySelector('#rpGlass .beer'), foam: el.querySelector('#rpGlass .foam'), line: el.querySelector('#rpGlass .line'), stream: el.querySelector('#rpGlass .stream'), order: el.querySelector('#rpOrder'), pat: el.querySelector('#rpPat'), cust: el.querySelector('#rpCust'), msg: el.querySelector('#rpMsg') };
  }
  function barMsg(m) { const B = J.bar; B.msg = m; B.msgT = 3; if (B.el) B.el.msg.textContent = m; }
  function barUpdate(dt, I) {
    const B = J.bar; if (!B || !B.el) return;
    // customers arrive
    B.spawnT -= dt;
    if (B.spawnT <= 0 && B.queue.length < 3 && B.served + B.queue.length < JOBS.barista.tasks + J.fails) { newOrder(); B.spawnT = 6 + Math.random() * 5; }
    for (let i = B.queue.length - 1; i >= 0; i--) if (!held.has(B.queue[i].id)) { if (B.cur === B.queue[i]) { B.cur = null; newGlass(); } B.queue.splice(i, 1); } // npcs.js took a friend away
    if (!B.cur || !B.queue.includes(B.cur)) B.cur = B.queue.find(c => c.ready) || null;
    for (const c of B.queue) if (c.ready) {
      c.patience -= dt * (c === B.cur ? 1 : 0.6);
      if (c.patience <= 0) { const n = held.get(c.id); release(c.id, BAR.door, { say: rnd(BAR_LINES.angry) }); B.queue.splice(B.queue.indexOf(c), 1); if (B.cur === c) { B.cur = null; newGlass(); } if (fail(`${nm(c.id)} se n'è andato senza birra`)) return; break; }
    }
    // pour physics: level and foam in fractions of the glass height
    const g = B.glass, c = B.cur;
    const tiltIn = (I.k('KeyA') || I.k('ArrowLeft') ? 1 : 0) - (I.k('KeyD') || I.k('ArrowRight') ? 1 : 0);
    B.tilt = clamp(B.tilt + tiltIn * dt * 1.6 - (I.drag.wheel || 0) * 0.002, 0, 1);
    B.pouring = !!(c && (I.k('Space') || I.k('KeyE') || I.mouseHeld || B.holdBtn));
    if (B.pouring) {
      const total = g.beer + g.foam, rate = 0.26;
      const foamK = clamp(0.62 - B.tilt * 0.55 + (total > 0.7 ? 0.18 * (1 - B.tilt) : 0), 0.05, 0.75); // upright = foam; tilted = clean beer; straighten at the end for the head
      g.beer += rate * dt * (1 - foamK); g.foam += rate * dt * foamK * 1.35;
      if (c && c.beer.settle) g.settled = Math.max(0, g.settled - dt * 0.9);
      if (g.beer + g.foam > 1.0) { g.spill += (g.beer + g.foam - 1.0); const ex = g.beer + g.foam - 1.0; g.foam = Math.max(0, g.foam - ex); }
      if (Math.random() < dt * 6) X.sfx('spray', 0.25);
    } else {
      const k = Math.min(g.foam, dt * 0.035); g.foam -= k; g.beer += k * 0.45; // the head settles into beer slowly
      g.settled = Math.min(1, g.settled + dt * 0.22);
    }
    if (I.pressed('Enter') || I.pressed('NumpadEnter')) barServe();
    if (I.pressed('KeyX')) { newGlass(); barMsg('Bicchiere buttato. Ricomincia'); }
    // render
    const E = B.el, beerC = c ? c.beer.color : '#f2c14e';
    E.glass.style.setProperty('--beer', beerC);
    E.glass.style.transform = `rotate(${(-B.tilt * 38).toFixed(1)}deg)`;
    E.beer.style.height = (clamp(g.beer, 0, 1) * 100).toFixed(1) + '%';
    E.foam.style.bottom = (clamp(g.beer, 0, 1) * 100).toFixed(1) + '%'; E.foam.style.height = (clamp(g.foam, 0, 1 - g.beer) * 100).toFixed(1) + '%';
    E.foam.style.opacity = c && c.beer.settle ? (0.55 + 0.45 * g.settled).toFixed(2) : '1';
    E.stream.style.opacity = B.pouring ? '0.9' : '0';
    if (c) { E.line.style.display = ''; E.line.style.bottom = (c.size.k * 100).toFixed(1) + '%'; } else E.line.style.display = 'none';
    E.order.innerHTML = c ? `<b>${emo(c.id)} ${esc(nm(c.id))}</b>: una <b>${c.size.name} ${c.beer.name}</b>${c.beer.settle ? ' · <i>due tempi: riempi ¾, aspetta che si posi, poi rabbocca</i>' : ''}` : '<i>Aspetti i clienti…</i>';
    E.pat.style.width = c ? (clamp(c.patience / c.max, 0, 1) * 100).toFixed(0) + '%' : '0%';
    E.pat.style.background = c && c.patience / c.max < 0.3 ? '#ff6b6b' : '#ffd166';
    const ck = B.queue.map(q => q.id + (q === c ? '*' : '') + (q.ready ? '' : '…')).join(',');
    if (ck !== B.ck) { B.ck = ck; E.cust.innerHTML = B.queue.map(q => `<span class="${q === c ? 'cur' : ''}">${emo(q.id)} ${esc(nm(q.id))}${q.ready ? '' : ' (arriva)'}</span>`).join(''); }
    if (B.msgT > 0) { B.msgT -= dt; if (B.msgT <= 0) E.msg.textContent = ''; }
    if (B.served >= JOBS.barista.tasks) { end('done'); }
  }
  function barServe() {
    const B = J && J.bar; if (!B) return; const c = B.cur, g = B.glass;
    if (!c) { barMsg('Nessuno da servire'); return; }
    if (g.beer + g.foam < 0.15) { barMsg('Il bicchiere è vuoto, genio'); return; }
    const total = g.beer + g.foam, err = Math.abs(total - c.size.k), [f0, f1] = c.beer.foam;
    const foamErr = g.foam < f0 ? (f0 - g.foam) : g.foam > f1 ? (g.foam - f1) : 0;
    let score = 100 - err * 260 - foamErr * 320 - g.spill * 120;
    if (c.beer.settle && g.settled < 0.6) score -= 25; // Guinness served before it settled
    score = clamp(score, 0, 100);
    const n = held.get(c.id) && held.get(c.id).n;
    const line = g.spill > 0.05 ? rnd(BAR_LINES.spill) : g.foam > f1 + 0.05 ? rnd(BAR_LINES.foam) : total < c.size.k - 0.08 ? rnd(BAR_LINES.low) : score > 80 ? rnd(BAR_LINES.great) : rnd(BAR_LINES.ok);
    if (n) n.say(line, 4);
    B.queue.splice(B.queue.indexOf(c), 1); B.cur = null;
    st.stats.pints++;
    if (score < 35) { if (g.spill > 0.05) fail('Hai allagato il bancone', { euro: 3 }); else fail(`Birra rimandata indietro da ${nm(c.id)}`); }
    else {
      B.served++;
      const e = pay(3), t = tip((score / 100) * 3.5 * clamp(c.patience / c.max + 0.3, 0.3, 1.2));
      ok(`${c.size.name} ${c.beer.name} per ${nm(c.id)} · ${Math.round(score)}/100`, e, t); xp(score > 85 ? 14 : 9);
      if (c.beer.settle && score > 85) X.unlock('rp_guinness');
    }
    release(c.id, BAR.door, { despawn: true });
    newGlass();
  }

  // ---------------------------------------------------------------- BUTTAFUORI
  function doorEnter() {
    if (!J || J.id !== 'buttafuori') return;
    fade(() => {
      teleport(DOOR.stand, DOOR.yaw); H.setMode('rp_door'); J.phase = 'door'; setTarget(null);
      const rules = shuffle(RULES.slice()).filter((r, i, a) => !(r.id === 'sobri' && a.some(x => x.id === 'nomarci'))).slice(0, 3);
      J.door = { rules, vip: Math.random() < 0.5, queue: [], seen: 0, rejected: new Set(), cur: null, t: 0, spawnT: 0.2 };
      doorPanel();
      X.toast('Regole di stasera: ' + rules.map(r => r.text).join(' · ') + (J.door.vip ? ' · ' + VIP.text : ''), 'gold');
    });
  }
  function makeGuest(id) {
    const D = J.door;
    return {
      id, outfit: rnd(OUTFITS), shoes: rnd(SHOES), list: Math.random() < 0.55, drunk: Math.random() < 0.18 ? 2 : Math.random() < 0.45 ? 1 : 0,
      note: rnd(DOOR_NOTES), banned: D.rejected.has(id), bribe: Math.random() < 0.22 ? rnd([10, 20, 30]) : 0, wait: 14 - rank('buttafuori'), ready: false,
    };
  }
  function shouldEnter(g) { const D = J.door; if (D.vip && VIP.good(g)) return true; return !D.rules.some(r => r.bad(g)); }
  function doorSpawn() {
    const D = J.door; if (D.seen + D.queue.length >= JOBS.buttafuori.tasks) return;
    const slot = DOOR.slots[D.queue.length]; if (!slot) return;
    // after a while some rejected friends try again (and the "non rientra" rule bites)
    const again = [...D.rejected].filter(id => !held.has(id));
    const id = again.length && Math.random() < 0.3 ? rnd(again) : pickCast(1)[0]; if (!id) return;
    const g = makeGuest(id); g.slot = slot;
    const h = grab(id, DOOR.from, slot, () => { g.ready = true; }); if (!h) return;
    h.face = 0; D.queue.push(g);
  }
  function doorRelayout() { const D = J.door; D.queue.forEach((g, i) => { g.slot = DOOR.slots[i]; const h = held.get(g.id); if (h) { h.target = g.slot.clone(); h.arrived = false; h.t = 0; h.n.state = 'walk'; h.n.target = g.slot.clone(); } }); }
  function doorPanel() {
    const el = R.panel(`<h4>🕶️ Porta del Millennium</h4><div class="sub" id="rpDoorWho"></div><div class="card" id="rpCard"></div><div class="rules" id="rpRules"></div>
      <div class="meter"><i id="rpDoorT"></i></div>
      <div class="keys"><button class="go" id="rpIn">${R.COARSE ? '' : kb('E', '')}Entra</button><button class="no" id="rpOut">${R.COARSE ? '' : kb('R', '')}Fuori</button><button id="rpBribe" hidden>${R.COARSE ? '' : kb('B', '')}Prendi i soldi e fallo entrare</button><button id="rpQuitD">${R.COARSE ? '' : kb('Esc', '')}Stacca</button></div>`, JOBS.buttafuori.color);
    el.querySelector('#rpIn').onclick = () => doorDecide('in'); el.querySelector('#rpOut').onclick = () => doorDecide('out');
    el.querySelector('#rpBribe').onclick = () => doorDecide('bribe'); el.querySelector('#rpQuitD').onclick = () => end('quit');
    J.door.el = { who: el.querySelector('#rpDoorWho'), card: el.querySelector('#rpCard'), rules: el.querySelector('#rpRules'), t: el.querySelector('#rpDoorT'), bribe: el.querySelector('#rpBribe') };
    const D = J.door;
    D.el.rules.innerHTML = 'Regole: ' + D.rules.map(r => `<span>${esc(r.text)}</span>`).join('') + (D.vip ? `<span style="background:rgba(80,200,120,.2);border-color:rgba(80,200,120,.6)">${esc(VIP.text)}</span>` : '');
  }
  function doorUpdate(dt, I) {
    const D = J.door; if (!D || !D.el) return;
    D.spawnT -= dt;
    if (D.spawnT <= 0 && D.queue.length < 3) { doorSpawn(); D.spawnT = 2.5 + Math.random() * 2; }
    if (D.queue.some(q => !held.has(q.id))) { D.queue = D.queue.filter(q => held.has(q.id)); doorRelayout(); } // npcs.js took a friend away
    const g = D.queue[0];
    if (g !== D.cur) {
      D.cur = g || null; D.key = '';
      if (g) { const h = held.get(g.id); if (h && g.bribe) setTimeout(() => { if (D.cur === g && h.n) h.n.say(fill(rnd(DOOR_LINES.bribe), { e: g.bribe }), 4); }, 1200); }
    }
    if (g && g.ready) {
      g.wait -= dt;
      const key = g.id + g.ready;
      if (key !== D.key) {
        D.key = key;
        D.el.who.innerHTML = `<b>${emo(g.id)} ${esc(nm(g.id))}</b>${g.bribe ? ` · <b style="color:#7cff6b">ti offre ${g.bribe}€</b>` : ''}`;
        D.el.card.innerHTML = `<div>Vestito: <b>${esc(g.outfit)}</b></div><div>Scarpe: <b>${esc(g.shoes)}</b></div><div>In lista: <b>${g.list ? 'sì' : 'no'}</b></div><div>Stato: <b>${esc(DRUNK[g.drunk])}</b></div><div style="grid-column:1/-1">${esc(g.note)}${g.banned ? ' · <b style="color:#ff6b6b">già buttato fuori stasera</b>' : ''}</div>`;
        D.el.bribe.hidden = !g.bribe;
      }
      D.el.t.style.width = (clamp(g.wait / (14 - rank('buttafuori')), 0, 1) * 100).toFixed(0) + '%';
      if (I.pressed('KeyE') || I.pressed('Enter')) doorDecide('in');
      else if (I.pressed('KeyR')) doorDecide('out');
      else if (I.pressed('KeyB') && g.bribe) doorDecide('bribe');
      else if (g.wait <= 0) { D.queue.shift(); D.seen++; D.rejected.add(g.id); release(g.id, DOOR.away, { say: 'Ma quanto ci metti? Vado al Kinki' }); doorRelayout(); fail(`${nm(g.id)} si è stufato di aspettare`); }
    } else { D.el.who.innerHTML = '<i>Arriva qualcuno…</i>'; D.el.card.innerHTML = ''; D.el.bribe.hidden = true; D.el.t.style.width = '0%'; D.key = ''; }
    if (D.seen >= JOBS.buttafuori.tasks) end('done');
  }
  function doorDecide(what) {
    const D = J && J.door; if (!D) return; const g = D.queue[0]; if (!g || !g.ready) return;
    D.queue.shift(); D.seen++; st.stats.doors++;
    const good = shouldEnter(g), letIn = what !== 'out';
    if (letIn) release(g.id, DOOR.inside, { despawn: false, say: rnd(DOOR_LINES.in) });
    else { D.rejected.add(g.id); release(g.id, DOOR.away, { say: rnd(DOOR_LINES.out) }); }
    doorRelayout();
    if (what === 'bribe') { X.money(g.bribe); J.tips += g.bribe; }
    if (letIn === good) {
      const e = pay(4); ok(letIn ? `${nm(g.id)} dentro, giusto così` : `${nm(g.id)} fuori, giusto così`, e, 0); xp(12);
      if (what === 'bribe') X.toast(`💸 E ti sei messo in tasca ${g.bribe}€. Nessuno ha visto`, '');
    } else if (letIn) {
      const why = D.rules.filter(r => r.bad(g)).map(r => r.text.toLowerCase()).join(', ');
      if (g.drunk === 2 && Math.random() < 0.6) fail(`${nm(g.id)} ha iniziato una rissa dentro (${why})`, { euro: 25, fedina: 'Rissa al Millennium (dici che non era colpa tua)' });
      else if (what === 'bribe' && Math.random() < 0.5) fail(`Il titolare ti ha visto prendere ${g.bribe}€`, { euro: g.bribe * 2, fedina: 'Corruzione alla porta del Millennium' });
      else fail(`Non doveva entrare: ${why}`, { euro: 8 });
    } else {
      fail(g.list ? `${nm(g.id)} era in lista! Il titolare è nero` : `${nm(g.id)} poteva entrare, cliente perso`, { euro: 5 });
    }
  }

  // ---------------------------------------------------------------- VIGILE
  function vigileNext() {
    if (J.done >= JOBS.vigile.tasks) { end('done'); return; }
    const used = J.vSpots || (J.vSpots = []);
    const opts = BAD_SPOTS.filter((s, i) => !used.includes(i)); const s = rnd(opts.length ? opts : BAD_SPOTS); used.push(BAD_SPOTS.indexOf(s));
    const owner = pickCast(1)[0] || 'forla';
    J.task = { kind: 'vigile', s, owner, plate: PLATES(), phase: 'find', p: V(s.x, 0, s.z) };
    J.phase = 'find';
    if (X.car) { X.car.position.set(s.x, 0, s.z); X.car.rotation.y = s.ry; X.car.visible = true; }
    setTarget(J.task.p, 'Auto parcheggiata ' + s.where);
    X.toast(`👮 Segnalazione: auto parcheggiata ${s.where}`, 'gold');
  }
  function fineEnter() {
    const T = J && J.task; if (!T || T.kind !== 'vigile' || T.phase !== 'find') return;
    T.phase = 'infr'; H.setMode('rp_fine'); setTarget(null);
    const right = T.s.infr, wrong = shuffle(Object.keys(INFRACTIONS).filter(k => k !== right)).slice(0, 2);
    T.choices = shuffle([right, ...wrong]);
    const el = R.panel(`<h4>👮 Verbale · ${esc(T.plate)}</h4><div class="sub">Auto parcheggiata ${esc(T.s.where)}. Che infrazione scrivi?</div>
      <div class="keys">${T.choices.map((k, i) => `<button data-i="${i}">${R.COARSE ? '' : kb(i + 1, '')}${esc(INFRACTIONS[k].name)} · ${INFRACTIONS[k].euro}€</button>`).join('')}<button id="rpQuitV">${R.COARSE ? '' : kb('Esc', '')}Lascia stare</button></div>`, JOBS.vigile.color);
    el.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => finePick(+b.dataset.i));
    el.querySelector('#rpQuitV').onclick = () => { R.panel(null); H.setMode('explore'); T.phase = 'find'; setTarget(T.p, 'Auto parcheggiata ' + T.s.where); };
  }
  function finePick(i) {
    const T = J && J.task; if (!T || T.phase !== 'infr') return;
    const k = T.choices[i]; if (!k) return;
    if (k !== T.s.infr) {
      R.panel(`<h4>👮 Ricorso vinto</h4><div class="sub">Hai scritto «${esc(INFRACTIONS[k].name)}» ma era «${esc(INFRACTIONS[T.s.infr].name)}». Il giudice di pace annulla tutto.</div>`, JOBS.vigile.color);
      setTimeout(() => { if (!J) return; R.panel(null); H.setMode('explore'); finishCar(); const f = fail('Multa annullata per errore nel verbale'); if (!f) setTimeout(() => J && vigileNext(), 1200); }, 2200);
      return;
    }
    T.phase = 'owner'; T.infr = INFRACTIONS[k];
    // the owner runs up, swearing
    const p = pos(), from = V(p.x + 7, 0, p.z + 2), car = T.p;
    const h = grab(T.owner, from, V(car.x + 1.2, 0, car.z + 1.2), n => { n.say(rnd(FINE_LINES.excuse), 5); });
    if (h) h.face = Math.atan2(p.x - car.x, p.z - car.z);
    const e = T.infr.euro;
    R.panel(`<h4>👮 Arriva ${emo(T.owner)} ${esc(nm(T.owner))}</h4><div class="sub">«${esc(rnd(FINE_LINES.excuse))}» · ${esc(T.infr.name)}, ${e}€</div>
      <div class="keys"><button data-o="full">${R.COARSE ? '' : kb(1, '')}Multa piena (${e}€)</button><button data-o="half">${R.COARSE ? '' : kb(2, '')}Ti faccio lo sconto (${Math.round(e / 2)}€)</button><button data-o="bribe">${R.COARSE ? '' : kb(3, '')}Chiudo un occhio per 20€</button></div>`, JOBS.vigile.color)
      .querySelectorAll('button[data-o]').forEach(b => b.onclick = () => fineOutcome(b.dataset.o));
  }
  function fineOutcome(o) {
    const T = J && J.task; if (!T || T.phase !== 'owner') return; T.phase = 'done';
    const h = held.get(T.owner), say = s => h && h.n && h.n.say(s, 4.5);
    st.stats.fines++;
    if (o === 'full') { say(rnd(FINE_LINES.angry)); const e = pay(T.infr.euro * 0.3); ok(`Multa da ${T.infr.euro}€ a ${nm(T.owner)}`, e, 0); xp(15); }
    else if (o === 'half') { say(rnd(FINE_LINES.sconto)); const e = pay(T.infr.euro * 0.15); ok(`Mezza multa a ${nm(T.owner)}`, e, 0); xp(8); }
    else {
      say(rnd(FINE_LINES.happy)); X.money(20); J.tips += 20;
      if (Math.random() < 0.35) fail('Ti ha visto il comandante', { euro: 60, fedina: 'Corruzione di pubblico ufficiale (20€ per chiudere un occhio)' });
      else { J.done++; X.toast('💸 Venti euro in tasca. Facciamo finta di niente', ''); X.sfx('coin'); }
    }
    R.panel(null); H.setMode('explore');
    setTimeout(() => { release(T.owner, null); finishCar(); if (J && J.id === 'vigile') vigileNext(); }, 3200);
  }
  function finishCar() { if (X.car) X.car.visible = false; if (J) J.task = null; }

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    updateHeld(dt);
    if (!J) { R.setHud(null); R.waypoint(null); X.marker.visible = false; return; }
    J.t += dt;
    if (J.id === 'rider') riderUpdate(dt);
    // marker + waypoint
    const tg = J.target;
    if (tg && W && /^(explore|goto|vespa|drive|vehicle)/.test(W.mode)) {
      const m = X.marker; m.visible = true; m.position.set(tg.p.x, 0, tg.p.z);
      const a = m.userData.arrow; a.position.y = 2.4 + Math.sin(J.t * 3) * 0.15; a.rotation.y += dt * 2;
      m.userData.mat.color.set(JOBS[J.id].color);
      const p = pos(), d = dist2(p, tg.p);
      if (d < 2.2) R.waypoint(null);
      else {
        _proj.set(tg.p.x, 1.8, tg.p.z).project(camera);
        const w = innerWidth, hh = innerHeight, mg = 44;
        let x = (_proj.x * 0.5 + 0.5) * w, y = (-_proj.y * 0.5 + 0.5) * hh;
        const behind = _proj.z > 1, off = behind || x < mg || x > w - mg || y < mg || y > hh - mg;
        if (off) {
          let dx = x - w / 2, dy = y - hh / 2; if (behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1 && Math.abs(dx) < 1) dy = 1; }
          const k = Math.min((w / 2 - mg) / Math.max(1e-3, Math.abs(dx)), (hh / 2 - mg) / Math.max(1e-3, Math.abs(dy)));
          R.waypoint(w / 2 + dx * k, hh / 2 + dy * k, d, true, Math.atan2(dy, dx) + PI / 2, JOBS[J.id].color);
        } else R.waypoint(x, y, d, false, 0, JOBS[J.id].color);
      }
    } else { X.marker.visible = false; R.waypoint(null); }
    // HUD
    const d = JOBS[J.id], r = rank(J.id), T = J.task;
    let t = '', desc = '', row = '', p = null;
    if (J.id === 'rider') {
      if (T && T.phase === 'pickup') { t = 'Ritira da ' + T.p.name; desc = `${T.p.icon} ${T.food} per ${nm(T.d.who)}`; }
      else if (T && T.phase === 'deliver') { t = 'Consegna'; desc = T.d.where; const left = T.limit - T.time; row = `<span class="${left < 0 ? 'warn' : ''}">⏱ ${left < 0 ? '+' + fmtT(-left) : fmtT(left)}</span><span>🍱 <b>${Math.round(T.cond)}%</b></span>`; p = clamp(1 - T.time / T.limit, 0, 1); }
      else { t = 'Prossimo ordine…'; }
    } else if (J.id === 'barista') { t = J.phase === 'goto' ? 'Vai al bancone' : 'Al bancone'; desc = J.phase === 'goto' ? 'Celtic, premi E al bancone' : `Serviti ${J.bar ? J.bar.served : 0}/${d.tasks}`; }
    else if (J.id === 'buttafuori') { t = J.phase === 'goto' ? 'Vai alla porta' : 'Alla porta'; desc = J.phase === 'goto' ? 'Millennium, in fondo a Via Petroni' : `Gestiti ${J.door ? J.door.seen : 0}/${d.tasks}`; }
    else if (J.id === 'vigile') { t = T ? (T.phase === 'find' ? 'Trova l\'auto' : 'Verbale') : 'Prossima segnalazione…'; desc = T ? 'Parcheggiata ' + T.s.where : ''; }
    row = (row ? row : '') + `<span>💶 <b>${J.earned + J.tips}€</b></span><span>✔ ${J.done}/${d.tasks}</span>${J.fails ? `<span class="warn">✖ ${J.fails}/3</span>` : ''}`;
    R.setHud({ k: `${d.icon} ${d.name} · ${RANKS[r].name}`, t, d: desc, row, p, color: d.color });
  }

  // ---------------------------------------------------------------- explore plugin parts
  const items = [
    { id: 'rp_bar', range: 1.6,
      label: () => 'Mettiti dietro al bancone (turno da barista)',
      anchor: () => (J && J.id === 'barista' && J.phase === 'goto') ? BAR.item : FAR, top: () => V(3, 1.4, 42.1),
      act: () => barEnter() },
    { id: 'rp_door', range: 1.8,
      label: () => 'Prendi posto alla porta (turno da buttafuori)',
      anchor: () => (J && J.id === 'buttafuori' && J.phase === 'goto') ? DOOR.item : FAR, top: () => V(44, 1.6, 76.6 + MZ),
      act: () => doorEnter() },
    { id: 'rp_car', range: 2.8,
      label: () => 'Fai la multa',
      anchor: () => (J && J.task && J.task.kind === 'vigile' && J.task.phase === 'find') ? J.task.p : FAR, top: () => J && J.task && J.task.p ? V(J.task.p.x, 1.6, J.task.p.z) : FAR,
      act: () => fineEnter() },
  ];
  const owns = m => m === 'rp_bar' || m === 'rp_door' || m === 'rp_fine';
  function modeUpdate(mode, dt, I, keys) {
    if (!J) { H.setMode('explore'); return {}; }
    if (mode === 'rp_bar') { if (keys.backP) { end('quit'); return {}; } barUpdate(dt, I); return { lookW: 0.6, lookAt: BAR.glass }; }
    if (mode === 'rp_door') { if (keys.backP) { end('quit'); return {}; } doorUpdate(dt, I); const g = J && J.door && J.door.queue[0]; const h = g && held.get(g.id); if (!h) return {}; if (h.n.head) h.n.head(_look); else _look.copy(h.n.root.position).setY(1.6); return { lookW: 0.9, lookAt: _look }; }
    if (mode === 'rp_fine') {
      const T = J.task; if (!T) { H.setMode('explore'); return {}; }
      if (T.phase === 'infr') { for (let i = 0; i < 3; i++) if (I.pressed('Digit' + (i + 1)) || I.pressed('Numpad' + (i + 1))) finePick(i); if (keys.backP) { R.panel(null); H.setMode('explore'); T.phase = 'find'; setTarget(T.p, 'Auto parcheggiata ' + T.s.where); } }
      else if (T.phase === 'owner') { const o = ['full', 'half', 'bribe']; for (let i = 0; i < 3; i++) if (I.pressed('Digit' + (i + 1)) || I.pressed('Numpad' + (i + 1))) fineOutcome(o[i]); }
      return { lookW: 0.8, lookAt: _look.set(T.p.x, 0.9, T.p.z) };
    }
    return {};
  }
  let camK = 0;
  function cameraPose(pose, dt) {
    if (!W || !owns(W.mode) || !J) { camK = 0; return null; }
    camK = Math.min(1, camK + dt * 1.6); const k = camK * camK * (3 - 2 * camK);
    let P = null, L = null, fov = 45;
    if (W.mode === 'rp_bar') { P = BAR.cam.pos; L = BAR.cam.look; fov = 46; }
    else if (W.mode === 'rp_door') { P = DOOR.cam.pos; L = DOOR.cam.look; fov = 48; }
    else if (W.mode === 'rp_fine' && J.task) {
      const c = J.task.p, p = pos(); tmp.set(p.x - c.x, 0, p.z - c.z); const len = tmp.length() || 1; tmp.multiplyScalar(1 / len);
      tmp2.set(tmp.z, 0, -tmp.x);
      P = _cP.set(p.x + tmp.x * 1.6 + tmp2.x * 1.2, 1.9, p.z + tmp.z * 1.6 + tmp2.z * 1.2); L = _cL.set(c.x, 0.8, c.z); fov = 50;
    }
    if (!P) return null;
    return { pos: _cp.copy(pose.pos).lerp(P, k), look: _cl.copy(pose.look).lerp(L, k), fov: (pose.fov || 50) + (fov - (pose.fov || 50)) * k };
  }

  return {
    get J() { return J; }, start, end, update, items, owns, modeUpdate, cameraPose, onDamage,
    attach(w, h) { W = w; H = h; },
    rank, held,
  };
}
