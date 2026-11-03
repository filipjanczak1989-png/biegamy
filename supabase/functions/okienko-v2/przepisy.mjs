// OKIENKO 2.0 — E5: ŁĄCZENIE NARZĘDZI — przepisy W KODZIE (nie plany modelu): intencja → ≤ 3 narzędzia v1 równolegle → zdania
// składane deterministycznie z odpowiedzi narzędzi (zWyniku) — liczby tylko z narzędzi (E6 sprawdza strażnikiem). Model nie pisze prozy.
//   gotowosc  = moje_starty + moja_forma + moje_treningi (14 dni) + moje_rekordy (szanse)    „jakie szanse na życiówkę”
//   najdluzszy = moje_treningi (90 dni) → maksimum z listy                                      „jaki mam najdłuższy bieg”
//   porownaj  = osoba (B2: slot osoby z pytania albo z pamięci rozmowy) + moje_wyniki            „porównaj z nim”
import { waliduj } from "../okienko/narzedzia.mjs";
import { zWyniku } from "../okienko/odpowiedz.mjs";
import { NIE_MAM } from "../okienko/straznik.mjs";
import { dodajDni, normalizuj } from "../okienko/router.mjs";
import { wygladaNaOsobeSlownik } from "../okienko/pamiec.mjs";
import { ODP_OSOBA_BEZ_NAZWISKA, chipyDla } from "./intencje.mjs";

export const PRZEPISY = {
  gotowosc: ["moje_starty", "moja_forma", "moje_treningi", "moje_rekordy"],
  najdluzszy: ["moje_treningi"],
  porownaj: ["osoba", "moje_wyniki"],
};
export const MAX_NARZEDZI_PRZEPISU = 4;
const pusto = (tryb, extra = {}) => ({ zdania: [], karty: [], akcja: null, zrodla: [], narzedzia: [], tryb, koszt_tok: { we: 0, wy: 0 }, ...extra });
const DZIEN = (d) => { const [, m, dd] = String(d).split("-"); return `${Number(dd)}.${m}`; };
const km = (x) => String(Math.round(Number(x) * 10) / 10).replace(".", ",");

async function narzedzie(ctx, nazwa, args) {
  const w = waliduj(nazwa, args);
  if (!w.ok) throw new Error(nazwa + ": " + w.blad);
  const wynik = await ctx.d.wykonaj(ctx.sb, ctx.athleteId, nazwa, w.args, ctx.teraz, { fetchFn: ctx.fetchFn, token: ctx.jwt });
  return { nazwa, args: w.args, wynik, odp: zWyniku(nazwa, wynik, w.args) };
}
const pierwsze = (o) => (o && o.odp.zdania && o.odp.zdania[0] && o.odp.zdania[0] !== NIE_MAM ? o.odp.zdania[0] : null);

/** @returns {Promise<null | {body, log, meta:{wyniki, args, narzedzia}}>} */
export async function wykonajPrzepis(ctx, r) {
  const s = r.sloty || {};
  if (r.intencja === "gotowosc") {
    const od = dodajDni(ctx.dzis, -13);
    const [st, fo, tr, re] = await Promise.all([narzedzie(ctx, "moje_starty", {}), narzedzie(ctx, "moja_forma", {}), narzedzie(ctx, "moje_treningi", { od, do: ctx.dzis }), narzedzie(ctx, "moje_rekordy", { szanse: true })]);
    const zdania = [];
    const start = pierwsze(st) || pierwsze(re);
    if (start) zdania.push(start);
    const forma = pierwsze(fo), tren = tr.wynik && tr.wynik.liczba ? `Od ${DZIEN(od)}: ${km(tr.wynik.suma_km)} km, ${tr.wynik.liczba} tren.` : null;   // „14 dni” nie ma w wynikach — strażnik (E6) by to odrzucił
    const rekord = (re.odp.zdania || []).find((z) => /rekord/i.test(z) && z !== NIE_MAM) || null;
    const drugie = [forma, tren, rekord].filter(Boolean).join(" ");
    if (drugie) zdania.push(drugie);
    if (!zdania.length) return null;
    const karty = [...(st.odp.karty || []).slice(0, 1), ...(fo.odp.karty || []).slice(0, 1)];
    const narzedzia = [st, fo, tr, re].map((x) => x.nazwa);
    return { body: { ...pusto("router"), zdania: zdania.slice(0, 2), karty, narzedzia }, log: { narzedzia: ["gotowosc", ...narzedzia], plan: narzedzia },
      meta: { wyniki: [st, fo, tr, re].map((x) => x.wynik), args: { od, do: ctx.dzis }, narzedzia } };
  }
  if (r.intencja === "najdluzszy") {
    const od = dodajDni(ctx.dzis, -89);
    const tr = await narzedzie(ctx, "moje_treningi", { od, do: ctx.dzis });
    const lista = (tr.wynik && tr.wynik.lista) || [];
    const naj = lista.reduce((a, x) => { const k = Number(x.km ?? x.dystans_km ?? x.distance_km ?? 0); return k > (a ? a.k : 0) ? { k, x } : a; }, null);
    const zdania = naj ? [`Najdłuższy bieg od ${DZIEN(od)}: ${km(naj.k)} km (${DZIEN(naj.x.data)}).`] : [NIE_MAM];
    return { body: { ...pusto("router"), zdania, karty: naj ? [{ typ: "trening", dane: naj.x }] : [], narzedzia: ["moje_treningi"] }, log: { narzedzia: ["najdluzszy", "moje_treningi"], plan: ["moje_treningi"] },
      meta: { wyniki: [tr.wynik], args: tr.args, narzedzia: ["moje_treningi"] } };
  }
  if (r.intencja === "porownaj") {
    const q = String(s.osoba || "").trim();
    const wPytaniuLubPamieci = q && (normalizuj(ctx.tekst).includes(normalizuj(q)) || s._zPamieci === true);
    if (!q || !wPytaniuLubPamieci || !wygladaNaOsobeSlownik(q)) return { body: { ...pusto("router"), zdania: [ODP_OSOBA_BEZ_NAZWISKA], chipy: chipyDla(["osoba", "znajomi", "moje_wyniki"]) }, log: { narzedzia: ["osoba-bez-nazwiska"] }, meta: null };
    const [o, mw] = await Promise.all([
      ctx.d.odpowiedzOsoba({ sb: ctx.sb, athleteId: ctx.athleteId, fetchFn: ctx.fetchFn, token: ctx.jwt, q, wprost: false, gdzie: s.miejsce || null, sieciDozwolona: async () => false, siec: ctx.siecZeZrodlami }),
      narzedzie(ctx, "moje_wyniki", {}),
    ]);
    const zdania = [(o.zdania || [])[0], pierwsze(mw) ? "Ty: " + pierwsze(mw) : null].filter(Boolean).slice(0, 2);
    if (!zdania.length) return null;
    const narzedzia = ["osoba", "moje_wyniki"];
    return { body: { ...pusto("osoba"), zdania, karty: [...(o.karty || []).slice(0, 2), ...(mw.odp.karty || []).slice(0, 2)], zrodla: [], koszt_tok: o.tok, narzedzia },
      log: { narzedzia: ["porownaj", ...narzedzia], plan: narzedzia, tok_we: o.tok.we, tok_wy: o.tok.wy, zapytania_sieci: o.zapytania_sieci || 0 }, meta: { wyniki: [o, mw.wynik], args: {}, narzedzia, osoba: q } };
  }
  return null;
}
