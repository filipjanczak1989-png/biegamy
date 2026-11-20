-- WYCOFANIE 20261221_prosby_trenera.sql: zdejmuje cztery funkcje próśb i tabelę prosby_trenera. Przypisania ustawione przez przyjęte prośby
-- (athletes.coach_id) ZOSTAJĄ — to zwykłe przypisania zawodnik–trener.
-- Kolejność przy pełnym wycofaniu K2: najpierw M2 (zamek), potem front z prośbami, na końcu ten plik (front bez funkcji pokazuje błąd przy prośbie).
-- Strażnik: odmawia, gdy są oczekujące prośby (zawodnicy czekają na odpowiedź trenera) — najpierw rozpatrz je w panelu.
begin;

do $wycofanie$
declare n integer;
begin
  if to_regclass('public.prosby_trenera') is null then raise exception 'Nie ma prosby_trenera: migracja 20261221 nie weszła albo jest już wycofana'; end if;
  select count(*) into n from public.prosby_trenera where status = 'oczekuje';
  if n > 0 then raise exception 'Oczekujących próśb: % — wycofanie by je skasowało; najpierw rozpatrz je w panelu trenera', n; end if;
end $wycofanie$;

drop function public.rozpatrz_prosbe(uuid, boolean);
drop function public.prosby_do_mnie();
drop function public.wycofaj_prosbe_o_trenera();
drop function public.popros_o_trenera(uuid);
drop table public.prosby_trenera;

commit;
notify pgrst, 'reload schema';
