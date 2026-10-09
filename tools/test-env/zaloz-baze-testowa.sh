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
#   5. wykonanie na bazie TESTOWEJ psql-em z kontenera, potem kontrola liczby tabel/polityk
#
# Czego NIE robi (świadomie): zadania cron (miesiac-karta, morning-brief-hourly wołałyby AI co godzinę),
# pliki w bucketach, użytkownicy (robi to seed.js), ustawienia Auth w panelu (Site URL, redirect URLs, Google).
#
# HASŁA: tylko w zmiennych środowiska TWOJEJ sesji, nigdy w pliku, repo ani czacie.
#   TEST_REF          — identyfikator projektu testowego (np. abcd1234...)
#   TEST_DB_URL       — SESSION POOLER testu (Dashboard → Connect → Session pooler):
#                       postgresql://postgres.<TEST_REF>:<HASŁO>@aws-?-eu-central-1.pooler.supabase.com:5432/postgres
#                       NIE db.<TEST_REF>.supabase.co — ten host ma tylko IPv6, a kontener w Docker Desktop
#                       IPv6 nie ma (pg_isready: „no response", pooler: „accepting connections", zmierzone 9.10)
#   TEST_ANON_KEY     — klucz publishable/anon projektu testowego (do vault publishable_key)
#   hasło PROD        — NIEPOTRZEBNE: `db dump --linked` loguje się tokenem CLI przez tymczasową rolę
#                       („Initialising login role…", zmierzone 8.10 bez SUPABASE_DB_PASSWORD)
#   Docker Desktop    — WYMAGANY: CLI uruchamia pg_dump w kontenerze, a SQL na bazie testowej wykonuje psql
#                       z obrazu $OBRAZ_PSQL (docker run --rm; bez Dockera: „failed to inspect docker image")
#   psql na Windows   — niepotrzebny. `supabase db query` NIE nadaje się do zrzutu: wysyła plik jako JEDNO
#                       prepared statement („cannot insert multiple commands", SQLSTATE 42601, zmierzone 9.10)
#   Hasło testu idzie do kontenera jako `-e PGPASSWORD` (sama nazwa, wartość z env) — nie ma go w linii komend.
#   Każdy plik leci w JEDNEJ transakcji (psql -1, ON_ERROR_STOP) → błąd = nic z tego pliku nie zostaje;
#   po sukcesie powstaje znacznik <plik>.ok i wznowienie go pomija.
# Użycie (Git Bash, z korzenia repo, projekt prod podpięty `supabase link`):
#   TEST_REF=… TEST_DB_URL='…' TEST_ANON_KEY='…' bash tools/test-env/zaloz-baze-testowa.sh
# Wznowienie na ISTNIEJĄCYM zrzucie (bez ponownego dump — prod nietknięty):
#   WZNOW=ostatni TEST_REF=… TEST_DB_URL='…' bash tools/test-env/zaloz-baze-testowa.sh
#   (WZNOW=<katalog> dla konkretnego przebiegu; TEST_ANON_KEY niepotrzebny — vault-test.sql już jest)
# Pliki pośrednie: ~/.cache/biegamy-test/<data>/ (POZA repo).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
PROD_REF=afqojgkaveykxbltxzwm
OBRAZ_PSQL=public.ecr.aws/supabase/postgres:17.6.1.104
: "${TEST_REF:?Brak TEST_REF}"; : "${TEST_DB_URL:?Brak TEST_DB_URL}"
if [ -z "${WZNOW:-}" ]; then : "${TEST_ANON_KEY:?Brak TEST_ANON_KEY}"; fi
if [ "$TEST_REF" = "$PROD_REF" ]; then echo "STOP: TEST_REF = PROD"; exit 1; fi
case "$TEST_DB_URL" in *"$PROD_REF"*) echo "STOP: TEST_DB_URL wskazuje PROD"; exit 1;; esac
case "$TEST_DB_URL" in *"$TEST_REF"*) ;; *) echo "STOP: TEST_DB_URL nie zawiera TEST_REF — sprawdź adres"; exit 1;; esac
case "$TEST_DB_URL" in *"@db.$TEST_REF.supabase.co"*) echo "STOP: TEST_DB_URL to host bezpośredni (tylko IPv6, kontener go nie widzi) — użyj Session pooler z Dashboard → Connect"; exit 1;; esac
if ! docker info >/dev/null 2>&1; then echo "STOP: Docker nie działa — uruchom Docker Desktop (pg_dump i psql idą w kontenerze)"; exit 1; fi
if ! docker image inspect "$OBRAZ_PSQL" >/dev/null 2>&1; then echo "STOP: brak obrazu $OBRAZ_PSQL (docker pull $OBRAZ_PSQL)"; exit 1; fi

