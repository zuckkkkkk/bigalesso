// Dog props: tennis ball with physics, water bowl, dog bed, rope toy.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const toV = (a, y = 0) => {
  if (!a) return null;
  if (a.isVector3) return a.clone();
  if (Array.isArray(a)) return a.length === 2 ? V(a[0], y, a[1]) : V(a[0], a[1], a[2]);
  if (typeof a === 'object' && 'x' in a) return V(a.x, a.y ?? y, a.z);
  return null;
};

function feltTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#d8f03a'; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 2600; i++) { const v = 190 + Math.random() * 60; x.fillStyle = `rgba(${v},${v + 20},${40 + Math.random() * 40},0.35)`; x.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5); }
  x.strokeStyle = '#f6f8ec'; x.lineWidth = 7; x.beginPath();
  for (let i = 0; i <= 256; i++) { const u = i / 256 * Math.PI * 2; const y = 64 + Math.sin(u * 2) * 38; i ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createDogProps(scene, opts = {}) {
  const anchors = opts.anchors || {};
  const group = new THREE.Group(); group.name = 'dogprops'; scene.add(group);
  // ---------- ball ----------
  const R = 0.033;
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 18), new THREE.MeshPhysicalMaterial({ map: feltTexture(), roughness: 0.92, sheen: 1, sheenColor: new THREE.Color(0xf4ffb0), sheenRoughness: 0.5 }));
  ballMesh.castShadow = true; ballMesh.receiveShadow = true;
  const spawn = toV(anchors.ballSpawn) || V(-2.2, 0, 1.9);
  ballMesh.position.set(spawn.x, R, spawn.z);
  group.add(ballMesh);
  const ball = {
    mesh: ballMesh, R, vel: V(), state: 'rest', holder: null, thrownAt: -1, t: 0, lastBounce: 0,
    get pos() { return ballMesh.getWorldPosition(V()); },
    attachTo(obj, local = V()) { obj.attach(ballMesh); ballMesh.position.copy(local); this.vel.set(0, 0, 0); this.holder = obj; this.state = obj.userData.isMouth ? 'mouth' : 'hand'; },
    detach(vel = V()) {
      if (!this.holder) return;
      const p = ballMesh.getWorldPosition(V()); group.attach(ballMesh); ballMesh.position.copy(p);
      this.vel.copy(vel); this.holder = null; this.state = 'flying';
    },
    throw(vel) { this.detach(vel); this.thrownAt = this.t; this.state = 'flying'; this.onThrow?.(this); },
    speed() { return this.vel.length(); },
    onBounce: null, onThrow: null,
  };
  // ---------- bowl ----------
  const bowlP = toV(anchors.dogBowl) || V(-2.75, 0, 0.55);
  const bowl = new THREE.Group(); bowl.position.copy(bowlP); bowl.position.y = 0; group.add(bowl);
  const steel = new THREE.MeshStandardMaterial({ color: 0xd6d9de, metalness: 1, roughness: 0.25 });
  const prof = [[0.0, 0.0], [0.085, 0.0], [0.1, 0.012], [0.095, 0.05], [0.085, 0.052], [0.07, 0.014], [0.0, 0.012]].map(p => new THREE.Vector2(p[0], p[1]));
  const bm = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), steel); bm.castShadow = bm.receiveShadow = true; bowl.add(bm);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.072, 32), new THREE.MeshPhysicalMaterial({ color: 0x9fc8e0, roughness: 0.04, transparent: true, opacity: 0.7 }) /* perf: no transmission pass */);
  water.rotation.x = -Math.PI / 2; water.position.y = 0.04; bowl.add(water);
  // ---------- bed ----------
  const bedP = toV(anchors.dogBed) || V(-3.0, 0, 2.3);
  const bed = new THREE.Group(); bed.position.copy(bedP); bed.position.y = 0; bed.rotation.y = 0.9; group.add(bed);
  const fabric = new THREE.MeshPhysicalMaterial({ color: 0x7a2fc0, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0xc8f03c), sheenRoughness: 0.6 });
  const cushion = new THREE.MeshPhysicalMaterial({ color: 0xe8dcc8, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.07, 18, 48), fabric); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.2, 0.85); rim.position.y = 0.065; rim.castShadow = rim.receiveShadow = true; bed.add(rim);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.05, 40), fabric); base.position.y = 0.025; base.scale.z = 1.2; base.receiveShadow = true; bed.add(base);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 12), cushion); pad.scale.set(1, 0.14, 1.2); pad.position.y = 0.05; pad.receiveShadow = true; bed.add(pad);
  // ---------- rope toy ----------
  const toy = new THREE.Group(); toy.position.set(bedP.x + 0.45, 0, bedP.z - 0.25); toy.rotation.y = 0.4; group.add(toy);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.11, 0.018, 0), V(-0.03, 0.02, 0.04), V(0.05, 0.018, -0.02), V(0.11, 0.018, 0.02)]), 32, 0.012, 8), new THREE.MeshStandardMaterial({ color: 0xd8242c, roughness: 0.9 }));
  rope.castShadow = true; toy.add(rope);
  for (const e of [-0.12, 0.12]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.95 })); k.position.set(e, 0.022, e > 0 ? 0.02 : 0); k.castShadow = true; toy.add(k); }

  // ---------- ball physics ----------
  const env = { isWalkable: null, colliders: [], bounds: null, isGrass: null };
  function setEnv(e) { Object.assign(env, e || {}); }
  function inBox(c, p, m) {
    const mn = c.min, mx = c.max;
    const x0 = (mn.x ?? mn[0]) - m, x1 = (mx.x ?? mx[0]) + m, z0 = (mn.z ?? mn[1]) - m, z1 = (mx.z ?? mx[1]) + m;
    return p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 ? { x0, x1, z0, z1 } : null;
  }
  function update(dt) {
    ball.t += dt;
    if (ball.holder || ball.state === 'rest') return;
    dt = Math.min(dt, 0.05);
    const steps = 3, h = dt / steps, p = ballMesh.position, v = ball.vel;
    for (let s = 0; s < steps; s++) {
      v.y -= 9.8 * h;
      const prev = p.clone();
      p.addScaledVector(v, h);
      // floor
      if (p.y < R) {
        p.y = R;
        if (v.y < -0.6) { const sp = -v.y; ball.onBounce?.(Math.min(1.4, sp / 4)); v.y = sp * 0.55; v.x *= 0.82; v.z *= 0.82; }
        else v.y = 0;
      }
      // rolling friction (more on grass)
      if (p.y <= R + 1e-4) {
        const g = env.isGrass && env.isGrass(p.x, p.z);
        const k = Math.exp(-h * (g ? 2.6 : 0.9)); v.x *= k; v.z *= k;
      }
      // walls / colliders
      const b = env.bounds;
      if (b) {
        if (p.x < b.x0 + R) { p.x = b.x0 + R; v.x = Math.abs(v.x) * 0.5; ball.onBounce?.(0.4); }
        if (p.x > b.x1 - R) { p.x = b.x1 - R; v.x = -Math.abs(v.x) * 0.5; ball.onBounce?.(0.4); }
        if (p.z < b.z0 + R) { p.z = b.z0 + R; v.z = Math.abs(v.z) * 0.5; ball.onBounce?.(0.4); }
        if (p.z > b.z1 - R) { p.z = b.z1 - R; v.z = -Math.abs(v.z) * 0.5; ball.onBounce?.(0.4); }
      }
      if (env.isWalkable && !env.isWalkable(p.x, p.z) && p.y < 1.2) { p.x = prev.x; p.z = prev.z; v.x *= -0.45; v.z *= -0.45; }
      for (const c of env.colliders || []) {
        const ht = c.h ?? c.height ?? ({ table: 0.47, brick: 0.06, ext: 0.95, cab: 1.8 }[c.id] ?? 2.6); if (p.y > ht + R) continue;
        if (c.type === 'circle' || c.r !== undefined && c.c) {
          const cx = c.c.x ?? c.c[0], cz = c.c.z ?? c.c[1]; const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), m = c.r + R;
          if (d < m && d > 1e-5) { const nx = dx / d, nz = dz / d; p.x = cx + nx * m; p.z = cz + nz * m; const vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= 1.5 * vn * nx; v.z -= 1.5 * vn * nz; } }
        } else if (c.min && c.max) {
          const r = inBox(c, p, R); if (!r) continue;
          const pen = [p.x - r.x0, r.x1 - p.x, p.z - r.z0, r.z1 - p.z]; const i = pen.indexOf(Math.min(...pen));
          if (i === 0) { p.x = r.x0; v.x = -Math.abs(v.x) * 0.5; } else if (i === 1) { p.x = r.x1; v.x = Math.abs(v.x) * 0.5; }
          else if (i === 2) { p.z = r.z0; v.z = -Math.abs(v.z) * 0.5; } else { p.z = r.z1; v.z = Math.abs(v.z) * 0.5; }
        }
      }
    }
    // rolling spin
    const hv = Math.hypot(v.x, v.z);
    if (hv > 1e-3) { const ax = V(v.z, 0, -v.x).normalize(); ballMesh.rotateOnWorldAxis(ax, hv * dt / R); }
    ball.state = p.y > R + 0.002 ? 'flying' : 'rolling';
    if (p.y <= R + 1e-3 && hv < 0.03 && Math.abs(v.y) < 0.05) { v.set(0, 0, 0); ball.state = 'rest'; }
  }
  return { group, ball, bowl, bed, toy, update, setEnv, env, anchors: { bed: bedP, bowl: bowlP, ballSpawn: spawn } };
}
