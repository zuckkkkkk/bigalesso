#!/usr/bin/env python3
"""Generate the newspaper + mural assets from assets/news/corriere-313.pdf.

  python3 scripts/news_assets.py

Outputs (assets/news/):
  page-01.jpg … page-12.jpg   reader pages (~1150 px wide)
  front.jpg                   small front page for the 3D folded paper
  mural.jpg                   'Tortellino Man vs Cappelletti Man' painted mural (2048x1092)
  print-*.jpg                 framed prints for the lounge
Needs: pdftoppm (poppler-utils), Pillow, numpy.
"""
import os, subprocess, glob, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = os.path.join(ROOT, 'assets', 'news')
PDF = os.path.join(N, 'corriere-313.pdf')
FONTS = '/usr/share/fonts/truetype/google-fonts/ofl'

def pages():
    tmp = os.path.join(N, '_tmp'); os.makedirs(tmp, exist_ok=True)
    subprocess.run(['pdftoppm', '-r', '140', '-png', PDF, os.path.join(tmp, 'p')], check=True)
    files = sorted(glob.glob(os.path.join(tmp, 'p-*.png')))
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB')
        w = 1120; im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(os.path.join(N, f'page-{i + 1:02d}.jpg'), quality=72, optimize=True, progressive=True)
        if i == 0:
            fr = im.resize((512, round(im.height * 512 / im.width)), Image.LANCZOS)
            fr.save(os.path.join(N, 'front.jpg'), quality=80, optimize=True)
        os.remove(f)
    os.rmdir(tmp)

def font(name, size):
    p = {'anton': f'{FONTS}/anton/Anton-Regular.ttf', 'archivo': f'{FONTS}/archivoblack/ArchivoBlack-Regular.ttf'}[name]
    try: return ImageFont.truetype(p, size)
    except Exception: return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)

