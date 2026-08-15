-- ── POMIAR: ilu zawodnikow zdobylo kilometry dla Kasi i NIE MA o tym pojecia ──
--
-- Odznaki powstaja WYLACZNIE wtedy, gdy czlowiek otworzy zawodnik.html
-- (checkBadges jest wolane po stronie klienta, z jednego miejsca, w callbacku
-- ladowania logow). Import z intervals.icu wstawia log przez service-role
-- i NIE odpala niczego. Skutek: kto biega, ale nie wchodzi do aplikacji,
-- nie dostaje odznaki — a odznaka jest glownym sygnalem zwrotnym wyzwania.
--
-- 15.08.2026, dzien otwarcia: 5 z 10 uprawnionych nie mialo odznaki.
-- Ten pomiar ma rozstrzygnac, czy to byl efekt pierwszego dnia, czy norma.
-- Jesli przez kilka dni odsetek trzyma sie wysoko -> przenosimy reguly odznak
-- na serwer (cron/EF, patrz zwiad z 15.08). Jesli spada do zera -> nie warto.
--
-- URUCHOMIENIE (sciezka MUSI byc bezwzgledna — -f jest wzgledne do --workdir):
--   supabase db query --linked --workdir /c/Users/ja/.cache/sb-audit \
--     -o csv -f /c/Users/ja/biegamy/tools/pomiar-odznaka-wyzwania.sql
--
-- !! JEDNO zapytanie, nie dwa: CLI drukuje TYLKO ostatni result set, wiec
--    podsumowanie i szczegol musza isc jednym UNION-em, inaczej podsumowanie
--    ginie po cichu.
-- !! DOBA WARSZAWSKA, nie UTC — te same granice co community_km() i te same
--    co reguly odznak po poprawce z 15.08. Gdyby ktos zmienil jedno bez
--    drugiego, ten pomiar pokaze rozjazd jako falszywe "BRAK".
-- !! LISTA TYPOW skopiowana z community_km(). Przy zmianie tam — zmien i tu,
--    inaczej pomiar liczy inna populacje niz licznik na pasku.

with okno as (
  select l.athlete_id,
         round(sum(l.distance_km)::numeric, 1)                            as km,
         max(l.logged_at at time zone 'Europe/Warsaw')::timestamp(0)      as ostatni_bieg
    from public.training_logs l
   where l.distance_km is not null
     and (l.logged_at at time zone 'Europe/Warsaw')::date between '2026-08-15' and '2026-09-20'
     and lower(trim(l.training_type)) in
         ('spokojny','bieg spokojny','wybieganie','długi','tempo',
          'progresja','interwały','start','wyścig','regeneracja')
   group by 1
  having sum(l.distance_km) >= 1          -- prog odznaki razem_wrzesien_2026
), stan as (
  select a.full_name,
         okno.km,
         okno.ostatni_bieg,
         (ach.badge_id is null)                                            as brak,
         (select count(*) from public.push_subscriptions p
           where p.athlete_id = a.id)                                      as push_sub
    from okno
    join public.athletes a on a.id = okno.athlete_id
    left join public.achievements ach
           on ach.athlete_id = okno.athlete_id
          and ach.badge_id = 'razem_wrzesien_2026'
)
select kto, km, ostatni_bieg, odznaka, push
from (
  select 0 as ord, '' as sort2,
         '== ' || (now() at time zone 'Europe/Warsaw')::date || ' =='       as kto,
         count(*)::text || ' uprawnionych'                                  as km,
         count(*) filter (where brak)::text || ' BEZ ODZNAKI'               as ostatni_bieg,
         round(100.0 * count(*) filter (where brak) / nullif(count(*),0))::text || '%' as odznaka,
         count(*) filter (where brak and push_sub > 0)::text || ' z pushem' as push
    from stan
  union all
  select 1, (case when brak then '0' else '1' end) || lpad((1000 - km)::text, 6, '0'),
         full_name, km::text, ostatni_bieg::text,
         case when brak then 'BRAK' else 'ma' end, push_sub::text
    from stan
) x
order by ord, sort2;
