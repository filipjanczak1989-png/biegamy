"""Grafiki odznak akcji (projekt F, dzień 4): PNG 1024x1024 od Filipa (GPT) -> assets/odznaki/<slug>.webp (256) + <slug>-512.webp.

Użycie:
    python -I tools/odznaki-akcji-grafiki.py                       # wejście: %USERPROFILE%/Downloads/odznaki
    python -I tools/odznaki-akcji-grafiki.py --wejscie D --wyjscie W --podglad P.png   (testy, inne katalogi)

Dla każdego slugu z SLUGI:
  1. sprawdzenie: plik <slug>.png istnieje, 1024x1024, kanał alfa, przezroczyste rogi i >= 10% przezroczystych pikseli
     (GPT potrafi oddać „przezroczyste" tło jako szachownicę albo biel — taki plik jest odrzucany, nie poprawiany);
  2. przycięcie do koła: alfa x maska koła (wygładzona krawędź 2 px przy 1024) — nic poza kołem;
  3. zapis WebP 256 i 512 z alfą do assets/odznaki/ (nazwy = slugi, frontend czyta je bez zmian w kodzie).
Brakujący lub odrzucony plik -> zostaje zaślepka CSS/SVG we froncie (js/odznaki-akcji.mjs). Kod wyjścia 0 zawsze, gdy narzędzie
zadziałało; raport mówi, co przeszło. Podgląd zestawu: zdobyta i „nie mam" (szarość + przygaszenie) na ciemnym tle.
⚠️ Nazwy plików i slugi BEZ imienia dziecka (repo publiczne, przed 8.11 nic nie może zdradzać akcji).
"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

SLUGI = ["akcja-1km", "akcja-100", "akcja-200", "akcja-500", "akcja-1000", "akcja-co-tydzien", "akcja-razem", "akcja-sponsor"]
KORZEN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def sprawdz(im):
    if im.size != (1024, 1024):
        return f"rozmiar {im.size[0]}x{im.size[1]} (oczekiwane 1024x1024)"
    if im.mode not in ("RGBA", "LA") and "transparency" not in im.info:
        return "brak kanału alfa (tło nieprzezroczyste)"
    a = np.asarray(im.convert("RGBA"))[..., 3]
    rogi = [a[:16, :16].max(), a[:16, -16:].max(), a[-16:, :16].max(), a[-16:, -16:].max()]
    if max(rogi) > 8:
        return "rogi nieprzezroczyste (tło nie jest przezroczyste — szachownica albo biel z GPT?)"
    if (a == 0).mean() < 0.10:
        return f"za mało przezroczystości ({(a == 0).mean():.0%})"
    return None


def do_kola(im):
    im = im.convert("RGBA")
    s = 4 * im.size[0]
    maska = Image.new("L", (s, s), 0)
    ImageDraw.Draw(maska).ellipse((8, 8, s - 8, s - 8), fill=255)
    maska = maska.resize(im.size, Image.LANCZOS)
    a = np.asarray(im)[..., 3].astype(np.float32) * (np.asarray(maska).astype(np.float32) / 255.0)
    out = np.asarray(im).copy()
    out[..., 3] = np.clip(a, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


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
        p = os.path.join(o.wejscie, slug + ".png")
        if not os.path.exists(p):
            raport.append(f"  brak     {slug}.png — zostaje zaślepka")
            continue
        try:
            im = Image.open(p); im.load()
        except Exception as e:
            raport.append(f"  ODRZUT   {slug}.png — nie da się otworzyć ({e})"); continue
        blad = sprawdz(im)
        if blad:
            raport.append(f"  ODRZUT   {slug}.png — {blad}"); continue
        kolo = do_kola(im)
        for px, nazwa in ((256, slug + ".webp"), (512, slug + "-512.webp")):
            kolo.resize((px, px), Image.LANCZOS).save(os.path.join(o.wyjscie, nazwa), "WEBP", quality=90, method=6)
        gotowe[slug] = kolo
        raport.append(f"  OK       {slug} → {slug}.webp ({os.path.getsize(os.path.join(o.wyjscie, slug + '.webp')) // 1024} KB), {slug}-512.webp")
    # podgląd: dwa rzędy (zdobyta / „nie mam") x 8
    kom = 180
    ark = Image.new("RGB", (kom * len(SLUGI) + 20, 2 * kom + 70), (15, 15, 20))
    d = ImageDraw.Draw(ark)
    try:
        f = ImageFont.truetype("arial.ttf", 13)
    except Exception:
        f = ImageFont.load_default()
    for i, slug in enumerate(SLUGI):
        x = 10 + i * kom
        if slug in gotowe:
            g = gotowe[slug].resize((150, 150), Image.LANCZOS)
            ark.paste(g, (x + 15, 10), g)
            szary = ImageOps.grayscale(g.convert("RGB")).point(lambda v: int(v * 0.4)).convert("RGB")
            szary.putalpha(g.split()[3])
            ark.paste(szary, (x + 15, 10 + kom), szary)
        else:
            for r in (0, 1):
                d.ellipse((x + 15, 10 + r * kom, x + 165, 160 + r * kom), outline=(232, 86, 30), width=3)
                d.text((x + 55, 75 + r * kom), "zaślepka", fill=(232, 86, 30), font=f)
        d.text((x + 15, 2 * kom + 20), slug, fill=(220, 215, 225), font=f)
    d.text((10, 2 * kom + 45), "górny rząd: zdobyta · dolny: „nie mam” (szarość + przygaszenie, jak w aplikacji)", fill=(140, 135, 150), font=f)
    os.makedirs(os.path.dirname(o.podglad), exist_ok=True)
    ark.save(o.podglad)
    print("Odznaki akcji — grafiki\n" + "\n".join(raport) + f"\n  podgląd: {o.podglad}\n  gotowe: {len(gotowe)}/{len(SLUGI)}")


if __name__ == "__main__":
    sys.exit(main())
