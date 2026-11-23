#!/usr/bin/env python3
"""Bake the GTA-style opening (src/opening.js) into assets/opening/opening.mp4.

The browser then plays a hardware-decoded video instead of animating ~60 DOM layers while the 3D world loads.
  python3 scripts/opening_video.py [--fps 30] [--w 1920] [--h 1080]
Needs: node_modules (esbuild), python playwright + google-chrome, ffmpeg.
"""
import argparse, asyncio, base64, os, shutil, subprocess, sys, threading, http.server, functools
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('--fps', type=int, default=30); ap.add_argument('--w', type=int, default=1920); ap.add_argument('--h', type=int, default=1080)
ap.add_argument('--work', default='/tmp/opening_video'); ap.add_argument('--crf', type=int, default=28)
a = ap.parse_args()
W = a.work; shutil.rmtree(W, ignore_errors=True); os.makedirs(W + '/frames'); os.makedirs(W + '/opening'); os.makedirs(W + '/fonts')
for f in os.listdir(ROOT + '/assets/opening'):
    if f.startswith('panel-'): shutil.copy(ROOT + '/assets/opening/' + f, W + '/opening/' + f)
shutil.copy(ROOT + '/assets/fonts/anton.woff2', W + '/fonts/anton.woff2')
open(W + '/entry.js', 'w').write("import { openingCapture } from '%s/src/opening.js'; window.__cap = openingCapture();\n" % ROOT)
subprocess.run([ROOT + '/node_modules/.bin/esbuild', W + '/entry.js', '--bundle', '--format=iife', '--outfile=' + W + '/cap.js', '--log-level=warning'], check=True)
open(W + '/index.html', 'w').write('''<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Anton";src:url(fonts/anton.woff2) format("woff2")}
:root{--gta:"Anton","Impact",sans-serif;--ui:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
html,body{margin:0;background:#000;overflow:hidden} #opening .skip{display:none!important} #opening{cursor:default}
</style></head><body><div style="font:12px Anton;position:absolute;opacity:0">x</div><script src="cap.js"></script></body></html>''')

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=W))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width': a.w, 'height': a.h})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_function('window.__cap'); await pg.evaluate('window.__cap.ready()')
        T = await pg.evaluate('window.__cap.T_END'); N = int(T * a.fps) + 1
        wav = await pg.evaluate('window.__cap.audio(48000)')
        open(W + '/audio.wav', 'wb').write(base64.b64decode(wav))
        for i in range(N):
            await pg.evaluate('t => window.__cap.frame(t)', i / a.fps)
            await pg.screenshot(path=W + '/frames/%05d.jpg' % i, type='jpeg', quality=94)
            if i % 60 == 0: print('frame', i, '/', N, flush=True)
        if errs: print('page errors:', errs[:3])
        await b.close()
asyncio.run(main())
out = ROOT + '/assets/opening/opening.mp4'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(a.fps), '-i', W + '/frames/%05d.jpg', '-i', W + '/audio.wav',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', str(a.fps),
                '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], check=True)
print('wrote', out, os.path.getsize(out) // 1024, 'KB')
