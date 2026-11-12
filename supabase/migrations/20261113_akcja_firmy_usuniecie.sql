-- 20261113_akcja_firmy_usuniecie.sql — „USUŃ FIRMĘ” W PANELU TRENERA (decyzja 12.11): miękkie usunięcie z wyczyszczeniem danych zamiast twardego DELETE z przeglądarki.
--   Wiersz zostaje do rozliczenia (id, akcja, rodzaj, wsparcie, kwota_gr, zgoda_na_kwote, dodano, dodal, usunieta_at, usunal). Dane wizerunkowe znikają od razu:
--   nazwa → '[usunięta]', link, logo_url, plakat_url, plakat_tekst → NULL, ukryta = true; w powiązanym zgłoszeniu (akcja_firmy_zgloszenia) nazwa → '[usunięta]', link i e-mail → NULL.
--   Widoczność jak przy „ukryta”: licznik, stan próby i próba firm pomijają usunięte. Jedyna droga = RPC akcja_firmy_usun (tylko trener); DELETE z przeglądarki odebrany,
--   UPDATE z przeglądarki nie rusza usuniętego wiersza („Pokaż” nie wskrzesza). SELECT nowych kolumn: grant tabelowy z 20261104 (panel filtruje po usunieta_at).
--   Pliki z kubełka kasuje przeglądarka z listy `pliki` w odpowiedzi — tylko te, których żaden INNY wiersz nie używa. Dwa błędy starego DELETE naprawione przy okazji:
--   (1) firmy próby wskazywały logo najstarszej prawdziwej firmy i usunięcie „Domek Próbny” kasowało cudzy plik — teraz próba ma własny plik zastępczy o stałej nazwie
--   (wgrywa start-akcji.html przed dodaniem firm próby); (2) plakat nie był kasowany nigdy — teraz jest na liście.
-- Test: tools/akcja-firmy-usun-test.sh (przed wdrożeniem FIRMY_USUN_Z_MIGRACJA=1). Wycofanie: 20261113_WYCOFANIE_akcja_firmy_usuniecie.sql.
begin;

alter table public.akcja_firmy add column usunieta_at timestamptz, add column usunal uuid references auth.users(id) on delete set null;
comment on column public.akcja_firmy.usunieta_at is 'Miękkie usunięcie (akcja_firmy_usun): wiersz zostaje do rozliczenia, dane wizerunkowe wyczyszczone. NULL = firma na Ulicy albo ukryta.';
comment on column public.akcja_firmy.usunal is 'Trener, który usunął (auth.uid() w RPC). Bez grantu dla przeglądarki.';
-- link po usunięciu NULL; CHECK przepuszcza NULL, a każdy zapis z formularza i z zatwierdzenia nadal daje link (walidacja w akcja.mjs i w EF).
alter table public.akcja_firmy alter column link drop not null;
-- zgłoszenie firmy: CHECK z 20261107 wymaga linku przy domku/wieżowcu (NULL tylko przy cegiełce); po usunięciu firmy link ma zniknąć, więc NULL także przy nazwie '[usunięta]'
alter table public.akcja_firmy_zgloszenia
  drop constraint akcja_firmy_zgloszenia_link_check,
  add constraint akcja_firmy_zgloszenia_link_check check (case when rodzaj = 'cegielka' then link is null
    when nazwa = '[usunięta]' then link is null
    else link is not null and char_length(link) <= 500 and link ~ '^https://[^[:space:]/?#<>"''@\\]+\.[^[:space:]/?#<>"''@\\]+([/?#][^[:space:]<>"'']*)?$' end);
create index akcja_firmy_zywe on public.akcja_firmy (akcja_slug, dodano, id) where usunieta_at is null;

revoke delete on public.akcja_firmy from authenticated;
drop policy if exists akcja_firmy_trener_kasuje on public.akcja_firmy;
drop policy if exists akcja_firmy_trener_zmienia on public.akcja_firmy;
create policy akcja_firmy_trener_zmienia on public.akcja_firmy for update to authenticated
  using (public.auth_is_coach() and usunieta_at is null) with check (public.auth_is_coach() and usunieta_at is null);

