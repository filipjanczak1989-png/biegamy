CREATE TRIGGER wz_data_nie_z_przyszlosci BEFORE INSERT OR UPDATE ON public.wyniki_zgloszone FOR EACH ROW EXECUTE FUNCTION wz_data_nie_z_przyszlosci()
