-- 20261105_impreza_do_races.sql — KALENDARZ etap 1 (Filip 3.11 02:31): karta imprezy z maszyny wyników → „Wezmę udział”.
--   Impreza z kalendarza maszyny trafia do `races` JEDNYM RPC (jak K5/event_propose: klucz imprezy + nazwa + data ±1 + miasto — bez duplikatów),
--   potem zwykły zapis (race_signups / cel startowy) jak dla naszej. Po zapisie karta „przechodzi w naszą” (scal w js/kalendarz-lista.mjs:
--   nasza wygrywa) i PRZEJMUJE OKŁADKĘ z imprezy_okladki (cover_url ustawiony od razu → race-image nie generuje drugiej).
--   * races.impreza_klucz — stały klucz imprezy w maszynie (zNaszego czytał tę kolumnę od 2.11, choć jej nie było — martwe pole);
--   * klucz_nazwy_imprezy(text) — SQL-owy odpowiednik BM_KALENDARZ.kluczNazwy (bez znaków, bez numerów edycji na końcach, same litery);
--   * impreza_do_races(...) — SECURITY DEFINER: zawodnik (auth_my_athlete_id) albo trener (coaches.id = auth.uid()); status 'approved'
--     (impreza z kalendarza jest zweryfikowana przez maszynę); zwraca {id, istniala}. Zapis na bieg robi klient osobno (RLS signups_insert).
-- Test po skutku: tools/impreza-do-races-test.sh. Wycofanie: 20261105_WYCOFANIE_impreza_do_races.sql.
begin;

alter table public.races add column impreza_klucz text
  check (impreza_klucz is null or impreza_klucz ~ '^(kalendarz|biegamy|wyniki|zgloszenie):[A-Za-z0-9:._-]{1,120}$');
create index races_impreza_klucz on public.races (impreza_klucz) where impreza_klucz is not null;

create or replace function public.klucz_nazwy_imprezy(p text)
returns text language plpgsql immutable strict
set search_path = public, pg_temp
as $fn$
declare w text[]; n int;
  zbedne constant text := '^([0-9]+|edycja|edycji|jubileuszowy|jubileuszowa|i|x|v|m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3}))$';
begin
  -- jak BM_KALENDARZ.kluczNazwy: bez znaków, tokeny; z OBU końców zdejmuj numerację edycji (rzymska, arabska, „edycja”, „jubileuszowy”),
  -- dopóki zostaje więcej niż jeden token; potem same litery
  w := array_remove(regexp_split_to_array(regexp_replace(lower(translate(p, 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ', 'acelnoszzacelnoszz')), '[^a-z0-9]+', ' ', 'g'), ' '), '');
  while coalesce(array_length(w, 1), 0) > 1 and (w[1] ~ zbedne and (length(w[1]) > 1 or w[1] in ('i', 'x', 'v'))) loop w := w[2:]; end loop;
  while coalesce(array_length(w, 1), 0) > 1 loop
    n := array_length(w, 1);
    exit when not (w[n] ~ zbedne and (length(w[n]) > 1 or w[n] in ('i', 'x', 'v')));
    w := w[1:n - 1];
  end loop;
  return regexp_replace(array_to_string(w, ''), '[^a-z]', '', 'g');
end $fn$;

create function public.impreza_do_races(p_klucz text, p_nazwa text, p_data date, p_miasto text, p_dystans numeric, p_url text, p_okladka text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $fn$
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
end $fn$;

revoke all on function public.klucz_nazwy_imprezy(text) from public, anon;
grant execute on function public.klucz_nazwy_imprezy(text) to authenticated;
revoke all on function public.impreza_do_races(text, text, date, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.impreza_do_races(text, text, date, text, numeric, text, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.impreza_do_races(text, text, date, text, numeric, text, text)', 'EXECUTE') then raise exception 'impreza_do_races: anon'; end if;
  if not has_function_privilege('authenticated', 'public.impreza_do_races(text, text, date, text, numeric, text, text)', 'EXECUTE') then raise exception 'impreza_do_races: authenticated'; end if;
  if public.klucz_nazwy_imprezy('XII Bieg Niepodległości 2026') <> 'biegniepodleglosci' or public.klucz_nazwy_imprezy('12. Bieg Niepodległości') <> 'biegniepodleglosci'
     or public.klucz_nazwy_imprezy('Bieg Niepodległości – XIII edycja') <> 'biegniepodleglosci' or public.klucz_nazwy_imprezy('VI Nocny Bieg Nyski') <> 'nocnybiegnyski'
     or public.klucz_nazwy_imprezy('Bieg i Marsz Pamięci') <> 'biegimarszpamieci' then
    raise exception 'klucz_nazwy_imprezy: rozjazd z BM_KALENDARZ.kluczNazwy (blizna-108)';
  end if;
  if has_column_privilege('anon', 'public.races', 'impreza_klucz', 'SELECT') then raise exception 'races.impreza_klucz: anon'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
