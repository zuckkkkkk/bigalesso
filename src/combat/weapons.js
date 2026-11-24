// combat/weapons.js — the comic weapon registry (data) + procedural low-poly meshes (viewmodel / worldmodel / projectiles).
// Items follow the schema LOOT-RPG relies on:
//   { id, base, name, rarity:'comune'|'non comune'|'raro'|'epico'|'leggendario', level, stats:{...}, perks:[] }
// stats: damage, fireRate (shots/s), magazine, reloadTime (s), spread (rad), range (m), projectileSpeed (m/s, 0 = hitscan),
//        splashRadius (m), knockback (m/s), element ('acqua'|'sugo'|'schiuma'|'spritz')
// makeItem(base, {rarity, level, perks, stats, name}) scales the base stats by rarity and level (stats given win).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const RARITIES = ['comune', 'non comune', 'raro', 'epico', 'leggendario'];
export const RARITY = {
  comune: { mult: 1, color: '#d4d4d8' }, 'non comune': { mult: 1.12, color: '#62d96f' }, raro: { mult: 1.28, color: '#4aa8ff' },
  epico: { mult: 1.5, color: '#c27bff' }, leggendario: { mult: 1.8, color: '#ffb52e' },
};
export const ELEMENTS = { acqua: '#5cc8ff', sugo: '#e0401c', schiuma: '#ff8a1e', spritz: '#ff6a00' };

// kind: hitscan | projectile | melee · gravity (m/s²) for projectiles · stick: darts stay on walls · rocket: trail
export const BASES = {
  pistola: { name: 'Pistola ad acqua', icon: '💧', element: 'acqua', kind: 'hitscan', hands: 1, auto: true,
    stats: { damage: 9, fireRate: 8, magazine: 24, reloadTime: 1.4, spread: 0.014, range: 24, projectileSpeed: 0, splashRadius: 0, knockback: 0.7 } },
  tortellini: { name: 'Lanciatortellini', icon: '🥟', element: 'sugo', kind: 'projectile', hands: 2, gravity: 9.8,
    stats: { damage: 24, fireRate: 1.6, magazine: 6, reloadTime: 2.1, spread: 0.02, range: 40, projectileSpeed: 19, splashRadius: 1.7, knockback: 2.6 } },
  nerf: { name: 'Nerf blaster', icon: '🎯', element: 'schiuma', kind: 'projectile', hands: 2, gravity: 2.2, stick: true, headMult: 2.5,
    stats: { damage: 20, fireRate: 3.2, magazine: 12, reloadTime: 1.7, spread: 0.006, range: 55, projectileSpeed: 46, splashRadius: 0, knockback: 1.3 } },
  spritz: { name: 'Spritz-Bazooka', icon: '🍹', element: 'spritz', kind: 'projectile', hands: 2, gravity: 1.2, rocket: true, shoulder: true,
    stats: { damage: 90, fireRate: 0.6, magazine: 2, reloadTime: 3.0, spread: 0.004, range: 70, projectileSpeed: 15, splashRadius: 3.4, knockback: 9 } },
  ombrello: { name: 'Ombrello-mazza', icon: '☂️', element: 'acqua', kind: 'melee', hands: 1,
    stats: { damage: 32, fireRate: 1.8, magazine: 0, reloadTime: 0, spread: 0, range: 2.0, projectileSpeed: 0, splashRadius: 0, knockback: 5.5 } },
};
for (const k in BASES) BASES[k].stats.element = BASES[k].element;

// perks the combat core implements (LOOT-RPG may roll them)
export const PERKS = {
  doppio: 'Colpo doppio: un proiettile in più', vampiro: 'Vampiro: ti cura dell\'8% del danno', esplosivo: 'Esplosivo: piccolo splash a ogni impatto',
  gelo: 'Ghiacciolo: rallenta del 50% per 2 s', rimbalzo: 'Rimbalzo: i proiettili rimbalzano una volta', turbo: 'Turbo: ricarica -35%', critico: 'Critico: 15% di colpi doppi',
};

let seq = 0;
export function makeItem(base, o = {}) {
  if (!BASES[base]) base = 'pistola';
  const B = BASES[base];
  const rarity = RARITY[o.rarity] ? o.rarity : 'comune', level = Math.max(1, (o.level | 0) || 1), ri = RARITIES.indexOf(rarity);
  const st = { ...B.stats };
  st.damage = Math.round(st.damage * RARITY[rarity].mult * (1 + 0.08 * (level - 1)) * 10) / 10;
  if (st.magazine) st.magazine = Math.max(1, Math.round(st.magazine * (1 + 0.1 * ri)));
  st.reloadTime = Math.round(st.reloadTime * (1 - 0.05 * ri) * 100) / 100;
  Object.assign(st, o.stats || {});
  return { id: o.id || base + '_' + Date.now().toString(36) + '_' + (seq++), base, name: o.name || B.name, rarity, level, stats: st, perks: (o.perks || []).filter(p => PERKS[p]) };
}
// final stats of an item (missing fields filled from the base)
export function statsOf(item) { const B = BASES[item && item.base] || BASES.pistola; return { ...B.stats, ...(item && item.stats) }; }

