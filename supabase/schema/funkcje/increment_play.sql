CREATE OR REPLACE FUNCTION public.increment_play(p_track_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE radio_tracks SET play_count = play_count + 1 WHERE id = p_track_id;
  BEGIN
    IF auth.uid() IS NOT NULL THEN
      INSERT INTO radio_plays(track_id, user_id) VALUES (p_track_id, auth.uid())
      ON CONFLICT (user_id, track_id, played_day) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$
