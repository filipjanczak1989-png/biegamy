-- WYCOFANIE 20261212_akcja_bieg_wynik_bez_treningu.sql: triggery na training_logs, funkcje i indeks skasowane; zachowanie jak przed migracją (SET NULL z klucza obcego).
-- Wyników wyczyszczonych przez migrację i triggery nie przywraca: nie miały treningu (to była usterka); automat może wziąć inny pasujący trening.
begin;

drop trigger if exists trg_akcja_bieg_trening_usuniety on public.training_logs;
drop trigger if exists trg_akcja_bieg_trening_zmieniony on public.training_logs;
drop function public.akcja_bieg_trening_usuniety();
drop function public.akcja_bieg_trening_zmieniony();
drop function public.akcja_bieg_wiszace_wyczysc();
drop function public.akcja_bieg_wynik_wyczysc(uuid);
drop index if exists public.akcja_bieg_uczestnicy_wynik_log_idx;

commit;
notify pgrst, 'reload schema';
