import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRenderer, setupLights } from './scene.js';
import { buildRoom } from './room.js';
import { buildCabinet } from './cabinet.js';
import { Man } from './man.js';
import { buildDog } from './dog.js';
import { loadImage, tex, canvas } from './util.js';
const q = new URLSearchParams(location.search);
const num = (k, d) => q.has(k) ? +q.get(k) : d;
const vec = (k, d) => q.has(k) ? q.get(k).split(',').map(Number) : d;
(async () => {
  const el = document.getElementById('app');
  const renderer = createRenderer(el, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  setupLights(scene, renderer, false);
  const tl = new THREE.TextureLoader();
  const ld = u => tl.loadAsync('../assets/' + u).then(t => { t.colorSpace = THREE.SRGBColorSpace; return t; });
  const [side, baseSide, baseFront, marquee, title, gltf, anims] = await Promise.all([
    ...['side.jpg', 'base_side.jpg', 'base_front.jpg', 'marquee.jpg'].map(ld), loadImage('../assets/title.png'),
    new GLTFLoader().loadAsync('../assets/man.glb'), fetch('../assets/anims.json').then(r => r.json())]);
  const sc = canvas(320, 240); sc.getContext('2d').drawImage(title, 0, 0, 320, 240);
  buildRoom(scene, { reflections: false, reflQuality: 0.5 });
  const cab = buildCabinet({ side, baseSide, baseFront, marquee, screen: tex(sc, { nearest: true }) });
  cab.group.position.set(0.35, 0, 0.02); scene.add(cab.group); scene.updateMatrixWorld(true);
  const man = new Man(gltf, anims); scene.add(man.root); window.man = man;
  const W = o => o.getWorldPosition(new THREE.Vector3());
  const dog = buildDog(); dog.root.position.set(...vec('dpos', [-0.45, 0, 1.25])); dog.root.rotation.y = num('dyaw', 2.44); scene.add(dog.root); window.dog = dog;
  const mode = q.get('mode') || 'play';
  const dt = 1 / 30;
  const center = new THREE.Vector3();
  if (mode === 'play') {
    man.root.position.set(0.19, 0, 1.06); man.root.rotation.y = Math.PI;
    const ik = num('ik', 1);
    man.ik = ik; man.lean = 0.12 * ik; man.look = ik; man.press = num('press', 0);
    man.lookTarget.copy(W(cab.bz));
    man.leftTarget.copy(W(cab.stick1.ball)).add(new THREE.Vector3(0, 0.056, 0.02));
    const c = ['p1a', 'p1b', 'p1c', 'p1d', 'p1e', 'p1f'].map(n => W(cab.buttons[n].cap)).reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / 6);
    man.rightTarget.copy(c).add(new THREE.Vector3(0.005, 0.09, 0.115));
    if (q.get('upper')) man.playGesture(q.get('upper'));
    if (q.get('gesture')) man.gesture(q.get('gesture'));
    for (let i = 0; i < Math.round(num('frames', 30)); i++) man.update(dt);
    center.set(0.2, 1.1, 0.9);
  } else {
    man.root.position.set(...vec('mpos', [0.3, 0, 1.7])); man.root.rotation.y = num('myaw', 0);
    man.setSpeed(num('speed', 0));
    man.crouch = num('crouch', 0);
    if (q.get('reachR')) { const a = q.get('reachR').split(','); man.reach.right = { pos: new THREE.Vector3(+a[0], +a[1], +a[2]), w: +a[3], palm: a[4] || 'down', grip: +(a[5] || 0.3) }; }
    if (q.get('reachL')) { const a = q.get('reachL').split(','); man.reach.left = { pos: new THREE.Vector3(+a[0], +a[1], +a[2]), w: +a[3], palm: a[4] || 'down', grip: +(a[5] || 0.3) }; }
    if (q.get('clip')) man.playClip(q.get('clip'), { loop: true });
    man.look = num('look', 0); man.lookTarget.set(...vec('lookAt', [0.6, 1.3, 0.3]));
    const pre = num('frames', 30);
    for (let i = 0; i < pre; i++) man.update(dt);
    if (q.get('gesture')) { man.gesture(q.get('gesture')); const gt = num('gt', 0.8); for (let t = 0; t < gt; t += dt) man.update(dt); }
    center.copy(man.root.position).add(new THREE.Vector3(0, 0.95 - 0.3 * man.crouch, 0));
  }
  // dog
  if (q.get('react')) dog.react(q.get('react'));
  if (q.get('follow')) dog.setFollow(new THREE.Vector3(...vec('follow', [0, 0, 0])));
  if (q.get('stand')) { dog.setFollow(dog.root.position.clone().add(new THREE.Vector3(0.3, 0, 2))); }
  dog.onSound = n => console.log('dog sound', n);
  const dsteps = Math.round(num('dt', 1) / dt);
  const lookD = q.get('dlook') === 'man' ? W(man.bones.Head) : W(cab.bz);
  for (let i = 0; i < dsteps; i++) dog.update(dt, lookD, num('excite', 0));
  // views: 2x2 tiles around center (or custom)
  const cams = [];
  const R = num('r', 2.0), H = num('h', 0.25);
  const target = q.has('center') ? new THREE.Vector3(...vec('center')) : center;
  const angles = (q.get('angles') || '0,90,180,270').split(',').map(a => +a * Math.PI / 180);
  const base = num('base', 0) * Math.PI / 180;
  for (const a of angles) { const c = new THREE.PerspectiveCamera(num('fov', 35), 1, 0.03, 40); c.position.set(target.x + Math.sin(a + base) * R, target.y + H, target.z + Math.cos(a + base) * R); c.lookAt(target); cams.push(c); }
  const w = el.clientWidth, h = el.clientHeight, n = cams.length, cols = n > 1 ? 2 : 1, rows = Math.ceil(n / cols);
  renderer.setScissorTest(true); renderer.autoClear = true;
  cams.forEach((c, i) => {
    const tw = w / cols, th = h / rows, x = (i % cols) * tw, y = h - (Math.floor(i / cols) + 1) * th;
    c.aspect = tw / th; c.updateProjectionMatrix();
    renderer.setViewport(x, y, tw, th); renderer.setScissor(x, y, tw, th); renderer.render(scene, c);
  });
  const B = man.bones, f = v => v.toArray().map(x => x.toFixed(2)).join(',');
  console.log('hands L', f(W(B.LeftHand)), 'R', f(W(B.RightHand)), 'feet', f(W(B.LeftFoot)), f(W(B.RightFoot)), 'hips', f(W(B.Hips)), 'dog', f(dog.root.position));
  const hf = man.headLocalFwd.clone().applyQuaternion(man.bones.Head.getWorldQuaternion(new THREE.Quaternion())); const nf = man.headLocalFwd.clone().applyQuaternion(man.bones.Neck.getWorldQuaternion(new THREE.Quaternion())); const s2 = man.headLocalFwd.clone().applyQuaternion(man.bones.Spine2.getWorldQuaternion(new THREE.Quaternion())); console.log('headFwd', f(hf), 'neckFwd', f(nf), 'spine2Fwd', f(s2));
  console.log('ok');
})().catch(e => console.error(e.stack || e));
