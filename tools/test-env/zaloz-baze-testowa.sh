#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ZAŁÓŻ SCHEMAT BAZY TESTOWEJ ZE ZRZUTU PRODUKCJI (08.10.2026, docs/srodowisko-testowe.md)
#
# Dlaczego ze zrzutu, a nie z supabase/migrations/: sporo SQL szło ręcznie w SQL Editorze, a migawki
# supabase/schema/ dowodzą, że PRODUKCJA BYWA NOWSZA od repo (trigger_detect_moment, polityki nutrition).
#
# Co robi:
#   1. supabase db dump --linked  → schemat z PROD (bez danych; w CLI 2.98.1 to tryb DOMYŚLNY — flagi
#      `--schema-only` NIE MA, „unknown flag", zmierzone 8.10)
#   2. tools/test-env/uzupelnienia-z-prod.sql   → to, czego dump NIE zabiera: 8 bucketów, 19 polityk
#      storage.objects, trigger auth.users → handle_new_user, publikacja realtime (zmierzone 8.10)
#   3. PODMIANA adresu projektu prod → test we wszystkim (3 funkcje triggerów wołają EF przez net.http_post
#      z ADRESEM PROD w treści — bez podmiany baza testowa przy każdym logu wołałaby funkcje PRODUKCJI)
#      i TWARDA KONTROLA: jeśli po podmianie zostanie choć jedno wystąpienie adresu prod — STOP.
#   4. sekrety vault w bazie testowej: push_hook_secret (losowy) i publishable_key (klucz anon TESTU)
#   5. wykonanie na bazie TESTOWEJ (TEST_DB_URL), potem kontrola liczby tabel/polityk
#
# Czego NIE robi (świadomie): zadania cron (miesiac-karta, morning-brief-hourly wołałyby AI co godzinę),
# pliki w bucketach, użytkownicy (robi to seed.js), ustawienia Auth w panelu (Site URL, redirect URLs, Google).
#
# HASŁA: tylko w zmiennych środowiska TWOJEJ sesji, nigdy w pliku, repo ani czacie.
#   TEST_REF          — identyfikator projektu testowego (np. abcd1234...)
#   TEST_DB_URL       — postgresql://postgres:<HASŁO>@db.<TEST_REF>.supabase.co:5432/postgres
#   TEST_ANON_KEY     — klucz publishable/anon projektu testowego (do vault publishable_key)
#   hasło PROD        — NIEPOTRZEBNE: `db dump --linked` loguje się tokenem CLI przez tymczasową rolę
#                       („Initialising login role…", zmierzone 8.10 bez SUPABASE_DB_PASSWORD)
#   Docker Desktop    — WYMAGANY: CLI uruchamia pg_dump w kontenerze (bez Dockera: „failed to inspect docker image")
#   psql              — niepotrzebny: SQL na bazie testowej przez `supabase db query --db-url` (bez Dockera)
# Użycie (Git Bash, z korzenia repo, projekt prod podpięty `supabase link`):
#   TEST_REF=… TEST_DB_URL='…' TEST_ANON_KEY='…' bash tools/test-env/zaloz-baze-testowa.sh
# Pliki pośrednie: ~/.cache/biegamy-test/<data>/ (POZA repo).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
PROD_REF=afqojgkaveykxbltxzwm
: "${TEST_REF:?Brak TEST_REF}"; : "${TEST_DB_URL:?Brak TEST_DB_URL}"; : "${TEST_ANON_KEY:?Brak TEST_ANON_KEY}"
if [ "$TEST_REF" = "$PROD_REF" ]; then echo "STOP: TEST_REF = PROD"; exit 1; fi
case "$TEST_DB_URL" in *"$PROD_REF"*) echo "STOP: TEST_DB_URL wskazuje PROD"; exit 1;; esac
case "$TEST_DB_URL" in *"$TEST_REF"*) ;; *) echo "STOP: TEST_DB_URL nie zawiera TEST_REF — sprawdź adres"; exit 1;; esac
if ! docker info >/dev/null 2>&1; then echo "STOP: Docker nie działa — uruchom Docker Desktop (db dump uruchamia pg_dump w kontenerze)"; exit 1; fi
if [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROD_REF" ]; then echo "STOP: podpięty projekt (supabase link) nie jest prod — zrzut miałby złe źródło"; exit 1; fi

KAT="$HOME/.cache/biegamy-test/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$KAT"; chmod 700 "$KAT"
echo "→ zrzut schematu PROD do $KAT"
supabase db dump --linked -f "$KAT/schemat-prod.sql"
if [ ! -s "$KAT/schemat-prod.sql" ]; then echo "STOP: zrzut schematu pusty"; exit 1; fi
if ! grep -q "CREATE TABLE IF NOT EXISTS \"public\".\"athletes\"" "$KAT/schemat-prod.sql"; then echo "STOP: w zrzucie brak public.athletes — to nie jest schemat prod"; exit 1; fi
supabase db query --linked -f tools/test-env/uzupelnienia-z-prod.sql --agent=no --output json > "$KAT/uzupelnienia.json"
node -e '
  const fs = require("fs"); const t = fs.readFileSync(process.argv[1], "utf8");
  const a = JSON.parse(t.slice(t.indexOf("["), t.lastIndexOf("]") + 1));   // CLI dopisuje podpowiedzi poza JSON-em
  if (a.length < 20) { console.error("STOP: uzupełnień tylko " + a.length + " (oczekiwane ~29)"); process.exit(1); }
  fs.writeFileSync(process.argv[2], a.map((r) => r.ddl).join("\n") + "\n");
  console.log("uzupełnień DDL: " + a.length);' "$KAT/uzupelnienia.json" "$KAT/uzupelnienia-prod.sql"

echo "→ podmiana adresu projektu prod → test"
for f in schemat uzupelnienia; do sed "s/$PROD_REF/$TEST_REF/g" "$KAT/$f-prod.sql" > "$KAT/$f-test.sql"; done
if grep -l "$PROD_REF" "$KAT"/*-test.sql; then echo "STOP: adres PROD został po podmianie"; exit 1; fi
echo "   funkcje z net.http_post po podmianie wskazują: $(grep -o "https://[a-z0-9]*\.supabase\.co" "$KAT/schemat-test.sql" | sort -u | tr '\n' ' ')"

PUSH_HOOK_SECRET="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
printf "PUSH_HOOK_SECRET=%s\n" "$PUSH_HOOK_SECRET" > "$KAT/sekret-push-hook.env"; chmod 600 "$KAT/sekret-push-hook.env"
cat > "$KAT/vault-test.sql" <<EOF
select vault.create_secret('$PUSH_HOOK_SECRET', 'push_hook_secret');
select vault.create_secret('$TEST_ANON_KEY', 'publishable_key');
EOF

echo "→ wykonanie na bazie TESTOWEJ"
for f in schemat-test uzupelnienia-test vault-test; do
  echo "   $f.sql"; supabase db query --db-url "$TEST_DB_URL" -f "$KAT/$f.sql" --agent=no > "$KAT/$f.log" 2>&1 || { echo "STOP: błąd w $f.sql — log: $KAT/$f.log"; exit 1; }
done
cat > "$KAT/kontrola.sql" <<'EOF'
select (select count(*) from pg_tables where schemaname = 'public') as tabel,
       (select count(*) from pg_policies where schemaname = 'public') as polityk_public,
       (select count(*) from pg_policies where schemaname = 'storage') as polityk_storage,
       (select count(*) from storage.buckets) as bucketow,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as funkcji;
EOF
echo "→ kontrola TEST (prod 8.10: 66 relacji w migawce rls, 173 polityki public, 19 storage, 8 bucketów, 31 funkcji)"
supabase db query --db-url "$TEST_DB_URL" -f "$KAT/kontrola.sql" --agent=no
echo "✓ gotowe. PUSH_HOOK_SECRET dla Edge Functions testu: $KAT/sekret-push-hook.env (dopisz do pliku sekretów, NIE do repo)"
