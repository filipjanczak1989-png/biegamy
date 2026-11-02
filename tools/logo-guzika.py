# Logo guzika start-akcji.html (Filip 2.11 18:08, wariant B): B całe białe z delikatnym cieniem, pierścień biały 40%.
# Źródło: assets/ui/logo-b-ring-alfa.png (B w r<380 px, pierścień r≥380 px przy 1024 px). Biel i cień w pliku, nie filtrami CSS.
#   python tools/logo-guzika.py  →  assets/ui/logo-b-biale-alfa.webp
import numpy as np
from PIL import Image, ImageFilter
a = np.array(Image.open('assets/ui/logo-b-ring-alfa.png').convert('RGBA')).astype(np.float32)
h, w = a.shape[:2]; yy, xx = np.mgrid[:h, :w]; r = np.hypot(yy - h/2, xx - w/2)
al = a[..., 3] / 255
alB = np.where(r < 380, al, 0); alR = np.where(r >= 380, al, 0)
D = 2 * r[alR > .5].max()
m = Image.fromarray((alB * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(D * .012))
cien = np.roll(np.array(m).astype(np.float32) / 255, int(D * .014), axis=0) * .38
def over(d, rgb, alpha):
    da = d[..., 3]; oa = alpha + da * (1 - alpha)
    for c in range(3):
        d[..., c] = np.where(oa > 0, (rgb[c] * alpha + d[..., c] * da * (1 - alpha)) / np.maximum(oa, 1e-6), 0)
    d[..., 3] = oa
d = np.zeros((h, w, 4), np.float32)
over(d, (255, 255, 255), alR * .4)
over(d, (40, 14, 4), cien)
over(d, (255, 255, 255), alB)
d[..., 3] *= 255
Image.fromarray(np.clip(d, 0, 255).astype(np.uint8), 'RGBA').save('assets/ui/logo-b-biale-alfa.webp', quality=90, method=6)
