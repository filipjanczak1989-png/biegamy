# Punkty przypięcia dodatków w każdej klatce każdego arkusza postaci, liczone z sylwetki. Wynik: js/cegielki-przypiecia.js (generowany, nie edytować ręcznie).
# Głowa to największe koło wpisane w skórę (twarz po domknięciu oczu i ust), o ile dotyka włosów, czapki albo kasku. Kolano bywa równie okrągłe, ale nie ma nad sobą włosów.
# Tułów to największa plama koszulki albo kamizelki. Szyja leży między głową a tułowiem, a oś głowa-tułów daje obrót, więc salto i wpadki działają bez osobnych danych.
# Klatki, w których kolory zawodzą, poprawia POPRAWKI: krótka lista z arkusza kontrolnego, reszta jest z automatu i wskazówek.
# Uruchomienie: python -I -X utf8 tools/przypiecia-postaci.py --kat assets/gra --wyj js/cegielki-przypiecia.js [--kontrola <png>]
import argparse, json, math, os
import numpy as np
from PIL import Image, ImageDraw

POSTACIE = ("kasia", "filip", "rowerzysta")
# (postać, arkusz, klatka) -> środek twarzy (x, y), z arkusza kontrolnego, gdy automat wybrał kolano albo dłoń. Szyja i tułów liczą się dalej same od tego punktu.
POPRAWKI = {
    ("kasia", "bieg", 5): (96, 40), ("kasia", "B", 2): (65, 185), ("kasia", "B", 3): (75, 185), ("kasia", "B", 4): (50, 172), ("kasia", "D", 3): (85, 90), ("kasia", "D", 4): (135, 90),
    ("kasia", "E", 0): (85, 75), ("kasia", "E", 2): (115, 90), ("kasia", "I", 3): (85, 55),
    ("filip", "A", 1): (92, 58), ("filip", "A", 2): (75, 45), ("filip", "D", 1): (135, 65), ("filip", "E", 0): (55, 80), ("filip", "E", 1): (105, 45), ("filip", "E", 2): (100, 85), ("filip", "E", 3): (95, 115), ("filip", "E", 4): (70, 105),
}
# Postać leży na brzuchu, głowa patrzy do przodu: oś głowa-tułów dałaby czapkę przed twarzą.
KATY = {("kasia", "D", 1): 0.6, ("kasia", "D", 2): 0.35, ("filip", "D", 1): 0.6, ("filip", "D", 2): 0.35}
# Wskazówki z arkusza kontrolnego: przybliżony punkt na głowie i jej obrót, sprawdzone na zrzucie. Automat wybiera najbliższą twarz i dopiero z niej liczy resztę. None = bez wskazówki.
WSKAZOWKI = {
    "kasia": {
        "bieg": [(82, 25, 0), (88, 25, 0), (91, 25, 0), (95, 32, 0), (92, 25, 0), (94, 25, 0)],
        "A": [(109, 86, 0.15), (101, 51, -0.05), (100, 51, -0.05), (105, 97, 0), (90, 64, -0.05), (99, 89, 0.05)],
        "B": [(82, 41, 0), (84, 146, 0.35), (60, 182, 3.6), (71, 180, 3.14), (44, 168, -1), (84, 79, 0)],
        "C": [(104, 99, 0.1), (111, 54, 0), (148, 124, 0.15), (110, 29, 0), (127, 59, -0.1), (99, 124, 0.1)],
        "F": [(90, 38, 0), (100, 62, 0.35), (103, 47, 0), (82, 32, 0), (108, 68, 0.4), (85, 40, -0.25)],
        "H": [(182, 90, 0.25), (176, 92, 0.25), (135, 52, -0.1), (147, 60, 0.05), (131, 55, 0), (150, 68, 0)],
        "I": [(75, 52, 0), (76, 122, -0.2), (82, 52, 0), (92, 55, -0.3), (85, 58, 0), (122, 80, 0.4)],
    },
    "filip": {
        "bieg": [(84, 17, -0.15), (86, 18, -0.15), (91, 17, -0.15), (86, 33, -0.15), (86, 17, -0.15), (90, 17, -0.15)],
        "A": [(112, 79, -0.1), (90, 47, -0.1), (79, 29, -0.1), (92, 86, -0.1), (84, 52, -0.1), (92, 80, -0.1)],
        "B": [(97, 24, -0.1), (105, 99, 0.1), (139, 179, 1.5), (64, 221, 3.14), (50, 149, -0.9), (90, 39, -0.1)],
        "C": [(123, 89, -0.1), (118, 51, 0), (156, 124, -0.1), (124, 27, -0.2), (112, 64, -0.2), (85, 111, -0.15)],
        "F": [(93, 30, -0.15), (119, 52, -0.15), (93, 38, -0.15), (82, 38, -0.05), None, (75, 28, -0.3)],
        "H": [(115, 55, -0.15), (151, 45, -0.15), (93, 65, -0.15), (129, 65, -0.15)],
        "I": [(82, 57, -0.1), None, (78, 57, -0.1), (72, 58, -0.1), (81, 60, -0.1), None],
    },
}
# Forma budowniczego ma te same pozy co bieg.
for _p in ("kasia", "filip"):
    WSKAZOWKI[_p]["bud"] = WSKAZOWKI[_p]["bieg"]
