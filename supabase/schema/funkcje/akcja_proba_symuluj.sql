CREATE OR REPLACE FUNCTION public.akcja_proba_symuluj(p_km numeric, p_proc integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare CEL_ZL constant numeric := 100000; a public.akcje;
begin
  if auth.uid() is null or not public.auth_is_coach() then raise exception 'akcja_proba_symuluj: tylko trener' using errcode = '42501'; end if;
  select * into a from public.akcje where slug = 'proba' and testowa for update;
  if not found then raise exception 'akcja_proba_symuluj: brak akcji próbnej' using errcode = 'P0002'; end if;
  if p_km is not null and (p_km < 0 or p_km > a.cel_km) then raise exception 'akcja_proba_symuluj: km poza zakresem' using errcode = '22023'; end if;
  if p_proc is not null and (p_proc < 0 or p_proc > 100) then raise exception 'akcja_proba_symuluj: procent poza zakresem' using errcode = '22023'; end if;
  update public.akcje set proba_sym_km = p_km where id = a.id;
  if p_proc is not null then
    insert into public.akcja_ulica (akcja_slug, kwota_zl, cel_zl) values ('proba', CEL_ZL * p_proc / 100, CEL_ZL)
    on conflict (akcja_slug) do update set kwota_zl = excluded.kwota_zl, cel_zl = excluded.cel_zl;
  end if;
  return public.akcja_sciezka_stan();
end $function$
