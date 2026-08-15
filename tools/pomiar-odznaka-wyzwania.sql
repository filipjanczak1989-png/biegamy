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
-- ── KOLUMNA `rola` — dodana 15.08.2026, i to jest jej cala historia ─────────
-- Do 15.08 zawodnik.html pomijal checkBadges dla kazdego, kto wszedl przez
-- ?from=trener — a JEDYNY link z panelu trenera (trener.html:311, menu awatara,
-- "Widok zawodnika") ten parametr niesie. Skutek: TRENER NIGDY nie przeliczal
-- wlasnych odznak. Guard usuniety commitem 84e97ee.
--
-- Pomiar z 15.08 pokazywal "5 z 10 bez odznaki" i wygladalo to na jedna liczbe
-- o jednym znaczeniu. W rzeczywistosci mierzyl DWIE ROZNE rzeczy naraz:
--   2 z 5 to byli trenerzy zablokowani BLEDEM
--   3 z 5 to zwykli zawodnicy, ktorzy po prostu nie weszli do aplikacji
-- Nikt tego nie widzial, dopoki Filip nie zapytal wprost. Ta kolumna istnieje
-- po to, zeby taki rozjazd nie mogl sie powtorzyc niezauwazony.
--
-- !! PO POPRAWCE LICZBA TRENEROW W KOLUMNIE `BRAK` MA WYNOSIC ZERO.
--    Jesli kiedykolwiek urosnie, znaczy to, ze guard wrocil jakas inna droga —
--    i wtedy szuka sie warunku pomijajacego checkBadges, a nie przyczyn
--    "ludzie nie wchodza do aplikacji".
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
         (c.id is not null)                                                as trener,
         (select count(*) from public.push_subscriptions p
           where p.athlete_id = a.id)                                      as push_sub
    from okno
    join public.athletes a on a.id = okno.athlete_id
    left join public.achievements ach
           on ach.athlete_id = okno.athlete_id
          and ach.badge_id = 'razem_wrzesien_2026'
    left join public.coaches c on c.id = a.user_id      -- rola: konto dualne trener+zawodnik
)
select kto, km, ostatni_bieg, odznaka, push, rola
from (
  select 0 as ord, '' as sort2,
         '== ' || (now() at time zone 'Europe/Warsaw')::date || ' =='       as kto,
         count(*)::text || ' uprawnionych'                                  as km,
         count(*) filter (where brak)::text || ' BEZ ODZNAKI'               as ostatni_bieg,
         round(100.0 * count(*) filter (where brak) / nullif(count(*),0))::text || '%' as odznaka,
         count(*) filter (where brak and push_sub > 0)::text || ' z pushem' as push,
         -- MA BYC 0. Wiecej niz 0 = guard wrocil jakas droga, patrz naglowek.
         count(*) filter (where brak and trener)::text || ' trenerow w BRAK' as rola
    from stan
  union all
  select 1, (case when brak then '0' else '1' end) || lpad((1000 - km)::text, 6, '0'),
         full_name, km::text, ostatni_bieg::text,
         case when brak then 'BRAK' else 'ma' end, push_sub::text,
         case when trener then 'TRENER' else '-' end
    from stan
) x
order by ord, sort2;
