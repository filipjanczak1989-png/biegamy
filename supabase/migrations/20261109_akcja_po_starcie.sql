-- PO STARCIE AKCJI dla-fabianka (Filip 9.11): złota cegła w murze darczyńców i „Ukryj” kafla akcji zapisane na koncie.
-- Uruchamia Filip: supabase db query --linked --workdir ~/.cache/sb-audit -f "<ścieżka absolutna>", nigdy db push. Najpierw test: PO_STARCIE_Z_MIGRACJA=1 bash tools/akcja-po-starcie-test.sh.
-- Wycofanie: 20261109_WYCOFANIE_akcja_po_starcie.sql.
--   akcja_cegielki.zlota: złota cegła (wpłata od 100 zł). Publicznie wychodzi tylko ta flaga, kwota nigdy (akcja_cegielki kwoty nie ma, zgłoszenie trzyma ją tylko dla panelu).
--   akcja_cegla_zlota(id, zlota): przełącznik w panelu przy wpisie w murze, tylko trener (auth_is_coach). Polityki RLS akcja_cegielki bez zmian (3), granty tabeli bez zmian.
--   akcja_firmy_zatwierdz: cegiełka ze zgłoszenia z kwotą od 100 zł wchodzi do muru jako złota (panel może to zmienić tym samym przełącznikiem). Firmy bez zmian.
--   akcja_ulica_publiczna: dochodzi lista 'cegly' (najpierw złote, potem najnowsze; imię tylko przy zgodzie, bez kwoty) i 'cegly_n'. 'imiona' i 'bez_imienia' zostają dla starego frontu.
--   Patryk (wpis z 9.11 10:05, 150 zł): złota cegła.
--   akcja_ukryte: „Ukryj” kafla akcji na koncie (nie tylko w telefonie). RLS bez polityk i bez grantów dla anon/authenticated: czyta i pisze tylko
--     akcja_kafel_ukryj / akcja_kafel_ukryty dla własnego konta (auth.uid()). Pushe i liczenie km nie czytają tej tabeli.
--   Licznik km bez zmian: akcja_licznik i akcja_km_okna nietknięte.
begin;

-- Produkcja bywa nowsza od repo: podmieniamy tylko wersje, z których powstała ta migracja (odczyt 9.11).
do $$
begin
  if md5(regexp_replace(pg_get_functiondef('public.akcja_firmy_zatwierdz(uuid, text, uuid)'::regprocedure), '\s+', ' ', 'g')) <> '56e27f0cc07f4051c2566b91afe59c73' then
    raise exception 'akcja_po_starcie: akcja_firmy_zatwierdz na bazie jest inna niż ta, z której powstała migracja';
  end if;
  if md5(regexp_replace(pg_get_functiondef('public.akcja_ulica_publiczna(text)'::regprocedure), '\s+', ' ', 'g')) <> '312ff754cee87e9b4eff942442cef397' then
    raise exception 'akcja_po_starcie: akcja_ulica_publiczna na bazie jest inna niż ta, z której powstała migracja';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'akcja_cegielki' and column_name = 'zlota')
     or to_regclass('public.akcja_ukryte') is not null then
    raise exception 'akcja_po_starcie: migracja już wdrożona';
  end if;
end $$;

alter table public.akcja_cegielki add column zlota boolean not null default false;
comment on column public.akcja_cegielki.zlota is 'Złota cegła (wpłata od 100 zł): złota i większa w murze. Publicznie tylko ta flaga, kwota nigdy. Zmienia trener (akcja_cegla_zlota) albo zatwierdzenie zgłoszenia z kwotą.';

