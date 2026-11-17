-- WYCOFANIE 20261206_akcja_bieg_dyplom_flagi.sql: odwrotna zamiana kotwic na definicjach z bazy (pięć funkcji wraca 1:1), potem trzy nowe funkcje i trzy kolumny.
-- ⚠️ Wyniki usunięte przez organizatora tracą znacznik: automat (cron co godzinę) przywróci je z treningu, a rodzic może znów wpisać dystans dziecka.
--    Przed wycofaniem: select count(*) from public.akcja_bieg_uczestnicy where wynik_usuniety_at is not null; przy liczbie > 0 zapisz numery i po wycofaniu sprawdź je ręcznie.
-- Powiadomienia 'bieg_wynik' zostają w dzwonku (zwykły tekst). Front działa dalej: brak kluczy = brak karty „wynik usunięty” i brak flag w panelu, przycisk „Usuń wynik” dostaje odmowę z bazy.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$if not found or u.rodzaj <> 'ja' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if; if exists (select 1 from public.akcja_bieg_uczestnicy x where x.bieg_id = u.bieg_id and x.konto_id = u.konto_id and x.rodzaj = 'ja' and x.wynik_usuniety_at is not null) then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if;$k$,
       $k$if not found or u.rodzaj <> 'ja' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;$k$),
      ('public.akcja_bieg_dziecko_ukoncz(uuid, numeric)',
       $k$if u.wynik_usuniety_at is not null then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if; if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;$k$,
       $k$if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;$k$),
      ('public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)',
       $k$update public.akcja_bieg_uczestnicy set wynik_usuniety_at = null, wynik_usuniety_powod = null, wynik_usuniety_przez = null where id = u.id and wynik_usuniety_at is not null; perform public.akcja_bieg_wynik_powiadom(u); perform public.akcja_bieg_odznaka(u.id);$k$,
       $k$perform public.akcja_bieg_odznaka(u.id);$k$),
      ('public.akcja_bieg_moi(text)',
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), 'wynik_usuniety', u.wynik_usuniety_at is not null, 'wynik_usuniety_powod', u.wynik_usuniety_powod)$k$,
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id))$k$),
      ('public.akcja_bieg_panel(text)',
       $k$'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null, 'wynik_usuniety', u.wynik_usuniety_at is not null, 'wynik_usuniety_powod', u.wynik_usuniety_powod, 'do_sprawdzenia', to_jsonb(public.akcja_bieg_do_sprawdzenia(u))) order by u.numer)$k$,
       $k$'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null) order by u.numer)$k$)
    ) as t(funkcja, nowe, stare)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.nowe, ''))) / length(r.nowe);
    if n <> 1 then raise exception '%: fragment z 20261206 wystąpił % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, n; end if;
    execute replace(v_def, r.nowe, r.stare);
  end loop;
end $wycofanie$;

drop function public.akcja_bieg_usun_wynik(uuid, text);
drop function public.akcja_bieg_wynik_powiadom(public.akcja_bieg_uczestnicy);
drop function public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy);
alter table public.akcja_bieg_uczestnicy drop column wynik_usuniety_przez, drop column wynik_usuniety_powod, drop column wynik_usuniety_at;

commit;
notify pgrst, 'reload schema';
