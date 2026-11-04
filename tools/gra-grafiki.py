"""Grafiki gry Cegiełki: arkusze PNG z Downloads (gra.zip, gra-kasia*.zip, gra-filip*.zip) -> assets/gra/*.webp + assets/gra/atlas.json.
Tło: te same funkcje co tools/ulica-grafiki.py (szachownica, biel, prawdziwa alfa). Klatki: kawałek należy do klatki swojego środka ciężkości, nie do pasa kolumn.
Wyrównanie po stopach i środku ciężkości, jedna skala dla postaci we wszystkich arkuszach, żeby przemiana w locie była płynna.
    python -I tools/gra-grafiki.py --zrodla <katalog z PNG> --zrodla_ulicy <katalog> --wyjscie assets/gra
⚠️ Żadnych wież, kościołów ani znaków kierunku w grafikach (sekret wyprawy).
"""
import argparse, importlib.util, json, os
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

def wczytaj_ulice():
    tu = os.path.dirname(os.path.abspath(__file__))
    for p in [os.path.join(tu, "ulica-grafiki.py"), os.path.join(tu, "..", "..", "biegamy-ulica", "tools", "ulica-grafiki.py")]:
        if os.path.exists(p):
            s = importlib.util.spec_from_file_location("ulica_grafiki", p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
    raise SystemExit("brak tools/ulica-grafiki.py")
U = wczytaj_ulice()

def rozdziel(o, n):
    """Tyle obiektów, ile trzeba: najpierw po pustych kolumnach, a zbite obiekty po najpustszej kolumnie koło równego podziału."""
    a = np.array(o); alfa = a[..., 3]; W = o.width
    kol = (alfa > 40).sum(axis=0).astype(np.float32)
    granice = [0]
    for i in range(1, n):
        ideal = i * W / n
        p, q = int(ideal - W / n * 0.28), int(ideal + W / n * 0.28)
        granice.append(p + int(np.argmin(kol[p:q] + np.abs(np.arange(p, q) - ideal) * 0.02)))
    granice.append(W)
    srodki = np.array(granice[1:-1])
    lab = U.skladowe(alfa > 8)
    ys, xs = np.nonzero(lab)
    l = lab[ys, xs]; L = int(lab.max()) + 1
    ile = np.bincount(l, minlength=L).astype(np.float64)
    sr = np.bincount(l, weights=xs, minlength=L) / np.maximum(ile, 1)
    xmin = np.full(L, W); xmax = np.zeros(L, dtype=np.int64)
    np.minimum.at(xmin, l, xs); np.maximum.at(xmax, l, xs)
    slot = np.searchsorted(srodki, sr, side="right")
    szeroka = (xmax - xmin) > (W / n) * 1.35
    kolumna = np.searchsorted(srodki, xs, side="right")
    wyj = []
    for i in range(n):
        m = np.zeros(alfa.shape, dtype=bool)
        m[ys, xs] = ((slot[l] == i) & ~szeroka[l] & (ile[l] >= 14)) | (szeroka[l] & (kolumna == i))
        b = a.copy(); b[..., 3] = np.where(m, alfa, 0)
        wyj.append(Image.fromarray(b))
    return wyj

def obiekty(o, n):
    al = np.array(o)[..., 3] > 40
    kol = al.sum(axis=0)
    xs = np.where(kol > 0)[0]
    grupy, start = [], xs[0]
    for a, b in zip(xs[:-1], xs[1:]):
        if b - a > 1:
            grupy.append((start, a + 1)); start = b
    grupy.append((start, xs[-1] + 1))
    grupy = [g for g in grupy if kol[g[0]:g[1]].sum() >= kol.sum() * 0.002]
    while len(grupy) > n:
        i = int(np.argmin([grupy[k + 1][0] - grupy[k][1] for k in range(len(grupy) - 1)]))
        grupy[i:i + 2] = [(grupy[i][0], grupy[i + 1][1])]
    if len(grupy) != n:
        return [U.przytnij(k) for k in rozdziel(o, n)]
    return [U.przytnij(o.crop((a, 0, b, o.height))) for a, b in grupy]

def obrys(o, kolor, px, miekko=0.7):
    """Obrys wypalony w pliku: na telefonie canvas nie ma tanich filtrów, a Safari długo nie miał ctx.filter. Wynik jest większy o px z każdej strony."""
    w = Image.new("RGBA", (o.width + 2 * px, o.height + 2 * px), (0, 0, 0, 0))
    w.paste(o, (px, px), o)
    al = w.getchannel("A").filter(ImageFilter.MaxFilter(2 * px + 1)).filter(ImageFilter.GaussianBlur(miekko))
    tlo = Image.new("RGBA", w.size, kolor + (0,)); tlo.putalpha(al)
    tlo.alpha_composite(w)
    return tlo

def stonuj(o, nasycenie, kontrast, jasnosc, rozmycie=0.0):
    """Warstwa tła: mniej koloru i kontrastu, lekkie rozmycie, przyciemnienie. Alfa bez zmian, poza krawędzią z rozmycia."""
    a = o.getchannel("A") if o.mode == "RGBA" else None
    r = o.convert("RGB")
    r = ImageEnhance.Color(r).enhance(nasycenie)
    r = ImageEnhance.Contrast(r).enhance(kontrast)
    r = ImageEnhance.Brightness(r).enhance(jasnosc)
    if a is None:
        return r
    r = r.convert("RGBA"); r.putalpha(a)
    if rozmycie:
        r = r.filter(ImageFilter.GaussianBlur(rozmycie))
    return r

DOL_OBRYSU = 2
def wyrownaj(fr, skala):
    """Komórka: stopy na dole, środek ciężkości w środku komórki, jasny obrys, żeby ciemny strój nie ginął w nocy."""
    wyn = []
    for f in fr:
        x0, y0, x1, y1 = U.bbox(f)
        c = f.crop((x0, y0, x1, y1))
        al = np.array(c)[..., 3].astype(np.float32)
        wyn.append((c, float((al.sum(axis=0) * np.arange(c.width)).sum() / max(1, al.sum()))))
    lewa = max(s for _, s in wyn); prawa = max(c.width - s for c, s in wyn); wys = max(c.height for c, _ in wyn)
    cw, ch = int(lewa + prawa) + 4, wys + 2
    out = []
    for c, s in wyn:
        kom = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        kom.paste(c, (int(lewa - s) + 2, ch - c.height - 1), c)
        mala = kom.resize((max(1, round(cw * skala)), max(1, round(ch * skala))), Image.LANCZOS)
        out.append(obrys(mala, (255, 255, 255), DOL_OBRYSU, 0.5))
    return out

def pasek(fr, sc, q=80):
    cw, ch = fr[0].size
    p = Image.new("RGBA", (cw * len(fr), ch), (0, 0, 0, 0))
    for i, f in enumerate(fr):
        p.paste(f, (i * cw, 0))
    p.save(sc, "WEBP", quality=q, alpha_quality=85, method=6)
    return cw, ch

def zapisz_obraz(o, sc, q=80):
    o.save(sc, "WEBP", quality=q, alpha_quality=85, method=6)

def main():
    a = argparse.ArgumentParser(); a.add_argument("--zrodla", required=True); a.add_argument("--zrodla_ulicy", default=os.path.expanduser("~/Downloads/ulica-zrodla")); a.add_argument("--wyjscie", default="assets/gra"); arg = a.parse_args()
    os.makedirs(arg.wyjscie, exist_ok=True)
    wez = lambda n: U.wytnij_tlo(Image.open(os.path.join(arg.zrodla, n)))[0]
    atlas = {}
    CEL_WYS = 210
    WYS_POZY = {"A": 230, "B": 235, "C": 225, "D": 195, "E": 205, "F": 235, "G": 240, "H": 270, "I": 225}
    POSTACIE = {
        "kasia": {"bieg": ("kasia-bieg.png", 6), "bud": ("kasia-budowniczka-bieg.png", 6), "A": ("kasia-A-skok.png", 6), "B": ("kasia-B-salto.png", 6), "C": ("kasia-C-triki.png", 6), "D": ("kasia-D-wywrotki.png", 6), "E": ("kasia-E-wpadki.png", 6), "F": ("kasia-F-emocje.png", 6), "G": ("kasia-G-przemiana.png", 6), "H": ("kasia-H-ulepszenia.png", 6), "I": ("kasia-I-meta.png", 6)},
        "filip": {"bieg": ("biegacz-bieg.png", 6), "bud": ("budowniczy-bieg.png", 6), "A": ("biegacz-A-skok.png", 6), "B": ("biegacz-B-salto.png", 6), "C": ("biegacz-C-triki.png", 6), "D": ("biegacz-D-wywrotki.png", 6), "E": ("biegacz-E-wpadki.png", 6), "F": ("biegacz-F-emocje.png", 6), "G": ("biegacz-G-przemiana.png", 6), "H": ("biegacz-H-ulepszenia.png", 4), "I": ("biegacz-I-meta.png", 6)},
    }
    for postac, arkusze in POSTACIE.items():
        # jedna skala: wysokość stojącej postaci z biegu = CEL_WYS; każdy arkusz ma tę samą skalę, bo rysowane są w tej samej wielkości
        surowe = {k: rozdziel(wez(p), n) for k, (p, n) in arkusze.items()}
        med = float(np.median([U.bbox(f)[3] - U.bbox(f)[1] for f in surowe["bieg"]]))
        skala_bieg = CEL_WYS / med
        for k, fr in surowe.items():
            if k == "bud":
                sk = CEL_WYS / float(np.median([U.bbox(f)[3] - U.bbox(f)[1] for f in fr]))
            elif k == "bieg":
                sk = skala_bieg
            else:
                # każdy arkusz ma inną skalę: najwyższa klatka dostaje wysokość pozy, ta sama u obu postaci
                sk = WYS_POZY[k] / max(U.bbox(f)[3] - U.bbox(f)[1] for f in fr)
            wyr = wyrownaj(fr, sk)
            n = f"{postac}_{k}"
            cw, ch = pasek(wyr, os.path.join(arg.wyjscie, n + ".webp"))
            atlas[n] = {"src": n + ".webp", "cw": cw, "ch": ch, "n": len(wyr), "dol": DOL_OBRYSU + 1, "postac": postac}
    for nazwy, plik, wys in ((["pacholek", "barierka", "kaluza", "worki", "kamien"], "przeszkody.png", 150), (["cegla", "cegla_zlota", "kask", "bidon", "but", "zel"], "przedmioty.png", 96), (["k1", "k2", "k3", "k4"], "kibice.png", 230)):
        ob = obiekty(wez(plik), len(nazwy))
        sk = wys / max(o.height for o in ob)
        for n, o in zip(nazwy, ob):
            r = o.resize((max(1, round(o.width * sk)), max(1, round(o.height * sk))), Image.LANCZOS)
            margines = 0
            if n in ("pacholek", "barierka", "kaluza", "worki", "kamien"):   # przeszkody: ciemny obrys, stoją nieruchomo
                margines = 6; r = obrys(r, (14, 16, 34), margines)
            elif n in ("cegla", "cegla_zlota", "kask", "bidon", "but", "zel"):   # do zbierania: biały obrys, 2–3 px na ekranie
                margines = 6; r = obrys(r, (255, 255, 255), margines)
            else:
                r = stonuj(r, 0.78, 0.92, 0.95)   # kibice: mniej krzykliwi od tego, co trzeba zebrać
            zapisz_obraz(r, os.path.join(arg.wyjscie, n + ".webp"), 82)
            atlas[n] = {"src": n + ".webp", "w": r.width, "h": r.height, "dol": margines}
    w = U.przytnij(wez("wywrotka.png")); r = stonuj(w.resize((360, round(w.height * 360 / w.width)), Image.LANCZOS), 0.6, 0.85, 0.9, 0.7)
    zapisz_obraz(r, os.path.join(arg.wyjscie, "wywrotka.webp"), 80); atlas["wywrotka"] = {"src": "wywrotka.webp", "w": r.width, "h": r.height}
    # krajobraz: pętla bez szwu przez przenikanie, stonowany najmocniej, bo jest najdalej
    mapa = {x["i"]: x["plik"] for x in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gra-grafiki-mapa.json")))}
    daleki = U.wytnij_tlo(Image.open(os.path.join(os.path.expanduser("~/Downloads"), mapa[9])))[0]
    for n, zrodlo, wys, ton in (("krajobraz", wez("tlo-krajobraz.png"), 300, (0.55, 0.8, 0.86, 1.0)), ("krajobraz_daleki", daleki, 300, (0.5, 0.75, 0.9, 1.4))):
        o = U.przytnij(zrodlo, 0)
        arr = np.array(o); al = Image.fromarray(arr[..., 3]).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(1.5)); arr[..., 3] = np.array(al)
        tk = Image.fromarray(U.przenikanie(arr, min(180, arr.shape[1] // 6)))
        r = stonuj(tk.resize((round(tk.width * wys / tk.height), wys), Image.LANCZOS), *ton)
        zapisz_obraz(r, os.path.join(arg.wyjscie, n + ".webp"), 76); atlas[n] = {"src": n + ".webp", "w": r.width, "h": r.height}
    # z ulicy: droga bez rozmycia (po niej się biegnie), reszta tła stonowana
    Z = arg.zrodla_ulicy
    d, _ = U.kafel_drogi(U.wytnij_tlo(Image.open(os.path.join(Z, "droga.png")))[0])
    r = stonuj(d.resize((round(d.width * 230 / d.height), 230), Image.LANCZOS), 0.7, 0.9, 0.93); zapisz_obraz(r, os.path.join(arg.wyjscie, "droga.webp"), 80); atlas["droga"] = {"src": "droga.webp", "w": r.width, "h": r.height}
    la, dr = U.rozetnij_latarnie(U.wytnij_tlo(Image.open(os.path.join(Z, "latarnia-drzewo.png")))[0])
    for n, o, wys in (("latarnia", la, 300), ("drzewo", dr, 340)):
        r = stonuj(o.resize((round(o.width * wys / o.height), wys), Image.LANCZOS), 0.58, 0.85, 0.9, 0.8); zapisz_obraz(r, os.path.join(arg.wyjscie, n + ".webp"), 78); atlas[n] = {"src": n + ".webp", "w": r.width, "h": r.height}
    for k in range(1, 8):
        o = U.przytnij(U.wytnij_tlo(Image.open(os.path.join(Z, f"domek-{k}.png")))[0]); r = stonuj(o.resize((340, round(o.height * 340 / o.width)), Image.LANCZOS), 0.62, 0.86, 0.92, 0.6)
        zapisz_obraz(r, os.path.join(arg.wyjscie, f"domek{k}.webp"), 78); atlas[f"domek{k}"] = {"src": f"domek{k}.webp", "w": r.width, "h": r.height}
    # stare nazwy z prototypu
    for stara in ("biegacz", "budowniczy", "kasia", "k_skok", "k_salto", "k_triki", "k_wywrotki", "k_wpadki"):
        p = os.path.join(arg.wyjscie, stara + ".webp")
        if os.path.exists(p):
            os.remove(p)
    json.dump(atlas, open(os.path.join(arg.wyjscie, "atlas.json"), "w"), indent=0)
    suma = sum(os.path.getsize(os.path.join(arg.wyjscie, f)) for f in os.listdir(arg.wyjscie))
    print("plików", len(os.listdir(arg.wyjscie)), f"razem {suma / 1024:.0f} KB")
    print({k: (v["cw"], v["ch"], os.path.getsize(os.path.join(arg.wyjscie, v["src"])) // 1024) for k, v in atlas.items() if "cw" in v})

if __name__ == "__main__":
    main()
