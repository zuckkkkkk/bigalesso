#!/usr/bin/env python3
"""Offline: turns Corriere illustrations into GTA-loading-screen style key art.

  python3 scripts/opening_assets.py        -> assets/opening/panel-*.jpg (+ thumbs)

Look: cel-shaded posterization, ink outlines, halftone shadows, warm sunset grade.
Only uses images already published in the Corriere (assets/news*).
"""
import os, sys, json
import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'opening')
W, H = 1280, 720

# id, source, focus (x,y in 0..1), sunset palette
PANELS = [
    ('portici',  'assets/news/x-000.jpg', (0.45, 0.45), 'dusk'),
    ('battaglia','assets/news/x-007.jpg', (0.50, 0.45), 'fire'),
    ('processo', 'assets/news/x-013.jpg', (0.45, 0.35), 'teal'),
    ('gulag',    'assets/news/x-020.jpg', (0.50, 0.50), 'pink'),
    ('stampa',   'assets/news/x-029.jpg', (0.50, 0.50), 'fire'),
    ('over80',   'assets/news/x-006.jpg', (0.50, 0.42), 'dusk'),
    ('cabinato', 'assets/news/x-027.jpg', (0.62, 0.50), 'teal'),
]

GRADES = {  # shadow, mid, highlight (sunset gradient map)
    'dusk': [(38, 14, 70), (214, 70, 118), (255, 196, 110)],
    'fire': [(40, 10, 40), (226, 84, 60), (255, 214, 120)],
    'teal': [(10, 40, 66), (40, 150, 160), (255, 186, 130)],
    'pink': [(48, 12, 64), (236, 80, 150), (255, 210, 150)],
}


def cover(im, w, h, focus):
    sw, sh = im.size
    s = max(w / sw, h / sh)
    nw, nh = int(sw * s + 0.5), int(sh * s + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    x = int(min(max(focus[0] * nw - w / 2, 0), nw - w))
    y = int(min(max(focus[1] * nh - h / 2, 0), nh - h))
    return im.crop((x, y, x + w, y + h))


def gradient_map(lum, stops):
    lum = lum[..., None]
    a, b, c = [np.array(s, np.float32)[None, None, :] for s in stops]
    lo = a + (b - a) * np.clip(lum * 2, 0, 1)
    hi = b + (c - b) * np.clip(lum * 2 - 1, 0, 1)
    return np.where(lum < 0.5, lo, hi)


def stylize(im, grade):
    base = im.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.SMOOTH_MORE)
    # cel posterization (palette quantize keeps colours coherent across the frame)
    q = base.quantize(colors=28, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q = q.filter(ImageFilter.ModeFilter(5))
    a = np.asarray(q).astype(np.float32) / 255.0
    # punchier contrast + saturation
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    sat = 1.35
    a = np.clip(lum[..., None] + (a - lum[..., None]) * sat, 0, 1)
    a = np.clip((a - 0.5) * 1.12 + 0.52, 0, 1)
    # sunset grade (gradient map mixed over the posterized colours)
    gm = gradient_map(lum, GRADES[grade]) / 255.0
    a = a * 0.62 + gm * 0.38
    # warm top-light / cool bottom
    yy = np.linspace(0, 1, a.shape[0], dtype=np.float32)[:, None, None]
    a = a * (1 + 0.08 * (1 - yy) * np.array([1.0, 0.4, -0.3], np.float32))
    # ink outlines from the smoothed luminance
    g = np.asarray(base.convert('L').filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255.0
    gx = np.zeros_like(g); gy = np.zeros_like(g)
    gx[:, 1:-1] = g[:, 2:] - g[:, :-2]
    gy[1:-1, :] = g[2:, :] - g[:-2, :]
    mag = np.sqrt(gx * gx + gy * gy)
    ink = np.clip((mag - 0.07) * 9.0, 0, 1)
    ink_im = Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    ink = np.asarray(ink_im).astype(np.float32) / 255.0
    a = a * (1 - ink[..., None] * 0.85) + np.array([0.08, 0.02, 0.10], np.float32) * ink[..., None] * 0.85
    # halftone dots in the shadows (rotated 45deg grid)
    h, w = lum.shape
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    per = 7.0
    u = (X + Y) / per; v = (X - Y) / per
    d = np.sqrt((u - np.round(u)) ** 2 + (v - np.round(v)) ** 2)
    shade = np.clip((0.42 - lum) / 0.42, 0, 1)
    dots = (d < shade * 0.55).astype(np.float32)
    a = a * (1 - dots[..., None] * 0.35)
    # vignette
    cx, cy = (X / w - 0.5), (Y / h - 0.5)
    vig = np.clip(1 - (cx * cx + cy * cy) * 1.1, 0.35, 1)
    a = a * vig[..., None]
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = []
    for pid, src, focus, grade in PANELS:
        p = os.path.join(ROOT, src)
        if not os.path.exists(p):
            print('skip (missing)', src); continue
        im = ImageOps.exif_transpose(Image.open(p)).convert('RGB')
        im = cover(im, W, H, focus)
        st = stylize(im, grade)
        # the opening's old CSS filter (contrast 1.08, saturate 1.18) baked in: no per-frame filter cost in the browser
        st = ImageEnhance.Color(ImageEnhance.Contrast(st).enhance(1.08)).enhance(1.18)
        st.save(os.path.join(OUT, f'panel-{pid}.jpg'), quality=76, optimize=True)
        st.resize((320, 180), Image.LANCZOS).save(os.path.join(OUT, f'thumb-{pid}.jpg'), quality=70, optimize=True)
        meta.append(pid)
        print('ok', pid, os.path.getsize(os.path.join(OUT, f'panel-{pid}.jpg')) // 1024, 'KB')
    with open(os.path.join(OUT, 'panels.json'), 'w') as f:
        json.dump(meta, f)


if __name__ == '__main__':
    main()
