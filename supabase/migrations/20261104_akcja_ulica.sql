-- 20261104_akcja_ulica.sql — ULICA AKCJI (Filip 4.11, gałąź akcja/ulica). Dane do ilustracji: cegiełki osób prywatnych, kwota wpisywana ręcznie i progi elementów.
--   akcja_cegielki — imię (jedno słowo, dozwolony jeden łącznik jak „Anna-Maria”, Filip 4.11; CHECK: bez spacji, więc bez „imię nazwisko”), zgoda (domyślnie NIE), potwierdzenie wpłaty wymuszone w bazie (CHECK = true).
--                    Dodaje i kasuje tylko trener: RLS przez auth_is_coach() (tabela coaches), NIE user_metadata, które użytkownik zmienia sam. Poprawka = usuń i dodaj; bez UPDATE
--                    z przeglądarki. Autora i datę stawia baza (brak grantu na te kolumny).
--   akcja_ulica    — jeden wiersz na akcję: kwota i cel zbiórki w złotych, oba wpisywane ręcznie w panelu (zbiórka nie daje kwoty, którą dałoby się odczytać automatycznie).
--                    Progi to % celu (Filip 4.11): latarnie 25, plac zabaw 50, park 100. Stałe w akcja_ulica_publiczna, tę samą listę ma podgląd w js/ulica.mjs (zgodność: blizna-151). Bez celu nic się nie odblokowuje.
--   akcja_ulica_publiczna(slug) — JEDYNE publiczne wyjście: tylko po starcie, tylko lista odblokowanych elementów, imiona przy zgodzie i liczba cegiełek bez imienia. Nigdy kwota ani cel.
--                    Bez EXECUTE dla kogokolwiek poza właścicielem: wychodzi wyłącznie przez akcja_licznik (osobna migracja 20261104_akcja_ulica_licznik.sql), tą samą drogą co reszta licznika,
--                    także dla niezalogowanych przez istniejącą EF akcja-licznik. Rola anon nie dostaje nic, żadnej nowej funkcji brzegowej.
--   Ta migracja akcja_licznik NIE dotyka i nie zależy od migracji firm: tabele i panel działają od razu, a rysunek bez niej pokazuje samą drogę.
--   Bez klucza do athletes, więc delete_my_account nie dotyka tych tabel. dodal → auth.users ON DELETE SET NULL, żeby wpis nie blokował kasowania konta trenera.
-- Test: tools/akcja-ulica-test.sh (przed wdrożeniem UL_Z_MIGRACJA=1). Wycofanie: 20261104_WYCOFANIE_akcja_ulica.sql.
begin;

