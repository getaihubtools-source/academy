# ساخت آیکون‌های PWA:  python3 tools/build-icons.py
# طرح: تایم‌لاین کلیدفریم (همان عنصر شاخص رابط) روی زمینه سرمه‌ای.
from PIL import Image, ImageDraw
import os
INK = (6, 11, 22); TEAL = (46, 224, 203); DIM = (60, 80, 120)
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')

def diamond(d, cx, cy, r, fill=None, outline=None, width=0):
    pts = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
    d.polygon(pts, fill=fill)
    if outline and width:
        inner = r - width * 1.4
        d.polygon(pts, fill=outline)
        d.polygon([(cx, cy - inner), (cx + inner, cy), (cx, cy + inner), (cx - inner, cy)], fill=INK)

def draw(size, safe=1.0, rounded=True):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=INK)
    else:
        d.rectangle([0, 0, S, S], fill=INK)
    c = S / 2
    span = S * 0.34 * safe
    r_main = S * 0.15 * safe
    r_side = S * 0.065 * safe
    lw = max(2, int(S * 0.012))
    d.rectangle([c - span, c - lw, c + span, c + lw], fill=DIM)
    d.rectangle([c - span * 0.0, c - lw * 1.6, c + span, c + lw * 1.6], fill=TEAL)  # بخش انجام‌شده (سمت راست = شروع در RTL)
    diamond(d, c + span, c, r_side, fill=TEAL)
    diamond(d, c - span, c, r_side, outline=DIM, width=lw * 1.2)
    diamond(d, c, c, r_main, fill=TEAL)
    return img.resize((size, size), Image.LANCZOS)

os.makedirs(OUT, exist_ok=True)
draw(192).save(os.path.join(OUT, 'icon-192.png'))
draw(512).save(os.path.join(OUT, 'icon-512.png'))
draw(512, safe=0.72, rounded=False).save(os.path.join(OUT, 'icon-maskable-512.png'))
draw(180, rounded=False).save(os.path.join(OUT, 'apple-touch-icon.png'))
draw(32).save(os.path.join(OUT, 'favicon-32.png'))
print('icons written')
