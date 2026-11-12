#!/usr/bin/env bash
# USUŃ FIRMĘ: testy po skutku migracji 20261113_akcja_firmy_usuniecie.sql w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Przed wdrożeniem: FIRMY_USUN_Z_MIGRACJA=1.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${FIRMY_USUN_Z_MIGRACJA:-0}" = 1 ]; then tr -d '\r' < supabase/migrations/20261113_akcja_firmy_usuniecie.sql | sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d'; fi
  tr -d '\r' < tools/akcja-firmy-usun-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY USUWANIA FIRM ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY USUWANIA FIRM ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
