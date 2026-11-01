-- M3d (1.11.2026, projekt M3 v2 pkt 4/M3d): athletes.f6_runner_key — który biegacz w maszynie wyników (F6) to „ja".
-- Wybór z karty „Który to Ty?" w okienku (imiennicy). JEDYNY zapis w ścieżce moje_wyniki; model nie zapisuje.
--
-- Zapis WYŁĄCZNIE przez RPC public.ustaw_f6_runner_key(p_key) (SECURITY DEFINER, auth.uid()). authenticated ma dziś
-- tabelowy UPDATE na athletes (polityka athletes_update_own), więc nowa kolumna dziedziczyłaby zapis z przeglądarki —
-- kolumnowy REVOKE tego nie zdejmie (tabelowy grant wygrywa). Dlatego wyzwalacz: zmiana f6_runner_key poza RPC → 42501.
-- Odczyt: SELECT jest u nas nadawany na kolumny (migawka athletes) → jawny GRANT SELECT (f6_runner_key).
-- Format klucza jak w F6 search_runners: „<źródło>:<id>" (np. datasport:368751). Wycofanie: 20261101_WYCOFANIE_f6_runner_key.sql.
begin;

alter table public.athletes add column if not exists f6_runner_key text
  check (f6_runner_key is null or f6_runner_key ~ '^[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}$');

grant select (f6_runner_key) on public.athletes to authenticated;

create or replace function public.athletes_f6_klucz_tylko_rpc() returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.f6_runner_key is not null)
     or (tg_op = 'UPDATE' and new.f6_runner_key is distinct from old.f6_runner_key) then
    if coalesce(current_setting('biegamy.f6_rpc', true), '') <> '1' then
      raise exception 'f6_runner_key: zapis tylko przez ustaw_f6_runner_key()' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists athletes_f6_klucz_tylko_rpc on public.athletes;
create trigger athletes_f6_klucz_tylko_rpc before insert or update of f6_runner_key on public.athletes
  for each row execute function public.athletes_f6_klucz_tylko_rpc();

create or replace function public.ustaw_f6_runner_key(p_key text) returns void
  language plpgsql security definer
  set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'brak sesji' using errcode = '42501'; end if;
  if p_key is not null and p_key !~ '^[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}$' then
    raise exception 'zły klucz biegacza' using errcode = '22023';
  end if;
  perform set_config('biegamy.f6_rpc', '1', true);
  update public.athletes set f6_runner_key = p_key where user_id = auth.uid();
  perform set_config('biegamy.f6_rpc', '', true);
end $$;

revoke all on function public.ustaw_f6_runner_key(text) from public, anon;
grant execute on function public.ustaw_f6_runner_key(text) to authenticated;
revoke all on function public.athletes_f6_klucz_tylko_rpc() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'athletes' and column_name = 'f6_runner_key') then
    raise exception 'f6_runner_key: brak kolumny';
  end if;
  if has_function_privilege('anon', 'public.ustaw_f6_runner_key(text)', 'execute') then raise exception 'f6_runner_key: anon ma EXECUTE'; end if;
  if not has_function_privilege('authenticated', 'public.ustaw_f6_runner_key(text)', 'execute') then raise exception 'f6_runner_key: authenticated bez EXECUTE'; end if;
  if not has_column_privilege('authenticated', 'public.athletes', 'f6_runner_key', 'select') then raise exception 'f6_runner_key: brak SELECT'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'athletes_f6_klucz_tylko_rpc' and not tgisinternal) then raise exception 'f6_runner_key: brak wyzwalacza'; end if;
end $$;

commit;
