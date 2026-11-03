-- 20261105_okladki_automat.sql — KALENDARZ etapy 2–3 (Filip 3.11 02:31): okładki imprez Z AUTOMATU + „Zmień zdjęcie” trenera.
--   * okladki_log — każde wygenerowanie/wgranie okładki (automat nocny, trener: Gemini albo własne zdjęcie, race-image): rodzaj, klucz/race_id,
--     koszt USD, kto, ok/błąd. Z niego: limit 30/dobę automatu, limit 20/dobę trenera (Gemini), RAPORT KOSZTU. Zapis tylko service (EF).
--   * cron okladki-imprez-noc 02:40 UTC → EF okladki-imprez {rodzaj:'noc'} z sekretem z vault (jak akcja-push): do 30 okładek dla imprez
--     bez okładki, najbliższe terminy najpierw; lista imprez z F6 przez konto serwisowe (sekrety F6_KONTO_EMAIL/F6_KONTO_HASLO).
--   * imprezy_okladki.zrodlo: 'gemini-…' (automat), 'trener-gemini', 'trener-wlasne' — nadpisanie przez trenera zastępuje automat.
-- Test po skutku: tools/okladki-automat-test.sh. Wycofanie: 20261105_WYCOFANIE_okladki_automat.sql.
begin;

create table public.okladki_log (
  id        bigint generated always as identity primary key,
  kiedy     timestamptz not null default now(),
  rodzaj    text not null check (rodzaj in ('automat', 'trener-gemini', 'trener-wlasne', 'race-gemini', 'race-wlasne')),
  klucz     text check (klucz is null or char_length(klucz) <= 200),
  race_id   uuid references public.races(id) on delete set null,
  koszt_usd numeric(6,3) not null default 0 check (koszt_usd >= 0),
  kto       uuid,
  ok        boolean not null default true,
  blad      text check (blad is null or char_length(blad) <= 300)
);
comment on table public.okladki_log is 'Okładki: każde wygenerowanie/wgranie (automat, trener, race-image) z kosztem — limity dzienne i raport kosztu. Pisze tylko EF (service).';
create index okladki_log_kiedy on public.okladki_log (kiedy desc);
alter table public.okladki_log enable row level security;
revoke all on public.okladki_log from public, anon, authenticated;

select cron.schedule('okladki-imprez-noc', '40 2 * * *', $job$
  select net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/okladki-imprez',
    headers := jsonb_build_object('Content-Type','application/json',
               'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
    body    := '{"rodzaj":"noc"}'::jsonb);
$job$);

do $$
begin
  if has_table_privilege('anon', 'public.okladki_log', 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', 'public.okladki_log', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'okladki_log: dostęp z przeglądarki — nie wdrażamy';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'okladki_log') then raise exception 'okladki_log: polityka na tabeli bez grantów'; end if;
  if not exists (select 1 from cron.job where jobname = 'okladki-imprez-noc') then raise exception 'brak crona okladki-imprez-noc'; end if;
  if has_table_privilege('authenticated', 'public.imprezy_okladki', 'INSERT, UPDATE, DELETE') then raise exception 'imprezy_okladki: zalogowany pisze (ma pisać tylko EF)'; end if;
end $$;

commit;
