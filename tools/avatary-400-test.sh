#!/usr/bin/env bash
# Avatary 400 (20261226_avatary_400.sql + WYCOFANIE): testy na bazie połączonej, ZAWSZE w wycofanych transakcjach. Same liczby.
#   bash tools/avatary-400-test.sh       przed migracją, cztery przebiegi:
#     (1) sama migracja na bazie jak jest: przed wgraniem kopii odmawia („[odmowa 5/0/0/0]”), po wgraniu przechodzi
#     (2) migracja + 8 sprawdzeń + ponowne uruchomienie („już przepięte”, bez zmian) + wycofanie + 3 sprawdzenia
#     (3) pusta baza (projekt testowy, odtwarzanie od zera): bez zmian i z komunikatem
#     (4) stan częściowy 3 z 5 kopii: wyjątek „[odmowa 5/3/3/0]”
#     Gdy kopii .jfif jeszcze nie ma, (2)–(4) wstawiają na czas transakcji 5 atrap wierszy storage.objects.
#   bash tools/avatary-400-test.sh po    po migracji: stan po skutku, tylko odczyt.
set -euo pipefail
cd "$(dirname "$0")/.."
WD="${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}"
M=supabase/migrations/20261226_avatary_400.sql
W=supabase/migrations/20261226_WYCOFANIE_avatary_400.sql
TMP="$(mktemp)"; trap 'rm -f "$TMP" "$TMP.t"' EXIT
zapytaj() { supabase db query --linked --workdir "$WD" -o json -f "$TMP" 2>&1 || true; }
# Wkleja treść migracji (bez begin/commit) w miejsca znaczników; $2 = sekcja pliku stanów albo pusto (cały plik).
sklej() {
  awk -v m="$M" -v w="$W" -v s="${2:-}" '
    function wklej(f,   l) { while ((getline l < f) > 0) if (l != "begin;" && l != "commit;") print l; close(f) }
    /^-- @@(WSPOLNE|PUSTA|CZESCIOWA)@@$/ { biez = $0; gsub(/^-- @@|@@$/, "", biez); next }
    s != "" && biez != "WSPOLNE" && biez != s { next }
    $0 == "-- @@MIGRACJA@@" { wklej(m); next }
    $0 == "-- @@WYCOFANIE@@" { wklej(w); next }
    { print }' "$1"
}
wynik() { echo "$1" | grep -o "$2[^\"\\\\]*" | head -1; }

if [ "${1:-}" = po ]; then
  { echo 'begin;'; echo 'set transaction read only;'; cat tools/avatary-400-po.sql; echo 'rollback;'; } > "$TMP"
  OUT="$(zapytaj)"
  echo "$OUT" | grep -o 'TESTY AV PO ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
  echo "$OUT" | grep -q 'TESTY AV PO ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
  exit 0
fi

# (1)
{ echo 'begin;'; sed -e '/^begin;$/d' -e '/^commit;$/d' "$M"
  echo "do \$P\$ begin raise exception 'PROBA MIGRACJI [%]', (select case when komunikat like 'avatary 400: przepięto 5 kont%' then 'przepieto-5' else 'bez-zmian' end from _avatary_400_wynik); end \$P\$;"
  echo 'rollback;'; } > "$TMP"
OUT="$(zapytaj)"
if echo "$OUT" | grep -q 'PROBA MIGRACJI \[przepieto-5\]'; then
  echo "(1) sama migracja: przepina 5 kont (kopie .jfif wgrane) – wycofane"
elif echo "$OUT" | grep -q 'PROBA MIGRACJI \[bez-zmian\]'; then
  echo "(1) NIEOCZEKIWANE: migracja nic nie zrobiła (baza bez dużych avatarów albo już przepięta) – to nie jest stan produkcji przed wdrożeniem"; exit 1
elif Z="$(echo "$OUT" | grep -o '\[odmowa [0-9]*/[0-9]*/[0-9]*/[0-9]*\]' | head -1)" && [ -n "$Z" ]; then
  echo "(1) sama migracja: odmawia $Z (duże/z kopią/kopii/przepiętych; przed wgraniem kopii ma być 5/0/0/0) – wycofane"
else
  echo "(1) NIEOCZEKIWANE:"; echo "$OUT" | tail -5; exit 1
fi

# (2)
{ echo 'begin;'; sklej tools/avatary-400-test.sql; echo 'rollback;'; } > "$TMP"
OUT="$(zapytaj)"
echo "(2) $(echo "$OUT" | grep -o 'TESTY AV ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -1)"
echo "$OUT" | grep -q 'TESTY AV ZIELONE' || { echo "$OUT" | tail -5; exit 1; }

# (3)
{ echo 'begin;'; sklej tools/avatary-400-test-stany.sql PUSTA; echo 'rollback;'; } > "$TMP"
OUT="$(zapytaj)"
echo "(3) $(echo "$OUT" | grep -o 'TESTY AV PUSTA ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -1)"
echo "$OUT" | grep -q 'TESTY AV PUSTA ZIELONE' || { echo "$OUT" | tail -5; exit 1; }

# (4)
{ echo 'begin;'; sklej tools/avatary-400-test-stany.sql CZESCIOWA; echo 'rollback;'; } > "$TMP"
OUT="$(zapytaj)"
if echo "$OUT" | grep -q '\[odmowa 5/3/3/0\]'; then
  echo "(4) stan częściowy 3 z 5: odmowa [odmowa 5/3/3/0] – wycofane"
else
  echo "(4) NIEOCZEKIWANE: $(echo "$OUT" | grep -o 'FAIL[^"\\]*\|ERROR:[^"\\]*' | head -1)"; exit 1
fi
echo "TESTY AV: 4 przebiegi zielone (wszystkie transakcje wycofane)"
