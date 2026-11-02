#!/usr/bin/env bash
# Dzień 5 (wyprawa, zamknięcie, push startu) — testy w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Zielono = „TESTY DNIA 5 ZIELONE".
# Póki 20261102_akcja_dzien5.sql nie jest na prod: DZIEN5_Z_MIGRACJA=1.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${DZIEN5_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261102_akcja_dzien5.sql; fi
  cat tools/akcja-dzien5-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY DNIA 5 ZIELONE[^"\]*\|FAIL[^"\]*\|ERROR:[^"\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY DNIA 5 ZIELONE' || exit 1
