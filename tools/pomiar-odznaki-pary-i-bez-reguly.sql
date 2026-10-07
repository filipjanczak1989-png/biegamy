-- POMIAR READ-ONLY (SQL Editor, rola postgres) — odznaki, decyzja Filipa 7.10.2026 (paczka 3, pkt D1).
--
-- Trzy pytania, jedna odpowiedź na raz:
--   1. ile razy przyznano KAŻDĄ stronę 8 par duplikatów (do decyzji, która strona zostaje);
--   2. ile razy przyznano 33 odznaki „tylko silnik" (przyznawane, dotąd NIEWIDOCZNE w katalogu);
--   3. czy KTOKOLWIEK ma którąś z 31 „bez reguły" (po ukryciu w katalogu zdobyta zostaje w bazie,
--      szczegół nadal czyta pełną listę BADGES — ale chcemy wiedzieć, czy to w ogóle zachodzi).
-- Dodatkowo: dwa id z polskimi znakami (maratończyk / gaduła) — WYNIK 7.10: 0 przyznań, więc migracja
-- przepinająca id w achievements była zbędna i została usunięta; id zmienione tylko w katalogu.
-- WYNIK 7.10 (Filip): pkt 1 — 3_z_rzedu 31 / 3_dni_pod_rzad 27, bez_dnia_przerwy 1 / 30_dni_challenge 1,
-- pozostałe strony B = 0; pkt 2b — 7 z 33 nigdy nieprzyznanych; pkt 3 — 0 wierszy.
--
-- Źródło przyznań = public.achievements (awardBadge / _wyslijOdznaki w zawodnik.html).
-- training_logs.training_type LIKE '__badge__%' to STARY mechanizm (profil.html:1245) — liczony
-- osobno na końcu, żeby wykluczyć, że ktoś ma odznakę tylko w starej postaci.
-- Listy id 1:1 z odznaki.html po diffie z 7.10 (bramka: tests/blizna-40-katalog-odznak-jedna-prawda.test.js).

-- 1. PARY DUPLIKATÓW — para, strona, czy silnik ma regułę (stan kodu 7.10), ile wierszy, ile osób
with pary(para, badge_id, strona, regula_w_silniku) as (values
  ('dystans_2000 / 2000km_total',        'dystans_2000',      'A', true),
  ('dystans_2000 / 2000km_total',        '2000km_total',      'B', false),
  ('nocny_wojownik / sowa',              'nocny_wojownik',    'A', true),
  ('nocny_wojownik / sowa',              'sowa',              'B', false),
  ('early_bird / wczesny_ptak',          'early_bird',        'A', true),
  ('early_bird / wczesny_ptak',          'wczesny_ptak',      'B', false),
  ('nie_ma_wymowek / deszcz',            'nie_ma_wymowek',    'A', false),
  ('nie_ma_wymowek / deszcz',            'deszcz',            'B', false),
  ('nowy_rekord / pb_run',               'nowy_rekord',       'A', false),
  ('nowy_rekord / pb_run',               'pb_run',            'B', false),
  ('negative_split / tempo_negatyw',     'negative_split',    'A', false),
  ('negative_split / tempo_negatyw',     'tempo_negatyw',     'B', false),
  ('3_z_rzedu / 3_dni_pod_rzad',         '3_z_rzedu',         'A', true),
  ('3_z_rzedu / 3_dni_pod_rzad',         '3_dni_pod_rzad',    'B', true),
  ('bez_dnia_przerwy / 30_dni_challenge','bez_dnia_przerwy',  'A', true),
  ('bez_dnia_przerwy / 30_dni_challenge','30_dni_challenge',  'B', true)
)
select p.para, p.strona, p.badge_id, p.regula_w_silniku,
       count(a.id)                       as przyznan,
       count(distinct a.athlete_id)      as osob,
       min(a.earned_at)::date            as pierwsze,
       max(a.earned_at)::date            as ostatnie
from pary p
left join public.achievements a on a.badge_id = p.badge_id
group by 1, 2, 3, 4
order by 1, 2;

-- 2. TYLKO SILNIK (33) — przyznawane od miesięcy, dopiero po 7.10 widoczne w katalogu
select a.badge_id,
       count(*)                      as przyznan,
       count(distinct a.athlete_id)  as osob,
       min(a.earned_at)::date        as pierwsze,
       max(a.earned_at)::date        as ostatnie
from public.achievements a
where a.badge_id in (
  'gorace_tempo','sub_25','sub_50','sub_2','sub_4','maszyna_biegania',
  'pierwszy_fan','stary_druh','coach_whisperer','spam_friend','pliszka',
  'pierwszy_pojedynek','zwyciezca_pojedynku','mistrz_pojedynkow',
  'maraton_dni','mr_13','pi_day','maraton_tygodnia','polmaraton_tydz','setka_dokladna',
  'easy_rider','rakieta','czterolistna_koniczyna','solo_artist','tylko_jeden',
  'dzien_kobiet','walentynki_solo','urodzinowy_run',
  'easter_egg','pierwsza_z_pierwszych','wieczny_optymista','swiety_mikolaj','dzien_biegacza'
)
group by 1
order by przyznan desc, 1;

