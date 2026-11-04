// OKIENKO M3a v2 (1.11.2026, projekt M3 v2 pkt 3) — tryb „impreza": pytanie o konkretny bieg idzie RÓWNOLEGLE do:
//   (a) kalendarza maszyny wyników — przez adapter kalendarz.mjs (od 1.11 14:58 events_search, K-API 017; bez zakresu
//       dat, więc wracają też przeszłe edycje);
//   (b) naszych startów — tabela races (tylko approved, RLS), dedup z (a) po dacie ±1 i nazwie znormalizowanej;
//   (c) sieci — DOZWOLONEJ dla imprezy (nazwa biegu to nie dane osobowe), ale nie gdy pytanie wygląda na imię
//       i nazwisko (stary szeroki detektor) bez trafienia w kalendarzu; liczy się do limitu 20/dobę; pamięć 24 h;
//       źródła zapisywane jako znaleziska ze statusem „kalendarz" (pokarm dla K-źródła na maszynie3).
// Detektor: słowo z listy (bieg, maraton, ultra, cross, trail, parkrun…) + reszta nazwy — „bieg ultrakotlina",
// „maraton warszawski kiedy"; ALBO 1–3 słowa bez słowa z listy, gdy nazwa trafia w kalendarz („ultrakotlina").
// Wynik („kto wygrał…", „wyniki…", „rekord…", „moje…") NIE jest imprezą. Odpowiedź: zdania z sieci (etykieta,
// źródła) → karty z kalendarza → karty z naszych startów; pusto → „Nie znalazłem tego biegu w kalendarzu ani w sieci."
import { normalizuj, czyOboz } from "./router.mjs";
import { wygladaNaOsobe, wygladaNaNazwisko } from "./pamiec.mjs";
import { szukajImprez } from "./kalendarz.mjs";
import { BladF6, ODP_F6_ZAJETA } from "./f6.mjs";

export const ODP_IMPREZA_PUSTO = "Nie znalazłem tego biegu w kalendarzu ani w sieci.";
export const SLOWA_IMPREZY = /\b(bieg|biegi|biegu|maraton\w*|polmaraton\w*|ultra\w*|zawody|zawodach|cross\w*|dych\w*|piatk\w*|sztafet\w*|trail\w*|parkrun\w*)\b/;
const OGOLNE = /^(bieg|biegi|biegu|zawody|zawodach)$/;   // nie niosą nazwy — wypadają z q
const PYTAJNE = /^(kiedy|gdzie|jaki|jaka|jakie|jakiego|jest|termin|terminy|data|daty|odbywa|sie|bedzie|byl|w|we|na|o|czy|ten|ta|to|tego|edycja|najblizszy|najblizsza|najblizsze|kolejny|kolejna|nastepny|nastepna|info|informacje|zapisy|start|trasa|trasy|trase|dystans\w*|mapa|mapka|opis)$/;
const NIE_IMPREZA = /\b(kto|wygral\w*|wygrala\w*|wynik\w*|rekord\w*|zyciow\w*|moj\w*|moje|mam|mial\w*|ile|jak|plan\w*|odznak\w*|wyzwan\w*|trening\w*)\b/;
const MAX_KART = 5;
/* Etap 5 (1.11): „ile kosztuje wpisowe na X", „zapisy na X", „cena biegu X" — to pytanie o KONKRETNĄ imprezę. Słowa ceny
   wypadają z q (nie są nazwą), „ile"/„jak" przestają wykluczać. Odpowiedź: karta z kalendarza + „Strona imprezy ›"
   (url z maszyny, przez safeExternalHref w UI); sieć TYLKO, gdy karty brak. */
const CENA = /\b(ile kosztuj\w*|kosztuj\w*|koszt\w*|wpisow\w*|oplat\w*|cen[aeyi]\b|cenn\w*|zapisy|zapisow|zapisac sie|zapisac na)\b/;
const SLOWA_CENY = /^(ile|kosztuje|kosztuja|kosztowac|koszt|koszty|kosztow|wpisowe|wpisowego|wpisowym|oplata|oplaty|oplate|startowa|startowe|startowego|cena|ceny|cene|cennik|zapisy|zapisow|zapisac|zapis|zapisac sie|na|do|za|jak|mnie|sie|gdzie|mozna|moge)$/;
export const ODP_CENA_LINK = "Wpisowe i zapisy podaje strona imprezy:";
export const ODP_CENA_BEZ_LINKU = "Maszyna wyników nie zna strony tej imprezy — cenę i zapisy podaje organizator.";

