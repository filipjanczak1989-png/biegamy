# Grafiki zatwierdzone przez Filipa na przeglądzie (5.11): tnie arkusze, skaluje do rozmiaru z ekranu i zapisuje WebP w assets. Wejście poza repo, w repo tylko wynik.
# Uruchomienie: python -I -X utf8 tools/gra-grafiki-api.py --wej <grafiki-api> --rakieta <katalog z rowerzysta_rakieta.webp> --gra assets/gra --ulica assets/ulica
# wej/wybor.json: wybrany wariant każdej pozycji. wej/high/pliki: wersja high ma pierwszeństwo przed wybranym wariantem medium.
import argparse, json, os
import numpy as np
from PIL import Image

# plik wynikowy: (pozycja, nazwa z przeglądu, katalog, szerokość, w atlasie)
PROSTE = {
    "ikona_dziennik": ("M1", "dziennik", "gra", 128, False), "ikona_magazyn": ("M2", "magazyn", "gra", 128, False), "ikona_rankingi": ("M3", "rankingi", "gra", 128, False), "ikona_mur": ("M4", "mur", "gra", 128, False),
    "glosnik_wl": ("E1a", "glosnik_wlaczony", "gra", 96, False), "glosnik_wyl": ("E1b", "glosnik_wylaczony", "gra", 96, False), "obroc_telefon": ("E2", "obroc_telefon", "gra", 176, False),
    "medal_1": ("R1a", "medal_zloty", "gra", 80, False), "medal_2": ("R1b", "medal_srebrny", "gra", 80, False), "medal_3": ("R1c", "medal_brazowy", "gra", 80, False),
    "odznaka": ("E3", "odznaka", "gra", 64, True), "slonce": ("T2", "slonce", "gra", 192, True), "trawa_pod_droga": ("T5", "trawa_pod_droga", "gra", 1280, True),
    "mur_pomost": ("W2", "rusztowanie_pomost", "gra", 240, True), "mur_flaga_a": ("W3a", "flaga_pomaranczowa", "gra", 405, True), "mur_flaga_b": ("W3b", "flaga_kremowa", "gra", 532, True), "mur_cegla": ("W4", "cegla_plaska", "gra", 64, True),
    "wzgorza": ("U1", "wzgorza", "ulica", 1800, False), "plot": ("U2", "plot", "ulica", 330, False), "pierwszy-plan": ("U3", "pierwszy_plan", "ulica", 1140, False), "slupek": ("U4", "slupek_km", "ulica", 128, False),
    "tablica-start": ("U5a", "tablica_start", "ulica", 300, False), "tablica-meta": ("U5b", "tablica_meta", "ulica", 300, False), "park": ("U7", "park", "ulica", 800, False),
}
BUTY = ["buty-czerwone", "buty-niebieskie", "buty-zielone", "buty-fioletowe", "buty-robocze"]   # kolejność na arkuszu: górny rząd od lewej, potem dolny


def pasma(suma, przerwa):
    w, st, pu = [], None, 0
    for i, v in enumerate(suma):
        if v:
            if st is None: st = i
            pu = 0
        elif st is not None:
            pu += 1
            if pu >= przerwa: w.append((st, i - pu + 1)); st = None; pu = 0
    if st is not None: w.append((st, len(suma)))
    return w


