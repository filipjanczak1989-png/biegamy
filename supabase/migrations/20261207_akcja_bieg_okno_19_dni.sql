-- BIEG WIRTUALNY: BIEG PRZEZ CAŁY OKRES, NIE W WEEKEND (decyzja Filipa 17.11: prawdziwy bieg 18.11–6.12, wyniki do 8.12). NIE wykonywać przed 20261206.
-- 1. DATY: akcja_biegi_dni pozwalało na najwyżej 2 dni biegu (dzien_do - dzien_od <= 1). Teraz najwyżej 32 dni (<= 31); wynik_do dalej najwyżej 7 dni po końcu.
--    Bez tego pliki otwarcia z nowymi datami (prawdziwy\34c, 31c) kończą się błędem CHECK. Kolejność: ta migracja → 34c → 31c.
-- 2. AUTOMAT (akcja_bieg_automat, cron co godzinę): do rankingu najlepszy pasujący trening z całego okresu, nie pierwszy. Oprócz zapisów bez wyniku sprawdza też wyniki
--    ustalone automatem (nie wskazane przez uczestnika, nie zaliczone przez organizatora, bez zatwierdzenia w weryfikacji) i podmienia trening, gdy w okresie jest lepszy
--    (kolejność wyboru z 20261206: zaliczony dystans, zakres rankingu, wiarygodne tempo, najlepsze tempo). Ukończenie zostaje. Zwraca liczbę zmienionych wyników.
-- 3. E-MAIL: zamiast dwóch dni przed startem jeden e-mail na 3 dni przed końcem biegu (dzien_do - 3) od 8:00, „zostały 3 dni, jeszcze możesz pobiec”;
--    kto nie dostał go tego dnia (limit 90 na dobę, odrzucenie), dostaje go następnego dnia (dzien_do - 2). Lista oddaje 'dni_do_konca' (EF bieg-przypomnienie, treść).
--    Cron 20261128 (jeszcze nieuruchomiony) poprawiony na same poranki.
-- Funkcje bierzemy Z BAZY i zmieniamy po kotwicy (wzór 20261203). Test po skutku: tools/akcja-bieg-okno-test.sh (przed wdrożeniem AKCJA_BIEG_OKNO_Z_MIGRACJA=1).
-- Wycofanie: 20261207_WYCOFANIE_akcja_bieg_okno_19_dni.sql.
begin;

alter table public.akcja_biegi drop constraint akcja_biegi_dni;
alter table public.akcja_biegi add constraint akcja_biegi_dni check (dzien_do >= dzien_od and dzien_do - dzien_od <= 31 and wynik_do >= dzien_do and wynik_do - dzien_do <= 7);

do $migracja$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_automat()',
       $k$declare r record; n integer := 0;$k$,
       $k$declare r record; n integer := 0; v jsonb;$k$),
      ('public.akcja_bieg_automat()',
       $k$for r in select u.id from$k$,
       $k$for r in select u.id, u.wynik_log_id from$k$),
      ('public.akcja_bieg_automat()',
       $k$and u.wycofany_at is null and u.ukonczony_at is null loop$k$,
       $k$and u.wycofany_at is null and (u.ukonczony_at is null or (not u.wynik_wskazany and u.zaliczony_przez is null and u.weryfikacja is distinct from 'zatwierdzony')) loop$k$),
      ('public.akcja_bieg_automat()',
       $k$if (public.akcja_bieg_wynik_z_treningu(r.id, null)->>'ok')::boolean then n := n + 1; end if;$k$,
       $k$v := public.akcja_bieg_wynik_z_treningu(r.id, null); if (v->>'ok')::boolean and (v->>'log_id')::uuid is distinct from r.wynik_log_id then n := n + 1; end if;$k$),
      ('public.akcja_bieg_do_przypomnienia(timestamp with time zone, integer)',
       $k$and ((b.dzien_od = v_dzis + 2 and v_godz >= time '18:00') or (b.dzien_od = v_dzis + 1 and v_godz >= time '08:00'))$k$,
       $k$and ((b.dzien_do = v_dzis + 3 and v_godz >= time '08:00') or b.dzien_do = v_dzis + 2)$k$),
      ('public.akcja_bieg_do_przypomnienia(timestamp with time zone, integer)',
       $k$'dni_do_biegu', b.dzien_od - v_dzis,$k$,
       $k$'dni_do_biegu', b.dzien_od - v_dzis, 'dni_do_konca', b.dzien_do - v_dzis,$k$)
    ) as t(funkcja, kotwica, nowe)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: kotwica „%” wystąpiła % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, r.kotwica, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $migracja$;

commit;
notify pgrst, 'reload schema';
