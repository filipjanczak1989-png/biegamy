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
import re, io, sys, glob

ZRODLA = [
    ('sb.js',                  r"window\.RUN_TYPES\s*=\s*new Set\(\[(.*?)\]\)"),
    ('js/silnik-momentu.js',   r"var RUN_TYPES = \[(.*?)\]"),
]
SQL = sorted(glob.glob('supabase/migrations/*_suma_biegowa.sql'))
if SQL:
    # lista w ARRAY[...] wewnatrz funkcji
    ZRODLA.append((SQL[-1], r"lower\(btrim\(COALESCE\(t\.training_type, ''\)\)\) = ANY \(ARRAY\[(.*?)\]\)"))

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
    bledy.append('brak migracji *_suma_biegowa.sql - trzecie zrodlo nieodnalezione')

for f, v in zestawy.items():
    print('  %-46s %d typow' % (f, len(v)))

wartosci = list(zestawy.values())
if bledy or len(zestawy) != len(ZRODLA) or not all(v == wartosci[0] for v in wartosci):
    print('\nROZJAZD RUN_TYPES:')
    for b in bledy: print('  !', b)
    for f, v in zestawy.items(): print('  %s -> %s' % (f, v))
    sys.exit(1)

print('\nOK - wszystkie trzy zrodla identyczne (%d typow)' % len(wartosci[0]))
