import * as THREE from 'three';
import { createRenderer, createComposer, setupLights } from './scene.js';
import { buildRoom } from './room.js';
import { buildCabinet } from './cabinet.js';
import { loadImage, tex, canvas } from './util.js';
const q = new URLSearchParams(location.search);
(async () => {
  const el = document.getElementById('app');
  const renderer = createRenderer(el, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.03, 40);
  const L = setupLights(scene, renderer, false);
  const tl = new THREE.TextureLoader();
  const ld = u => tl.loadAsync('../assets/' + u).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  const [side, baseSide, baseFront, marquee, title] = await Promise.all(['side.jpg', 'base_side.jpg', 'base_front.jpg', 'marquee.jpg'].map(ld).concat([loadImage('../assets/title.png')]));
  const sc = canvas(320, 240); sc.getContext('2d').drawImage(title, 0, 0, 320, 240);
  const screenTex = tex(sc, { nearest: true });
  buildRoom(scene, { reflections: q.get('refl') !== '0', reflQuality: 0.5 });
  const cab = buildCabinet({ side, baseSide, baseFront, marquee, screen: screenTex });
  cab.group.position.set(0.35, 0, 0.02); scene.add(cab.group);
  const v = (q.get('cam') || '1.25,1.55,3.3,0.15,0.85,0.5').split(',').map(Number);
  camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]);
  if (q.get('fov')) { camera.fov = +q.get('fov'); camera.updateProjectionMatrix(); }
  const { composer } = createComposer(renderer, scene, camera, false);
  composer.render();
  composer.render();
  console.log('rendered', renderer.info.render.calls, renderer.info.render.triangles);
})().catch(e => console.error(e.stack || e));
