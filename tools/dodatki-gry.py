# Dodatki ze sklepiku gry: tnie arkusz po przerwach w przezroczystości, kask rowerowy odbija lustrzanie (ma patrzeć w prawo jak postać) i zapisuje mały WebP na każdy dodatek.
# Uruchomienie: python -I -X utf8 tools/dodatki-gry.py --wej <dodatki.png> --kat assets/gra
import argparse, json, os
import numpy as np
from PIL import Image

# Kolejność na arkuszu: dwa rzędy po cztery, od lewej.
NAZWY = ["kask-rowerowy", "czapka-pompon", "opaska", "okulary", "czapka-zlota", "peleryna", "medal", "korona"]
LUSTRO = {"kask-rowerowy"}
SZER = 200


def pasma(os_suma, min_przerwa):
    wynik, st, pusto = [], None, 0
    for i, v in enumerate(os_suma):
        if v:
            if st is None: st = i
            pusto = 0
        elif st is not None:
            pusto += 1
            if pusto >= min_przerwa:
                wynik.append((st, i - pusto + 1)); st = None; pusto = 0
    if st is not None: wynik.append((st, len(os_suma)))
    return wynik


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wej", required=True); ap.add_argument("--kat", required=True)
    o = ap.parse_args()
    im = Image.open(o.wej).convert("RGBA")
    al = np.array(im.getchannel("A")) > 24
    rzedy = pasma(al.sum(1), 12)
    if len(rzedy) != 2: raise SystemExit(f"oczekiwane dwa rzędy, jest {len(rzedy)}: arkusz ma inny układ")
    wycinki = []
    for y0, y1 in rzedy:
        kol = pasma(al[y0:y1].sum(0), 12)
        if len(kol) != 4: raise SystemExit(f"oczekiwane cztery dodatki w rzędzie, jest {len(kol)}")
        for x0, x1 in kol:
            ys = np.nonzero(al[y0:y1, x0:x1].any(1))[0]
            wycinki.append((x0, y0 + ys[0], x1, y0 + ys[-1] + 1))
    atlas = {}
    for nazwa, box in zip(NAZWY, wycinki):
        k = im.crop(box)
        if nazwa in LUSTRO: k = k.transpose(Image.FLIP_LEFT_RIGHT)
        sk = SZER / max(k.size)
        k = k.resize((max(1, round(k.width * sk)), max(1, round(k.height * sk))), Image.LANCZOS)
        plik = f"dodatek_{nazwa}.webp"
        k.save(os.path.join(o.kat, plik), lossless=False, quality=88, method=6, alpha_quality=92)
        atlas[f"dodatek_{nazwa}"] = {"src": plik, "w": k.width, "h": k.height}
        print(plik, k.size, os.path.getsize(os.path.join(o.kat, plik)) // 1024, "KB")
    print(json.dumps(atlas))


if __name__ == "__main__":
    main()
