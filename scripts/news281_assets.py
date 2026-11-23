#!/usr/bin/env python3
"""Corriere delle Due Torri N.281 -> assets/news281/ (reader page + sanitized 3D textures).
Needs pdfimages (poppler) + Pillow.  usage: python3 scripts/news281_assets.py
The 3D textures (folded copy on the tables, page in the man's hands) replace the arrest photo with
newsprint text: the photo is shown only inside the reader, as part of the page."""
import os, subprocess, tempfile
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/news281/corriere-281.pdf')
OUT = os.path.join(ROOT, 'assets/news281')
tmp = tempfile.mkdtemp()
subprocess.run(['pdfimages', '-j', SRC, os.path.join(tmp, 'p')], check=True)
im = Image.open(os.path.join(tmp, 'p-000.jpg')).convert('RGB')
W, H = im.size  # 3720 x 6660
# reader page
pg = im.resize((1300, round(1300 * H / W)), Image.LANCZOS)
pg.save(os.path.join(OUT, 'page-01.jpg'), quality=80, optimize=True, progressive=True)
# sanitize: cover the arrest photo (+ caption) with the article body text from below it
sx, sy = W / 1034, H / 1850
box = lambda x0, y0, x1, y1: (round(x0 * sx), round(y0 * sy), round(x1 * sx), round(y1 * sy))
clean = im.copy()
photo = box(47, 550, 644, 940)
text = clean.crop(box(47, 985, 644, 985 + 390))
clean.paste(text.resize((photo[2] - photo[0], photo[3] - photo[1])), photo[:2])
def fit(img, w, h, bg=(243, 238, 226)):
    c = Image.new('RGB', (w, h), bg); k = min(w / img.width, h / img.height)
    r = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    c.paste(r, ((w - r.width) // 2, (h - r.height) // 2)); return c
# page in the man's hands (A4-shaped leaf: letterbox the taller page)
fit(clean, 512, 724).save(os.path.join(OUT, 'page3d.jpg'), quality=82, optimize=True)
# folded copy on the tables: top part of the page cropped to the A4 ratio (the fold shows its top half)
top = clean.crop((0, 0, W, round(W * 724 / 512)))
top.resize((512, 724), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60)).save(os.path.join(OUT, 'front.jpg'), quality=82, optimize=True)
print('ok', W, H, [f for f in os.listdir(OUT)])
