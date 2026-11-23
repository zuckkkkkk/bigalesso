// Build script (no Python needed).
//   node scripts/build.mjs                 -> dist/ (web deploy: index.html, app.js, man.glb, assets)
//   node scripts/build.mjs --single        -> dist/BIGALESSO-gioca.html (one file, works with double click)
//   node scripts/build.mjs --artifact      -> build-artifact/ (model as base64 man.txt, for hosts that refuse .glb)
//   OUT=/tmp/x node scripts/build.mjs      -> custom output folder
//   --compress                            -> also writes .br/.gz next to text assets + the GLB (served by server/server.mjs)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const mode = args.has('--artifact') ? 'artifact' : 'web';
const single = args.has('--single');
const compress = args.has('--compress');
const OUT = path.resolve(ROOT, process.env.OUT || (mode === 'artifact' ? 'build-artifact' : 'dist'));
const A = p => path.join(ROOT, 'assets', p);
const ASSETS = ['anims.json', 'side.jpg', 'base_side.jpg', 'base_front.jpg', 'marquee.jpg', 'title.png', 'title_clean.png', 'face.png'];

fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')], bundle: true, format: 'iife', minify: true, sourcemap: false,
  target: ['es2020'], outfile: path.join(OUT, 'app.js'), logLevel: 'warning', legalComments: 'none',
  treeShaking: true, drop: ['debugger'], pure: ['console.log', 'console.debug', 'console.info'], // perf: strip debug logging (warn/error kept)
});
let html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
const appTag = /<script[^>]*src="(\.\/)?app\.js"[^>]*>\s*<\/script>/;
if (!appTag.test(html)) throw new Error('src/index.html must contain <script src="app.js"></script>');
for (const f of ASSETS) fs.copyFileSync(A(f), path.join(OUT, f));
// newspaper + mural + prints (assets/news, made by scripts/news_assets.py) -> OUT/news/
const NEWS = fs.existsSync(A('news')) ? fs.readdirSync(A('news')).filter(f => /^(page-\d+|front|mural|mural_bump|print-[\w-]+)\.jpg$/.test(f)) : [];
fs.mkdirSync(path.join(OUT, 'news'), { recursive: true });
for (const f of NEWS) fs.copyFileSync(A('news/' + f), path.join(OUT, 'news', f));
// previous issue N.281 (assets/news281, made by scripts/news281_assets.py) -> OUT/news281/
const NEWS281 = fs.existsSync(A('news281')) ? fs.readdirSync(A('news281')).filter(f => /^(page-\d+|front|page3d)\.jpg$/.test(f)) : [];
fs.mkdirSync(path.join(OUT, 'news281'), { recursive: true });
for (const f of NEWS281) fs.copyFileSync(A('news281/' + f), path.join(OUT, 'news281', f));
// optional real models (Tripo exports) for the neighbourhood: models/index.json lists what exists (quartiere/models.js);
// artifact hosts refuse .glb -> shipped as base64 .glb.txt
{ const MD = A('models'); if (fs.existsSync(MD)) { fs.mkdirSync(path.join(OUT, 'models'), { recursive: true }); const list = [];
  for (const f of fs.readdirSync(MD).filter(f => /\.glb$/i.test(f))) { if (mode === 'artifact') { fs.writeFileSync(path.join(OUT, 'models', f + '.txt'), fs.readFileSync(path.join(MD, f)).toString('base64')); list.push(f + '.txt'); } else { fs.copyFileSync(path.join(MD, f), path.join(OUT, 'models', f)); list.push(f); } }
  fs.writeFileSync(path.join(OUT, 'models', 'index.json'), JSON.stringify({ models: list })); } }
// opening panels (assets/opening, scripts/opening_assets.py), menu font, app icons
const copyDir = (dir, re) => { if (!fs.existsSync(A(dir))) return []; const fl = fs.readdirSync(A(dir)).filter(f => re.test(f)); fs.mkdirSync(path.join(OUT, dir), { recursive: true }); for (const f of fl) fs.copyFileSync(A(dir + '/' + f), path.join(OUT, dir, f)); return fl; };
const OPENING = copyDir('opening', /^(panel|thumb)-[\w-]+\.jpg$/);
// the baked opening video (scripts/opening_video.py): web/Docker/desktop builds only (the artifact and single-file builds fall back to the DOM timeline)
const OPENING_VIDEO = mode !== 'artifact' && !single && fs.existsSync(A('opening/opening.mp4')) ? (fs.copyFileSync(A('opening/opening.mp4'), path.join(OUT, 'opening', 'opening.mp4')), true) : false;
copyDir('fonts', /^anton\.woff2$/);
const ICONS = copyDir('icons', /^icon-(192|512|maskable-512)\.png$/);
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'BIGALESSO GAMES', short_name: 'Bigalesso', description: 'Sala giochi 3D: cabinati, cane, Gulag e il Corriere delle Due Torri',
  start_url: './', scope: './', display: 'fullscreen', orientation: 'landscape', background_color: '#07030d', theme_color: '#14082e', lang: 'it',
  icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
}, null, 1));

