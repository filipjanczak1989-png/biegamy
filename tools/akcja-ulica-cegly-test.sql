-- Test po skutku 20261127_akcja_ulica_cegly_najnowsze.sql: na ulicy próbnej trzy cegiełki (najstarsza złota, dwie nowsze zwykłe, jedna bez zgody);
-- licznik oddaje `ulica.cegly` od najnowszej, złota zostaje złota (z = true), imię tylko przy zgodzie, cegly_n liczy wszystkie. Jedna transakcja, zawsze wycofana.
do $T$
declare n int := 0; j jsonb; c jsonb;
begin
  insert into public.akcje (slug, nazwa, imie_zbiorki, start, cel_km, stawka_gr_filip, testowa, wystartowala_at)
    values ('proba', 'Próba', 'Janek', current_date, 100, 10, true, now()) on conflict (slug) do update set wystartowala_at = coalesce(public.akcje.wystartowala_at, now()), koniec = null;
  delete from public.akcja_cegielki where akcja_slug = 'proba';
  insert into public.akcja_cegielki (akcja_slug, imie, zgoda, potwierdzenie_widziane, zlota, dodano) values
    ('proba', 'Zlota', true, true, true, now() - interval '3 days'),
    ('proba', 'Srodkowa', true, true, false, now() - interval '2 days'),
    ('proba', 'Bezzgody', false, true, false, now() - interval '1 day'),
    ('proba', 'Najnowsza', true, true, false, now());
  j := public.akcja_ulica_publiczna('proba');
  c := j->'cegly';
  if jsonb_array_length(c) <> 4 or (j->>'cegly_n')::int <> 4 then raise exception 'FAIL 1: % cegieł zamiast 4', c; end if;
  if c->0->>'i' <> 'Najnowsza' or c->1->>'i' is not null or c->2->>'i' <> 'Srodkowa' or c->3->>'i' <> 'Zlota' then raise exception 'FAIL 2: kolejność ma być od najnowszej, a jest %', c; end if;
  if not (c->3->>'z')::boolean or (c->0->>'z')::boolean then raise exception 'FAIL 3: złota zostaje złota: %', c; end if;
  if c::text ~ 'Bezzgody' then raise exception 'FAIL 4: imię bez zgody wyszło publicznie'; end if;
  n := n + 4;
  -- pełny licznik (akcja_licznik) oddaje to samo pole ulica.cegly
  j := public.akcja_licznik('proba');
  if j->'ulica'->'cegly'->0->>'i' <> 'Najnowsza' then raise exception 'FAIL 5: licznik: %', j->'ulica'->'cegly'; end if;
  n := n + 1;
  raise exception 'TESTY CEGIEŁ ZIELONE: % sprawdzeń', n;
end $T$;
