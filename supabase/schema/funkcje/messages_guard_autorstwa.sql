CREATE OR REPLACE FUNCTION public.messages_guard_autorstwa()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  uid uuid := auth.uid();
  autor boolean;
  zmienione text[] := '{}';
begin
  -- Brak JWT => service_role albo SQL admina.
  if uid is null then return new; end if;

  -- AUTOREM jest ten, kto ma role zgodna z `sender` tego wiersza.
  select (old.sender = 'athlete' and exists (select 1 from athletes a
            where a.id = old.athlete_id and a.user_id = uid))
      or (old.sender = 'coach' and exists (select 1 from athletes a
            where a.id = old.athlete_id and a.coach_id = uid))
    into autor;

  -- TOZSAMOSC WIADOMOSCI jest nietykalna dla obu stron. `sender` w szczegolnosci:
  -- jego podmiana przepisalaby autorstwo calej wiadomosci jednym UPDATE-em.
  if new.id         is distinct from old.id         then zmienione := array_append(zmienione, 'id'); end if;
  if new.athlete_id is distinct from old.athlete_id then zmienione := array_append(zmienione, 'athlete_id'); end if;
  if new.sender     is distinct from old.sender     then zmienione := array_append(zmienione, 'sender'); end if;
  if new.sent_at    is distinct from old.sent_at    then zmienione := array_append(zmienione, 'sent_at'); end if;

  -- TRESC — tylko autor. To jest cala tresc tej migracji.
  if new.body is distinct from old.body and not autor then
    zmienione := array_append(zmienione, 'body');
  end if;

  -- `read` ZOSTAJE WOLNE i to jest swiadome: oznacza je ODBIORCA, czyli zawsze
  -- na CUDZYM wierszu. RLS juz sprawdzil, ze ma dostep do tej rozmowy.

  if array_length(zmienione, 1) is null then return new; end if;

  raise exception 'W cudzej wiadomosci wolno oznaczyc tylko przeczytanie. Odrzucone: %',
                  array_to_string(zmienione, ', ')
    using errcode = '42501',
          hint = 'Wlasna wiadomosc mozesz cofnac; cudzej nie zmieniasz.';
end;
$function$
