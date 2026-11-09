-- WYCOFANIE 20261109_akcja_po_starcie.sql: funkcje wracają do tekstu z produkcji sprzed migracji (odczyt 9.11), kolumna zlota i tabela akcja_ukryte znikają.
-- Uruchamia Filip: supabase db query --linked --workdir ~/.cache/sb-audit -f "<ścieżka absolutna>". Po wycofaniu złote cegły znowu wyglądają jak zwykłe, a ukryte kafle wracają wszystkim.
-- Front po wycofaniu: działa (murek bierze 'imiona'/'bez_imienia', gdy nie ma 'cegly'; „Ukryj” bez funkcji = kafel widoczny).
begin;

do $$
begin
  if to_regprocedure('public.akcja_cegla_zlota(uuid, boolean)') is null or to_regclass('public.akcja_ukryte') is null then
    raise exception 'wycofanie akcja_po_starcie: migracji nie ma na bazie';
  end if;
end $$;

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

CREATE OR REPLACE FUNCTION public.akcja_ulica_publiczna(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

drop function public.akcja_cegla_zlota(uuid, boolean);
drop function public.akcja_kafel_ukryj(text, boolean);
drop function public.akcja_kafel_ukryty(text);
drop table public.akcja_ukryte;
alter table public.akcja_cegielki drop column zlota;

do $$
begin
  if md5(regexp_replace(pg_get_functiondef('public.akcja_firmy_zatwierdz(uuid, text, uuid)'::regprocedure), '\s+', ' ', 'g')) <> '56e27f0cc07f4051c2566b91afe59c73'
     or md5(regexp_replace(pg_get_functiondef('public.akcja_ulica_publiczna(text)'::regprocedure), '\s+', ' ', 'g')) <> '312ff754cee87e9b4eff942442cef397' then
    raise exception 'wycofanie akcja_po_starcie: funkcje nie wróciły do stanu sprzed migracji';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
