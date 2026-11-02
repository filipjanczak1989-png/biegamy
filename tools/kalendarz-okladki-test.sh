#!/usr/bin/env bash
# L4: imprezy_okladki — RLS/granty w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Przed wdrożeniem: OKLADKI_Z_MIGRACJA=1.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${OKLADKI_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' -e '/^notify pgrst/d' supabase/migrations/20261102_imprezy_okladki.sql; fi
  cat tools/kalendarz-okladki-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY OKLADEK ZIELONE[^"\\]*\|FAIL[^"\\]*\|ERROR:[^"\\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY OKLADEK ZIELONE' || { echo "$OUT" | tail -5; exit 1; }
