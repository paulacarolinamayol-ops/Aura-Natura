"""Genera los íconos de la app: la esfera encendida sobre su base, en colores de marca."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

CARBON = (48, 44, 38)
DORADO = (191, 159, 115)
BRUMA = (224, 230, 218)
MARFIL = (247, 244, 236)
BASE = (31, 28, 24)


def icon(size):
    s = size * 4
    img = Image.new('RGB', (s, s), CARBON)
    glow = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    cx, cy, r = s / 2, s * 0.45, s * 0.25
    ImageDraw.Draw(glow).ellipse((cx - r * 1.25, cy - r * 1.25, cx + r * 1.25, cy + r * 1.25), fill=DORADO + (150,))
    img.paste(glow.filter(ImageFilter.GaussianBlur(s * 0.06)), (0, 0), glow.filter(ImageFilter.GaussianBlur(s * 0.06)))
    draw = ImageDraw.Draw(img)
    bw, bh = r * 1.25, s * 0.09
    draw.rounded_rectangle((cx - bw / 2, cy + r * 0.82, cx + bw / 2, cy + r * 0.82 + bh), radius=s * 0.02, fill=BASE)
    for i in range(40, 0, -1):
        t = i / 40
        color = tuple(int(MARFIL[k] * (1 - t) + BRUMA[k] * t) for k in range(3))
        rr = r * t
        ox, oy = -r * 0.18 * (1 - t), -r * 0.2 * (1 - t)
        draw.ellipse((cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr), fill=color)
    return img.resize((size, size), Image.LANCZOS)


out = Path(__file__).resolve().parent.parent / 'icons'
for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
    icon(size).save(out / name, optimize=True)
