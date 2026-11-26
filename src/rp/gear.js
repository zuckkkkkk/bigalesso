// rp/gear.js — meshes built once at startup (preload + warm-up cover them): job uniforms (caps, rider box), the target
// marker, the job board in the Piazzetta, the badly parked car, procedural fallback furniture. No lights.
import * as THREE from 'three';

const PI = Math.PI;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });

function labelTex(lines, { w = 256, h = 128, bg = '#1a1a1a', fg = '#fff', font = 'bold 34px system-ui, sans-serif' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = h / (lines.length + 1);
  lines.forEach((t, i) => g.fillText(t, w / 2, lh * (i + 1)));
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
}

// ---------------------------------------------------------------- uniforms
export function buildGear() {
  const G = {};
  // rider: helmet + thermal box on the back
  {
    const g = new THREE.Group(); g.name = 'rp_rider_head';
    const m = std(0x28c2a0, { roughness: 0.35 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 10, 0, PI * 2, 0, PI / 2), m); shell.scale.set(1, 0.95, 1.12);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.07), std(0x111111)); visor.position.set(0, 0.0, 0.14);
    g.add(shell, visor);
    const b = new THREE.Group(); b.name = 'rp_rider_box';
    const side = std(0x28c2a0, { roughness: 0.5 }), face = std(0xffffff, { map: labelTex(['BIGALESSO', 'EATS'], { bg: '#28c2a0', fg: '#0b2a24' }), roughness: 0.5 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.3), [side, side, side, side, side, face]); // +z = back face (looks away from the rider)
    box.castShadow = true; b.add(box);
    const strap = std(0x222222); for (const x of [-0.12, 0.12]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.36, 0.02), strap); s.position.set(x, 0.02, -0.16); b.add(s); }
    G.rider = { head: g, back: b };
  }
  // barista: coppola (flat cap)
  {
    const g = new THREE.Group(); g.name = 'rp_barista_head'; const m = std(0x6a4a30, { roughness: 0.9 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.13, 0.05, 16), m); top.scale.set(1, 1, 1.15); top.position.y = 0.01;
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16, 1, false, -PI / 2, PI), m); peak.position.set(0, -0.01, 0.1); peak.rotation.x = 0.12;
    g.add(top, peak); G.barista = { head: g };
  }
  // buttafuori: black beanie + earpiece
  {
    const g = new THREE.Group(); g.name = 'rp_door_head'; const m = std(0x141414, { roughness: 0.95 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 8, 0, PI * 2, 0, PI / 2), m); cap.scale.set(1.02, 1.05, 1.1);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.018, 6, 18), m); rim.rotation.x = PI / 2; rim.scale.set(1, 1.1, 1);
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10), std(0x222222)); ear.position.set(0.12, -0.08, 0.0); ear.rotation.y = PI / 2;
    g.add(cap, rim, ear); G.buttafuori = { head: g };
  }
  // vigile: white cap with black visor and badge
  {
    const g = new THREE.Group(); g.name = 'rp_vigile_head';
    const white = std(0xf4f4f0, { roughness: 0.4 }), black = std(0x101010, { roughness: 0.3 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.07, 18), black); band.position.y = 0.0;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.125, 0.05, 18), white); top.position.y = 0.06; top.scale.set(1, 1, 1.12);
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 16, 1, false, -PI / 2, PI), black); peak.position.set(0, -0.03, 0.1); peak.rotation.x = 0.25;
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), std(0xd8b040, { metalness: 0.8, roughness: 0.3 })); badge.position.set(0, 0.0, 0.124);
    g.add(band, top, peak, badge); G.vigile = { head: g };
  }
  for (const k in G) for (const p of Object.values(G[k])) { p.visible = false; p.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); }
  return G;
}

// ---------------------------------------------------------------- marker (where to go): ring on the ground + bobbing arrow
export function buildMarker() {
  const g = new THREE.Group(); g.name = 'rp_marker';
  const mat = new THREE.MeshBasicMaterial({ color: 0x28c2a0, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), mat); ring.rotation.x = -PI / 2; ring.position.y = 0.04;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 12), mat); arrow.rotation.x = PI; arrow.position.y = 2.6;
  g.add(ring, arrow); g.visible = false;
  g.userData = { ring, arrow, mat };
  return g;
}

