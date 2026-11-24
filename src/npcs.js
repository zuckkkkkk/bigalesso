// BIGALESSO · NPCs: the friends of the group chat walking around the house, the garden and the neighbourhood.
// Each NPC is a clone of the player's avatar (same rig + retargeted clips) recoloured with the persona colour.
// Up to 6 at once (3 on low quality); they wander around a "home" spot (themed places from the neighbourhood when
// QUARTIERE provides level.anchors like sushi/discord/celtic…), chat with each other, wave at the player, rotate
// (someone leaves, someone else arrives) and can be called from the phone. Press E near one to talk: AI dialogue
// in the persona's voice (window.__ai), offline fallback from the real (filtered) catchphrases.
// Real bodies: models/index.json (written by scripts/build.mjs from assets/models) listing npc_a … npc_e (.glb, or
// .glb.txt base64 in the artifact build; meshopt via gltfsetup.js) replaces the avatar clone for the friends mapped to
// that body (SLOT below). Loaded lazily once the world is up; clips mapped by fuzzy name (idle|walk|run|agree/talk|wave|
// dance|clap|sit); root horizontal translation stripped; size kept when already real (1.5–2.1 m), else normalised. window.__NPC_MODELS = { npc_a: {scene, animations} } also works (already parsed).
// Per-slot tweaks (facing, height, exact clip names): NPC_MODEL_CFG. Until the files exist the man.glb clone is used.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeTemplate } from './avatars.js';
import { PERSONAS, persona, personaPrompt, loreBrief, offline, topicOf, emitEvent, unlock, recentEvents } from './ai.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dampA = (a, b, k) => a + wrapA(b - a) * k;
const rnd = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FAR = V(1e5, 0, 1e5);
const PLAYER_ID = 'zuck'; // the player is Zuck, "il titolare" of BIGALESSO GAMES
// themed hangouts (anchor names QUARTIERE may provide); 'npc_<id>' anchors win if present
const THEME = { asche: 'millennium', ashish: 'sushi', forla: 'discord', seghino: 'checkpoint', ciccio: 'edicola', parme: 'sushi', lombu: 'petroni', cesco: 'celtic', ricky: 'discord', jacopo: 'teletubby', mirco: 'petroni' };
// bodies: a black hoodie + headphones (gamer) · b tank top (athletic) · c glasses + flannel (dev) · d bomber + cap · e denim + beard
const SLOT = { seghino: 'npc_a', parme: 'npc_a', mirco: 'npc_a', asche: 'npc_b', cesco: 'npc_b', forla: 'npc_c', ricky: 'npc_c', ashish: 'npc_d', lombu: 'npc_d', ciccio: 'npc_e', jacopo: 'npc_e' };
// friends sharing a body look a bit different: height and a slight brightness change (materials cached per body+variant)
const VARIANT = { seghino: 0, parme: 1, mirco: 2, asche: 0, cesco: 1, forla: 0, ricky: 1, ashish: 0, lombu: 1, ciccio: 0, jacopo: 1 };
const VAR_LOOK = [{ s: 1.0, b: 1.0 }, { s: 0.975, b: 0.86 }, { s: 1.03, b: 0.93 }];
const BOTTOMS = ['#23262e', '#2c3a52', '#3e3a30', '#1b1b1d', '#38343f', '#2a3340'];
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// ---------------------------------------------------------------- textures / sprites
const texCache = new Map();
function recolorTex(src, hex, keep = 0.0) {
  if (!src || !src.image) return src;
  const key = src.uuid + ':' + hex; if (texCache.has(key)) return texCache.get(key);
  const img = src.image, w = img.width, h = img.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, w, h), d = id.data;
  const T = new THREE.Color(hex);
  const navyL = 0.3 * 0.16 + 0.59 * 0.19 + 0.11 * 0.27;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (!(b >= r && b >= g && mx < 0.55 && mx > 0.02 && (mx - mn) / mx > 0.18 && r < b * 0.85)) continue;
    const L = (0.3 * r + 0.59 * g + 0.11 * b) / navyL;
    d[i] = Math.min(255, T.r * L * 255 * 0.9); d[i + 1] = Math.min(255, T.g * L * 255 * 0.9); d[i + 2] = Math.min(255, T.b * L * 255 * 0.9);
  }
  x.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = src.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = 4;
  texCache.set(key, t); return t;
}
function rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
function wrapText(x, text, max) {
  const words = String(text).split(/\s+/); const out = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur); return out;
}
function tagSprite(name, color, emoji) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d'); x.font = '700 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const label = (emoji ? emoji + ' ' : '') + name;
  const tw = Math.min(500, x.measureText(label).width + 60), X0 = (512 - tw) / 2;
  x.fillStyle = 'rgba(12,8,20,0.72)'; rr(x, X0, 8, tw, 72, 36); x.fill();
  x.fillStyle = color; x.fillRect(X0 + 26, 70, tw - 52, 5);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 256, 44);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(0.62, 0.62 * 96 / 512, 1); s.center.set(0.5, 0); s.renderOrder = 11; return s;
}
function bubbleSprite(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const x = c.getContext('2d'); x.font = '600 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const lines = wrapText(x, text, 440).slice(0, 3);
  const tw = Math.min(490, Math.max(...lines.map(l => x.measureText(l).width)) + 50), H = 30 + lines.length * 42, X0 = (512 - tw) / 2, Y0 = 200 - H - 22;
  x.fillStyle = 'rgba(255,255,255,0.95)'; rr(x, X0, Y0, tw, H, 24); x.fill();
  x.beginPath(); x.moveTo(244, Y0 + H); x.lineTo(256, 198); x.lineTo(270, Y0 + H); x.fill();
  x.fillStyle = '#17101f'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, 256, Y0 + 15 + 21 + i * 42));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(1.15, 1.15 * 200 / 512, 1); s.center.set(0.5, 0); s.renderOrder = 12; return s;
}
const disposeSprite = s => { if (!s) return; s.parent && s.parent.remove(s); s.material.map && s.material.map.dispose(); s.material.dispose(); };

