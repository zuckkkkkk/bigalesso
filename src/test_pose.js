import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRenderer, createComposer, setupLights } from './scene.js';
import { buildRoom } from './room.js';
import { buildCabinet } from './cabinet.js';
import { Man } from './man.js';
import { buildDog } from './dog.js';
import { loadImage, tex, canvas } from './util.js';
const q = new URLSearchParams(location.search);
const num = (k, d) => q.has(k) ? +q.get(k) : d;
(async () => {
  const el = document.getElementById('app');
  const renderer = createRenderer(el, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(num('fov', 38), el.clientWidth / el.clientHeight, 0.03, 40);
  setupLights(scene, renderer, false);
  const tl = new THREE.TextureLoader();
  const ld = u => tl.loadAsync('../assets/' + u).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  const [side, baseSide, baseFront, marquee, title, gltf, anims] = await Promise.all([
    ...['side.jpg', 'base_side.jpg', 'base_front.jpg', 'marquee.jpg'].map(ld), loadImage('../assets/title.png'),
    new GLTFLoader().loadAsync('../test/readyplayer.me.glb'), fetch('../assets/anims.json').then(r => r.json())]);
  const sc = canvas(320, 240); sc.getContext('2d').drawImage(title, 0, 0, 320, 240);
  buildRoom(scene, { reflections: false, reflQuality: 0.5 });
  const cab = buildCabinet({ side, baseSide, baseFront, marquee, screen: tex(sc, { nearest: true }) });
  cab.group.position.set(0.35, 0, 0.02); scene.add(cab.group);
  if (q.get('noside')) cab.group.traverse(o => { if (o.isMesh && (Array.isArray(o.material) && o.geometry.type === 'ExtrudeGeometry' || o.geometry.type === 'ShapeGeometry')) o.visible = false; });
  cab.stick1.piv.rotation.x = num('jx', 0); cab.stick1.piv.rotation.z = num('jz', 0);
  scene.updateMatrixWorld(true);
  const man = new Man(gltf, anims); scene.add(man.root);
  const mode = q.get('mode') || 'play';
  if (q.get('hatred')) man.model.traverse(o => { if (o.isMesh && o.material.name === 'Wolf3D_Headwear') { o.material = o.material.clone(); o.material.emissive.set(0xff0000); o.material.emissiveIntensity = 2; console.log('hat', o.type, o.visible); } });
  window.man = man; window.cab = cab;
  const W = o => o.getWorldPosition(new THREE.Vector3());
  if (mode === 'play') {
    man.root.position.set(num('mx', 0.19), 0, num('mz', 1.06)); man.root.rotation.y = Math.PI;
    man.fwd.set(0, 0, -1);
    man.ik = num('ik', 1); man.lean = num('lean', 0.12) * man.ik; man.look = man.ik; man.press = num('press', 0);
    man.lookTarget.copy(W(cab.bz));
    const ball = W(cab.stick1.ball);
    const lo = (q.get('lo') || '0,0.056,0.02').split(',').map(Number);
    man.leftTarget.copy(ball).add(new THREE.Vector3(...lo));
    const c = ['p1a','p1b','p1c','p1d','p1e','p1f'].map(n => W(cab.buttons[n].cap)).reduce((a,b)=>a.add(b), new THREE.Vector3()).multiplyScalar(1/6);
    const ro = (q.get('ro') || '0.005,0.09,0.115').split(',').map(Number);
    man.rightTarget.copy(c).add(new THREE.Vector3(...ro)); man.rightTarget.y -= man.press * 0.012;
    if (q.get('start')) { const so = (q.get('so') || '0.0,0.085,0.11').split(',').map(Number); man.rightTarget.copy(W(cab.buttons.start1.cap)).add(new THREE.Vector3(...so)); }
    for (let i = 0; i < 30; i++) { man.debug = i === 29; man.update(1 / 30); }
    const B = man.bones, f = v => v.toArray().map(x => x.toFixed(3)).join(',');
    console.log('ball', f(ball), 'Ltarget', f(man.leftTarget), 'Lhand', f(W(B.LeftHand)), 'Lelbow', f(W(B.LeftForeArm)), 'Lsh', f(W(B.LeftArm)));
    for (const sd of ['Left','Right']) { const h=W(B[sd+'Hand']); const m1=W(B[sd+'HandMiddle1']); const tip=W(B[sd+'HandMiddle4']||B[sd+'HandMiddle3']); const i1=W(B[sd+'HandIndex1']), p1=W(B[sd+'HandPinky1']); const th=W(B[sd+'HandThumb3']);
      console.log(sd, 'm1-h', f(m1.clone().sub(h)), 'tip-h', f(tip.clone().sub(h)), 'idx-pin', f(i1.clone().sub(p1)), 'thumb-h', f(th.sub(h))); }
    console.log('Rtarget', f(man.rightTarget), 'Rhand', f(W(B.RightHand)), 'Relbow', f(W(B.RightForeArm)), 'Rsh', f(W(B.RightArm)), 'head', f(W(B.Head)));
  } else if (mode === 'walk' || mode === 'idle') {
    man.root.position.set(0.5, 0, 1.6); man.root.rotation.y = num('ry', 0.6);
    man.setSpeed(mode === 'walk' ? 1.3 : 0);
    for (let i = 0; i < num('frames', 40); i++) man.update(1 / 30);
  }
  const dog = buildDog(); dog.root.position.set(num('dx', -0.45), 0, num('dz', 1.25));
  dog.root.rotation.y = num('dry', Math.atan2(0.35 - num('dx', -0.45), 0.3 - num('dz', 1.25)));
  scene.add(dog.root); console.log('dog clumps', dog.root.userData.clumps);
  const look = q.get('dlook') === 'man' ? W(man.bones.Head) : W(cab.bz);
  for (let i = 0; i < 60; i++) dog.update(1 / 30, look, num('excite', 0));
  const views = {
    main: '1.25,1.55,3.3,0.15,0.85,0.5',
    side: '1.25,1.25,1.0,0.25,1.05,0.95',
    left: '-0.75,1.25,1.25,0.2,1.05,0.9',
    shoulder: '0.55,1.75,1.55,0.3,1.15,0.4',
    back: '0.6,2.0,2.4,0.2,1.3,0.8',
    spalla: '0.62,2.12,2.05,0.33,1.18,0.6',
    top: '0.2,2.1,1.25,0.2,1.0,0.85',
    front: '0.2,1.35,0.0,0.2,1.15,1.1',
    dog: '-0.1,0.55,2.0,-0.45,0.22,1.25',
    dogside: '-1.2,0.5,1.5,-0.45,0.2,1.25',
    walk: '0.5,1.1,4.2,0.5,0.9,1.6',
    hands: '0.75,1.5,1.3,0.2,1.0,0.75',
    lefthand: '-0.4,1.35,1.15,0.15,1.0,0.75',
    profile: '1.35,1.15,0.98,0.2,1.05,0.98',
    prof2: '1.1,1.2,0.82,0.15,1.05,0.85',
    prof3: '-0.8,1.2,0.82,0.15,1.05,0.85',
    top2: '0.2,2.3,1.45,0.2,1.0,0.8',
    rclose: '0.62,1.12,0.78,0.22,1.02,0.8',
    lclose: '-0.25,1.12,0.78,0.15,1.03,0.8',
  };
  const v = (q.get('cam') || views[q.get('view') || 'side']).split(',').map(Number);
  camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]);
  const { composer } = createComposer(renderer, scene, camera, false);
  composer.render(); composer.render();
  console.log('ok');
})().catch(e => console.error(e.stack || e));
