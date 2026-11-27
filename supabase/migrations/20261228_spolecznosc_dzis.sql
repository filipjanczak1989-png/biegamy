-- 20261228_spolecznosc_dzis.sql — kafel „Społeczność” w nowym Dziś (plan dzis\spolecznosc\plan-spolecznosc.md, K1; decyzje Filipa 27.11).
--
-- spolecznosc_dzis() oddaje JEDEN obiekt dla kafla, jednym zapytaniem po przewinięciu (wariant A):
--   osob, km        — podsumowanie biegów profili publicznych z ostatniej doby (decyzja 5: tylko publiczni);
--   miasta          — do trzech najczęstszych miast tych osób (z profilu, liczone po osobach);
--   od_polnocy      — true, gdy wszystkie te biegi są od północy czasu polskiego (front pisze wtedy „dziś”, inaczej „w ostatniej dobie”; decyzja 4);
--   biegi           — dwa najnowsze biegi RÓŻNYCH osób: id profilu, imię, miasto, rodzaj, km, kiedy;
--   odznaka         — jedna odznaka z 7 dni: najpierw osobista, odznaka akcji tylko gdy osobistej brak (decyzja 6); id, imię, odznaka, akcji, kiedy.
--
-- ZASADY (decyzje 1, 3, 4, 5, 6 i plan §4–5):
--   * tylko profile publiczne (athletes.is_public), czytane na żywo: przestawienie na prywatny działa od razu;
--   * bez własnych wpisów i odznak konta, które pyta (auth.uid());
--   * „bieg” = rodzaj z public.is_run_type (ta sama lista co reszta aplikacji); bez wpisów odznak (__badge__), bez wpisów z przyszłości;
--   * okno biegów: ostatnie 24 h; okno odznak: ostatnie 7 dni;
--   * odznaka akcji = identyfikator 'akcja-…' albo 'bieg-…' (bieg wirtualny akcji); każda inna jest osobista;
--   * imię = pierwsze słowo full_name; z '@' albo krótsze niż 3 znaki → 'Zawodnik' (rejestracja potrafi wpisać e-mail w imię);
--   * NIE oddaje: nazwiska, tempa, czasu trwania, tętna, przewyższenia, odczucia, komentarza, linków, identyfikatorów zewnętrznych, awatara.
--     Awatar w kaflu to inicjał w kolorowym kółku (decyzja 3), liczony w przeglądarce z imienia.
--
-- DOSTĘP: SECURITY DEFINER (czyta athletes, training_logs, achievements z pominięciem RLS, ale oddaje tylko pola wyżej), stały search_path (pusty,
--   wszystkie nazwy z przedrostkiem schematu), EXECUTE tylko authenticated: odebrane PUBLIC i anon, asercje niżej to sprawdzają.
-- STANY: funkcji nie ma → utworzona; już jest → podmieniona na tę wersję (create or replace), uprawnienia ustawione na nowo. W obu
--   przypadkach komunikat w wyniku (db query nie pokazuje raise notice). Wyjątek tylko, gdy asercje uprawnień nie przejdą (nic nie zmienione).
-- Test po skutku (w transakcji, zawsze wycofanej): tools/spolecznosc-dzis-test.sh (przed wdrożeniem z SD_Z_MIGRACJA=1).
-- Uruchomienie (ręcznie, ścieżka bezwzględna):
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/supabase/migrations/20261228_spolecznosc_dzis.sql"
-- Wycofanie: 20261228_WYCOFANIE_spolecznosc_dzis.sql (front bez funkcji chowa kafel i zgłasza client_errors, etap „spolecznosc”).

begin;

create temp table if not exists _spolecznosc_komunikat (komunikat text) on commit drop;
truncate _spolecznosc_komunikat;
insert into _spolecznosc_komunikat
select case when to_regprocedure('public.spolecznosc_dzis()') is null
            then 'utworzono spolecznosc_dzis()'
            else 'spolecznosc_dzis() już była: podmieniona na tę wersję, uprawnienia ustawione na nowo' end;

