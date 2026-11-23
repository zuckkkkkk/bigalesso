// Other people in the room: extra men (clones of the loaded avatar) with their own suit colour and name tag.
// Used by net.js for online players and for the local 2nd player at the cabinet.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// suit colours by player colour index (0 = the local man's charcoal navy)
export const SUITS = [0x283247, 0x7c1d2c, 0x1d5e3c, 0xb07a16, 0x55575f, 0xd8d0bf, 0x5c2b8a, 0x23589a];
export const TAG_COLORS = ['#c8f03c', '#ff5a6a', '#4be08a', '#ffc23a', '#c9ccd6', '#fff3d6', '#c07aff', '#5ab4ff'];
const PALMS = ['down', 'up', 'forward', 'in', 'face', 'side'];
export const palmIndex = p => Math.max(0, PALMS.indexOf(p));

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const dampA = (a, b, k) => lerpA(a, b, k);

// recolour the (already navy) suit texture to another colour, keeping the cloth shading
const texCache = new Map();
function recolorTex(src, hex) {
  if (!src || !src.image) return src;
  const key = src.uuid + ':' + hex; if (texCache.has(key)) return texCache.get(key);
  const img = src.image, w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, w, h), d = id.data;
  const T = new THREE.Color(hex); // sRGB components
  const navyL = 0.3 * 0.16 + 0.59 * 0.19 + 0.11 * 0.27;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (!(b >= r && b >= g && mx < 0.55 && mx > 0.02 && (mx - mn) / mx > 0.18 && r < b * 0.85)) continue;
    const L = (0.3 * r + 0.59 * g + 0.11 * b) / navyL;
    d[i] = Math.min(255, T.r * L * 255 * 0.9); d[i + 1] = Math.min(255, T.g * L * 255 * 0.9); d[i + 2] = Math.min(255, T.b * L * 255 * 0.9);
  }
  x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = src.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = 8;
  texCache.set(key, t); return t;
}

