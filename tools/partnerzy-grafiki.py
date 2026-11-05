"""Budynki Partnerów poprzednich wyzwań: PNG od Filipa -> assets/gra i assets/ulica (te same pliki, bez logo i nazw firm), prostokąty szyldów i plakatu.

    python -I tools/partnerzy-grafiki.py --wejscie <katalog z osiedle.png, galeria.png, fabryka.png> --gra assets/gra --ulica assets/ulica

Logo i plakat NIE trafiają do repo: repo jest publiczne, logo tylko po zgodzie firmy, więc idą przez panel do kubełka firm.
Prostokąty podane na oryginale (ręcznie, z deski na rysunku) i przeliczone po przycięciu. Wypisuje JSON do skopiowania do L.SZYLDY i U.SZYLDY.
"""
import argparse, importlib.util, json, os
from PIL import Image


def wczytaj_ulice():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ulica-grafiki.py")
    s = importlib.util.spec_from_file_location("ulica_grafiki", p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m


U = wczytaj_ulice()
# szyld i plakat w pikselach oryginału: (lewo, góra, prawo, dół)
BUDYNKI = {
    "osiedle": {"szer": 840, "szyld": (512, 88, 1038, 208)},
    "galeria": {"szer": 800, "szyld": (558, 122, 1222, 298)},
    "fabryka": {"szer": 840, "szyld": (424, 384, 972, 504), "plakat": (1400, 392, 1694, 684)},
}


def ulamki(pr, ramka, wy=4):
    l, g, p, d = ramka
    w, h = p - l, d - g
    return [round((pr[0] - l) / w, wy), round((pr[1] - g) / h, wy), round((pr[2] - pr[0]) / w, wy), round((pr[3] - pr[1]) / h, wy)]


def main():
    a = argparse.ArgumentParser(); a.add_argument("--wejscie", required=True); a.add_argument("--gra", required=True); a.add_argument("--ulica", required=True); a.add_argument("--podglad")
    o = a.parse_args()
    wynik = {}
    for nazwa, b in BUDYNKI.items():
        wyj = U.wytnij_tlo(Image.open(os.path.join(o.wejscie, nazwa + ".png")).convert("RGBA"))
        obraz = wyj[0] if isinstance(wyj, tuple) else wyj
        r = U.bbox(obraz)
        ramka = (r[0], r[1], r[2], r[3])
        wyc = obraz.crop(ramka)
        sz = b["szer"]; wy = round(wyc.height * sz / wyc.width)
        wyc = wyc.resize((sz, wy), Image.LANCZOS)
        for kat in (o.gra, o.ulica):
            wyc.save(os.path.join(kat, nazwa + ".webp"), "WEBP", quality=82, method=6)
        wynik[nazwa] = {"w": sz, "h": wy, "proporcja": round(sz / wy, 4), "szyld": ulamki(b["szyld"], ramka)}
        if "plakat" in b: wynik[nazwa]["plakat"] = ulamki(b["plakat"], ramka)
    print(json.dumps(wynik, ensure_ascii=False))
    if o.podglad:
        kan = Image.new("RGB", (1760, 620), (88, 120, 150)); x = 10
        for nazwa, d in wynik.items():
            im = Image.open(os.path.join(o.gra, nazwa + ".webp")).convert("RGBA"); s = 570 / max(im.width, im.height)
            im = im.resize((int(im.width * s), int(im.height * s))); kan.paste(im, (x, 610 - im.height), im); x += im.width + 12
        kan.save(o.podglad)


if __name__ == "__main__":
    main()
