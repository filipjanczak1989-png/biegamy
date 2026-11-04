-- DANE ZBIÓRKI (decyzje Filipa 2.11): link oficjalnej zbiórki, forma imienia i nazwa akcji dla 'dla-fabianka'.
--   url_zbiorki  = https://www.siepomaga.pl/ADRES-ZBIORKI-TYLKO-W-BAZIE  — NAZWISKO WYŁĄCZNIE W LINKU;
--   imie_zbiorki = 'Fabianek' (w tekstach aplikacji tylko to imię i odmiana „Fabianka"; nigdy nazwisko ani choroba);
--   nazwa        = 'Kilometry dla Fabianka' (Filip 12:26 — cel 12 500 km zostaje liczbą na pasku, nie w nazwie).
-- Rozliczenie jednorazowe po zakończeniu akcji (bez zmian w schemacie — akcja_tydzien zostaje jako raport dla Filipa).
-- Licznik przed startem nadal NIE zwraca nazwy, imienia ani linku — asercja niżej pyta go jak EF akcja-licznik.
begin;

update public.akcje
   set url_zbiorki  = 'https://www.siepomaga.pl/ADRES-ZBIORKI-TYLKO-W-BAZIE',
       imie_zbiorki = 'Fabianek',
       nazwa        = 'Kilometry dla Fabianka'
 where slug = 'dla-fabianka';

do $$
declare a public.akcje; j jsonb;
begin
  select * into a from public.akcje where slug = 'dla-fabianka';
  if a.url_zbiorki is distinct from 'https://www.siepomaga.pl/ADRES-ZBIORKI-TYLKO-W-BAZIE' or a.imie_zbiorki is distinct from 'Fabianek'
     or a.nazwa is distinct from 'Kilometry dla Fabianka' then raise exception 'dane zbiórki: wartości'; end if;
  if a.nazwa ~* 'fabian-' or a.imie_zbiorki ~* 'fabian-' then raise exception 'dane zbiórki: nazwisko poza linkiem'; end if;
  if a.wystartowala_at is null then
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    execute 'set local role service_role';
    j := public.akcja_licznik('dla-fabianka');
    reset role;
    if j::text ~* 'fabian|siepomaga|kilometry dla' then raise exception 'dane zbiórki: licznik przed startem zdradza akcję: %', j; end if;
    if (j->>'wystartowala')::boolean or j->'suma_km' <> 'null'::jsonb then raise exception 'dane zbiórki: licznik przed startem %', j; end if;
  end if;
end $$;

commit;
