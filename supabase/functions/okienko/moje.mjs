// OKIENKO M3d (1.11.2026, projekt M3 v2 / M2e w docs/okienko-spec.md): moje_rekordy + moje_wyniki. Tylko odczyt.
//
// moje_rekordy — athletes.pb_5k/pb_10k/pb_half/pb_marathon + *_year (baza zna ROK, nie datę i nie nazwę biegu —
//   wariant (a) z M2e). „Szanse na rekordy" = rekordy + najbliższy start (moje_starty), BEZ prognozy czasu.
// moje_wyniki — wyniki z maszyny F6 dla zalogowanego: athletes.f6_runner_key (zapamiętany wybór) albo search_runners
//   po imieniu i nazwisku z profilu, zawężone rocznikiem z date_of_birth. Jeden → karta wyników (ta sama co tryb
//   osoby: podsumujWyniki); kilku (imiennicy) → karta „Który to Ty?" (wybór zapisuje RPC ustaw_f6_runner_key po
//   tapnięciu — JEDYNY zapis w tej ścieżce, w przeglądarce, nie w EF i nie z modelu); brak imienia → do Profilu.
import { f6, BladF6 } from "./f6.mjs";
import { podsumujWyniki } from "./osoba.mjs";

export const DYSTANSE_PB = [["5k", "5 km", 5], ["10k", "10 km", 10], ["half", "półmaraton", 21.0975], ["marathon", "maraton", 42.195]];
const MAX_WYBOR = 5;
const RE_KLUCZ = /^[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}$/;

export async function mojeRekordy(sb, athleteId) {
  const { data, error } = await sb.from("athletes")
    .select("pb_5k,pb_5k_year,pb_10k,pb_10k_year,pb_half,pb_half_year,pb_marathon,pb_marathon_year").eq("id", athleteId).maybeSingle();
  if (error) throw new Error("athletes");
  const a = data || {};
  return { rekordy: DYSTANSE_PB.map(([k, dystans, km]) => {
    const czas = a["pb_" + k] ? String(a["pb_" + k]).trim().slice(0, 12) : null;
    const rok = a["pb_" + k + "_year"] ? Number(a["pb_" + k + "_year"]) || null : null;
    return { dystans, km, czas, rok };
  }).filter((r) => r.czas) };
}

const bezZnakow = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
const rdzen = (w) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 3)));

/** args: {gdzie?} ; f6ctx: {fetchFn, token}. → {brak_imienia} | {brak} | {wybor:[…]} | {wyniki, gdzie?} | {brak_gdzie, gdzie} | {blad_f6} */
export async function mojeWyniki(sb, athleteId, args, f6ctx, teraz = Date.now()) {
  const { data: a, error } = await sb.from("athletes").select("full_name,date_of_birth,f6_runner_key").eq("id", athleteId).maybeSingle();
  if (error) throw new Error("athletes");
  try {
    let b, w;
    if (a && a.f6_runner_key && RE_KLUCZ.test(a.f6_runner_key)) {
      w = await f6(f6ctx.fetchFn, f6ctx.token, "runner_results", { p_runner_key: a.f6_runner_key }, teraz);
      b = { display_name: a.full_name || "", yob: a.date_of_birth ? Number(String(a.date_of_birth).slice(0, 4)) : null, results_count: w.length };
    } else {
      const imie = String((a && a.full_name) || "").trim();
      if (imie.split(/\s+/).filter(Boolean).length < 2) return { brak_imienia: true };
      const yob = a.date_of_birth ? Number(String(a.date_of_birth).slice(0, 4)) : null;
      let s = await f6(f6ctx.fetchFn, f6ctx.token, "search_runners", { q: imie.slice(0, 80), lim: 10 }, teraz);
      if (yob) s = s.filter((x) => x.yob == null || Number(x.yob) === yob);
      if (!s.length) return { brak: true };
      if (s.length > 1) return { wybor: s.slice(0, MAX_WYBOR).map((x) => ({ klucz: String(x.runner_key || ""), nazwa: String(x.display_name || "").slice(0, 80),
        rocznik: x.yob ?? null, starty: x.results_count ?? null, ostatni: x.last_event ? String(x.last_event).slice(0, 120) : null, miasto: x.last_city || null }))
        .filter((x) => RE_KLUCZ.test(x.klucz)) };
      b = s[0];
      w = await f6(f6ctx.fetchFn, f6ctx.token, "runner_results", { p_runner_key: b.runner_key }, teraz);
    }
    if (args.gdzie) {
      const r = rdzen(bezZnakow(args.gdzie).replace(/[^a-z]/g, ""));
      const pasuje = w.filter((x) => bezZnakow(`${x.event_name || ""} ${x.event_city || ""}`).split(/[^a-z0-9]+/).some((s) => s.startsWith(r)));
      if (!pasuje.length) return { brak_gdzie: true, gdzie: args.gdzie };
      return { wyniki: podsumujWyniki({ ...b, results_count: pasuje.length }, pasuje).podsumowanie, gdzie: args.gdzie };
    }
    return { wyniki: podsumujWyniki(b, w).podsumowanie };
  } catch (e) {
    if (e instanceof BladF6 && e.kod === "limit") return { blad_f6: "limit" };
    throw e;
  }
}
