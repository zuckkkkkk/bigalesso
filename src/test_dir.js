import { DirectorGame } from './director.js';
const q = new URLSearchParams(location.search);
const g = new DirectorGame({}, (ev, d) => console.log('ev', ev, d ?? ''));
const out = document.getElementById('c'); const ox = out.getContext('2d'); ox.imageSmoothingEnabled = false;
const st = q.get('state') || 'attract', T = +(q.get('t') || 3);
const dt = 1 / 60;
if (st === 'demo') { g.attractT = 16.1; }
if (st === 'play' || st === 'ko' || st === 'over' || st === 'round') { g.input.start = 1; g.update(dt); g.input.start = 0; }
let n = Math.round(T / dt);
for (let i = 0; i < n; i++) {
  if (st === 'play' || st === 'round') { const b = g.f ? g.botInput() : {}; Object.assign(g.input, { up: 0, down: 0, left: 0, right: 0, fire: 0, bomb: 0 }, g.state === 'play' ? b : {}); g.demo = false; }
  if (st === 'ko' && g.f) { g.f.hp = Math.min(g.f.hp, i > 200 ? 0 : g.f.hp); }
  if (st === 'round' && g.f && g.state === 'play') g.f.timer = Math.min(g.f.timer, 1);
  g.update(dt);
}
if (q.get('ex') && g.f) { g.f.ex = { side: -1, t: 1, leave: false }; g.f.spritz = { x: 150, v: 0 }; g.f.alcol = 2; }
if (q.get('wind') && g.f) { g.f.bf.state = 'windup'; g.f.bf.attName = q.get('wind'); g.f.bf.t = 0.5; g.f.bf.fist = (q.get('wind') === 'hookL') ? -1 : 1; }
g.draw();
ox.drawImage(g.canvas, 0, 0, 960, 720);
console.log('state', g.state, 'score', g.score, g.f && JSON.stringify({ hp: g.f.hp, round: g.f.round, combo: g.f.combo, bf: g.f.bf.state }));