KLATKI_Z_KASKIEM = {"bud": range(6), "G": (3, 4, 5)}


def rozszerz(m):
    n = m.copy()
    n[1:] |= m[:-1]; n[:-1] |= m[1:]; n[:, 1:] |= m[:, :-1]; n[:, :-1] |= m[:, 1:]
    return n


def scieraj(m):
    return ~rozszerz(~m)


def domknij(m, r):
    w = m
    for _ in range(r): w = rozszerz(w)
    for _ in range(r): w = scieraj(w)
    return w


def skladowe(m):
    h, w = m.shape
    pole = bytearray(m.astype(np.uint8).tobytes())
    wynik = []
    for s in range(h * w):
        if not pole[s]: continue
        pole[s] = 0
        st = [s]; pik = []
        while st:
            i = st.pop(); pik.append(i)
            x = i % w
            if x > 0 and pole[i - 1]: pole[i - 1] = 0; st.append(i - 1)
            if x < w - 1 and pole[i + 1]: pole[i + 1] = 0; st.append(i + 1)
            if i >= w and pole[i - w]: pole[i - w] = 0; st.append(i - w)
            if i < (h - 1) * w and pole[i + w]: pole[i + w] = 0; st.append(i + w)
        ys, xs = np.divmod(np.array(pik), w)
        wynik.append((xs, ys))
    return wynik


def glebia(m):
    """Odległość do brzegu maski w krokach erozji."""
    d = np.zeros(m.shape, dtype=np.int16)
    w = m.copy(); r = 0
    while w.any():
        r += 1; d[w] = r
        w = scieraj(w)
        w[0, :] = w[-1, :] = False; w[:, 0] = w[:, -1] = False
    return d


def kolory(kl):
    r, g, b, a = [kl[..., i].astype(np.int16) for i in range(4)]
    wid = a > 128
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    skora = wid & (r > 165) & (g > 95) & (g < 225) & (b > 50) & (b < 190) & (r - b > 45) & (r - g > 20) & (r - g < 110)
    zolty = wid & (r > 190) & (g > 140) & (b < 90) & (r - g < 90)
    wlosy = wid & (r > 50) & (r < 200) & (g < 110) & (b < 70) & (r - g > 18) & ~skora
    bialy = wid & (mn > 200) & (mx - mn < 26)
    ciemny = wid & (mx < 72)
    tkanina = wid & (mx >= 16) & (mx < 95) & (mx - mn < 40)
    kamizelka = wid & (r > 200) & (g > 70) & (g < 160) & (b < 70)
    return dict(wid=wid, skora=skora, zolty=zolty, wlosy=wlosy, bialy=bialy, ciemny=ciemny, tkanina=tkanina, kamizelka=kamizelka)


def pierscien(h, w, cx, cy, r0, r1):
    yy, xx = np.mgrid[0:h, 0:w]
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    return (d2 >= r0 * r0) & (d2 < r1 * r1)


def duze(m, min_pole, er=1):
    w = m
    for _ in range(er): w = scieraj(w)
    wyn = np.zeros(m.shape, dtype=bool)
    for xs, ys in skladowe(w):
        if len(xs) >= min_pole: wyn[ys, xs] = True
    for _ in range(er + 1): wyn = rozszerz(wyn)
    return wyn & m


