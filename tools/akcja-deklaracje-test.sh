#!/usr/bin/env bash
# Deklaracje sponsorów — testy w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Zielono = „TESTY DEKLARACJI ZIELONE".
# Póki 20261102_akcja_deklaracje.sql nie jest na prod: DEKLARACJE_Z_MIGRACJA=1.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${DEKLARACJE_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261102_akcja_deklaracje.sql; fi
  cat tools/akcja-deklaracje-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY DEKLARACJI ZIELONE[^"\]*\|FAIL[^"\]*\|ERROR:[^"\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY DEKLARACJI ZIELONE' || exit 1
