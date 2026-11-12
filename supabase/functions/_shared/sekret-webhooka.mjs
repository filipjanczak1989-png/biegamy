// SEKRET WEBHOOKA intervals.icu (12.11.2026). Jedna czysta funkcja dla EF intervals-webhook i dla testów w Node.
// intervals.icu wysyła sekret JAWNIE w treści JSON ({ secret, events }), bez nagłówka i bez ?secret w adresie (12.11: ponad 30 prawdziwych
// POST-ów bez parametru w adresie). Sekret ustawia intervals, my go tylko porównujemy, więc ŻADNEGO wymogu długości: warunek „co najmniej 16 znaków”
// z 11.11 odrzucał wszystkie prawdziwe wywołania (401 od 09:09 do 10:02, cofnięte przez Filipa). Zostaje to, co naprawdę zamyka dziurę z audytu:
// pusty albo nieustawiony sekret po naszej stronie = odmowa (nie „otwarte”), pusty sekret w treści = odmowa, inny typ niż tekst = odmowa.
export function sekretWebhookaOk(sekretUstawiony, body) {
  if (typeof sekretUstawiony !== "string" || sekretUstawiony.length === 0) return false;
  if (!body || typeof body !== "object" || typeof body.secret !== "string" || body.secret.length === 0) return false;
  return body.secret === sekretUstawiony;
}
