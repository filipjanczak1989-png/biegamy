CREATE TRIGGER trg_detect_moment_ins AFTER INSERT ON public.training_logs REFERENCING NEW TABLE AS nowe FOR EACH STATEMENT EXECUTE FUNCTION trigger_detect_moment()
