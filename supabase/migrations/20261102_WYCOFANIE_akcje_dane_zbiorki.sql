-- WYCOFANIE 20261102_akcje_dane_zbiorki.sql — czyści link, imię i nazwę (stan „puste do czasu, aż poda Filip").
begin;
update public.akcje set url_zbiorki = null, imie_zbiorki = null, nazwa = null where slug = 'dla-fabianka';
commit;
