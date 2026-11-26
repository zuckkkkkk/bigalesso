// lazymatrix.js — cheaper scene.updateMatrixWorld() for a world that is mostly static.
// three.js recomposes the local matrix of EVERY object with matrixAutoUpdate each frame and then multiplies its
// world matrix (and forces all its children to do the same): ~7000 objects here, most of which never move.
// Each object gets an own updateMatrix() that first compares position/quaternion/scale with the values of the
// last compose: unchanged -> nothing to do (no compose, no world multiply, children not forced). Anything that
// moves (code, AnimationMixer, physics) changes those values and is recomposed in the same frame as before, so
// behaviour is identical; only the work for still objects disappears (a re-parented object is recomposed too). New objects are patched every couple of
// seconds (until then they use the stock method). Opt out with ?nolazy.
import * as THREE from 'three';

const stock = THREE.Object3D.prototype.updateMatrix;
function lazyUpdateMatrix() {
  const p = this.position, q = this.quaternion, s = this.scale, c = this.__trs;
  if (this.parent === this.__par && p.x === c[0] && p.y === c[1] && p.z === c[2] && q.x === c[3] && q.y === c[4] && q.z === c[5] && q.w === c[6] && s.x === c[7] && s.y === c[8] && s.z === c[9]) return;
  this.__par = this.parent; c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q.x; c[4] = q.y; c[5] = q.z; c[6] = q.w; c[7] = s.x; c[8] = s.y; c[9] = s.z;
  this.matrix.compose(p, q, s);
  this.matrixWorldNeedsUpdate = true;
}

export function installLazyMatrix({ scene, every = 2, on = true }) {
  let acc = every, patched = 0;
  function patch(o) {
    if (o.updateMatrix !== stock) return; // already patched, or a class with its own updateMatrix
    o.__trs = [NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN]; o.__par = undefined;
    o.updateMatrix = lazyUpdateMatrix; patched++;
  }
  function update(dt) { if (!on) return; acc += dt; if (acc < every) return; acc = 0; scene.traverse(patch); }
  const api = { update, enable() { on = true; acc = every; }, get on() { return on; }, get patched() { return patched; } };
  window.__lazyMatrix = api;
  return api;
}
