CREATE OR REPLACE FUNCTION public.wz_guard_systemowe()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare zm text[] := '{}';
begin
  if coalesce(current_setting('biegamy.wz_rpc', true), '') = '1' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.athlete_id is distinct from old.athlete_id then zm := array_append(zm, 'athlete_id'); end if;
    if new.zrodlo is distinct from old.zrodlo then zm := array_append(zm, 'zrodlo'); end if;
    if new.wpisal_user_id is distinct from old.wpisal_user_id then zm := array_append(zm, 'wpisal_user_id'); end if;
    if new.stan is distinct from old.stan then zm := array_append(zm, 'stan'); end if;
    if new.oficjalny_result_id is distinct from old.oficjalny_result_id or new.oficjalny_czas_s is distinct from old.oficjalny_czas_s
       or new.roznica_pct is distinct from old.roznica_pct or new.dopasowano_at is distinct from old.dopasowano_at then zm := array_append(zm, 'oficjalny_*'); end if;
  elsif new.stan <> 'zgloszony' or new.oficjalny_result_id is not null or new.oficjalny_czas_s is not null or new.roznica_pct is not null or new.dopasowano_at is not null then
    zm := array_append(zm, 'oficjalny_*');
  end if;
  if array_length(zm, 1) is null then return new; end if;
  raise exception 'wyniki_zgloszone: kolumny systemowe tylko przez wynik_zgloszony_dopasuj(). Odrzucone: %', array_to_string(zm, ', ') using errcode = '42501';
end $function$
