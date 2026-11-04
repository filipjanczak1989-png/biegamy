# Arkusz postaci z wtopioną jasną kratką zamiast przezroczystości: wycina tło, dzieli na klatki i składa WebP z jednakowymi komórkami.
# Tło poza rysunkiem to jasny obszar dotykający brzegu obrazu. Prześwity w środku (szprychy, trójkąt ramy) tym sposobem nie wyjdą, więc są opisane liczbami w ARKUSZE.
# Biel rysunku (skarpety, zęby, odblaski) wygląda jak kratka, więc domyślnie zostaje: prześwit to wnętrze koła albo obszar wskazany punktem w "usun".
# --tajne: plik jest wizerunkiem dziecka przed startem, a repo jest publiczne. Narzędzie odmawia zapisu w katalogu z .git (blizna-155). W repo nie ma rysunku, są tylko liczby.
# Uruchomienie: python -I -X utf8 tools/arkusz-z-kratki.py --rodzaj rower-jazda|rower-skok|koparka --wej <png> --wyj <webp> [--podglad <png>] [--tajne] [--animacja <ms>]
import argparse, os
import numpy as np
from PIL import Image

JASNE_MIN, JASNE_NASYC, DROBNE = 205, 18, 40
# Każda klatka: (od_x, do_x, os_x, spod_y). os_x to punkt ustawiony w środku komórki, spod_y to linia ziemi tej klatki w źródle.
ARKUSZE = {
    "rower-jazda": {
        "klatki": [(0, 364, 186, 600), (364, 727, 549, 600), (727, 1088, 911, 600), (1088, 1450, 1272, 600), (1450, 1812, 1635, 600), (1812, 2172, 1996, 600)],
        "kola": [(72 + 362 * k, 542, 45) for k in range(6)] + [(301 + 362 * k, 543, 45) for k in range(6)],
        "usun": [(216, 418), (123, 459), (117, 495), (116, 504), (261, 416), (579, 424), (493, 444), (622, 416), (480, 494), (480, 503), (958, 414), (962, 513), (985, 417), (842, 444), (840, 503),
                 (1327, 414), (1213, 452), (1346, 416), (1206, 494), (1200, 503), (1688, 426), (1573, 443), (1708, 415), (1560, 503), (2017, 418), (1953, 456), (2069, 416), (1927, 495), (1925, 504)],
        # Buty: boczne kreski na cholewce przypominają znak firmowy. Szare piksele w tych prostokątach idą pod kolor cholewki, podeszwa i kontur zostają.
        "buty": [(152, 448, 232, 488), (152, 544, 196, 564), (500, 472, 576, 512), (536, 536, 560, 552), (880, 520, 960, 564), (848, 460, 888, 508), (1218, 512, 1286, 548), (1582, 472, 1658, 512), (1626, 536, 1642, 552), (1962, 428, 2042, 476), (1974, 544, 2006, 560)],
        "wys_zrodla": 500,
    },
    "rower-skok": {
        # Klatka 2 i 3 nachodzą na siebie w poziomie (koło nad kurzem), stąd prostokąty "obce" w piątym polu: czyszczone tylko w tej klatce.
        "klatki": [(16, 372, 222, 600, []), (373, 675, 540, 525, [(640, 526, 690, 600), (373, 526, 470, 600)]), (640, 1003, 840, 582, [(640, 380, 682, 525), (985, 280, 1003, 420)]), (1003, 1435, 1098, 604, [(1405, 520, 1435, 604)]), (1405, 1815, 1625, 600, [(1405, 280, 1437, 440)]), (1831, 2172, 2005, 600, [])],
        "kola": [(128, 550, 44), (317, 450, 41), (457, 470, 40), (622, 438, 40), (750, 528, 43), (930, 528, 43), (1042, 430, 37), (1154, 549, 42), (1899, 540, 44), (2111, 540, 44),
                 (1676, 475, 50, 25), (1748, 567, 56, 30)],
        "usun": [(202, 363), (240, 361), (158, 447), (556, 337), (576, 337), (475, 379), (879, 412), (900, 428), (1125, 427), (1110, 393), (1315, 382), (1574, 397), (2035, 235), (2040, 432), (2068, 425), (1978, 480), (1934, 362), (1933, 505), (1920, 519), (1980, 510)],
        # Kamyk i iskry z klatki wywrotki: gra sama ustawia przeszkodę.
        "wymaz": [(1186, 520, 1300, 604, 1154, 549, 53)],
        "buty": [(160, 445, 240, 515), (470, 385, 555, 450), (775, 475, 855, 530), (1000, 285, 1040, 355), (1086, 240, 1166, 285), (1571, 545, 1706, 595), (1916, 535, 2056, 590)],
        "wys_zrodla": 500,
    },
    "koparka": {
        # Klatki: jazda 1, jazda 2, zamach, uderzenie, zgarnianie, radość. Oś to środek gąsienic, więc koparka nie skacze między klatkami. W repo tylko te liczby, rysunek poza repo.
        "klatki": [(7, 366, 155, 530), (373, 722, 522, 532), (723, 1010, 848, 530), (1060, 1439, 1179, 535), (1449, 1792, 1566, 535), (1825, 2172, 1954, 535)],
        "kola": [],
        "usun": [(157, 343), (86, 356), (527, 334), (451, 352), (794, 330), (893, 393), (1234, 356), (1140, 358), (1588, 349), (1505, 362), (1949, 293), (1965, 368), (1942, 350),
                 (609, 238), (621, 239), (2040, 246), (260, 246), (2049, 249), (269, 250), (1352, 343), (1351, 333), (1393, 441), (1402, 440), (913, 243), (1691, 319), (1769, 374), (2136, 281)],
        "wys_zrodla": 380,
    },
}