// ---------------------------------------------------------------- job board (Piazzetta)
export function buildBoard() {
  const g = new THREE.Group(); g.name = 'rp_board';
  const wood = std(0x6a4a30), cork = std(0xffffff, { map: labelTex(['CERCASI', 'rider · barista', 'buttafuori · vigile'], { w: 512, h: 320, bg: '#c89a5a', fg: '#2a1a0a', font: 'bold 52px system-ui, sans-serif' }), roughness: 0.95 });
  for (const x of [-0.55, 0.55]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.9, 0.07), wood); p.position.set(x, 0.95, 0); g.add(p); }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 0.05), [wood, wood, wood, wood, cork, wood]); panel.position.y = 1.45; g.add(panel);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- procedural car (when the fiat500 model is missing)
export function buildFallbackCar() {
  const g = new THREE.Group(); const body = std(0xc8202a, { roughness: 0.35, metalness: 0.3 }), glass = std(0x223040, { roughness: 0.1, metalness: 0.5 }), rub = std(0x111111);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 3.3), body); b.position.y = 0.55; g.add(b);
  const c = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.8), glass); c.position.set(0, 1.1, -0.1); g.add(c);
  for (const [x, z] of [[-0.7, 1.05], [0.7, 1.05], [-0.7, -1.05], [0.7, -1.05]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14), rub); w.rotation.z = PI / 2; w.position.set(x, 0.28, z); g.add(w); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- fallback furniture (simple, shared materials)
export function buildFallbackFurni(kind) {
  const g = new THREE.Group(); const wood = std(0x8a5a34), dark = std(0x2a2a2e), green = std(0x3f7a34), red = std(0xb0302a), metal = std(0x9aa0a8, { metalness: 0.6, roughness: 0.4 });
  const box = (w, h, d, m, x = 0, y = h / 2, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  switch (kind) {
    case 'bench': box(1.6, 0.06, 0.45, wood, 0, 0.45); box(1.6, 0.4, 0.05, wood, 0, 0.72, -0.2); for (const x of [-0.7, 0.7]) box(0.06, 0.45, 0.45, metal, x, 0.225); break;
    case 'bins': for (const [i, c] of [[0, 0x2a6ad0], [1, 0xe8c040], [2, 0x3f7a34]]) box(0.45, 0.9, 0.45, std(c), (i - 1) * 0.5, 0.45); break;
    case 'bike': box(1.5, 0.05, 0.05, red, 0, 0.6); for (const x of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 16), dark); w.position.set(x, 0.34, 0); g.add(w); } break;
    case 'desk': box(1.4, 0.05, 0.7, dark, 0, 0.75); for (const x of [-0.65, 0.65]) box(0.05, 0.75, 0.65, dark, x, 0.375); box(0.6, 0.38, 0.04, std(0x111111, { emissive: 0x2244aa, emissiveIntensity: 0.6 }), 0, 1.0, -0.2); break;
    case 'dj': box(1.6, 1.0, 0.6, dark, 0, 0.5); box(1.5, 0.05, 0.5, std(0x222222, { emissive: 0xaa22aa, emissiveIntensity: 0.6 }), 0, 1.02); break;
    case 'tap': box(0.5, 1.0, 0.4, wood, 0, 0.5); box(0.08, 0.35, 0.08, metal, 0, 1.17); break;
    case 'hedge': { const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), green); s.scale.set(1.3, 0.8, 1); s.position.y = 0.5; g.add(s); break; }
    case 'tree': { box(0.2, 2.2, 0.2, wood, 0, 1.1); const s = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), green); s.position.y = 2.8; g.add(s); break; }
    case 'lamp': box(0.1, 3.2, 0.1, dark, 0, 1.6); box(0.3, 0.3, 0.3, std(0xfff2c0, { emissive: 0xffd080, emissiveIntensity: 0.4 }), 0, 3.25); break;
    case 'vespa': box(0.5, 0.5, 1.5, std(0x8fd3c0, { roughness: 0.35 }), 0, 0.55); box(0.1, 0.6, 0.1, metal, 0, 1.0, 0.55); break;
    case 'sofa': box(2.0, 0.45, 0.9, red, 0, 0.225); box(2.0, 0.5, 0.2, red, 0, 0.6, -0.35); box(0.9, 0.4, 0.6, wood, 0, 0.2, 1.1); break;
    default: box(0.8, 0.05, 0.8, wood, 0, 0.72); box(0.08, 0.7, 0.08, wood, 0, 0.35); break; // table
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// placement ring for furniture (green = ok, red = no)
export function buildPlaceRing() {
  const mat = new THREE.MeshBasicMaterial({ color: 0x40e070, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), mat); ring.rotation.x = -PI / 2; ring.position.y = 0.03; ring.visible = false; ring.name = 'rp_place_ring';
  return ring;
}
