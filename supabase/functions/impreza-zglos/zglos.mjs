// IMPREZA-ZGLOS (K5, 1.11.2026) — zawodnik zapisał cel startowy z imprezą, której kalendarz maszyny wyników nie zna →
// zgłoszenie do F6 (`event_propose`, 018 w repo biegamy-collector). JEDYNY zapis z aplikacji do maszyny.
//
// Co płynie do maszyny: WYŁĄCZNIE nazwa imprezy, data i miejscowość (p_nazwa, p_data, p_miejscowosc) — budowane tu
// z białej listy, więc imię, nazwisko, e-mail, athlete_id ani nic innego z ciała żądania nie przejdzie, nawet gdy
// klient je dołoży (blizna-87). Tożsamość: token użytkownika w nagłówku Authorization — F6 sam liczy z niego hash
// konta (prywatne.konto()) do limitu 5/dobę; EF nie wysyła żadnego identyfikatora.
// Moduł czysty (bez Deno.*) — ładuje go EF i testy (node --test).
export const F6_URL = "https://api.biegamy.run";
export const TIMEOUT_MS = 8000;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** ciało żądania → {ok:true, args:{p_nazwa,p_data,p_miejscowosc}} | {ok:false, blad} */
export function walidujZgloszenie(body) {
  const b = body && typeof body === "object" ? body : {};
  const nazwa = typeof b.nazwa === "string" ? b.nazwa.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  const data = typeof b.data === "string" ? b.data.trim() : "";
  const m = typeof b.miejscowosc === "string" ? b.miejscowosc.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  if (nazwa.length < 3 || nazwa.length > 200) return { ok: false, blad: "nazwa" };
  if (!RE_DATA.test(data) || Number.isNaN(Date.parse(data + "T12:00:00Z")) || new Date(data + "T12:00:00Z").toISOString().slice(0, 10) !== data) return { ok: false, blad: "data" };
  if (m.length > 80) return { ok: false, blad: "miejscowosc" };
  return { ok: true, args: { p_nazwa: nazwa, p_data: data, p_miejscowosc: m || null } };
}

/** → {status, wynik} — status HTTP do oddania klientowi; wynik tylko z pól imprezy. Nie rzuca. */
export async function zglos(fetchFn, token, args) {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetchFn(F6_URL + "/rpc/event_propose", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ p_nazwa: args.p_nazwa, p_data: args.p_data, p_miejscowosc: args.p_miejscowosc }),
      signal: ctrl ? ctrl.signal : undefined,
    });
  } catch (_) {
    return { status: 502, wynik: { blad: "siec" } };
  } finally {
    if (t) clearTimeout(t);
  }
  if (res.status === 429) return { status: 429, wynik: { blad: "limit" } };
  if (res.status === 400) return { status: 400, wynik: { blad: "dane" } };
  if (res.status === 401) return { status: 401, wynik: { blad: "nieautoryzowany" } };
  if (!res.ok) return { status: 502, wynik: { blad: "serwer" } };
  let j;
  try { j = await res.json(); } catch (_) { return { status: 502, wynik: { blad: "serwer" } }; }
  const r = Array.isArray(j) ? j[0] : j;
  if (!r || typeof r.klucz !== "string" || !/^(kalendarz|biegamy|wyniki|zgloszenie):[A-Za-z0-9:._-]{1,120}$/.test(r.klucz)) return { status: 502, wynik: { blad: "serwer" } };
  return { status: 200, wynik: { klucz: r.klucz, istniala: r.istniala === true, status: typeof r.status === "string" ? r.status : null,
    nazwa: String(r.nazwa || "").slice(0, 200), data: r.data || null } };
}
