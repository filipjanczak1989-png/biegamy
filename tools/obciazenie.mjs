// TEST OBCIĄŻENIA pojedynczego adresu: N wejść naraz, czasy i kody odpowiedzi. Bez kluczy, tylko GET.
//   node tools/obciazenie.mjs --url <adres> --wejsc 2000 [--fale 4] [--przerwa-s 15]
// Fale rosną (np. 500, 1000, 1500, 2000), a test staje po pierwszej, w której błędów jest ponad 5 %: to ma znaleźć granicę, nie położyć usługi.
// ⚠️ Produkcja tylko z --potwierdzam-prod i po OK Filipa, poza próbą generalną i poza startem. Jeden komputer i jedno IP nie udają 2000 ludzi: wynik mówi o funkcji i bazie, nie o sieci.
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url'), wejsc = Number(arg('wejsc', 2000)), fale = Number(arg('fale', 4)), przerwa = Number(arg('przerwa-s', 15));
if (!url) { console.error('Podaj --url'); process.exit(2); }
const host = new URL(url).hostname;
if (/supabase\.co$|biegamy\.(run|app)$|github\.io$/.test(host) && !process.argv.includes('--potwierdzam-prod')) { console.error('To wygląda na produkcję: potrzebne --potwierdzam-prod i OK Filipa.'); process.exit(2); }
const centyl = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
async function fala(n) {
  const t0 = performance.now();
  const wyn = await Promise.all(Array.from({ length: n }, async () => {
    const t = performance.now();
    try { const r = await fetch(url, { headers: { Accept: 'application/json', Origin: 'https://biegamy.run' }, signal: AbortSignal.timeout(30000) }); await r.arrayBuffer(); return { k: r.status, ms: performance.now() - t, c: r.headers.get('x-cache') || '' }; }
    catch (e) { return { k: e.name === 'TimeoutError' ? 'limit-czasu' : 'blad-sieci', ms: performance.now() - t, c: '' }; }
  }));
  const kody = {}, cache = {}; wyn.forEach((w) => { kody[w.k] = (kody[w.k] || 0) + 1; if (w.c) cache[w.c] = (cache[w.c] || 0) + 1; });
  const ms = wyn.map((w) => w.ms).sort((a, b) => a - b), bledy = wyn.filter((w) => !(w.k >= 200 && w.k < 400)).length;
  console.log(`${n} naraz | ${Math.round(performance.now() - t0)} ms całość | p50 ${Math.round(centyl(ms, 0.5))} p95 ${Math.round(centyl(ms, 0.95))} p99 ${Math.round(centyl(ms, 0.99))} ms | kody ${JSON.stringify(kody)} | cache ${JSON.stringify(cache)} | błędów ${(100 * bledy / n).toFixed(1)} %`);
  return bledy / n;
}
for (let i = 1; i <= fale; i++) {
  const b = await fala(Math.round(wejsc * i / fale));
  if (b > 0.05) { console.log('STOP: ponad 5 % błędów.'); process.exit(1); }
  if (i < fale) await new Promise((z) => setTimeout(z, przerwa * 1000));
}
