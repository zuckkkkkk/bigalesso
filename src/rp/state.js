// rp/state.js — persistent roleplay state in localStorage (NET syncs every 'bigalesso_*' key to the server profile).
//   bigalesso_rp        { v, nick, jobs: {id: {xp, shifts, best, earned}}, fedina: [{t, what, euro}], titles: [], stats }
//   bigalesso_rp_house  [{ k: furniture id, x, z, r: quarter turns }]
import { JOB_IDS } from './data.js';

const KEY = 'bigalesso_rp', HKEY = 'bigalesso_rp_house';
const fresh = () => ({
  v: 1, nick: '', jobs: Object.fromEntries(JOB_IDS.map(id => [id, { xp: 0, shifts: 0, best: 0, earned: 0 }])),
  fedina: [], titles: [], stats: { tips: 0, fines: 0, pints: 0, deliveries: 0, doors: 0 },
});
export function loadRP() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  const f = fresh();
  if (!s || typeof s !== 'object') return f;
  const o = { ...f, ...s, jobs: { ...f.jobs }, stats: { ...f.stats, ...(s.stats || {}) } };
  for (const id of JOB_IDS) o.jobs[id] = { ...f.jobs[id], ...((s.jobs && s.jobs[id]) || {}) };
  if (!Array.isArray(o.fedina)) o.fedina = []; if (!Array.isArray(o.titles)) o.titles = [];
  o.nick = String(o.nick || '').slice(0, 24);
  return o;
}
let tSave = 0;
export function saveRP(s, now = false) {
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } };
  clearTimeout(tSave); if (now) write(); else tSave = setTimeout(write, 400);
}
export function loadHouse() {
  try { const a = JSON.parse(localStorage.getItem(HKEY) || '[]'); return Array.isArray(a) ? a.filter(o => o && typeof o.k === 'string' && isFinite(o.x) && isFinite(o.z)).slice(0, 60) : []; } catch (e) { return []; }
}
export function saveHouse(list) { try { localStorage.setItem(HKEY, JSON.stringify(list.map(o => ({ k: o.k, x: +o.x.toFixed(2), z: +o.z.toFixed(2), r: o.r | 0 })))); } catch (e) { } }
