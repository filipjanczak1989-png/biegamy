-- AKCJA: KAMIENIE MILOWE CO 1000 KM (decyzja Filipa 18.11). Baner „X km razem” tylko dla OSTATNIEGO przekroczonego kamienia i tylko przez 48 h od chwili
--   przekroczenia zapisanej w bazie. Dotąd: stałe progi 1000/2500/5000/7500/10000 i 48 h od pierwszego zobaczenia na urządzeniu (licznik nie znał chwili
--   przekroczenia), więc przy 2 325 km każdy nowy telefon dostawał „1 000 km razem”. Cel akcji (12 500) = ostatni kamień „Cel osiągnięty razem”.
-- 1. TABELA akcja_progi (akcja, kamień, chwila przekroczenia, źródło): zero dostępu z przeglądarki; czyta ją tylko akcja_prog_publiczny wewnątrz akcja_licznik.
-- 2. akcja_progi_zapisz() — cron „akcja-progi” co 5 min, czysty SQL: dla każdej wystartowanej akcji suma = akcja_licznik(slug).suma_km (jedno źródło prawdy
--    z licznikiem); brakujące pełne tysiące poniżej celu i sam cel (gdy osiągnięty) dopisuje z now(). Raz zapisany kamień zostaje (usunięty trening nie
--    cofa kamienia). Wyjątek: akcja testowa (próba) — kamienie powyżej sumy znikają, żeby po resecie próby świętowanie dało się powtórzyć.
-- 3. HISTORIA: kamienie już przekroczone przez prawdziwą akcję dostają chwilę odtworzoną z training_logs tą samą regułą co akcja_km_okna (limit km na dobę
--    i osobę, kolejność created_at). Odtworzona suma musi równać się sumie licznika, inaczej nic nie zmieniam. Odczyt 18.11 16:06: 2 325,31 km jak licznik,
--    1000 km 11.11 12:37, 2000 km 16.11 13:49 (po migracji: nic do 3000 km). Akcja testowa: obecne kamienie jako dawne (bez banera).
-- 4. akcja_licznik (z bazy, po kotwicy jak 20261120): pole 'prog' = {km, at, cel} ostatniego kamienia, gdy od przekroczenia minęło < 48 h; inaczej null.
--    48 h liczy baza, nie telefon. Przed startem akcji pola nie ma (gałąź „przed startem” bez zmian).
-- Test po skutku: tools/akcja-progi-test.sh (przed wdrożeniem AKCJA_PROGI_Z_MIGRACJA=1). Wycofanie: 20261210_WYCOFANIE_akcja_progi.sql.
begin;

create table public.akcja_progi (
  akcja_id        uuid not null references public.akcje(id) on delete cascade,
  prog_km         numeric not null check (prog_km > 0),
  przekroczony_at timestamptz not null default now(),
  zrodlo          text not null default 'cron' check (zrodlo in ('cron', 'historia')),
  primary key (akcja_id, prog_km)
);
alter table public.akcja_progi enable row level security;
revoke all on table public.akcja_progi from public, anon, authenticated;
comment on table public.akcja_progi is 'Kamienie milowe akcji (co 1000 km i cel) z chwilą przekroczenia. Pisze cron akcja-progi (akcja_progi_zapisz), czyta akcja_licznik (pole prog, 48 h). Zero dostępu z przeglądarki.';

create function public.akcja_progi_lista(p_cel numeric, p_suma numeric)
 returns setof numeric
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select p from generate_series(1000::numeric, floor(coalesce(p_suma, 0) / 1000) * 1000, 1000::numeric) p where p_cel is null or p < p_cel
  union
  select p_cel where p_cel is not null and coalesce(p_suma, 0) >= p_cel
$function$;

create function public.akcja_progi_zapisz()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare a public.akcje; v_suma numeric; v_n integer := 0; v_k integer;
begin
  for a in select * from public.akcje where wystartowala_at is not null order by created_at, id loop
    begin
      v_suma := (public.akcja_licznik(a.slug)->>'suma_km')::numeric;
      if v_suma is null then continue; end if;
      if a.testowa then delete from public.akcja_progi where akcja_id = a.id and prog_km > v_suma; end if;
      insert into public.akcja_progi (akcja_id, prog_km) select a.id, p from public.akcja_progi_lista(a.cel_km, v_suma) p
        on conflict (akcja_id, prog_km) do nothing;
      get diagnostics v_k = row_count;
      v_n := v_n + v_k;
    exception when others then
      raise warning 'akcja_progi_zapisz %: %', a.slug, sqlerrm;   -- jedna akcja nie blokuje drugiej; ślad w cron.job_run_details
    end;
  end loop;
  return v_n;
end $function$;

