CREATE TRIGGER coaches_ensure_athlete_row AFTER INSERT ON public.coaches FOR EACH ROW EXECUTE FUNCTION ensure_coach_athlete_row()
