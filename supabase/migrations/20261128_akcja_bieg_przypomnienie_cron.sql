-- 20261128_akcja_bieg_przypomnienie_cron.sql — BIEG, ETAP 2: wołanie EF bieg-przypomnienie (e-mail przed biegiem) rano i wieczorem.
--   Kolejność: 20261126_akcja_bieg_wyniki.sql → 20261201_akcja_bieg_mail_ponowienie.sql → deploy EF bieg-przypomnienie → próba z ?test=1 (lista bez wysyłki) → dopiero ten plik.
--   Codziennie 7:00, 7:20, 7:40 i 17:00, 17:20, 17:40 UTC = 8:00–8:40 i 18:00–18:40 czasu polskiego zimą (pg_cron liczy w UTC). Kiedy wolno wysyłać, decyduje baza
--   (akcja_bieg_do_przypomnienia): dwa dni przed startem od 18:00, dzień przed startem od 8:00, najwyżej 90 wiadomości na dobę z logu wysyłek; poza tym funkcja dostaje pustą listę.
--   Sekret jak przy akcja-push (vault push_hook_secret = PUSH_HOOK_SECRET w EF). Wycofanie: 20261128_WYCOFANIE_akcja_bieg_przypomnienie_cron.sql.
--   timeout_milliseconds 150000 (14.11): domyślne 5000 w pg_net 0.20.0 (sygnatura z katalogu produkcji) jest krótsze niż wywołanie (do ~110 s + ostatni odbiorca);
--   wynik wysyłki zapisuje baza (akcja_bieg_maile), odpowiedź do pg_net służy tylko do podglądu w net._http_response.
begin;
select cron.schedule('akcja-bieg-przypomnienie', '0,20,40 7,17 * * *', $job$
  select net.http_post(
    url     := 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1/bieg-przypomnienie',
    headers := jsonb_build_object('Content-Type','application/json',
               'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000);
$job$);
commit;
