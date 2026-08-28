CREATE TRIGGER trg_intake_updated_at BEFORE UPDATE ON public.athlete_intake_forms FOR EACH ROW EXECUTE FUNCTION update_intake_updated_at()
