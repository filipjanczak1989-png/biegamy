"""Decyzja Filipa 4.11: 5 największych awatarów do 512 px. Reszta Storage bez zmian, radio po akcji.

Uruchamia Filip, nazwy idą z żywej bazy, bo w repo nie ma nazw plików użytkowników. Kopia zapasowa zostaje na dysku.
  python tools/awatary-512.py lista                  # 5 największych, nic nie zmienia
  python tools/awatary-512.py zmniejsz <katalog>     # pobiera, zapisuje kopię, zmniejsza, wgrywa pod tą samą nazwą
Bez parametru WYKONAJ=1 w środowisku „zmniejsz” tylko pokazuje, co by zrobiło.
"""
import json, os, subprocess, sys, tempfile
from PIL import Image

KUBELEK = "biegamy-assets"
BOK = 512
KATALOG_ROBOCZY = os.path.expanduser("~/.cache/sb-audit")
SQL = f"select name, (metadata->>'size')::bigint as bajty, metadata->>'mimetype' as typ from storage.objects where bucket_id = '{KUBELEK}' and name like 'avatars/%' order by (metadata->>'size')::bigint desc nulls last limit 5;"

def supabase(*arg):
    return subprocess.run(["supabase", *arg, "--linked", "--workdir", KATALOG_ROBOCZY], capture_output=True, text=True, encoding="utf-8", check=True).stdout

def lista():
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(SQL)
    wyj = supabase("db", "query", "-o", "json", "-f", f.name)
    os.unlink(f.name)
    return json.loads(wyj[wyj.index("{"):])["rows"]

def zmniejsz(katalog):
    wykonaj = os.environ.get("WYKONAJ") == "1"
    os.makedirs(katalog, exist_ok=True)
    for w in lista():
        nazwa, typ = w["name"], w["typ"] or "image/jpeg"
        kopia = os.path.join(katalog, nazwa.replace("/", "__"))
        print(nazwa, f"{int(w['bajty']) / 1048576:.1f} MB")
        if not wykonaj:
            continue
        supabase("storage", "cp", f"ss:///{KUBELEK}/{nazwa}", kopia, "--experimental")
        im = Image.open(kopia)
        print("  było", im.size)
        im.thumbnail((BOK, BOK), Image.LANCZOS)
        nowy = kopia + ".maly"
        format_ = {"image/png": "PNG", "image/webp": "WEBP"}.get(typ, "JPEG")
        (im.convert("RGB") if format_ == "JPEG" else im).save(nowy, format_, quality=88)
        print("  jest", im.size, f"{os.path.getsize(nowy) / 1048576:.2f} MB")
        supabase("storage", "rm", f"ss:///{KUBELEK}/{nazwa}", "--experimental", "--yes")
        supabase("storage", "cp", nowy, f"ss:///{KUBELEK}/{nazwa}", "--experimental", "--content-type", typ, "--cache-control", "max-age=3600")
    if not wykonaj:
        print("Podgląd. Żeby wykonać: WYKONAJ=1 python tools/awatary-512.py zmniejsz <katalog>")

if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "lista":
        for w in lista():
            print(w["name"], f"{int(w['bajty']) / 1048576:.1f} MB", w["typ"])
    elif len(sys.argv) >= 3 and sys.argv[1] == "zmniejsz":
        zmniejsz(sys.argv[2])
    else:
        print(__doc__)
