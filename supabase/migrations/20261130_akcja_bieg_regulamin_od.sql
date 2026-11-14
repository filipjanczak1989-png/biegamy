-- BIEG WIRTUALNY, TEKSTY (Filip 14.11): data, od której obowiązuje regulamin ({od_kiedy} w § 13 ust. 3 regulaminu biegu), w polu `bieg` licznika.
-- Bez niej strona biegu pokazuje „WKRÓTCE” (js/bieg.mjs, wartosciTekstow): teksty wymagają kompletu wartości z bazy. Ustawia ją plik otwarcia biegu
-- (prawdziwy\31: dzień otwarcia, gdy pusta) albo wiersz biegu próbnego. Nic poza tym się nie zmienia.
-- akcja_bieg_publiczny bierzemy Z BAZY (pg_get_functiondef) i dokładamy jeden klucz obok regulamin_wersja, jak 20261120 przy akcja_licznik:
-- reszta funkcji zostaje 1:1 z produkcji, a create or replace zachowuje uprawnienia (woła ją tylko akcja_licznik, SECURITY DEFINER).
-- Test po skutku: tools/akcja-bieg-regulamin-test.sh (przed wdrożeniem: AKCJA_BIEG_REGULAMIN_Z_MIGRACJA=1). Wycofanie: 20261130_WYCOFANIE_akcja_bieg_regulamin_od.sql.
begin;

alter table public.akcja_biegi add column regulamin_od date;
comment on column public.akcja_biegi.regulamin_od is 'Od kiedy obowiązuje regulamin w wersji regulamin_wersja ({od_kiedy} w § 13 ust. 3 regulaminu biegu). NULL = strona biegu pokazuje „WKRÓTCE”.';

do $migracja$
declare v_def text; v_kotwica text := $k$'regulamin_wersja', b.regulamin_wersja,$k$; n integer;
begin
  v_def := pg_get_functiondef('public.akcja_bieg_publiczny(text)'::regprocedure);
  n := (length(v_def) - length(replace(v_def, v_kotwica, ''))) / length(v_kotwica);
  if n <> 1 then raise exception 'akcja_bieg_publiczny: kotwica regulamin_wersja wystąpiła % razy (oczekiwano 1), nic nie zmieniam', n; end if;
  execute replace(v_def, v_kotwica, $k$'regulamin_wersja', b.regulamin_wersja, 'regulamin_od', b.regulamin_od,$k$);
end $migracja$;

commit;
notify pgrst, 'reload schema';
