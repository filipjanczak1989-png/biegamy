-- ODZNAKI CHRONIONE (21.11.2026, odznaki O1; decyzja Filipa). Odznaki, których nie da się wyliczyć z własnych danych, nadaje wyłącznie baza:
--   bieg-*                  akcja_bieg_odznaka (ukończenie biegu)        akcja-sponsor     akcja_deklaruj (deklaracja sponsora)
--   pierwsza_z_pierwszych   migracja danych (pierwsze 50 kont)           pionier_biegamy   migracja danych (zamiana pierwszej z pierwszych)
-- Wyzwalacz achievements_chronione BEFORE INSERT: dla ról authenticated i anon taki wiersz jest POMIJANY PO CICHU (return null), nie odrzucany
-- błędem — klient wstawia odznaki paczką (upsert), a wyjątek na jednym wierszu wywróciłby całą paczkę; ten sam wzorzec co achievements_okno.
-- Upsert z .select() oddaje tylko wstawione, więc klient nie pokaże pop-upu ani nie wyśle powiadomienia za pominiętą. Reszta odznak bez zmian.
-- Funkcja celowo BEZ security definer: sprawdza current_user (definer: akcja_bieg_odznaka, akcja_deklaruj, migracje — właściciel postgres;
-- service_role) i ich nie zatrzymuje. Nazwa przed achievements_okno (kolejność alfabetyczna) — chroniony wiersz nie dochodzi do okna.
-- Bez danych: istniejące odznaki bez zmian. Test po skutku: tools/odznaki-chronione-test.sh (przed wdrożeniem ODZNAKI_CHRONIONE_Z_MIGRACJA=1).
-- Wycofanie: 20261223_WYCOFANIE_achievements_chronione.sql.
begin;

do $straz$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.achievements'::regclass and tgname = 'achievements_chronione') then
    raise exception 'wyzwalacz achievements_chronione już jest: migracja 20261223 weszła wcześniej'; end if;
end $straz$;

create function public.achievements_chronione()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.badge_id like 'bieg-%' or new.badge_id in ('akcja-sponsor', 'pierwsza_z_pierwszych', 'pionier_biegamy') then return null; end if;
  return new;
end $function$;
revoke all on function public.achievements_chronione() from public, anon, authenticated;
comment on function public.achievements_chronione() is 'Odznaki chronione (20261223): z przeglądarki (authenticated/anon) bieg-*, akcja-sponsor, pierwsza_z_pierwszych, pionier_biegamy pomijane po cichu; definer i service_role przechodzą.';

create trigger achievements_chronione
  before insert on public.achievements
  for each row execute function public.achievements_chronione();

commit;
