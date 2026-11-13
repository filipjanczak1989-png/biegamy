-- WYCOFANIE 20261126_akcja_bieg_wyniki.sql: zdejmuje crony, funkcje, wyzwalacz i tabele etapu 2, przywraca akcja_bieg_publiczny z 20261120.
--   Zostaje: wyniki wpisane w akcja_bieg_uczestnicy (kolumny etapu 1) i przyznane odznaki w achievements. Znika: zgody kont (akcja_bieg_zgody) i log wysyłek.
--   Najpierw wycofanie crona e-maila (20261128_WYCOFANIE_akcja_bieg_przypomnienie_cron.sql), jeśli był wykonany.
begin;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'akcja-bieg-automat') then perform cron.unschedule('akcja-bieg-automat'); end if;
  if exists (select 1 from cron.job where jobname = 'akcja-bieg-sprzatanie') then perform cron.unschedule('akcja-bieg-sprzatanie'); end if;
end $$;

drop trigger if exists akcja_bieg_zgoda_z_zapisu on public.akcja_bieg_uczestnicy;
drop function if exists public.akcja_bieg_zgoda_z_zapisu();
drop function if exists public.akcja_bieg_moja_zgoda(text);
drop function if exists public.akcja_bieg_zgoda_email(text, boolean);
drop function if exists public.akcja_bieg_rezygnacja(uuid);
drop function if exists public.akcja_bieg_wynik_ustal(uuid, uuid);
drop function if exists public.akcja_bieg_wynik_z_treningu(uuid, uuid);
drop function if exists public.akcja_bieg_treningi_z_okna(text);
drop function if exists public.akcja_bieg_automat();
drop function if exists public.akcja_bieg_dziecko_ukoncz(uuid, numeric);
drop function if exists public.akcja_bieg_zalicz_recznie(uuid, numeric, integer);
drop function if exists public.akcja_bieg_panel(text);
drop function if exists public.akcja_bieg_do_przypomnienia(timestamptz, integer);
drop function if exists public.akcja_bieg_mail_zapisz(uuid, uuid, text);
drop function if exists public.akcja_bieg_sprzatanie();
drop function if exists public.akcja_bieg_odznaka(uuid);
drop function if exists public.akcja_bieg_dystans_zaliczony(integer[], numeric);
drop function if exists public.akcja_bieg_sekundy(text);
drop table if exists public.akcja_bieg_maile;
drop table if exists public.akcja_bieg_zgody;

-- akcja_bieg_publiczny jak w 20261120 (bez podsumowania), potem kolumna podsumowania i funkcja liczb
create or replace function public.akcja_bieg_publiczny(p_akcja_slug text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare b public.akcja_biegi; v_dzis date := (now() at time zone 'Europe/Warsaw')::date; v_na jsonb;
begin
  select * into b from public.akcja_biegi where akcja_slug = p_akcja_slug and status <> 'szkic' order by dzien_od desc, utworzono desc limit 1;
  if not found then return null; end if;
  select coalesce(jsonb_object_agg(d::text, n), '{}'::jsonb) into v_na
    from (select u.dystans_km d, count(*) n from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null and u.rodzaj = 'ja' group by 1) x;
  return jsonb_build_object(
    'slug', b.slug, 'nazwa', b.nazwa, 'dzien_od', b.dzien_od, 'dzien_do', b.dzien_do, 'wynik_do', b.wynik_do,
    'dystanse_km', to_jsonb(b.dystanse_km), 'faza', public.akcja_bieg_faza(b, v_dzis), 'regulamin_wersja', b.regulamin_wersja,
    'wsparcie_kwoty_zl', to_jsonb(b.wsparcie_kwoty_zl), 'limit_dzieci', b.limit_dzieci,
    'zapisani', (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null),
    'zapisani_na', v_na,
    'dzieci', (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null and u.rodzaj = 'dziecko'),
    'ukonczyli_n', (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null and u.ukonczony_at is not null),
    'zlote', (select count(*) from public.akcja_bieg_uczestnicy u where u.bieg_id = b.id and u.wycofany_at is null and u.odznaka = 'zlota'));
end $function$;
revoke all on function public.akcja_bieg_publiczny(text) from public, anon, authenticated, service_role;
drop function if exists public.akcja_bieg_liczby(uuid);
alter table public.akcja_biegi drop column if exists podsumowanie;

notify pgrst, 'reload schema';
commit;
