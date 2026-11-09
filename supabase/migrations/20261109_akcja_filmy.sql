-- FILMY AKCJI RAZ NA KONTO (Filip 9.11): film startu gra raz na konto (pierwsze wejście po starcie), zapamiętane w profilu, nie tylko w telefonie.
-- Miejsce na krótkie filmy kamieni milowych (np. 1 000 km, 25 % / 50 % / 100 % celu): każdy raz na konto, pierwszy raz po przekroczeniu progu.
-- Uruchamia Filip: supabase db query --linked --workdir ~/.cache/sb-audit -f "<ścieżka absolutna>", nigdy db push. Najpierw test: FILMY_Z_MIGRACJA=1 bash tools/akcja-filmy-test.sh.
-- Wycofanie: 20261109_WYCOFANIE_akcja_filmy.sql. Niezależna od 20261109_akcja_po_starcie.sql.
--   akcja_filmy_obejrzane: kto co widział (konto, akcja, id filmu). RLS bez polityk, bez grantów dla przeglądarki: tylko dwie funkcje niżej, dla auth.uid().
--   akcje.filmy_progow: [{id, km | pct, url | plik}]. Prawdziwa akcja: url (adres podpisany, jak film_akcji_url). Akcja testowa: plik w kubełku akcja-wizerunek,
--     adres na 15 minut daje funkcja akcja-proba-wizerunek. Tabela akcje nie ma grantów dla przeglądarki (migawka RLS), więc kolumna nie wychodzi wprost.
--   akcja_filmy_konta(slug): progi z adresami tylko po starcie i tylko przy zgodzie na wizerunek (jak film startu w akcja_licznik), plus filmy widziane przez to konto.
--     Na akcji testowej liczy się tylko to, co widziane po ostatnim naciśnięciu guzika (po „od zera” filmy grają jeszcze raz).
--   akcja_film_obejrzany(slug, film): zapis „widziane” dla własnego konta.
--   Próba: jeden film testowy na progu 1 000 km = ten sam plik co film startu (bez nowych plików). Prawdziwa akcja: pusta lista, pliki dojdą później.
--   Licznik km, akcja_licznik i pushe bez zmian.
begin;

do $$
begin
  if to_regclass('public.akcja_filmy_obejrzane') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'akcje' and column_name = 'filmy_progow') then
    raise exception 'akcja_filmy: migracja już wdrożona';
  end if;
end $$;

alter table public.akcje add column filmy_progow jsonb not null default '[]'::jsonb
  constraint akcje_filmy_progow_lista check (jsonb_typeof(filmy_progow) = 'array' and jsonb_array_length(filmy_progow) <= 20);
comment on column public.akcje.filmy_progow is 'Filmy kamieni milowych: [{id, km | pct, url | plik}]. Wychodzą tylko przez akcja_filmy_konta (po starcie, przy zgodzie na wizerunek) i akcja-proba-wizerunek (próba, 15 min).';

