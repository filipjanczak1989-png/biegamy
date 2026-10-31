"""G5 (31.10.2026): ikony kafli z generatora (ikona-<slug>.jpg, 1024x1024, tło --card) → ikona-<slug>.png 256x256.

Użycie:  python tools/kadry/ikony-png.py <katalog_z_jpg> [<katalog_wyjścia>]

- Kadrowanie: model rysuje przedmiot na ~45 % kadru (prompt prosi o 70 %) — przycinamy tło wokół przedmiotu
  (piksele dalej od tła niż PROG) do kwadratu, w którym przedmiot zajmuje WYPELNIENIE boku. Bez nowej generacji.
- Skala 256 (kafel 40–56 px, DPR 3 → ~170) — Lanczos.
- Tło: Nano Banana nie trzyma koloru co do bitu, a kafel ma tło --card (#0f0f14) — piksele bliskie tłu
  (odległość < PROG od koloru narożników) przyciągamy do #0f0f14, żeby na kaflu nie było szwu/prostokąta.
  Miękki cień kontaktowy jest dalej od tła niż próg, więc zostaje.
- Kwantyzacja do palety (maks. 128 kolorów, bez ditheringu) — cel ≤ 40 KB; gdy więcej, 64 kolory.
- Raport: rozmiar, kolor narożników przed poprawką, ile pikseli przyciągnięto.
"""
import sys
from pathlib import Path
from PIL import Image

TLO = (0x0F, 0x0F, 0x14)
PROG = 18
LIMIT = 40 * 1024
WYPELNIENIE = 0.78


def odl(a, b):
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def przetworz(src: Path, dst: Path):
    im = Image.open(src).convert("RGB")
    W, H = im.size
    narozniki = [im.getpixel(p) for p in [(4, 4), (W - 5, 4), (4, H - 5), (W - 5, H - 5)]]
    sr = tuple(sum(c[i] for c in narozniki) // 4 for i in range(3))
    xs, ys = [], []
    pp = im.load()
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            if odl(pp[x, y], sr) >= PROG:
                xs.append(x); ys.append(y)
    if xs:
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        bok = int(max(x1 - x0, y1 - y0) / WYPELNIENIE)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        kw = Image.new("RGB", (bok, bok), sr)
        kw.paste(im.crop((cx - bok // 2, cy - bok // 2, cx - bok // 2 + bok, cy - bok // 2 + bok)), (0, 0))
        # crop poza obrazem daje czerń — tło przyciągnie się niżej, bo czerń (0,0,0) leży < PROG od #0f0f14
        im = kw
    im = im.resize((256, 256), Image.LANCZOS)
    px = im.load()
    przyciagniete = 0
    for y in range(256):
        for x in range(256):
            p = px[x, y]
            if odl(p, sr) < PROG or odl(p, TLO) < PROG:
                if p != TLO:
                    przyciagniete += 1
                px[x, y] = TLO
    for kolory in (128, 64):
        q = im.quantize(colors=kolory, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q.save(dst, optimize=True)
        if dst.stat().st_size <= LIMIT:
            break
    return {"plik": dst.name, "KB": round(dst.stat().st_size / 1024, 1), "kolory": kolory,
            "narożniki": "#%02x%02x%02x" % sr, "przyciągnięte_px": przyciagniete}


def main():
    wej = Path(sys.argv[1])
    wyj = Path(sys.argv[2]) if len(sys.argv) > 2 else wej
    wyj.mkdir(parents=True, exist_ok=True)
    for src in sorted(wej.glob("ikona-*.jpg")):
        print(przetworz(src, wyj / (src.stem + ".png")))


if __name__ == "__main__":
    main()
