-- WYCOFANIE 20261206_akcja_bieg_dyplom_flagi.sql: odwrotna zamiana kotwic na definicjach z bazy (sześć funkcji wraca 1:1, w tym reguła rankingu z 20261203:
-- znów tylko wynik z zegarka), potem nowe funkcje, wyzwalacz i kolumny. Stan po wycofaniu = stan po 20261203.
-- ⚠️ Wyniki usunięte przez organizatora tracą znacznik: automat (cron co godzinę) przywróci je z treningu, a rodzic może znów wpisać dystans dziecka.
--    Przed wycofaniem: select count(*) from public.akcja_bieg_uczestnicy where wynik_usuniety_at is not null; przy liczbie > 0 zapisz numery i po wycofaniu sprawdź je ręcznie.
-- ⚠️ Decyzje „Zatwierdź / Odrzuć” przepadają; ranking wraca do zasady „tylko z zegarka” (wyniki ręczne bez czasu i miejsca, wyniki z zegarka bez progu tempa).
-- Powiadomienia 'bieg_wynik' zostają w dzwonku (zwykły tekst). Front działa dalej: brak kluczy = brak karty „wynik usunięty”, weryfikacji i flag w panelu, przyciski panelu dostają odmowę z bazy.
begin;

do $wycofanie$
declare v_def text; n integer; r record;
begin
  for r in select * from (values
      ('public.akcja_bieg_panel(text)',
       $k$'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null, 'wynik_usuniety', u.wynik_usuniety_at is not null, 'wynik_usuniety_powod', u.wynik_usuniety_powod, 'do_sprawdzenia', to_jsonb(public.akcja_bieg_do_sprawdzenia(u)), 'do_weryfikacji', public.akcja_bieg_czeka_na_weryfikacje(u), 'weryfikacja', u.weryfikacja) order by u.numer)$k$,
       $k$'odznaka', u.odznaka, 'wycofany', u.wycofany_at is not null) order by u.numer)$k$),
      ('public.akcja_bieg_moi(text)',
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id), 'wynik_usuniety', u.wynik_usuniety_at is not null, 'wynik_usuniety_powod', u.wynik_usuniety_powod, 'do_weryfikacji', public.akcja_bieg_czeka_na_weryfikacje(u), 'weryfikacja', u.weryfikacja)$k$,
       $k$'wynik_trening_km', (select l.distance_km from public.training_logs l where l.id = u.wynik_log_id and l.athlete_id = u.konto_id))$k$),
      ('public.akcja_bieg_zalicz_recznie(uuid, numeric, integer)',
       $k$update public.akcja_bieg_uczestnicy set wynik_usuniety_at = null, wynik_usuniety_powod = null, wynik_usuniety_przez = null where id = u.id and wynik_usuniety_at is not null; perform public.akcja_bieg_wynik_powiadom(u); perform public.akcja_bieg_odznaka(u.id);$k$,
       $k$perform public.akcja_bieg_odznaka(u.id);$k$),
      ('public.akcja_bieg_dziecko_ukoncz(uuid, numeric)',
       $k$if u.wynik_usuniety_at is not null then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if; if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;$k$,
       $k$if v_faza not in ('trwa', 'wyniki') then return jsonb_build_object('ok', false, 'powod', 'poza_oknem', 'faza', v_faza); end if;$k$),
      ('public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)',
       $k$and u.wynik_dystans_km > 0;$k$,
       $k$and exists (select 1 from public.training_logs l where l.id = u.wynik_log_id and l.distance_km <= u.wynik_dystans_km + 0.49);$k$),
      ('public.akcja_bieg_wynik_do_rankingu(public.akcja_bieg_uczestnicy)',
       $k$select u.rodzaj = 'ja' and u.wynik_s is not null and u.wynik_dystans_km is not null and public.akcja_bieg_km_wyniku(u) <= u.wynik_dystans_km + 0.49 and coalesce(u.weryfikacja = 'zatwierdzony', not public.akcja_bieg_do_weryfikacji(u))$k$,
       $k$select public.akcja_bieg_wynik_z_zegarka(u) and u.wynik_dystans_km is not null$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$(x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) + 0.49) desc, coalesce(public.akcja_bieg_sekundy(x.duration) between x.distance_km * 180 and x.distance_km * 2160, false) desc,$k$,
       $k$(x.source is not distinct from 'intervals' and x.distance_km <= public.akcja_bieg_dystans_zaliczony(b.dystanse_km, x.distance_km) + 0.49) desc,$k$),
      ('public.akcja_bieg_wynik_z_treningu(uuid, uuid)',
       $k$if not found or u.rodzaj <> 'ja' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if; if exists (select 1 from public.akcja_bieg_uczestnicy x where x.bieg_id = u.bieg_id and x.konto_id = u.konto_id and x.rodzaj = 'ja' and x.wynik_usuniety_at is not null) then return jsonb_build_object('ok', false, 'powod', 'usuniety'); end if;$k$,
       $k$if not found or u.rodzaj <> 'ja' or u.wycofany_at is not null then return jsonb_build_object('ok', false, 'powod', 'nie_ma'); end if;$k$)
    ) as t(funkcja, nowe, stare)
  loop
    v_def := pg_get_functiondef(r.funkcja::regprocedure);
    n := (length(v_def) - length(replace(v_def, r.nowe, ''))) / length(r.nowe);
    if n <> 1 then raise exception '%: fragment z 20261206 wystąpił % razy (oczekiwano 1), nic nie zmieniam', r.funkcja, n; end if;
    execute replace(v_def, r.nowe, r.stare);
  end loop;
end $wycofanie$;

drop trigger akcja_bieg_weryfikacja_od_nowa on public.akcja_bieg_uczestnicy;
drop function public.akcja_bieg_weryfikacja_od_nowa();
drop function public.akcja_bieg_weryfikuj(uuid, text);
drop function public.akcja_bieg_usun_wynik(uuid, text);
drop function public.akcja_bieg_wynik_powiadom(public.akcja_bieg_uczestnicy);
drop function public.akcja_bieg_do_sprawdzenia(public.akcja_bieg_uczestnicy);
drop function public.akcja_bieg_czeka_na_weryfikacje(public.akcja_bieg_uczestnicy);
drop function public.akcja_bieg_do_weryfikacji(public.akcja_bieg_uczestnicy);
drop function public.akcja_bieg_km_wyniku(public.akcja_bieg_uczestnicy);
alter table public.akcja_bieg_uczestnicy drop column weryfikacja_przez, drop column weryfikacja_at, drop column weryfikacja,
  drop column wynik_usuniety_przez, drop column wynik_usuniety_powod, drop column wynik_usuniety_at;

commit;
notify pgrst, 'reload schema';
