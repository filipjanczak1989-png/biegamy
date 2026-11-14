-- WYCOFANIE 20261130_akcja_bieg_regulamin_od.sql: klucz regulamin_od z akcja_bieg_publiczny (odwrotna zamiana na definicji z bazy), potem kolumna.
-- Po wycofaniu strona biegu pokazuje „WKRÓTCE” (teksty bez {od_kiedy}); dane zapisów zostają.
begin;

do $wycofanie$
declare v_def text; v_nowa text := $k$'regulamin_wersja', b.regulamin_wersja, 'regulamin_od', b.regulamin_od,$k$; n integer;
begin
  v_def := pg_get_functiondef('public.akcja_bieg_publiczny(text)'::regprocedure);
  n := (length(v_def) - length(replace(v_def, v_nowa, ''))) / length(v_nowa);
  if n <> 1 then raise exception 'akcja_bieg_publiczny: klucz regulamin_od wystąpił % razy (oczekiwano 1), nic nie zmieniam', n; end if;
  execute replace(v_def, v_nowa, $k$'regulamin_wersja', b.regulamin_wersja,$k$);
end $wycofanie$;

alter table public.akcja_biegi drop column regulamin_od;

commit;
notify pgrst, 'reload schema';