function roundRect(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
function labelSprite(text, color, { bubble = false } = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = bubble ? 160 : 112;
  const x = c.getContext('2d');
  x.font = (bubble ? '600 40px' : '700 52px') + ' system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const lines = bubble ? wrap(x, text, 460).slice(0, 2) : [text];
  const tw = Math.min(480, Math.max(...lines.map(l => x.measureText(l).width)) + 56);
  const H = bubble ? 40 + lines.length * 46 : 80;
  const X0 = (512 - tw) / 2;
  x.fillStyle = bubble ? 'rgba(255,255,255,0.95)' : 'rgba(18,10,30,0.82)';
  roundRect(x, X0, 6, tw, H, 26); x.fill();
  if (bubble) { x.beginPath(); x.moveTo(246, H + 6); x.lineTo(256, H + 24); x.lineTo(268, H + 6); x.fill(); }
  else { x.lineWidth = 5; x.strokeStyle = color; roundRect(x, X0, 6, tw, H, 26); x.stroke(); }
  x.fillStyle = bubble ? '#1a1024' : '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, 256, (bubble ? 26 + 23 : 6 + H / 2) + i * 46));
  if (!bubble) { x.fillStyle = color; x.beginPath(); x.arc(X0 + 30, 6 + H / 2, 10, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(m); const k = bubble ? 0.0013 : 0.0016; s.scale.set(512 * k, c.height * k, 1); s.renderOrder = 10;
  s.center.set(0.5, 0);
  return s;
}
function wrap(x, text, max) {
  const words = String(text).split(/\s+/); const out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur); return out;
}

export class Avatar {
  // tpl: SkeletonUtils-clonable template scene in bind pose; Man: the Man class; anims: anims.json
  constructor({ tpl, Man, anims, scene, name = 'Giocatore', color = 1 }) {
    const model = SkeletonUtils.clone(tpl);
    model.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const m = o.material.clone();
      if (/Outfit_Top|Outfit_Bottom/.test(m.name)) { m.name = /Top/.test(m.name) ? 'AvTop' : 'AvBottom'; m.map = recolorTex(m.map, SUITS[color % SUITS.length]); }
      o.material = m;
    });
    this.man = new Man({ scene: model }, anims);
    this.root = this.man.root; this.scene = scene;
    this.name = name; this.color = color;
    this.tag = labelSprite(name, TAG_COLORS[color % TAG_COLORS.length]); this.tag.position.y = 1.98; this.root.add(this.tag);
    this.bubble = null; this.bubbleT = 0;
    scene.add(this.root);
    this.buf = [];        // network samples {t, s}
    this.s = null;        // last applied state
    this.gseq = -1; this.dancing = false; this.crouch = 0; this.ik = 0;
    this.script = null;   // scripted walk (local P2)
    this.seat = null;     // {pos, yaw, stick, caps, start} when playing at the cabinet
    this.vel = V(); this.prevPos = null; this.fade = 0;
  }
  setName(name, color) {
    if (name === this.name && color === this.color) return;
    this.name = name; this.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose();
    this.tag = labelSprite(name, TAG_COLORS[color % TAG_COLORS.length]); this.tag.position.y = 1.98; this.root.add(this.tag);
  }
  say(text) {
    if (this.bubble) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
    this.bubble = labelSprite(text, '#fff', { bubble: true }); this.bubble.position.y = 2.1; this.root.add(this.bubble); this.bubbleT = 6;
  }
  push(t, s) { this.buf.push({ t, s }); if (this.buf.length > 30) this.buf.shift(); }
  place(x, z, yaw) { this.root.position.set(x, 0, z); this.root.rotation.y = yaw; this.prevPos = this.root.position.clone(); }
  // scripted walk along points (local P2 helper)
  walkTo(points, { speed = 1.25, yaw = null, then = null } = {}) { this.script = { pts: points.map(p => p.clone ? p.clone() : V(...p)), i: 0, speed, yaw, then }; }
  dispose() {
    this.scene.remove(this.root);
    this.root.traverse(o => { if (o.isMesh || o.isSprite) { if (o.material.map && o.isSprite) o.material.map.dispose(); o.material.dispose && o.material.dispose(); } });
  }

  // one frame. now = performance.now(); seatFor(state) -> seat rig or null (provided by net.js)
  update(dt, now, seatFor) {
    const man = this.man, root = this.root;
    if (this.bubble) { this.bubbleT -= dt; if (this.bubbleT <= 0) { this.root.remove(this.bubble); this.bubble = null; } else this.bubble.material.opacity = Math.min(1, this.bubbleT); }
    let speed = 0, crouchT = 0, look = null, reachL = null, reachR = null, press = 0;
    const seat = !this.script && seatFor ? seatFor(this) : null;
    if (this.script) {
      const sc = this.script, p = root.position;
      const tgt = sc.pts[sc.i];
      const d = V(tgt.x - p.x, 0, tgt.z - p.z), L = d.length();
      if (L < 0.06) { sc.i++; if (sc.i >= sc.pts.length) { const then = sc.then; this.script = null; if (sc.yaw !== null) this.yawGoal = sc.yaw; then && then(this); } }
      else {
        speed = Math.min(sc.speed, L * 2.2 + 0.25);
        p.addScaledVector(d.normalize(), speed * dt);
        root.rotation.y = dampA(root.rotation.y, Math.atan2(d.x, d.z), 1 - Math.exp(-dt * 8));
      }
    } else if (this.buf.length) {
      // interpolate 110 ms in the past
      const rt = now - 110; const b = this.buf;
      while (b.length > 2 && b[1].t <= rt) b.shift();
      let a = b[0], c = b[1] || b[0];
      const k = c.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (c.t - a.t))) : 1;
      const sa = a.s, sb = c.s; this.s = sb;
      const x = sa.x + (sb.x - sa.x) * k, z = sa.z + (sb.z - sa.z) * k;
      const yaw = lerpA(sa.yw, sb.yw, k);
      if (!seat) {
        root.position.x += (x - root.position.x) * Math.min(1, dt * 20);
        root.position.z += (z - root.position.z) * Math.min(1, dt * 20);
        root.position.y = sb.y || 0;
        root.rotation.y = dampA(root.rotation.y, yaw, Math.min(1, dt * 18));
      }
      speed = sb.sp || 0; crouchT = sb.cr || 0;
      if (sb.lk && sb.lw > 0.01) look = { p: V(sb.lk[0], sb.lk[1], sb.lk[2]), w: sb.lw };
      const rr = r => r ? { pos: V(r[0], r[1], r[2]), w: r[3], palm: PALMS[r[4] || 0], grip: r[5] || 0 } : null;
      reachL = rr(sb.rl); reachR = rr(sb.rr); press = sb.pr || 0;
      // gestures / dance
      if (sb.g && sb.g[1] !== this.gseq) {
        const first = this.gseq === -1; this.gseq = sb.g[1];
        if (!first) { if (sb.g[2]) man.playGesture(sb.g[0]); else man.gesture(sb.g[0]); }
      }
      if (sb.dn && !this.dancing) { this.dancing = true; man.playClip('Dance', { loop: true, fade: 0.4 }); }
      else if (!sb.dn && this.dancing) { this.dancing = false; man.stopClip('Dance'); }
      if (sb.n && sb.n !== this.name) this.setName(String(sb.n).slice(0, 16), this.color);
    }
    if (this.yawGoal !== undefined && !this.script) { root.rotation.y = dampA(root.rotation.y, this.yawGoal, 1 - Math.exp(-dt * 6)); }
    // seat at the cabinet: stand at the seat spot, hands on the controls
    if (seat) {
      root.position.x += (seat.pos.x - root.position.x) * Math.min(1, dt * 6);
      root.position.z += (seat.pos.z - root.position.z) * Math.min(1, dt * 6);
      root.rotation.y = dampA(root.rotation.y, seat.yaw, Math.min(1, dt * 6));
      speed = Math.min(speed, 0.2);
    }
    this.ik += ((seat ? 1 : 0) - this.ik) * Math.min(1, dt * 3);
    this.crouch += (crouchT - this.crouch) * Math.min(1, dt * 6);
    man.setSpeed(speed);
    man.crouch = this.crouch;
    man.ik = this.ik; man.lean = 0.12 * this.ik;
    if (seat) {
      man.leftTarget.copy(seat.left()); man.rightTarget.copy(seat.right()); man.press += ((seat.press ? seat.press() : press) - man.press) * Math.min(1, dt * 18);
      man.look = Math.max(man.look * 0.9, this.ik); man.lookTarget.copy(seat.look);
    } else if (look) { man.look += (look.w - man.look) * Math.min(1, dt * 6); man.lookTarget.lerp(look.p, Math.min(1, dt * 8)); }
    else man.look += (0 - man.look) * Math.min(1, dt * 4);
    man.reach.left = this.ik > 0.05 ? null : reachL; man.reach.right = this.ik > 0.05 ? null : reachR;
    man.update(dt);
    // keep the tag above the head (crouch)
    this.tag.position.y = 1.98 - this.crouch * 0.34;
    if (this.bubble) this.bubble.position.y = this.tag.position.y + 0.13;
  }
}

// bind-pose template to clone avatars from (call before the local man is first updated)
export function makeTemplate(scene) { return SkeletonUtils.clone(scene); }