create function public.akcja_prog_publiczny(p_akcja_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when p.przekroczony_at > now() - interval '48 hours'
              then jsonb_build_object('km', p.prog_km, 'at', p.przekroczony_at, 'cel', p.prog_km >= a.cel_km) end
    from public.akcja_progi p join public.akcje a on a.id = p.akcja_id
   where p.akcja_id = p_akcja_id
   order by p.prog_km desc
   limit 1
$function$;

revoke all on function public.akcja_progi_lista(numeric, numeric) from public, anon, authenticated;
revoke all on function public.akcja_progi_zapisz() from public, anon, authenticated;
revoke all on function public.akcja_prog_publiczny(uuid) from public, anon, authenticated;

-- 3. historia: prawdziwe akcje — chwila przekroczenia odtworzona z training_logs (reguła akcja_km_okna z bazy 18.11); testowe — obecne kamienie jako dawne
create temp table _akcja_progi_s on commit drop as
  select a.id, a.slug, a.testowa, a.cel_km, a.start, a.koniec, a.cap_km_doba, a.cap_km_doba_wyprawa, coalesce(a.wyprawa_athlete_ids, '{}'::uuid[]) wyprawa,
         (public.akcja_licznik(a.slug)->>'suma_km')::numeric suma
    from public.akcje a where a.wystartowala_at is not null;
create temp table _akcja_progi_h on commit drop as
  select s.id, x.created_at, sum(x.wklad) over (partition by s.id order by x.created_at, x.lid rows unbounded preceding) narastajaco
    from _akcja_progi_s s cross join lateral (
      select w.created_at, w.lid, least(w.kum, w.cap) - least(w.kum - w.distance_km, w.cap) wklad
        from (select l.id lid, l.created_at, l.distance_km,
                     case when l.athlete_id = any(s.wyprawa) then s.cap_km_doba_wyprawa else s.cap_km_doba end cap,
                     sum(l.distance_km) over (partition by l.athlete_id, (l.logged_at at time zone 'Europe/Warsaw')::date order by l.created_at, l.id rows unbounded preceding) kum
                from public.training_logs l
               where l.distance_km > 0
                 and coalesce(l.training_type, '') not like '\_\_badge\_\_%'
                 and public.akcja_typ_liczy(l.training_type, l.external_type)
                 and (l.logged_at at time zone 'Europe/Warsaw')::date >= s.start
                 and (l.logged_at at time zone 'Europe/Warsaw')::date <= least(coalesce(s.koniec, (now() at time zone 'Europe/Warsaw')::date), (now() at time zone 'Europe/Warsaw')::date)) w
    ) x
   where not s.testowa;
do $historia$
declare r record;
begin
  for r in select s.slug, s.suma, round(coalesce((select h.narastajaco from _akcja_progi_h h where h.id = s.id order by h.narastajaco desc limit 1), 0), 2) odtworzona
             from _akcja_progi_s s where not s.testowa loop
    if r.odtworzona is distinct from r.suma then
      raise exception 'akcja_progi: historia akcji % daje % km, licznik % km (reguła akcja_km_okna się zmieniła?), nic nie zmieniam', r.slug, r.odtworzona, r.suma;
    end if;
  end loop;
end $historia$;
insert into public.akcja_progi (akcja_id, prog_km, przekroczony_at, zrodlo)
select s.id, p,
       case when s.testowa then now() - interval '49 hours'
            else coalesce((select min(h.created_at) from _akcja_progi_h h where h.id = s.id and h.narastajaco >= p), now() - interval '49 hours') end,
       'historia'
  from _akcja_progi_s s cross join lateral public.akcja_progi_lista(s.cel_km, s.suma) p;
drop table _akcja_progi_h, _akcja_progi_s;

-- 4. licznik: pole prog po kotwicy z 20261120
do $migracja$
declare v_def text; n integer;
  k_stare constant text := $k$'bieg', public.akcja_bieg_publiczny(a.slug), 'firmy_zgloszenia', a.firmy_zgloszenia,$k$;
  k_nowe  constant text := $k$'bieg', public.akcja_bieg_publiczny(a.slug), 'prog', public.akcja_prog_publiczny(a.id), 'firmy_zgloszenia', a.firmy_zgloszenia,$k$;
begin
  v_def := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  n := (length(v_def) - length(replace(v_def, k_stare, ''))) / length(k_stare);
  if n <> 1 then raise exception 'public.akcja_licznik(text): kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', k_stare, n; end if;
  execute replace(v_def, k_stare, k_nowe);
  if has_table_privilege('anon', 'public.akcja_progi', 'SELECT, INSERT, UPDATE, DELETE') or has_table_privilege('authenticated', 'public.akcja_progi', 'SELECT, INSERT, UPDATE, DELETE')
     or has_function_privilege('anon', 'public.akcja_progi_zapisz()', 'execute') or has_function_privilege('authenticated', 'public.akcja_progi_zapisz()', 'execute')
     or has_function_privilege('anon', 'public.akcja_prog_publiczny(uuid)', 'execute') or has_function_privilege('authenticated', 'public.akcja_prog_publiczny(uuid)', 'execute')
     or has_function_privilege('anon', 'public.akcja_progi_lista(numeric, numeric)', 'execute') or has_function_privilege('authenticated', 'public.akcja_progi_lista(numeric, numeric)', 'execute')
     or has_function_privilege('anon', 'public.akcja_licznik(text)', 'execute') or not has_function_privilege('authenticated', 'public.akcja_licznik(text)', 'execute') then
    raise exception 'akcja_progi: uprawnienia z przeglądarki inne niż zamierzone, nic nie zmieniam';
  end if;
end $migracja$;

select cron.schedule('akcja-progi', '*/5 * * * *', $job$ select public.akcja_progi_zapisz(); $job$);

commit;
notify pgrst, 'reload schema';
