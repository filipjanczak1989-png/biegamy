# Rysunek postaci w koparce: usuwa ciemne tło i poświatę, odcina rękę i składa animowany WebP (jeden plik, jeden adres, machanie bez kodu na stronach).
# Plik wejściowy i wynik są TAJNE do startu, a repo jest publiczne: narzędzie odmawia zapisu w katalogu z .git (blizna-155). W repo nie ma rysunku, są tylko liczby.
# Uruchomienie: python -I -X utf8 tools/rysunek-koparki.py --wej <plik.png> --wyj <plik.webp> [--podglad <plik.png>] [--szer 900]
import argparse, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Współrzędne w pikselach źródła 1536×1024. Główny ruch daje dłoń w nadgarstku, przedramię rusza się lekko, żeby przy rękawie nie było szwu. Rękaw kładziony na wierzch.
REKA = [(195, 262), (288, 262), (300, 288), (318, 294), (352, 300), (353, 340), (346, 368), (360, 386), (392, 404), (397, 408), (403, 418), (410, 434), (413, 450), (411, 468), (403, 490), (398, 497), (355, 484), (318, 464), (300, 436), (280, 414), (250, 411), (200, 408)]
DLON = [(195, 262), (288, 262), (300, 288), (318, 294), (352, 300), (353, 340), (346, 368), (334, 376), (301, 420), (280, 414), (250, 411), (200, 408)]
DLON_WYCIECIE = [(190, 258), (288, 258), (300, 284), (318, 290), (356, 296), (357, 340), (349, 370), (330, 372), (297, 417), (280, 418), (250, 415), (195, 412)]   # to samo, z zakładką na skórze przy nadgarstku
RDZEN_REKI = [(404, 430), (432, 442), (432, 468), (406, 478)]   # skóra pod rękawem: odsłania się przy obrocie, więc musi istnieć
REKAW = [(392, 402), (450, 408), (486, 470), (486, 545), (420, 530), (376, 503), (376, 490), (398, 497), (403, 490), (411, 468), (413, 450), (410, 434), (403, 418), (397, 408)]
OS = (414, 458)
NADGARSTEK = (316, 390)
SKORA = (250, 192, 140)
# Słupek kabiny za ręką: czarny kontur, szary pas, ciemny pas. (y=376 → y=476)
SLUPEK = [((344, 376), (408, 376), (374, 476), (306, 476), (14, 13, 15)), ((358, 376), (382, 376), (345, 476), (322, 476), (98, 96, 104)), ((382, 376), (404, 376), (362, 476), (345, 476), (46, 44, 50))]
CZARNY = 0.06           # jasność konturu
JASNOSC_POSWIATY = 0.45
NASIONA = [(790, 600), (770, 1068), (812, 1110), (852, 1088)]   # (y, x): korpus koparki i trzy kamyczki pod łyżką
GRUBOSC_KONTURU = 7     # promień próby grubości: kontur ma ok. 9 px, dalekie tło setki
PRZESWITY = [(370, 700), (406, 1308), (600, 790)]   # (y, x): wnętrze kabiny, szczelina przy siłowniku, kabina za dźwignią
KATY = {"klatek": 12, "ramie_srodek": 2.0, "ramie": 4.5, "dlon": 13.0, "ms": 100}


def rozszerz(m, r):
    w = m.copy()
    for i in range(r):
        n = w.copy()
        n[1:] |= w[:-1]; n[:-1] |= w[1:]; n[:, 1:] |= w[:, :-1]; n[:, :-1] |= w[:, 1:]
        if i % 2:
            n[1:, 1:] |= w[:-1, :-1]; n[:-1, :-1] |= w[1:, 1:]; n[1:, :-1] |= w[:-1, 1:]; n[:-1, 1:] |= w[1:, :-1]
        w = n
    return w


def scieraj(m, r):
    return ~rozszerz(~m, r)


def zalanie(wolne, start):
    """Spójny obszar `wolne` od punktów `start`. Bajty zamiast tablicy numpy: milion pikseli w pętli Pythona."""
    h, w = wolne.shape
    pole = bytearray(wolne.astype(np.uint8).tobytes())
    odw = bytearray(h * w)
    stos = []
    for y, x in start:
        i = y * w + x
        if pole[i] and not odw[i]: odw[i] = 1; stos.append(i)
    while stos:
        i = stos.pop()
        y, x = divmod(i, w)
        if x > 0 and pole[i - 1] and not odw[i - 1]: odw[i - 1] = 1; stos.append(i - 1)
        if x < w - 1 and pole[i + 1] and not odw[i + 1]: odw[i + 1] = 1; stos.append(i + 1)
        if y > 0 and pole[i - w] and not odw[i - w]: odw[i - w] = 1; stos.append(i - w)
        if y < h - 1 and pole[i + w] and not odw[i + w]: odw[i + w] = 1; stos.append(i + w)
    return np.frombuffer(bytes(odw), dtype=np.uint8).reshape(h, w).astype(bool)


