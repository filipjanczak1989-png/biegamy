// Osie wariantów kadrów (31.10.2026, Grafiki v4 / G1) — JEDNO źródło dla generatora i testu blizna-57.
//
// Kadry v3 były dobre, ale do siebie podobne: jeden szkielet, jeden podmiot (biegacz od tyłu), jedna ogniskowa.
// Od v4 każdy numer n dostaje deterministycznie pięć osi (indeks z numeru, żeby ponowne wygenerowanie dawało ten
// sam opis, a numer pozostał jedynym kluczem):
//   kompozycja (n·7) % 4 · podmiot (n·3) % 5 · pora dnia (n·5) % 4 · pogoda (n·11) % 4 · ogniskowa (n·13) % 3
// Reguły nadrzędne: wyjątek sceny z podpisu wygrywa z osiami; noc WYŁĄCZNIE z n % 12 = 0; tag p: (pogoda kadru)
// wygrywa z osią pogody; zima + „po deszczu" = mokry śnieg / błoto pośniegowe; detal nigdy z twarzą ani dłońmi;
// „dwójka" = dwie osoby obok siebie od tyłu, nie grupa; pula „pejzaz" (21:9) nie ma biegacza z bliska (0/1 → 3/4);
// detal wg pory roku (DETALE_PORY, bez numeru startowego); detal + 24 mm → 85 mm (zbliżenie nie znosi „szerokiego planu"); mgła tylko o świcie/rano — mgła (z osi albo
// tagu p:mgla) z porą „południe"/„zmierzch" → świt (decyzje Filipa 31.10); tag p:upal → południe (scena upału ma
// „ostre południowe światło"). Wyjątek może podać własny indeks ogniskowej.
// Pejzaż 21:9 (poprawki Filipa 31.10): noc tylko w scenach miejskich (NOCNE_PEJZAZ), bez człowieka i bez czołówki;
// kompozycja sparametryzowana NAWIERZCHNIĄ sceny (nie „droga" na sztywno; bieżnia = łuk toru i pusta trybuna);
// strefa tekstu .bm-hero = LEWA DOLNA ĆWIARTKA bez ważnych szczegółów.
// Moduł jest czysty (bez plików i sieci) — scenę, sezon i tagi podaje wołający.

/** Nawierzchnia sceny w mianowniku (m) i dopełniaczu (d) — kompozycja odmienia ją zamiast pisać „drogę" na sztywno. */
export const NAWIERZCHNIE = {
  droga: { m: "droga", d: "drogi" }, szlak: { m: "szlak", d: "szlaku" },
  tor: { m: "tor bieżni", d: "toru bieżni", bieznia: true }, kladka: { m: "kładka mostu", d: "kładki mostu" },
  alejka: { m: "alejka", d: "alejki" }, bulwar: { m: "bulwar", d: "bulwaru" },
  ulica: { m: "ulica", d: "ulicy" }, sciezka: { m: "ścieżka", d: "ścieżki" },
};
const KOMPOZYCJE_WZOR = [
  { nazwa: "w osi", biegacz: (N) => `widziane od tyłu z dystansu, w osi ${N.d}, ${N.m} zbiega się w głębi`, kamera: (N) => `w osi ${N.d}, ${N.m} zbiega się w głębi` },
  { nazwa: "z boku", biegacz: () => "widziane z boku, z dystansu, przy lewej albo prawej krawędzi kadru, przed nimi dużo pustej przestrzeni", kamera: (N) => `z boku, ${N.m} biegnie w poprzek kadru` },
  { nazwa: "z góry", biegacz: (N) => `widziane z góry (most, nasyp albo wzgórze), mała sylwetka na szerokim planie ${N.d}`, kamera: (N) => `z góry (most, nasyp albo wzgórze), szeroki plan ${N.d}` },
  { nazwa: "nisko przy ziemi", biegacz: () => "widziane nisko przy ziemi, oddalające się w głąb kadru, pierwszy plan nawierzchni rozmyty i spokojny", kamera: () => "nisko przy ziemi, pierwszy plan nawierzchni rozmyty i spokojny" },
];
export const KOMPOZYCJE = KOMPOZYCJE_WZOR.map((k) => k.nazwa);
export function kompozycja(nr, nawierzchnia = "droga") {
  const N = NAWIERZCHNIE[nawierzchnia] || NAWIERZCHNIE.droga, k = KOMPOZYCJE_WZOR[nr], dop = N.bieznia ? "; łuk toru, pusta trybuna w tle" : "";
  return { nazwa: k.nazwa, biegacz: k.biegacz(N) + dop, kamera: k.kamera(N) + dop, prowadzi: `${N.m} prowadzi wzrok w głąb` };
}
/** Noc w pejzażu: wyłącznie sceny miejskie, bez człowieka (Math.floor(n/12) % 4 → 12 nabrzeże, 24 park, 36 ulica). */
export const NOCNE_PEJZAZ = [
  { opis: "most nad rzeką", naw: "kladka" }, { opis: "nabrzeże rzeki", naw: "bulwar" },
  { opis: "park z latarniami", naw: "alejka" }, { opis: "pusta ulica", naw: "ulica" },
];
export const PODMIOTY = ["jeden biegacz od tyłu", "dwójka", "bez człowieka — detal", "bez człowieka — pejzaż", "biegacz mały w dużym pejzażu"];
/* Detale wg pory roku (decyzja Filipa po siatce G2, 31.10.2026): „numer startowy z agrafkami" wypadł NA STAŁE (model rysuje
   cyfry mimo zakazu; start bez numeru niesie wyjątek sceny 88). Rękawiczki nigdy latem, bidon nigdy zimą. */
