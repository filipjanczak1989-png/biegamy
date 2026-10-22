# Podgląd API wyników (api.biegamy.run) przed U3

Wyszukiwarka wyników w `races.html` i strona `usun-dane.html` korzystają z serwera wyników tylko wtedy, gdy
`WYNIKI_API_WLACZONE = true` w `js/wyniki-api.js` (decyzja U3, B8). Do tego czasu na prod sekcja wyszukiwarki
jest ukryta, a `usun-dane.html` pokazuje „usługa niedostępna”.

Do sprawdzenia na prawdziwym `https://biegamy.run` (CORS API przepuszcza tylko ten adres) jest **lokalny przełącznik
jednej przeglądarki**. Działa wyłącznie na prod, nigdy na froncie testowym. W kodzie nie ma żadnych kont, UUID ani adresów.
Gdy jest włączony, sekcja i strona pokazują pasek „Tryb podglądu API”.

## Włączenie i wyłączenie (konsola przeglądarki na https://biegamy.run, DevTools → Console)

```js
localStorage.setItem('wyniki_api_podglad', '1'); location.reload()
```

```js
localStorage.removeItem('wyniki_api_podglad'); location.reload()
```

Klucz dotyczy tylko tej przeglądarki i tego profilu. Nie jest sekretem i nie daje żadnych uprawnień: API nadal wymaga
zalogowania (token Supabase PROD), a wniosek o usunięcie – świeżego logowania kodem z maila.

## Zaległości (backlog)

- **Rocznik w `erasure_preview`** (decyzja 21.10.2026: nie teraz). Blokada „nazwisko i rocznik” wymaga, żeby
  zaznaczone wyniki miały jedno nazwisko i znany rocznik; dziś sprawdza to dopiero serwer w `erasure_request`
  (błąd 400 z komunikatem pokazywanym na stronie). Gdyby podgląd zwracał rocznik (i znak, czy jest znany),
  `usun-dane.html` mogłaby wyłączyć opcję blokady z góry i wyjaśnić dlaczego. Wymaga zmiany funkcji 012 na serwerze
  (repo biegamy-collector, migracja, B8) – kolumny wyjściowe `erasure_preview` są częścią kontraktu API.
