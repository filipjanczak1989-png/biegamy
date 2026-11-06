-- CEGIEŁKA OD OSOBY PRYWATNEJ przez formularz na stronie akcji (Filip 6.11 wieczór, przed startem 7.11 06:00).
-- Uruchamia Filip: supabase db query --linked --workdir ~/.cache/sb-audit -f "<ścieżka absolutna>", nigdy db push. Najpierw test: CEGIELKA_Z_MIGRACJA=1 bash tools/akcja-cegielka-test.sh.
-- Wycofanie: 20261107_WYCOFANIE_akcja_cegielka_zgloszenia.sql. Wymaga 20261105_akcja_firmy_zgloszenia.sql.
--   akcja_firmy_zgloszenia: rodzaj 'cegielka'. nazwa = imię (jedno słowo, jak CHECK w akcja_cegielki), bez linku i logo, bez pokazywania kwoty;
--     zgoda_na_wymienienie = zgoda na imię w murze (bez zgody cegła bez imienia). Firmy bez zmian: link https i zgoda na wymienienie dalej obowiązkowe.
--   akcja_firmy_zatwierdz: cegiełka → wpis w murze (akcja_cegielki) na akcji zgłoszenia; imię publicznie tylko przy zgodzie (akcja_ulica_publiczna filtruje po zgoda). Firmy bez zmian.
--   akcja_firmy_zgloszenia_lista: dochodzi 'zgoda_na_wymienienie', żeby panel pokazał, czy imię stanie w murze.
--   Uprawnień nie ruszamy: tabela dalej bez dostępu dla anon i authenticated (zapis tylko przez EF firma-zgloszenie z kluczem serwisowym),
--   funkcje przez create or replace zachowują ACL (tylko service_role, woła je EF firma-panel po sprawdzeniu trenera).
--   Licznik km bez zmian: akcja_licznik i akcja_km_okna nie czytają zgłoszeń ani muru.
begin;

-- Produkcja bywa nowsza od repo: podmieniamy tylko wersje, z których powstała ta migracja (odczyt 6.11 19:20).
do $$
begin
  if md5(regexp_replace(pg_get_functiondef('public.akcja_firmy_zatwierdz(uuid, text, uuid)'::regprocedure), '\s+', ' ', 'g')) <> 'dacdb8ccf6b52c0f4aabecdbd1bfd08c' then
    raise exception 'akcja_cegielka_zgloszenia: akcja_firmy_zatwierdz na bazie jest inna niż ta, z której powstała migracja';
  end if;
  if md5(regexp_replace(pg_get_functiondef('public.akcja_firmy_zgloszenia_lista()'::regprocedure), '\s+', ' ', 'g')) <> '774758b4542d5decb445fb2e0fc9db35' then
    raise exception 'akcja_cegielka_zgloszenia: akcja_firmy_zgloszenia_lista na bazie jest inna niż ta, z której powstała migracja';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.akcja_firmy_zgloszenia'::regclass
        and conname in ('akcja_firmy_zgloszenia_rodzaj_check', 'akcja_firmy_zgloszenia_link_check', 'akcja_firmy_zgloszenia_zgoda_na_wymienienie_check')) <> 3
     or exists (select 1 from pg_constraint where conrelid = 'public.akcja_firmy_zgloszenia'::regclass and conname = 'akcja_firmy_zgloszenia_cegielka') then
    raise exception 'akcja_cegielka_zgloszenia: ograniczenia tabeli zgłoszeń nie są takie, jak przed migracją';
  end if;
end $$;

alter table public.akcja_firmy_zgloszenia
  drop constraint akcja_firmy_zgloszenia_rodzaj_check,
  add constraint akcja_firmy_zgloszenia_rodzaj_check check (rodzaj in ('domek', 'wiezowiec', 'cegielka'));
alter table public.akcja_firmy_zgloszenia alter column link drop not null;
alter table public.akcja_firmy_zgloszenia
  drop constraint akcja_firmy_zgloszenia_link_check,
  add constraint akcja_firmy_zgloszenia_link_check check (case when rodzaj = 'cegielka' then link is null
    else link is not null and char_length(link) <= 500 and link ~ '^https://[^[:space:]/?#<>"''@\\]+\.[^[:space:]/?#<>"''@\\]+([/?#][^[:space:]<>"'']*)?$' end);
