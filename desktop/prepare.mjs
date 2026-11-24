// Builds the web version into desktop/app and the icon into desktop/build (run from desktop/: node prepare.mjs).
// Needs the root dependencies installed (npm ci in the project root).
// BIGALESSO_SERVER=https://your-domain at build time bakes the online server into the app (config.build.json).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
fs.rmSync(path.join(HERE, 'app'), { recursive: true, force: true });
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { stdio: 'inherit', env: { ...process.env, OUT: path.join(HERE, 'app') } });
fs.mkdirSync(path.join(HERE, 'build'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'assets', 'icons', 'icon-1024.png'), path.join(HERE, 'build', 'icon.png'));
// the game version (root package.json) becomes the app version, so the installer and "About" match the game
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const pkgFile = path.join(HERE, 'package.json'), pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
if (ver && /^\d+\.\d+\.\d+/.test(ver) && pkg.version !== ver) { pkg.version = ver; fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n'); }
const server = String(process.env.BIGALESSO_SERVER || '').trim().replace(/\/+$/, '');
const cfgFile = path.join(HERE, 'config.build.json');
if (/^https?:\/\/[^\s]+$/.test(server)) fs.writeFileSync(cfgFile, JSON.stringify({ server }, null, 2) + '\n');
else fs.rmSync(cfgFile, { force: true });
console.log('desktop app ready in desktop/app' + (fs.existsSync(cfgFile) ? ' (server ' + server + ')' : ' (offline: no BIGALESSO_SERVER)'));
