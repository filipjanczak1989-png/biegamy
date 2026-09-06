CREATE TRIGGER trg_training_logs_guard_coach_fields BEFORE UPDATE ON public.training_logs FOR EACH ROW EXECUTE FUNCTION training_logs_guard_coach_fields()