create or replace function public.akcja_firmy_usun(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare f public.akcja_firmy; v_pliki jsonb;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_firmy_usun: tylko trener' using errcode = '42501'; end if;
  if p_id is null then raise exception 'akcja_firmy_usun: brak id' using errcode = '22004'; end if;
  select * into f from public.akcja_firmy where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;
  if f.usunieta_at is not null then return jsonb_build_object('ok', false, 'powod', 'juz_usunieta'); end if;
  -- do skasowania z kubełka: logo i plakat, ale tylko gdy żaden inny wiersz (łącznie z firmami próby) ich nie używa
  select coalesce(jsonb_agg(distinct regexp_replace(u, '^.*/akcja-firmy-logo/', '')), '[]'::jsonb) into v_pliki
    from unnest(array[f.logo_url, f.plakat_url]) u
   where u is not null and not exists (select 1 from public.akcja_firmy i where i.id <> f.id and (i.logo_url = u or i.plakat_url = u));
  update public.akcja_firmy
     set usunieta_at = now(), usunal = auth.uid(), ukryta = true, nazwa = '[usunięta]', link = null, logo_url = null, plakat_url = null, plakat_tekst = null
   where id = f.id;
  update public.akcja_firmy_zgloszenia set nazwa = '[usunięta]', link = null, email = null where firma_id = f.id;
  return jsonb_build_object('ok', true, 'pliki', v_pliki);
end $function$;
revoke all on function public.akcja_firmy_usun(uuid) from public, anon;
grant execute on function public.akcja_firmy_usun(uuid) to authenticated;
comment on function public.akcja_firmy_usun(uuid) is 'Miękkie usunięcie firmy z Ulicy (tylko trener): wiersz zostaje do rozliczenia, nazwa/link/logo/plakat wyczyszczone, oddaje pliki do skasowania, których nikt inny nie używa.';

-- Produkcja bywa nowsza od repo: funkcje poprawiamy na ŻYWEJ definicji (jak 20261105_akcja_firmy_szyldy), tylko gdy spodziewany fragment występuje dokładnie raz.
do $$
declare
  v_def text; v_nowa text; j_przed jsonb; j_po jsonb;
  ZAST constant text := 'https://afqojgkaveykxbltxzwm.supabase.co/storage/v1/object/public/akcja-firmy-logo/aaaaaaaa-0000-4000-8000-00000000f1f1.png';
begin
  -- licznik: lista firm bez usuniętych; odpowiedź dla prawdziwej akcji nie może się zmienić (dziś nie ma usuniętych)
  v_def := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  if (select count(*) from regexp_matches(v_def, $r$where f\.akcja_slug = a\.slug and not f\.ukryta;$r$, 'g')) <> 1 then raise exception 'akcja_firmy_usuniecie: lista firm w liczniku inna, niż oczekiwana'; end if;
  j_przed := public.akcja_licznik('dla-fabianka');
  v_nowa := replace(v_def, $n$where f.akcja_slug = a.slug and not f.ukryta;$n$, $n$where f.akcja_slug = a.slug and not f.ukryta and f.usunieta_at is null;$n$);
  execute v_nowa;
  j_po := public.akcja_licznik('dla-fabianka');
  if j_po is distinct from j_przed then raise exception 'akcja_firmy_usuniecie: odpowiedź licznika zmieniła się'; end if;

  -- stan próby (start-akcji.html): liczy firmy żywe i ukryte, usuniętych nie zna
  v_def := pg_get_functiondef('public.akcja_sciezka_stan()'::regprocedure);
  if (select count(*) from regexp_matches(v_def, $r$where f\.akcja_slug = 'proba' and not f\.ukryta\)$r$, 'g')) <> 1
     or (select count(*) from regexp_matches(v_def, $r$where f\.akcja_slug = 'proba' and f\.ukryta\)$r$, 'g')) <> 1 then
    raise exception 'akcja_firmy_usuniecie: akcja_sciezka_stan inna, niż oczekiwana';
  end if;
  v_nowa := replace(v_def, $n$where f.akcja_slug = 'proba' and not f.ukryta)$n$, $n$where f.akcja_slug = 'proba' and not f.ukryta and f.usunieta_at is null)$n$);
  v_nowa := replace(v_nowa, $n$where f.akcja_slug = 'proba' and f.ukryta)$n$, $n$where f.akcja_slug = 'proba' and f.ukryta and f.usunieta_at is null)$n$);
  execute v_nowa;

  -- firmy próby: własny plik zastępczy zamiast logo prawdziwej firmy
  v_def := pg_get_functiondef('public.akcja_proba_firmy(boolean)'::regprocedure);
  if (select count(*) from regexp_matches(v_def, $r$select f\.logo_url into v_logo from public\.akcja_firmy f where f\.logo_url is not null order by f\.dodano limit 1;$r$, 'g')) <> 1 then
    raise exception 'akcja_firmy_usuniecie: akcja_proba_firmy inna, niż oczekiwana';
  end if;
  v_nowa := replace(v_def, $n$select f.logo_url into v_logo from public.akcja_firmy f where f.logo_url is not null order by f.dodano limit 1;$n$,
                           $n$v_logo := '$n$ || ZAST || $n$';   -- plik zastępczy próby (wgrywa start-akcji.html), nigdy logo prawdziwej firmy (20261113)$n$);
  execute v_nowa;

  -- lista zgłoszeń dla panelu: id firmy i czy usunięta (panel celuje po id, nie po nazwie; przy usuniętej bez guzików). EF firma-panel przepuszcza pola bez zmian.
  v_def := pg_get_functiondef('public.akcja_firmy_zgloszenia_lista()'::regprocedure);
  if (select count(*) from regexp_matches(v_def, $r$'decyzja_at', z\.decyzja_at\)$r$, 'g')) <> 1 then raise exception 'akcja_firmy_usuniecie: akcja_firmy_zgloszenia_lista inna, niż oczekiwana'; end if;
  v_nowa := replace(v_def, $n$'decyzja_at', z.decyzja_at)$n$,
                           $n$'decyzja_at', z.decyzja_at, 'firma_id', z.firma_id, 'firma_usunieta', exists (select 1 from public.akcja_firmy f where f.id = z.firma_id and f.usunieta_at is not null))$n$);
  execute v_nowa;
