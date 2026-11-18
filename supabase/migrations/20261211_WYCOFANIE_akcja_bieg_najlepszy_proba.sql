-- WYCOFANIE 20261211_akcja_bieg_najlepszy_proba.sql: automat bez powiadomienia o nowym najlepszym wyniku, zapis siebie i dziecka bez bramki biegu akcji testowej
-- (kotwice z powrotem), funkcja akcja_bieg_najlepszy_powiadom skasowana. Wysłane powiadomienia zostają w dzwonkach (zwykłe wiersze notifications).
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      (1, 'public.akcja_bieg_automat()',
       $k$is distinct from r.wynik_log_id then n := n + 1; begin perform public.akcja_bieg_najlepszy_powiadom(r.id, r.wynik_log_id, r.wynik_dystans_km, r.ukonczony_at is not null); exception when others then raise warning 'akcja_bieg_automat: powiadomienie %: %', r.id, sqlerrm; end; end if;$k$,
       $k$is distinct from r.wynik_log_id then n := n + 1; end if;$k$),
      (2, 'public.akcja_bieg_automat()',
       $k$for r in select u.id, u.wynik_log_id, u.wynik_dystans_km, u.ukonczony_at from public.akcja_bieg_uczestnicy u$k$,
       $k$for r in select u.id, u.wynik_log_id from public.akcja_bieg_uczestnicy u$k$),
      (3, 'public.akcja_bieg_zapisz(text, integer, boolean, boolean, text, text, boolean)',
       $k$ if exists (select 1 from public.akcje a where a.slug = b.akcja_slug and a.testowa and not (v_ja = any(coalesce(a.konta_testowe, '{}'::uuid[])))) then return jsonb_build_object('ok', false, 'powod', 'tylko_test'); end if;$k$,
       ''),
      (4, 'public.akcja_bieg_dopisz_dziecko(text, text, boolean, boolean, text)',
       $k$ if exists (select 1 from public.akcje a where a.slug = b.akcja_slug and a.testowa and not (v_ja = any(coalesce(a.konta_testowe, '{}'::uuid[])))) then return jsonb_build_object('ok', false, 'powod', 'tylko_test'); end if;$k$,
       '')
    ) as t(nr, funkcja, kotwica, nowe) order by nr
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.kotwica, ''))) / length(r.kotwica);
    if n <> 1 then raise exception '%: fragment z 20261211 wystąpił % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, n; end if;
    execute replace(v_def, r.kotwica, r.nowe);
  end loop;
end $wycofanie$;

drop function public.akcja_bieg_najlepszy_powiadom(uuid, uuid, numeric, boolean);

commit;
notify pgrst, 'reload schema';
