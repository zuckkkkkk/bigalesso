// Builds the web version into desktop/app and the icon into desktop/build (run from desktop/: node prepare.mjs).
// Needs the root dependencies installed (npm ci in the project root).
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
console.log('desktop app ready in desktop/app');