/** → {q, jawne} | null. jawne = jest słowo z listy (impreza nawet bez trafienia w kalendarzu). */
export function imprezaZPytania(tekst) {
  const t = normalizuj(tekst);
  if (!t || /^\d+$/.test(t) || czyOboz(tekst)) return null;   // obóz to nie impreza z kalendarza (Filip 3.11; „ile kosztuje obóz biegowy” też)
  if (CENA.test(t) && !/\b(kto|wynik\w*|rekord\w*|moj\w*|moje|mam)\b/.test(t)) {
    const slowa = String(tekst).replace(/[?!.,;:"„”()]/g, " ").split(/\s+/).filter(Boolean)
      .filter((w) => { const n = normalizuj(w); return n && !SLOWA_CENY.test(n) && !PYTAJNE.test(n) && !OGOLNE.test(n); });
    if (!slowa.length || slowa.length > 5) return null;
    return { q: slowa.join(" ").slice(0, 80), jawne: SLOWA_IMPREZY.test(t), cena: true };   // bez słowa biegu („para butów") impreza tylko po trafieniu w kalendarz
  }
  if (NIE_IMPREZA.test(t)) return null;
  if (/\bdystans\w* (ma|maja) (maraton|polmaraton|ultramaraton|dych\w*|piatk\w*)$/.test(t)) return null;   // baza wiedzy 4.11: „jaki dystans ma maraton” to wiedza ogólna, nie nazwa imprezy
  const slowa = String(tekst).replace(/[?!.,;:"„”()]/g, " ").split(/\s+/).filter(Boolean);
  const nazwa = slowa.filter((w) => { const n = normalizuj(w); return n && !PYTAJNE.test(n) && !OGOLNE.test(n); });
  if (!nazwa.length || nazwa.length > 5) return null;
  const jawne = SLOWA_IMPREZY.test(t);
  if (!jawne && nazwa.length > 3) return null;
  return { q: nazwa.join(" ").slice(0, 80), jawne };
}

const bezZnakow = (s) => normalizuj(s).replace(/\b(\d+|[ivxlc]+)\b/g, " ").replace(/\s+/g, " ").trim();   // bez numeru edycji (normalizuj = js/tekst.mjs przez router)
function dniMiedzy(a, b) { return Math.abs(Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000)); }
function dodajDni(d, n) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

/** (b) nasze starty: races approved od wczoraj, nazwa zawiera każde słowo q (≥ 3 litery). */
export async function naszeStarty(sb, q, dzis) {
  const slowa = String(q).split(/\s+/).map((s) => s.replace(/[%_,()*\\]/g, "")).filter((s) => s.length >= 3).slice(0, 3);
  if (!slowa.length) return [];
  let z = sb.from("races").select("id,name,date,city,status").eq("status", "approved").gte("date", dodajDni(dzis, -1));
  for (const s of slowa) z = z.ilike("name", `%${s}%`);
  const { data, error } = await z.order("date", { ascending: true }).limit(MAX_KART);
  if (error) throw new Error("races");
  return (data || []).map((r) => ({ race_id: r.id, nazwa: String(r.name || "").slice(0, 120), data: r.date || null, miasto: r.city || null }));
}

/** deps: {sb, fetchFn, token, q, jawne, dzis, sieciDozwolona: async () => bool, siec: async (tekst) => {zdania, zrodla, tok, zapytania},
    zPamieci: async () => {zdania, zrodla} | null, doPamieci: async (zdania, zrodla) => void, znaleziska: async (wpisy) => void}
    → null (nie impreza: bez słowa z listy i bez trafień) | {zdania, karty, zrodla, tok, zapytania_sieci, f6, z_pamieci, powod} */
export async function odpowiedzImpreza(deps) {
  const { sb, fetchFn, token, q, jawne, dzis } = deps;
  const [rK, rS] = await Promise.allSettled([
    szukajImprez(fetchFn, token, { q }),   // bez zakresu: events_search zwraca też przeszłe edycje („ostatnia 9.10.2026")
    naszeStarty(sb, q, dzis),
  ]);
  const kalendarz = rK.status === "fulfilled" ? rK.value : [];
  const f6Stan = rK.status === "fulfilled" ? "ok" : (rK.reason instanceof BladF6 ? rK.reason.kod : "blad");
  const nasze = rS.status === "fulfilled" ? rS.value : [];
  if (!jawne && !kalendarz.length && !nasze.length) return null;   // „ultrakotlina" bez trafień → nie impreza, dalej
  // dedup: nasz start, który jest w kalendarzu (data ±1, ta sama nazwa bez numeru edycji) — zostaje NASZ (ma race_id)
  const kal = kalendarz.filter((k) => !nasze.some((n) => n.data && k.data && dniMiedzy(n.data, k.data) <= 1 && bezZnakow(n.nazwa) === bezZnakow(k.nazwa)));
  // sieć: dozwolona dla imprezy; NIE gdy pytanie wygląda na imię i nazwisko i kalendarz go nie zna
  let zdania = [], zrodla = [], tok = { we: 0, wy: 0 }, zapytania = 0, zPam = false;
  /* PRZED 8.11 (3/4): bez trafienia w kalendarzu ani u nas — do sieci nie idzie pytanie, które wygląda na osobę: para (wygladaNaOsobe),
     nazwisko w kontekście (wygladaNaNazwisko) ani „Nazwisko + słowo biegowe” (po odjęciu słów biegowych zostaje jedno słowo z dużej litery). */
  const slowaQ = String(q).split(/\s+/).filter(Boolean), bezBiegowych = slowaQ.filter((w) => !SLOWA_IMPREZY.test(normalizuj(w)));
  const samoNazwisko = bezBiegowych.length === 1 && bezBiegowych.length < slowaQ.length && /^[\p{Lu}][\p{Ll}'-]{2,}$/u.test(bezBiegowych[0]);
  const naOsobe = wygladaNaOsobe(q) || wygladaNaNazwisko(q + " wyniki") || samoNazwisko;
  const wolnoSiec = !(naOsobe && !kalendarz.length && !nasze.length) && !(deps.cena && (kal.length || nasze.length));   // cena: sieć tylko bez karty
  if (wolnoSiec) {
    const pam = await deps.zPamieci();
    if (pam && pam.zrodla && pam.zrodla.length) { zdania = pam.zdania; zrodla = pam.zrodla; zPam = true; }
    else if (await deps.sieciDozwolona()) {
      const nazwa = (nasze[0] && nasze[0].nazwa) || (kalendarz[0] && kalendarz[0].nazwa) || q;
      try {
        const s = await deps.siec(`${nazwa} bieg — termin, dystanse, miejsce`);
        tok = s.tok || tok; zapytania = s.zapytania || 0;
        if (s.zrodla && s.zrodla.length) {
          zdania = s.zdania; zrodla = s.zrodla;
          await deps.doPamieci(zdania, zrodla);
          const rok = (kalendarz[0] && kalendarz[0].data && Number(kalendarz[0].data.slice(0, 4))) || null;   // najbliższa albo ostatnia edycja
          await deps.znaleziska(zrodla.map((z) => ({ url: z.url, domena: String(z.tytul || "").toLowerCase().slice(0, 200),
            nazwa_biegu: nazwa.slice(0, 200), rok, pytanie: [nazwa, rok].filter(Boolean).join(" ").slice(0, 200), status: "kalendarz" })));
        }
      } catch { /* sieć padła — karty zostają */ }
    }
  }
  const karty = [...kal.slice(0, MAX_KART).map((d) => ({ typ: "impreza", dane: d })), ...nasze.slice(0, MAX_KART).map((d) => ({ typ: "start_nasz", dane: d }))];
  if (deps.cena && karty.length) zdania = [kal.some((k) => k.url) ? ODP_CENA_LINK : ODP_CENA_BEZ_LINKU];
  if (f6Stan === "limit") zdania = [...zdania, ODP_F6_ZAJETA];
  if (!karty.length && !zdania.length) zdania = [ODP_IMPREZA_PUSTO];
  return { zdania, karty, zrodla, tok, zapytania_sieci: zapytania, f6: f6Stan, z_pamieci: zPam,
    powod: [f6Stan !== "ok" ? "f6: " + f6Stan : null, rS.status === "rejected" ? "races" : null].filter(Boolean).join(" | ") || null };
}