export const DETALE_PORY = {
  zima: ["rękawiczki biegowe", "czołówka", "para butów do biegania"],
  jesien: ["rękawiczki biegowe", "czołówka", "para butów do biegania", "zegarek sportowy"],
  wiosna: ["para butów do biegania", "zegarek sportowy", "bidon", "czołówka"],
  lato: ["para butów do biegania", "zegarek sportowy", "bidon", "czapka z daszkiem"],
};
export const DETALE = [...new Set(Object.values(DETALE_PORY).flat())];
/** Detal numeru n w porze roku: floor(n/5) % długość listy pory (sezon spoza listy = błąd wołającego, nie cichy domysł). */
export function detalNumeru(n, sezon) {
  const lista = DETALE_PORY[sezon];
  if (!lista) throw new Error(`detal kadru ${n}: nieznana pora roku „${sezon}"`);
  return lista[Math.floor(n / 5) % lista.length];
}
export const PORY_DNIA = ["świt", "rano", "południe", "zmierzch"];
export const POGODA = ["czyste niebo", "zachmurzenie", "mgła", "po deszczu, mokra nawierzchnia"];
export const OGNISKOWE = [
  "obiektyw 24 mm, szeroki plan, dużo tła",
  "obiektyw 50 mm, naturalna perspektywa",
  "obiektyw 85 mm, kompresja planów, płytka głębia ostrości",
];

export const indeksy = (n) => ({ kompozycja: (n * 7) % 4, podmiot: (n * 3) % 5, poraDnia: (n * 5) % 4, pogoda: (n * 11) % 4, ogniskowa: (n * 13) % 3 });

/** Osie numeru n po regułach nadrzędnych.
 *  opts: { pula: "dzis"|"pejzaz", sezon, tagP, tagT, wyjatek, nawierzchnia (klucz NAWIERZCHNIE sceny) } */
export function osie(n, opts = {}) {
  const pula = opts.pula || "dzis";
  const i = indeksy(n);
  const noc = n % 12 === 0;
  const nocPejzaz = noc && pula === "pejzaz";
  const scenaNocna = nocPejzaz ? NOCNE_PEJZAZ[Math.floor(n / 12) % NOCNE_PEJZAZ.length] : null;
  let podmiot = i.podmiot;
  if (pula === "pejzaz" && podmiot <= 1) podmiot += 3;                 // 21:9 źle znosi biegacza z bliska
  if (nocPejzaz) podmiot = 3;                                          // noc w pejzażu: bez człowieka
  const silownia = opts.tagT === "silownia";
  const wyj = opts.wyjatek || null;

  let pogoda = POGODA[i.pogoda];
  if (opts.tagP || silownia || nocPejzaz) pogoda = null;              // pogodę niesie scena tagu / wnętrze / linia nocy
  else if (opts.sezon === "zima" && i.pogoda === 3) pogoda = "po odwilży, mokry śnieg i błoto pośniegowe";

  let poraDnia = nocPejzaz ? "noc, latarnie, mokra nawierzchnia odbija światło" : noc ? "noc, czołówka, latarnie" : PORY_DNIA[i.poraDnia];
  const mgla = opts.tagP === "mgla" || (!opts.tagP && !silownia && i.pogoda === 2);
  if (mgla && !noc && (poraDnia === "południe" || poraDnia === "zmierzch")) poraDnia = "świt";
  if (opts.tagP === "upal" && !noc) poraDnia = "południe";             // scena upału mówi „ostre południowe światło"
  if (wyj && wyj.poraDnia && !noc) poraDnia = wyj.poraDnia;
  let ogniskowa = i.ogniskowa;
  if (podmiot === 2 && !silownia && ogniskowa === 0) ogniskowa = 2;
  if (wyj && Number.isInteger(wyj.ogniskowa)) ogniskowa = wyj.ogniskowa;
  const naw = scenaNocna ? scenaNocna.naw : (opts.nawierzchnia || "droga");

  return {
    indeksy: i, pula, noc, silownia, wyjatek: !!wyj, scenaNocna: scenaNocna ? scenaNocna.opis : null, nawierzchnia: naw,
    podmiot: silownia ? "osoba w rozciąganiu (siłownia)" : PODMIOTY[podmiot], podmiotNr: silownia ? null : podmiot,
    /* floor(n/5), nie n % 5: podmiot „detal" wypada tylko dla n ≡ 4 (mod 5), więc n % 5 dawało ZAWSZE ten sam przedmiot.
       Lista zależy od pory roku (DETALE_PORY) — wyjątek sceny i siłownia nie mają detalu z osi. */
    detal: podmiot === 2 && !silownia && !wyj ? detalNumeru(n, opts.sezon) : null,
    kompozycja: kompozycja(i.kompozycja, naw), poraDnia, pogoda, ogniskowa: OGNISKOWE[ogniskowa], ogniskowaNr: ogniskowa,
  };
}