CREATE OR REPLACE FUNCTION public.akcja_cegla_zlota(p_id uuid, p_zlota boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Przełącznik w panelu przy wpisie w murze. Tylko trener; nic poza flagą zlota.
  if not public.auth_is_coach() then raise exception 'akcja_cegla_zlota: tylko trener' using errcode = '42501'; end if;
  if p_zlota is null then raise exception 'akcja_cegla_zlota: brak wartości' using errcode = '22004'; end if;
  update public.akcja_cegielki set zlota = p_zlota where id = p_id;
  return found;
end $function$;
revoke all on function public.akcja_cegla_zlota(uuid, boolean) from public, anon;
grant execute on function public.akcja_cegla_zlota(uuid, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.akcja_firmy_zatwierdz(p_id uuid, p_logo_url text, p_kto uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare z public.akcja_firmy_zgloszenia; v_firma uuid; v_cegla uuid; v_zlota boolean;
begin
  select * into z from public.akcja_firmy_zgloszenia where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if z.status <> 'nowe' then return jsonb_build_object('ok', false, 'powod', 'juz_decyzja'); end if;
  -- Cegiełka od osoby prywatnej (20261107_akcja_cegielka_zgloszenia): wpis w murze akcji zgłoszenia. Imię publicznie tylko przy zgodzie (akcja_ulica_publiczna).
  -- Złota cegła (20261109_akcja_po_starcie): kwota od 100 zł; panel może zmienić przełącznikiem. Kwota zostaje w zgłoszeniu, do muru idzie tylko flaga.
  if z.rodzaj = 'cegielka' then
    v_zlota := coalesce(z.kwota_gr, 0) >= 10000;
    insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane, dodal, zlota)
    values (z.akcja_slug, z.nazwa, z.zgoda_na_wymienienie, true, p_kto, v_zlota) returning id into v_cegla;
    update public.akcja_firmy_zgloszenia set status = 'zatwierdzone', decyzja_at = now(), decyzja_kto = p_kto, zrzut_sciezka = null, logo_sciezka = null where id = p_id;
    return jsonb_build_object('ok', true, 'cegla', v_cegla, 'zlota', v_zlota, 'email', z.email, 'pliki', to_jsonb(array_remove(array[z.zrzut_sciezka, z.logo_sciezka], null)));
  end if;
  insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane, zgoda_na_wymienienie, dodal)
  values (z.akcja_slug, z.nazwa, z.link, p_logo_url, z.rodzaj, z.kwota_gr, z.zgoda_na_kwote, true, true, p_kto) returning id into v_firma;
  update public.akcja_firmy_zgloszenia set status = 'zatwierdzone', decyzja_at = now(), decyzja_kto = p_kto, firma_id = v_firma, zrzut_sciezka = null, logo_sciezka = null where id = p_id;
  return jsonb_build_object('ok', true, 'firma', v_firma, 'email', z.email, 'pliki', to_jsonb(array_remove(array[z.zrzut_sciezka, z.logo_sciezka], null)));
end $function$;

CREATE OR REPLACE FUNCTION public.akcja_ulica_publiczna(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_start timestamptz; u public.akcja_ulica; v_odb text[] := '{}'; v_imiona jsonb; v_bez integer; v_cegly jsonb; v_n integer;
begin
  select wystartowala_at into v_start from public.akcje where slug = p_slug;
  if v_start is null then
    return jsonb_build_object('odblokowane', '[]'::jsonb, 'imiona', '[]'::jsonb, 'bez_imienia', 0, 'cegly', '[]'::jsonb, 'cegly_n', 0);
  end if;
  select * into u from public.akcja_ulica where akcja_slug = p_slug;
  if found and u.kwota_zl is not null and u.cel_zl is not null then
    if u.kwota_zl * 100 >= u.cel_zl * 25 then v_odb := v_odb || 'latarnie'::text; end if;
    if u.kwota_zl * 100 >= u.cel_zl * 50 then v_odb := v_odb || 'plac_zabaw'::text; end if;
    if u.kwota_zl * 100 >= u.cel_zl * 100 then v_odb := v_odb || 'park'::text; end if;
  end if;
  select coalesce(jsonb_agg(c.imie order by c.dodano, c.id) filter (where c.zgoda), '[]'::jsonb), (count(*) filter (where not c.zgoda))::integer, count(*)::integer
    into v_imiona, v_bez, v_n from public.akcja_cegielki c where c.akcja_slug = p_slug;
  -- Murek darczyńców (20261109_akcja_po_starcie): najpierw złote, potem najnowsze. Imię tylko przy zgodzie, bez kwoty. Najwyżej 500 (reszta jako cegly_n).
  select coalesce(jsonb_agg(jsonb_build_object('i', case when x.zgoda then x.imie end, 'z', x.zlota) order by x.zlota desc, x.dodano desc, x.id desc), '[]'::jsonb)
    into v_cegly from (select c.imie, c.zgoda, c.zlota, c.dodano, c.id from public.akcja_cegielki c where c.akcja_slug = p_slug
                        order by c.zlota desc, c.dodano desc, c.id desc limit 500) x;
  return jsonb_build_object('odblokowane', to_jsonb(v_odb), 'imiona', v_imiona, 'bez_imienia', v_bez, 'cegly', v_cegly, 'cegly_n', v_n);
exception when others then
  -- Woła ją licznik akcji: awaria dodatków do rysunku nie może zabrać licznika.
  return jsonb_build_object('odblokowane', '[]'::jsonb, 'imiona', '[]'::jsonb, 'bez_imienia', 0, 'cegly', '[]'::jsonb, 'cegly_n', 0);
end $function$;

-- Patryk (9.11 10:05, 150 zł) — po id wpisu; gdy Filip zdążył go edytować (Edytuj = nowy wpis), po imieniu, ale tylko gdy jest dokładnie jeden.
do $$
declare k integer;
begin
  update public.akcja_cegielki set zlota = true where id = 'd4b837fd-a4e9-488d-9586-b87a7491dfe3' and akcja_slug = 'dla-fabianka';
  get diagnostics k = row_count;
  if k = 0 and (select count(*) from public.akcja_cegielki where akcja_slug = 'dla-fabianka' and upper(imie) = 'PATRYK') = 1 then
    update public.akcja_cegielki set zlota = true where akcja_slug = 'dla-fabianka' and upper(imie) = 'PATRYK';
    get diagnostics k = row_count;
  end if;
  if k <> 1 and exists (select 1 from public.akcje where slug = 'dla-fabianka' and wystartowala_at is not null) then
    raise exception 'akcja_po_starcie: nie znalazłem jednego wpisu Patryka w murze dla-fabianka (%), popraw id w migracji', k;
  end if;
end $$;

create table public.akcja_ukryte (
  user_id    uuid not null references auth.users(id) on delete cascade,
  akcja_slug text not null references public.akcje(slug) on delete cascade,
  ukryto     timestamptz not null default now(),
  primary key (user_id, akcja_slug)
);
comment on table public.akcja_ukryte is 'Kafel akcji ukryty przez konto („Ukryj” na Dziś; „Pokaż akcję Fabianka” w ustawieniach). Zero dostępu z przeglądarki: tylko akcja_kafel_ukryj / akcja_kafel_ukryty dla auth.uid(). Pushe i km tego nie czytają.';
alter table public.akcja_ukryte enable row level security;
revoke all on public.akcja_ukryte from public, anon, authenticated;
grant all on public.akcja_ukryte to service_role;

CREATE OR REPLACE FUNCTION public.akcja_kafel_ukryj(p_slug text, p_ukryj boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Tylko własne konto. Zwraca stan po zmianie (true = kafel ukryty).
  if auth.uid() is null then raise exception 'akcja_kafel_ukryj: brak sesji' using errcode = '42501'; end if;
  if p_ukryj is null then raise exception 'akcja_kafel_ukryj: brak wartości' using errcode = '22004'; end if;
  if not exists (select 1 from public.akcje where slug = p_slug) then raise exception 'akcja_kafel_ukryj: nie ma takiej akcji' using errcode = '22023'; end if;
  if p_ukryj then
    insert into public.akcja_ukryte (user_id, akcja_slug) values (auth.uid(), p_slug) on conflict (user_id, akcja_slug) do nothing;
  else
    delete from public.akcja_ukryte where user_id = auth.uid() and akcja_slug = p_slug;
  end if;
  return p_ukryj;
end $function$;

CREATE OR REPLACE FUNCTION public.akcja_kafel_ukryty(p_slug text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is not null and exists (select 1 from public.akcja_ukryte where user_id = auth.uid() and akcja_slug = p_slug);
$function$;

revoke all on function public.akcja_kafel_ukryj(text, boolean) from public, anon;
revoke all on function public.akcja_kafel_ukryty(text) from public, anon;
grant execute on function public.akcja_kafel_ukryj(text, boolean) to authenticated;
grant execute on function public.akcja_kafel_ukryty(text) to authenticated;

-- Strażnik po skutku: polityki muru bez zmian, nowa tabela bez dostępu z przeglądarki, anon bez nowych funkcji.
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'akcja_cegielki') <> 3 then raise exception 'akcja_po_starcie: polityki akcja_cegielki się zmieniły'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_ukryte') then raise exception 'akcja_po_starcie: polityka na akcja_ukryte'; end if;
  if has_table_privilege('anon', 'public.akcja_ukryte', 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', 'public.akcja_ukryte', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'akcja_po_starcie: akcja_ukryte dostępna z przeglądarki';
  end if;
  if has_column_privilege('authenticated', 'public.akcja_cegielki', 'zlota', 'INSERT') or has_column_privilege('authenticated', 'public.akcja_cegielki', 'zlota', 'UPDATE')
     or has_column_privilege('anon', 'public.akcja_cegielki', 'zlota', 'SELECT') then
    raise exception 'akcja_po_starcie: zlota zapisywalna z przeglądarki albo widoczna dla anon';
  end if;
  if has_function_privilege('anon', 'public.akcja_cegla_zlota(uuid, boolean)', 'EXECUTE') or has_function_privilege('anon', 'public.akcja_kafel_ukryj(text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.akcja_kafel_ukryty(text)', 'EXECUTE') or has_function_privilege('anon', 'public.akcja_ulica_publiczna(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.akcja_firmy_zatwierdz(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'akcja_po_starcie: uprawnienia funkcji szersze niż trzeba';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