create or replace function public.spolecznosc_dzis()
returns jsonb
language sql stable security definer
set search_path = ''
as $fn$
  with osoby as (
    select a.id,
           case when position('@' in coalesce(a.full_name, '')) > 0
                  or char_length(coalesce((regexp_split_to_array(regexp_replace(coalesce(a.full_name, ''), '^\s+|\s+$', '', 'g'), '\s+'))[1], '')) < 3
                then 'Zawodnik'
                else left((regexp_split_to_array(regexp_replace(a.full_name, '^\s+|\s+$', '', 'g'), '\s+'))[1], 30) end as imie,
           nullif(left(btrim(coalesce(a.city, '')), 40), '') as miasto
      from public.athletes a
     where a.is_public is true
       and a.user_id is distinct from auth.uid()
  ),
  biegi as (
    select l.athlete_id, l.training_type, l.distance_km, l.logged_at
      from public.training_logs l
      join osoby o on o.id = l.athlete_id
     where l.logged_at > now() - interval '24 hours'
       and l.logged_at <= now()
       and l.training_type not like '\_\_badge\_\_%'
       and public.is_run_type(l.training_type)
  ),
  ostatnie as (
    select b.athlete_id, b.training_type, b.distance_km, b.logged_at
      from (select distinct on (x.athlete_id) x.athlete_id, x.training_type, x.distance_km, x.logged_at
              from biegi x
             order by x.athlete_id, x.logged_at desc) b
     order by b.logged_at desc
     limit 2
  ),
  miasta as (
    select o.miasto, count(distinct b.athlete_id) as n
      from biegi b
      join osoby o on o.id = b.athlete_id
     where o.miasto is not null
     group by o.miasto
     order by n desc, o.miasto
     limit 3
  ),
  odznaka as (
    select ac.athlete_id, ac.badge_id, ac.earned_at,
           (ac.badge_id like 'akcja-%' or ac.badge_id like 'bieg-%') as akcji
      from public.achievements ac
      join osoby o on o.id = ac.athlete_id
     where ac.earned_at > now() - interval '7 days'
       and ac.earned_at <= now()
     order by akcji, ac.earned_at desc
     limit 1
  )
  select jsonb_build_object(
    'osob', (select count(distinct b.athlete_id) from biegi b),
    'km', (select round(coalesce(sum(b.distance_km), 0)::numeric, 1) from biegi b),
    'miasta', coalesce((select jsonb_agg(m.miasto order by m.n desc, m.miasto) from miasta m), '[]'::jsonb),
    'od_polnocy', coalesce((select min(b.logged_at) from biegi b) >= (date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw'), true),
    'biegi', coalesce((select jsonb_agg(jsonb_build_object('id', s.athlete_id, 'imie', o.imie, 'miasto', o.miasto, 'rodzaj', left(s.training_type, 40),
                                                           'km', round(s.distance_km::numeric, 2), 'kiedy', s.logged_at) order by s.logged_at desc)
                         from ostatnie s join osoby o on o.id = s.athlete_id), '[]'::jsonb),
    'odznaka', (select jsonb_build_object('id', z.athlete_id, 'imie', o.imie, 'odznaka', z.badge_id, 'akcji', z.akcji, 'kiedy', z.earned_at)
                  from odznaka z join osoby o on o.id = z.athlete_id)
  )
$fn$;

comment on function public.spolecznosc_dzis() is 'Kafel Społeczność w nowym Dziś (20261228): podsumowanie biegów profili publicznych z doby, dwa ostatnie biegi różnych osób, jedna odznaka z 7 dni (osobista przed odznaką akcji). Bez własnych wpisów pytającego. Samo pierwsze imię, miasto, rodzaj, km, czas, id profilu.';

revoke all on function public.spolecznosc_dzis() from public, anon;
grant execute on function public.spolecznosc_dzis() to authenticated;

-- ── asercje: przy błędzie wyjątek i nic nie zmienione ──
do $$
declare r jsonb; p oid := to_regprocedure('public.spolecznosc_dzis()');
begin
  if has_function_privilege('anon', p, 'EXECUTE') then raise exception 'spolecznosc_dzis: anon może wołać — nie wdrażamy'; end if;
  if exists (select 1 from pg_proc, aclexplode(proacl) x where pg_proc.oid = p and x.grantee = 0 and x.privilege_type = 'EXECUTE') then
    raise exception 'spolecznosc_dzis: PUBLIC ma EXECUTE — nie wdrażamy'; end if;
  if not has_function_privilege('authenticated', p, 'EXECUTE') then raise exception 'spolecznosc_dzis: authenticated nie może wołać'; end if;
  if not (select prosecdef from pg_proc where oid = p) then raise exception 'spolecznosc_dzis: nie jest SECURITY DEFINER'; end if;
  if not coalesce((select 'search_path=""' = any (proconfig) from pg_proc where oid = p), false) then raise exception 'spolecznosc_dzis: search_path nie jest stały'; end if;
  r := public.spolecznosc_dzis();
  if not (r ?& array['osob', 'km', 'miasta', 'od_polnocy', 'biegi', 'odznaka']) then raise exception 'spolecznosc_dzis: brak pól w wyniku: %', r; end if;
end $$;

notify pgrst, 'reload schema';

select komunikat from _spolecznosc_komunikat;
commit;
