-- Test po skutku 20261128 (cron akcja-bieg-przypomnienie: EF bieg-przypomnienie rano, jeden e-mail 3 dni przed końcem biegu). W transakcji z .sh, zawsze wycofanej.
-- Tylko odczyt cron.job, vault (sama liczba sekretów) i akcja_bieg_do_przypomnienia (same liczby, bez adresów). Nic nie woła funkcji.
do $test$
declare n int := 0; j record; c text; v_o jsonb; v_tz text;
begin
  -- 1. dokładnie jedno zadanie, właściwy plan, aktywne
  if (select count(*) from cron.job where jobname = 'akcja-bieg-przypomnienie') <> 1 then raise exception 'FAIL 1: zadań akcja-bieg-przypomnienie: % (oczekiwano 1)', (select count(*) from cron.job where jobname = 'akcja-bieg-przypomnienie'); end if;
  select * into j from cron.job where jobname = 'akcja-bieg-przypomnienie';
  if j.schedule <> '0,20,40 7 * * *' or not j.active then raise exception 'FAIL 1b: plan % / aktywne %', j.schedule, j.active; end if;
  n := n + 2;

  -- 2. polecenie: prawdziwa funkcja (bez ?test=1), sekret z vault, czas 150 s, nic więcej
  c := j.command;
  if position('/functions/v1/bieg-przypomnienie''' in c) = 0 or position('?test' in c) > 0 then raise exception 'FAIL 2a: adres funkcji w poleceniu'; end if;
  if position('vault.decrypted_secrets where name = ''push_hook_secret''' in c) = 0 or position('x-push-secret' in c) = 0 then raise exception 'FAIL 2b: sekret nie z vault'; end if;
  if position('timeout_milliseconds := 150000' in c) = 0 then raise exception 'FAIL 2c: brak timeout 150 s'; end if;
  if (select count(*) from cron.job where command ilike '%bieg-przypomnienie%') <> 1 then raise exception 'FAIL 2d: inne zadanie też woła bieg-przypomnienie'; end if;
  if (select count(*) from vault.decrypted_secrets where name = 'push_hook_secret') <> 1 then raise exception 'FAIL 2e: brak sekretu push_hook_secret w vault'; end if;
  n := n + 5;

  -- 3. strefa crona: UTC/GMT (7:00 UTC = 8:00 w Polsce zimą)
  v_tz := coalesce(current_setting('cron.timezone', true), 'GMT');
  if upper(v_tz) not in ('GMT', 'UTC', 'ETC/UTC', 'ETC/GMT') then raise exception 'FAIL 3: cron.timezone = % (plan liczony w UTC)', v_tz; end if;
  n := n + 1;

  -- 4. kogo wybierze baza: dziś nikogo (próba posprzątana, prawdziwy bieg kończy się 6.12); 3.12 przed 8:00 nikogo; 3.12 o 8:05 tylko bieg-mikolajki
  if jsonb_array_length(public.akcja_bieg_do_przypomnienia()) <> 0 then raise exception 'FAIL 4a: już dziś są odbiorcy (posprzątaj próbę: 06-sprzatanie.sql)'; end if;
  if exists (select 1 from public.akcja_biegi where slug = 'proba-bieg' and status <> 'szkic') then raise exception 'FAIL 4b: proba-bieg nie w szkicu (cron wysłałby próbie)'; end if;
  if exists (select 1 from public.akcja_biegi where slug = 'bieg-mikolajki') then
    if jsonb_array_length(public.akcja_bieg_do_przypomnienia(timestamptz '2026-12-03 07:05 Europe/Warsaw', 90)) <> 0 then raise exception 'FAIL 4c: 3.12 przed 8:00 są odbiorcy'; end if;
    v_o := public.akcja_bieg_do_przypomnienia(timestamptz '2026-12-03 08:05 Europe/Warsaw', 90);
    if jsonb_array_length(v_o) = 0 or exists (select 1 from jsonb_array_elements(v_o) x where x->>'slug' <> 'bieg-mikolajki' or x->>'koniec_godz' is distinct from '20:00' or (x->>'dni_do_konca')::int <> 3) then
      raise exception 'FAIL 4d: 3.12 o 8:05 brak odbiorców albo inny bieg / godzina / dni'; end if;
    raise notice 'bieg-mikolajki: 3.12 o 8:05 odbiorców %', jsonb_array_length(v_o);
    n := n + 2;
  end if;
  n := n + 2;

  raise exception 'TESTY CRONA PRZYPOMNIENIA ZIELONE: % sprawdzeń', n;
end $test$;
