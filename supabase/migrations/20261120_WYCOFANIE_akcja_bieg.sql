-- Wycofanie 20261120_akcja_bieg.sql: licznik bez pola `bieg`, funkcje biegu znikają, kolumna w zgłoszeniach cegiełek znika (powiązania z biegiem przepadają),
-- tabele biegu i uczestników skasowane razem z zapisami. Przed uruchomieniem na produkcji z prawdziwymi zapisami: zrzut obu tabel poza repo.
begin;
do $$
declare v_def text; v_kotwica text := $k$'bieg', public.akcja_bieg_publiczny(a.slug), $k$;
begin
  v_def := pg_get_functiondef('public.akcja_licznik(text)'::regprocedure);
  if position(v_kotwica in v_def) > 0 then execute replace(v_def, v_kotwica, ''); end if;
end $$;
drop function if exists public.akcja_bieg_moi(text);
drop function if exists public.akcja_bieg_wycofaj(uuid);
drop function if exists public.akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text);
drop function if exists public.akcja_bieg_ranking_zgoda(text, boolean);
drop function if exists public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean);
drop function if exists public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text);
drop function if exists public.akcja_bieg_ukonczyli(text, integer, integer, integer);
drop function if exists public.akcja_bieg_ukonczyli(text, integer, integer);
drop function if exists public.akcja_bieg_publiczny(text);
drop function if exists public.akcja_bieg_czas_rankingu(public.akcja_bieg_uczestnicy, public.akcja_biegi);
drop function if exists public.akcja_bieg_niepelnoletni(uuid, date);
alter table public.akcja_firmy_zgloszenia drop column if exists bieg_uczestnik_id;
drop table if exists public.akcja_bieg_uczestnicy;
drop function if exists public.akcja_bieg_faza(public.akcja_biegi, date);
drop table if exists public.akcja_biegi;
notify pgrst, 'reload schema';
commit;