// ---------------------------------------------------------------- external (Tripo) models
// yaw: extra rotation if the export does not face +Z · height: target metres · clips: exact names if the fuzzy match fails
export const NPC_MODEL_CFG = {
  default: { height: 1.8, yaw: 0 }, // height: target when the file's size is not already realistic
  // npc_a: { yaw: Math.PI, clips: { idle: 'Armature|Idle', walk: 'Armature|Walking' } },
};
const CLIP_RE = {
  idle: /idle|breath|stand(?!.*up)|rest/i, walk: /walk/i, run: /run|jog|sprint/i, talk: /agree|nod|talk|gestur|convers|explain|speak|argu/i,
  wave: /wave|hello|greet|salut/i, dance: /danc/i, clap: /clap|cheer|applau|celebr|victory/i, sit: /sit/i,
};
const modelCfg = slot => ({ ...NPC_MODEL_CFG.default, ...(NPC_MODEL_CFG[slot] || {}) });
// normalise a loaded model once: scale + facing wrapper, clip map, root motion stripped. Returns a template record.
function prepareExternal(obj, animations, slot) {
  const cfg = modelCfg(slot);
  obj.updateMatrixWorld(true);
  const bones = []; obj.traverse(o => { if (o.isBone) bones.push(o); });
  const rootBone = bones.find(b => !(b.parent && b.parent.isBone)) || null;
  const pelvis = rootBone && (/pelvis|hips/i.test(rootBone.name) ? rootBone : rootBone.children.find(c => c.isBone && /pelvis|hips/i.test(c.name)) || null);
  const strip = new Set([rootBone && rootBone.name, pelvis && pelvis.name].filter(Boolean).map(n => THREE.PropertyBinding.sanitizeNodeName(n)));
  const clips = {};
  const used = new Set();
  const named = cfg.clips || {};
  for (const key of Object.keys(CLIP_RE)) {
    let c = named[key] ? animations.find(a => a.name === named[key]) : null;
    if (!c) c = animations.find(a => !used.has(a) && CLIP_RE[key].test(a.name) && !(key === 'walk' && /run/i.test(a.name)) && !(key === 'idle' && /walk|run/i.test(a.name)));
    if (c) { used.add(c); clips[key] = stripRoot(c.clone(), strip); }
  }
  if (!clips.idle && animations.length) clips.idle = stripRoot(animations.find(a => !used.has(a)) ? animations.find(a => !used.has(a)).clone() : animations[0].clone(), strip);
  // seated clips (pelvis much lower than in idle, measured in world space on the posed template) can't be used as standing
  // gestures: e.g. a Tripo "wave" exported sitting
  const seated = new Set();
  if (pelvis && clips.idle) {
    const mx = new THREE.AnimationMixer(obj), pw = new THREE.Vector3();
    const hAt = c => { mx.stopAllAction(); const a = mx.clipAction(c); a.reset().play(); mx.setTime(c.duration * 0.5); obj.updateMatrixWorld(true); const y = pelvis.getWorldPosition(pw).y; a.stop(); return y; };
    try {
      const y0 = hAt(clips.idle);
      if (y0 > 0.05) for (const k in clips) if (k !== 'idle' && hAt(clips[k]) < y0 * 0.72) seated.add(k);
    } catch (e) { }
    mx.stopAllAction(); mx.uncacheRoot(obj);
  }
  for (const k of ['wave', 'clap', 'talk', 'dance', 'walk', 'run']) if (seated.has(k)) delete clips[k];
  // size from the bind-pose bounds
  const box = new THREE.Box3().setFromObject(obj, true); const h = Math.max(0.05, box.max.y - box.min.y);
  const scale = h > 0.9 && h < 2.6 ? 1 : cfg.height / h; // the pipeline exports real metres (bind-pose bounds can read short): only fix wild units
  const head = bones.find(b => /(^|[:_ ])head$/i.test(b.name)) || bones.find(b => /head/i.test(b.name) && !/end|top/i.test(b.name)) || null;
  return { template: obj, clips, seated: [...seated], scale, yOff: Math.abs(box.min.y) < 0.05 ? 0 : -box.min.y * scale, yaw: cfg.yaw || 0, headName: head ? head.name : null, slot };
}
// root motion: keep the root/pelvis horizontal position at its first key (the game moves the NPC)
function stripRoot(clip, names) {
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.position')) continue;
    const node = THREE.PropertyBinding.parseTrackName(t.name).nodeName;
    if (!names.has(node)) continue;
    const v = t.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}
// man.js-like facade over a generic skinned model with its own clips (used by NPC when an external model exists)
class ExtRig {
  constructor(rec, low, look = null) {
    const model = SkeletonUtils.clone(rec.template); // geometry + materials shared with the template
    const b = look && look.b ? look.b : 1;
    if (b !== 1) { rec.varMats = rec.varMats || {}; const cache = rec.varMats[b] = rec.varMats[b] || new Map(); model.traverse(o => { if (!o.isMesh) return; const m = o.material; if (!cache.has(m)) { const c = m.clone(); c.color.multiplyScalar(b); cache.set(m, c); } o.material = cache.get(m); }); }
    model.traverse(o => { if (o.isMesh) { o.castShadow = !low; o.receiveShadow = true; o.frustumCulled = false; } });
    const wrap = new THREE.Group(); wrap.add(model); wrap.scale.setScalar(rec.scale); wrap.position.y = rec.yOff; wrap.rotation.y = rec.yaw;
    this.root = new THREE.Group(); this.root.add(wrap);
    this.bones = {}; if (rec.headName) { const hb = model.getObjectByName(rec.headName); if (hb) this.bones.Head = hb; }
    this.mixer = new THREE.AnimationMixer(model);
    this.A = {}; for (const k in rec.clips) { const a = this.mixer.clipAction(rec.clips[k]); a.play(); a.setEffectiveWeight(0); this.A[k] = a; }
    this.w = {}; for (const k in this.A) this.w[k] = k === 'idle' ? 1 : 0;
    this.speed = 0; this.look = 0; this.lookTarget = V(); this.mouth = 0; this.crouch = 0; this.reach = {};
    this.one = null; this.loop = null; // one-shot gesture clip, looping full-body clip (dance)
  }
  setSpeed(s) { this.speed = s; }
  _once(key) { const a = this.A[key]; if (!a) return 0; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); const d = a.getClip().duration; this.one = { key, t: 0, d }; return d; }
  gesture(name) { const k = { wave: 'wave', cheer: 'clap', clap: 'clap', facepalm: 'talk', shrug: 'talk', signal: 'talk', pointScreen: 'talk', twirl: 'dance' }[name] || 'talk'; return this._once(this.A[k] ? k : 'talk'); } // no standing wave in the file: a nod
  playGesture() { return this._once('talk'); }
  playClip(name, { loop = false } = {}) { const key = /danc/i.test(name) ? 'dance' : /sit/i.test(name) ? 'sit' : null; if (!key || !this.A[key]) return 0; if (loop) { this.loop = key; this.A[key].reset().setLoop(THREE.LoopRepeat, Infinity).play(); return 0; } return this._once(key); }
  stopClip() { this.loop = null; }
  stopAllClips() { this.loop = null; this.one = null; }
  update(dt) {
    const v = this.speed, sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    let wIdle = 1 - sm(v / 0.35), wRun = this.A.run ? sm((v - 2.0) / 0.9) : 0, wWalk = Math.max(0, 1 - wIdle - wRun);
    if (!this.A.walk) { wIdle += wWalk; wWalk = 0; }
    let oneW = 0;
    if (this.one) { const o = this.one; o.t += dt; oneW = sm(o.t / 0.25) * sm((o.d - o.t) / 0.3); if (o.t >= o.d) this.one = null; }
    const loopW = this.loop ? 1 : 0, talkW = this.mouth > 0 && this.A.talk && !this.one && v < 0.3 ? 0.55 : 0;
    const base = (1 - oneW) * (1 - loopW);
    const T = { idle: wIdle * base * (1 - talkW), walk: wWalk * base, run: wRun * base, talk: talkW * base, wave: 0, dance: 0, clap: 0, sit: 0 };
    if (this.loop) T[this.loop] = (T[this.loop] || 0) + loopW * (1 - oneW);
    if (this.one) T[this.one.key] = (T[this.one.key] || 0) + oneW;
    const k = 1 - Math.exp(-dt * 8);
    for (const key in this.A) { const tw = T[key] || 0; this.w[key] += (tw - this.w[key]) * (this.one && key === this.one.key ? 1 : k); this.A[key].setEffectiveWeight(this.w[key]); }
    if (this.A.walk) this.A.walk.timeScale = v > 0.05 ? clamp(v / 1.4, 0.5, 1.5) : 1;
    this.mixer.update(dt);
  }
}
async function fetchBuf(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); }
const b64buf = b64 => Uint8Array.from(atob(String(b64).trim()), c => c.charCodeAt(0)).buffer;
// find npc_* models: window.__NPC_MODELS (parsed), window.__ASSETS.models (single file), models/index.json (web/artifact build)
// on-demand body loader: list() -> slots available; get(slot) -> Promise<record|null> (each file fetched/decoded once)
function createModelStore() {
  const pre = window.__NPC_MODELS || {}, emb = window.__ASSETS && window.__ASSETS.models;
  const recs = {}, pending = {}; let files = null, listP = null;
  const slotOf = f => ((String(f).match(/^(npc_[a-z0-9]+)\.glb(\.txt)?$/i) || [])[1] || '').toLowerCase();
  function list() {
    if (listP) return listP;
    listP = (async () => {
      let fl = [];
      if (emb) fl = Object.keys(emb);
      else if (/^https?:$/.test(location.protocol)) {
        try { const r = await fetch('models/index.json', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); fl = (j.models || []).map(x => typeof x === 'string' ? x : x && x.file).filter(Boolean); } } catch (e) { }
      }
      files = {}; for (const f of fl) { const sl = slotOf(f); if (sl && !files[sl]) files[sl] = f; }
      return [...new Set([...Object.keys(pre), ...Object.keys(files)])];
    })();
    return listP;
  }
  let chain = Promise.resolve(); // one decode at a time: no frame hitches, low peak memory
  function get(slot) {
    if (recs[slot] !== undefined) return Promise.resolve(recs[slot]);
    if (pending[slot]) return pending[slot];
    pending[slot] = list().then(() => (chain = chain.then(async () => {
      try {
        if (pre[slot]) { const m = pre[slot]; return (recs[slot] = prepareExternal(m.scene || m, m.animations || [], slot)); }
        const f = files && files[slot]; if (!f) return (recs[slot] = null);
        let buf;
        if (emb) { const d = emb[f]; buf = /^data:/.test(d) ? await (await fetch(d)).arrayBuffer() : b64buf(d); }
        else buf = /\.txt$/i.test(f) ? b64buf(await (await fetch('models/' + f)).text()) : await fetchBuf('models/' + f);
        const g = await new GLTFLoader().parseAsync(buf, 'models/');
        recs[slot] = prepareExternal(g.scene, g.animations || [], slot);
      } catch (e) { console.warn('npc model', slot, e); recs[slot] = null; }
      await new Promise(r => setTimeout(r, 30));
      return recs[slot];
    })));
    return pending[slot];
  }
  return { list, get, has: s => !!recs[s] };
}