/** Zdania promptu wynikające z osi (scena, pora roku i nagłówek dokłada generator). */
export function zdaniaOsi(o, wyj) {
  const styl = `Styl dokumentalny: ${o.ogniskowa}, niedoskonałe, nieustawiane światło.`;
  if (wyj && wyj.kadr) return { kadr: wyj.kadr, kompozycja: wyj.kompozycja, styl: wyj.styl || styl };
  const tlum = "Żadnego tłumu, żadnej grupy.";
  // Strefa tekstu: w .bm-hero (pejzaż 21:9) podpis leży w lewym dolnym rogu; w hero „Dziś" (9:16) — na dole kafla.
  const spokoj = o.pula === "pejzaz" ? "lewa dolna ćwiartka bez ważnych szczegółów" : "dolna część spokojna";
  if (o.silownia) return {
    kadr: `Kadr: bez biegania — jedna osoba w rozciąganiu, widziana od tyłu, z dystansu. ${tlum}`,
    kompozycja: `Kompozycja: osoba w górnej lub środkowej części kadru, ${spokoj} — pusta podłoga.`, styl };
  if (wyj) return {                                                    // wyjątek sceny bez własnego kadru: podmiot niesie scena, z osi kamera i ogniskowa
    kadr: `Kadr: widok ${o.kompozycja.kamera}. ${tlum}`,
    kompozycja: `Kompozycja: główny motyw w górnej lub środkowej części kadru, ${spokoj} — pusta nawierzchnia, cień.`, styl };
  switch (o.podmiotNr) {
    case 0: return { kadr: `Kadr: jeden biegacz ${o.kompozycja.biegacz}. ${tlum}`,
      kompozycja: `Kompozycja: biegacz w górnej lub środkowej części kadru, ${spokoj} — pusta nawierzchnia, cień.`, styl };
    case 1: return { kadr: `Kadr: dwie osoby biegnące obok siebie, ${o.kompozycja.biegacz} — dwójka, nie grupa. ${tlum}`,
      kompozycja: `Kompozycja: dwójka w górnej lub środkowej części kadru, ${spokoj} — pusta nawierzchnia, cień.`, styl };
    case 2: return { kadr: `Kadr: zbliżenie — ${o.detal}, bez człowieka: żadnej twarzy, żadnych dłoni ani części ciała w kadrze.`,
      kompozycja: `Kompozycja: przedmiot w środkowej części kadru, tło miękko rozmyte, ${spokoj}.`, styl };
    case 3: return { kadr: `Kadr: bez człowieka — pusta trasa, widok ${o.kompozycja.kamera}. Żadnych ludzi.`,
      kompozycja: `Kompozycja: ${o.kompozycja.prowadzi}, ${spokoj} — pusta nawierzchnia.`, styl };
    default: return { kadr: `Kadr: jeden biegacz, mały w dużym pejzażu, daleko, ${o.kompozycja.kamera}. ${tlum}`,
      kompozycja: `Kompozycja: pejzaż wypełnia kadr, sylwetka zajmuje niewielką część, ${spokoj}.`, styl };
  }
}
