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
#
# !! OGRANICZENIE: TA BRAMKA CZYTA REPO, NIE BAZE.
#    Rozjazd "SQL zastosowany w bazie, plik jeszcze nie w repo" jest dla niej
#    NIEWIDZIALNY — w sesji 14.08.2026 zdarzyl sie DWA RAZY (constraint i cap),
#    oba wychwycone recznie, nie przez bramke. Zielone swiatlo znaczy "pliki sa
#    spojne miedzy soba", a NIE "produkcja zgadza sie z repo".
#    Sprawdzenie produkcji wymagaloby odpytania pg_get_functiondef i porownania
#    z plikiem — osobne narzedzie, osobna decyzja.
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

# ── PROWIZORKA SPOL_TEST_DZIEN — W KAZDYM PLIKU Z LICZNIKIEM ────────────────
# Rozroznienie AKTYWNA vs WYGASLA. Prowizorka jest rownoscia na dokladna date,
# wiec wygasa sama o polnocy. Dopoki data jest DZISIEJSZA lub przyszla, licznik
# naprawde jest widoczny poza oknem i bramka MUSI padac. Gdy data minie,
# zostaje martwy kod: warto go sprzatnac, ale nic juz nie odslania.
#
# !! SPRAWDZAMY OBA PLIKI. Wczesniej ten test siedzial w bloku index.html
#    i mial nazwe pliku wpisana na sztywno — prowizorka zostawiona wylacznie
#    w zawodnik.html przeszlaby NIEZAUWAZONA. Ta sama klasa bledu co
#    enumerowanie nazw plikow przy wykrywaniu zrodel SQL.
import datetime as _dt
_dzis_iso = _dt.date.today().isoformat()
for _plik in ('index.html', 'zawodnik.html'):
    _tresc = czytaj(_plik)
    if not _tresc:
        continue
    _m = re.search(r"SPOL_TEST_DZIEN\s*=\s*'([^']+)'", _tresc)
    if not _m:
        continue
    if _m.group(1) >= _dzis_iso:
        bledy.append("%s: PROWIZORKA SPOL_TEST_DZIEN = %s jest AKTYWNA — "
                     "licznik widoczny poza oknem %s..%s"
                     % (_plik, _m.group(1), OCZEKIWANE['OKNO_OD'], OCZEKIWANE['OKNO_DO']))
    else:
        print('  INFO  %s: SPOL_TEST_DZIEN = %s juz WYGASLA (rownosc na date) — '
              'martwy kod do sprzatniecia' % (_plik, _m.group(1)))

# ── 3. SQL — GRANICE OKNA WYKRYWANE PO TRESCI ───────────────────────────────
# Wzorzec przywiazany do konkretnej formy (`logged_at < 'data'`) przestal
# dzialac, gdy granice zmienily sie na inkluzywne warszawskie
# (`(logged_at at time zone 'Europe/Warsaw')::date <= '2026-09-20'`).
# To ta sama pulapka co enumerowanie nazw plikow: zmiana formy zapisu CICHO
# wypycha plik z kontroli, a bramka nadal swieci na zielono.
#
# Lapiemy KAZDE porownanie logged_at do literalu daty — z konwersja strefy
# albo bez, z dowolnym operatorem (>=, <=, <, >, =).
import glob, datetime
WZOR_DATY = r"logged_at[^\n]{0,80}?(>=|<=|<|>|=)\s*'(\d{4}-\d{2}-\d{2})'"

# !! TWARDY DOLNY PROG, jak MIN_ZRODEL w sprawdz-run-types.py. Bez niego
#    utrata wykrywania wyglada identycznie jak brak granic: liczba znalezisk
#    po prostu spada, a bramka przechodzi.
#    Stan na 14.08.2026: najnowsza migracja ma 4 porownania — po dwie granice
#    w v_km i w v_wklad. Spadek = bramka przestala rozpoznawac forme zapisu,
#    NIE = granice zniknely. Przy swiadomej zmianie liczby zapytan podnies
#    lub obniz RECZNIE, w tym samym commicie.
MIN_ZNALEZISK = 4

SQL = sorted(glob.glob('supabase/migrations/*.sql'))

# Plik ROZSTRZYGAJACY to najnowsza migracja definiujaca community_km — jego
# tresc odpowiada temu, co stoi w bazie. Starsze zostaja w repo jako historia
# i NIE MOGA wliczac sie do progu: inaczej zamaskowalyby utrate wykrywania
# w najnowszej (wykryte testem negatywnym 14.08 — bramka przechodzila mimo
# zmiany formy zapisu, bo stare pliki dostarczaly brakujace trafienia).
# Wykrywanie po TRESCI, nie po nazwie.
# !! Szukamy plikow, ktore funkcje DEFINIUJA, nie tych, ktore ja wspominaja.
#    Samo 'community_km' w tresci lapie takze komentarze w innych migracjach
#    (np. limit_dystansu.sql pisze "cap ... w community_km()") — a taki plik
#    wygral sortowanie i bramka szukala granic tam, gdzie ich nigdy nie bylo.
WZOR_DEF = r"create\s+(?:or\s+replace\s+)?function\s+community_km"
kandydaci = [f for f in SQL if re.search(WZOR_DEF, czytaj(f) or '', re.I)]
najnowsza = max(kandydaci) if kandydaci else None

trafienia = []          # (plik, operator, data) — TYLKO z pliku rozstrzygajacego
if najnowsza:
    for m in re.finditer(WZOR_DATY, czytaj(najnowsza) or ''):
        trafienia.append((najnowsza, m.group(1), m.group(2)))

if not najnowsza:
    bledy.append('ZADNA migracja nie definiuje community_km — granice okna '
                 'sa poza kontrola')
elif len(trafienia) < MIN_ZNALEZISK:
    bledy.append('ZA MALO GRANIC w %s: znaleziono %d, oczekiwano co najmniej %d. '
                 'To NIE znaczy, ze granice zniknely — najpewniej zmienila sie '
                 'forma zapisu i wypadly z kontroli. Znalezione: %s'
                 % (najnowsza, len(trafienia), MIN_ZNALEZISK,
                    ', '.join('%s %s' % (op, d) for _, op, d in trafienia) or '(nic)'))
else:
    for f, op, d in trafienia:
        if op in ('>=', '>'):
            znalezione.setdefault('OKNO_OD', []).append((f, d))
        elif op == '<':
            # koniec EKSKLUZYWNY -> porownujemy z DO + 1 dzien
            try:
                d = (datetime.date.fromisoformat(d) - datetime.timedelta(days=1)).isoformat()
            except ValueError:
                pass
            znalezione.setdefault('OKNO_DO', []).append((f + ' (<, wiec -1 dzien)', d))
        elif op == '<=':
            znalezione.setdefault('OKNO_DO', []).append((f, d))

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
