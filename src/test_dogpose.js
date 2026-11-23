import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Man } from './man.js';
import { buildDog } from './dog.js';
const q = new URLSearchParams(location.search);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
(async () => {
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(innerWidth, innerHeight); r.shadowMap.enabled = true; document.body.appendChild(r.domElement);
  r.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd8d4cc);
  scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888070, 1.2));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(-2, 4, 3); dl.castShadow = true; scene.add(dl);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0xe6e0d8, roughness: 0.6 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; scene.add(fl);
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.02, 30);
  const dog = buildDog(); scene.add(dog.root); dog.root.position.set(0, 0, 0);
  const mode = q.get('mode') || 'pet';
  let man = null;
  if (mode !== 'dog') {
    const [gltf, anims] = await Promise.all([new GLTFLoader().loadAsync('../assets/man.glb'), fetch('../assets/anims.json').then(r => r.json())]);
    man = new Man(gltf, anims); scene.add(man.root);
  }
  const dist = +(q.get('d') || 0.58), ang = +(q.get('a') || 0.35);
  const off = V(Math.sin(ang), 0, Math.cos(ang));
  if (man) {
    const tp = off.clone().multiplyScalar(dist); const yaw0 = Math.atan2(-tp.x, -tp.z); const rightV = V(-Math.cos(yaw0), 0, Math.sin(yaw0));
    tp.addScaledVector(rightV, -0.13); man.root.position.copy(tp); man.root.rotation.y = Math.atan2(-tp.x, -tp.z) - 0.25;
  }
  dog.observe({ pos: man ? man.root.position : V(0, 0, 1), head: V(off.x * dist, 1.0, off.z * dist), mode: 'pet' });
  const u = +(q.get('u') || 0.1), v = +(q.get('v') || 0), lean = +(q.get('lean') || 0.8), kneel = +(q.get('kneel') || 1);
  const trick = q.get('trick');
  if (trick) { dog.state.aff = 1; dog.command(trick); }
  const pose = q.get('pose'); // dog pose overrides
  if (mode === 'pet') dog.startPet();
  const dt = 1 / 30;
  for (let i = 0; i < +(q.get('n') || 60); i++) {
    if (pose) { const P = dog.state.P; const parts = pose.split(';'); for (const pp of parts) { const [k, val] = pp.split('='); dog.state.mode = 'x'; P[k] = +val; } }
    if (q.get('speed')) { dog.state.speed = +q.get('speed'); dog.state.P.stand = 1; dog.state.gait += dt * Math.PI * 2 * dog.state.speed / 0.5; }
    dog.update(dt, man ? man.bones.Head.getWorldPosition(V()) : V(0, 1, 1), 0.5);
    if (pose) { const P = dog.state.P; for (const pp of pose.split(';')) { const [k, val] = pp.split('='); P[k] = +val; } }
    if (man) {
      man.kneel = mode === 'paw' ? 1 : mode === 'throw' ? 0 : kneel; man.lean = mode === 'throw' ? 0 : mode === 'paw' ? 1.6 : lean; man.look = 1;
      let tgt;
      if (mode === 'pet') { const sp = dog.stroke(u, v, 0.6, dt); const across = dog.root.position.clone().sub(man.root.position).setY(0).normalize(); const dir = across.clone().addScaledVector(sp.normal, -across.dot(sp.normal)).normalize(); tgt = { pos: sp.point.clone().addScaledVector(sp.normal, 0.028).addScaledVector(dir, -0.07), w: 1, palm: 'down', grip: 0.1, dir, normal: sp.normal.clone().negate() }; man.lookTarget.copy(sp.point); }
      if (mode === 'paw') { const tip = dog.pawTip(); const toMan = man.root.position.clone().sub(dog.root.position).setY(0).normalize(); tgt = { pos: tip.add(V(0, -0.03, 0)).addScaledVector(toMan, 0.06), w: 1, palm: 'up', grip: 0.4 }; man.lookTarget.copy(dog.headPivot.getWorldPosition(V())); }
      if (mode === 'throw' && i === 5) man.gesture('throw');
      man.reach = { left: null, right: tgt || null };
      man.update(dt);
    }
  }
  const cv = (q.get('cam') || '0.9,0.75,0.55,0,0.3,0.25').split(',').map(Number);
  cam.position.set(cv[0], cv[1], cv[2]); cam.lookAt(cv[3], cv[4], cv[5]);
  if (man) { const B = man.bones; const f = x => x.toArray().map(v => v.toFixed(3)).join(','); console.log('hips', f(B.Hips.getWorldPosition(V())), 'shoulderR', f(B.RightArm.getWorldPosition(V())), 'handR', f(B.RightHand.getWorldPosition(V())), 'target', man.reach.right && f(man.reach.right.pos), 'head', f(B.Head.getWorldPosition(V())), 'kneeL', f(B.LeftLeg.getWorldPosition(V())), 'footL', f(B.LeftFoot.getWorldPosition(V()))); }
  r.render(scene, cam);
  window.DONE = 1;
})().catch(e => { console.error(e.stack || e); window.DONE = 1; });
