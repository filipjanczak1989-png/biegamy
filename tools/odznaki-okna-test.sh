#!/usr/bin/env bash
# Wyzwalacz okien odznak — testy w JEDNEJ transakcji na bazie połączonej, zawsze wycofanej. Zielono = „TESTY OKIEN ODZNAK ZIELONE".
# Póki 20261102_odznaki_okna.sql nie jest na prod: ODZNAKI_Z_MIGRACJA=1 (dołącza migrację do transakcji).
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
{ echo 'begin;'
  if [ "${ODZNAKI_Z_MIGRACJA:-0}" = 1 ]; then sed -e '/^begin;$/d' -e '/^commit;$/d' supabase/migrations/20261102_odznaki_okna.sql; fi
  cat tools/odznaki-okna-test.sql
  echo 'rollback;'; } > "$TMP"
OUT="$(supabase db query --linked --workdir "${BM_SB_WORKDIR:-$HOME/.cache/sb-audit}" -o json -f "$TMP" 2>&1 || true)"
echo "$OUT" | grep -o 'TESTY OKIEN ODZNAK ZIELONE[^"\]*\|FAIL[^"\]*\|ERROR:[^"\]*' | head -3 || true
echo "$OUT" | grep -q 'TESTY OKIEN ODZNAK ZIELONE' || exit 1