def wielokat(rozm, pkt, sk=4):
    m = Image.new("L", (rozm[0] * sk, rozm[1] * sk), 0)
    ImageDraw.Draw(m).polygon([(x * sk, y * sk) for x, y in pkt], fill=255)
    return m.resize(rozm, Image.LANCZOS)


def premul_obrot(warstwa, kat, os):
    a = np.array(warstwa).astype(np.float32) / 255
    a[..., :3] *= a[..., 3:4]
    r = Image.fromarray((a * 255).round().astype(np.uint8), "RGBA").rotate(kat, resample=Image.BICUBIC, center=os)
    b = np.array(r).astype(np.float32) / 255
    al = np.maximum(b[..., 3:4], 1e-4)
    b[..., :3] = np.clip(b[..., :3] / al, 0, 1)
    return Image.fromarray((b * 255).round().astype(np.uint8), "RGBA")


def wytnij_tlo(rgb):
    """Tło to poświata plus dalekie czernie. Poświata bywa szara, a dalekie tło jest czarne jak kontur, więc kolor nie wystarczy:
    daleką czerń poznajemy po grubości (kontur ma ok. 9 px), a zalewanie po poświacie zatrzymuje się na czarnym konturze."""
    v = rgb.max(-1) / 255.0
    czarne = v < CZARNY
    gruba = rozszerz(scieraj(czarne, GRUBOSC_KONTURU), GRUBOSC_KONTURU)
    h, w = czarne.shape
    brzeg = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
    daleka = zalanie(gruba, [p for p in brzeg if gruba[p]])
    # Poświata nie jest jasna: jasny piksel to już rysunek, nawet gdy jego kontur ma przerwę (kamyczki pod łyżką).
    poswiata = (~czarne) & (v < JASNOSC_POSWIATY)
    tlo = zalanie(poswiata | daleka, brzeg)
    # Dziury w rysunku zostają rysunkiem (oczy, kratka, ziemia w łyżce). Prześwit tylko we wskazanych punktach.
    przeswit = zalanie(poswiata, PRZESWITY)
    print("tło", round(float(tlo.mean()) * 100, 1), "%, prześwity", int(przeswit.sum()), "px, rysunek", round(float((~(tlo | przeswit)).mean()) * 100, 1), "%")
    # Szum na granicy progu rysuje w tle cienkie kreski: zostaje tylko to, co łączy się z rysunkiem, i kamyczki.
    maska = ~(tlo | przeswit)
    for y, x in NASIONA:
        if not maska[y, x]: raise SystemExit(f"nasiono ({y},{x}) poza rysunkiem: rysunek ma inny kadr, niż zakłada to narzędzie")
    maska = rozszerz(scieraj(maska, 1), 1)   # kreska szumu ma 1-2 px, kontur 9 px: otwarcie odcina ją od rysunku
    return zalanie(maska, NASIONA)


