// rp/social.js — roleplay online: chat commands and job titles over the other players' heads.
//   /me <azione>   → "* Nome azione"        /do <descrizione> → "(( descrizione ))"
//   /dado [facce]  → "🎲 Nome tira un d6: 4" (rolled locally, shown to everybody)
//   /paga <nome> <euro> → not available until the server keeps the money (it would be trust-based)
// window.__net.setExtra('rp', { j: job id, r: rank name, t: title, n: nickname }) → others show it under the name tag.
import * as THREE from 'three';
import { JOBS } from './data.js';

function tagSprite(text, color) {
  const c = document.createElement('canvas'), g = c.getContext('2d'); const font = '600 34px system-ui, sans-serif';
  g.font = font; const w = Math.min(1024, Math.ceil(g.measureText(text).width) + 40); c.width = w; c.height = 56;
  g.font = font; g.fillStyle = 'rgba(10,8,18,.72)'; const r = 18; g.beginPath(); g.roundRect ? g.roundRect(0, 4, w, 48, r) : g.rect(0, 4, w, 48); g.fill();
  g.fillStyle = color || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 29);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false })); s.scale.set(w / 56 * 0.16, 0.16, 1); s.renderOrder = 3;
  return s;
}

export function createSocial(X) {
  let net = null, hooked = false, lastExtra = '';
  const tags = new Map(); // player id -> { sprite, key }
  function myName() { return (X.st.nick || (window.__net && window.__net.name) || 'Zuck').slice(0, 24); }
  function transform(text) {
    const t = String(text || '').trim(); if (t[0] !== '/') return t;
    const [cmd, ...rest] = t.slice(1).split(/\s+/); const arg = rest.join(' ').trim();
    switch ((cmd || '').toLowerCase()) {
      case 'me': return arg ? `* ${myName()} ${arg}` : null;
      case 'do': return arg ? `(( ${arg} ))` : null;
      case 'dado': case 'dice': case 'roll': { const n = Math.max(2, Math.min(100, parseInt(arg, 10) || 6)); return `🎲 ${myName()} tira un d${n}: ${1 + Math.floor(Math.random() * n)}`; }
      case 'paga': X.toast('Pagamenti tra giocatori: non ancora disponibili sul server', 'warn'); return null;
      case 'lavoro': case 'job': { const J = X.jobs.J; return J ? `* ${myName()} è di turno come ${JOBS[J.id].name}` : `* ${myName()} è disoccupato e se ne vanta`; }
      default: return t; // other commands go through untouched (the phone group chat has its own)
    }
  }
  function hook() {
    net = window.__net; if (!net || hooked || typeof net.chat !== 'function') return;
    hooked = true;
    const orig = net.chat.bind(net);
    net.chat = text => { const t = transform(text); if (t) return orig(t); };
    if (net.on) try { net.on('extra', () => { }); } catch (e) { }
  }
  function publish() {
    if (!net || typeof net.setExtra !== 'function') return;
    const J = X.jobs.J, id = J ? J.id : (X.st.lastJob || null);
    const v = id ? { j: id, r: X.rankName(id), t: X.st.titles[X.st.titles.length - 1] || '', n: X.st.nick || '', on: !!J } : (X.st.nick ? { n: X.st.nick } : null);
    const key = JSON.stringify(v); if (key === lastExtra) return; lastExtra = key;
    try { net.setExtra('rp', v); } catch (e) { }
  }
  let pubT = 0, tagT = 0;
  function update(dt) {
    if (!hooked) hook();
    if (!net) return;
    pubT -= dt; if (pubT <= 0) { pubT = 1.5; publish(); }
    tagT -= dt; if (tagT > 0) return; tagT = 0.5;
    const players = net.players;
    if (!players || typeof players.forEach !== 'function') return;
    const seen = new Set();
    players.forEach((P, id) => {
      const rp = P && P.extra && P.extra.rp; const root = P && P.avatar && P.avatar.root;
      if (!rp || !root || (!rp.j && !rp.n)) return; seen.add(id);
      const d = rp.j && JOBS[rp.j];
      const text = [rp.n ? '«' + rp.n + '»' : '', d ? `${d.icon} ${d.name}${rp.r ? ' · ' + rp.r : ''}${rp.on ? ' (di turno)' : ''}` : ''].filter(Boolean).join(' ');
      const t = tags.get(id);
      if (t && t.key === text && t.sprite.parent === root) return;
      if (t) { t.sprite.parent && t.sprite.parent.remove(t.sprite); t.sprite.material.map.dispose(); t.sprite.material.dispose(); }
      const s = tagSprite(text, d ? d.color : '#fff'); s.position.y = 2.2; root.add(s); tags.set(id, { sprite: s, key: text });
    });
    for (const [id, t] of tags) if (!seen.has(id)) { t.sprite.parent && t.sprite.parent.remove(t.sprite); t.sprite.material.map.dispose(); t.sprite.material.dispose(); tags.delete(id); }
  }
  return { update, transform, publish };
}