end $$;

do $$
begin
  if has_table_privilege('anon', 'public.akcja_firmy', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     or has_any_column_privilege('anon', 'public.akcja_firmy', 'SELECT, INSERT, UPDATE, REFERENCES') then
    raise exception 'akcja_firmy_usuniecie: anon ma uprawnienia';
  end if;
  if has_table_privilege('authenticated', 'public.akcja_firmy', 'DELETE') then raise exception 'akcja_firmy_usuniecie: DELETE z przeglądarki wciąż dozwolony'; end if;
  if has_column_privilege('authenticated', 'public.akcja_firmy', 'usunieta_at', 'UPDATE') or has_column_privilege('authenticated', 'public.akcja_firmy', 'usunal', 'UPDATE')
     or has_column_privilege('authenticated', 'public.akcja_firmy', 'usunieta_at', 'INSERT') or has_column_privilege('authenticated', 'public.akcja_firmy', 'usunal', 'INSERT') then
    raise exception 'akcja_firmy_usuniecie: nowe kolumny zapisywalne z przeglądarki';
  end if;
  if not has_column_privilege('authenticated', 'public.akcja_firmy', 'usunieta_at', 'SELECT') then raise exception 'akcja_firmy_usuniecie: panel nie przeczyta usunieta_at'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy') <> 3
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy' and cmd = 'DELETE')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'akcja_firmy' and policyname = 'akcja_firmy_trener_zmienia' and cmd = 'UPDATE'
                      and qual like '%auth_is_coach()%' and qual like '%usunieta_at IS NULL%' and with_check like '%usunieta_at IS NULL%') then
    raise exception 'akcja_firmy_usuniecie: polityki niezgodne z migracją';
  end if;
  if has_function_privilege('anon', 'public.akcja_firmy_usun(uuid)', 'EXECUTE') or not has_function_privilege('authenticated', 'public.akcja_firmy_usun(uuid)', 'EXECUTE') then
    raise exception 'akcja_firmy_usuniecie: uprawnienia funkcji inne niż trzeba';
  end if;
  if pg_get_functiondef('public.akcja_licznik(text)'::regprocedure) !~ 'and f\.usunieta_at is null;' then raise exception 'akcja_firmy_usuniecie: licznik nie pomija usuniętych'; end if;
  if (select count(*) from regexp_matches(pg_get_functiondef('public.akcja_sciezka_stan()'::regprocedure), 'f\.usunieta_at is null', 'g')) <> 2 then raise exception 'akcja_firmy_usuniecie: stan próby nie pomija usuniętych'; end if;
  if pg_get_functiondef('public.akcja_proba_firmy(boolean)'::regprocedure) ~ 'select f\.logo_url into v_logo' then raise exception 'akcja_firmy_usuniecie: próba wciąż czyta logo prawdziwej firmy'; end if;
  if pg_get_functiondef('public.akcja_firmy_zgloszenia_lista()'::regprocedure) !~ 'firma_usunieta' then raise exception 'akcja_firmy_usuniecie: lista zgłoszeń bez firma_usunieta'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