def zloz(wej, szer, podglad):
    zrodlo = Image.open(wej).convert("RGB")
    rgb = np.array(zrodlo)
    maska = wytnij_tlo(rgb)
    h, w = maska.shape
    # Oczyszczenie krawędzi: pas 2 px przy brzegu maski nie może nieść pomarańczu poświaty.
    v = rgb.max(-1) / 255.0
    brzeg = maska & ~scieraj(maska, 2)
    czysty = rgb.copy()
    czysty[brzeg & (v < 0.42)] = (10, 9, 11)
    alfa = Image.fromarray((maska * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
    pelny = Image.fromarray(czysty, "RGB").convert("RGBA"); pelny.putalpha(alfa)
    rozm = (w, h)
    m_reka = wielokat(rozm, REKA)
    # warstwy ręki: przedramię ze skórą wchodzącą pod rękaw i dłoń z miękkim cięciem w nadgarstku, żeby nie było kreski na skórze
    m_dlon = wielokat(rozm, DLON).filter(ImageFilter.GaussianBlur(1.6))
    przedramie = Image.new("RGBA", rozm, (0, 0, 0, 0))
    ImageDraw.Draw(przedramie).polygon(RDZEN_REKI, fill=SKORA + (255,))
    m_przedr = np.minimum(np.array(m_reka), 255 - np.array(wielokat(rozm, DLON_WYCIECIE)))
    z_reka = pelny.copy(); z_reka.putalpha(Image.fromarray(np.minimum(np.array(alfa), m_przedr), "L"))
    przedramie.alpha_composite(z_reka)
    dlon = pelny.copy(); dlon.putalpha(Image.fromarray(np.minimum(np.array(alfa), np.array(m_dlon)), "L"))
    # podstawa: bez ręki, ze słupkiem kabiny tam, gdzie ręka go zasłaniała
    baza = pelny.copy()
    b = np.array(baza); b[..., 3] = (b[..., 3].astype(np.float32) * (1 - np.array(m_reka) / 255.0)).astype(np.uint8)
    baza = Image.fromarray(b, "RGBA")
    slupek = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0)); ds = ImageDraw.Draw(slupek)
    for a1, a2, a3, a4, kol in SLUPEK: ds.polygon([(a1[0] * 2, a1[1] * 2), (a2[0] * 2, a2[1] * 2), (a3[0] * 2, a3[1] * 2), (a4[0] * 2, a4[1] * 2)], fill=kol + (255,))
    slupek = slupek.resize(rozm, Image.LANCZOS)
    pod = Image.new("RGBA", rozm, (0, 0, 0, 0)); pod.alpha_composite(slupek); pod.alpha_composite(baza)
    baza = pod
    rekaw = pelny.copy(); rekaw.putalpha(Image.fromarray(np.minimum(np.array(alfa), np.array(wielokat(rozm, REKAW))), "L"))
    klatki = []
    for i in range(KATY["klatek"]):
        faza = math.sin(2 * math.pi * i / KATY["klatek"])
        reka = przedramie.copy(); reka.alpha_composite(premul_obrot(dlon, KATY["dlon"] * faza, NADGARSTEK))
        k = Image.new("RGBA", rozm, (0, 0, 0, 0)); k.alpha_composite(baza); k.alpha_composite(premul_obrot(reka, KATY["ramie_srodek"] + KATY["ramie"] * faza, OS)); k.alpha_composite(rekaw)
        klatki.append(k)
    # wspólne kadrowanie, jedna skala
    box = None
    for k in klatki:
        bb = k.getchannel("A").point(lambda p: 255 if p > 8 else 0).getbbox()
        box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
    box = (max(0, box[0] - 4), max(0, box[1] - 4), min(w, box[2] + 4), min(h, box[3] + 4))
    sk = szer / (box[2] - box[0])
    rozm2 = (szer, round((box[3] - box[1]) * sk))
    print("kadr", box, "wynik", rozm2, "łyżka na ułamku szerokości i wysokości:", round((1230 - box[0]) / (box[2] - box[0]), 3), round((600 - box[1]) / (box[3] - box[1]), 3))
    male = [k.crop(box).resize(rozm2, Image.LANCZOS) for k in klatki]
    if podglad:
        pod_w = Image.new("RGB", (rozm2[0] * 3 // 2 + 20, rozm2[1] // 2 * 2 + 10), (40, 40, 48))
        tla = [(250, 196, 138), (112, 170, 230), (13, 12, 18), (120, 128, 145), (255, 255, 255), (90, 150, 90)]
        for i, kl in enumerate([0, 3, 9, 6, 0, 3]):
            t = Image.new("RGBA", rozm2, tla[i] + (255,)); t.alpha_composite(male[kl])
            t = t.resize((rozm2[0] // 2, rozm2[1] // 2), Image.LANCZOS).convert("RGB")
            pod_w.paste(t, ((i % 3) * (rozm2[0] // 2 + 5), (i // 3) * (rozm2[1] // 2 + 5)))
        pod_w.save(podglad)
    return male


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wej", required=True); ap.add_argument("--wyj", required=True); ap.add_argument("--podglad"); ap.add_argument("--szer", type=int, default=900); ap.add_argument("--jakosc", type=int, default=84)
    o = ap.parse_args()
    for sciezka in [o.wyj] + ([o.podglad] if o.podglad else []):
        kat = os.path.dirname(os.path.abspath(sciezka))
        while True:
            if os.path.exists(os.path.join(kat, ".git")): raise SystemExit("ODMOWA: rysunek jest tajny do startu, a to repozytorium: " + sciezka)
            g = os.path.dirname(kat)
            if g == kat: break
            kat = g
    male = zloz(o.wej, o.szer, o.podglad)
    male[0].save(o.wyj, save_all=True, append_images=male[1:], duration=KATY["ms"], loop=0, lossless=False, quality=o.jakosc, method=6, alpha_quality=90, minimize_size=True)
    print("zapisano", os.path.getsize(o.wyj) // 1024, "KB,", len(male), "klatek")


if __name__ == "__main__":
    main()
