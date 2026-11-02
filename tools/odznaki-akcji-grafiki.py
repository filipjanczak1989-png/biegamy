"""Grafiki odznak akcji (projekt F, dzień 4): PNG 1024x1024 od Filipa (GPT) -> assets/odznaki/<slug>.webp (256) + <slug>-512.webp.

Użycie:
    python -I tools/odznaki-akcji-grafiki.py                       # wejście: %USERPROFILE%/Downloads/odznaki
    python -I tools/odznaki-akcji-grafiki.py --wejscie D --wyjscie W --podglad P.png   (testy, inne katalogi)

Dla każdego slugu z SLUGI:
  1. sprawdzenie: plik <slug>.png istnieje, kwadrat >= 512 px;
  2a. PRAWDZIWA ALFA (przezroczyste rogi, >= 10% przezroczystych pikseli): przycięcie do koła wpisanego w obraz;
  2b. TŁO NIEPRZEZROCZYSTE (GPT maluje szachownicę albo biel zamiast przezroczystości — decyzja Filipa 2.11: wycinać, nie
      odrzucać): koło emblematu wyznaczone z pikseli, które NIE są jasnym szarym tłem (niskie nasycenie, jasność > 150):
      środek = środek ich obszaru, promień = 99,5. percentyl odległości; maska wsunięta adaptacyjnie (do 3%) do środka, żeby
      na brzegu nie została szachownica; potem kadr do kwadratu wokół koła i 1024 px. Promień < 30% obrazu → odrzut;
  3. zapis WebP 256 i 512 z alfą do assets/odznaki/ (nazwy = slugi, frontend czyta je bez zmian w kodzie).
Brakujący lub odrzucony plik -> zostaje zaślepka CSS/SVG we froncie (js/odznaki-akcji.mjs). Kod wyjścia 0 zawsze, gdy narzędzie
zadziałało; raport mówi, co przeszło. Podgląd zestawu: zdobyta i „nie mam" (szarość + przygaszenie) na ciemnym tle.
⚠️ Nazwy plików i slugi BEZ imienia dziecka (repo publiczne, przed startem 7.11 nic nie może zdradzać akcji).
"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

SLUGI = ["akcja-1km", "akcja-100", "akcja-200", "akcja-500", "akcja-co-tydzien", "akcja-sponsor"]
# Nazwy plików od Filipa (2.11) obok slugów; slug.png wygrywa. guzik.png = usunięta odznaka dnia startu — NIE jest tu mapowany.
ALIASY = {"akcja-1km": ["1km.png"], "akcja-100": ["100.png"], "akcja-200": ["200.png"], "akcja-500": ["500.png"],
          "akcja-co-tydzien": ["płomien.png", "płomień.png", "plomien.png"], "akcja-sponsor": ["sponsor.png"]}
KORZEN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def sprawdz(im):
    w, h = im.size
    if w != h or w < 512:
        return f"rozmiar {w}x{h} (oczekiwany kwadrat, najlepiej 1024x1024)"
    return None


def ma_alfe(im):
    """Prawdziwa przezroczystość: przezroczyste rogi i >= 10% przezroczystych pikseli."""
    if im.mode not in ("RGBA", "LA") and "transparency" not in im.info:
        return False
    a = np.asarray(im.convert("RGBA"))[..., 3]
    rogi = [a[:16, :16].max(), a[:16, -16:].max(), a[-16:, :16].max(), a[-16:, -16:].max()]
    return max(rogi) <= 8 and (a == 0).mean() >= 0.10


def maska_kola(rozmiar, cx, cy, r):
    s = 4
    m = Image.new("L", (rozmiar * s, rozmiar * s), 0)
    ImageDraw.Draw(m).ellipse(((cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s), fill=255)
    return np.asarray(m.resize((rozmiar, rozmiar), Image.LANCZOS)).astype(np.float32) / 255.0


def _srednia_okna(x, k):
    """Średnia w oknie k×k (obraz całkowy, bez scipy)."""
    p = k // 2
    xp = np.pad(x, p, mode="edge").astype(np.float64)
    c = np.cumsum(np.cumsum(xp, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    h, w = x.shape
    return (c[k:k + h, k:k + w] - c[:h, k:k + w] - c[k:k + h, :w] + c[:h, :w]) / (k * k)


def kolo_emblematu(rgb):
    """Koło emblematu na nieprzezroczystym tle (szachownica namalowana przez GPT albo biel). → (cx, cy, r) | None.
    TŁO = piksel jasny (>= 212), bezbarwny (rozpiętość kanałów <= 8) i GŁADKI (odchylenie w oknie 5×5 < 4): kratki są płaskie,
    a srebrny pierścień (200) ma tę samą szarość, ale fakturę i ciemną krawędź — sam kolor zjadłby pierścień (sprawdzone 2.11).
    KRAWĘDŹ na 360 promieniach: idąc od zewnątrz, początek pierwszego CIĄGŁEGO odcinka nie-tła >= 8 px (ostre granice kratek
    mają 1–3 px i się nie liczą). Potem okrąg dopasowany najmniejszymi kwadratami (poprawia środek), promień = mediana."""
    a = rgb.astype(np.float64)
    szare = a.mean(axis=2)
    nas = a.max(axis=2) - a.min(axis=2)
    odch = np.sqrt(np.maximum(_srednia_okna(szare * szare, 5) - _srednia_okna(szare, 5) ** 2, 0))
    nie_tlo = ~((szare >= 212) & (nas <= 8) & (odch < 4))
    h, w = szare.shape

    def krawedzie(cx, cy):
        rmax = min(cx, cy, w - 1 - cx, h - 1 - cy)
        rr = np.arange(rmax, 0, -0.5)                      # od zewnątrz do środka
        pkt = []
        for kat in np.linspace(0, 2 * np.pi, 360, endpoint=False):
            xi = np.clip(np.round(cx + rr * np.cos(kat)).astype(int), 0, w - 1)
            yi = np.clip(np.round(cy + rr * np.sin(kat)).astype(int), 0, h - 1)
            ciag = np.convolve(nie_tlo[yi, xi].astype(np.int8), np.ones(16, dtype=np.int8), mode="valid") == 16   # 16 próbek = 8 px
            t = np.nonzero(ciag)[0]
            if len(t):
                pkt.append((xi[t[0]], yi[t[0]]))
        return np.array(pkt, dtype=np.float64)

    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    for _ in range(2):
        P = krawedzie(cx, cy)
        if len(P) < 300:
            return None
        A = np.column_stack([2 * P[:, 0], 2 * P[:, 1], np.ones(len(P))])
        bx, by, c = np.linalg.lstsq(A, (P ** 2).sum(1), rcond=None)[0]
        cx, cy = float(bx), float(by)
    P = krawedzie(cx, cy)
    r = float(np.median(np.hypot(P[:, 0] - cx, P[:, 1] - cy)))
    return cx, cy, r


def do_kola(im):
    """-> (RGBA 1024, opis trybu) albo (None, powód odrzutu)."""
    n = im.size[0]
    if ma_alfe(im):
        im = im.convert("RGBA")
        out = np.asarray(im).copy()
        out[..., 3] = np.clip(out[..., 3].astype(np.float32) * maska_kola(n, n / 2, n / 2, n / 2 - 2), 0, 255).astype(np.uint8)
        kolo, tryb = Image.fromarray(out, "RGBA"), "alfa"
    else:
        rgb = np.asarray(im.convert("RGB"))
        k = kolo_emblematu(rgb)
        if not k or k[2] < 0.30 * n:
            return None, "tło nieprzezroczyste, a emblematu nie da się wyznaczyć (promień < 30% obrazu)"
        cx, cy, r = k
        # ADAPTACYJNE wsunięcie (2.11): stałe 0,7% zostawiało 1–2 px jasnoszarej przejściówki szachownicy na 55–80% kątów
        # (jasna obwódka na ciemnym tle). Zmniejszamy promień po 0,5 px, aż na okręgu tuż wewnątrz krawędzi jasnoszary
        # I GŁADKI (min kanał > 150, rozpiętość <= 12, odchylenie 5×5 < 5) jest < 5% kątów; najwyżej 3%. Gładkość odróżnia
        # kratkę od srebra/połysku miedzi (faktura) — bez niej pętla ścinała srebrny pierścień 200 (zmierzone 2.11).
        a16 = rgb.astype(np.int16)
        sz = rgb.astype(np.float64).mean(axis=2)
        gladki = np.sqrt(np.maximum(_srednia_okna(sz * sz, 5) - _srednia_okna(sz, 5) ** 2, 0)) < 5   # kratka gładka, srebro z fakturą
        katy = np.linspace(0, 2 * np.pi, 360, endpoint=False)
        r0 = r
        while r > r0 * 0.97:
            xi = np.clip(np.round(cx + (r - 1.0) * np.cos(katy)).astype(int), 0, n - 1)
            yi = np.clip(np.round(cy + (r - 1.0) * np.sin(katy)).astype(int), 0, n - 1)
            px = a16[yi, xi]
            if ((px.min(1) > 150) & ((px.max(1) - px.min(1)) <= 12) & gladki[yi, xi]).mean() < 0.05:
                break
            r -= 0.5
        r -= 1.0                                         # zapas na wygładzenie maski
        a = (maska_kola(n, cx, cy, r) * 255).astype(np.uint8)
        kolo = Image.fromarray(np.dstack([rgb, a]), "RGBA")
        l, t = int(round(cx - r)), int(round(cy - r))
        kolo = kolo.crop((l, t, l + int(round(2 * r)), t + int(round(2 * r))))
        tryb = f"wycięte z tła (koło r={r:.0f}px)"
    return kolo.resize((1024, 1024), Image.LANCZOS), tryb


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # konsola Windows (cp1250) nie zna „→"
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--wejscie", default=os.path.join(os.environ.get("USERPROFILE", os.path.expanduser("~")), "Downloads", "odznaki"))
    ap.add_argument("--wyjscie", default=os.path.join(KORZEN, "assets", "odznaki"))
    ap.add_argument("--podglad", default=os.path.join(os.environ.get("USERPROFILE", os.path.expanduser("~")), "Downloads", "biegamy-podglady", "odznaki-akcji-zestaw.png"))
    o = ap.parse_args()
    os.makedirs(o.wyjscie, exist_ok=True)
    gotowe, raport = {}, []
    for slug in SLUGI:
        kandydaci = [slug + ".png"] + ALIASY.get(slug, [])
        p = next((os.path.join(o.wejscie, n) for n in kandydaci if os.path.exists(os.path.join(o.wejscie, n))), os.path.join(o.wejscie, slug + ".png"))
        if not os.path.exists(p):
            raport.append(f"  brak     {slug}.png ({' / '.join(ALIASY.get(slug, []))}) — zostaje zaślepka")
            continue
        try:
            im = Image.open(p); im.load()
        except Exception as e:
            raport.append(f"  ODRZUT   {slug}.png — nie da się otworzyć ({e})"); continue
        blad = sprawdz(im)
        if blad:
            raport.append(f"  ODRZUT   {slug}.png — {blad}"); continue
        kolo, tryb = do_kola(im)
        if kolo is None:
            raport.append(f"  ODRZUT   {slug}.png — {tryb}"); continue
        if np.asarray(kolo)[:24, :24, 3].max() > 8:   # kontrola: żadnej szachownicy poza kołem
            raport.append(f"  ODRZUT   {slug}.png — po wycięciu rogi nadal nieprzezroczyste"); continue
        for px, nazwa in ((256, slug + ".webp"), (512, slug + "-512.webp")):
            kolo.resize((px, px), Image.LANCZOS).save(os.path.join(o.wyjscie, nazwa), "WEBP", quality=90, method=6)
        gotowe[slug] = kolo
        raport.append(f"  OK       {slug} → {slug}.webp ({os.path.getsize(os.path.join(o.wyjscie, slug + '.webp')) // 1024} KB), {slug}-512.webp · {tryb}")
    # podgląd: trzy rzędy — ciemne tło (zdobyta), ciemne tło („nie mam": szarość + przygaszenie jak w aplikacji), jasne tło
    kom = 180
    tla = [((15, 15, 20), False), ((15, 15, 20), True), ((246, 244, 240), False)]
    ark = Image.new("RGB", (kom * len(SLUGI) + 20, 3 * kom + 70), (30, 29, 36))
    d = ImageDraw.Draw(ark)
    try:
        f = ImageFont.truetype("arial.ttf", 13)
    except Exception:
        f = ImageFont.load_default()
    for rz, (kol, szaro) in enumerate(tla):
        d.rectangle((0, rz * kom, ark.width, (rz + 1) * kom - 1), fill=kol)
    for i, slug in enumerate(SLUGI):
        x = 10 + i * kom
        for rz, (kol, szaro) in enumerate(tla):
            y = rz * kom + 15
            if slug in gotowe:
                g = gotowe[slug].resize((150, 150), Image.LANCZOS)
                if szaro:
                    s2 = ImageOps.grayscale(g.convert("RGB")).point(lambda v: int(v * 0.4)).convert("RGB")
                    s2.putalpha(g.split()[3])
                    g = s2
                ark.paste(g, (x + 15, y), g)
            else:
                d.ellipse((x + 15, y, x + 165, y + 150), outline=(232, 86, 30), width=3)
                d.text((x + 55, y + 65), "zaślepka", fill=(232, 86, 30), font=f)
        d.text((x + 15, 3 * kom + 20), slug, fill=(220, 215, 225), font=f)
    d.text((10, 3 * kom + 45), "rzędy: ciemne tło · „nie mam” (szarość + przygaszenie, jak w aplikacji) · jasne tło", fill=(160, 155, 170), font=f)
    os.makedirs(os.path.dirname(o.podglad), exist_ok=True)
    ark.save(o.podglad)
    print("Odznaki akcji — grafiki\n" + "\n".join(raport) + f"\n  podgląd: {o.podglad}\n  gotowe: {len(gotowe)}/{len(SLUGI)}")


if __name__ == "__main__":
    sys.exit(main())