def painterly(img, colors=18, seed=3):
    """posterize with k-means-ish palette + dark outlines + brush grain"""
    small = img.resize((img.width // 2, img.height // 2), Image.LANCZOS).filter(ImageFilter.MedianFilter(5))
    q = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    q = q.filter(ImageFilter.ModeFilter(5)).resize(img.size, Image.NEAREST).filter(ImageFilter.SMOOTH_MORE)
    a = np.asarray(q).astype(np.float32)
    # outlines from edges of the original
    edges = np.asarray(img.convert('L').filter(ImageFilter.GaussianBlur(1.6)).filter(ImageFilter.FIND_EDGES)).astype(np.float32)
    e = np.clip((edges - 14) / 40, 0, 1)[..., None]
    a = a * (1 - 0.7 * e)
    # brush strokes: directional noise
    rng = np.random.default_rng(seed)
    h, w = a.shape[:2]
    n = rng.normal(0, 1, (h // 6 + 2, w // 18 + 2)).astype(np.float32)
    n = np.asarray(Image.fromarray(((n - n.min()) / (np.ptp(n) + 1e-6) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
    a = a * (0.9 + 0.2 * n[..., None])
    a = np.clip(a * 1.06 + 6, 0, 255)
    out = Image.fromarray(a.astype(np.uint8))
    return ImageEnhance.Color(out).enhance(1.25)

def wall_texture(w, h, seed=5):
    rng = np.random.default_rng(seed)
    base = np.ones((h, w, 3), np.float32) * np.array([196, 186, 168], np.float32)
    n = rng.normal(0, 1, (h // 8 + 2, w // 8 + 2)).astype(np.float32)
    n = np.asarray(Image.fromarray(((n - n.min()) / (np.ptp(n) + 1e-6) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
    fine = rng.normal(0, 1, (h, w)).astype(np.float32)
    base *= (0.86 + 0.2 * n[..., None] + 0.035 * fine[..., None])
    return base

def mural():
    W, H = 2048, 1092
    src = Image.open(os.path.join(N, 'x-007.jpg')).convert('RGB')  # page 5: Tortellino Man vs Cappelletti Man
    wall = wall_texture(W, H)
    # background: the same scene stretched to cover the wall, blurred + posterized (painted backdrop)
    cov = ImageOps.fit(src, (W, H), Image.LANCZOS, centering=(0.5, 0.45))
    bgp = painterly(cov.filter(ImageFilter.GaussianBlur(18)), colors=10, seed=9)
    bgp = ImageEnhance.Brightness(bgp).enhance(0.62)
    canvas = Image.fromarray(np.clip(wall, 0, 255).astype(np.uint8))
    edge = Image.new('L', (W, H), 0); ImageDraw.Draw(edge).rectangle([22, 20, W - 22, H - 20], fill=255)
    canvas.paste(bgp, (0, 0), edge.filter(ImageFilter.GaussianBlur(2)))
    # the scene itself, sharp and painterly, as large as possible
    ph = int(H * 0.86); pw = int(ph * src.width / src.height)
    paint = ImageEnhance.Color(painterly(src.resize((pw, ph), Image.LANCZOS), colors=22)).enhance(1.3)
    px, py = (W - pw) // 2, int(H * 0.07)
    pm = Image.new('L', (pw, ph), 255); pmd = ImageDraw.Draw(pm)
    for i in range(520):
        rr = random.Random(i); side = rr.randint(0, 3); s_ = rr.randint(14, 46)
        if side == 0: x, y = rr.randint(0, pw), rr.randint(-s_, s_ // 2)
        elif side == 1: x, y = rr.randint(0, pw), ph + rr.randint(-s_ // 2, s_)
        elif side == 2: x, y = rr.randint(-s_, s_ // 2), rr.randint(0, ph)
        else: x, y = pw + rr.randint(-s_ // 2, s_), rr.randint(0, ph)
        pmd.ellipse([x - s_, y - s_, x + s_, y + s_], fill=0)
    pm = pm.filter(ImageFilter.GaussianBlur(10))
    canvas.paste(paint, (px, py), pm)
    d = ImageDraw.Draw(canvas)
    def outlined(text, f, xy, fill, stroke, sw, anchor='mm', shadow=(12, 6, 20)):
        x, y = xy
        d.text((x + 7, y + 8), text, font=f, fill=shadow, anchor=anchor, stroke_width=sw, stroke_fill=shadow)
        d.text((x, y), text, font=f, fill=fill, anchor=anchor, stroke_width=sw, stroke_fill=stroke)
    # title on a painted banner: TORTELLINO MAN  VS  CAPPELLETTI MAN (fit to width)
    size = 132
    while True:
        fA, fV = font('anton', size), font('archivo', int(size * 0.72))
        wa = d.textlength('TORTELLINO MAN', font=fA); wb = d.textlength('CAPPELLETTI MAN', font=fA); wv = d.textlength('VS', font=fV)
        tot = wa + wb + wv + 2 * 46
        if tot < W - 160 or size < 60: break
        size -= 4
    x0 = (W - tot) / 2; ty = 96
    band = Image.new('L', (W, H), 0); ImageDraw.Draw(band).rounded_rectangle([x0 - 50, ty - size * 0.62, x0 + tot + 50, ty + size * 0.62], radius=18, fill=170)
    canvas.paste(Image.new('RGB', (W, H), (24, 10, 40)), (0, 0), band.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(canvas)
    # left: Cappelletti Man (top hat, left in the scene) · right: Tortellino Man
    outlined('CAPPELLETTI MAN', fA, (x0 + wb / 2, ty), (236, 50, 56), (255, 232, 140), 8)
    outlined('VS', fV, (x0 + wb + 46 + wv / 2, ty + 4), (200, 240, 60), (20, 10, 40), 7)
    outlined('TORTELLINO MAN', fA, (x0 + wb + wv + 92 + wa / 2, ty), (255, 214, 40), (130, 22, 22), 8)
    # bottom band
    by = H - 118
    band = Image.new('L', (W, H), 0); ImageDraw.Draw(band).rounded_rectangle([W * 0.2, by - 62, W * 0.8, by + 84], radius=16, fill=160)
    canvas.paste(Image.new('RGB', (W, H), (24, 10, 40)), (0, 0), band.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(canvas)
    outlined('ROUND 3 · VIA RIZZOLI', font('anton', 66), (W * 0.5, by - 12), (255, 255, 255), (20, 10, 40), 6)
    outlined('LA PIOGGIA DI CAPPELLETTI  vs  LA SFOGLIA INFINITA', font('archivo', 36), (W * 0.5, by + 50), (200, 240, 60), (20, 10, 40), 4)
    # artist tag (bottom right)
    tag = Image.new('RGBA', (380, 130), (0, 0, 0, 0)); td = ImageDraw.Draw(tag)
    td.text((10, 10), 'BigaLesso', font=font('archivo', 62), fill=(255, 90, 200, 255), stroke_width=4, stroke_fill=(20, 10, 40, 255))
    td.text((250, 84), "'26", font=font('archivo', 30), fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(20, 10, 40, 255))
    tag = tag.rotate(8, expand=True, resample=Image.BICUBIC)
    canvas.paste(tag, (W - tag.width - 30, H - tag.height - 6), tag)
    # weathering: chipped paint showing plaster, fade, grain
    a = np.asarray(canvas).astype(np.float32)
    rng = np.random.default_rng(11)
    n = rng.normal(0, 1, (H // 4 + 2, W // 4 + 2)).astype(np.float32)
    n = np.asarray(Image.fromarray(((n - n.min()) / (np.ptp(n) + 1e-6) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    chip = np.clip((n - 0.8) * 9, 0, 1)[..., None]
    a = a * (1 - chip) + wall * chip
    fade = 0.93 + 0.07 * n[..., None]
    a = a * fade + 10 * (1 - fade)
    a = np.clip(a + rng.normal(0, 1, (H, W, 1)).astype(np.float32) * 5, 0, 255)
    Image.fromarray(a.astype(np.uint8)).save(os.path.join(N, 'mural.jpg'), quality=82, optimize=True, progressive=True)
    hb = np.clip(128 + (n - 0.5) * 80 + chip[..., 0] * -60 + rng.normal(0, 1, (H, W)) * 6, 0, 255).astype(np.uint8)
    Image.fromarray(hb).resize((1024, 546), Image.BICUBIC).save(os.path.join(N, 'mural_bump.jpg'), quality=80)

def prints():
    sel = {'x-006.jpg': 'print-over80.jpg', 'x-009.jpg': 'print-tortellino.jpg', 'x-002.jpg': 'print-fakenews.jpg', 'x-029.jpg': 'print-ciclostile.jpg'}
    for s, o in sel.items():
        p = os.path.join(N, s)
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGB'); im.thumbnail((768, 768), Image.LANCZOS)
        im.save(os.path.join(N, o), quality=80, optimize=True)

if __name__ == '__main__':
    pages(); mural(); prints()
    tot = 0
    for f in sorted(glob.glob(os.path.join(N, '*.jpg'))):
        b = os.path.basename(f)
        if b.startswith('x-'): continue
        s = os.path.getsize(f); tot += s; print(f'{b:24s} {s // 1024:5d} KB')
    print('total', tot // 1024, 'KB')
