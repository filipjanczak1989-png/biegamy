#!/usr/bin/env python
# BRAMKA RUN_TYPES: lista typow biegowych zyje w TRZECH plikach i musi byc identyczna.
# Uruchom po KAZDEJ zmianie listy:  python tools/sprawdz-run-types.py
#
# Dlaczego skrypt, a nie grep: `grep -c` liczy LINIE zawierajace slowo, wiec daje trzy
# rozne liczby dla trzech plikow i nie mowi nic o zawartosci listy. Ta bramka porownuje
# ZBIORY typow po znormalizowaniu.
import re, io, sys

PLIKI = {
    'sb.js':                                   r"window\.RUN_TYPES\s*=\s*new Set\(\[(.*?)\]\)",
    'js/silnik-momentu.js':                    r"var RUN_TYPES = \[(.*?)\]",
    'supabase/functions/share-card/index.ts':  r"const RUN_TYPES = \[(.*?)\]",
}

zestawy, bledy = {}, []
for f, wzor in PLIKI.items():
    try:
        tresc = io.open(f, encoding='utf-8').read()
    except OSError as e:
        bledy.append('%s: nie da sie otworzyc (%s)' % (f, e)); continue
    m = re.search(wzor, tresc, re.S)
    if not m:
        bledy.append('%s: nie znaleziono listy RUN_TYPES' % f); continue
    zestawy[f] = sorted(re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)))

for f, v in zestawy.items():
    print('  %-42s %d typow' % (f, len(v)))

wartosci = list(zestawy.values())
if bledy or len(zestawy) != len(PLIKI) or not all(v == wartosci[0] for v in wartosci):
    print('\nROZJAZD RUN_TYPES:')
    for b in bledy: print('  !', b)
    for f, v in zestawy.items(): print('  %s -> %s' % (f, v))
    sys.exit(1)

print('\nOK - wszystkie trzy listy identyczne (%d typow)' % len(wartosci[0]))