if (mode === 'artifact') {
  fs.writeFileSync(path.join(OUT, 'man.txt'), fs.readFileSync(A('man.glb')).toString('base64'));
  html = html.replace(appTag, m => `<script>window.__MAN_FILE='./man.txt'</script>\n${m}`);
} else {
  fs.copyFileSync(A('man.glb'), path.join(OUT, 'man.glb'));
}
// app.js?v=<hash>: the server can cache it for a year, a new build changes the URL
const appHash = crypto.createHash('sha1').update(fs.readFileSync(path.join(OUT, 'app.js'))).digest('hex').slice(0, 10);
fs.writeFileSync(path.join(OUT, 'index.html'), html.replace(/src="(\.\/)?app\.js"/, 'src="app.js?v=' + appHash + '"'));

// service worker (PWA, offline after the first visit): versioned cache, the shell + intro art precached, the rest cached on first use
{
  const h = crypto.createHash('sha1');
  for (const f of ['app.js', 'index.html']) h.update(fs.readFileSync(path.join(OUT, f)));
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(OUT)) if (!/\.(br|gz)$/.test(f) && !/sw\.js$/.test(f)) { const st = fs.statSync(f); h.update(path.relative(OUT, f) + st.size); }
  const VERSION = h.digest('hex').slice(0, 12);
  const pre = ['./', 'index.html', 'app.js?v=' + appHash, 'manifest.webmanifest', 'fonts/anton.woff2', ...ICONS.map(f => 'icons/' + f), ...OPENING.filter(f => f.startsWith('panel-')).map(f => 'opening/' + f)];
  const sw = fs.readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8').replace('__VERSION__', VERSION).replace('[/*PRECACHE*/]', JSON.stringify(pre));
  fs.writeFileSync(path.join(OUT, 'sw.js'), sw);
}
if (compress) {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  let saved = 0;
  for (const f of walk(OUT)) {
    if (!/\.(js|html|json|css|svg|webmanifest|glb|txt)$/.test(f) || fs.statSync(f).size < 1024) continue;
    const buf = fs.readFileSync(f);
    const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: buf.length > 3e6 ? 9 : 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
    const gz = zlib.gzipSync(buf, { level: 9 });
    if (br.length < buf.length * 0.92) { fs.writeFileSync(f + '.br', br); saved += buf.length - br.length; }
    if (gz.length < buf.length * 0.92) fs.writeFileSync(f + '.gz', gz);
  }
  console.log(`precompressed (.br/.gz): ${(saved / 1048576).toFixed(1)} MB saved with brotli`);
}

if (single) {
  const b64 = f => fs.readFileSync(A(f)).toString('base64');
  const mime = f => f.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const data = f => `data:${mime(f)};base64,${b64(f)}`;
  const assets = {
    man: b64('man.glb'), anims: fs.readFileSync(A('anims.json'), 'utf8'),
    side: data('side.jpg'), baseSide: data('base_side.jpg'), baseFront: data('base_front.jpg'), marquee: data('marquee.jpg'),
    title: data('title.png'), titleClean: data('title_clean.png'), face: data('face.png'),
    news: Object.fromEntries(NEWS.map(f => [f, data('news/' + f)])),
    news281: Object.fromEntries(NEWS281.map(f => [f, data('news281/' + f)])),
    opening: Object.fromEntries(OPENING.filter(f => f.startsWith('panel-')).map(f => [f, data('opening/' + f)])),
  };
  const app = fs.readFileSync(path.join(OUT, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const emb = `<script>window.__ASSETS=${JSON.stringify(assets).replace(/<\//g, '<\\/')};</script>\n`;
  const font = 'data:font/woff2;base64,' + b64('fonts/anton.woff2');
  const shtml = html.replace(/<link rel="(manifest|icon|apple-touch-icon|preload)"[^>]*>\n?/g, '')
    .replace('url(fonts/anton.woff2)', () => 'url(' + font + ')')
    .replace(/url\(opening\/panel-([\w-]+)\.jpg\)/g, (m, n) => 'url(' + data('opening/panel-' + n + '.jpg') + ')')
    .replace(/<script>[^<]*serviceWorker[^<]*<\/script>\n?/, '');
  const one = shtml.replace(appTag, () => emb + '<script>' + app + '</script>');
  fs.writeFileSync(path.join(OUT, 'BIGALESSO-gioca.html'), one);
  console.log(`single file: ${path.relative(ROOT, path.join(OUT, 'BIGALESSO-gioca.html'))} (${(one.length / 1048576).toFixed(1)} MB)`);
}
console.log(`built ${mode} -> ${path.relative(ROOT, OUT) || '.'} in ${Date.now() - t0} ms`);
