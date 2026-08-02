-- ZAPIS HISTORII — nie uruchamiać.
-- Odtwarza stan już obecny na produkcji (wykonane ręcznie 2026-07-31).
--
-- Widok public_athletes — publiczny profil zawodnika, Faza 1.
--
-- Cel: wylogowany otwiera profil.html?id=<uuid> i widzi tożsamość zawodnika
-- (imię, awatar, cele, życiówki) plus CTA rejestracji. Treningi zostają za
-- logowaniem — to Faza 2.
--
-- Widok JEST granicą bezpieczeństwa: WHERE is_public = true plus wąska lista
-- kolumn. Anon NIE ma i nie może mieć SELECT na tabeli athletes (42501).
--
-- security_invoker = off jest tu ŚWIADOME: widok ma czytać athletes prawami
-- właściciela, bo anon nie ma dostępu do tabeli bazowej. Linter Supabase
-- oznaczy to jako security_definer_view — to OCZEKIWANE, tak samo jak przy
-- public_training_logs. Granicą jest WHERE + wąski grant, nie RLS wywołującego.
--
-- Wykonane ręcznie na produkcji 2026-07-31; ten plik odtwarza stan zastany.

CREATE OR REPLACE VIEW public.public_athletes
WITH (security_invoker = off) AS
  SELECT id,
         full_name,
         avatar_url,
         goal,
         race_goals,
         pb_marathon,
         pb_half,
         pb_10k,
         pb_5k
  FROM public.athletes
  WHERE is_public = true;

-- Domyślne uprawnienia w tym projekcie potrafią nadać anon komplet praw przy
-- CREATE (pg_default_acl), więc najpierw odbieramy wszystko, potem nadajemy
-- dokładnie tyle, ile trzeba.
REVOKE ALL ON public.public_athletes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_athletes TO anon, authenticated;

-- Weryfikacja empiryczna (SET ROLE anon): SELECT z widoku = OK,
-- INSERT/UPDATE/DELETE = 42501, SELECT z athletes = 42501,
-- kolumny spoza whitelisty = 42703.
