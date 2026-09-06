CREATE TRIGGER trg_trainings_guard_coach_plan BEFORE UPDATE ON public.trainings FOR EACH ROW EXECUTE FUNCTION trainings_guard_coach_plan()
