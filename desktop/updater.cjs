// Game updates from the server (desktop app). The installer ships a full copy of the game (desktop/app, with
// update.json = sha256 + size of every file, written by scripts/build.mjs). At every start the app asks the server for
// its update.json: if the server's build is newer, it downloads ONLY the files whose hash differs from the copy it
// already has, checks each hash, and switches to the new version atomically (a half-finished download is never used).
// Offline or server down → the last good version. A newer installer (bundled build newer than the downloaded one)
// always wins. The renderer is sandboxed like a browser tab, so the server is trusted exactly as the website is.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = function createUpdater({ app, net, ROOT, SERVER, SHELL }) {
  const BASE = path.join(app.getPath('userData'), 'game');
  const ACTIVE = path.join(BASE, 'active.json');
  const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const bundled = readJSON(path.join(ROOT, 'update.json')) || { version: '?', build: 0, files: {} };
  let active = readJSON(ACTIVE);
  if (active && (!active.dir || !active.files || !fs.existsSync(path.join(BASE, active.dir)) || !(active.build > bundled.build))) active = null;

  // file to serve for a path inside the game (rel uses '/', no leading slash, already checked for '..')
  function resolve(rel) {
    if (active) {
      const a = active.files[rel], b = bundled.files[rel];
      if (a && (!b || b.h !== a.h)) return path.join(BASE, active.dir, rel);
      if (!a && !b) return path.join(ROOT, rel);
    }
    return path.join(ROOT, rel);
  }

  let abort = false;
  async function check(onProgress) {
    if (!SERVER) return { updated: false, reason: 'no-server' };
    let remote = null;
    try {
      const r = await net.fetch(SERVER + '/update.json?t=' + Date.now(), { signal: AbortSignal.timeout(4000), cache: 'no-store' });
      if (r.ok) remote = await r.json();
    } catch (e) { return { updated: false, reason: 'offline' }; }
    const have = active || bundled;
    if (!remote || !remote.files || !(remote.build > have.build)) return { updated: false, reason: 'current', version: have.version };
    if ((remote.shell || 1) > SHELL) return { updated: false, reason: 'shell', version: remote.version };
    const need = Object.entries(remote.files).filter(([rel, f]) => !rel.includes('..') && !path.isAbsolute(rel) && (!bundled.files[rel] || bundled.files[rel].h !== f.h));
    const dir = 'v' + remote.build, tmp = path.join(BASE, dir + '.part'), final = path.join(BASE, dir);
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    const total = need.reduce((a, [, f]) => a + f.s, 0) || 1; let done = 0;
    onProgress && onProgress(0, remote.version, total);
    try {
      for (const [rel, f] of need) {
        if (abort) throw new Error('skipped');
        const dst = path.join(tmp, rel); fs.mkdirSync(path.dirname(dst), { recursive: true });
        const prev = active && active.files[rel] && active.files[rel].h === f.h ? path.join(BASE, active.dir, rel) : null;
        if (prev && fs.existsSync(prev)) fs.copyFileSync(prev, dst); // already downloaded last time
        else {
          const url = SERVER + '/' + rel.split('/').map(encodeURIComponent).join('/') + '?h=' + f.h.slice(0, 12);
          const r = await net.fetch(url, { signal: AbortSignal.timeout(120000) });
          if (!r.ok) throw new Error(rel + ' ' + r.status);
          const buf = Buffer.from(await r.arrayBuffer());
          if (crypto.createHash('sha256').update(buf).digest('hex') !== f.h) throw new Error('hash ' + rel);
          fs.writeFileSync(dst, buf);
        }
        done += f.s; onProgress && onProgress(done / total, remote.version, total);
      }
      fs.rmSync(final, { recursive: true, force: true }); fs.renameSync(tmp, final);
      const old = active && active.dir;
      active = { version: remote.version, build: remote.build, dir, files: remote.files };
      fs.writeFileSync(ACTIVE + '.tmp', JSON.stringify(active)); fs.renameSync(ACTIVE + '.tmp', ACTIVE);
      if (old && old !== dir) fs.rmSync(path.join(BASE, old), { recursive: true, force: true });
      return { updated: true, version: remote.version, bytes: need.reduce((a, [, f]) => a + f.s, 0) };
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      return { updated: false, reason: e.message === 'skipped' ? 'skipped' : 'error', error: e.message };
    }
  }
  return {
    resolve, check, skip() { abort = true; },
    info: () => ({ bundled: { version: bundled.version, build: bundled.build }, active: active ? { version: active.version, build: active.build } : null }),
  };
};