// ---------------------------------------------------------------- procedural meshes (one vertex-coloured material)
function colored(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
const box = (w, h, d, x, y, z, c, rx, ry, rz) => colored(place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), c);
// cylinder along +z (axis 'z') or +y
const cylZ = (r0, r1, len, x, y, z, c, seg = 10) => colored(place(new THREE.CylinderGeometry(r1, r0, len, seg), x, y, z, Math.PI / 2), c);
const cylY = (r0, r1, h, x, y, z, c, seg = 10) => colored(place(new THREE.CylinderGeometry(r1, r0, h, seg), x, y, z), c);
const sph = (r, x, y, z, c, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 10, 7); g.scale(sx, sy, sz); return colored(place(g, x, y, z), c); };
const tor = (r, t, x, y, z, c, rx = 0, ry = 0, arc = Math.PI * 2) => colored(place(new THREE.TorusGeometry(r, t, 6, 12, arc), x, y, z, rx, ry), c);

// local frame: the grip (where the right hand holds) at the origin, barrel along +z, up +y. muzzle in userData.
const MUZZLE = { pistola: [0, 0.03, 0.235], tortellini: [0, 0.055, 0.36], nerf: [0, 0.045, 0.39], spritz: [0, 0.12, 0.47], ombrello: [0, 0, 0.82] };
const SUPPORT = { pistola: null, tortellini: [-0.01, 0.0, 0.2], nerf: [-0.01, 0.0, 0.2], spritz: [-0.02, 0.05, 0.26], ombrello: null };
function weaponParts(base) {
  switch (base) {
    case 'pistola': return [
      box(0.034, 0.095, 0.042, 0, -0.045, -0.004, '#ff4fa0', 0.28), box(0.052, 0.055, 0.2, 0, 0.025, 0.06, '#27b8ff'),
      cylY(0.036, 0.036, 0.085, 0, 0.09, 0.02, '#ffd21f', 12), cylY(0.016, 0.016, 0.03, 0, 0.145, 0.02, '#ff4fa0', 8),
      cylZ(0.012, 0.009, 0.07, 0, 0.03, 0.19, '#ff8a1e', 8), box(0.012, 0.03, 0.012, 0, -0.01, 0.035, '#ffffff', -0.3),
      box(0.056, 0.012, 0.16, 0, 0.055, 0.06, '#7fe0ff')];
    case 'tortellini': return [
      box(0.036, 0.1, 0.046, 0, -0.05, 0, '#d63a2a', 0.25), cylZ(0.062, 0.062, 0.44, 0, 0.055, 0.13, '#f3dfb4', 14),
      cylZ(0.066, 0.066, 0.05, 0, 0.055, 0.32, '#d63a2a', 14), cylZ(0.066, 0.066, 0.03, 0, 0.055, 0.04, '#2f9a48', 14),
      sph(0.075, 0, 0.14, 0.02, '#ffcf3a', 1, 0.6, 1), tor(0.03, 0.011, -0.004, 0.17, 0.0, '#f2b02a', Math.PI / 2), tor(0.03, 0.011, 0.02, 0.165, 0.05, '#f2b02a', 1.2, 0.4),
      cylZ(0.008, 0.008, 0.07, 0.075, 0.055, 0.1, '#888888', 6), sph(0.016, 0.075, 0.055, 0.14, '#d63a2a')];
    case 'nerf': return [
      box(0.036, 0.1, 0.046, 0, -0.05, 0, '#2a6cff', 0.25), box(0.06, 0.08, 0.27, 0, 0.035, 0.07, '#ff7a1a'),
      cylZ(0.022, 0.022, 0.2, 0, 0.045, 0.29, '#2a6cff', 10), box(0.05, 0.03, 0.13, 0, 0.088, 0.05, '#ffe02a'),
      box(0.012, 0.03, 0.012, 0, 0.11, 0.17, '#ffe02a'), box(0.045, 0.07, 0.03, 0, -0.03, 0.2, '#2a6cff'), box(0.05, 0.06, 0.12, 0, 0.02, -0.11, '#ff7a1a', -0.15)];
    case 'spritz': return [
      box(0.04, 0.1, 0.05, 0, -0.04, 0, '#3a2a2a', 0.2), cylZ(0.085, 0.085, 0.82, 0, 0.12, 0.06, '#ff6a00', 14),
      cylZ(0.09, 0.09, 0.04, 0, 0.12, 0.44, '#ffffff', 14), cylZ(0.09, 0.09, 0.04, 0, 0.12, -0.3, '#ffffff', 14),
      cylZ(0.094, 0.094, 0.02, 0, 0.12, 0.47, '#ffd21f', 14), sph(0.03, 0.09, 0.17, 0.2, '#4caa2a'), cylY(0.008, 0.008, 0.2, 0.03, 0.26, -0.24, '#2fd06a', 6),
      box(0.03, 0.06, 0.03, 0, 0.2, 0.18, '#3a2a2a'), box(0.045, 0.09, 0.05, 0, -0.03, 0.25, '#3a2a2a', 0.2)];
    case 'ombrello': return [
      cylZ(0.008, 0.008, 0.82, 0, 0, 0.36, '#1d1d24', 6), colored(place(new THREE.ConeGeometry(0.055, 0.56, 10), 0, 0, 0.5, Math.PI / 2), '#c8102e'),
      cylZ(0.004, 0.002, 0.08, 0, 0, 0.8, '#bbbbbb', 6), tor(0.035, 0.009, 0, -0.035, -0.05, '#6b3b1d', 0, Math.PI / 2, Math.PI)];
  }
  return [box(0.05, 0.05, 0.2, 0, 0, 0.05, '#ffffff')];
}
const SKIN = '#e9b48f', SLEEVE = '#3a1d6b', CUFF = '#b8ff3c';
function armParts(base) {
  // right forearm behind the grip (camera space: the viewmodel is rotated so +z goes away from the eye)
  const out = [cylZ(0.04, 0.048, 0.34, 0.02, -0.06, -0.2, SLEEVE, 8), cylZ(0.042, 0.042, 0.03, 0.02, -0.055, -0.04, CUFF, 8), sph(0.038, 0, -0.02, 0.0, SKIN, 0.9, 1.1, 1.25)];
  const s = SUPPORT[base];
  if (s) out.push(sph(0.036, s[0], s[1] - 0.02, s[2], SKIN, 1.1, 0.8, 1.2), cylZ(0.04, 0.046, 0.36, s[0] - 0.12, s[1] - 0.08, s[2] - 0.2, SLEEVE, 8));
  return out;
}

