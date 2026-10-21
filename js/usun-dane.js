/* „Usuń moje dane" (usun-dane.html) — klasyczny skrypt, bez modułów ES:
     window.initUsunDane({ sb, api: window.wynikiApi(sb), root, dostepne: window.wynikiApiDostepne() })
   Kontrakt (repo biegamy-collector, migracja 012 + F6-USUN-DANE-PLAN.md rozdz. 4; ścieżki w Caddy i f6.bramka, archiwum ca68e3e):
   - search_runners(q) → runner_key; erasure_preview(p_runner_key) → wiersze (result_id, event_name, event_date, distance_km,
     time_seconds, source, ma_id_zrodla, dopasowanie) — sam odczyt, nic nie zapisuje;
   - erasure_request(p_result_ids uuid[1..200], p_blokuj_nazwisko) → id wniosku (stan „czeka_na_potwierdzenie”, 30 min);
   - erasure_confirm(p_id) → 'ukryte' | 'wstrzymane' | 'wygasle' | stan; erasure_cancel(p_id) → 'cofniete' | stan;
   - erasure_status() → do 20 wniosków konta (id, stan, utworzono, ukryto, kasowanie_od, wierszy);
   - wniosek i potwierdzenie wymagają świeżego logowania kodem albo linkiem z maila (amr otp/magiclink ≤ 15 min, PT403).
   Bez danych osobowych w URL, logach i magazynach przeglądarki; dane z serwera wyłącznie przez textContent. */