def szew_poziomy(a, pas):
    """Koniec obrazu zachodzi na początek, cięcie linią najmniejszej różnicy. Jak w narzędziu generowania, bez duchów."""
    h, w = a.shape[:2]
    pr = a.astype(float).copy(); pr[..., :3] *= pr[..., 3:] / 255
    K, P = pr[:, w - pas:], pr[:, :pas]
    c = np.abs(K - P).sum(2); c[:, :3] = 1e9; c[:, pas - 3:] = 1e9
    for y in range(1, h):
        g = c[y - 1]; c[y] += np.minimum(np.minimum(np.r_[1e12, g[:-1]], g), np.r_[g[1:], 1e12])
    sc = np.zeros(h, int); sc[-1] = int(np.argmin(c[-1]))
    for y in range(h - 2, -1, -1):
        d, g = max(0, sc[y + 1] - 1), min(pas, sc[y + 1] + 2); sc[y] = d + int(np.argmin(c[y, d:g]))
    m = np.clip((np.arange(pas)[None, :] - sc[:, None] + 1.5) / 3, 0, 1)[..., None]
    wyj = pr[:, :w - pas].copy(); wyj[:, :pas] = K * (1 - m) + P * m
    al = wyj[..., 3:]; wyj[..., :3] = np.where(al > 0, wyj[..., :3] * 255 / np.maximum(al, 1e-6), 0)
    return np.clip(wyj, 0, 255).round().astype("uint8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wej", required=True); ap.add_argument("--rakieta", required=True); ap.add_argument("--gra", required=True); ap.add_argument("--ulica", required=True)
    o = ap.parse_args()
    wybor = json.load(open(os.path.join(o.wej, "wybor.json"), encoding="utf-8"))
    atlas_p = os.path.join(o.gra, "atlas.json"); atlas = json.load(open(atlas_p, encoding="utf-8"))
    kat = {"gra": o.gra, "ulica": o.ulica}

    def zrodlo(id_, nazwa):
        stem = f"{id_}_{nazwa}"
        h = os.path.join(o.wej, "high", "pliki", f"{stem}_a.webp")
        return Image.open(h if os.path.exists(h) else os.path.join(o.wej, "pliki", f"{stem}_{wybor[stem]}.webp")).convert("RGBA")

    def zapisz(im, nazwa, gdzie, w_atlasie, **dod):
        p = os.path.join(kat[gdzie], nazwa + ".webp")
        im.save(p, "WEBP", quality=86, method=6, alpha_quality=90)
        if w_atlasie: atlas[nazwa] = {"src": nazwa + ".webp", "w": im.width, "h": im.height, **dod}
        print(f"{gdzie}/{nazwa}.webp {im.width}×{im.height} {os.path.getsize(p) // 1024} KB")

    def skala(im, szer):
        return im if im.width <= szer else im.resize((szer, round(im.height * szer / im.width)), Image.LANCZOS)

    for nazwa, (id_, naz, gdzie, szer, wa) in PROSTE.items():
        im = skala(zrodlo(id_, naz), szer)
        if nazwa == "wzgorza":
            # Dalekie wzgórza mają być tłem: rozjaśnione ku niebu, żeby nie zlewały się z drzewami i maszynami na pierwszym planie.
            a = np.array(im).astype(float); a[..., :3] = a[..., :3] * 0.62 + np.array([206, 226, 238]) * 0.38; im = Image.fromarray(a.round().astype("uint8"))
        zapisz(im, nazwa, gdzie, wa)

    # Tablica przy budynku: sama deska, bez słupków i trawy, bo wisi na ścianie domku.
    t = zrodlo("T6", "tablica_przy_budynku"); al = np.array(t.getchannel("A")) > 24; szer_w = al.sum(1); ost = np.nonzero(szer_w > 0.8 * szer_w.max())[0][-1]
    zapisz(skala(t.crop((0, 0, t.width, min(t.height, ost + 3))), 300), "tablica", "gra", True)

    # Rusztowanie: odcięte zaokrąglone końce słupów i szew w pionie, segmenty układają się jeden na drugim.
    r = zrodlo("W1", "rusztowanie_pion"); o5 = round(r.height * 0.06)
    a = np.array(r.crop((0, o5, r.width, r.height - o5)))
    pion = np.transpose(szew_poziomy(np.transpose(a, (1, 0, 2)), 24), (1, 0, 2))
    zapisz(skala(Image.fromarray(pion), 192), "mur_rusztowanie", "gra", True)

    # Chmury: trzy osobne z arkusza.
    c = zrodlo("T1", "chmury"); al = np.array(c.getchannel("A")) > 24
    kol = pasma(al.sum(0), 12)
    if len(kol) != 3: raise SystemExit(f"chmury: oczekiwane 3, jest {len(kol)}")
    for i, (x0, x1) in enumerate(kol, 1):
        ys = np.nonzero(al[:, x0:x1].any(1))[0]
        zapisz(skala(c.crop((x0, ys[0], x1, ys[-1] + 1)), 320), f"chmura{i}", "gra", True)

    # Buty: pięć par z arkusza. Palce w prawo, podeszwa w dół.
    b = zrodlo("S1", "buty"); al = np.array(b.getchannel("A")) > 24; wyc = []
    for y0, y1 in pasma(al.sum(1), 14):
        for x0, x1 in pasma(al[y0:y1].sum(0), 14):
            ys = np.nonzero(al[y0:y1, x0:x1].any(1))[0]
            wyc.append(b.crop((x0, y0 + ys[0], x1, y0 + ys[-1] + 1)))
    if len(wyc) != len(BUTY): raise SystemExit(f"buty: oczekiwane {len(BUTY)}, jest {len(wyc)}")
    for nazwa, im in zip(BUTY, wyc):
        zapisz(skala(im, 200), "dodatek_" + nazwa, "gra", True)

    # Rakieta: arkusz z gra-nowosci (rower w kolorze z gry) i ikona przyczepki. kx: gdzie w klatce stoi rower, bo przyczepka wystaje w lewo.
    ark = Image.open(os.path.join(o.rakieta, "rowerzysta_rakieta.webp")).convert("RGBA")
    zapisz(ark, "rakieta_rower", "gra", False)
    atlas["rakieta_rower"] = {"src": "rakieta_rower.webp", "cw": ark.width // 5, "ch": ark.height, "n": 5, "dol": 3, "kx": 0.73}
    ik = Image.open(os.path.join(o.rakieta, "przyczepka_rakieta.webp")).convert("RGBA")
    zapisz(ik, "rakieta", "gra", True)

    with open(atlas_p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(atlas, f, ensure_ascii=False, indent=2)
    print("atlas", len(atlas))


if __name__ == "__main__":
    main()