def klatka(kl, postac, wsk=None, wymus=None):
    h, w = kl.shape[:2]
    k = kolory(kl)
    twarz = domknij(k["skora"], 3)
    d = glebia(twarz)
    nakrycie_duze = duze(k["wlosy"], 30) | duze(k["zolty"], 30)
    if postac == "filip": nakrycie_duze = nakrycie_duze | duze(k["bialy"], 60, 2)
    mn = kl[..., :3].min(-1)
    bialko = k["wid"] & (mn > 150)
    kandydaci = []
    for xs, ys in skladowe(d >= 5):
        gl = d[ys, xs]; mx = int(gl.max())
        if mx < 7: continue
        p = gl == mx
        cx, cy = float(xs[p].mean()), float(ys[p].mean())
        r = mx + 1.5
        ring = pierscien(h, w, cx, cy, r * 0.8, r * 2.0)
        ile = max(1, int((ring & k["wid"]).sum()))
        udzial = float((ring & nakrycie_duze).sum()) / ile
        wnetrze = pierscien(h, w, cx, cy, 0, r * 0.85)
        oczy = float((wnetrze & k["ciemny"]).sum())
        bial = float((wnetrze & bialko).sum())
        punkty = r * (0.25 + udzial) * (1.0 + min(1.0, oczy / 30)) * (1.6 if bial >= 2 else 1.0)
        kandydaci.append((punkty, cx, cy, r))
    if not kandydaci: return None
    if wymus:
        cx, cy = wymus; r = float(np.median([q[3] for q in kandydaci]))
    elif wsk:
        # Wskazówka leży na czubku głowy, więc kara za odległość działa do dwóch średnic głowy.
        kandydaci.sort(key=lambda q: math.hypot(q[1] - wsk[0], q[2] - wsk[1]) - q[0] * 0.2)
        _, cx, cy, r = kandydaci[0]
    else:
        _, cx, cy, r = max(kandydaci)
    # Tułów: największa plama poza głową.
    poza = ~pierscien(h, w, cx, cy, 0, r * 1.5)
    baza = (k["kamizelka"] if postac == "rowerzysta" else k["tkanina"]) & poza
    plamy = skladowe(scieraj(baza))
    if plamy:
        xs, ys = max(plamy, key=lambda c: len(c[0]) - 0.8 * float(np.mean(np.hypot(c[0] - cx, c[1] - cy))))
        tx, ty = float(xs.mean()), float(ys.mean())
    else:
        tx, ty = cx, cy + 3 * r
    ot = math.hypot(tx - cx, ty - cy) or 1
    ox, oy = (tx - cx) / ot, (ty - cy) / ot
    nx, ny = cx + ox * r * 1.15, cy + oy * r * 1.15
    tulow = math.atan2(-ox, oy)
    # Przy pionowym tułowiu głowa stoi prawie prosto: pełny kąt z osi rozkołysałby czapkę między klatkami.
    kat = tulow if abs(tulow) > 0.6 else tulow * 0.35
    if wsk: kat = wsk[2]
    # Wszystkie postacie biegną w prawo: obrót głowy wystarcza, odbicie niepotrzebne. Oczy przy tej rozdzielczości odbijały dodatki bez powodu.
    strona = 1
    kask = 0
    return dict(x=cx, y=cy, r=r, kat=kat, strona=strona, nx=nx, ny=ny, tulow=tulow, kask=kask)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kat", required=True); ap.add_argument("--wyj", required=True); ap.add_argument("--kontrola")
    o = ap.parse_args()
    atlas = json.load(open(os.path.join(o.kat, "atlas.json"), encoding="utf-8"))
    dane, wiersze, wzorzec = {}, [], {}
    for postac in POSTACIE:
        dane[postac] = {}
        for nazwa, at in atlas.items():
            if not nazwa.startswith(postac + "_"): continue
            ark = nazwa[len(postac) + 1:]
            im = np.array(Image.open(os.path.join(o.kat, at["src"])).convert("RGBA"))
            wyn = []
            for i in range(at["n"]):
                kl = im[:, at["cw"] * i:at["cw"] * (i + 1)]
                lista = WSKAZOWKI.get(postac, {}).get(ark)
                p = klatka(kl, postac, lista[i] if lista else None, POPRAWKI.get((postac, ark, i)))
                if p is None: raise SystemExit(f"{nazwa}[{i}]: nie ma głowy")
                p["kask"] = 1 if postac == "rowerzysta" or i in KLATKI_Z_KASKIEM.get(ark, ()) else 0
                wyn.append(p)
            for i, p in enumerate(wyn):
                if (postac, ark, i) in KATY: p["kat"] = KATY[(postac, ark, i)]
            # Wielkość głowy jedna na arkusz: pojedynczy pomiar skacze o parę pikseli i dodatek by pulsował. Twarz bywa przykryta,
            # więc promień idzie z arkusza biegu, a arkusze różnią się skalą rysunku, którą widać po największej wysokości sylwetki.
            alfa = im[..., 3] > 128
            wysokosc = max(int(np.ptp(np.nonzero(alfa[:, at["cw"] * i:at["cw"] * (i + 1)].any(1))[0])) for i in range(at["n"]))
            if ark == "bieg" or postac not in wzorzec:
                wzorzec.setdefault(postac, (float(np.median([p["r"] for p in wyn])), wysokosc))
            r = wzorzec[postac][0] * wysokosc / wzorzec[postac][1]
            for p in wyn: p["r"] = r
            dane[postac][ark] = [[round(p["x"]), round(p["y"]), round(p["r"], 1), round(p["kat"], 2), p["strona"], round(p["nx"]), round(p["ny"]), round(p["tulow"], 2), p["kask"]] for p in wyn]
            wiersze.append((postac, ark, at, im, wyn))
    with open(o.wyj, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Wygenerowane przez tools/przypiecia-postaci.py. Nie edytować ręcznie. Każda klatka: [głowa x, głowa y, promień głowy, kąt głowy, strona twarzy, szyja x, szyja y, kąt tułowia, kask na głowie].\n")
        f.write("window.BM_CEGIELKI_PRZYPIECIA = " + json.dumps(dane, separators=(",", ":")) + ";\n")
    print("zapisano", os.path.getsize(o.wyj) // 1024, "KB,", sum(len(v) for p in dane.values() for v in p.values()), "klatek")
    if o.kontrola:
        rz = 300
        k = Image.new("RGB", (6 * 300, len(wiersze) * rz), (70, 110, 150))
        d = ImageDraw.Draw(k)
        for wi, (postac, ark, at, im, wyn) in enumerate(wiersze):
            for i, p in enumerate(wyn):
                kl = Image.fromarray(im[:, at["cw"] * i:at["cw"] * (i + 1)], "RGBA")
                sk = min(1.0, 295 / max(kl.size))
                kl2 = kl.resize((round(kl.width * sk), round(kl.height * sk)))
                x0, y0 = i * 300, wi * rz
                k.paste(kl2, (x0, y0), kl2)
                cx, cy = x0 + p["x"] * sk, y0 + p["y"] * sk; r = p["r"] * sk
                d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 0, 200), width=2)
                d.line((cx, cy, cx + math.sin(p["kat"]) * r * 1.8, cy - math.cos(p["kat"]) * r * 1.8), fill=(0, 255, 255), width=3)
                nx, ny = x0 + p["nx"] * sk, y0 + p["ny"] * sk
                d.ellipse((nx - 4, ny - 4, nx + 4, ny + 4), fill=(0, 255, 0))
                d.line((nx, ny, nx - math.sin(p["tulow"]) * 40, ny + math.cos(p["tulow"]) * 40), fill=(255, 255, 0), width=2)
                if p["strona"] < 0: d.text((cx - 4, cy - 6), "<", fill=(255, 0, 0))
                if p["kask"]: d.text((x0 + 4, y0 + 18), "K", fill=(255, 255, 0))
            d.text((4, wi * rz + 2), f"{postac} {ark}", fill=(255, 255, 255))
        k.save(o.kontrola)
        for j in range(0, len(wiersze), 6):
            k.crop((0, j * rz, 1800, min(len(wiersze), j + 6) * rz)).save(o.kontrola.replace(".png", f"-{j // 6}.png"))


if __name__ == "__main__":
    main()
