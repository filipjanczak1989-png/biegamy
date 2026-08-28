CREATE TRIGGER trg_can_updated_at BEFORE UPDATE ON public.coach_athlete_notes FOR EACH ROW EXECUTE FUNCTION update_can_updated_at()