def etykiety(m):
    h, w = m.shape
    pole = bytearray(m.astype(np.uint8).tobytes())
    nr = np.zeros(h * w, dtype=np.int32)
    rozm, brzeg = [], []
    for s in range(h * w):
        if not pole[s]: continue
        pole[s] = 0
        st = [s]; ile = 0; b = False; k = len(rozm) + 1
        while st:
            i = st.pop(); nr[i] = k; ile += 1
            y, x = divmod(i, w)
            if x == 0 or y == 0 or x == w - 1 or y == h - 1: b = True
            if x > 0 and pole[i - 1]: pole[i - 1] = 0; st.append(i - 1)
            if x < w - 1 and pole[i + 1]: pole[i + 1] = 0; st.append(i + 1)
            if y > 0 and pole[i - w]: pole[i - w] = 0; st.append(i - w)
            if y < h - 1 and pole[i + w]: pole[i + w] = 0; st.append(i + w)
        rozm.append(ile); brzeg.append(b)
    return nr.reshape(h, w), rozm, brzeg


def rozszerz(m, r):
    w = m.copy()
    for _ in range(r):
        n = w.copy()
        n[1:] |= w[:-1]; n[:-1] |= w[1:]; n[:, 1:] |= w[:, :-1]; n[:, :-1] |= w[:, 1:]
        w = n
    return w


