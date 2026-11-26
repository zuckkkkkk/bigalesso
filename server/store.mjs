// BIGALESSO · persistence: player profiles (save blobs), leaderboards.
// SQLite (node:sqlite, built into Node 22, no npm dependency) in DATA_DIR (default /data — mount a volume there so
// saves survive redeploys). If node:sqlite is unavailable, an atomic JSON file store is used instead (same API).
// Tokens are never stored: only their SHA-256 hash.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || '/data');
const BOARD_KEEP = 200; // entries kept per board

export const hashToken = t => crypto.createHash('sha256').update('bigalesso:' + t).digest('hex');

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.accessSync(DATA_DIR, fs.constants.W_OK); return true; } catch { return false; }
}

// ---------------------------------------------------------------- SQLite
async function sqliteStore(file) {
  // silence the one-time "SQLite is an experimental feature" warning (noise in the deploy logs)
  const emit = process.emitWarning;
  process.emitWarning = function (w, ...a) { if (String(w && w.message || w).includes('SQLite')) return; return emit.call(process, w, ...a); };
  let mod; try { mod = await import('node:sqlite'); } finally { process.emitWarning = emit; }
  const db = new mod.DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=2000;
    CREATE TABLE IF NOT EXISTS profiles (th TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL, created INTEGER NOT NULL, size INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS boards (board TEXT NOT NULL, th TEXT NOT NULL, name TEXT NOT NULL, score REAL NOT NULL, meta TEXT, verified INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (board, th));
    CREATE INDEX IF NOT EXISTS boards_score ON boards (board, score);
    CREATE TABLE IF NOT EXISTS board_meta (board TEXT PRIMARY KEY, lower INTEGER NOT NULL);`);
  const q = {
    getP: db.prepare('SELECT data, version, updated FROM profiles WHERE th = ?'),
    putP: db.prepare('INSERT INTO profiles (th, data, version, updated, created, size) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(th) DO UPDATE SET data = excluded.data, version = excluded.version, updated = excluded.updated, size = excluded.size'),
    getMeta: db.prepare('SELECT lower FROM board_meta WHERE board = ?'),
    putMeta: db.prepare('INSERT OR IGNORE INTO board_meta (board, lower) VALUES (?, ?)'),
    getEntry: db.prepare('SELECT score, verified FROM boards WHERE board = ? AND th = ?'),
    putEntry: db.prepare('INSERT INTO boards (board, th, name, score, meta, verified, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(board, th) DO UPDATE SET name = excluded.name, score = excluded.score, meta = excluded.meta, verified = excluded.verified, at = excluded.at'),
    topAsc: db.prepare('SELECT name, score, meta, verified, at FROM boards WHERE board = ? ORDER BY score ASC, at ASC LIMIT ?'),
    topDesc: db.prepare('SELECT name, score, meta, verified, at FROM boards WHERE board = ? ORDER BY score DESC, at ASC LIMIT ?'),
    rankAsc: db.prepare('SELECT COUNT(*) AS n FROM boards WHERE board = ? AND score < ?'),
    rankDesc: db.prepare('SELECT COUNT(*) AS n FROM boards WHERE board = ? AND score > ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM boards WHERE board = ?'),
    pruneAsc: db.prepare('DELETE FROM boards WHERE board = ? AND rowid IN (SELECT rowid FROM boards WHERE board = ? ORDER BY score ASC, at ASC LIMIT -1 OFFSET ?)'),
    pruneDesc: db.prepare('DELETE FROM boards WHERE board = ? AND rowid IN (SELECT rowid FROM boards WHERE board = ? ORDER BY score DESC, at ASC LIMIT -1 OFFSET ?)'),
    nProfiles: db.prepare('SELECT COUNT(*) AS n FROM profiles'),
  };
  const lowerOf = (board, lower) => { q.putMeta.run(board, lower ? 1 : 0); const r = q.getMeta.get(board); return !!(r && r.lower); };
  return {
    kind: 'sqlite', file,
    getProfile(th) { const r = q.getP.get(th); return r ? { data: r.data, version: r.version, updated: r.updated } : null; },
    putProfile(th, data, version, now) { q.putP.run(th, data, version, now, now, data.length); },
    submit(board, th, name, score, meta, verified, lower) {
      const lo = lowerOf(board, lower), now = Date.now();
      const cur = q.getEntry.get(board, th);
      const better = !cur || (lo ? score < cur.score : score > cur.score) || (verified && !cur.verified && score === cur.score);
      if (better) q.putEntry.run(board, th, name, score, meta, verified ? 1 : 0, now);
      if ((q.count.get(board).n | 0) > BOARD_KEEP + 20) (lo ? q.pruneAsc : q.pruneDesc).run(board, board, BOARD_KEEP);
      const best = better ? score : cur.score;
      const rank = (lo ? q.rankAsc : q.rankDesc).get(board, best).n + 1;
      return { best, rank, improved: better, lower: lo };
    },
    top(board, n) {
      const m = q.getMeta.get(board); const lo = !!(m && m.lower);
      return { lower: lo, rows: (lo ? q.topAsc : q.topDesc).all(board, n).map(r => ({ name: r.name, score: r.score, meta: r.meta ? JSON.parse(r.meta) : null, verified: !!r.verified, at: r.at })) };
    },
    stats() { return { kind: 'sqlite', profiles: q.nProfiles.get().n }; },
    close() { try { db.close(); } catch { } },
  };
}

// ---------------------------------------------------------------- JSON fallback (atomic writes, debounced)
function jsonStore(file) {
  let D = { profiles: {}, boards: {}, meta: {} };
  try { D = { ...D, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { }
  let t = null;
  const flush = () => { t = null; try { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(D)); fs.renameSync(tmp, file); } catch { } };
  const save = () => { if (!t) t = setTimeout(flush, 1500); };
  const lowerOf = (board, lower) => { if (!(board in D.meta)) D.meta[board] = !!lower; return D.meta[board]; };
  const sorted = (board, lo) => Object.entries(D.boards[board] || {}).sort((a, b) => (lo ? a[1].score - b[1].score : b[1].score - a[1].score) || a[1].at - b[1].at);
  return {
    kind: 'json', file,
    getProfile(th) { const p = D.profiles[th]; return p ? { data: p.data, version: p.version, updated: p.updated } : null; },
    putProfile(th, data, version, now) { D.profiles[th] = { data, version, updated: now }; save(); },
    submit(board, th, name, score, meta, verified, lower) {
      const lo = lowerOf(board, lower), B = (D.boards[board] ||= {}), cur = B[th];
      const better = !cur || (lo ? score < cur.score : score > cur.score) || (verified && !cur.verified && score === cur.score);
      if (better) B[th] = { name, score, meta, verified: !!verified, at: Date.now() };
      const all = sorted(board, lo);
      if (all.length > BOARD_KEEP + 20) for (const [k] of all.slice(BOARD_KEEP)) delete B[k];
      const best = better ? score : cur.score;
      const rank = all.filter(([, e]) => lo ? e.score < best : e.score > best).length + 1;
      save();
      return { best, rank, improved: better, lower: lo };
    },
    top(board, n) { const lo = !!D.meta[board]; return { lower: lo, rows: sorted(board, lo).slice(0, n).map(([, e]) => ({ name: e.name, score: e.score, meta: e.meta ? JSON.parse(e.meta) : null, verified: e.verified, at: e.at })) }; },
    stats() { return { kind: 'json', profiles: Object.keys(D.profiles).length }; },
    close() { if (t) { clearTimeout(t); flush(); } },
  };
}

// memory only (no writable DATA_DIR): still works, nothing survives a restart
function memStore() { const s = jsonStore('/dev/null'); s.kind = 'memory'; return s; }

export async function openStore(log = () => { }) {
  if (!ensureDir()) { log('store: DATA_DIR non scrivibile (' + DATA_DIR + '), salvataggi solo in memoria'); return memStore(); }
  if (process.env.STORE !== 'json') {
    try { const s = await sqliteStore(path.join(DATA_DIR, 'bigalesso.db')); log('store: sqlite', s.file); return s; }
    catch (e) { log('store: sqlite non disponibile (' + (e && e.code || e && e.message || e) + '), uso JSON'); }
  }
  const s = jsonStore(path.join(DATA_DIR, 'bigalesso.json')); log('store: json', s.file); return s;
}
