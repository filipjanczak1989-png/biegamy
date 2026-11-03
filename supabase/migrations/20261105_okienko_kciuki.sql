-- 20261105_okienko_kciuki.sql — KCIUKI 👍/👎 pod odpowiedzią Okienka v2 (Filip 3.11, „stały rytm uczenia” pkt 1) + skrót odpowiedzi w logu
--   (raport poranny i sędzia czytają pytanie → ścieżkę → odpowiedź; dotąd log miał tylko pytanie).
--   * okienko_v2_log + komentarz (≤ 300, po 👎, opcjonalny) + odpowiedz (≤ 400, skrót zdań; pisze EF service);
--   * RPC okienko_ocena(p_id, p_ocena, p_komentarz): właściciel wpisu (athletes.user_id = auth.uid()) ocenia SWÓJ wpis z ostatnich 24 h;
--     nic innego w logu nie zmienia (authenticated nadal bez UPDATE na tabeli — blizna E0 „właściciel nie zmienia logu wprost”).
-- Wycofanie: 20261105_WYCOFANIE_okienko_kciuki.sql. Test: OK_Z_MIGRACJA=1 bash tools/okienko-kciuki-test.sh (7 asercji, transakcja wycofana).
begin;

alter table public.okienko_v2_log
  add column if not exists komentarz text check (komentarz is null or char_length(komentarz) <= 300),
  add column if not exists odpowiedz text check (odpowiedz is null or char_length(odpowiedz) <= 400);
comment on column public.okienko_v2_log.komentarz is 'kciuki (3.11): komentarz zawodnika po 👎, przez RPC okienko_ocena';
comment on column public.okienko_v2_log.odpowiedz is 'skrót odpowiedzi (zdania, bez kart/źródeł) — raport poranny i sędzia; pisze EF';

create or replace function public.okienko_ocena(p_id bigint, p_ocena smallint, p_komentarz text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_ocena is null or p_ocena not in (-1, 1) then raise exception 'ocena musi być -1 albo 1' using errcode = 'check_violation'; end if;
  update public.okienko_v2_log l
     set ocena = p_ocena, komentarz = case when p_ocena = -1 and p_komentarz is not null and btrim(p_komentarz) <> '' then left(btrim(p_komentarz), 300) else null end
   where l.id = p_id and l.kiedy > now() - interval '24 hours'
     and exists (select 1 from public.athletes a where a.id = l.athlete_id and a.user_id = auth.uid());
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.okienko_ocena(bigint, smallint, text) from public, anon;
grant execute on function public.okienko_ocena(bigint, smallint, text) to authenticated;

-- ── asercje ──
do $$
begin
  if has_table_privilege('authenticated', 'public.okienko_v2_log', 'UPDATE') then raise exception 'okienko_v2_log: authenticated ma UPDATE — ocena ma iść tylko przez RPC'; end if;
  if has_function_privilege('anon', 'public.okienko_ocena(bigint, smallint, text)', 'EXECUTE') then raise exception 'okienko_ocena: anon wykonuje'; end if;
  if not has_function_privilege('authenticated', 'public.okienko_ocena(bigint, smallint, text)', 'EXECUTE') then raise exception 'okienko_ocena: authenticated nie wykonuje'; end if;
end $$;

notify pgrst, 'reload schema';
commit;
