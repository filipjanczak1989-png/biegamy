CREATE OR REPLACE FUNCTION public.impreza_do_races(p_klucz text, p_nazwa text, p_data date, p_miasto text, p_dystans numeric, p_url text, p_okladka text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ath uuid; v_trener boolean; v_nazwa text; v_miasto text; v_klucz text; v_knazwy text; v_kmiasta text; v_url text; v_okladka text; r public.races;
begin
  if auth.uid() is null then raise exception 'impreza_do_races: tylko zalogowani' using errcode = '42501'; end if;
  v_ath := public.auth_my_athlete_id();
  v_trener := exists (select 1 from public.coaches c where c.id = auth.uid());
  if v_ath is null and not v_trener then raise exception 'impreza_do_races: brak profilu' using errcode = '42501'; end if;

  v_nazwa := regexp_replace(btrim(coalesce(p_nazwa, '')), '\s+', ' ', 'g');
  if char_length(v_nazwa) < 3 or char_length(v_nazwa) > 200 then raise exception 'impreza_do_races: nazwa' using errcode = '22023'; end if;
  if p_data is null or p_data < current_date - 1 or p_data > current_date + 730 then raise exception 'impreza_do_races: data' using errcode = '22023'; end if;
  v_miasto := nullif(regexp_replace(btrim(coalesce(p_miasto, '')), '\s+', ' ', 'g'), '');
  if char_length(coalesce(v_miasto, '')) > 80 then raise exception 'impreza_do_races: miasto' using errcode = '22023'; end if;
  if p_dystans is not null and (p_dystans < 0.5 or p_dystans > 400) then raise exception 'impreza_do_races: dystans' using errcode = '22023'; end if;
  v_klucz := nullif(btrim(coalesce(p_klucz, '')), '');
  if v_klucz is not null and v_klucz !~ '^(kalendarz|biegamy|wyniki|zgloszenie):[A-Za-z0-9:._-]{1,120}$' then raise exception 'impreza_do_races: klucz' using errcode = '22023'; end if;
  v_url := nullif(btrim(coalesce(p_url, '')), '');
  if v_url is not null and (char_length(v_url) > 500 or v_url !~ '^https://[^\s''"<>]+$') then v_url := null; end if;   -- link tylko https, inaczej pomijamy
  v_okladka := nullif(btrim(coalesce(p_okladka, '')), '');
  if v_okladka is not null and v_okladka !~ '^https://afqojgkaveykxbltxzwm\.supabase\.co/storage/v1/object/public/race-covers/impreza-[0-9a-f]{40}\.jpg(\?v=\d+)?$' then v_okladka := null; end if;

  v_knazwy := public.klucz_nazwy_imprezy(v_nazwa);
  v_kmiasta := regexp_replace(lower(translate(coalesce(v_miasto, ''), 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 'acelnoszzacelnoszz')), '[^a-z]', '', 'g');

  -- bez duplikatów: ten sam klucz imprezy ALBO ta sama nazwa (klucz) + data ±1 + miasto zgodne (dzielnica = to samo miasto; brak miasta = zgodne)
  select * into r from public.races x
   where x.status in ('approved', 'pending')
     and ((v_klucz is not null and x.impreza_klucz = v_klucz)
       or (x.date between p_data - 1 and p_data + 1 and v_knazwy <> '' and public.klucz_nazwy_imprezy(x.name) = v_knazwy
           and (v_kmiasta = '' or x.city is null
                or regexp_replace(lower(translate(x.city, 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 'acelnoszzacelnoszz')), '[^a-z]', '', 'g') like v_kmiasta || '%'
                or v_kmiasta like regexp_replace(lower(translate(x.city, 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 'acelnoszzacelnoszz')), '[^a-z]', '', 'g') || '%')))
   order by (x.impreza_klucz = v_klucz) desc nulls last, x.status = 'approved' desc, x.created_at
   limit 1;
  if found then
    update public.races set impreza_klucz = coalesce(impreza_klucz, v_klucz), url_organizer = coalesce(url_organizer, v_url), cover_url = coalesce(cover_url, v_okladka)
     where id = r.id;
    return jsonb_build_object('id', r.id, 'istniala', true, 'status', r.status);
  end if;

  insert into public.races (name, date, distance_km, city, url_organizer, status, added_by, signup_count, impreza_klucz, cover_url)
  values (v_nazwa, p_data, p_dystans, v_miasto, v_url, 'approved', v_ath, 0, v_klucz, v_okladka)
  returning * into r;
  return jsonb_build_object('id', r.id, 'istniala', false, 'status', r.status);
end $function$
