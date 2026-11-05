"""Nowości do gry (gra-nowosci.zip od Filipa, 5.11) -> WebP. Tło przez te same funkcje co reszta grafik gry.

    python -I tools/gra-nowosci-grafiki.py --wejscie <katalog z PNG> --gra assets/gra --reszta <katalog na to, czego gra jeszcze nie używa>

Rower rowerzysty w każdym arkuszu ma kolor z jego pierwszego arkusza (rowerzysta_bieg): rama żółta z arkusza rakiety -> ta sama zieleń. Maska po odcieniu w ramce roweru, żeby nie ruszyć kasku, kamizelki ani przyczepki.
"""
import argparse, colorsys, importlib.util, json, os
import numpy as np
from PIL import Image


def wczytaj_ulice():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ulica-grafiki.py")
    s = importlib.util.spec_from_file_location("ulica_grafiki", p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m


U = wczytaj_ulice()
ZIELEN_RAMY = (176 / 255, 224 / 255, 0)
# w pikselach oryginału: klatka i ramka samego roweru w klatce
KLATKI_RAKIETY = [
    {"k": (11, 206, 348, 554), "rower": (195, 395, 345, 545)},
    {"k": (369, 206, 733, 554), "rower": (590, 365, 730, 512)},
    {"k": (755, 206, 1097, 554), "rower": (955, 335, 1095, 440)},
    {"k": (1118, 206, 1477, 554), "rower": (1315, 345, 1460, 465)},
    {"k": (1482, 206, 1862, 554), "rower": (1660, 400, 1830, 545)},
    {"k": (1911, 206, 2161, 554), "rower": None},
]
POJEDYNCZE = {
    "przeszkody-2.png": {"bloto": (60, 200, 435, 400), "tasma": (465, 165, 880, 395), "opona": (910, 130, 1262, 395), "taczka": (1340, 118, 1755, 400), "wozek": (45, 505, 410, 825), "widlak": (415, 490, 882, 825), "paleta": (920, 660, 1300, 810)},
    "przedmioty-2.png": {"magnes": (20, 195, 370, 535), "latarka": (375, 205, 755, 505), "kubek": (770, 200, 1055, 520), "rekawica": (1085, 190, 1400, 530), "kaczka": (1430, 210, 1790, 515), "plecak": (1815, 195, 2160, 535)},
    "trasa-postacie.png": {"wedkarz": (1045, 290, 1532, 625)},
}
ODBIJ = {"opona"}
# arkusze: równe klatki, wyrównane do stóp
ARKUSZE = {
    "gesi": ("trasa-postacie.png", [(20, 60, 500, 255), (525, 60, 990, 255), (1010, 60, 1515, 255)], False),
    "gesi_lot": ("trasa-postacie.png", [(10, 305, 480, 580), (500, 365, 980, 580)], False),
    "piatka": ("trasa-postacie.png", [(5, 645, 235, 930), (240, 645, 495, 930)], True),
    "druzyna": ("trasa-postacie.png", [(515, 685, 1028, 938), (1030, 685, 1532, 938)], False),
}


def bez_tla(o):
    w = U.wytnij_tlo(o.convert("RGBA"))
    return w[0] if isinstance(w, tuple) else w


def bez_bieli_w_srodku(o, ramka=None, prog=246, min_px=10):
    """Biel zamknięta w obrazku (środek opony, trójkąt ramy, szpary palety). wytnij_tlo zostawia ją, bo jednolicie jasny fragment bywa częścią obiektu, więc tylko tam, gdzie wiadomo, że to dziura."""
    a = np.array(o); m = (a[..., 3] > 0) & (a[..., :3].min(axis=2) >= prog)
    if ramka:
        z = np.zeros_like(m); z[max(0, ramka[1]):ramka[3], max(0, ramka[0]):ramka[2]] = True; m &= z
    lab = U.skladowe(m)
    lab = lab[0] if isinstance(lab, tuple) else lab
    for n in np.unique(lab):
        if n == 0: continue
        w = lab == n
        if int(w.sum()) >= min_px: a[..., 3][w] = 0
    return Image.fromarray(a)


DZIURY = {"opona", "taczka", "widlak", "wozek", "paleta", "tasma"}


def zapisz(o, kat, nazwa):
    o.save(os.path.join(kat, nazwa + ".webp"), "WEBP", quality=82, method=6)
    return {"src": nazwa + ".webp"}


def przemaluj_rower(o, ramka, r0):
    a = np.array(o).astype(np.float32)
    x0, y0, x1, y1 = [ramka[0] - r0[0], ramka[1] - r0[1], ramka[2] - r0[0], ramka[3] - r0[1]]
    hc = colorsys.rgb_to_hsv(*ZIELEN_RAMY)[0]
    ile = 0
    for y in range(max(0, y0), min(a.shape[0], y1)):
        for x in range(max(0, x0), min(a.shape[1], x1)):
            r, g, b, al = a[y, x]
            if al < 30: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.09 <= h <= 0.17 and s >= 0.45 and v >= 0.45:
                nr, ng, nb = colorsys.hsv_to_rgb(hc, min(1, s), v)
                a[y, x, :3] = [nr * 255, ng * 255, nb * 255]; ile += 1
    return Image.fromarray(a.astype(np.uint8)), ile


def arkusz(klatki):
    """Jedna wielkość klatki, stopy na dole, środek w poziomie."""
    cw = max(k.width for k in klatki); ch = max(k.height for k in klatki)
    kan = Image.new("RGBA", (cw * len(klatki), ch), (0, 0, 0, 0))
    for i, k in enumerate(klatki):
        kan.paste(k, (i * cw + (cw - k.width) // 2, ch - k.height), k)
    return kan, cw, ch


def main():
    a = argparse.ArgumentParser(); a.add_argument("--wejscie", required=True); a.add_argument("--gra", required=True); a.add_argument("--reszta", required=True); a.add_argument("--podglad")
    o = a.parse_args(); os.makedirs(o.reszta, exist_ok=True)
    wynik = {}
    W_GRZE = {"druzyna"}
    for plik, wyc in POJEDYNCZE.items():
        im = Image.open(os.path.join(o.wejscie, plik)).convert("RGBA")
        for nazwa, r in wyc.items():
            w = bez_tla(im.crop(r))
            if nazwa in DZIURY: w = bez_bieli_w_srodku(w)
            w = U.przytnij(w)
            if nazwa in ODBIJ: w = w.transpose(Image.FLIP_LEFT_RIGHT)
            zapisz(w, o.reszta, nazwa); wynik[nazwa] = {"src": nazwa + ".webp", "w": w.width, "h": w.height}
    for nazwa, (plik, ramki, odbij) in ARKUSZE.items():
        im = Image.open(os.path.join(o.wejscie, plik)).convert("RGBA")
        kl = []
        for r in ramki:
            w = bez_tla(im.crop(r))
            if nazwa == "druzyna": w = bez_bieli_w_srodku(w, prog=250, min_px=120)   # szpary między biegaczami; białe czapki mają cień, więc zostają
            w = U.przytnij(w)
            if odbij: w = w.transpose(Image.FLIP_LEFT_RIGHT)
            kl.append(w)
        ark, cw, ch = arkusz(kl)
        zapisz(ark, o.gra if nazwa in W_GRZE else o.reszta, nazwa)
        wynik[nazwa] = {"src": nazwa + ".webp", "cw": cw, "ch": ch, "n": len(kl), "dol": 3}
    im = Image.open(os.path.join(o.wejscie, "slawek-rakieta.png")).convert("RGBA")
    kl, ile = [], []
    for k in KLATKI_RAKIETY:
        w = bez_tla(im.crop(k["k"]))
        if k["rower"]:
            w, n = przemaluj_rower(w, k["rower"], k["k"]); ile.append(n)
            r0 = k["k"]; rw = k["rower"]; w = bez_bieli_w_srodku(w, (rw[0] - r0[0], rw[1] - r0[1], rw[2] - r0[0], rw[3] - r0[1]))
        kl.append(U.przytnij(w))
    ark, cw, ch = arkusz(kl[:5])
    zapisz(ark, o.reszta, "rowerzysta_rakieta"); zapisz(kl[5], o.reszta, "przyczepka_rakieta")
    wynik["rowerzysta_rakieta"] = {"src": "rowerzysta_rakieta.webp", "cw": cw, "ch": ch, "n": 5, "dol": 3, "przemalowane": ile}
    wynik["przyczepka_rakieta"] = {"src": "przyczepka_rakieta.webp", "w": kl[5].width, "h": kl[5].height}
    print(json.dumps(wynik, ensure_ascii=False))
    if o.podglad:
        pod = Image.new("RGB", (ark.width, ark.height + 220), (120, 160, 190))
        pod.paste(ark, (0, 0), ark)
        b = Image.open(os.path.join(o.gra, "rowerzysta_bieg.webp")).convert("RGBA")
        pod.paste(b, (0, ark.height + 5), b)
        pod.save(o.podglad)


if __name__ == "__main__":
    main()