{ IFS= read -r PGHOST; IFS= read -r PGPORT; IFS= read -r PGUSER; IFS= read -r PGPASSWORD; IFS= read -r PGDATABASE; } < <(TEST_DB_URL="$TEST_DB_URL" node -e '
  const u = new URL(process.env.TEST_DB_URL);
  console.log([u.hostname, u.port || "5432", decodeURIComponent(u.username), decodeURIComponent(u.password),
               decodeURIComponent(u.pathname.slice(1)) || "postgres"].join("\n"));')
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
if [ -z "$PGPASSWORD" ]; then echo "STOP: TEST_DB_URL bez hasła"; exit 1; fi

if [ -n "${WZNOW:-}" ]; then
  if [ "$WZNOW" = "ostatni" ]; then
    KAT=""
    for d in "$HOME"/.cache/biegamy-test/*/; do [ -s "$d/schemat-test.sql" ] && KAT="${d%/}"; done
  else KAT="${WZNOW%/}"; fi
  if [ -z "$KAT" ]; then echo "STOP: brak przebiegu ze zrzutem w ~/.cache/biegamy-test"; exit 1; fi
  for f in schemat-test uzupelnienia-test vault-test; do
    if [ ! -s "$KAT/$f.sql" ]; then echo "STOP: wznowienie — brak $KAT/$f.sql"; exit 1; fi
  done
  echo "→ WZNOWIENIE na zrzucie $KAT (bez dump, prod nietknięty)"
else
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

  PUSH_HOOK_SECRET="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  printf "PUSH_HOOK_SECRET=%s\n" "$PUSH_HOOK_SECRET" > "$KAT/sekret-push-hook.env"; chmod 600 "$KAT/sekret-push-hook.env"
  cat > "$KAT/vault-test.sql" <<EOF
select vault.create_secret('$PUSH_HOOK_SECRET', 'push_hook_secret');
select vault.create_secret('$TEST_ANON_KEY', 'publishable_key');
EOF
fi
if grep -l "$PROD_REF" "$KAT"/*-test.sql; then echo "STOP: adres PROD w plikach do wykonania"; exit 1; fi
echo "   funkcje z net.http_post wskazują: $(grep -o "https://[a-z0-9]*\.supabase\.co" "$KAT/schemat-test.sql" | sort -u | tr '\n' ' ')"

KAT_WIN="$(cygpath -w "$KAT" 2>/dev/null || echo "$KAT")"
psql_test() {
  MSYS_NO_PATHCONV=1 docker run --rm -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE \
    -e PGSSLMODE=require -e PGAPPNAME=zaloz-baze-testowa \
    --mount "type=bind,source=$KAT_WIN,target=/sql,readonly" \
    --entrypoint psql "$OBRAZ_PSQL" -X -v ON_ERROR_STOP=1 "$@"
}

echo "→ połączenie z bazą TESTOWĄ ($PGHOST, $PGUSER)"
TABEL_PRZED="$(psql_test -At -c "select count(*) from pg_tables where schemaname = 'public'")" || { echo "STOP: brak połączenia z bazą testową"; exit 1; }
echo "   tabel w public przed: $TABEL_PRZED"
if [ ! -e "$KAT/schemat-test.ok" ] && [ "$TABEL_PRZED" != "0" ]; then
  echo "STOP: baza testowa NIE jest pusta, a schemat z tego przebiegu nie był wykonany — nie nakładam zrzutu na nieznany stan"; exit 1
fi

echo "→ wykonanie na bazie TESTOWEJ (każdy plik = jedna transakcja)"
for f in schemat-test uzupelnienia-test vault-test; do
  if [ -e "$KAT/$f.ok" ]; then echo "   $f.sql — już wykonany ($f.ok), pomijam"; continue; fi
  echo "   $f.sql"
  psql_test -1 -q -f "/sql/$f.sql" > "$KAT/$f.log" 2>&1 || { echo "STOP: błąd w $f.sql (transakcja wycofana) — log: $KAT/$f.log"; tail -5 "$KAT/$f.log"; exit 1; }
  date +%FT%T > "$KAT/$f.ok"
done
cat > "$KAT/kontrola.sql" <<'EOF'
select (select count(*) from pg_tables where schemaname = 'public') as tabel,
       (select count(*) from pg_policies where schemaname = 'public') as polityk_public,
       (select count(*) from pg_policies where schemaname = 'storage') as polityk_storage,
       (select count(*) from storage.buckets) as bucketow,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as funkcji;
EOF
echo "→ kontrola TEST (prod 8.10: 66 relacji w migawce rls, 173 polityki public, 19 storage, 8 bucketów, 31 funkcji)"
psql_test -f /sql/kontrola.sql
echo "✓ gotowe. PUSH_HOOK_SECRET dla Edge Functions testu: $KAT/sekret-push-hook.env (dopisz do pliku sekretów, NIE do repo)"
