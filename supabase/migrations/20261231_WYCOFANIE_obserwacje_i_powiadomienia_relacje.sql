-- 20261231_WYCOFANIE_obserwacje_i_powiadomienia_relacje.sql — powrót polityk follows (odczyt) i notifications (wstawianie) do stanu sprzed 20261231.
-- Funkcja obserwujacy_liczba ZOSTAJE: front (profil.html) pyta o nią, a sama liczba niczego nie odsłania. powiadomienie_relacja znika (stare polityki jej nie używają).
-- Uruchomienie (ręcznie, ścieżka bezwzględna):
--   supabase db query --linked --workdir ~/.cache/sb-audit -f "$PWD/supabase/migrations/20261231_WYCOFANIE_obserwacje_i_powiadomienia_relacje.sql"

begin;

create temp table if not exists _e1_wycofanie (komunikat text) on commit drop;
truncate _e1_wycofanie;
insert into _e1_wycofanie
select case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'follows' and policyname = 'follows_select_relacja')
            then 'E1 wycofane: polityki jak przed 20261231'
            else 'E1 nie było wdrożone: polityki postawione jak przed 20261231 (bez zmiany zasad)' end;

drop policy if exists follows_select_relacja on public.follows;
drop policy if exists select_follows on public.follows;
create policy select_follows on public.follows for select to public using (auth.uid() is not null);

drop policy if exists notifications_insert_relacja on public.notifications;
drop policy if exists notifications_insert_authenticated on public.notifications;
create policy notifications_insert_authenticated on public.notifications for insert to authenticated
  with check (
    (athlete_id in (select athletes.id from public.athletes where athletes.coach_id = auth.uid()))
    or (from_athlete_id in (select athletes.id from public.athletes where athletes.user_id = auth.uid()))
    or ((from_athlete_id is null) and (athlete_id = (select athletes.id from public.athletes where athletes.user_id = auth.uid() limit 1)))
  );

drop function if exists public.powiadomienie_relacja(uuid, uuid, text);

notify pgrst, 'reload schema';

select komunikat from _e1_wycofanie;
commit;
