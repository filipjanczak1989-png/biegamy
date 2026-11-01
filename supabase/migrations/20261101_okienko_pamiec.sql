-- 20261101_okienko_pamiec.sql — M2d „Zapytaj": pamięć odpowiedzi z sieci + znaleziska (leady do K-źródła).
--
-- okienko_siec_cache — klucz = pytanie znormalizowane (router.normalizuj), zdania + źródła z odpowiedzi trybu 'siec';
--   TTL 24 h liczy EF (utworzono > now() - 24 h) i cron czyści starsze; BEZ athlete_id (wspólna dla wszystkich).
--   Dostęp: NIKT z przeglądarki (RLS on, zero polityk, revoke anon/authenticated) — czyta i pisze wyłącznie EF
--   kluczem service_role.
-- okienko_znaleziska — źródło z odpowiedzi z sieci, które wygląda na wyniki/imprezę (domena z listy ZRODLA_WYNIKOW
--   albo pytanie o wyniki/bieg z datą/rokiem). Jedyna dana osobowa: athlete_id zgłaszającego (FK cascade — znika
--   z kontem). Odczyt: trener (coaches.id = auth.uid()) — widok w panelu; zapis i zmiana statusu: EF/service_role.
--   ⚠️ pole `pytanie` NIE trzyma tekstu pytania 1:1 — EF zapisuje tylko nazwę biegu i rok wyciągnięte z pytania
--   (pytanie o OSOBĘ nie trafia tu wcale) — patrz raport M2d, decyzja Filipa.
-- Retencja: cache 24 h (cron 'okienko-siec-cache-24h' co godzinę), znaleziska bez retencji (to lista do przejrzenia).
-- Wycofanie: 20261101_WYCOFANIE_okienko_pamiec.sql.

begin;

-- tryby M2d w logu: 'siec-cache' (odpowiedź z pamięci, 0 tokenów) i 'osoba' (pytanie o osobę — nie idzie do sieci)
alter table public.okienko_log drop constraint if exists okienko_log_tryb_check;
alter table public.okienko_log add constraint okienko_log_tryb_check
  check (tryb in ('router', 'flash', 'siec', 'siec-cache', 'osoba', 'limit', 'blad', 'budzet80'));

create table if not exists public.okienko_siec_cache (
  klucz       text primary key check (char_length(klucz) between 1 and 300),
  zdania      text[] not null,
  zrodla      jsonb not null default '[]'::jsonb,
  model       text not null,
  utworzono   timestamptz not null default now()
);
create index if not exists okienko_siec_cache_utworzono on public.okienko_siec_cache (utworzono);
alter table public.okienko_siec_cache enable row level security;
revoke all on public.okienko_siec_cache from anon, authenticated;

create table if not exists public.okienko_znaleziska (
  id            bigint generated always as identity primary key,
  pytanie       text not null check (char_length(pytanie) <= 200),
  nazwa_biegu   text check (char_length(nazwa_biegu) <= 200),
  rok           smallint check (rok between 1990 and 2100),
  url           text not null check (url like 'https://%' and char_length(url) <= 1000),
  domena        text not null check (char_length(domena) <= 200),
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  utworzono     timestamptz not null default now(),
  status        text not null default 'nowe' check (status in ('nowe', 'sprawdzone', 'odrzucone')),
  unique (url)
);
create index if not exists okienko_znaleziska_status on public.okienko_znaleziska (status, utworzono desc);
alter table public.okienko_znaleziska enable row level security;
revoke all on public.okienko_znaleziska from anon, authenticated;
grant select on public.okienko_znaleziska to authenticated;
drop policy if exists okienko_znaleziska_trener_czyta on public.okienko_znaleziska;
create policy okienko_znaleziska_trener_czyta on public.okienko_znaleziska
  for select to authenticated
  using (exists (select 1 from public.coaches c where c.id = auth.uid()));

select cron.schedule('okienko-siec-cache-24h', '7 * * * *',
  $job$ delete from public.okienko_siec_cache where utworzono < now() - interval '24 hours' $job$);

do $$
begin
  if has_table_privilege('anon', 'public.okienko_siec_cache', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('authenticated', 'public.okienko_siec_cache', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'okienko_pamiec: przeglądarka ma dostęp do cache — nie wdrażamy';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'okienko_siec_cache') then
    raise exception 'okienko_pamiec: polityka na cache — ma nie być żadnej';
  end if;
  if has_table_privilege('anon', 'public.okienko_znaleziska', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'okienko_pamiec: anon ma grant na znaleziska — nie wdrażamy';
  end if;
  if has_table_privilege('authenticated', 'public.okienko_znaleziska', 'INSERT, UPDATE, DELETE') then
    raise exception 'okienko_pamiec: authenticated może pisać znaleziska — nie wdrażamy';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'okienko_znaleziska' and cmd <> 'SELECT') then
    raise exception 'okienko_pamiec: polityka znalezisk inna niż SELECT';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'okienko_log_tryb_check' and pg_get_constraintdef(oid) like '%siec-cache%' and pg_get_constraintdef(oid) like '%osoba%') then
    raise exception 'okienko_pamiec: check trybu bez siec-cache/osoba';
  end if;
  if not exists (select 1 from cron.job where jobname = 'okienko-siec-cache-24h') then
    raise exception 'okienko_pamiec: brak zadania okienko-siec-cache-24h';
  end if;
end $$;

commit;
