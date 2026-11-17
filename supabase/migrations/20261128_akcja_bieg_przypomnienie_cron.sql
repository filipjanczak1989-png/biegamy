-- 20261128_akcja_bieg_przypomnienie_cron.sql — BIEG, ETAP 2: wołanie EF bieg-przypomnienie (jeden e-mail „zostały 3 dni”) rano. Zmienione 17.11 przed uruchomieniem (bieg 19 dni, 20261207).
--   Kolejność: 20261126_akcja_bieg_wyniki.sql → 20261201_akcja_bieg_mail_ponowienie.sql → 20261207_akcja_bieg_okno_19_dni.sql → deploy EF bieg-przypomnienie → próba z ?test=1 (lista bez wysyłki) → dopiero ten plik.
--   Codziennie 7:00, 7:20, 7:40 UTC = 8:00–8:40 czasu polskiego zimą (pg_cron liczy w UTC). Kiedy wolno wysyłać, decyduje baza (akcja_bieg_do_przypomnienia po 20261207):
--   3 dni przed końcem biegu od 8:00, zaległe następnego dnia, najwyżej 90 wiadomości na dobę z logu wysyłek; poza tym funkcja dostaje pustą listę.
--   Sekret jak przy akcja-push (vault push_hook_secret = PUSH_HOOK_SECRET w EF). Wycofanie: 20261128_WYCOFANIE_akcja_bieg_przypomnienie_cron.sql.
--   timeout_milliseconds 150000 (14.11): domyślne 5000 w pg_net 0.20.0 (sygnatura z katalogu produkcji) jest krótsze niż wywołanie (do ~110 s + ostatni odbiorca);
--   wynik wysyłki zapisuje baza (akcja_bieg_maile), odpowiedź do pg_net służy tylko do podglądu w net._http_response.
begin;
select cron.schedule('akcja-bieg-przypomnienie', '0,20,40 7 * * *', $job$
  select net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/bieg-przypomnienie',
    headers := jsonb_build_object('Content-Type','application/json',
               'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000);
$job$);
commit;
