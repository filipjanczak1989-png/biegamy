# Zaległości — strona publiczna i domena

Rzeczy dotyczące `biegamy.run` jako wizytówki: treść stron publicznych, domena, poczta,
wydajność. Sprawy bezpieczeństwa mają osobny plik: `zaleglosci-bezpieczenstwo.md`.

---

## Domena `biegamy.run` nie ma poczty (brak rekordów MX)

**Zmierzone 9 sierpnia 2026** przez `8.8.8.8`: zapytanie o MX zwraca samą SOA
(`nova.dns-parking.com`, Hostinger). Rekordy A pokazują na GitHub Pages
(185.199.108–111.153). **Żaden adres `@biegamy.run` nie odbiera poczty** — wysyłka odbija się
od nadawcy.

**Dziś nieszkodliwe:** nikt na ten adres nie pisze. Jedyne miejsce, które go podawało —
komunikat błędu wysyłki formularza w `o-nas.html` — zostało poprawione na
`biegamy.run@gmail.com` przy okazji przygotowania strony pod ruch z MŚ.

**Dlaczego wraca przy zakładaniu działalności:** `biegamy.run@gmail.com` w materiale
prasowym wygląda słabiej niż `kontakt@biegamy.run`. To kwestia wiarygodności, nie techniki —
adres w domenie mówi, że po drugiej stronie jest firma, a nie prywatna skrzynka.

**Zakres roboty, gdy przyjdzie pora:** rekordy MX u operatora poczty + SPF, DKIM i DMARC
(bez nich poczta z własnej domeny ląduje w spamie), potem podmiana adresu w `o-nas.html`
i decyzja o `contactPoint` w JSON-LD — dziś świadomie pominiętym do czasu działalności.

**Nie pilne.**

---

## Sześć ciężkich zdjęć na `o-nas.html`

`gal-07` 396 KB · `gal-12` 229 KB · `kasia-portret` 218 KB · `hero-pucharki` 197 KB ·
`gal-04` 175 KB · `filip-portret1` 116 KB. Cała strona to **2,17 MB** (HTML 59 KB + 1,89 MB
zdalnych z `biegamy-assets` + 0,22 MB lokalnych).

**Nie blokuje.** Z 18 obrazów **17 ma `loading="lazy"`**; jedyny ładowany od razu to
`hero-pucharki.webp` (197 KB), więc do pierwszego malowania idzie **~256 KB**. Reszta
dochodzi w miarę przewijania.

Rekompresja do rozważenia osobno — enkoder i pułapki opisane przy pipeline WIZUAL.