def maska_tla(rgb, cfg, raport=None):
    mn, mx = rgb.min(-1).astype(np.int16), rgb.max(-1).astype(np.int16)
    jasne = (mn > JASNE_MIN) & (mx - mn < JASNE_NASYC)
    zal, rozm, brzeg = etykiety(jasne)
    tlo = np.zeros(jasne.shape, dtype=bool)
    h, w = jasne.shape
    yy, xx = np.mgrid[0:h, 0:w]
    w_kole = np.zeros(jasne.shape, dtype=bool)
    for kolo in cfg["kola"]:
        cx, cy, rx = kolo[:3]; ry = kolo[3] if len(kolo) > 3 else rx
        w_kole |= ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
    usun = {int(zal[y, x]) for x, y in cfg.get("usun", []) if zal[y, x]}
    tlo_lub = np.zeros(len(rozm) + 1, dtype=bool)
    for i, s in enumerate(rozm, 1):
        if brzeg[i - 1] or i in usun: tlo_lub[i] = True
    tlo = tlo_lub[zal] | (w_kole & jasne)
    if raport is not None:
        ys, xs = np.nonzero(zal)
        for i, s in enumerate(rozm, 1):
            if brzeg[i - 1] or s <= DROBNE: continue
            m = zal == i
            py, px = np.nonzero(m)
            raport.append((int(px.mean()), int(py.mean()), s, bool(i in usun), bool(w_kole[py[0], px[0]])))
    for x0, y0, x1, y1, cx, cy, r in cfg.get("wymaz", []):
        tlo[y0:y1, x0:x1] |= ((xx[y0:y1, x0:x1] - cx) ** 2 + (yy[y0:y1, x0:x1] - cy) ** 2) > r * r
    return tlo


def bez_znaku_na_butach(rgb, cfg):
    wynik = rgb.copy()
    for x0, y0, x1, y1 in cfg.get("buty", []):
        kaw = wynik[y0:y1, x0:x1]
        v, n = kaw.max(-1).astype(np.int16), (kaw.max(-1).astype(np.int16) - kaw.min(-1))
        kaw[(n < 30) & (v > 55) & (v < 150)] = (38, 36, 38)
    return wynik


def wytnij_alfa(rgb, tlo):
    """Piksele przy tle to mieszanka konturu i kratki. Bez odmieszania zostaje jasna obwódka."""
    h, w = tlo.shape
    v = rgb.astype(np.float32)
    alfa = np.where(tlo, 0.0, 1.0)
    pas = rozszerz(tlo, 2) & ~tlo
    jas = v.mean(-1)
    nas = v.max(-1) - v.min(-1)
    a = np.clip((250.0 - jas) / 200.0, 0, 1)
    m = pas & (nas < 40)
    alfa[m] = a[m]
    wynik = v.copy()
    bezp = np.maximum(alfa, 0.05)[..., None]
    wynik[m] = np.clip((v[m] - (1 - alfa[m])[..., None] * 250.0) / bezp[m], 0, 255)
    return np.dstack([wynik, alfa * 255]).round().astype(np.uint8)


def skladaj(rgba, cfg, wys):
    sk = wys / cfg["wys_zrodla"]
    klatki = cfg["klatki"]
    # Szerokość komórki: od osi w każdą stronę najdalszy piksel, żeby oś zawsze wypadała w tym samym miejscu.
    lewo = prawo = gora = 0
    wycinki = []
    for klatka in klatki:
        od_x, do_x, os_x, spod = klatka[:4]
        kaw = rgba[:, od_x:do_x].copy()
        for x0, y0, x1, y1 in (klatka[4] if len(klatka) > 4 else []):
            kaw[y0:y1, max(0, x0 - od_x):max(0, x1 - od_x), 3] = 0
        al = kaw[..., 3] > 8
        ys = np.nonzero(al.any(1))[0]; xs = np.nonzero(al.any(0))[0]
        lewo = max(lewo, os_x - (od_x + xs[0])); prawo = max(prawo, od_x + xs[-1] + 1 - os_x)
        gora = max(gora, spod - ys[0])
        wycinki.append((kaw, od_x, os_x, spod))
    pol = max(lewo, prawo)
    cw = int(np.ceil(pol * 2 * sk)) + 2; ch = int(np.ceil(gora * sk)) + 6
    dol = 3
    arkusz = Image.new("RGBA", (cw * len(klatki), ch), (0, 0, 0, 0))
    for nr, (kaw, od_x, os_x, spod) in enumerate(wycinki):
        im = Image.fromarray(kaw, "RGBA")
        # premultiplikacja przy skalowaniu: inaczej krawędź ciągnie kolor przezroczystych pikseli
        pa = np.array(im).astype(np.float32); pa[..., :3] *= pa[..., 3:4] / 255
        pm = Image.fromarray(pa.round().astype(np.uint8), "RGBA")
        nowy = (max(1, round(pm.width * sk)), max(1, round(pm.height * sk)))
        pm = pm.resize(nowy, Image.LANCZOS)
        pb = np.array(pm).astype(np.float32); al = np.maximum(pb[..., 3:4], 1)
        pb[..., :3] = np.clip(pb[..., :3] * 255 / al, 0, 255)
        mal = Image.fromarray(pb.round().astype(np.uint8), "RGBA")
        x = cw * nr + round(cw / 2 - (os_x - od_x) * sk)
        y = round(ch - dol - spod * sk)
        arkusz.alpha_composite(przytnij(mal, x, y, arkusz.size), (max(0, x), max(0, y)))
    return arkusz, cw, ch, dol


