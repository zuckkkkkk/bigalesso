#!/usr/bin/env python3
"""App icons (PWA + desktop) from the Anton font and the sunset palette of the opening.

  python3 scripts/make_icons.py   -> assets/icons/icon-{192,512}.png, icon-maskable-512.png, icon-1024.png

Needs Pillow + fontTools + brotli (to read assets/fonts/anton.woff2).
"""
import os, io
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'icons')
os.makedirs(OUT, exist_ok=True)

f = TTFont(os.path.join(ROOT, 'assets', 'fonts', 'anton.woff2')); f.flavor = None
buf = io.BytesIO(); f.save(buf); FONT = buf.getvalue()


def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def icon(S, pad=0.0, rounded=True):
    bg = Image.new('RGB', (S, S))
    px = bg.load()
    for y in range(S):  # vertical sunset
        t = y / (S - 1)
        c = lerp((24, 6, 40), (90, 20, 100), t * 0.9) if t < 0.6 else lerp((90, 20, 100), (255, 92, 120), (t - 0.6) / 0.4)
        for x in range(S): px[x, y] = c
    d = ImageDraw.Draw(bg)
    # sun
    r = S * 0.34; cx, cy = S / 2, S * 0.66
    sun = Image.new('L', (S, S), 0); ImageDraw.Draw(sun).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    grad = Image.new('RGB', (S, S))
    gp = grad.load()
    for y in range(S):
        c = lerp((255, 214, 90), (255, 70, 130), min(1, max(0, (y - (cy - r)) / (2 * r))))
        for x in range(S): gp[x, y] = c
    bg.paste(grad, (0, 0), sun)
    for i in range(5):  # retro sun stripes
        yy = cy + r * (0.12 + i * 0.17); h = S * (0.012 + i * 0.008)
        d.rectangle([0, yy, S, yy + h], fill=lerp((90, 20, 100), (255, 92, 120), 0.4))
    # letters
    inner = S * (1 - 2 * pad)
    font = ImageFont.truetype(io.BytesIO(FONT), int(inner * 0.56))
    txt = 'BG'
    tw = d.textlength(txt, font=font)
    x = (S - tw) / 2; y = S * 0.16 + S * pad * 0.6
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0)); ImageDraw.Draw(sh).text((x + S * 0.012, y + S * 0.02), txt, font=font, fill=(30, 4, 50, 230))
    sh = sh.filter(ImageFilter.GaussianBlur(S * 0.004))
    bg = bg.convert('RGBA'); bg.alpha_composite(sh)
    ImageDraw.Draw(bg).text((x, y), txt, font=font, fill=(255, 255, 255, 255))
    if rounded:
        m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.2), fill=255)
        bg.putalpha(m)
    return bg


for s in (192, 512, 1024):
    icon(s).save(os.path.join(OUT, f'icon-{s}.png'))
icon(512, pad=0.1, rounded=False).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('icons ->', OUT)
