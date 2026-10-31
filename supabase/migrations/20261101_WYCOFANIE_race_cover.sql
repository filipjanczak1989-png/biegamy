-- WYCOFANIE 20261101_race_cover.sql — zdejmuje races.cover_url i bucket race-covers.
--
-- ⛔ KOLEJNOŚĆ: najpierw front bez cover_url (races.html, zawodnik.html) i EF race-image wyłączona —
--    inaczej select z cover_url / update z EF dostaną 42703.
-- ⛔ BUCKET: storage nie pozwala skasować niepustego bucketa, a obiektów nie usuwamy SQL-em (storage
--    pilnuje bezpośredniego DELETE na storage.objects). Najpierw opróżnić race-covers przez Storage API
--    albo Dashboard → „Empty bucket”. Storage NIE MA kosza — okładki przepadną (da się je wygenerować
--    ponownie, to nie dane ludzi).

begin;

alter table public.races drop column if exists cover_url;

delete from storage.buckets where id = 'race-covers';

commit;
