CREATE OR REPLACE FUNCTION public.review_moment(p_moment_id uuid, p_action text, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_coach    uuid := auth.uid();
  v_athlete  uuid;
  v_coach_of uuid;
  v_status   text;
begin
  if not auth_is_coach() then raise exception 'Tylko trener'; end if;
  if p_action not in ('approve','reject') then raise exception 'Zła akcja: %', p_action; end if;
  if p_action = 'approve' and (p_text is null or btrim(p_text) = '') then raise exception 'Pusty tekst'; end if;

  select dm.athlete_id, dm.status, a.coach_id
    into v_athlete, v_status, v_coach_of
    from delivered_moments dm join athletes a on a.id = dm.athlete_id
   where dm.id = p_moment_id;

  if v_athlete is null then raise exception 'Moment nie istnieje'; end if;
  if v_coach_of is distinct from v_coach then raise exception 'Nie twój zawodnik'; end if;
  if v_status <> 'pending' then raise exception 'Już rozpatrzony (%)', v_status; end if;

  if p_action = 'approve' then
    update delivered_moments set status='approved', reviewed_by=v_coach, reviewed_at=now(), edited_text=p_text where id=p_moment_id;
    insert into notifications(athlete_id, type, message) values (v_athlete, 'moment', p_text);
  else
    update delivered_moments set status='rejected', reviewed_by=v_coach, reviewed_at=now(), edited_text=p_text where id=p_moment_id;
  end if;
end; $function$
