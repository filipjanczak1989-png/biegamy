#!/usr/bin/env python
# BRAMKA RUN_TYPES: lista typow biegowych zyje w TRZECH zrodlach i musi byc identyczna.
# Uruchom po KAZDEJ zmianie listy:  python tools/sprawdz-run-types.py
#
# Trzy zrodla (stan od 2026-08-07):
#   1. sb.js                                        -> klient: sumy km, isRunType
#   2. js/silnik-momentu.js                         -> silnik + inline w EF detect-moment
#   3. supabase/migrations/*_suma_biegowa.sql       -> funkcja SQL zasilajaca karty
#
# Trzecim zrodlem BYLA kopia w EF share-card; zastapila ja funkcja SQL, z ktorej korzystaja
# teraz share-card i miesiac-cron. Bilans kopii wyszedl na zero, nie na plus.
#
# Dlaczego skrypt, a nie grep: `grep -c` liczy LINIE zawierajace slowo, wiec daje rozne
# liczby dla roznych plikow i nie mowi nic o zawartosci listy. Ta bramka porownuje ZBIORY.
#
# !! OGRANICZENIE: TA BRAMKA CZYTA REPO, NIE BAZE.
#    Rozjazd "SQL zastosowany w bazie, plik jeszcze nie w repo" jest dla niej
#    NIEWIDZIALNY — w sesji 14.08.2026 zdarzyl sie DWA RAZY (constraint i cap),
#    oba wychwycone recznie, nie przez bramke. Zielone swiatlo znaczy "pliki sa
#    spojne miedzy soba", a NIE "produkcja zgadza sie z repo".
#    Sprawdzenie produkcji wymagaloby odpytania pg_get_functiondef i porownania
#    z plikiem — osobne narzedzie, osobna decyzja.
import re, io, sys, glob

ZRODLA = [
    ('sb.js',                  r"window\.RUN_TYPES\s*=\s*new Set\(\[(.*?)\]\)"),
    ('js/silnik-momentu.js',   r"var RUN_TYPES = \[(.*?)\]"),
]

# ── TWARDY DOLNY PROG LICZBY ZRODEL ─────────────────────────────────────────
# Porownanie `len(zestawy) != len(ZRODLA)` NIE CHRONI przed utrata wykrywania:
# obie liczby powstaja z tego samego przebiegu i kurcza sie razem. Gdy plik
# przestanie pasowac do SYGNATURY (np. po zmianie nazwy typu w RUN_TYPES),
# po prostu wypadnie z kontroli, a bramka wypisze "OK - wszystkie 4 zrodla
# identyczne" i zwroci 0. To ten sam cichy rozjazd, tylko wejsciem przez
# sygnature.
#
# Dlatego prog jest WPISANY NA SZTYWNO. Spadek ponizej niego oznacza, ze
# bramka przestala wykrywac plik — NIE, ze plik zniknal.
#
# !! Przy SWIADOMYM dodaniu lub usunieciu zrodla te stala podnosi/obniza sie
#    RECZNIE, w tym samym commicie co zmiana. Nowe pliki tylko ja podnosza.
MIN_ZRODEL = 7   # stan na 14.08.2026: sb.js, silnik-momentu, suma_biegowa,
                 # community_km, community_km_okno, cap_licznika, licznik_bez_cache
# ── WYKRYWANIE ZRODEL SQL PO TRESCI, NIE PO NAZWIE PLIKU ────────────────────
# Enumerowanie wzorcow nazw (*_suma_biegowa, *community_km, ...) nie zlapie pliku
# nazwanego inaczej za miesiac, a objawem bedzie CICHY rozjazd: kilometry z nowego
# typu przestana sie liczyc w RPC, bez zadnego bledu. Dlatego skanujemy WSZYSTKIE
# migracje i uznajemy plik za zrodlo, gdy w jednej klauzuli IN/ARRAY wystepuja
# co najmniej trzy nazwy typow biegowych.
SYGNATURA = ('wybieganie', 'interwały', 'progresja', 'wyścig', 'regeneracja')
MIN_TRAFIEN = 3
# lista w IN (...) albo = ANY (ARRAY[...]) — obie formy wystepuja w repo
WZOR_SQL = r"(?:in|=\s*ANY)\s*\(\s*(?:ARRAY)?\s*\[?\s*((?:'[^']+'\s*,\s*)+'[^']+')\s*\]?\s*\)"

SQL = []
for f in sorted(glob.glob('supabase/migrations/*.sql')):
    try:
        tresc = io.open(f, encoding='utf-8').read()
    except OSError:
        continue
    for m in re.finditer(WZOR_SQL, tresc, re.S | re.I):
        elementy = [x.lower() for x in re.findall(r"'([^']+)'", m.group(1))]
        if sum(1 for s_ in SYGNATURA if s_ in elementy) >= MIN_TRAFIEN:
            SQL.append(f)
            ZRODLA.append((f, WZOR_SQL))
            break

zestawy, bledy = {}, []
for f, wzor in ZRODLA:
    try:
        tresc = io.open(f, encoding='utf-8').read()
    except OSError as e:
        bledy.append('%s: nie da sie otworzyc (%s)' % (f, e)); continue
    m = re.search(wzor, tresc, re.S)
    if not m:
        bledy.append('%s: nie znaleziono listy' % f); continue
    zestawy[f] = sorted(re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)))

if not SQL:
    bledy.append('nie znaleziono ZADNEJ migracji z lista typow biegowych - sprawdz WZOR_SQL')

for f, v in zestawy.items():
    print('  %-46s %d typow' % (f, len(v)))

if len(zestawy) < MIN_ZRODEL:
    print('\nZA MALO ZRODEL: wykryto %d, oczekiwano co najmniej %d.' % (len(zestawy), MIN_ZRODEL))
    print('To NIE znaczy, ze plik zniknal — najpewniej przestal pasowac do SYGNATURY')
    print('i wypadl z kontroli po cichu. Wykryte zrodla:')
    for f in zestawy:
        print('    ' + f)
    print('Jesli zrodlo usunieto SWIADOMIE, obniz MIN_ZRODEL w tym samym commicie.')
    sys.exit(1)

wartosci = list(zestawy.values())
if bledy or not all(v == wartosci[0] for v in wartosci):
    print('\nROZJAZD RUN_TYPES:')
    for b in bledy:
        print('  !', b)
    # sb.js jest SSOT-em dla klienta, wiec porownujemy WSZYSTKO do niego —
    # inaczej komunikat mowi "listy sie roznia" i nie wiadomo, ktora poprawic.
    wzorzec = zestawy.get('sb.js')
    if wzorzec is None:
        print('  ! sb.js: brak listy, nie ma do czego porownac')
    else:
        for f, v in zestawy.items():
            if f == 'sb.js' or v == wzorzec:
                continue
            brakuje = [x for x in wzorzec if x not in v]
            nadmiar = [x for x in v if x not in wzorzec]
            print('\n  PLIK   %s' % f)
            print('  LISTA  %s' % ', '.join(v))
            if brakuje:
                print('  BRAKUJE wobec sb.js: %s' % ', '.join(brakuje))
            if nadmiar:
                print('  NADMIAR wobec sb.js: %s' % ', '.join(nadmiar))
    sys.exit(1)

print('\nOK - wszystkie %d zrodel identyczne (%d typow)' % (len(zestawy), len(wartosci[0])))
