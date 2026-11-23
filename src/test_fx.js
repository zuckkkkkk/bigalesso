import * as THREE from 'three';
import { createRenderer, createComposer, setupLights } from './scene.js';
import { buildRoom } from './room.js';
import { buildCabinet } from './cabinet.js';
import { createFX } from './fx3d.js';
import { loadImage, tex, canvas } from './util.js';
const q = new URLSearchParams(location.search);
(async () => {
  const el = document.getElementById('app');
  const renderer = createRenderer(el, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.03, 40);
  const lights = setupLights(scene, renderer, false);
  const tl = new THREE.TextureLoader();
  const ld = u => tl.loadAsync('../assets/' + u).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  const [side, baseSide, baseFront, marquee, title] = await Promise.all(['side.jpg', 'base_side.jpg', 'base_front.jpg', 'marquee.jpg'].map(ld).concat([loadImage('../assets/title.png')]));
  const sc = canvas(320, 240); sc.getContext('2d').drawImage(title, 0, 0, 320, 240);
  const room = buildRoom(scene, { reflections: q.get('refl') === '1', reflQuality: 0.5 });
  const cab = buildCabinet({ side, baseSide, baseFront, marquee, screen: tex(sc, { nearest: true }) });
  cab.group.position.set(0.35, 0, 0.02); scene.add(cab.group); cab.group.updateMatrixWorld(true);
  const fx = createFX(scene, camera, { lights, cab, renderer });
  const v = (q.get('cam') || '1.25,1.55,3.3,0.15,0.85,0.5').split(',').map(Number);
  camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]);
  if (q.get('fov')) { camera.fov = +q.get('fov'); camera.updateProjectionMatrix(); }
  const { composer } = createComposer(renderer, scene, camera, false);
  const which = (q.get('fx') || '').split(',');
  const T = +(q.get('t') || 1.5);
  if (which.includes('night')) fx.setNight(true);
  if (which.includes('nodust')) fx.dust(false);
  const dt = 1 / 30; let done = false;
  for (let f = 0; f < T / dt; f++) {
    const time = f * dt;
    if (!done && time >= 0.2) {
      done = true;
      if (which.includes('confetti')) fx.confetti(new THREE.Vector3(0.35, 1.3, 1.0), 300);
      if (which.includes('hearts')) fx.hearts(new THREE.Vector3(-0.3, 0.45, 1.25));
      if (which.includes('spray')) fx.spray(new THREE.Vector3(1.2, 0.9, 1.3), new THREE.Vector3(-0.6, -0.3, -0.4), 1.4);
      if (which.includes('sparkles')) fx.sparkles(new THREE.Vector3(0.35, 1.2, 1.0), 60);
      if (which.includes('coin')) fx.coin(new THREE.Vector3(0.6, 1.2, 1.4), cab.coinLights[0].getWorldPosition(new THREE.Vector3()), () => console.log('coin done'));
      if (which.includes('pulse')) fx.pulse(0xff6020, 1.2);
    }
    fx.update(dt);
  }
  composer.render(); composer.render();
  console.log('rendered calls', renderer.info.render.calls);
})().catch(e => console.error(e.stack || e));
