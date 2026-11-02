CREATE OR REPLACE FUNCTION public.achievements_okno()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_dzis date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if not exists (select 1 from public.odznaki_okna where badge_id = new.badge_id) then return new; end if;
  if exists (
    select 1 from public.odznaki_okna o left join public.akcje a on a.id = o.akcja_id
     where o.badge_id = new.badge_id
       and ( (o.akcja_id is null and v_dzis >= o.od and v_dzis <= coalesce(o."do", v_dzis))
          or (o.akcja_id is not null and a.wystartowala_at is not null and v_dzis >= a.start
              and (a.koniec is null or v_dzis <= a.koniec)
              and (not a.testowa or new.athlete_id = any(coalesce(a.konta_testowe, '{}'::uuid[])))) )
  ) then return new; end if;
  return null;   -- poza oknem: pominięte po cichu (patrz nagłówek)
end $function$