create table public.akcja_filmy_obejrzane (
  user_id    uuid not null references auth.users(id) on delete cascade,
  akcja_slug text not null references public.akcje(slug) on delete cascade,
  film       text not null check (film ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  obejrzano  timestamptz not null default now(),
  primary key (user_id, akcja_slug, film)
);
comment on table public.akcja_filmy_obejrzane is 'Filmy akcji widziane przez konto (film startu „start”, kamienie milowe wg akcje.filmy_progow). Zero dostępu z przeglądarki: tylko akcja_filmy_konta / akcja_film_obejrzany dla auth.uid().';
alter table public.akcja_filmy_obejrzane enable row level security;
revoke all on public.akcja_filmy_obejrzane from public, anon, authenticated;
grant all on public.akcja_filmy_obejrzane to service_role;

CREATE OR REPLACE FUNCTION public.akcja_filmy_konta(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a public.akcje; v_progi jsonb := '[]'::jsonb; v_widziane jsonb := '[]'::jsonb;
begin
  select * into a from public.akcje where slug = p_slug;
  if not found or a.wystartowala_at is null or auth.uid() is null then
    return jsonb_build_object('progi', '[]'::jsonb, 'obejrzane', '[]'::jsonb);
  end if;
  -- Progi: id i próg zawsze (front wie, kiedy zagrać), adres tylko na prawdziwej akcji przy zgodzie na wizerunek. Próba dostaje adresy z akcja-proba-wizerunek.
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', f->>'id', 'km', f->'km', 'pct', f->'pct',
                    'url', case when a.wizerunek_zgoda and not a.testowa then f->>'url' end)) order by n), '[]'::jsonb)
    into v_progi
    from jsonb_array_elements(a.filmy_progow) with ordinality as x(f, n)
   where coalesce(f->>'id', '') ~ '^[a-z0-9][a-z0-9-]{0,39}$' and (jsonb_typeof(f->'km') = 'number' or jsonb_typeof(f->'pct') = 'number');
  select coalesce(jsonb_agg(o.film order by o.obejrzano, o.film), '[]'::jsonb) into v_widziane
    from public.akcja_filmy_obejrzane o
   where o.user_id = auth.uid() and o.akcja_slug = p_slug and (not a.testowa or o.obejrzano >= a.wystartowala_at);
  return jsonb_build_object('progi', v_progi, 'obejrzane', v_widziane);
end $function$;

CREATE OR REPLACE FUNCTION public.akcja_film_obejrzany(p_slug text, p_film text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Tylko własne konto, tylko po starcie. Drugi zapis tego samego filmu niczego nie zmienia (pierwsze obejrzenie zostaje).
  if auth.uid() is null then raise exception 'akcja_film_obejrzany: brak sesji' using errcode = '42501'; end if;
  if p_film is null or p_film !~ '^[a-z0-9][a-z0-9-]{0,39}$' then raise exception 'akcja_film_obejrzany: zły film' using errcode = '22023'; end if;
  if not exists (select 1 from public.akcje where slug = p_slug and wystartowala_at is not null) then return false; end if;
  insert into public.akcja_filmy_obejrzane (user_id, akcja_slug, film, obejrzano) values (auth.uid(), p_slug, p_film, clock_timestamp())
    on conflict (user_id, akcja_slug, film) do update set obejrzano = excluded.obejrzano
    where public.akcja_filmy_obejrzane.obejrzano < (select a.wystartowala_at from public.akcje a where a.slug = p_slug and a.testowa);
  return true;
end $function$;

revoke all on function public.akcja_filmy_konta(text) from public, anon;
revoke all on function public.akcja_film_obejrzany(text, text) from public, anon;
grant execute on function public.akcja_filmy_konta(text) to authenticated;
grant execute on function public.akcja_film_obejrzany(text, text) to authenticated;

-- Próba: film testowy na progu 1 000 km (ten sam plik co film startu). Prawdziwej akcji nie ruszamy.
update public.akcje set filmy_progow = '[{"id": "test-1000km", "km": 1000, "plik": "film-akcja.mp4"}]'::jsonb where slug = 'proba' and testowa;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_filmy_obejrzane') then raise exception 'akcja_filmy: polityka na akcja_filmy_obejrzane'; end if;
  if has_table_privilege('anon', 'public.akcja_filmy_obejrzane', 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', 'public.akcja_filmy_obejrzane', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.akcje', 'SELECT') or has_table_privilege('authenticated', 'public.akcje', 'SELECT')
     or has_column_privilege('authenticated', 'public.akcje', 'filmy_progow', 'SELECT') then
    raise exception 'akcja_filmy: dane filmów dostępne z przeglądarki';
  end if;
  if has_function_privilege('anon', 'public.akcja_filmy_konta(text)', 'EXECUTE') or has_function_privilege('anon', 'public.akcja_film_obejrzany(text, text)', 'EXECUTE') then
    raise exception 'akcja_filmy: anon woła funkcje filmów';
  end if;
  if (select filmy_progow from public.akcje where slug = 'dla-fabianka') <> '[]'::jsonb then raise exception 'akcja_filmy: prawdziwa akcja ma filmy progów bez plików'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
