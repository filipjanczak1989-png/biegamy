// E-mail przed biegiem (EF bieg-przypomnienie): rezerwacja w bazie PRZED wysyłką, wysyłka z kluczem Idempotency-Key, wynik po wysyłce (migracja 20261201).
// Bez Deno i bez sieci w środku: fetch, RPC i czekanie przychodzą z zewnątrz, więc Node testuje to samo, co jedzie na produkcję (blizna-243).
// Resend (dokumentacja, sprawdzone 14.11): nagłówek Idempotency-Key, ≤ 256 znaków, 24 h; ten sam klucz z tą samą treścią = bez drugiej wysyłki;
// 409 concurrent_idempotent_requests = poprzednie żądanie z tym kluczem w toku. Dokumentacja NIE mówi, czy 5xx znaczy „nie wysłano”
// ani czy nieudane żądanie zostaje zapamiętane pod kluczem. Stąd: klucz osobny dla każdej próby z bazy, ponowienie w wywołaniu tym samym kluczem
// i tą samą treścią, 'blad' (ponawialny przez bazę) tylko gdy KAŻDA próba w wywołaniu dostała odrzucenie, przy każdej wątpliwości 'niepewny'.

export const RESEND_URL = 'https://api.resend.com/emails';
export const ODRZUCONE = new Set([400, 401, 403, 404, 405, 422, 429]);   // Resend odrzucił żądanie: e-mail na pewno nie wyszedł
export const PROB_W_WYWOLANIU = 3, PRZERWA_PONOWIENIA_MS = 2000, LIMIT_ZADANIA_MS = 10000;   // najgorzej 3 × 10 s + 2 × 2 s na jednego odbiorcę

export const kluczIdempotencji = (biegId, kontoId, proba) => `bieg-przypomnienie/${biegId}/${kontoId}/${proba}`;

async function nazwaBledu(r) {   // tylko nazwa błędu z Resend (np. rate_limit_exceeded), nigdy treść komunikatu: bywa w niej adres
  try { const j = JSON.parse(await r.text()); return typeof j?.name === 'string' && /^[a-z_]{1,40}$/.test(j.name) ? ' ' + j.name : ''; } catch { return ''; }
}

export async function wyslijJeden({ f, resend, klucz, cialo, czekaj, prob = PROB_W_WYWOLANIU, przerwaMs = PRZERWA_PONOWIENIA_MS, limitMs = LIMIT_ZADANIA_MS }) {
  let niepewne = false, ostatni = '';
  for (let i = 0; i < prob; i++) {
    if (i) await czekaj(przerwaMs);
    let r;
    try {
      r = await f(RESEND_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resend}`, 'Idempotency-Key': klucz }, body: cialo, signal: AbortSignal.timeout(limitMs) });
    } catch (e) { niepewne = true; ostatni = 'siec: ' + String((e && e.name) || 'blad').slice(0, 40); continue; }
    if (r.ok) { try { await r.body?.cancel(); } catch { /* treść odpowiedzi niepotrzebna */ } return { stan: 'wyslany', blad: null }; }
    ostatni = `resend ${r.status}${await nazwaBledu(r)}`;
    if (ODRZUCONE.has(r.status)) return { stan: niepewne ? 'niepewny' : 'blad', blad: ostatni };
    niepewne = true;   // 5xx, 409 i reszta: nie wiadomo, czy wyszedł; ponowienie TYM SAMYM kluczem i tą samą treścią
  }
  return { stan: 'niepewny', blad: ostatni };
}

async function rpc(sb, nazwa, arg) {
  try { const { data, error } = await sb.rpc(nazwa, arg); return error ? { blad: true } : { data }; } catch { return { blad: true }; }
}

export async function rozeslij({ odbiorcy, sb, tresc, wyslij, nadawca, start, budzetMs, przerwaMs, czekaj, teraz = () => Date.now() }) {
  const w = { wyslane: 0, bledy: 0, niepewne: 0, zajete: 0, pominiete: 0, bez_wyniku: 0, blad_rezerwacji: false, ile: odbiorcy.length };
  for (let i = 0; i < odbiorcy.length; i++) {
    const o = odbiorcy[i];
    if (teraz() - start > budzetMs) { w.pominiete = odbiorcy.length - i; break; }   // reszta w kolejnym wywołaniu z crona
    const rez = await rpc(sb, 'akcja_bieg_mail_rezerwuj', { p_bieg_id: o.bieg_id, p_konto_id: o.konto_id });
    if (rez.blad) { w.pominiete = odbiorcy.length - i; w.blad_rezerwacji = true; break; }   // bez rezerwacji nic nie wychodzi (np. migracja 20261201 niewykonana)
    if (!Number.isInteger(rez.data)) { w.zajete++; continue; }   // wysłany, w toku, niepewny, odrzucony za świeżo, 3 próby albo zgoda cofnięta
    const t = tresc(o);
    const cialo = JSON.stringify({ from: nadawca, to: [o.email], subject: t.temat, html: t.html, text: t.tekst, headers: t.naglowki });
    const r = await wyslij(kluczIdempotencji(o.bieg_id, o.konto_id, rez.data), cialo);
    const zap = await rpc(sb, 'akcja_bieg_mail_wynik', { p_bieg_id: o.bieg_id, p_konto_id: o.konto_id, p_proba: rez.data, p_stan: r.stan, p_blad: r.blad });
    if (zap.blad || zap.data !== true) w.bez_wyniku++;   // wpis zostaje 'wysylam' = bez ponowienia
    if (r.stan === 'wyslany') w.wyslane++; else if (r.stan === 'blad') w.bledy++; else w.niepewne++;
    await czekaj(przerwaMs);   // Resend: ≤ 2/s
  }
  return w;
}
