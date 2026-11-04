"""Grafiki Ulicy (Filip 4.11): PNG z GPT -> assets/ulica/<nazwa>.webp + assets/ulica/szyldy.json. Wzorzec: tools/odznaki-akcji-grafiki.py.

Użycie:
    python -I tools/ulica-grafiki.py --wejscie <katalog z PNG> [--wyjscie assets/ulica] [--podglad P.png]

Wejście: droga, koparka, walec, dzwig, budowniczy, domek-1..7, mur, plac-zabaw, latarnia-drzewo, plac-budowy (.png).
Co robi:
  1. TŁO: GPT maluje szachownicę albo biel zamiast przezroczystości. Pewne tło = jasne, prawie szare piksele połączone z brzegiem obrazu;
     dziura wewnątrz (między nogami, między linkami huśtawki) = taki sam obszar, ale tylko gdy ma dwa poziomy szachownicy albo jest idealnie
     biała. Jednolicie jasny fragment obiektu (skarpetka, pasek pachołka) zostaje. Maska wsunięta w kontur, żeby nie było jasnej obwódki.
     Pliki z prawdziwą alfą zostają bez zmian.
  2. latarnia-drzewo -> latarnia + drzewo (cięcie po pustej kolumnie między obiektami).
  3. walec: bez paska świeżego asfaltu przed bębnem.
  4. droga: szerokość = całkowita wielokrotność okresu przerywanej linii, cięcie w środku przerwy. mur: okres dobrany tak, żeby lewa i prawa
     krawędź pasowały (kamienie zwieńczenia i cegły), bez zaokrąglonych końców. Oba ze szwem wygładzonym przenikaniem.
  5. WebP o rozmiarze 2 x wyświetlanie na telefonie (ROZMIARY; css = szerokość albo wysokość w jednostkach sceny 360).
  6. szyldy.json: prostokąt szyldu (ułamki obrazu) dla domków i tablicy placu budowy: kod wpisuje tam nazwę.
Kod wyjścia != 0, gdy brakuje pliku albo obraz jest podejrzany. ⚠️ Nazwy bez imienia dziecka (repo publiczne).
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

# (bok, wartość w px css); pliki mają 2 x tyle
ROZMIARY = {
    "koparka": ("w", 124), "walec": ("w", 104), "dzwig": ("w", 130), "budowniczy": ("h", 74),
    **{f"domek-{i}": ("w", 160) for i in range(1, 8)},
    "plac-zabaw": ("w", 230), "latarnia": ("h", 92), "drzewo": ("h", 130), "plac-budowy": ("w", 360),
    "droga": ("h", 72), "mur": ("h", 62),
}
WEJSCIA = ["droga", "koparka", "walec", "dzwig", "budowniczy"] + [f"domek-{i}" for i in range(1, 8)] + ["mur", "plac-zabaw", "latarnia-drzewo", "plac-budowy"]


def skladowe(maska):
    """Etykiety składowych spójnych (4-sąsiedztwo) bez scipy: przebiegi w wierszach + union-find."""
    h, w = maska.shape
    rodzic = [0]
    def znajdz(a):
        while rodzic[a] != a:
            rodzic[a] = rodzic[rodzic[a]]
            a = rodzic[a]
        return a
    etykiety = np.zeros((h, w), dtype=np.int32)
    poprzednie = []
    for y in range(h):
        wiersz = maska[y]
        if not wiersz.any():
            poprzednie = []
            continue
        d = np.diff(np.concatenate(([0], wiersz.astype(np.int8), [0])))
        starty, konce = np.where(d == 1)[0], np.where(d == -1)[0]
        obecne = []
        for a, b in zip(starty.tolist(), konce.tolist()):
            e = 0
            for (pa, pb, pe) in poprzednie:
                if pa < b and pb > a:
                    if e == 0:
                        e = znajdz(pe)
                    else:
                        x, z = znajdz(e), znajdz(pe)
                        if x != z:
                            rodzic[z] = x
            if e == 0:
                e = len(rodzic)
                rodzic.append(e)
            etykiety[y, a:b] = e
            obecne.append((a, b, e))
        poprzednie = obecne
    mapa = np.array([znajdz(i) for i in range(len(rodzic))], dtype=np.int32)
    return mapa[etykiety]


def wytnij_tlo(obraz):
    """→ (RGBA bez tła, raport). Prawdziwa alfa zostaje."""
    a = np.array(obraz.convert("RGBA"))
    if float((a[..., 3] < 10).mean()) >= 0.05:
        return Image.fromarray(a), "alfa ok"
    rgb = a[..., :3].astype(np.int16)
    jas = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    kand = (sat <= 16) & (jas >= 222)
    et = skladowe(kand)
    h, w = kand.shape
    brzeg = np.unique(np.concatenate([et[0, :], et[-1, :], et[:, 0], et[:, -1]]))
    tlo = np.isin(et, brzeg[brzeg > 0])
    # szachownica czy biel: poziomy na tle połączonym z brzegiem
    j = jas[tlo]
    dolny = float(((j >= 228) & (j < 248)).mean()) if j.size else 0
    szachownica = dolny > 0.2
    dziury = 0
    wnetrze = kand & ~tlo
    if wnetrze.any():
        for e in np.unique(et[wnetrze]):
            m = et == e
            n = int(m.sum())
            if n < 90:
                continue
            jj = jas[m]
            if szachownica:
                nisk, wys = float(((jj >= 228) & (jj < 248)).mean()), float((jj >= 249).mean())
                dziura = nisk >= 0.2 and wys >= 0.2
            else:
                dziura = float((jj >= 251).mean()) >= 0.985 and n >= 260
            if dziura:
                tlo |= m
                dziury += 1
    # wsunięcie maski w kontur (1,5 px) i miękka krawędź: bez jasnej obwódki po zmniejszeniu
    maska = Image.fromarray((tlo * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.0))
    a[..., 3] = 255 - np.array(maska)
    return Image.fromarray(a), f"{'szachownica' if szachownica else 'biel'}, dziur {dziury}"


def bbox(obraz, prog=12):
    al = np.array(obraz)[..., 3]
    ys, xs = np.where(al > prog)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def przytnij(obraz, margines=2):
    x0, y0, x1, y1 = bbox(obraz)
    return obraz.crop((max(0, x0 - margines), max(0, y0 - margines), min(obraz.width, x1 + margines), min(obraz.height, y1 + margines)))


def rozetnij_latarnie(obraz):
    al = np.array(obraz)[..., 3] > 12
    kol = al.sum(axis=0)
    xs = np.where(kol > 0)[0]
    przerwy = np.where(np.diff(xs) > 8)[0]
    if not len(przerwy):
        raise SystemExit("latarnia-drzewo: nie ma pustej kolumny między obiektami")
    # liście drzewa mogą opadać osobno: cięcie po PIERWSZEJ przerwie od lewej (latarnia jest z lewej)
    k = przerwy[0]
    srodek = int((xs[k] + xs[k + 1]) / 2)
    return przytnij(obraz.crop((0, 0, srodek, obraz.height))), przytnij(obraz.crop((srodek, 0, obraz.width, obraz.height)))


def bez_paska_walca(obraz):
    """Pasek asfaltu = kolumny z prawej strony, gdzie nieprzezroczysty jest tylko sam dół."""
    a = np.array(obraz)
    al = a[..., 3] > 12
    h, w = al.shape
    ys, xs = np.where(al)
    y_dol = ys.max()
    gora = np.array([np.argmax(al[:, x]) if al[:, x].any() else h for x in range(w)])
    wysoki = np.where(gora < y_dol - h * 0.09)[0]
    x_bebna = int(wysoki.max()) + 1
    if x_bebna >= xs.max() - 4:
        raise SystemExit("walec: nie znalazłem paska za bębnem")
    a[:, x_bebna:, 3] = 0
    # ogonek pod łukiem bębna: bęben jest walcem, więc przy samej ziemi kończy się wcześniej niż jego prawy bok
    a[int(y_dol - h * 0.066):, int(x_bebna - w * 0.05):, 3] = 0
    return przytnij(Image.fromarray(a)), xs.max() - x_bebna


def przenikanie(a, zakladka):
    """a: tablica z `zakladka` dodatkowymi kolumnami z prawej. Ostatnie kolumny przenikają w pierwsze, wynik krótszy o zakładkę."""
    w = a.shape[1] - zakladka
    wyn = a[:, :w].astype(np.float32).copy()
    waga = np.linspace(0, 1, zakladka, endpoint=False)[None, :, None]
    wyn[:, :zakladka] = a[:, :zakladka].astype(np.float32) * waga + a[:, w:w + zakladka].astype(np.float32) * (1 - waga)
    return np.clip(wyn + 0.5, 0, 255).astype(np.uint8)


def kafel_drogi(obraz):
    o = przytnij(obraz, 0)
    a = np.array(o)
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(np.int16)
    bialy = (rgb.mean(axis=2) >= 215) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= 30) & (a[..., 3] > 200)
    # wiersz kresek: pas o największej liczbie osobnych odcinków na środku wysokości
    srodek = range(int(h * 0.3), int(h * 0.7))
    naj = max(srodek, key=lambda y: bialy[y].sum() if 6 <= (np.diff(bialy[y].astype(np.int8)) == 1).sum() <= 30 else 0)
    d = np.diff(np.concatenate(([0], bialy[naj].astype(np.int8), [0])))
    starty, konce = np.where(d == 1)[0], np.where(d == -1)[0]
    pary = [(s, e) for s, e in zip(starty, konce) if e - s >= w * 0.015]
    if len(pary) < 3:
        raise SystemExit(f"droga: za mało kresek w wierszu {naj}: {len(pary)}")
    okres = float(np.median(np.diff([p[0] for p in pary])))
    # GPT rysuje kreski nierówno (odchylenie okresu ~20 %), więc k × okres trafiał w kreskę: cięcie w środkach PRAWDZIWYCH przerw, zakładka tylko w przerwie
    dlugosc = float(np.median([e - s for s, e in pary]))
    while len(pary) > 3 and pary[0][1] - pary[0][0] < dlugosc * 0.8:   # kreska ucięta na krawędzi rysunku nie może wejść na złączenie
        pary = pary[1:]
    while len(pary) > 3 and pary[-1][1] - pary[-1][0] < dlugosc * 0.8:
        pary = pary[:-1]
    srodki = [(pary[i][1] + pary[i + 1][0]) // 2 for i in range(len(pary) - 1)]
    przerwa = min(pary[i + 1][0] - pary[i][1] for i in range(len(pary) - 1))
    zakladka = max(6, min(24, przerwa - 4))
    start = int(srodki[0]) - zakladka // 2
    konce = [s for s in srodki if s + zakladka // 2 <= w]
    koniec = int(konce[-1]) - zakladka // 2
    szer = koniec - start
    wyn = przenikanie(a[:, start:start + szer + zakladka], zakladka)
    return Image.fromarray(wyn), {"okres_px": round(okres, 1), "kresek_w_kaflu": len(konce) - 1, "wiersz": int(naj), "zakladka": zakladka, "wariancja_okresu": round(float(np.std(np.diff([p[0] for p in pary]))), 1)}


def kafel_muru(obraz):
    o = przytnij(obraz, 0)
    a = np.array(o)
    h, w = a.shape[:2]
    # porównanie krawędzi na obrazie 2 razy mniejszym: lewa i prawa kolumna kafla mają się zgadzać w całej wysokości, razem z alfą zwieńczenia
    male = np.array(o.resize((w // 2, h // 2), Image.LANCZOS)).astype(np.int16)
    mw = male.shape[1]
    margines = int(mw * 0.03)
    naj = (1e18, None, None)
    for start in range(margines, int(mw * 0.2)):
        for p in range(int(mw * 0.55), mw - start - margines):
            koszt = float(np.abs(male[:, start] - male[:, start + p]).mean()) + float(np.abs(male[:, start + 1] - male[:, start + p + 1]).mean())
            koszt -= p * 0.004   # przy podobnym dopasowaniu dłuższy kafel
            if koszt < naj[0]:
                naj = (koszt, start, p)
    _, start, p = naj
    x0, szer = start * 2, p * 2
    zakladka = 12
    szer = min(szer, w - x0 - zakladka)
    wyn = przenikanie(a[:, x0:x0 + szer + zakladka], zakladka)
    return Image.fromarray(wyn), {"x0": x0, "szer": szer, "koszt_krawedzi": round(naj[0], 1)}


def szyld(obraz, gora=0.62):
    """Prostokąt deski: największa drewniana składowa w górnej części. → ułamki [x, y, w, h] pola na napis."""
    a = np.array(obraz)
    r, g, b = [a[..., i].astype(np.int16) for i in range(3)]
    drewno = (a[..., 3] > 200) & (r >= 190) & (g >= 125) & (g <= 205) & (b <= 120) & (r - b >= 90)
    h, w = drewno.shape
    drewno[int(h * gora):, :] = False
    et = skladowe(drewno)
    e, n = np.unique(et[et > 0], return_counts=True)
    if not len(e):
        raise SystemExit("szyld: nie znalazłem deski")
    ys, xs = np.where(et == e[np.argmax(n)])
    x0, x1, y0, y1 = np.percentile(xs, 1), np.percentile(xs, 99), np.percentile(ys, 1), np.percentile(ys, 99)
    dx, dy = (x1 - x0) * 0.07, (y1 - y0) * 0.14   # z dala od ramy i ćwieków
    return [round(float((x0 + dx) / w), 4), round(float((y0 + dy) / h), 4), round(float((x1 - x0 - 2 * dx) / w), 4), round(float((y1 - y0 - 2 * dy) / h), 4)]


def do_rozmiaru(obraz, nazwa):
    bok, css = ROZMIARY[nazwa]
    cel = css * 2
    skala = cel / (obraz.width if bok == "w" else obraz.height)
    return obraz.resize((max(1, round(obraz.width * skala)), max(1, round(obraz.height * skala))), Image.LANCZOS)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--wejscie", required=True)
    p.add_argument("--wyjscie", default="assets/ulica")
    p.add_argument("--podglad", default=None)
    a = p.parse_args()
    os.makedirs(a.wyjscie, exist_ok=True)
    wynik, raport, szyldy, bledy = {}, {}, {}, []
    for n in WEJSCIA:
        sc = os.path.join(a.wejscie, n + ".png")
        if not os.path.exists(sc):
            bledy.append("brak " + sc)
            continue
        o, opis = wytnij_tlo(Image.open(sc))
        raport[n] = {"tlo": opis}
        if n == "latarnia-drzewo":
            wynik["latarnia"], wynik["drzewo"] = rozetnij_latarnie(o)
        elif n == "walec":
            wynik[n], usuniete = bez_paska_walca(o)
            raport[n]["pasek_px"] = int(usuniete)
        elif n == "droga":
            wynik[n], raport[n]["kafel"] = kafel_drogi(o)
        elif n == "mur":
            wynik[n], raport[n]["kafel"] = kafel_muru(o)
        else:
            wynik[n] = przytnij(o)
    if bledy:
        print("\n".join(bledy))
        sys.exit(2)
    suma = 0
    for n, o in wynik.items():
        if n.startswith("domek-") or n == "plac-budowy":
            szyldy[n] = {"szyld": szyld(o), "proporcja": round(o.width / o.height, 4)}
        m = do_rozmiaru(o, n)
        sc = os.path.join(a.wyjscie, n + ".webp")
        m.save(sc, "WEBP", quality=80, alpha_quality=85, method=6)
        b = os.path.getsize(sc)
        suma += b
        raport.setdefault(n, {}).update({"px": list(m.size), "kb": round(b / 1024, 1)})
    szyldy["wiezowiec"] = {"szyld": [0.2, 0.175, 0.6, 0.08], "proporcja": 0.5}   # osobna grafika Filipa, assets/ulica/wiezowiec.webp, szyld zmierzony ręcznie
    with open(os.path.join(a.wyjscie, "szyldy.json"), "w", encoding="utf8", newline="\n") as f:
        json.dump(szyldy, f, ensure_ascii=False, indent=0)
    print(json.dumps(raport, ensure_ascii=False))
    print(f"razem {len(wynik)} plików, {suma / 1024:.0f} KB")
    if a.podglad:
        podglad(a.wyjscie, list(wynik), szyldy, a.podglad)


def podglad(katalog, nazwy, szyldy, sciezka):
    """Sprawdzenie krawędzi: każdy plik na ciemnym i jasnym tle, kafle podwójnie (widać złączenie), czerwona ramka = pole szyldu."""
    from PIL import ImageDraw
    K, R = 5, 250
    w = (len(nazwy) + K - 1) // K
    ark = Image.new("RGB", (K * R * 2, w * (R + 10)), (20, 20, 26))
    d = ImageDraw.Draw(ark)
    d.rectangle((K * R, 0, K * R * 2, w * (R + 10)), fill=(236, 233, 226))
    for i, n in enumerate(nazwy):
        o = Image.open(os.path.join(katalog, n + ".webp")).convert("RGBA")
        if n in ("droga", "mur"):
            dw = Image.new("RGBA", (o.width * 2, o.height), (0, 0, 0, 0))
            dw.paste(o, (0, 0)); dw.paste(o, (o.width, 0))
            o = dw
        o.thumbnail((R - 10, R - 10))
        for tlo_x in (0, K * R):
            x, y = tlo_x + (i % K) * R + 5, (i // K) * (R + 10) + 5
            ark.paste(o, (x, y), o)
            if n in szyldy:
                s = szyldy[n]["szyld"]
                d.rectangle((x + s[0] * o.width, y + s[1] * o.height, x + (s[0] + s[2]) * o.width, y + (s[1] + s[3]) * o.height), outline=(255, 40, 40))
    ark.save(sciezka)


if __name__ == "__main__":
    main()
