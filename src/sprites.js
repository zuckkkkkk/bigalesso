// pixel-art sprites drawn from strings
export const PAL = {
  k: '#120c1a', h: '#3a2218', H: '#6b4030', g: '#8ee03a', G: '#3f8a1e', s: '#f2c29a', S: '#c98d6a', w: '#f4f4f4',
  r: '#d8242c', R: '#8a1020', o: '#f08a2a', d: '#2a2440', D: '#17132a', y: '#ffd83a', Y: '#ff9a1a', m: '#8c8a9c',
  M: '#4a4858', n: '#2c2a36', c: '#9fe8ff', C: '#4aa8d8', p: '#8a34d0', P: '#4a1878', l: '#c8f03c', L: '#6a9a14', b: '#2a6ad8', e: '#ff4040',
};

function mk(rows, flip = false, over = null) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch === '.' || !PAL[ch]) continue; x.fillStyle = (over && over[ch]) || PAL[ch]; x.fillRect(flip ? w - 1 - i : i, j, 1, 1); } });
  return c;
}
// vertical shear by column -> pixel-friendly "tilt" (k>0: nose down). Output is padded by PAD rows top and bottom.
export const PAD = 3;
function shear(src, k) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height + PAD * 2;
  const x = c.getContext('2d');
  for (let i = 0; i < src.width; i++) { const dy = Math.round((i - src.width / 2) * k); x.drawImage(src, i, 0, 1, src.height, i, PAD + dy, 1, src.height); }
  return c;
}
function icon(rows, cols) { const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length; const x = c.getContext('2d'); rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') { x.fillStyle = cols[r[i]]; x.fillRect(i, j, 1, 1); } }); return c; }
function whiteOf(c) {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const x = o.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  return o;
}

const PLAYER_A = [
  '..................gGgGgG.......',
  '................gGgHhHhgGg.....',
  '...............gHhHhhHhHhhg....',
  '..............hHhhHhhHhhHhhh...',
  '..............hhhHhhhhhhsssh...',
  '..............hHhhhhhkkkkkkkk..',
  '..............hhhHhhskwwkkwwk..',
  '...rr.........hhHhhhskkkskkkk..',
  '..rrrRr.....rrrRhhhssssssssSs..',
  '.rroooRRrrrrrrrRRhsssssSSss....',
  'rrrrrrooooooooRRRdwrwss........',
  'rrrRrrrrrrrrrRRddwwrrdddddd....',
  '.rrRRrrrRRRRRddddddrdddddddsss.',
  '..RRrRRDDdddddddddddDDddssssss.',
  '...R..RDDddddddDDdddd...sssss..',
  '.......dDdddDDdd.........ss....',
  '.....ddddDD....................',
  '....kkddD......................',
  '....kk.........................',
];
const PLAYER_B = [
  '..................gGgGgG.......',
  '................gGgHhHhgGg.....',
  '...............gHhHhhHhHhhg....',
  '..............hHhhHhhHhhHhhh...',
  '..............hhhHhhhhhhsssh...',
  '..............hHhhhhhkkkkkkkk..',
  '..............hhhHhhskwwkkwwk..',
  '..............hhHhhhskkkskkkk..',
  '..rrr.......rrrRhhhssssssssSs..',
  '.rrrooRRrrrrrrrRRhsssssSSss....',
  'rrRrrrooooooooRRRdwrwss........',
  'rrRRrrrrrrrrrRRddwwrrdddddd....',
  '.R.RRrrrRRRRRddddddrdddddddsss.',
  '....RRRDDdddddddddddDDddssssss.',
  '......RDDddddddDDdddd...sssss..',
  '.......dDdddDDdd.........ss....',
  '.....ddddDD....................',
  '....kkddD......................',
  '....kk.........................',
];
const HELI_A = [
  '.mmmmmmmmmmmmmmmmmmmmmmmmm....',
  '............MM................',
  '........MMMMMMMMMM............',
  '......MMcccMMMMMMMMM..........',
  '....MMccccMMMMMMMMMMM.........',
  '...MMcccMMMMmMMMMMMMMMMMMMMk..',
  '...MMMMMMMMMMMMMMMMMMMMMMMkkk.',
  '....MMMMMMMMMMMMMMMMn.....kmk.',
  '.....nMMMMMMMMMMMMMn.......k..',
  '......nnnMMMMMMMnn............',
  '.......k........k.............',
  '.....kkkkkkkkkkkkkkk..........',
];
const HELI_B = HELI_A.slice(); HELI_B[0] = '.......mmmmmmmmmmmmmmm........';
const MISSILE = [
  '.....kkkkkkkkk.yy.',
  '..kkkpppppppppkYy.',
  'kkppppwwpppppppYYy',
  '..kkkPPPPPPPPPkYy.',
  '.....kkkkkkkkk.yy.',
];
const DRONE_A = [
  'mm........mm',
  '.mkkkkkkkkm.',
  '..kPPPPPPk..',
  '.kPpppppPPk.',
  'kPpprrrppPPk',
  'kPprrwrrpPPk',
  'kPpprrrppPPk',
  '.kPpppppPPk.',
  '..kPPPPPPk..',
  '...kkkkkk...',
];
const DRONE_B = DRONE_A.slice(); DRONE_B[0] = '.m........m.'; DRONE_B[5] = 'kPprrrrrpPPk';
const JET = [
  '................kk......',
  '..............kkMk......',
  '......kkkkkkkkMMMk......',
  '..kkkkMMMMMMMMMMMMkkkkYy',
  'kkcccMMMmmmmmmMMMMMMMMYY',
  '..kkkkMMMMMMMMMMMMkkkkYy',
  '......kkkkkkkkMMMk......',
  '..............kkMk......',
  '................kk......',
];
const TANK = [
  '..........kkkkkk........',
  'kkkkkkkkkkMMMMMMk.......',
  '.........kMmmmmMMk......',
  '.......kMMMMMMMMMMk.....',
  '...kkkkkkkkkkkkkkkkkk...',
  '..kLLLLLLLLLLLLLLLLLLk..',
  '.kLlllllllllllllllllLLk.',
  '.kLLLLLLLLLLLLLLLLLLLLk.',
  '.kkMkkMkkMkkMkkMkkMkkk..',
  '..kkkkkkkkkkkkkkkkkkk...',
];
const ROCKET = [
  '....k....',
  '...kpk...',
  '..kpppk..',
  '..kpwPk..',
  '..kpppk..',
  '..kpppk..',
  '..kpPpk..',
  '..kpppk..',
  '.kkpppkk.',
  'kyykpkyyk',
  'kyk...kyk',
];
const BOSS = [
  '.mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm.........',
  '...........................MM.................................',
  '.....................MMMMMMMMMMMMMMMMMM.......................',
  '................MMMMMMMMMMMMMMMMMMMMMMMMMMM...................',
  '............MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM................',
  '.........MMMMcccccMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM.............',
  '.......MMMMccccccMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMkk',
  '.....MMMMcccccccMMMMMMMMmmmmmmmmmmmmmmmmMMMMMMMMMMMMMMMMMMMkkk',
  '....MMMMMcccccMMMMMMMMlllllllllllllllllllllllMMMMMMMMMMMMMMkmk',
  '...MMMMMMMpppppppppppppppppppppppppppppppppppMMMMMMMMMMM...kmmk',
  '...MMMMMMMMMMMMMMMMMrrrrrrMMMMMMMMMMMMMMMMMMMMMMn.........kkk.',
  '....MMMMMMMMMMMMMMMrrRRrrMMMMMMMMMMMMMMMMMMMMMn...............',
  '.....nMMMMMMMMMMMMMMMrrMMMMMMMMMMMMMMMMMMMMMn.................',
  '......nnMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMnnn..................',
  '..kkkkkkkkMMMMMMMMMMMMMMMMMMMMMMMMMMMMMn......................',
  'kkMMMMMMMMkk.nnnnnnnnnnnnnnnnnnnnnnnnn........................',
  '..kkkkkkkkk....k..........k....kkkkkkkkkk.....................',
  '...............k..........k...kMMMMMMMMMMkk...................',
  '.........kkkkkkkkkkkkkkkkkkkkkk.kkkkkkkkkk....................',
];
const BOSS_B = BOSS.slice(); BOSS_B[0] = '..........mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm.....................';

export function buildSprites() {
  const S = {};
  const add = (name, rows, flip) => { S[name] = mk(rows, flip); S[name + '_w'] = whiteOf(S[name]); };
  // players: P1 (red cape, green laurel) and P2 palette swap (blue cape, purple laurel); each with level/up/down tilt variants, padded by PAD
  const P2 = { r: '#2a6ad8', R: '#183a8a', o: '#5ad0ff', g: '#c070ff', G: '#6a2aa0' };
  for (const [base, over] of [['player', null], ['p2', P2]]) {
    for (const [fr, rows] of [['A', PLAYER_A], ['B', PLAYER_B]]) {
      const c = mk(rows, false, over);
      S[base + fr] = shear(c, 0); S[base + fr + '_up'] = shear(c, -0.11); S[base + fr + '_dn'] = shear(c, 0.11);
      S[base + fr + '_w'] = whiteOf(S[base + fr]);
    }
  }
  S.heart = icon(['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'], { r: '#ff5060' });
  S.bombIco = icon(['...y.', '..ky.', '.kkk.', 'kkwkk', 'kkkkk', '.kkk.'], { k: '#ff9a1a', y: '#fff4a0', w: '#fff' });
  add('heliA', HELI_A); add('heliB', HELI_B);
  add('missile', MISSILE); add('droneA', DRONE_A); add('droneB', DRONE_B);
  add('jet', JET); add('tank', TANK); add('rocket', ROCKET);
  add('bossA', BOSS); add('bossB', BOSS_B);
  for (const n of ['bossA', 'bossB']) { const c = document.createElement('canvas'); c.width = S[n].width; c.height = S[n].height; const x = c.getContext('2d'); x.drawImage(S[n], 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,30,40,0.38)'; x.fillRect(0, 0, c.width, c.height); S[n + '_r'] = c; }
  // powerups
  const pu = (letter, col, dark) => {
    const c = document.createElement('canvas'); c.width = 11; c.height = 11; const x = c.getContext('2d');
    x.fillStyle = '#120c1a'; x.fillRect(1, 0, 9, 11); x.fillRect(0, 1, 11, 9);
    x.fillStyle = dark; x.fillRect(1, 1, 9, 9); x.fillStyle = col; x.fillRect(2, 1, 7, 8); x.fillStyle = '#fff'; x.fillRect(2, 1, 3, 1);
    return c;
  };
  S.puL = pu('L', '#8ee03a', '#3f8a1e'); S.puB = pu('B', '#ff9a1a', '#a04010'); S.puH = pu('H', '#ff5060', '#8a1020');
  return S;
}

// ---------- backgrounds ----------
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function bandSky(x, w, h, cols) {
  // dithered vertical bands
  const n = cols.length - 1;
  for (let y = 0; y < h; y++) {
    const t = y / h * n, i = Math.min(n - 1, Math.floor(t)), f = t - i;
    for (let xx = 0; xx < w; xx += 2) {
      const d = ((xx >> 1) + y) % 2 ? 0.25 : -0.25;
      x.fillStyle = (f + d * 0.4) > 0.5 ? cols[i + 1] : cols[i];
      x.fillRect(xx, y, 2, 1);
    }
  }
}
function mushroom(x, cx, base, size, cols) {
  // stem
  for (let i = 0; i < size * 1.6; i++) { const w = size * 0.18 + Math.sin(i * 0.5) * 1.5 + (i > size * 1.3 ? (i - size * 1.3) * 0.8 : 0); x.fillStyle = i % 3 ? cols[1] : cols[2]; x.fillRect(Math.round(cx - w / 2), base - i, Math.round(w), 1); }
  // cap
  const top = base - size * 1.6;
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI, r = size * (0.32 + 0.12 * Math.sin(k * 2.7));
    const px = cx + Math.cos(a) * size * 0.75, py = top - Math.sin(a) * size * 0.35;
    x.fillStyle = cols[k % 3]; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  x.fillStyle = cols[0]; x.beginPath(); x.ellipse(cx, top - size * 0.2, size * 0.7, size * 0.38, 0, 0, 7); x.fill();
  x.fillStyle = cols[3]; x.beginPath(); x.ellipse(cx, top - size * 0.05, size * 0.45, size * 0.18, 0, 0, 7); x.fill();
  // ring
  x.fillStyle = cols[1]; x.fillRect(cx - size * 0.45, base - size * 0.9, size * 0.9, 2);
}
function colosseum(x, cx, base, w, h, lit, dark) {
  // curved silhouette: taller on the left, broken on the right like the real one
  const tiers = 4, th = h / tiers, aw = 8;
  for (let xx = 0; xx < w; xx++) {
    const k = xx / w;
    let top = base - h + Math.round(k * k * h * 0.35);
    if (k > 0.62) top = base - h * (0.62 + 0.25 * Math.sin(xx * 0.9)) + Math.round(k * k * h * 0.2);
    for (let y = top; y < base; y++) {
      const tier = Math.floor((base - y) / th), ty = (base - y) % th;
      const ax = (xx + tier * 3) % aw;
      const inArch = ax >= 2 && ax <= 6 && ty > 1 && ty < th - 2 - (ax === 2 || ax === 6 ? 1 : 0);
      let c;
      if (inArch) c = tier === 0 ? '#1a0626' : (ax === 2 ? '#5a1e10' : '#2a0a24');
      else if (ty <= 1) c = k < 0.5 ? '#ffd070' : lit;
      else c = (xx % aw === 0) ? '#8a4210' : (k < 0.35 ? lit : (k < 0.7 ? '#c87420' : '#9a5014'));
      x.fillStyle = c; x.fillRect(cx + xx, y, 1, 1);
    }
  }
}
function cypress(x, cx, base, h, col) { x.fillStyle = col; for (let i = 0; i < h; i++) { const w = Math.max(1, Math.round(Math.sin((i / h) * Math.PI) * 5 + (i < h * 0.2 ? 1 : 0))); x.fillRect(cx - w, base - i, w * 2, 1); } }
function aqueduct(x, x0, base, len, h, col, hole) {
  x.fillStyle = col; x.fillRect(x0, base - h, len, h);
  for (let i = 0; i + 14 <= len; i += 16) { x.fillStyle = hole; x.fillRect(x0 + i + 4, base - h + 9, 10, h - 9); x.beginPath(); x.arc(x0 + i + 9, base - h + 9, 5, Math.PI, 0); x.fill(); }
}

export const STAGES = [
  { name: 'ROMA', sky: ['#14082e', '#2a0e4e', '#4a1878', '#7a2a9a', '#b8409a', '#e06a7a'], far: '#3a1466', mid: '#22093e', lit: '#e0962a', ground: '#160822', accent: '#c8f03c' },
  { name: 'VIA APPIA', sky: ['#0c0e30', '#22205a', '#4a2a7a', '#8a3a8a', '#d0607a', '#f6a04a'], far: '#4a2060', mid: '#1c0a30', lit: '#f0b040', ground: '#140a1c', accent: '#8ee03a' },
  { name: 'APOCALISSE', sky: ['#1a0408', '#3a0a14', '#6a1222', '#a8202a', '#e0502a', '#ffb03a'], far: '#4a0c1a', mid: '#200510', lit: '#ffc040', ground: '#12050a', accent: '#ff9a1a' },
];

export function buildBackgrounds(stage) {
  const st = STAGES[stage];
  const sky = cv(320, 200); bandSky(sky.getContext('2d'), 320, 200, st.sky);
  const sx = sky.getContext('2d');
  for (let i = 0; i < 60; i++) { sx.fillStyle = i % 5 ? 'rgba(255,255,255,0.5)' : '#fff'; sx.fillRect((i * 97) % 320, (i * 53) % 90, 1, 1); }
  const far = cv(640, 200), fx = far.getContext('2d');
  const mcols = stage === 2 ? ['#ffb03a', '#ff6a1a', '#d02a1a', '#fff0a0'] : ['#ffc040', '#ff8a2a', '#d0402a', '#fff2a8'];
  fx.globalAlpha = 0.9; mushroom(fx, 200, 150, 24, mcols); fx.globalAlpha = 1;
  for (let i = 0; i < 14; i++) { const cy = 30 + (i * 37) % 80, cxx = (i * 131) % 640, cw = 30 + (i * 17) % 50; fx.fillStyle = i % 3 ? 'rgba(160,60,200,0.35)' : 'rgba(230,90,200,0.3)'; fx.fillRect(cxx, cy, cw, 3); fx.fillRect(cxx + 8, cy - 2, cw - 16, 2); }
  if (stage === 2) { mushroom(fx, 470, 158, 18, mcols); mushroom(fx, 590, 165, 11, mcols); }
  else if (stage === 1) mushroom(fx, 520, 168, 12, mcols);
  fx.fillStyle = st.far;
  for (let xx = 0; xx < 640; xx++) { const hh = 150 + Math.sin(xx * 0.02) * 10 + Math.sin(xx * 0.07) * 4; fx.fillRect(xx, hh, 1, 200 - hh); }
  const mid = cv(640, 200), mx = mid.getContext('2d');
  if (stage === 0) {
    colosseum(mx, 30, 200, 160, 62, st.lit, '#5a2a10');
    for (let i = 0; i < 6; i++) { mx.fillStyle = st.mid; mx.fillRect(250 + i * 12, 200 - 30 - (i % 3) * 8, 6, 40); mx.fillStyle = st.lit; mx.fillRect(250 + i * 12, 200 - 30 - (i % 3) * 8, 1, 40); }
    for (let i = 0; i < 9; i++) cypress(mx, 360 + i * 30 + (i % 2) * 7, 200, 30 + (i * 7) % 16, st.mid);
    mx.fillStyle = st.mid; mx.fillRect(560, 160, 70, 40); mx.beginPath(); mx.arc(595, 160, 26, Math.PI, 0); mx.fill(); mx.fillRect(592, 126, 6, 10);
  } else if (stage === 1) {
    aqueduct(mx, 0, 196, 380, 46, st.mid, '#3a1a50');
    for (let i = 0; i < 12; i++) cypress(mx, 400 + i * 20 + (i % 3) * 4, 200, 26 + (i * 11) % 22, st.mid);
    mx.fillStyle = st.lit; for (let i = 0; i < 380; i += 16) mx.fillRect(i, 150, 14, 1);
  } else {
    for (let i = 0; i < 16; i++) { const h = 20 + (i * 37) % 40, w = 18 + (i * 13) % 20, x0 = i * 40; mx.fillStyle = st.mid; mx.fillRect(x0, 200 - h, w, h); for (let k = 0; k < 4; k++) { mx.fillStyle = (i + k) % 2 ? '#ff6a1a' : '#ffc040'; mx.fillRect(x0 + 3 + (k * 5) % (w - 4), 200 - h + 5 + k * 6, 2, 3); } }
    colosseum(mx, 300, 200, 120, 44, '#d0602a', '#3a0a10');
  }
  // soft pixel clouds (parallax layer between far and mid)
  const clouds = cv(640, 80), cx2 = clouds.getContext('2d');
  const ccol = stage === 2 ? ['rgba(120,30,40,0.55)', 'rgba(255,140,60,0.35)'] : stage === 1 ? ['rgba(90,50,120,0.5)', 'rgba(255,170,120,0.35)'] : ['rgba(90,40,140,0.5)', 'rgba(240,120,210,0.35)'];
  for (let i = 0; i < 7; i++) {
    const x0 = i * 92 + (i * 37) % 30, y0 = 18 + (i * 29) % 44, w = 40 + (i * 23) % 40;
    for (let k = 0; k < 6; k++) { const bx = x0 + k * (w / 6), by = y0 - Math.round(Math.sin(k / 5 * Math.PI) * 7); cx2.fillStyle = ccol[0]; cx2.fillRect(Math.round(bx), by, Math.round(w / 4), 9); }
    cx2.fillStyle = ccol[1]; cx2.fillRect(x0 + 4, y0 - 6, w - 10, 2);
  }
  return { sky, far, mid, clouds, st };
}
