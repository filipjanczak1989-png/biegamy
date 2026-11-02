-- WYCOFANIE 20261102_akcje_startujacy_poprawka.sql — przywraca stan sprzed poprawki (BŁĘDNY: startujący = konto
-- testowe, konto testowe próby = główne konto Filipa). Tylko gdyby poprawka sama coś zepsuła.
begin;
update public.akcja_startujacy s
   set athlete_id = '9c2df65c-6a46-410e-ad5f-474e5d973ec9'
  from public.akcje a
 where a.id = s.akcja_id and a.slug in ('dla-fabianka', 'proba')
   and s.athlete_id = '56092926-2cf1-44b6-952f-38614497fdc2';
update public.akcje set konta_testowe = array['56092926-2cf1-44b6-952f-38614497fdc2'::uuid] where slug = 'proba';
commit;
-- KONTROLA: select a.slug, s.athlete_id from akcja_startujacy s join akcje a on a.id = s.akcja_id;
