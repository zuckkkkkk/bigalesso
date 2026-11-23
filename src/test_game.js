import { Game } from './game.js';
import { Audio, TRACKS } from './audio.js';
const q = new URLSearchParams(location.search);
const ld = u => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = u; });
(async () => {
  const [title, titleClean, face] = await Promise.all(['title.png', 'title_clean.png', 'face.png'].map(f => ld('../assets/' + f)));
  const evs = {};
  const g = new Game({ title, titleClean, face }, (ev, d) => { evs[ev] = (evs[ev] || 0) + 1; });
  window.G = g; window.A = new Audio(); window.T = TRACKS;
  const out = document.getElementById('c'); const ox = out.getContext('2d'); ox.imageSmoothingEnabled = false;
  const st = q.get('state') || 'attract'; const t = +(q.get('t') || 0);
  const god = q.get('god') === '1', nobot = q.get('nobot') === '1';
  g.debugJump(st);
  if (q.get('bosshp') && g.boss) g.boss.hp = +q.get('bosshp');
  const steps = Math.round(t * 60);
  let bombed = false;
  const bot = (p, inp, tt, ph) => {
    inp.fire = 1;
    const ty = 110 + Math.sin(tt * 0.9 + ph) * 70;
    inp.up = p.y > ty + 4 ? 1 : 0; inp.down = p.y < ty - 4 ? 1 : 0;
    inp.right = p.x < 70 ? 1 : 0; inp.left = p.x > 90 ? 1 : 0;
    if (god) p.shield = Math.max(p.shield, 0.8);
  };
  for (let i = 0; i < steps; i++) {
    const tt = i / 60;
    if (!nobot && g.players.length) { bot(g.players[0], g.input, tt, 0); if (g.players[1]) bot(g.players[1], g.input2, tt, 2.5); }
    g.input.bomb = (q.get('bomb') && !bombed && tt > +q.get('bomb')) ? 1 : 0; if (g.input.bomb) bombed = true;
    if (q.get('join') && Math.abs(tt - +q.get('join')) < 0.02) g.input2.start = 1; else g.input2.start = 0;
    if (q.get('press') && Math.abs(tt - +q.get('press')) < 0.02) g.input.start = 1; else if (q.get('press')) g.input.start = 0;
    g.update(1 / 60);
  }
  if (q.get('audiotest')) { const A = window.A; A.init(); for (const n of ['shoot','hit','eshot','explode','bomb','power','life','die','start','coin','warning','missile','bossdie','clear','gameover','step','click','buzz','crt','button','stick','woof','type','ding','carriage','spray','sea','switch','coinDrop','pickup','pet','whoosh','bark2','paper','dance','join2','combo','nonexistent']) A.sfx(n, 1); for (const k of ['game','boss','title','dance','ending']) { A.play(TRACKS[k]); await new Promise(r => setTimeout(r, 250)); } A.setMuted(true); A.setHum(1); A.stop(); console.log('audio ok', A.ctx.state, A.step); }
  g.draw();
  ox.drawImage(g.canvas, 0, 0, 960, 720);
  console.log('state', g.state, 'players', g.players.length, 'active', g.activePlayers, g.players.map(p => p.score + '/' + p.lives + '/' + p.state).join(' '), 'en', g.en.length, 'stageT', (g.stageT || 0).toFixed(1), JSON.stringify(evs));
})().catch(e => console.error('ERR', e.stack || e));
