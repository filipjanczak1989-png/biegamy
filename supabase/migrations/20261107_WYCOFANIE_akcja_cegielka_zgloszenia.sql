-- Wycofanie 20261107_akcja_cegielka_zgloszenia.sql: tabela zgłoszeń znów tylko dla firm, funkcje w wersjach sprzed migracji (tekst z produkcji, odczyt 6.11 19:20).
-- Wpisy w murze dodane z zatwierdzonych cegiełek ZOSTAJĄ (to zwykłe wiersze akcja_cegielki, usuwa je trener w panelu „Ulica akcji”).
-- Zgłoszenia cegiełek trzeba najpierw rozstrzygnąć i usunąć, inaczej wycofanie odmówi (stare ograniczenia by ich nie przyjęły).
-- Uruchamia Filip: supabase db query --linked --workdir ~/.cache/sb-audit -f "<ścieżka absolutna>", nigdy db push.
begin;

do $$
begin
  if exists (select 1 from public.akcja_firmy_zgloszenia where rodzaj = 'cegielka') then
    raise exception 'wycofanie cegiełek: w tabeli są zgłoszenia cegiełek. Najpierw: delete from public.akcja_firmy_zgloszenia where rodzaj = ''cegielka'' and status <> ''nowe''; (nowe najpierw rozstrzygnij w panelu)';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.akcja_firmy_zatwierdz(p_id uuid, p_logo_url text, p_kto uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare z public.akcja_firmy_zgloszenia; v_firma uuid;
begin
  select * into z from public.akcja_firmy_zgloszenia where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if z.status <> 'nowe' then return jsonb_build_object('ok', false, 'powod', 'juz_decyzja'); end if;
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
    'zgloszenia', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'proba', z.akcja_slug = 'proba', 'rodzaj', z.rodzaj, 'nazwa', z.nazwa, 'link', z.link, 'email', z.email, 'kwota_gr', z.kwota_gr, 'zgoda_na_kwote', z.zgoda_na_kwote, 'logo', z.logo_sciezka, 'zrzut', z.zrzut_sciezka,
                                     'status', z.status, 'powod', z.powod, 'utworzono', z.utworzono, 'decyzja_at', z.decyzja_at) order by (z.status = 'nowe') desc, z.utworzono desc)
                           from (select * from public.akcja_firmy_zgloszenia order by (status = 'nowe') desc, utworzono desc limit 50) z), '[]'::jsonb),
    'prog_domku_zl', (select a.prog_domku_zl from public.akcje a where a.slug = 'dla-fabianka'),
    'prog_wiezowca_zl', (select a.prog_wiezowca_zl from public.akcje a where a.slug = 'dla-fabianka'),
    'firmy_zgloszenia', (select a.firmy_zgloszenia from public.akcje a where a.slug = 'dla-fabianka'))
$function$;

alter table public.akcja_firmy_zgloszenia drop constraint akcja_firmy_zgloszenia_cegielka;
alter table public.akcja_firmy_zgloszenia
  drop constraint akcja_firmy_zgloszenia_zgoda_na_wymienienie_check,
  add constraint akcja_firmy_zgloszenia_zgoda_na_wymienienie_check check (zgoda_na_wymienienie = true);
alter table public.akcja_firmy_zgloszenia
  drop constraint akcja_firmy_zgloszenia_link_check,
  add constraint akcja_firmy_zgloszenia_link_check check (char_length(link) <= 500 and link ~ '^https://[^[:space:]/?#<>"''@\\]+\.[^[:space:]/?#<>"''@\\]+([/?#][^[:space:]<>"'']*)?$');
alter table public.akcja_firmy_zgloszenia alter column link set not null;
alter table public.akcja_firmy_zgloszenia
  drop constraint akcja_firmy_zgloszenia_rodzaj_check,
  add constraint akcja_firmy_zgloszenia_rodzaj_check check (rodzaj in ('domek', 'wiezowiec'));

commit;