alter table public.akcja_firmy_zgloszenia
  drop constraint akcja_firmy_zgloszenia_zgoda_na_wymienienie_check,
  add constraint akcja_firmy_zgloszenia_zgoda_na_wymienienie_check check (rodzaj = 'cegielka' or zgoda_na_wymienienie = true);
alter table public.akcja_firmy_zgloszenia
  add constraint akcja_firmy_zgloszenia_cegielka check (rodzaj <> 'cegielka' or (
    logo_sciezka is null and not zgoda_na_kwote
    and char_length(nazwa) between 2 and 20 and nazwa ~ '^[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+(-[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]+)?$'));

CREATE OR REPLACE FUNCTION public.akcja_firmy_zatwierdz(p_id uuid, p_logo_url text, p_kto uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare z public.akcja_firmy_zgloszenia; v_firma uuid; v_cegla uuid;
begin
  select * into z from public.akcja_firmy_zgloszenia where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if z.status <> 'nowe' then return jsonb_build_object('ok', false, 'powod', 'juz_decyzja'); end if;
  -- Cegiełka od osoby prywatnej (20261107_akcja_cegielka_zgloszenia): wpis w murze akcji zgłoszenia. Imię publicznie tylko przy zgodzie (akcja_ulica_publiczna).
  if z.rodzaj = 'cegielka' then
    insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane, dodal)
    values (z.akcja_slug, z.nazwa, z.zgoda_na_wymienienie, true, p_kto) returning id into v_cegla;
    update public.akcja_firmy_zgloszenia set status = 'zatwierdzone', decyzja_at = now(), decyzja_kto = p_kto, zrzut_sciezka = null, logo_sciezka = null where id = p_id;
    return jsonb_build_object('ok', true, 'cegla', v_cegla, 'email', z.email, 'pliki', to_jsonb(array_remove(array[z.zrzut_sciezka, z.logo_sciezka], null)));
  end if;
  insert into public.akcja_firmy (akcja_slug, nazwa, link, logo_url, rodzaj, kwota_gr, zgoda_na_kwote, potwierdzenie_widziane, zgoda_na_wymienienie, dodal)
  values (z.akcja_slug, z.nazwa, z.link, p_logo_url, z.rodzaj, z.kwota_gr, z.zgoda_na_kwote, true, true, p_kto) returning id into v_firma;
  update public.akcja_firmy_zgloszenia set status = 'zatwierdzone', decyzja_at = now(), decyzja_kto = p_kto, firma_id = v_firma, zrzut_sciezka = null, logo_sciezka = null where id = p_id;
  return jsonb_build_object('ok', true, 'firma', v_firma, 'email', z.email, 'pliki', to_jsonb(array_remove(array[z.zrzut_sciezka, z.logo_sciezka], null)));
end $function$;

CREATE OR REPLACE FUNCTION public.akcja_firmy_zgloszenia_lista()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'zgloszenia', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'proba', z.akcja_slug = 'proba', 'rodzaj', z.rodzaj, 'nazwa', z.nazwa, 'link', z.link, 'email', z.email, 'kwota_gr', z.kwota_gr, 'zgoda_na_kwote', z.zgoda_na_kwote, 'zgoda_na_wymienienie', z.zgoda_na_wymienienie, 'logo', z.logo_sciezka, 'zrzut', z.zrzut_sciezka,
                                     'status', z.status, 'powod', z.powod, 'utworzono', z.utworzono, 'decyzja_at', z.decyzja_at) order by (z.status = 'nowe') desc, z.utworzono desc)
                           from (select * from public.akcja_firmy_zgloszenia order by (status = 'nowe') desc, utworzono desc limit 50) z), '[]'::jsonb),
    'prog_domku_zl', (select a.prog_domku_zl from public.akcje a where a.slug = 'dla-fabianka'),
    'prog_wiezowca_zl', (select a.prog_wiezowca_zl from public.akcje a where a.slug = 'dla-fabianka'),
    'firmy_zgloszenia', (select a.firmy_zgloszenia from public.akcje a where a.slug = 'dla-fabianka'))
$function$;

commit;