let MAT = null;
export function weaponMaterial() { if (!MAT) MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 }); return MAT; }
const geoCache = {};
export function weaponGeometry(base, arms = false) {
  const k = base + (arms ? ':a' : '');
  if (!geoCache[k]) { const g = mergeGeometries(arms ? weaponParts(base).concat(armParts(base)) : weaponParts(base)); g.computeBoundingSphere(); geoCache[k] = g; }
  return geoCache[k];
}
// a mesh per base (shared geometry), with userData.muzzle (local Vector3)
export function weaponMesh(base, arms = false) {
  const m = new THREE.Mesh(weaponGeometry(base, arms), weaponMaterial());
  m.userData.muzzle = new THREE.Vector3(...(MUZZLE[base] || [0, 0, 0.3])); m.userData.base = base;
  m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; return m;
}
export const supportPoint = base => SUPPORT[base] ? new THREE.Vector3(...SUPPORT[base]) : null;

// projectile geometries (instanced, same material)
export function projectileGeometry(kind) {
  switch (kind) {
    case 'tortellini': return mergeGeometries([tor(0.042, 0.022, 0, 0, 0, '#ffcf3a', Math.PI / 2), sph(0.03, 0, 0.0, 0.0, '#f0a020', 1, 0.8, 1)]);
    case 'nerf': return mergeGeometries([cylZ(0.011, 0.011, 0.085, 0, 0, -0.01, '#ff7a1a', 8), sph(0.016, 0, 0, 0.04, '#2a6cff', 1, 1, 0.9), cylZ(0.013, 0.008, 0.02, 0, 0, -0.06, '#ffe02a', 6)]);
    case 'spritz': return mergeGeometries([cylZ(0.05, 0.05, 0.24, 0, 0, 0, '#ff6a00', 10), colored(place(new THREE.ConeGeometry(0.05, 0.09, 10), 0, 0, 0.165, Math.PI / 2), '#ffffff'),
      sph(0.022, 0.05, 0.02, -0.02, '#4caa2a'), cylZ(0.06, 0.06, 0.02, 0, 0, -0.12, '#ffd21f', 10)]);
    case 'multa': return mergeGeometries([box(0.2, 0.004, 0.13, 0, 0, 0, '#fbfbf2'), box(0.18, 0.006, 0.02, 0, 0.002, 0.03, '#d0202a'), box(0.12, 0.006, 0.012, 0, 0.002, -0.02, '#3a3a3a')]);
  }
  return new THREE.SphereGeometry(0.05, 8, 6);
}