create table public.akcja_cegielki (
  id                     uuid primary key default gen_random_uuid(),
  akcja_slug             text not null default 'dla-fabianka' references public.akcje(slug) on delete cascade,
  imie                   text not null constraint akcja_cegielki_jedno_imie check (char_length(imie) between 2 and 20 and imie ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$'),
  zgoda                  boolean not null default false,
  potwierdzenie_widziane boolean not null constraint akcja_cegielki_wplata_widziana check (potwierdzenie_widziane = true),
  dodano                 timestamptz not null default now(),
  dodal                  uuid default auth.uid() references auth.users(id) on delete set null
);
comment on table public.akcja_cegielki is 'Cegiełki osób prywatnych na rysunku ulicy. Dodaje i kasuje trener po potwierdzeniu wpłaty (RLS: auth_is_coach). Publicznie tylko przez akcja_ulica_publiczna: imię wyłącznie przy zgodzie.';
comment on column public.akcja_cegielki.zgoda is 'Zgoda na imię w murze. Domyślnie NIE. Bez zgody cegiełka jest w murze bez imienia. Wycofanie zgody = trener kasuje wpis.';
comment on column public.akcja_cegielki.potwierdzenie_widziane is 'Trener widział potwierdzenie wpłaty. CHECK = true, nie wychodzi publicznie.';
create index akcja_cegielki_lista on public.akcja_cegielki (akcja_slug, dodano, id);

create table public.akcja_ulica (
  akcja_slug         text primary key references public.akcje(slug) on delete cascade,
  kwota_zl           numeric(12,2) constraint akcja_ulica_kwota check (kwota_zl is null or kwota_zl >= 0),
  cel_zl             numeric(12,2) constraint akcja_ulica_cel check (cel_zl is null or cel_zl > 0),
  zmieniono          timestamptz not null default now(),
  zmienil            uuid default auth.uid() references auth.users(id) on delete set null
);
comment on table public.akcja_ulica is 'Kwota i cel zbiórki (zł), wpisywane ręcznie przez trenera. Nie wychodzą z bazy poza panel trenera; publicznie tylko lista odblokowanych elementów (progi: % celu w akcja_ulica_publiczna).';

-- Autor i data zmiany: stawia baza, także przy upsercie z panelu.
create function public.akcja_ulica_zmiana() returns trigger
language plpgsql set search_path = public, pg_temp as $fn$
begin
  new.zmieniono := now();
  new.zmienil := auth.uid();
  return new;
end $fn$;
revoke all on function public.akcja_ulica_zmiana() from public, anon, authenticated;
create trigger akcja_ulica_zmiana before update on public.akcja_ulica for each row execute function public.akcja_ulica_zmiana();

-- create table w Supabase nadaje anonowi i authenticated ALL przez default privileges (pg_default_acl): najpierw zabieramy, potem tylko to, co potrzebne.
alter table public.akcja_cegielki enable row level security;
alter table public.akcja_ulica enable row level security;
revoke all on public.akcja_cegielki from public, anon, authenticated;
revoke all on public.akcja_ulica from public, anon, authenticated;
grant select, delete on public.akcja_cegielki to authenticated;
grant insert (akcja_slug, imie, zgoda, potwierdzenie_widziane) on public.akcja_cegielki to authenticated;
grant select on public.akcja_ulica to authenticated;
grant insert (akcja_slug, kwota_zl, cel_zl),
      update (kwota_zl, cel_zl) on public.akcja_ulica to authenticated;

create policy akcja_cegielki_trener_odczyt on public.akcja_cegielki for select to authenticated using (public.auth_is_coach());
create policy akcja_cegielki_trener_dodaje on public.akcja_cegielki for insert to authenticated with check (public.auth_is_coach() and dodal = auth.uid());
create policy akcja_cegielki_trener_kasuje on public.akcja_cegielki for delete to authenticated using (public.auth_is_coach());
create policy akcja_ulica_trener_odczyt on public.akcja_ulica for select to authenticated using (public.auth_is_coach());
create policy akcja_ulica_trener_dodaje on public.akcja_ulica for insert to authenticated with check (public.auth_is_coach());
create policy akcja_ulica_trener_zmienia on public.akcja_ulica for update to authenticated using (public.auth_is_coach()) with check (public.auth_is_coach());

-- Publiczne wyjście. Pola wymienione po imieniu; kwota i cel nie opuszczają funkcji. Przed startem pusto, żeby nic nie zdradzało akcji.
create function public.akcja_ulica_publiczna(p_slug text)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_start timestamptz; u public.akcja_ulica; v_odb text[] := '{}'; v_imiona jsonb; v_bez integer;
begin
  select wystartowala_at into v_start from public.akcje where slug = p_slug;
  if v_start is null then
    return jsonb_build_object('odblokowane', '[]'::jsonb, 'imiona', '[]'::jsonb, 'bez_imienia', 0);
  end if;
  select * into u from public.akcja_ulica where akcja_slug = p_slug;
  if found and u.kwota_zl is not null and u.cel_zl is not null then
    if u.kwota_zl * 100 >= u.cel_zl * 25 then v_odb := v_odb || 'latarnie'::text; end if;
    if u.kwota_zl * 100 >= u.cel_zl * 50 then v_odb := v_odb || 'plac_zabaw'::text; end if;
    if u.kwota_zl * 100 >= u.cel_zl * 100 then v_odb := v_odb || 'park'::text; end if;
  end if;
  select coalesce(jsonb_agg(c.imie order by c.dodano, c.id) filter (where c.zgoda), '[]'::jsonb), (count(*) filter (where not c.zgoda))::integer
    into v_imiona, v_bez from public.akcja_cegielki c where c.akcja_slug = p_slug;
  return jsonb_build_object('odblokowane', to_jsonb(v_odb), 'imiona', v_imiona, 'bez_imienia', v_bez);
exception when others then
  -- Woła ją licznik akcji: awaria dodatków do rysunku nie może zabrać licznika.
  return jsonb_build_object('odblokowane', '[]'::jsonb, 'imiona', '[]'::jsonb, 'bez_imienia', 0);
end $fn$;
revoke all on function public.akcja_ulica_publiczna(text) from public, anon, authenticated, service_role;

do $$
declare t text; j jsonb;
begin
  foreach t in array array['public.akcja_cegielki', 'public.akcja_ulica'] loop
    if has_table_privilege('anon', t, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('anon', t, 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'akcja_ulica: anon ma uprawnienia do % — nie wdrażamy', t;
    end if;
    if has_table_privilege('authenticated', t, 'INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER') then
      raise exception 'akcja_ulica: authenticated ma za szerokie uprawnienia tabelowe do %', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = t::regclass) then raise exception 'akcja_ulica: RLS wyłączone na %', t; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = split_part(t, '.', 2)
                and ((coalesce(qual, '') || coalesce(with_check, '')) not like '%auth_is_coach()%' or roles <> '{authenticated}')) then
      raise exception 'akcja_ulica: polityka na % bez auth_is_coach', t;
    end if;
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = split_part(t, '.', 2)) <> 3 then
      raise exception 'akcja_ulica: liczba polityk na % niezgodna z migracją', t;
    end if;
  end loop;
  if has_any_column_privilege('authenticated', 'public.akcja_cegielki', 'UPDATE')
     or has_column_privilege('authenticated', 'public.akcja_cegielki', 'dodal', 'INSERT')
     or has_column_privilege('authenticated', 'public.akcja_cegielki', 'dodano', 'INSERT')
     or has_column_privilege('authenticated', 'public.akcja_cegielki', 'id', 'INSERT')
     or has_column_privilege('authenticated', 'public.akcja_ulica', 'zmienil', 'UPDATE')
     or has_column_privilege('authenticated', 'public.akcja_ulica', 'zmieniono', 'UPDATE')
     or has_column_privilege('authenticated', 'public.akcja_ulica', 'akcja_slug', 'UPDATE') then
    raise exception 'akcja_ulica: grant na kolumnę, którą stawia baza';
  end if;
  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'akcja_cegielki' and column_name = 'zgoda') <> 'false' then
    raise exception 'akcja_cegielki: zgoda ma być domyślnie false';
  end if;
  if has_function_privilege('anon', 'public.akcja_ulica_publiczna(text)', 'execute') or has_function_privilege('authenticated', 'public.akcja_ulica_publiczna(text)', 'execute') then
    raise exception 'akcja_ulica_publiczna: EXECUTE poza właścicielem, a wychodzić ma tylko przez licznik';
  end if;
  j := public.akcja_ulica_publiczna('dla-fabianka');
  if (select count(*) from jsonb_object_keys(j)) <> 3 or not (j ? 'odblokowane' and j ? 'imiona' and j ? 'bez_imienia') then
    raise exception 'akcja_ulica_publiczna: pola inne niż trzy publiczne';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