(function () {
  'use strict';

  var OKNO_MIN = 15;
  var PONOWNA_WYSYLKA_S = 60;
  var MAX_WIERSZY = 200;
  var ADRES_POWROTU = 'https://biegamy.run/usun-dane.html';
  var KONTAKT = 'biegamy.run@gmail.com';
  var STANY = {
    czeka_na_potwierdzenie: 'czeka na Twoje potwierdzenie',
    wstrzymane: 'czeka na ręczne sprawdzenie',
    ukryte: 'ukryte – wyniki nie są widoczne',
    wykonane: 'usunięte z bazy',
    cofniete: 'cofnięty – wyniki wróciły',
    wygasle: 'wygasł (nie został potwierdzony w 30 minut)',
  };
  var DO_COFNIECIA = ['czeka_na_potwierdzenie', 'wstrzymane', 'ukryte'];

  /* ── pomocniki czyste (testy) ── */
  function dekodujJwt(token) {
    try {
      var c = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (c.length % 4) c += '=';
      var bin = atob(c), bajty = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bajty));
    } catch (e) { return null; }
  }

  // Świeże logowanie kodem/linkiem z maila: najnowszy wpis amr otp|magiclink; koniec okna = czas wpisu + 15 min
  function oknoLogowania(session, teraz) {
    var claims = session && session.access_token ? dekodujJwt(session.access_token) : null;
    var amr = claims && Array.isArray(claims.amr) ? claims.amr : [];
    var ts = 0;
    amr.forEach(function (a) { if (a && (a.method === 'otp' || a.method === 'magiclink') && Number(a.timestamp) > ts) ts = Number(a.timestamp); });
    if (!ts) return { swieze: false, koniec: null };
    var koniec = ts * 1000 + OKNO_MIN * 60000;
    return { swieze: teraz < koniec, koniec: koniec };
  }

  function bladZLinku(hash, search) {
    var s = String(hash || '').replace(/^#/, '') + '&' + String(search || '').replace(/^\?/, '');
    return /(^|&)error_code=otp_expired(&|$)/.test(s) ? 'otp_expired' : (/(^|&)error=/.test(s) ? 'inny' : null);
  }

  function podsumowanie(wiersze) {
    var zrodla = [];
    wiersze.forEach(function (w) { if (w.source && zrodla.indexOf(w.source) < 0) zrodla.push(w.source); });
    return { wierszy: wiersze.length, zrodla: zrodla.sort(), profil: wiersze.some(function (w) { return w.ma_id_zrodla; }) };
  }

  function maskujEmail(e) {
    var m = String(e || '').match(/^([^@]{0,2})[^@]*(@.+)$/);
    return m ? m[1] + '***' + m[2] : '';
  }

  function data(d) {
    if (!d) return '';
    var t = new Date(d);
    return isNaN(t) ? '' : t.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function liczba(n, jeden, kilka, wiele) {
    var d = n % 10, s = n % 100;
    return n + ' ' + (n === 1 ? jeden : d >= 2 && d <= 4 && (s < 12 || s > 14) ? kilka : wiele);
  }

  // Tekst dla użytkownika z błędu klienta js/wyniki-api.js; komunikat serwera tylko ze stałych zdań funkcji 012 (PT4xx)
  function tekstBledu(err) {
    if (!err) return '';
    if (err.kod === 'brak_sesji' || err.kod === 'nieautoryzowany' || err.status === 401) return 'Sesja wygasła – zaloguj się ponownie w aplikacji i wróć na tę stronę.';
    if (err.kod === 'offline' || err.kod === 'siec' || err.kod === 'timeout') return 'Brak połączenia z internetem – spróbuj ponownie, gdy wrócisz online.';
    if (err.status === 429) {
      if (err.komunikat) return err.komunikat + '.';
      return err.retryAfter != null && err.retryAfter >= 3600 ? 'Za dużo prób – spróbuj ponownie za godzinę.' : 'Za dużo prób – odczekaj minutę i spróbuj ponownie.';
    }
    if (err.status === 404) return 'Nie ma takiego wniosku.';
    if ((err.status === 400 || err.status === 403) && err.komunikat) return err.komunikat + '.';
    if (err.kod === 'wylaczone' || err.kod === 'srodowisko') return 'Usługa usuwania danych jest chwilowo niedostępna.';
    return 'Coś poszło nie tak. Spróbuj ponownie później albo napisz na ' + KONTAKT + '.';
  }
  function wymagaKodu(err) { return !!(err && err.status === 403 && /kodem|linkiem/i.test(err.komunikat || '')); }

  /* ── widok ── */
  function initUsunDane(opts) {
    var sb = opts.sb, api = opts.api, root = opts.root, doc = root.ownerDocument;
    var teraz = opts.teraz || function () { return Date.now(); };
    var zegar = opts.setInterval || function (f, ms) { return setInterval(f, ms); };
    var stopZegar = opts.clearInterval || function (id) { clearInterval(id); };
    var lok = opts.location || (typeof location !== 'undefined' ? location : null);
    var hist = opts.history || (typeof history !== 'undefined' ? history : null);
    var stan = { email: null, koniec: null, kandydat: null, wiersze: [], wybrane: {}, blokuj: false, wniosek: null, odliczanie: null, licznik: null };

    function el(tag, props) {
      var n = doc.createElement(tag);
      Object.keys(props || {}).forEach(function (k) {
        var v = props[k];
        if (v == null) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'value' || k === 'checked' || k === 'disabled') n[k] = v;
        else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v);
      });
      for (var i = 2; i < arguments.length; i++) if (arguments[i]) n.append(arguments[i]);
      return n;
    }
    function ekran() {
      if (stan.licznik) { stopZegar(stan.licznik); stan.licznik = null; }
      root.textContent = '';
      for (var i = 0; i < arguments.length; i++) if (arguments[i]) root.append(arguments[i]);
    }
    function p(text, cls) { return el('p', { class: cls || null, text: text }); }
    function przycisk(text, onclick, extra) { var b = el('button', { type: 'button', text: text, onclick: onclick }); if (extra) Object.keys(extra).forEach(function (k) { b[k] = extra[k]; }); return b; }
    function info(text, cls) { return el('p', { class: cls || 'ud-info', role: 'status', text: text }); }

    if (!opts.dostepne || !api) {
      ekran(el('h2', { text: 'Usuń moje dane' }),
        p('Usługa usuwania danych jest chwilowo niedostępna.'),
        el('p', {}, doc.createTextNode('Wniosek możesz wysłać mailem na '), el('a', { href: 'mailto:' + KONTAKT, text: KONTAKT }), doc.createTextNode('.')));
      return { stan: stan };
    }

    async function sesja() {
      try { var r = await sb.auth.getSession(); return r && r.data ? r.data.session : null; } catch (e) { return null; }
    }

    async function start() {
      var bladLinku = lok ? bladZLinku(lok.hash, lok.search) : null;
      if (bladLinku && hist && lok) { try { hist.replaceState(null, '', lok.pathname); } catch (e) { /* zostaje */ } }
      var s = await sesja();
      if (!s || !s.user) {
        ekran(el('h2', { text: 'Usuń moje dane' }),
          p('Aby złożyć wniosek, zaloguj się w aplikacji BiegaMy, a potem wróć na tę stronę.'),
          el('p', {}, el('a', { href: 'index.html', text: 'Przejdź do logowania' })));
        return;
      }
      stan.email = s.user.email || null;
      var o = oknoLogowania(s, teraz());
      if (o.swieze) { stan.koniec = o.koniec; return glowny(); }
      if (bladLinku === 'otp_expired') return ekranKodu('Link został już użyty albo wygasł (zdarza się, gdy program pocztowy sprawdza linki). Wpisz kod z tego samego maila.');
      return ekranPotwierdz(null);
    }

    /* krok 1: potwierdzenie tożsamości kodem z maila */
    function ekranPotwierdz(uwaga) {
      ekran(el('h2', { text: 'Potwierdź, że to Ty' }),
        uwaga ? info(uwaga, 'ud-uwaga') : null,
        p('Wyślemy jednorazowy kod (6 cyfr) i link na adres Twojego konta: ' + maskujEmail(stan.email) + '.'),
        p('Po zalogowaniu kodem albo linkiem masz ' + OKNO_MIN + ' minut na wybranie wyników i potwierdzenie wniosku. Samo hasło nie wystarcza.', 'ud-muted'),
        przycisk('Wyślij kod na mój e-mail', function () { wyslijKod(); }));
    }

    async function wyslijKod() {
      if (!stan.email) return ekranPotwierdz('Twoje konto nie ma adresu e-mail – napisz na ' + KONTAKT + '.');
      var r;
      try { r = await sb.auth.signInWithOtp({ email: stan.email, options: { shouldCreateUser: false, emailRedirectTo: ADRES_POWROTU } }); } catch (e) { r = { error: { message: 'Failed to fetch' } }; }
      if (r && r.error) {
        var e = r.error;
        return ekranPotwierdz(e.status === 429 ? 'Za dużo wysłanych maili – odczekaj chwilę i spróbuj ponownie.'
          : /fetch|network/i.test(String(e.message)) ? 'Brak połączenia z internetem – spróbuj ponownie.' : 'Nie udało się wysłać maila – spróbuj ponownie za chwilę.');
      }
      stan.odliczanie = teraz() + PONOWNA_WYSYLKA_S * 1000;
      ekranKodu(null);
    }

    function ekranKodu(uwaga) {
      var pole = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', 'aria-label': 'Kod z maila (6 cyfr)', placeholder: '123456' });
      var komunikat = info('');
      var ponow = przycisk('Wyślij kod ponownie', function () { wyslijKod(); });
      function odswiezPonow() {
        var s = stan.odliczanie ? Math.ceil((stan.odliczanie - teraz()) / 1000) : 0;
        ponow.disabled = s > 0;
        ponow.textContent = s > 0 ? 'Wyślij kod ponownie (za ' + s + ' s)' : 'Wyślij kod ponownie';
      }
      async function sprawdz() {
        var kod = String(pole.value || '').replace(/\s/g, '');
        if (!/^\d{6}$/.test(kod)) { komunikat.textContent = 'Kod ma 6 cyfr.'; return; }
        komunikat.textContent = 'Sprawdzam kod…';
        var r;
        try { r = await sb.auth.verifyOtp({ email: stan.email, token: kod, type: 'email' }); } catch (e) { r = { error: { message: 'Failed to fetch' } }; }
        if (r && r.error) {
          komunikat.textContent = r.error.status === 429 ? 'Za dużo prób – odczekaj chwilę.'
            : /fetch|network/i.test(String(r.error.message)) ? 'Brak połączenia z internetem – spróbuj ponownie.'
            : 'Kod jest nieprawidłowy albo wygasł. Sprawdź najnowszy mail albo wyślij nowy kod.';
          return;
        }
        var s = (r && r.data && r.data.session) || await sesja();
        var o = oknoLogowania(s, teraz());
        if (!o.swieze) { komunikat.textContent = 'Nie udało się potwierdzić logowania kodem – wyślij nowy kod.'; return; }
        stan.koniec = o.koniec;
        glowny();
      }
      ekran(el('h2', { text: 'Wpisz kod z maila' }),
        uwaga ? info(uwaga, 'ud-uwaga') : null,
        p('Sprawdź skrzynkę ' + maskujEmail(stan.email) + '. Możesz wpisać kod albo kliknąć link w mailu (wrócisz na tę stronę).'),
        pole, przycisk('Potwierdź kod', function () { sprawdz(); }), komunikat, ponow);
      odswiezPonow();
      stan.licznik = zegar(odswiezPonow, 1000);
    }

    /* krok 2: wnioski konta i wyszukanie własnych wyników */
    function pozostalo() { return stan.koniec ? Math.max(0, Math.ceil((stan.koniec - teraz()) / 60000)) : 0; }
    function czasMinal() { return !stan.koniec || teraz() >= stan.koniec; }
    function poOknie() { stan.koniec = null; ekranPotwierdz('Minęło ' + OKNO_MIN + ' minut od zalogowania kodem – zaloguj się kodem jeszcze raz.'); }
    function zegarOkna() {
      var z = info('');
      function tik() { if (czasMinal()) return poOknie(); z.textContent = 'Na złożenie i potwierdzenie wniosku zostało: ' + liczba(pozostalo(), 'minuta', 'minuty', 'minut') + '.'; }
      tik();
      return { el: z, tik: tik };
    }
    function obsluzBlad(err, gdzie) {
      if (wymagaKodu(err)) return poOknie();
      gdzie.textContent = tekstBledu(err);
    }

    async function glowny() {
      var z = zegarOkna();
      var wnioski = el('div');
      var pole = el('input', { type: 'search', placeholder: 'Imię i nazwisko, np. Jan Kowalski', 'aria-label': 'Imię i nazwisko', autocomplete: 'off' });
      var status = info('');
      var lista = el('ul', { class: 'ud-lista' });
      ekran(el('h2', { text: 'Usuń moje dane' }), z.el,
        el('h3', { text: 'Twoje wnioski' }), wnioski,
        el('h3', { text: 'Znajdź swoje wyniki' }),
        p('Wpisz swoje imię i nazwisko tak, jak w wynikach zawodów. Najpierw zobaczysz podgląd – nic nie zostanie usunięte bez Twojego potwierdzenia.', 'ud-muted'),
        pole, przycisk('Szukaj', function () { szukaj(); }), status, lista);
      stan.licznik = zegar(z.tik, 15000);
      pokazWnioski(wnioski);

      async function szukaj() {
        lista.textContent = '';
        var q = String(pole.value || '').trim();
        if (q.length < 3) { status.textContent = 'Wpisz co najmniej 3 znaki.'; return; }
        status.textContent = 'Szukam…';
        var r = await api.rpc('search_runners', { q: q });
        if (r.error) return obsluzBlad(r.error, status);
        var dane = r.data || [];
        if (!dane.length) { status.textContent = 'Brak wyników dla tego zapytania.'; return; }
        status.textContent = 'Wybierz siebie:';
        dane.forEach(function (c) {
          var opis = [c.yob ? 'rocznik ' + c.yob : 'rocznik nieznany', liczba(Number(c.results_count) || 0, 'wynik', 'wyniki', 'wyników'), c.last_event].filter(Boolean).join(' · ');
          lista.append(el('li', {}, przycisk(String(c.display_name || '') + ' – ' + opis, function () { podglad(c); })));
        });
      }
    }

    async function pokazWnioski(cel) {
      cel.textContent = '';
      cel.append(info('Ładuję…'));
      var r = await api.rpc('erasure_status', {});
      cel.textContent = '';
      if (r.error) { var b = info(''); cel.append(b); return obsluzBlad(r.error, b); }
      var dane = r.data || [];
      if (!dane.length) { cel.append(p('Nie masz jeszcze żadnych wniosków.', 'ud-muted')); return; }
      var ul = el('ul', { class: 'ud-lista' });
      dane.forEach(function (w) {
        var opis = 'Wniosek z ' + data(w.utworzono) + ': ' + liczba(Number(w.wierszy) || 0, 'wynik', 'wyniki', 'wyników') + ', ' + (STANY[w.stan] || 'stan nieznany');
        if (w.stan === 'ukryte' && w.kasowanie_od) opis += '. Usuniemy je z bazy ' + data(w.kasowanie_od) + ' – do tego dnia możesz cofnąć wniosek';
        var li = el('li', {}, p(opis + '.'));
        if (DO_COFNIECIA.indexOf(w.stan) >= 0) {
          var k = info('');
          var b = przycisk('Cofnij wniosek', null);
          var pewny = false;
          b.addEventListener('click', async function () {
            if (!pewny) { pewny = true; b.textContent = 'Tak, cofnij – wyniki znów będą widoczne'; return; }
            b.disabled = true;
            var c = await api.rpc('erasure_cancel', { p_id: w.id });
            if (c.error) { b.disabled = false; return obsluzBlad(c.error, k); }
            pokazWnioski(cel);
          });
          li.append(b, k);
        }
        ul.append(li);
      });
      cel.append(ul);
    }

    /* krok 3: podgląd (sam odczyt) i wybór wierszy */
    async function podglad(c) {
      if (czasMinal()) return poOknie();
      stan.kandydat = c; stan.wybrane = {}; stan.blokuj = false;
      ekran(el('h2', { text: 'Podgląd' }), info('Ładuję wyniki…'));
      var r = await api.rpc('erasure_preview', { p_runner_key: c.runner_key });
      if (r.error) { var b = info(''); ekran(el('h2', { text: 'Podgląd' }), b, przycisk('Wróć', function () { glowny(); })); return obsluzBlad(r.error, b); }
      stan.wiersze = (r.data || []).filter(function (w) { return w && w.result_id; });
      if (!stan.wiersze.length) { ekran(el('h2', { text: 'Podgląd' }), p('Te wyniki są już ukryte albo nie ma ich w bazie.'), przycisk('Wróć', function () { glowny(); })); return; }
      stan.wiersze.slice(0, MAX_WIERSZY).forEach(function (w) { stan.wybrane[w.result_id] = true; });
      var z = zegarOkna();
      var licznik = info('');
      function policz() {
        var n = Object.keys(stan.wybrane).length;
        licznik.textContent = 'Zaznaczone: ' + liczba(n, 'wynik', 'wyniki', 'wyników') + (n > MAX_WIERSZY ? ' – jeden wniosek obejmuje najwyżej ' + MAX_WIERSZY + '.' : '.');
        dalej.disabled = n < 1 || n > MAX_WIERSZY;
      }
      var tbody = el('tbody');
      stan.wiersze.forEach(function (w) {
        var pole = el('input', { type: 'checkbox', checked: !!stan.wybrane[w.result_id], 'aria-label': 'Zaznacz wynik' });
        pole.addEventListener('change', function () { if (pole.checked) stan.wybrane[w.result_id] = true; else delete stan.wybrane[w.result_id]; policz(); });
        tbody.append(el('tr', {}, el('td', {}, pole), el('td', { text: data(w.event_date) }), el('td', { text: String(w.event_name || '') }),
          el('td', { text: w.distance_km ? Number(w.distance_km) + ' km' : '' }), el('td', { text: String(w.source || '') }),
          el('td', { text: w.ma_id_zrodla ? 'profil ze źródła' : (w.dopasowanie === 'domysl_nazwisko_rocznik' ? 'po nazwisku i roczniku' : 'po nazwisku') })));
      });
      var naglowek = el('tr', {});
      ['', 'Data', 'Zawody', 'Dystans', 'Źródło', 'Dopasowanie'].forEach(function (t) { naglowek.append(el('th', { text: t })); });
      var blokada = el('input', { type: 'checkbox', checked: false, id: 'ud-blokuj' });
      blokada.addEventListener('change', function () { stan.blokuj = !!blokada.checked; });
      var dalej = przycisk('Dalej – podsumowanie', function () { podsumuj(); });
      ekran(el('h2', { text: 'Podgląd: ' + String(c.display_name || '') }), z.el,
        p('Odznacz wyniki, które nie są Twoje. Wiersz „profil ze źródła” oznacza wyniki przypisane do Twojego profilu w serwisie z wynikami – wtedy ukryjemy wszystkie wyniki tego profilu.', 'ud-muted'),
        el('table', { class: 'ud-tabela' }, el('thead', {}, naglowek), tbody), licznik,
        el('p', {}, blokada, el('label', { for: 'ud-blokuj', text: ' Zablokuj też przyszłe wyniki z moim nazwiskiem i rocznikiem' })),
        p('Blokada ukryje również wyniki, które pojawią się później bez identyfikatora ze źródła – także wyniki innej osoby o tym samym nazwisku i roczniku. Wygasa po 3 latach. Działa tylko, gdy zaznaczone wyniki mają jedno nazwisko i znany rocznik.', 'ud-muted'),
        dalej, przycisk('Wróć', function () { glowny(); }));
      stan.licznik = zegar(z.tik, 15000);
      policz();
    }

    /* krok 4: podsumowanie → wniosek → potwierdzenie */
    function podsumuj() {
      if (czasMinal()) return poOknie();
      var wybrane = stan.wiersze.filter(function (w) { return stan.wybrane[w.result_id]; });
      var s = podsumowanie(wybrane);
      var komunikat = info('');
      var zloz = przycisk('Złóż wniosek', async function () {
        zloz.disabled = true;
        komunikat.textContent = 'Wysyłam wniosek…';
        var r = await api.rpc('erasure_request', { p_result_ids: wybrane.map(function (w) { return w.result_id; }), p_blokuj_nazwisko: !!stan.blokuj });
        if (r.error) { zloz.disabled = false; return obsluzBlad(r.error, komunikat); }
        stan.wniosek = r.data;
        potwierdz(s);
      });
      ekran(el('h2', { text: 'Podsumowanie' }),
        p('Ukryjemy ' + liczba(s.wierszy, 'wynik', 'wyniki', 'wyników') + ' ze źródeł: ' + s.zrodla.join(', ') + '.'),
        s.profil ? p('Część wyników należy do profilu w serwisie źródłowym – ukryjemy wszystkie wyniki tego profilu, także niezaznaczone.') : null,
        stan.blokuj ? p('Włączysz też blokadę nazwiska i rocznika na 3 lata (może objąć imiennika).') : null,
        p('Wyniki znikną z wyszukiwarki zaraz po potwierdzeniu, a po 30 dniach usuniemy je z bazy na stałe. Przez te 30 dni możesz cofnąć wniosek na tej stronie. Lista na stronie organizatora zawodów zostaje u organizatora.', 'ud-muted'),
        zloz, przycisk('Wróć', function () { podglad(stan.kandydat); }), komunikat);
    }

    function potwierdz(s) {
      var komunikat = info('');
      var ok = przycisk('Potwierdzam – ukryj te wyniki', async function () {
        if (czasMinal()) return poOknie();
        ok.disabled = true;
        komunikat.textContent = 'Potwierdzam…';
        var r = await api.rpc('erasure_confirm', { p_id: stan.wniosek });
        if (r.error) { ok.disabled = false; return obsluzBlad(r.error, komunikat); }
        wynik(r.data);
      });
      ekran(el('h2', { text: 'Potwierdź wniosek' }),
        p('Wniosek jest przygotowany (' + liczba(s.wierszy, 'wynik', 'wyniki', 'wyników') + '). Potwierdź go w ciągu 30 minut – bez potwierdzenia nic się nie stanie.'),
        ok, komunikat);
    }

    function wynik(st) {
      var teksty = {
        ukryte: 'Gotowe – wyniki są ukryte. Po 30 dniach usuniemy je z bazy; do tego czasu możesz cofnąć wniosek.',
        wstrzymane: 'Wniosek czeka na ręczne sprawdzenie (dużo wniosków jednego dnia). Ukryjemy wyniki po sprawdzeniu.',
        wygasle: 'Wniosek wygasł, bo minęło 30 minut. Złóż go jeszcze raz.',
      };
      ekran(el('h2', { text: 'Wniosek' }), p(teksty[st] || ('Stan wniosku: ' + (STANY[st] || 'nieznany') + '.')), przycisk('Moje wnioski', function () { glowny(); }));
    }

    start();
    return { stan: stan };
  }

  window.initUsunDane = initUsunDane;
  window._usunDane = { oknoLogowania: oknoLogowania, bladZLinku: bladZLinku, podsumowanie: podsumowanie, tekstBledu: tekstBledu,
    maskujEmail: maskujEmail, wymagaKodu: wymagaKodu, STANY: STANY, OKNO_MIN: OKNO_MIN, PONOWNA_WYSYLKA_S: PONOWNA_WYSYLKA_S, ADRES_POWROTU: ADRES_POWROTU };
})();
