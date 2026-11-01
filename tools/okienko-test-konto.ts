// Test „Zapytaj" na ŻYWYM koncie testowym (M1 pkt 8.1, krok 1). Uruchomienie:
//   deno run --allow-net --allow-read tools/okienko-test-konto.ts <plik_z_tokenem> [url_ef_okienko]
// Token (JWT sesji konta testowego) czytany z pliku, NIGDZIE nie wypisywany; plik kasuje wołający po teście.
// Sprawdza: (a) narzędzia na prawdziwej bazie zwracają wyłącznie wiersze tego konta (RLS + filtr athlete_id);
//           (b) bez tokenu i z tokenem obcym/zepsutym EF zwraca 401 (jeśli podano URL EF — po wdrożeniu).
// Wypisuje tylko liczby i nazwy narzędzi — żadnych treści wierszy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { NAZWY, waliduj, wykonaj } from "../supabase/functions/okienko/narzedzia.mjs";

const SB_URL = "https://afqojgkaveykxbltxzwm.supabase.co";
const PUBLISHABLE = "sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY";
const [plik, efUrl] = Deno.args;
if (!plik) { console.error("podaj plik z tokenem"); Deno.exit(2); }
const jwt = (await Deno.readTextFile(plik)).trim();
const sb = createClient(SB_URL, PUBLISHABLE, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });

const { data: u, error: ue } = await sb.auth.getUser(jwt);
if (ue || !u?.user) { console.error("token nieważny (getUser)"); Deno.exit(1); }
const { data: ath } = await sb.from("athletes").select("id").eq("user_id", u.user.id).maybeSingle();
if (!ath) { console.error("konto bez wiersza athletes"); Deno.exit(1); }
let zle = 0;
const ok = (warunek: boolean, opis: string) => { console.log((warunek ? "OK   " : "BŁĄD ") + opis); if (!warunek) zle++; };

// (a) RLS bez filtra: każdy widoczny wiersz należy do konta testowego
for (const t of ["trainings", "training_logs"]) {
  const { data, error } = await sb.from(t).select("athlete_id").limit(1000);
  ok(!error && (data || []).every((r) => r.athlete_id === ath.id), `${t}: bez filtra widać tylko własne (${(data || []).length} wierszy)`);
}
/* achievements: ZAMIERZENIE widać też odznaki osób z PUBLICZNYM profilem (polityka public_achievements_read —
   odznaki na profilach). Pierwszy przebieg 1.11 liczył je jako błąd. Tu: każdy widoczny wiersz = własny albo publiczny. */
{
  const { data, error } = await sb.from("achievements").select("athlete_id").limit(1000);
  const obce = [...new Set((data || []).map((r) => r.athlete_id).filter((id) => id !== ath.id))];
  let prywatne = 0;
  for (let i = 0; i < obce.length; i += 100) {
    const { data: a } = await sb.from("athletes").select("id,is_public").in("id", obce.slice(i, i + 100));
    const pub = new Set((a || []).filter((x) => x.is_public === true).map((x) => x.id));
    prywatne += obce.slice(i, i + 100).filter((id) => !pub.has(id)).length;
  }
  ok(!error && prywatne === 0, `achievements: widać własne + ${obce.length} publicznych profili, prywatnych: ${prywatne}`);
  const { count: wlasne } = await sb.from("achievements").select("athlete_id", { count: "exact", head: true }).eq("athlete_id", ath.id);
  const w = await wykonaj(sb, ath.id, "odznaki_moje", {});
  ok(w.liczba === (wlasne ?? -1), `odznaki_moje liczy tylko własne (${w.liczba} = ${wlasne})`);
}
for (const n of NAZWY) {
  const w = waliduj(n, n === "moje_treningi" ? { od: "2025-11-02", do: new Date().toISOString().slice(0, 10) } : {});
  try {
    const wynik = await wykonaj(sb, ath.id, n, w.args);
    ok(true, `${n}: ${JSON.stringify(wynik).length} B wyniku`);
  } catch (e) { ok(false, `${n}: ${(e as Error).message}`); }
}
// (b) EF — dopiero po wdrożeniu
if (efUrl) {
  const bez = await fetch(efUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tekst: "ile km w tym miesiącu" }) });
  ok(bez.status === 401, `EF bez tokenu → ${bez.status}`);
  const zly = await fetch(efUrl, { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer x.y.z" }, body: JSON.stringify({ tekst: "ile km w tym miesiącu" }) });
  ok(zly.status === 401, `EF z zepsutym tokenem → ${zly.status}`);
  const r = await fetch(efUrl, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ tekst: "ile km w tym miesiącu" }) });
  const j = await r.json().catch(() => ({}));
  ok(r.status === 200 && j.tryb === "router" && (j.narzedzia || []).includes("moje_treningi"), `EF z tokenem konta testowego → ${r.status}, tryb ${j.tryb}`);
}
console.log(zle ? `WYNIK: ${zle} błędów` : "WYNIK: wszystko OK");
Deno.exit(zle ? 1 : 0);
