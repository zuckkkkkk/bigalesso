// Dev server with watch + live reload: npm run dev  (http://localhost:5173)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = path.join(ROOT, '.dev');
const PORT = +(process.env.PORT || 5173);
fs.mkdirSync(DEV, { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) fs.copyFileSync(path.join(ROOT, 'assets', f), path.join(DEV, f));
const writeHtml = () => {
  const html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8')
    .replace('</body>', `<script>new EventSource('/esbuild').addEventListener('change', () => location.reload())</script>\n</body>`);
  fs.writeFileSync(path.join(DEV, 'index.html'), html);
};
writeHtml();
fs.watch(path.join(ROOT, 'src/index.html'), writeHtml);
const ctx = await esbuild.context({
  entryPoints: [path.join(ROOT, 'src/main.js')], bundle: true, format: 'iife', sourcemap: true,
  outfile: path.join(DEV, 'app.js'), logLevel: 'info',
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: DEV, port: PORT, host: '0.0.0.0' });
console.log(`\n  BIGALESSO dev server: http://localhost:${port}\n`);
