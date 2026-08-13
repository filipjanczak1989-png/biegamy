#!/usr/bin/env python
# BRAMKA #100kmDlaKasi: stale wyzwania zyja w KILKU zrodlach i musza byc identyczne.
# Uruchom po KAZDEJ zmianie dat, celu albo progu:  python tools/sprawdz-spol-stale.py
#
# Zrodla (stan od 2026-08-12):
#   1. index.html            -> licznik na landingu (wylogowany, sam pasek wspolny)
#   2. zawodnik.html         -> licznik w "Dzis" (dwa paski) + WYZWANIA (reguly odznak)
#   3. community_km() w SQL  -> suma wspolna i wklad wlasny
#
# Dlaczego kopie, a nie jedna stala: SQL nie siegnie do JS, wiec jedna kopia jest
# nieusuwalna z definicji. Skoro i tak musi istniec bramka na te jedna, taniej jest
# miec bramke na wszystkie niz polowiczny SSOT.
#
# ⚠️ ROZJAZD DAT = licznik startuje w innym momencie niz wyzwanie, a pasek
# indywidualny dobija do innej liczby niz odznaka. Zadne z tego nie daje bledu
# — po prostu pokazuje nieprawde.
import re, io, sys

OCZEKIWANE = {
    'OKNO_OD':    '2026-08-15',
    'OKNO_DO':    '2026-09-20',
    'CEL_KM':     '10000',
    'PROG_INDYW': '100',
    'DATA_AMES':  '2026-09-20',
}

def czytaj(sciezka):
    try:
        return io.open(sciezka, encoding='utf-8').read()
    except OSError as e:
        return None

bledy = []
znalezione = {}

# ── 1. index.html — licznik landingu ──
s = czytaj('index.html')
if s is None:
    bledy.append('index.html: nie mozna otworzyc')
else:
    for klucz, wzor in [
        ('OKNO_OD',   r"SPOL_OKNO_OD\s*=\s*'([^']+)'"),
        ('OKNO_DO',   r"SPOL_OKNO_DO\s*=\s*'([^']+)'"),
        ('CEL_KM',    r"SPOL_CEL_KM\s*=\s*(\d+)"),
        ('DATA_AMES', r"SPOL_DATA_AMES\s*=\s*'([^']+)'"),
    ]:
        m = re.search(wzor, s)
        if not m:
            bledy.append('index.html: brak ' + klucz)
        else:
            znalezione.setdefault(klucz, []).append(('index.html', m.group(1)))
    if 'SPOL_TEST_DZIEN' in s:
        bledy.append('index.html: ZOSTALA PROWIZORKA SPOL_TEST_DZIEN — licznik widoczny poza oknem')

# ── 2. zawodnik.html — licznik "Dzis" + WYZWANIA ──
s = czytaj('zawodnik.html')
if s is None:
    bledy.append('zawodnik.html: nie mozna otworzyc')
else:
    for klucz, wzor in [
        ('OKNO_OD',   r"SPOL_OKNO_OD\s*=\s*'([^']+)'"),
        ('OKNO_DO',   r"SPOL_OKNO_DO\s*=\s*'([^']+)'"),
        ('CEL_KM',    r"SPOL_CEL_KM\s*=\s*(\d+)"),
        ('PROG_INDYW', r"SPOL_PROG_INDYW\s*=\s*(\d+)"),
        ('DATA_AMES', r"SPOL_DATA_AMES\s*=\s*'([^']+)'"),
    ]:
        m = re.search(wzor, s)
        if not m:
            bledy.append('zawodnik.html: brak ' + klucz)
        else:
            znalezione.setdefault(klucz, []).append(('zawodnik.html', m.group(1)))

    # WYZWANIA — prog i okno musza byc TE SAME co w pasku, bo inaczej pasek
    # dobija do 100, a odznaka wpada przy czym innym.
    #
    # Najmocniejsza forma: wpis ODWOLUJE SIE do stalych, wiec rozjazd jest
    # niemozliwy z definicji. Slabsza (literaly) tez akceptujemy, ale wtedy
    # porownujemy wartosci.
    m = re.search(r"\{\s*id:\s*'100km_wrzesien_2026'[^}]*prog_km:\s*([A-Za-z_0-9]+)[^}]*od:\s*([A-Za-z_0-9']+)[^}]*do:\s*([A-Za-z_0-9']+)", s)
    if not m:
        bledy.append("zawodnik.html: nie znaleziono wpisu WYZWANIA '100km_wrzesien_2026'")
    else:
        prog, od, do = m.group(1), m.group(2), m.group(3)
        if prog == 'SPOL_PROG_INDYW' and od == 'SPOL_OKNO_OD' and do == 'SPOL_OKNO_DO':
            print('  OK    WYZWANIA    odwoluje sie do stalych (rozjazd niemozliwy)')
        else:
            # literaly — porownaj wartosci
            znalezione.setdefault('PROG_INDYW', []).append(('WYZWANIA', prog))
            znalezione.setdefault('OKNO_OD',    []).append(('WYZWANIA', od.strip("'")))
            znalezione.setdefault('OKNO_DO',    []).append(('WYZWANIA', do.strip("'")))

# ── 3. SQL — migracja z community_km() ──
import glob
SQL = sorted(glob.glob('supabase/migrations/*community_km*.sql'))
if not SQL:
    bledy.append('brak migracji *community_km*.sql — SQL trzyma daty na sztywno i NIKT ich nie pilnuje')
else:
    s = czytaj(SQL[-1])
    daty = re.findall(r"logged_at\s*>=\s*'([0-9-]+)'", s or '')
    konce = re.findall(r"logged_at\s*<\s*'([0-9-]+)'", s or '')
    for d in set(daty):
        znalezione.setdefault('OKNO_OD', []).append((SQL[-1], d))
    # w SQL koniec jest EKSKLUZYWNY (< 21.09), wiec porownujemy z DO + 1 dzien
    import datetime
    for d in set(konce):
        try:
            popr = (datetime.date.fromisoformat(d) - datetime.timedelta(days=1)).isoformat()
        except ValueError:
            popr = d
        znalezione.setdefault('OKNO_DO', []).append((SQL[-1] + ' (< , wiec -1 dzien)', popr))

# ── PORONANIE ──
print('BRAMKA #100kmDlaKasi — zgodnosc stalych\n')
for klucz, oczek in OCZEKIWANE.items():
    wpisy = znalezione.get(klucz, [])
    wartosci = set(w for _, w in wpisy)
    if not wpisy:
        print('  ?     %-11s brak w jakimkolwiek zrodle' % klucz)
        continue
    zgodne = (wartosci == {oczek})
    print('  %s  %-11s %s' % ('OK  ' if zgodne else 'BLAD', klucz, ', '.join('%s=%s' % (f, w) for f, w in wpisy)))
    if not zgodne:
        bledy.append('%s: rozjazd %s (oczekiwane %s)' % (klucz, sorted(wartosci), oczek))

if bledy:
    print('\nBLEDY (%d):' % len(bledy))
    for b in bledy:
        print('  - ' + b)
    sys.exit(1)

print('\nWSZYSTKIE ZRODLA ZGODNE')
sys.exit(0)