// ---------------------------------------------------------------- NPC
class NPC {
  constructor(p, { tpl, Man, anims, scene, low, external }) {
    this.p = p; this.id = p.id; this.scene = scene;
    const h = hash(p.id);
    const top = new THREE.Color(p.color).lerp(new THREE.Color('#3b3f49'), 0.32).getStyle();
    const bottom = BOTTOMS[h % BOTTOMS.length];
    this.mats = [];
    if (external) {
      this.ext = external; // Tripo model for this slot (see createModelStore / ExtRig)
      const look = VAR_LOOK[VARIANT[p.id] || 0];
      this.man = new ExtRig(external, low, look);
      this.root = this.man.root;
      this.extScale = look.s;
    } else {
      const model = SkeletonUtils.clone(tpl);
      model.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const m = o.material.clone(); this.mats.push(m);
        if (/Outfit_Top/.test(m.name)) { m.name = 'NpcTop'; m.map = recolorTex(m.map, top); }
        else if (/Outfit_Bottom/.test(m.name)) { m.name = 'NpcBottom'; m.map = recolorTex(m.map, bottom); }
        o.material = m;
        if (/Headwear/.test(m.name) || /Headwear/.test(o.name)) o.visible = (h % 5 === 0); // a few keep the hat
        if (/Beard/.test(m.name) || /Beard/.test(o.name)) o.visible = (h % 3 !== 0);
        if (low) o.castShadow = false;
      });
      this.man = new Man({ scene: model }, anims);
      this.root = this.man.root;
      if (low) this.root.traverse(o => { if (o.isMesh) o.castShadow = false; });
    }
    this.root.scale.setScalar(this.extScale || (0.96 + (h % 9) * 0.01));
    this.root.name = 'npc_' + p.id;
    this.tag = tagSprite(p.name, p.color, p.emoji); this.tag.position.y = 1.98; this.root.add(this.tag);
    this.bubble = null; this.bubbleT = 0;
    this.state = 'idle'; this.t = 0; this.wait = 2 + Math.random() * 5; this.target = null; this.speed = 0; this.yawGoal = null;
    this.home = V(); this.exitTo = null; this.greeted = false; this.chatCD = 8 + Math.random() * 20; this.acc = 0; this.visible = true;
    this.talking = false; this.mouthT = 0; this.dance = 0; this.pair = null;
    scene.add(this.root);
  }
  pos() { return this.root.position; }
  head(v = V()) { const B = this.man.bones; return B && B.Head ? B.Head.getWorldPosition(v) : v.copy(this.root.position).add(V(0, 1.65, 0)); }
  say(text, dur = 5) {
    disposeSprite(this.bubble);
    this.bubble = bubbleSprite(text); this.bubble.position.y = 2.12; this.root.add(this.bubble); this.bubbleT = dur; this.mouthT = Math.min(3, 0.6 + text.length * 0.045);
  }
  dispose() {
    disposeSprite(this.bubble); disposeSprite(this.tag);
    this.scene.remove(this.root);
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------- manager
export function installNPCs({ scene, gltf, anims, Man, man, level, ui, audio, camera, input, getFX, low, S }) {
  const tpl = makeTemplate(gltf.scene); // must run before the man's first update (bind pose)
  const cast = PERSONAS.filter(p => p.id !== PLAYER_ID);
  const quality = () => (ui && ui.settings && ui.settings.quality) || 'auto';
  const isLow = () => low || quality() === 'low';
  const maxActive = () => ({ low: 3, medium: 5, high: 6, ultra: 8 }[quality()] || (low ? 3 : 5));
  const active = new Map(); // id -> NPC
  const talked = loadTalked();
  let W = null, H = null, started = false, rotT = 120 + Math.random() * 60, spotT = 0;
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(V(), 1.2);
  const tmp = V(), tmp2 = V();
  // Tripo models (optional): replace the avatar clone for the friends of that slot as soon as a file loads
  const extModels = {};
  let modelsStarted = false;
  const store = createModelStore();
  function useSlot(slot) { // load a body; friends already on stage with that body switch to it
    if (!slot || extModels[slot] !== undefined) return;
    extModels[slot] = null; // loading
    store.get(slot).then(rec => {
      if (!rec) { extModels[slot] = false; return; } // missing/broken file: keep the avatar clone
      extModels[slot] = rec;
      for (const n of [...active.values()]) if (SLOT[n.id] === slot && !n.ext && !(TALK && TALK.n === n)) reskin(n);
    });
  }
  function startModels() { // lazily, once the world is up (never during the intro): bodies of the friends on stage first,
    modelsStarted = true;  // then (not on low quality) the others in the background
    for (const id of active.keys()) useSlot(SLOT[id]);
    if (!isLow()) store.list().then(sl => setTimeout(() => { for (const s of sl) useSlot(s); }, 4000));
  }
  function reskin(n) {
    const pos = n.root.position.clone(), rot = n.root.rotation.y, home = n.home.clone(), id = n.id, st8 = { state: n.state, target: n.target, leaving: n.leaving, greeted: n.greeted };
    n.dispose(); active.delete(id);
    const m = spawn(id, { at: pos }); if (!m) return;
    m.root.rotation.y = rot; m.home = home; m.atHouse = n.atHouse; Object.assign(m, st8);
  }

  // ---------- spots ----------
  const A = () => (level && level.anchors) || {};
  const toV = a => !a ? null : a.isVector3 ? V(a.x, 0, a.z) : Array.isArray(a) ? (a.length === 2 ? V(a[0], 0, a[1]) : V(a[0], 0, a[2])) : (typeof a.x === 'number' ? V(a.x, 0, a.z ?? a.y ?? 0) : null);
  const walk = (x, z, r = 0.28) => !level || !level.isWalkable || level.isWalkable(x, z, r);
  function nearWalk(v, maxR = 2.5) {
    if (walk(v.x, v.z)) return v.clone();
    for (let r = 0.4; r <= maxR; r += 0.4) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r; if (walk(x, z)) return V(x, 0, z); }
    return null;
  }
  function houseSpots() {
    const a = A(), out = [];
    const add = (v, dx = 0, dz = 0) => { if (!v) return; const p = nearWalk(V(v.x + dx, 0, v.z + dz)); if (p && !out.some(o => o.distanceTo(p) < 1.4)) out.push(p); };
    add(toV(a.patio), -0.8, 0.6); add(toV(a.patio), 1.2, 0.9); add(toV(a.gardenCenter), 0.8, -0.5); add(toV(a.gardenCenter), -1.4, 1.2);
    add(toV(a.fountain), 1.8, 0); add(toV(a.fountain), -1.8, 0.4); add(toV(a.loungeCenter), 0.6, -0.8);
    for (const p of [[3.2, 10.2], [10.5, 12.5], [12.8, 16.5], [6.2, 17.2], [-2.2, 16.8], [13.5, 3.8], [12.4, 9.4]]) add(V(p[0], 0, p[1]));
    return out;
  }
  let spots = [], spotUse = new Map();
  function homeFor(id, { house = false } = {}) {
    const a = A();
    const themed = house ? null : toV(a['npc_' + id]) || toV(a[THEME[id]]);
    if (themed) { const p = nearWalk(themed.clone().add(V((hash(id) % 5 - 2) * 0.5, 0, (hash(id + 'z') % 5 - 2) * 0.5)), 3); if (p) return p; }
    if (!spots.length) spots = houseSpots();
    if (!spots.length) return V(1.2, 0, 14);
    // least used spot (two friends may share one and chat)
    let best = spots[0], bu = 1e9; for (const s of spots) { const u = spotUse.get(s) || 0; if (u < bu) { bu = u; best = s; } }
    spotUse.set(best, bu + 1); return best.clone().add(V((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
  }
  function exitPoint() {
    const a = A(); const e = toV(a.gate) || toV(a.street) || toV(a.exit) || toV(a.gardenGate);
    if (e) return nearWalk(e, 3) || e;
    const b = level && level.bounds; if (!b) return V(12, 0, 19);
    return nearWalk(V(b.x1 - 1.2, 0, b.z1 - 1.2), 4) || V(1.2, 0, 14);
  }

  // ---------- spawn / leave ----------
  function spawn(id, { at = null, walkTo = null } = {}) {
    if (active.has(id)) return active.get(id);
    const p = persona(id); if (!p) return null;
    let n;
    if (modelsStarted) useSlot(SLOT[id]);
    try { n = new NPC(p, { tpl, Man, anims, scene, low: isLow(), external: extModels[SLOT[id]] || null }); } catch (e) { console.warn('npc', id, e); return null; }
    n.home = homeFor(id);
    const start = at ? at.clone() : n.home.clone();
    n.root.position.copy(start); n.root.rotation.y = Math.random() * Math.PI * 2;
    if (walkTo) { n.state = 'walk'; n.target = walkTo.clone(); n.arrive = true; }
    active.set(id, n);
    return n;
  }
  function despawn(id) { const n = active.get(id); if (!n) return; if (TALK && TALK.n === n) return; n.dispose(); active.delete(id); }
  function leave(n) { n.state = 'walk'; n.target = exitPoint(); n.leaving = true; n.say(rnd(['Vado raga, a dopo', 'Io stacco ✌🏼', 'Devo andare, ci si vede', 'Bella, a stasera']), 4); }
  function startCast() {
    started = true;
    const ids = cast.map(p => p.id).sort(() => Math.random() - 0.5).slice(0, Math.max(1, maxActive() - 1));
    ids.forEach((id, i) => { const n = spawn(id); if (n && i < 2) { n.atHouse = true; n.home = homeFor(id, { house: true }); n.root.position.copy(n.home); } }); // two of them hang out at the house, the others at their places
    // two of them hang out together
    const arr = [...active.values()]; if (arr.length >= 2) { arr[1].home = arr[0].home.clone().add(V(1.1, 0, 0.3)); arr[1].root.position.copy(nearWalk(arr[1].home) || arr[1].home); }
  }
  function rotate() {
    const arr = [...active.values()].filter(n => !n.leaving && !(TALK && TALK.n === n) && n.root.position.distanceTo(man.root.position) > 5);
    if (arr.length && active.size >= maxActive() - 1) leave(rnd(arr));
    const idle = cast.filter(p => !active.has(p.id));
    if (idle.length && active.size < maxActive()) {
      const id = rnd(idle).id; const ex = exitPoint();
      setTimeout(() => { if (!active.has(id) && active.size < maxActive()) { const n = spawn(id, { at: ex }); if (n) { n.state = 'walk'; n.target = n.home.clone(); } } }, 6000 + Math.random() * 8000);
    }
  }
  // phone "Chiama": the friend comes to the player
  function call(id) {
    if (!persona(id) || id === PLAYER_ID) return false;
    const mp = man.root.position;
    const near = nearWalk(mp.clone().add(V(Math.sin(W ? W.yaw : 0) * 1.4, 0, Math.cos(W ? W.yaw : 0) * 1.4)), 3) || mp.clone();
    let n = active.get(id);
    if (!n) {
      if (active.size >= maxActive()) { const far = [...active.values()].filter(x => !(TALK && TALK.n === x)).sort((a, b) => b.root.position.distanceTo(mp) - a.root.position.distanceTo(mp))[0]; if (far) despawn(far.id); }
      n = spawn(id, { at: exitPoint() });
    }
    if (!n) return false;
    n.leaving = false; n.state = 'walk'; n.target = near; n.home = near.clone(); n.summoned = true; n.wait = 25;
    emitEvent('call', { who: id });
    unlock('call_friend', { title: 'Vieni qui', desc: 'Hai chiamato un amico col telefono', icon: '📞' });
    return true;
  }

  // ---------- per-frame ----------
  const OFF = /[?&]nonpc\b/.test(location.search); // debug: ?nonpc disables the NPCs
  function update(dt) {
    if (OFF) return;
    if (!S || S.phase !== 'world') { for (const n of active.values()) n.root.visible = false; return; }
    if (!started) startCast();
    if (!modelsStarted) startModels();
    // new anchors (neighbourhood built later): recompute homes once
    if ((spotT -= dt) <= 0) { spotT = 10; const na = Object.keys(A()).length; if (na !== spots._na) { const first = spots._na === undefined; spots = []; spots._na = na; spotUse = new Map(); if (!first) for (const n of active.values()) if (!n.summoned && !n.leaving) n.home = homeFor(n.id, { house: !!n.atHouse }); } }
    rotT -= dt; if (rotT <= 0) { rotT = 150 + Math.random() * 120; rotate(); }
    camera.updateMatrixWorld(); pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
    const mp = man.root.position, night = (getFX && getFX() && getFX().nightAmount) || 0;
    const circ = [];
    const list = [...active.values()];
    // distance LOD: only the closest maxActive are animated at full rate
    list.sort((a, b) => a.root.position.distanceToSquared(mp) - b.root.position.distanceToSquared(mp));
    for (let i = 0; i < list.length; i++) {
      const n = list[i], p = n.root.position;
      const d = p.distanceTo(mp);
      think(n, dt, d, night, list);
      // movement
      let spd = 0;
      if (n.state === 'walk' && n.target) {
        tmp.set(n.target.x - p.x, 0, n.target.z - p.z); const L = tmp.length();
        if (L < 0.12) { n.state = 'idle'; n.target = null; n.wait = 3 + Math.random() * 8; if (n.leaving) { despawn(n.id); continue; } if (n.summoned) { n.yawGoal = Math.atan2(mp.x - p.x, mp.z - p.z); n.say(greetLine(n.id), 4); n.summoned = false; } }
        else {
          spd = Math.min(n.leaving || n.summoned ? 1.45 : 1.05, L * 1.6 + 0.3);
          tmp.normalize();
          // avoid the player
          if (d < 0.9) { tmp2.set(p.x - mp.x, 0, p.z - mp.z).normalize(); tmp.addScaledVector(tmp2, 0.8).normalize(); spd *= 0.5; }
          const nx = p.x + tmp.x * spd * dt, nz = p.z + tmp.z * spd * dt;
          if (walk(nx, nz, 0.22) || n.leaving || !level) { p.x = nx; p.z = nz; n.stuck = 0; }
          else { n.stuck = (n.stuck || 0) + dt; spd = 0; if (n.stuck > 0.6) { n.state = 'idle'; n.target = null; n.wait = 1 + Math.random() * 2; } }
          n.root.rotation.y = dampA(n.root.rotation.y, Math.atan2(tmp.x, tmp.z), 1 - Math.exp(-dt * 7));
        }
      }
      if (n.state !== 'walk' && n.yawGoal != null) n.root.rotation.y = dampA(n.root.rotation.y, n.yawGoal, 1 - Math.exp(-dt * 5));
      // separation from other NPCs
      for (const o of list) if (o !== n) { const dx = p.x - o.root.position.x, dz = p.z - o.root.position.z, dd = Math.hypot(dx, dz); if (dd < 0.55 && dd > 1e-4) { p.x += dx / dd * (0.55 - dd) * 0.5; p.z += dz / dd * (0.55 - dd) * 0.5; } }
      n.speed += (spd - n.speed) * Math.min(1, dt * 8);
      // look at the player when close, at the partner when chatting
      const m = n.man;
      if (TALK && TALK.n === n) { m.look += (1 - m.look) * Math.min(1, dt * 5); man.bones && man.bones.Head && man.bones.Head.getWorldPosition(m.lookTarget); }
      else if (n.pair && n.pair.root) { m.look += (0.8 - m.look) * Math.min(1, dt * 3); n.pair.head(m.lookTarget); }
      else if (d < 3.2 && n.state !== 'walk') { m.look += (0.85 - m.look) * Math.min(1, dt * 3); man.bones && man.bones.Head ? man.bones.Head.getWorldPosition(m.lookTarget) : m.lookTarget.copy(mp).add(V(0, 1.6, 0)); }
      else m.look += (0 - m.look) * Math.min(1, dt * 2);
      // lip flap while "speaking"
      n.mouthT = Math.max(0, n.mouthT - dt); m.mouth = n.mouthT > 0 ? 0.12 + Math.abs(Math.sin(performance.now() / 70)) * 0.32 : 0;
      // visibility + LOD
      sph.center.copy(p).add(V(0, 1, 0));
      const inView = frustum.intersectsSphere(sph) && d < 32;
      n.root.visible = inView;
      n.acc += dt;
      const rate = !inView ? 0.5 : d > 14 || i >= maxActive() ? 1 / 15 : d > 7 ? 1 / 30 : 0;
      if (n.acc >= rate) { m.setSpeed(n.speed); try { m.update(n.acc); } catch (e) { } n.acc = 0; }
      // tag + bubble
      n.tag.visible = inView && d < 9; n.tag.material.opacity = clamp((9 - d) / 3, 0, 1);
      if (n.bubble) { n.bubbleT -= dt; if (n.bubbleT <= 0) { disposeSprite(n.bubble); n.bubble = null; } else { n.bubble.material.opacity = Math.min(1, n.bubbleT * 2); n.bubble.visible = inView && d < 18; } }
      circ.push({ id: 'npc_' + n.id, c: p, r: 0.24, npc: true });
    }
    if (W) W.extraCircles = (W.extraCircles || []).filter(c => !c.npc).concat(circ);
    tickTalk(dt);
  }

  function greetLine(id) {
    const p = persona(id);
    return rnd([`Bella Zuck!`, `Zuck! ${cap(rnd(p.catchphrases))}`, `Ue Zucco`, `${cap(rnd(p.catchphrases))}`, offline(id, 'saluto'), offline(id, 'saluto'), offline(id, 'roast')]);
  }
  // idle behaviour: wander near home, greet, chat in pairs, dance at night
  function think(n, dt, d, night, list) {
    if (TALK && TALK.n === n) { n.state = 'talk'; n.target = null; return; }
    if (n.state === 'talk') { n.state = 'idle'; n.wait = 2; }
    n.t += dt;
    // first meeting: wave
    if (!n.greeted && d < 4.2 && n.state !== 'walk' && S.phase === 'world') {
      n.greeted = true; n.yawGoal = Math.atan2(man.root.position.x - n.root.position.x, man.root.position.z - n.root.position.z);
      n.man.gesture('wave'); n.say(greetLine(n.id), 4);
    }
    if (n.state === 'idle') {
      n.wait -= dt;
      if (n.wait <= 0 && !n.pair) {
        if (night > 0.6 && Math.random() < 0.35 && !n.dance) { n.dance = 1; n.man.playClip && n.man.playClip('Dance', { loop: true, fade: 0.5 }); n.wait = 14 + Math.random() * 10; n.state = 'dance'; return; }
        const r = 2.4, a = Math.random() * Math.PI * 2, rad = 0.6 + Math.random() * r;
        const tgt = nearWalk(V(n.home.x + Math.cos(a) * rad, 0, n.home.z + Math.sin(a) * rad), 1.2);
        if (tgt) { n.state = 'walk'; n.target = tgt; } else n.wait = 2;
      }
    } else if (n.state === 'dance') {
      n.wait -= dt; if (n.wait <= 0 || night < 0.3) { n.dance = 0; n.man.stopClip && n.man.stopClip('Dance', 0.6); n.state = 'idle'; n.wait = 3; }
    }
    // chatter
    n.chatCD -= dt;
    if (n.chatCD <= 0 && n.state !== 'walk' && d < 14) {
      n.chatCD = 22 + Math.random() * 40;
      const mate = list.find(o => o !== n && !o.pair && o.state !== 'walk' && !(TALK && TALK.n === o) && o.root.position.distanceTo(n.root.position) < 3.2);
      if (mate) converse(n, mate);
      else if (Math.random() < 0.5) mutter(n);
    }
  }
  function mutter(n) {
    const ai = window.__ai, topic = rnd(['compe', 'sushi', 'serata', null, null]);
    if (ai && ai.status() !== 'offline' && Math.random() < 0.3) {
      ai.ask({ auto: true, persona: n.id, model: 'fast', maxTokens: 60, system: personaPrompt(n.id, { short: true }), prompt: `Scrivi UNA battuta brevissima (max 12 parole) che ${n.p.name} dice tra sé mentre gironzola${topic ? ', tema: ' + topic : ''}. Solo la battuta.`, fallback: () => offline(n.id, topic) })
        .then(t => { if (active.get(n.id) === n && !(TALK && TALK.n === n)) n.say(t.slice(0, 110), 5); });
    } else n.say(offline(n.id, topic), 5);
  }
  function converse(a, b) {
    a.pair = b; b.pair = a;
    const face = (x, y) => { x.yawGoal = Math.atan2(y.root.position.x - x.root.position.x, y.root.position.z - x.root.position.z); };
    face(a, b); face(b, a);
    const topic = rnd(['compe', 'sushi', 'serata', 'zombi', 'corriere', null]);
    const lines = [[a, offline(a.id, topic)], [b, offline(b.id, topic)], [a, cap(rnd(a.p.catchphrases))]];
    lines.forEach(([who, text], i) => setTimeout(() => {
      if (active.get(who.id) !== who || (TALK && TALK.n === who)) return;
      who.say(text, 4.2); if (who.man.playGesture) who.man.playGesture(rnd(['agree', 'headShake', 'agree']));
    }, 400 + i * 3600));
    setTimeout(() => { a.pair = null; b.pair = null; }, 400 + lines.length * 3600 + 500);
  }

  // ---------------------------------------------------------------- dialogue (E to talk)
  let TALK = null;
  const dlg = buildDialog();
  function context() {
    const mp = man.root.position;
    const zone = (level && level.zoneAt && level.zoneAt(mp.x, mp.z)) || (S && S.zone) || 'casa';
    const night = (getFX && getFX() && getFX().nightAmount) > 0.5;
    const ev = recentEvents(4);
    return `Siete in "${zone}" (casa di Zuck con sala giochi, salotto e giardino, a Bologna), è ${night ? 'sera tardi' : 'giorno'}.` + (ev.length ? ` Ultime cose successe nel gioco: ${ev.join('; ')}.` : '');
  }
  const TOPIC_CHOICES = { compe: 'Compettina stasera?', sushi: 'Sushi stasera?', zombi: 'Una zombata?', serata: 'Si esce stasera?', corriere: 'Novità dal Corriere?' };
  function offlineChoices(id, used = []) {
    const p = persona(id); const txt = (p.interests.join(' ') + ' ' + p.catchphrases.join(' ')).toLowerCase();
    const fav = Object.keys(TOPIC_CHOICES).filter(k => new RegExp({ compe: 'compe|discord|warzone|overwatch|cs', sushi: 'sushi', zombi: 'zomb', serata: 'serat|birr|celtic|millennium|bellazzi', corriere: 'corriere|gulag|tortellino' }[k], 'i').test(txt));
    const rest = Object.keys(TOPIC_CHOICES).filter(k => !fav.includes(k)).sort(() => Math.random() - 0.5);
    const pool = [...fav.sort(() => Math.random() - 0.5), ...rest].filter(k => !used.includes(TOPIC_CHOICES[k]));
    const c = pool.slice(0, 2).map(k => TOPIC_CHOICES[k]);
    c.push(rnd(['Che si dice?', 'Tutto bene?', 'Raccontami qualcosa']));
    return c;
  }
  function sysFor(id) {
    const p = persona(id);
    return `Interpreti ${p.name} in un dialogo del gioco.\n${personaPrompt(id)}\n\nIl gruppo: ${loreBrief()}\n\nIl giocatore è Zuck, il padrone di casa e titolare di BIGALESSO GAMES, amico di tutti. ${context()}\n\n` +
      `Rispondi SEMPRE e solo con un oggetto JSON valido: {"line":"la battuta di ${p.name}, massimo 30 parole, nel suo stile da chat parlata","choices":["tre risposte brevi (max 7 parole) che Zuck potrebbe dire: una scherzosa, una che propone qualcosa da fare, una per salutare"]}`;
  }
  async function aiTurn(userText) {
    const T = TALK; if (!T) return;
    const id = T.n.id;
    T.busy = true; dlg.thinking(true);
    const fb = () => {
      const topic = topicOf(userText || '');
      const line = T.turn === 0 ? greetLine(id) + (Math.random() < 0.5 ? ' ' + offline(id, topic) : '') : (topic ? offline(id, topic) : cap(rnd(persona(id).catchphrases)) + '. ' + offline(id, null));
      return { line, choices: T.turn >= 4 ? ['Ci vediamo!'] : offlineChoices(id, T.used) };
    };
    const msgs = T.msgs.concat([{ role: 'user', content: T.turn === 0 ? '[Zuck ti si avvicina per parlare. Attacca tu con una battuta.]' : 'Zuck: ' + userText }]);
    const r = await window.__ai.askJSON({ system: sysFor(id), messages: msgs, model: 'fast', maxTokens: 260, persona: id, cache: false }, fb);
    if (TALK !== T) return;
    let line = r && typeof r.line === 'string' && r.line.trim() ? r.line.trim().slice(0, 260) : fb().line;
    let choices = r && Array.isArray(r.choices) ? r.choices.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim().slice(0, 70)).slice(0, 3) : [];
    if (choices.length < 2) choices = fb().choices;
    if (T.turn >= 5) choices = ['Ci vediamo!'];
    T.msgs = msgs.concat([{ role: 'assistant', content: JSON.stringify({ line, choices }) }]);
    T.turn++; T.busy = false; dlg.thinking(false);
    disposeSprite(T.n.bubble); T.n.bubble = null; T.n.mouthT = Math.min(4, 0.8 + line.length * 0.04); // the dialogue box shows the line
    if (T.n.man.playGesture && Math.random() < 0.5) T.n.man.playGesture(rnd(['agree', 'headShake']));
    else if (Math.random() < 0.3) T.n.man.gesture(rnd(['shrug', 'cheer', 'facepalm']));
    dlg.show(T.n.p, line, choices);
  }
  function choose(text) {
    const T = TALK; if (!T || T.busy) return;
    if (/^(ci vediamo|ciao|a dopo|bella)\b/i.test(text) && T.turn > 0) { closeTalk(true); return; }
    T.used.push(text);
    if (Math.random() < 0.35) man.gesture && man.gesture(rnd(['shrug', 'signal']));
    aiTurn(text);
  }
  function openTalk(n) {
    TALK = { n, msgs: [], turn: 0, used: [], busy: false, t: 0 };
    n.state = 'talk'; n.target = null; n.dance = 0; n.man.stopClip && n.man.stopClip('Dance', 0.3);
    document.body.dataset.overlay = 'npc';
    dlg.open(n.p, { onChoose: choose, onClose: () => closeTalk(true), onActions: window.__npcActions ? () => { if (TALK && TALK.n === n) window.__npcActions(n, () => closeTalk(false)); } : null });
    aiTurn('');
    if (!talked.has(n.id)) { talked.add(n.id); saveTalked(talked); }
    unlock('npc_first', { title: 'Due chiacchiere', desc: 'Hai parlato con un amico del gruppo', icon: '💬' });
    if (cast.every(p => talked.has(p.id))) unlock('npc_all', { title: 'Giro di saluti', desc: 'Hai parlato con tutti gli amici del gruppo', icon: '🤝' });
    emitEvent('talk', { who: n.id });
  }
  function closeTalk(bye) {
    const T = TALK; if (!T) return;
    TALK = null; dlg.close();
    if (document.body.dataset.overlay === 'npc') delete document.body.dataset.overlay;
    if (bye) { T.n.say(cap(rnd(['daje', 'bella', 'a dopo', 'vai va, coglione', 'ciao stronzo', 'dai mo, sparisci', ...T.n.p.catchphrases.slice(0, 3)])) + ' ✌🏼', 3); T.n.man.gesture('wave'); }
    T.n.state = 'idle'; T.n.wait = 6;
    if (W && W.mode === 'npcTalk' && H) H.setMode('explore');
  }
  function tickTalk(dt) {
    if (!TALK) return;
    TALK.t += dt;
    const n = TALK.n, mp = man.root.position;
    n.yawGoal = Math.atan2(mp.x - n.root.position.x, mp.z - n.root.position.z);
    if (W && W.mode !== 'npcTalk' && TALK.t > 1.0) closeTalk(false); // something else took over
  }
  function startTalk(n) {
    if (!W || !H) return;
    if (window.__phone && window.__phone.isOpen && window.__phone.isOpen()) window.__phone.close();
    W.dancing && W.stopDance && W.stopDance();
    n.state = 'talk'; n.target = null; // freeze while the player walks up
    const p = n.root.position, mp = man.root.position;
    const dir = V(mp.x - p.x, 0, mp.z - p.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const stand = nearWalk(p.clone().addScaledVector(dir, 1.0), 0.8) || mp.clone();
    const yaw = Math.atan2(p.x - stand.x, p.z - stand.z);
    TALK = null;
    H.goTo(stand, yaw, () => { if (active.get(n.id) === n) { H.setMode('npcTalk'); openTalk(n); } }, { ignore: ['npc_' + n.id] });
  }

  // ---------------------------------------------------------------- explore plugin
  const plugin = (ctx, w, h) => {
    W = w; H = h;
    const items = cast.map(p => ({
      id: 'npc_' + p.id,
      label: () => 'Parla con ' + p.name,
      anchor: () => { const n = active.get(p.id); return n && n.root.visible !== false && !n.leaving ? n.root.position : FAR; },
      top: () => { const n = active.get(p.id); return n ? n.head(V()).add(V(0, 0.42, 0)) : FAR; },
      range: 1.7,
      act: () => { const n = active.get(p.id); if (n) startTalk(n); },
    }));
    function update(mode, dt, I, keys) {
      if (!TALK) { if (W.t > 0.4) H.setMode('explore'); return {}; }
      if (!dlg.typing()) {
        for (let i = 0; i < 3; i++) if (I.pressed('Digit' + (i + 1)) || I.pressed('Numpad' + (i + 1))) dlg.pick(i);
        if (I.pressed('Digit4') || I.pressed('Tab')) dlg.free();
        if (I.pressed('Digit5') || I.pressed('Numpad5')) dlg.actions();
        if (keys.actP) dlg.skip();
        if (keys.backP) { closeTalk(true); return {}; }
      }
      return TALK ? { lookW: 1, lookAt: TALK.n.head(V()) } : {};
    }
    let camK = 0;
    function camera(pose, dt) {
      if (W.mode !== 'npcTalk' || !TALK) { camK = 0; return null; }
      camK = Math.min(1, camK + dt * 1.8);
      const hp = man.bones && man.bones.Head ? man.bones.Head.getWorldPosition(V()) : man.root.position.clone().add(V(0, 1.6, 0));
      const np = TALK.n.head(V());
      const dir = np.clone().sub(hp); dir.y = 0; const L = dir.length() || 1; dir.divideScalar(L);
      const side = V(dir.z, 0, -dir.x);
      const pos = hp.clone().addScaledVector(dir, -0.95).addScaledVector(side, 0.6).add(V(0, 0.18, 0));
      const look = np.clone().addScaledVector(side, 0.12).add(V(0, -0.34, 0)); // face in the upper third, above the dialogue box
      const k = camK * camK * (3 - 2 * camK);
      return { pos: pose.pos.clone().lerp(pos, k), look: pose.look.clone().lerp(look, k), fov: (pose.fov || 50) + (40 - (pose.fov || 50)) * k };
    }
    return { items, owns: m => m === 'npcTalk', update, camera };
  };

  // everything at start-up (loading screen / intro): every body decoded before the world opens, so nobody is
  // re-skinned mid-game (that rebuild + texture upload was a visible hitch); the gfx warm-up then uploads them
  async function preload(onStep) {
    const sl = await store.list();
    modelsStarted = true;
    await Promise.all(sl.map(s => { useSlot(s); return store.get(s).then(r => { onStep && onStep(s); return r; }); }));
    return sl.length;
  }
  const api = { plugin, update, call, spawn, despawn, preload, active: () => [...active.keys()], get: id => active.get(id), talking: () => !!TALK, closeTalk: () => closeTalk(false) };
  window.__npcs = api;
  return api;
}

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
function loadTalked() { try { return new Set(JSON.parse(localStorage.getItem('bigalesso_npc_talked_v1') || '[]')); } catch (e) { return new Set(); } }
function saveTalked(s) { try { localStorage.setItem('bigalesso_npc_talked_v1', JSON.stringify([...s])); } catch (e) { } }

// ---------------------------------------------------------------- dialogue box (DOM)
function buildDialog() {
  const css = `
#npcDlg{position:fixed;left:50%;bottom:4vh;transform:translate(-50%,16px);width:min(700px,62vw);z-index:40;opacity:0;pointer-events:none;transition:opacity .22s,transform .22s;
 font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#f3eefc}
#npcDlg.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#npcDlg .box{background:linear-gradient(180deg,rgba(18,12,30,.86),rgba(10,7,18,.9));border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.45);
 padding:13px 18px 11px;backdrop-filter:blur(10px);border-left:4px solid var(--c,#c8f03c)}
#npcDlg .who{display:flex;align-items:baseline;gap:10px;margin-bottom:6px}
#npcDlg .who b{font:800 18px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.02em;color:var(--c,#c8f03c);text-transform:uppercase}
#npcDlg .who small{opacity:.5;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
#npcDlg .line{font-size:18px;min-height:1.5em;white-space:pre-wrap}
#npcDlg .line .dots{display:inline-block;letter-spacing:3px;animation:npcDots 1s infinite steps(4)}
@keyframes npcDots{0%{opacity:.2}50%{opacity:1}100%{opacity:.2}}
#npcDlg ol{list-style:none;margin:10px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:5px}
#npcDlg li{display:flex;gap:10px;align-items:center;padding:6px 10px;border-radius:9px;background:rgba(255,255,255,.05);cursor:pointer;transition:background .12s}
#npcDlg li:hover{background:rgba(255,255,255,.13)}
#npcDlg kbd{min-width:22px;text-align:center;font:700 12px/20px ui-monospace,Menlo,Consolas,monospace;border-radius:5px;background:rgba(255,255,255,.14);padding:0 6px}
#npcDlg li.alt{opacity:.75}
#npcDlg input{margin-top:10px;width:100%;box-sizing:border-box;padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:#fff;font:15px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;outline:none}
#npcDlg input:focus{border-color:var(--c,#c8f03c)}
#npcDlg .foot{margin-top:8px;font-size:11px;opacity:.45;display:flex;justify-content:space-between}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'npcDlg';
  root.innerHTML = `<div class="box"><div class="who"><b></b><small>versione da gioco</small></div><div class="line"></div><ol></ol><input type="text" maxlength="160" hidden><div class="foot"><span class="prov"></span><span>1-3 scegli · 4 scrivi · 5 azioni · Esc saluta</span></div></div>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const lineEl = $('.line'), ol = $('ol'), inp = $('input'), whoEl = $('.who b'), provEl = $('.prov');
  let cb = null, full = '', shown = 0, timer = 0, choices = [], name = '';
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { const v = inp.value.trim(); inp.value = ''; inp.hidden = true; inp.blur(); if (v && cb) cb.onChoose(v); e.preventDefault(); }
    if (e.key === 'Escape') { inp.hidden = true; inp.blur(); e.preventDefault(); }
  });
  inp.addEventListener('keyup', e => e.stopPropagation());
  function render() {
    ol.innerHTML = '';
    choices.forEach((c, i) => { const li = document.createElement('li'); li.innerHTML = `<kbd>${i + 1}</kbd><span></span>`; li.querySelector('span').textContent = c; li.onclick = () => api.pick(i); ol.appendChild(li); });
    if (choices.length > 1) { const li = document.createElement('li'); li.className = 'alt'; li.innerHTML = '<kbd>4</kbd><span>Scrivi tu…</span>'; li.onclick = () => api.free(); ol.appendChild(li); }
    if (cb && cb.onActions) { const li = document.createElement('li'); li.className = 'alt'; li.innerHTML = '<kbd>5</kbd><span>Fai qualcosa… (birra, cinque, braccio di ferro, selfie, seguimi)</span>'; li.onclick = () => api.actions(); ol.appendChild(li); }
    const li = document.createElement('li'); li.className = 'alt'; li.innerHTML = '<kbd>Esc</kbd><span>Ciao, ci vediamo</span>'; li.onclick = () => cb && cb.onClose(); ol.appendChild(li);
  }
  function step() {
    clearTimeout(timer);
    if (shown >= full.length) { render(); return; }
    shown = Math.min(full.length, shown + 2); lineEl.textContent = full.slice(0, shown);
    timer = setTimeout(step, 22);
  }
  const api = {
    open(p, callbacks) { cb = callbacks; name = p.name; root.style.setProperty('--c', p.color); whoEl.textContent = (p.emoji ? p.emoji + ' ' : '') + p.name; lineEl.innerHTML = '<span class="dots">…</span>'; ol.innerHTML = ''; inp.hidden = true; root.classList.add('on'); provEl.textContent = provLabel(); },
    close() { root.classList.remove('on'); clearTimeout(timer); cb = null; inp.blur(); },
    thinking(v) { if (v) { lineEl.innerHTML = '<span class="dots">…</span>'; ol.innerHTML = ''; } },
    show(p, line, ch) { full = line; shown = 0; choices = ch; ol.innerHTML = ''; provEl.textContent = provLabel(); step(); },
    typing: () => document.activeElement === inp || shown < full.length,
    skip() { if (shown < full.length) { shown = full.length; lineEl.textContent = full; render(); } },
    pick(i) { if (shown < full.length || !cb || !choices[i]) return; cb.onChoose(choices[i]); },
    actions() { if (cb && cb.onActions) cb.onActions(); },
    free() { if (!cb) return; inp.hidden = false; inp.placeholder = `Scrivi a ${name}… (Invio)`; inp.focus(); },
  };
  return api;
}
function provLabel() { const s = window.__ai ? window.__ai.status() : 'offline'; return s === 'offline' ? 'battute dal gruppo (offline)' : 'risponde Claude'; }
