// OKIENKO 2.0 — narzędzie PRODUKT (Filip 3.11 15:25 pkt 3): „ile kcal ma banan” → baza produktów z Jedzenia (public.food_database,
// RLS: authenticated czyta) → „Banan: 100 g to 89 kcal — białko 1,1 g, węglowodany 22,8 g, tłuszcz 0,3 g.” 0 tokenów. Brak w bazie →
// null → potok idzie do sieci (wiedza.mjs). Nazwa produktu: ze slotu klasyfikatora (produkt) albo z regexu na pytaniu (działa też, gdy
// klasyfikator powie „fakt”). „ile spaliłem kalorii” to NIE produkt (moje dane) — regex to wyklucza.
export const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase();

const SKLADNIK = "(?:kcal|kalori\\w*|bialk\\w*|weglowodan\\w*|tluszcz\\w*|cukr\\w*|blonnik\\w*|kalorycznosc)";
const RE_A = new RegExp("\\b(?:ile|jak duzo|jaka|jaki)\\s+" + SKLADNIK + "\\s+(?:ma|maja|jest w|zawiera|w|dla)\\s+(?:jeden |jedna |jedno |1 |100 ?g |sto gram\\w* |szklanka |lyzka )?(.+?)[?!. ]*$");
const RE_B = new RegExp("^(.+?)\\s+(?:ile|jak duzo)\\s+(?:ma\\s+|maja\\s+)?" + SKLADNIK + "[?!. ]*$");
const RE_C = /^(?:kalorie|kcal|kalorycznosc)\s+(.+?)[?!. ]*$/;
const NIE_PRODUKT = /\b(moj\w*|mam|spalil\w*|spalam|dzis|wczoraj|tydz\w*|tygodniu|miesiac\w*|trening\w*|bieg\w*|biegu|w akcji)\b/;

/** nazwa produktu z pytania (tekst dowolny) albo null */
export function produktZPytania(tekst) {
  const t = fold(tekst).replace(/\s+/g, " ").trim();
  if (!t || NIE_PRODUKT.test(t)) return null;
  const m = t.match(RE_A) || t.match(RE_B) || t.match(RE_C);
  if (!m) return null;
  const n = m[1].replace(/^(w|we|na|z|ze|dla)\s+/, "").trim();
  if (n.length < 2 || n.length > 40 || !/^[a-z][a-z0-9 \-]*$/.test(n)) return null;
  return n;
}

const KOL = "display_name,brand,name_normalized,kcal_per_100,protein_g_per_100,carbs_g_per_100,fat_g_per_100,fiber_g_per_100,sugar_g_per_100";
async function jeden(q) { const r = await q; return r && !r.error && Array.isArray(r.data) ? r.data[0] || null : null; }

/** @returns {Promise<null | {display_name:string, brand:string|null, kcal_per_100:number, protein_g_per_100:number|null, carbs_g_per_100:number|null, fat_g_per_100:number|null}>} */
export async function szukajProduktu(sb, nazwa) {
  const n = fold(nazwa).trim();
  if (!n) return null;
  const warianty = [n, n.replace(/(ow|ami|ach|em|ie|u|a|y|i|e)$/, "")].filter((x, i, a) => x.length >= 3 && a.indexOf(x) === i);   // „bananow” → „banan”
  try {
    for (const w of warianty) {
      const dokladny = await jeden(sb.from("food_database").select(KOL).eq("name_normalized", w).order("hit_count", { ascending: false }).limit(1));
      if (dokladny && dokladny.kcal_per_100 != null) return dokladny;
    }
    for (const w of warianty) {
      const poczatek = await jeden(sb.from("food_database").select(KOL).ilike("name_normalized", w + "%").order("hit_count", { ascending: false }).limit(1));
      if (poczatek && poczatek.kcal_per_100 != null) return poczatek;
    }
    const gdziekolwiek = await jeden(sb.from("food_database").select(KOL).ilike("display_name", "%" + n + "%").order("hit_count", { ascending: false }).limit(1));
    return gdziekolwiek && gdziekolwiek.kcal_per_100 != null ? gdziekolwiek : null;
  } catch { return null; }
}

const g = (x) => (x == null || !Number.isFinite(Number(x)) ? null : String(Math.round(Number(x) * 10) / 10).replace(".", ","));
export function zdanieProduktu(p) {
  const makro = [["białko", p.protein_g_per_100], ["węglowodany", p.carbs_g_per_100], ["tłuszcz", p.fat_g_per_100]].filter(([, v]) => g(v) != null).map(([k, v]) => `${k} ${g(v)} g`);
  return `${p.display_name}${p.brand ? " (" + p.brand + ")" : ""}: 100 g to ${Math.round(Number(p.kcal_per_100))} kcal${makro.length ? " — " + makro.join(", ") : ""}.`;
}
