// Worker frontu TESTOWEGO (Cloudflare Workers + static assets) — 9.10.2026, docs/srodowisko-testowe.md.
// Cel: serwować pliki DOKŁADNIE jak GitHub Pages (prod). Cloudflare Pages zawsze przekierowuje /x.html → /x
// (308, zmierzone na biegamy-test.pages.dev), a przekierowana odpowiedź w precache Service Workera nie może
// obsłużyć nawigacji offline — test różniłby się od prod właśnie w tym, co ma sprawdzać.
// Konfiguracja (wrangler.jsonc): html_handling "none" → /x.html = 200 z pliku, bez przekierowań.
// Przy "none" katalog „/" nie mapuje się na index.html — to jedyne, co robi ten Worker. Worker jest
// wołany TYLKO dla adresów bez pasującego pliku; brak pliku → 404.html z kodem 404 (not_found_handling).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') {
      url.pathname = '/index.html';
      return env.ASSETS.fetch(new Request(url.toString(), request));
    }
    return env.ASSETS.fetch(request);
  },
};
