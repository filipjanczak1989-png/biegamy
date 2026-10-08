#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DEPLOY EDGE FUNCTIONS DO PROJEKTU TESTOWEGO (08.10.2026, docs/srodowisko-testowe.md)
#   TEST_REF=… SEKRETY=~/.config/biegamy-test/sekrety-test.env bash tools/test-env/deploy-ef.sh
# verify_jwt bierze z supabase/config.toml (SSOT, jak na prod). Plik sekretów — wzór:
# tools/test-env/sekrety-test.env.przyklad — trzymaj POZA repo (.gitignore łapie tools/test-env/*.env).
# SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL Supabase nadaje sam.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
PROD_REF=afqojgkaveykxbltxzwm
: "${TEST_REF:?Brak TEST_REF}"
if [ "$TEST_REF" = "$PROD_REF" ]; then echo "STOP: TEST_REF = PROD"; exit 1; fi
if [ -n "${SEKRETY:-}" ]; then
  case "$(cd "$(dirname "$SEKRETY")" && pwd)" in "$(pwd)"*) echo "STOP: plik sekretów leży w repo — przenieś go poza katalog repo"; exit 1;; esac
  echo "→ sekrety"; supabase secrets set --env-file "$SEKRETY" --project-ref "$TEST_REF"
fi
for d in supabase/functions/*/; do
  n="$(basename "$d")"
  [ -f "$d/index.ts" ] || continue          # _shared i katalogi pomocnicze bez index.ts
  echo "→ $n"; supabase functions deploy "$n" --project-ref "$TEST_REF" --use-api
done
echo "✓ funkcje wdrożone do $TEST_REF. Zadań cron NIE zakładamy (miesiac-cron, morning-brief-cron wołałyby AI)."