-- 2b. które z 33 NIE mają ani jednego przyznania (dopełnienie listy wyżej)
select v.badge_id as nigdy_nieprzyznana
from (values
  ('gorace_tempo'),('sub_25'),('sub_50'),('sub_2'),('sub_4'),('maszyna_biegania'),
  ('pierwszy_fan'),('stary_druh'),('coach_whisperer'),('spam_friend'),('pliszka'),
  ('pierwszy_pojedynek'),('zwyciezca_pojedynku'),('mistrz_pojedynkow'),
  ('maraton_dni'),('mr_13'),('pi_day'),('maraton_tygodnia'),('polmaraton_tydz'),('setka_dokladna'),
  ('easy_rider'),('rakieta'),('czterolistna_koniczyna'),('solo_artist'),('tylko_jeden'),
  ('dzien_kobiet'),('walentynki_solo'),('urodzinowy_run'),
  ('easter_egg'),('pierwsza_z_pierwszych'),('wieczny_optymista'),('swiety_mikolaj'),('dzien_biegacza')
) v(badge_id)
where not exists (select 1 from public.achievements a where a.badge_id = v.badge_id)
order by 1;

-- 3. BEZ REGUŁY (31) — oczekiwane 0 wierszy (silnik nigdy ich nie przyznawał); każdy wiersz = pytanie SKĄD
select a.badge_id,
       count(*)                      as przyznan,
       count(distinct a.athlete_id)  as osob,
       min(a.earned_at)::date        as pierwsze,
       max(a.earned_at)::date        as ostatnie
from public.achievements a
where a.badge_id in (
  'plan_ukonczony','nowy_rekord','negative_split','nie_ma_wymowek','lodowy_biegacz','silna_glowa',
  'motywator','lider','wsparcie','ultra_mindset','tempo_negatyw','maratonczyk','2000km_total',
  'wczesny_ptak','sowa','poranek_5','noc_marathon','mroz','upal','deszcz','snieg',
  'pierwsza_wiad','gadula','pierwszy_post','10_postow','cytat_dnia',
  'pierwsze_wyzwanie','5_wyzwan','10_wyzwan','5_startow','pb_run',
  'maratończyk','gaduła'            -- stare id z polskimi znakami (7.10: 0 wierszy)
)
group by 1
order by 1;

-- 4. KONTROLA ZAMKNIĘCIA: przyznane badge_id, których NIE MA w katalogu po 7.10 (oczekiwane 0 wierszy).
--    Lista = pełny katalog odznaki.html po diffie (143 id); zgodność z plikiem sprawdza
--    tests/blizna-40 (test „pomiar-odznaki: lista katalogu w SQL = BADGES z odznaki.html").
select a.badge_id, count(*) as przyznan, count(distinct a.athlete_id) as osob
from public.achievements a
where a.badge_id not in (
  'pierwszy_krok','wracam_do_gry','3_z_rzedu','pierwsze_10km','plan_ukonczony','streak_7',
  'streak_30','streak_100','nie_zatrzymuje','rutyna_mistrza','dystans_50','dystans_100',
  'dystans_250','dystans_500','dystans_1000','dystans_2000','dystans_5000','tempo_killer',
  'interwalowiec','nowy_rekord','negative_split','nocny_wojownik','early_bird','nie_ma_wymowek',
  'lodowy_biegacz','silna_glowa','bez_wymowek','powrot_silniejszy','tydzien_mocy','5_dni_ruchu',
  'weekend_runner','szybki_tydzien','interwalowy_tydz','mieszany_ogien','20km_tydzien','40km_tydzien',
  '60km_tydzien','80km_tydzien','bez_skipa','3_dni_pod_rzad','forma_rosnie','50km_miesiaca',
  '100km_miesiaca','200km_miesiaca','300km_miesiaca','15_treningow','20_treningow','25_treningow',
  'maraton_m','ultra_m','pierwszy_koment','motywator','lider','wsparcie',
  'bez_dnia_przerwy','ultra_mindset','granice','swiateczny','nowy_rok','letnia_forma',
  'zimowy_wojownik','7_dni_challenge','14_dni_challenge','30_dni_challenge','sub_5min_km','sub_4min_km',
  'sub_3_30_km','tempo_negatyw','mistrz_tempa','pierwsza_5tka','dwucyfrowy','half_marathon',
  'maratonczyk','ultra','2000km_total','wczesny_ptak','sowa','poranek_5',
  'noc_marathon','mroz','upal','deszcz','snieg','pierwszy_kumpel',
  'krag_5','krag_25','krag_50','pierwsza_wiad','gadula','pierwszy_post',
  '10_postow','cytat_dnia','tydzien_50km','tydzien_100km','tydzien_150km','streak_50',
  'streak_365','4_w_tygodniu','6_w_tygodniu','po_kontuzji','kiepski_dzien','7_usmiechow',
  'pierwsze_wyzwanie','5_wyzwan','10_wyzwan','100km_wrzesien_2026','razem_wrzesien_2026','pierwszy_start',
  '5_startow','pb_run','gorace_tempo','sub_25','sub_50','sub_2',
  'sub_4','maszyna_biegania','pierwszy_fan','stary_druh','coach_whisperer','spam_friend',
  'pliszka','pierwszy_pojedynek','zwyciezca_pojedynku','mistrz_pojedynkow','maraton_dni','mr_13',
  'pi_day','maraton_tygodnia','polmaraton_tydz','setka_dokladna','easy_rider','rakieta',
  'czterolistna_koniczyna','solo_artist','tylko_jeden','dzien_kobiet','walentynki_solo','urodzinowy_run',
  'easter_egg','pierwsza_z_pierwszych','wieczny_optymista','swiety_mikolaj','dzien_biegacza'
)
group by 1
order by 2 desc;

-- 5. STARY MECHANIZM: odznaki zapisane jako training_logs (profil.html czyta je LIKE '__badge__%')
select l.training_type, count(*) as wierszy, count(distinct l.athlete_id) as osob,
       min(l.logged_at)::date as pierwsze, max(l.logged_at)::date as ostatnie
from public.training_logs l
where l.training_type like '\_\_badge\_\_%'
group by 1
order by 2 desc;
