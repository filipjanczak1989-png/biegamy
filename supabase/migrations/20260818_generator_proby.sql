-- Telemetria generatora planów: co ludzie próbowali ułożyć i co dostali.
--
-- DLACZEGO: generator odmawia planu na 14 różnych sposobów i do dziś NIE WIEMY,
-- które ściany realnie odpalają. Dwie usterki znalezione w sierpniu (sufit
-- objętości ignorujący czas, limit poprawy ignorujący horyzont) wyszły dlatego,
-- że Maciek NAPISAŁ. Wszyscy, którzy odbili się od ściany i nie napisali, są
-- dla nas niewidzialni. Ta tabela ma zamienić „ktoś się poskarżył" w liczbę.
--
-- ⚠️ NAZWA MÓWI `proby`, NIE `odmowy`, I TO JEST CELOWE. Licznik samych odmów
--    nie odpowiada na pytanie „jak często generator odmawia" — brakuje mu
--    mianownika. Dlatego zapisujemy KAŻDĄ próbę, z kolumną `wynik`. Koszt to
--    jedna kolumna, a bez niej liczba odmów jest nieinterpretowalna.
--
-- ⚠️⚠️ TO JEST DOLNA GRANICA, NIE PEŁNY OBRAZ — i to jest najważniejsze zdanie
--    w tym pliku. Generator liczy się W PRZEGLĄDARCE, więc zapis idzie z klienta
--    i może NIE DOJŚĆ: offline, zamknięta karta, błąd sieci, wyłączony JS,
--    odrzucenie przez RLS. Zapis jest świadomie „fire and forget" — jego
--    niepowodzenie NIE MOŻE zablokować pokazania planu człowiekowi.
--    Wniosek dla każdego, kto będzie te dane czytał:
--      „150 odmów w miesiącu" znaczy CO NAJMNIEJ 150, nigdy DOKŁADNIE 150.
--      Braku wzrostu NIE WOLNO czytać jako „nikt nie próbował".
--    To ta sama pułapka co LEKCJE #11 — wskaźnik zastępczy podany jako pomiar.
--    Jedyny sposób na twardą liczbę to policzyć po stronie serwera, czyli
--    przenieść generator do Edge Function. Dziś tego nie robimy.

create table if not exists public.generator_proby (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  utworzono     timestamptz not null default now(),
  wynik         text not null check (wynik in ('plan', 'odmowa')),
  kod_odmowy    text,               -- NULL gdy wynik='plan'; kod ściany gdy 'odmowa'
  dystans       text,
  tygodnie      smallint,           -- horyzont: ile tygodni do startu
  dni_w_tygodniu smallint,
  baza_km       numeric(6,2),       -- objętość, z którą przyszedł
  cel_czasowy_s integer,            -- NULL = nie podał celu
  szczegoly     jsonb,              -- `sciana.szczegoly` — liczby, którymi generator uzasadnił odmowę
  -- Odmowa MUSI mieć kod, plan NIE MOŻE go mieć. Bez tego po miesiącu
  -- w tabeli leżą wiersze, o których nie wiadomo, co znaczą.
  constraint generator_proby_kod_spojny check (
    (wynik = 'odmowa' and kod_odmowy is not null) or
    (wynik = 'plan'   and kod_odmowy is null)
  )
);

comment on table public.generator_proby is
  'Próby ułożenia planu przez generator. ⚠️ DOLNA GRANICA — zapis idzie z '
  'przeglądarki i może nie dojść (offline, zamknięta karta, błąd). Liczby czytać '
  'jako „co najmniej", nigdy „dokładnie". Brak wzrostu ≠ nikt nie próbował.';

comment on column public.generator_proby.kod_odmowy is
  'Kod ściany z generator-planu.js (CEL_ZA_AMBITNY, ZA_MALO_TYGODNI, SKOK_OBJETOSCI, …). '
  'NULL gdy plan powstał.';

-- Odczyt zawsze idzie „ostatnie N dla tego zawodnika" albo „ostatnie N w ogóle”.
create index if not exists idx_generator_proby_athlete_czas
  on public.generator_proby (athlete_id, utworzono desc);
create index if not exists idx_generator_proby_czas
  on public.generator_proby (utworzono desc);

-- ══ RLS ════════════════════════════════════════════════════════════════════
alter table public.generator_proby enable row level security;

-- Zawodnik dopisuje WYŁĄCZNIE własne próby. `athlete_id` musi wskazywać na
-- jego wiersz w `athletes` — inaczej dałoby się zapisywać cudzym nazwiskiem.
drop policy if exists generator_proby_insert_wlasne on public.generator_proby;
create policy generator_proby_insert_wlasne on public.generator_proby
  for insert to authenticated
  with check (athlete_id in (select id from public.athletes where user_id = auth.uid()));

-- Odczyt tylko własnych. Telemetrię zbiorczą czyta się `service_role`-em
-- (SQL/EF), a nie z klienta — inaczej każdy zawodnik widziałby, ilu ludzi
-- odbiło się od ściany, co jest cudzą sprawą.
drop policy if exists generator_proby_select_wlasne on public.generator_proby;
create policy generator_proby_select_wlasne on public.generator_proby
  for select to authenticated
  using (athlete_id in (select id from public.athletes where user_id = auth.uid()));

-- ⚠️ REVOKE OD `anon` JEST KONIECZNY, NIE OSTROŻNOŚCIOWY.
-- Default privileges Supabase w schemacie `public` dosypują `anon=ALL` KAŻDEMU
-- nowo tworzonemu obiektowi, niezależnie od tego, co zGRANTujemy jawnie
-- (pg_default_acl: GRANT ALL ON TABLES TO anon, authenticated, service_role).
-- Tutaj RLS by to zatrzymał, ale liczyć na jedną warstwę przy telemetrii
-- wiązanej z konkretnym człowiekiem to za mało. Kontrola jest niżej.
revoke all on public.generator_proby from anon;

-- ⚠️ TO SAMO DOTYCZY `authenticated` — i tu jawny GRANT NIE WYSTARCZA.
-- Zmierzone zaraz po CREATE 18.08.2026: relacl pokazał `authenticated=arwdDxtm`,
-- czyli komplet z UPDATE, DELETE i TRUNCATE, mimo że niżej nadaję tylko
-- SELECT i INSERT. Default privileges dosypały resztę. Dziś zatrzymuje je RLS
-- (nie ma polityki FOR UPDATE ani FOR DELETE, więc obie są odrzucane), ale
-- telemetria, którą jej podmiot może skasować, przestaje być telemetrią —
-- a jedna warstwa obrony to za mało, żeby na tym polegać.
revoke all on public.generator_proby from authenticated;

grant select, insert on public.generator_proby to authenticated;
grant all    on public.generator_proby to service_role;

-- ══ KONTROLA PO MIGRACJI ═══════════════════════════════════════════════════
-- ⚠️ SPRAWDZIĆ, NIE ZAKŁADAĆ — relacl NIE MOŻE zawierać wpisu dla `anon`:
--   select relrowsecurity, relacl::text from pg_class
--    where oid = 'public.generator_proby'::regclass;
-- Oczekiwane: relrowsecurity = t, w relacl brak `anon=`.