def przytnij(im, x, y, roz):
    lx, gy = max(0, -x), max(0, -y)
    px = min(im.width, roz[0] - x); py = min(im.height, roz[1] - y)
    return im.crop((lx, gy, px, py))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rodzaj", required=True, choices=list(ARKUSZE)); ap.add_argument("--wej", required=True); ap.add_argument("--wyj"); ap.add_argument("--podglad"); ap.add_argument("--wys", type=int, default=230); ap.add_argument("--jakosc", type=int, default=86); ap.add_argument("--tajne", action="store_true"); ap.add_argument("--raport", action="store_true"); ap.add_argument("--animacja", type=int, help="zamiast arkusza animowany WebP, czas klatki w ms")
    o = ap.parse_args()
    if o.tajne:
        for sc in [p for p in (o.wyj, o.podglad) if p]:
            kat = os.path.dirname(os.path.abspath(sc))
            while True:
                if os.path.exists(os.path.join(kat, ".git")): raise SystemExit("ODMOWA: rysunek jest tajny do startu, a to repozytorium: " + sc)
                g = os.path.dirname(kat)
                if g == kat: break
                kat = g
    cfg = ARKUSZE[o.rodzaj]
    rgb = np.array(Image.open(o.wej).convert("RGB"))
    rap = [] if o.raport else None
    tlo = maska_tla(rgb, cfg, rap)
    if rap is not None:
        for r in sorted(rap): print(r)
    if o.podglad:
        pod = rgb.copy(); pod[tlo] = (255, 0, 200)
        Image.fromarray(pod).save(o.podglad)
    if not o.wyj: return
    rgba = wytnij_alfa(bez_znaku_na_butach(rgb, cfg), tlo)
    arkusz, cw, ch, dol = skladaj(rgba, cfg, o.wys)
    if o.animacja:
        # Jeden plik, jeden adres: <img> na mapie i Ulicy animuje sam. Wspólne kadrowanie, żeby rower nie skakał między klatkami.
        klatki = [arkusz.crop((cw * i, 0, cw * (i + 1), ch)) for i in range(len(cfg["klatki"]))]
        box = None
        for k in klatki:
            bb = k.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
            box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
        klatki = [k.crop(box) for k in klatki]
        klatki[0].save(o.wyj, save_all=True, append_images=klatki[1:], duration=o.animacja, loop=0, lossless=False, quality=o.jakosc, method=6, alpha_quality=92, minimize_size=True)
        print("zapisano", os.path.basename(o.wyj), os.path.getsize(o.wyj) // 1024, "KB,", klatki[0].size, len(klatki), "klatek")
        return
    arkusz.save(o.wyj, lossless=False, quality=o.jakosc, method=6, alpha_quality=92)
    print("zapisano", o.wyj.replace("\\", "/").split("/")[-1], os.path.getsize(o.wyj) // 1024, "KB, cw", cw, "ch", ch, "n", len(cfg["klatki"]), "dol", dol)


if __name__ == "__main__":
    main()
