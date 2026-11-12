#!/usr/bin/env bash
# KROK 3 (B): test po skutku samego pliku CREATE 20261112_athletes_widok_i_funkcje.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej.
# Przed wdrożeniem: ATHLETES_WIDOK_Z_MIGRACJA=1 (plik w tej samej transakcji, bez begin/commit/notify). Po wdrożeniu: bez zmiennej (sprawdza stan bazy).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${ATHLETES_WIDOK_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261112_athletes_widok_i_funkcje.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/athletes-widok-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY WIDOKU ATHLETES ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY WIDOKU ATHLETES ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
