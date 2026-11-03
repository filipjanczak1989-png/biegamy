/* „Zapytaj" — UI okienka (M1 krok 4, M1-okienko-wykonanie.md pkt 6). Klasyczny skrypt po sb.js (bez modułów ES).
   - Pole #okienko-pole pod topbarem na Dziś → arkusz od dołu (.add-overlay/.add-sheet z theme.css, SSOT bottom-sheet).
   - Pytanie idzie do EF okienko (POST, token sesji tylko w nagłówku — nigdzie niezapisywany).
   - CAŁY tekst z serwera przez escapeHtml; link wyłącznie z akcja.nawiguj i tylko z listy EKRANY (ta sama lista co EF
     narzedzia.mjs — blizna-65 pilnuje zgodności); obcy adres = brak przycisku.
   - Stany: ładowanie (szkielet), pusto, 429 dzień/miesiąc (+ wyszukiwarka ekranów), 502/503, offline (tylko ekrany).
   - prefers-reduced-motion: arkusz bez animacji wjazdu (CSS niżej). Nazwa w UI: „Zapytaj" — bez słowa „AI" (v1). */
(function () {
  'use strict';

  var EKRANY = {
    dzis: 'zawodnik.html', plan: 'kalendarz.html?role=athlete', log: 'zawodnik.html?log=1', historia: 'zawodnik.html#log-list',
    forma: 'zawodnik.html?tab=forma', spolecznosc: 'zawodnik.html?tab=social', czat: 'zawodnik.html?tab=msgs',
    cialo: 'zawodnik.html?tab=cwiczenia', statystyki: 'zawodnik.html?tab=stats', profil: 'profil.html', jedzenie: 'nutrition.html',
    starty: 'races.html', wyzwania: 'wyzwania.html', odznaki: 'odznaki.html', radio: 'radio.html'
  };
  var NAZWY_EKRANOW = {
    dzis: 'Dziś', plan: 'Plan', log: 'Zapisz trening', historia: 'Ostatnie treningi', forma: 'Forma', spolecznosc: 'Społeczność',
    czat: 'Czat', cialo: 'Ćwiczenia', statystyki: 'Statystyki', profil: 'Profil', jedzenie: 'Jedzenie', starty: 'Starty',
    wyzwania: 'Wyzwania', odznaki: 'Odznaki', radio: 'Radio'
  };
  var PODPOWIEDZI = ['Kiedy mam start?', 'Ile przebiegłem w tym miesiącu?', 'Plan na jutro', 'Jakie mam odznaki?', 'Pokaż wyzwania',
    'Kto wygrał maraton w Berlinie?', 'Wyniki: imię i nazwisko'];
  var TEKSTY = {
    pusto: 'Nie mam tego w Twoich danych.',
    dzien: 'Na dziś koniec pytań — od jutra znowu. Ekrany dalej znajdę:',
    miesiac: 'Na ten miesiąc koniec pytań. Ekrany dalej znajdę:',
    blad: 'Nie dam rady teraz odpowiedzieć. Spróbuj za chwilę.',
    offline: 'Bez sieci nie odpowiem, ale ekrany znajdę:',
    siecLimit: 'Na dziś koniec szukania w sieci — od jutra znowu. W aplikacji dalej znajdę:',
    siecPusto: 'Tego nie znalazłem w sieci.'
  };
  var KLUCZ_OSTATNIE = 'okienko_ostatnie', KLUCZ_PODPOWIEDZ = 'okienko_podpowiedz';

  function esc(s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bezpiecznyCel(url) {
    if (typeof url !== 'string') return null;
    for (var k in EKRANY) if (EKRANY[k] === url) return url;
    if (url === 'index.html#dolacz') return url;   // karta „Konto w BiegaMy" (okienko: „jak dołączyć" przed startem akcji)
    return null;
  }
  function czytaj(k, d) { try { var v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function zapisz(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* Podpowiedź rotuje co OTWARCIE strony, nie w czasie (M1 pkt 6). */
  function podpowiedz() {
    var i = czytaj(KLUCZ_PODPOWIEDZ, -1);
    i = (typeof i === 'number' ? i + 1 : 0) % PODPOWIEDZI.length;
    zapisz(KLUCZ_PODPOWIEDZ, i);
    return PODPOWIEDZI[i];
  }

  function wyszukajEkrany(tekst) {
    var t = String(tekst || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
    var wynik = [];
    for (var k in NAZWY_EKRANOW) {
      var n = NAZWY_EKRANOW[k].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
      if (!t || n.indexOf(t) >= 0 || t.indexOf(n) >= 0) wynik.push(k);
    }
    return wynik.length ? wynik : Object.keys(NAZWY_EKRANOW);
  }
  function htmlEkranow(tekst) {
    return '<div class="okn-ekrany">' + wyszukajEkrany(tekst).map(function (k) {
      return '<button type="button" class="okn-chip" data-cel="' + esc(EKRANY[k]) + '">' + esc(NAZWY_EKRANOW[k]) + '</button>';
    }).join('') + '</div>';
  }

  /* Karty: wiersze w stylu istniejących list (trening z pigułką typu przez renderTypePill, start, wyzwanie z paskiem,
     odznaka) — tylko pola, które są; brak pola = brak elementu (LEKCJA „nie wiem ≠ nic"). */
  function kmTxt(x) { return String(Math.round(Number(x) * 10) / 10).replace('.', ','); }
  function dzienTxt(d) { var p = String(d || '').split('-'); return p.length === 3 ? Number(p[2]) + '.' + p[1] : ''; }
  function karta(k) {
    var d = (k && k.dane) || {};
    if (k.typ === 'trening') {
      var pill = (d.typ && typeof window.renderTypePill === 'function') ? window.renderTypePill(d.typ) : '<span>' + esc(d.typ || '') + '</span>';
      var bity = [];
      if (d.data) bity.push(esc(dzienTxt(d.data)));
      if (d.dystans_km != null || d.km != null) bity.push(esc(kmTxt(d.dystans_km != null ? d.dystans_km : d.km)) + ' km');
      if (d.tempo) bity.push(esc(d.tempo) + ' /km');
      if (d.czas_min) bity.push('~' + esc(d.czas_min) + ' min');
      return '<div class="okn-karta">' + pill + '<span class="okn-meta">' + bity.join(' · ') + '</span></div>';
    }
    if (k.typ === 'start') {
      var kiedy = d.dni_do === 0 ? 'dziś' : d.dni_do === 1 ? 'jutro' : (typeof d.dni_do === 'number' ? 'za ' + d.dni_do + ' dni' : '');
      return '<div class="okn-karta"><b>' + esc(d.nazwa || '') + '</b><span class="okn-meta">' + esc([dzienTxt(d.data), d.miasto, kiedy].filter(Boolean).join(' · ')) + '</span></div>';
    }
    if (k.typ === 'wyzwanie') {
      var p = Math.max(0, Math.min(100, Number(d.procent) || 0));
      return '<div class="okn-karta okn-karta--wyz"><b>' + esc(d.nazwa || '') + '</b><span class="okn-meta">' + esc(p) + '%</span>' +
        '<span class="okn-pasek"><span style="width:' + p + '%"></span></span></div>';
    }
    if (k.typ === 'odznaka') return '<div class="okn-karta"><b>' + esc(d.nazwa || 'Odznaka') + '</b><span class="okn-meta">' + esc([dzienTxt(d.data), d.opis].filter(Boolean).join(' · ')) + '</span></div>';
    /* M3-2: forma (liczby z formaSeria + zdanie ze słownika kafla), znajomy (tylko profile publiczne, km z widoku publicznego) */
    if (k.typ === 'forma') return '<div class="okn-karta okn-karta--forma"><b>TSB ' + esc((Number(d.tsb) >= 0 ? '+' : '') + d.tsb) + '</b><span class="okn-meta">' +
      esc([d.etykieta, 'CTL ' + d.ctl, 'ATL ' + d.atl].filter(Boolean).join(' · ')) + '</span>' + (d.pod ? '<span class="okn-meta">' + esc(d.pod) + '</span>' : '') + '</div>';
    if (k.typ === 'znajomy') {
      if (!RE_UUID.test(String(d.id || ''))) return '';
      var tr = Number(d.treningi) || 0;
      return '<div class="okn-karta okn-karta--osoba"><b>' + esc(d.nazwa || 'Biegacz') + '</b><span class="okn-meta">' + esc(kmTxt(d.km) + ' km · ' + tr + ' ' + (window.BM_TEKST ? window.BM_TEKST.odmiana(tr, ['trening', 'treningi', 'treningów']) : 'treningów')) + '</span>' +
        '<button type="button" class="okn-chip" data-osoba="profil" data-id="' + esc(d.id) + '">Zobacz profil</button></div>';
    }
    if (k.typ === 'osoba') return kartaOsoby(d);
    if (k.typ === 'wyniki') return kartaWynikow(d);
    if (k.typ === 'impreza') return kartaImprezy(d);
    /* M3d: rekord (z profilu) i „Który to Ty?" (imiennicy w maszynie wyników; wybór zapisuje RPC po tapnięciu). */
    if (k.typ === 'rekord') return '<div class="okn-karta"><b>' + esc(d.dystans || '') + '</b><span class="okn-meta">' + esc([d.czas, d.rok, d.zrodlo === 'wyniki' ? 'z wyników zawodów' + (d.bieg ? ': ' + d.bieg : '') : ''].filter(Boolean).join(' · ')) + '</span></div>';
    if (k.typ === 'trener') return '<div class="okn-karta okn-karta--osoba"><b>' + esc(d.nazwa || 'Trener') + '</b><span class="okn-meta">' + esc(d.specjalizacja ? 'Twój trener · ' + d.specjalizacja : 'Twój trener') + '</span>' +
      '<button type="button" class="okn-otworz" data-plan="trener">Napisz</button></div>';
    if (k.typ === 'ktory_to_ty') return (Array.isArray(d.opcje) ? d.opcje : []).filter(function (o) { return RE_KLUCZ_F6.test(String(o.klucz || '')); }).slice(0, 5).map(function (o) {
      var meta = [o.rocznik ? 'rocznik ' + o.rocznik : '', o.starty != null ? startyTxt(Number(o.starty)) : '', o.ostatni ? 'ostatni: ' + o.ostatni : ''].filter(Boolean).join(' · ');
      return '<div class="okn-karta"><b>' + esc(o.nazwa || '') + '</b><span class="okn-meta">' + esc(meta) + '</span>' +
        '<button type="button" class="okn-otworz" data-ktoty="' + esc(o.klucz) + '">To ja</button></div>';
    }).join('');
    if (k.typ === 'utwor' || k.typ === 'przepis' || k.typ === 'cwiczenie' || k.typ === 'kat_ekran' || k.typ === 'kat_wyzwanie' || k.typ === 'kat_odznaka' || k.typ === 'kat_pojecie') return kartaKatalogu(k.typ, d);
    /* M3b: plan pusty — przycisk wywołuje ISTNIEJĄCĄ funkcję zawodnik.html po tapnięciu (openGenModal / czat z trenerem). */
    if (k.typ === 'plan_pusty') {
      if (d.stan === 'generator') return '<div class="okn-karta"><button type="button" class="okn-otworz" data-plan="generator">Ułóż plan</button></div>';
      if (d.stan === 'trener') return '<div class="okn-karta"><button type="button" class="okn-otworz" data-plan="trener">Napisz do trenera</button></div>';
      return '';
    }
    /* Projekt F dzień 3: karta akcji po starcie — nazwa z bazy, pasek, link zbiórki tylko https (safeExternalHref). */
    if (k.typ === 'akcja') {
      var p = Math.max(0, Math.min(100, Number(d.pct) || 0)), zb = d.url_zbiorki && window.safeExternalHref ? window.safeExternalHref(d.url_zbiorki, { tylkoHttps: true }) : '';
      return '<div class="okn-karta"><b>' + esc(d.nazwa || 'Akcja') + '</b><span class="okn-meta">' + esc(kmTxt(d.suma_km) + ' z ' + kmTxt(d.cel_km) + ' km · ' + Math.round(p) + '%' + (d.zamknieta ? ' · zrobione' : '')) + '</span>' +
        '<a class="okn-link" href="dla-fabianka.html">Szczegóły ›</a>' +
        (zb ? '<a class="okn-link" href="' + zb + '" target="_blank" rel="noopener noreferrer">Oficjalna zbiórka ›</a>' : '') + '</div>';
    }
    if (k.typ === 'start_nasz') return '<div class="okn-karta okn-karta--impreza"><b>' + esc(d.nazwa || '') + '</b><span class="okn-meta">' +
      esc([dataTxt(d.data), d.miasto || '', 'w naszych startach'].filter(Boolean).join(' · ')) + '</span>' +
      '<button type="button" class="okn-otworz" data-cel="' + esc(EKRANY.starty) + '">Otwórz w Startach</button></div>';
    return '';
  }

  /* M3a: impreza z kalendarza maszyny wyników — BEZ linków zewnętrznych (v1); domena źródła jako zwykły tekst. */
  /* Etap 5: „Strona imprezy ›" — tylko https przez safeExternalHref (CLAUDE.md), nowa karta, noopener; inaczej nic. */
  function linkImprezy(u) {
    var h = (u && window.safeExternalHref) ? window.safeExternalHref(u, { tylkoHttps: true }) : '';
    return h ? '<a class="okn-link" href="' + h + '" target="_blank" rel="noopener noreferrer">Strona imprezy ›</a>' : '';
  }
  function kartaImprezy(d) {
    var dyst = (Array.isArray(d.dystanse) ? d.dystanse : []).slice(0, 6).map(function (x) {
      var n = Number(x); return Math.abs(n - 42.195) < 0.3 ? 'maraton' : Math.abs(n - 21.0975) < 0.3 ? 'półmaraton' : kmTxt(n) + ' km';
    }).join(', ');
    var kiedy = (d.przeszla ? 'była ' : '') + (d.dokladnosc_daty === 'miesiac' ? miesiacTxt(d.data) : dataTxt(d.data));
    var meta = [kiedy, d.miasto || d.miejscowosc || '', dyst].filter(Boolean).join(' · ');
    return '<div class="okn-karta okn-karta--impreza"><b>' + esc(d.nazwa || '') + '</b><span class="okn-meta">' + esc(meta) + '</span>' +
      (d.zrodlo_domena ? '<span class="okn-meta">źródło: ' + esc(d.zrodlo_domena) + '</span>' : '') +
      (d.status === 'zgloszona' ? '<span class="okn-meta">zgłoszona przez biegacza</span>' : '') + linkImprezy(d.url) + '</div>';   // K5 (018)
  }

  /* M2b: karta osoby z aplikacji (tylko profile publiczne — filtr w EF). Przyciski wywołują ISTNIEJĄCE funkcje
     zawodnik.html po tapnięciu (openAthleteProfile, sendFriendFromSearch, openChatThread('peer')); id sprawdzone
     wzorcem UUID, przekazywane przez data-*, nigdy przez JS w atrybucie. */
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function kartaOsoby(d) {
    if (!RE_UUID.test(String(d.id || ''))) return '';
    var id = esc(d.id), nazwa = esc(d.nazwa || 'Biegacz');
    var znaj = d.znajomosc === 'znajomi' ? '<span class="okn-meta">✓ Znajomi</span>'
      : d.znajomosc === 'wyslano' ? '<span class="okn-meta">Zaproszenie wysłane</span>'
      : d.znajomosc === 'czeka' ? '<span class="okn-meta">Czeka na Twoją odpowiedź</span>'
      : '<button type="button" class="okn-chip" data-osoba="znajomy" data-id="' + id + '">Dodaj do znajomych</button>';
    return '<div class="okn-karta okn-karta--osoba"><b>' + nazwa + '</b><span class="okn-meta">' + (d.prywatny ? 'profil prywatny' : 'profil w BiegaMy') + '</span>' +
      '<div class="okn-ekrany"><button type="button" class="okn-chip" data-osoba="profil" data-id="' + id + '">Zobacz profil</button>' + znaj +
      '<button type="button" class="okn-chip" data-osoba="napisz" data-id="' + id + '" data-nazwa="' + nazwa + '">Napisz</button></div></div>';
  }
  function czasTxt(s) {
    s = Math.round(Number(s) || 0); if (!(s > 0)) return '';
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
  }
  function miesiacTxt(d) { var p = String(d || '').split('-'); return p.length >= 2 ? window.BM_TEKST.MIESIACE_MIANOWNIK[Number(p[1]) - 1] + ' ' + p[0] : ''; }
  function dataTxt(d) { var p = String(d || '').split('-'); return p.length === 3 ? Number(p[2]) + '.' + p[1] + '.' + p[0] : ''; }
  function startyTxt(n) { return n + ' ' + window.BM_TEKST.startow(n); }   // js/tekst.mjs
  /* M2b: wyniki z maszyny wyników (F6) — „N startów · ostatni: … · najlepszy czas …" + 5 ostatnich + „Otwórz wyniki". */
  function kartaWynikow(d) {
    var glowa = [d.starty != null ? startyTxt(Number(d.starty)) : '',
      d.ostatni && d.ostatni.bieg ? 'ostatni: ' + d.ostatni.bieg + (d.ostatni.data ? ' (' + dataTxt(d.ostatni.data) + ')' : '') : '',
      d.najlepszy_czas && d.najlepszy_czas.czas_s ? 'najlepszy czas ' + czasTxt(d.najlepszy_czas.czas_s) + (d.najlepszy_czas.dystans_km ? ' na ' + kmTxt(d.najlepszy_czas.dystans_km) + ' km' : '') : ''].filter(Boolean);
    var lista = (Array.isArray(d.ostatnie) ? d.ostatnie.slice(0, 5) : []).map(function (r) {
      return '<li>' + esc([dataTxt(r.data), r.bieg, czasTxt(r.czas_s), r.miejsce ? 'miejsce ' + r.miejsce : ''].filter(Boolean).join(' · ')) + '</li>';
    }).join('');
    var inne = (Array.isArray(d.inne) ? d.inne : []).map(function (x) {
      return esc((x.nazwa || '') + (x.rocznik ? ' (' + x.rocznik + ')' : '') + (x.starty != null ? ', ' + startyTxt(Number(x.starty)) : ''));
    }).join(' · ');
    return '<div class="okn-karta okn-karta--wyniki"><b>' + esc((d.nazwa || '') + (d.rocznik ? ' (' + d.rocznik + ')' : '')) + '</b>' +
      '<span class="okn-meta">' + esc(glowa.join(' · ')) + '</span>' + (lista ? '<ul class="okn-wyniki">' + lista + '</ul>' : '') +
      (inne ? '<span class="okn-meta">Też w wynikach: ' + inne + '</span>' : '') +
      '<button type="button" class="okn-otworz" data-cel="' + esc(EKRANY.starty) + '">Otwórz wyniki</button></div>';
  }

  /* M2b: tryb „osoba" — zdania z sieci (gdy były: etykieta i źródła), potem karty osób i wyników. */
  function htmlOsoby(json) {
    var zdania = (Array.isArray(json.zdania) ? json.zdania : []).filter(function (z) { return typeof z === 'string' && z; }).slice(0, 4);
    var zrodla = (Array.isArray(json.zrodla) ? json.zrodla : []).map(function (z) {
      var h = (z && typeof window.safeExternalHref === 'function') ? window.safeExternalHref(z.url, { tylkoHttps: true }) : '';
      return h ? '<li><a href="' + h + '" target="_blank" rel="noopener noreferrer">' + esc(z.tytul || 'źródło') + '</a></li>' : '';
    }).filter(Boolean);
    var html = (zrodla.length ? '<p class="okn-etykieta-siec">z sieci</p>' : '') + zdania.map(function (z) { return '<p class="okn-zdanie">' + esc(z) + '</p>'; }).join('');
    if (zrodla.length) html += '<p class="okn-zrodla-tytul">Źródła:</p><ul class="okn-zrodla">' + zrodla.join('') + '</ul>';
    return html + (Array.isArray(json.karty) ? json.karty.slice(0, 5).map(karta).join('') : '');
  }

  /* Odpowiedź EF → HTML. Status HTTP i offline decydują o stanie; tekst modelu zawsze przez esc.
     Okienko 2.0 (E0): odpowiedź z EF okienko-v2 niesie wersja:'v2' → mała etykieta, żeby testujący wiedział, która wersja odpowiada. */
  function htmlOdpowiedzi(status, json, tekst) {
    var tresc = htmlOdpowiedziTresc(status, json, tekst);
    if (!(status === 200 && json && json.wersja === 'v2')) return tresc;
    /* KCIUKI (Filip 3.11): tylko v2 i tylko gdy EF oddało log_id (wpis w okienko_v2_log) — ocena idzie przez RPC okienko_ocena; v1 bez zmian */
    var kciuki = (Number.isFinite(Number(json.log_id)) && Number(json.log_id) > 0) ? htmlKciukow(Number(json.log_id)) : '';
    return '<p class="okn-etykieta-siec okn-wersja">okienko 2.0</p>' + tresc + kciuki;
  }
  function htmlKciukow(id) {
    return '<div class="okn-kciuki" data-log="' + esc(String(id)) + '"><span class="okn-meta">Pomogło?</span>'
      + '<button type="button" class="okn-kciuk" data-ocena="1" aria-label="Tak, pomogło">👍</button>'
      + '<button type="button" class="okn-kciuk" data-ocena="-1" aria-label="Nie pomogło">👎</button></div>';
  }
  function ocen(id, ocena, komentarz) {
    try {
      if (!window.sb || typeof window.sb.rpc !== 'function') return Promise.resolve(false);
      return Promise.resolve(window.sb.rpc('okienko_ocena', { p_id: Number(id), p_ocena: ocena, p_komentarz: komentarz ? String(komentarz).slice(0, 300) : null }))
        .then(function (r) { return !(r && r.error); }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }
  function akcjaOceny(b) {
    var box = b.closest('.okn-kciuki'); if (!box) return;
    var id = box.getAttribute('data-log'), ocena = Number(b.getAttribute('data-ocena'));
    if (ocena === 1) { ocen(id, 1); box.innerHTML = '<span class="okn-meta">Dzięki!</span>'; return; }
    ocen(id, -1);   // 👎 liczy się od razu; komentarz jest opcjonalny i dopisuje się drugim wywołaniem
    box.innerHTML = '<textarea class="okn-kciuk-kom" maxlength="300" placeholder="Co było nie tak? (opcjonalnie)"></textarea>'
      + '<button type="button" class="okn-chip" data-kciuk-wyslij="' + esc(String(id)) + '">Wyślij</button>';
  }
  function akcjaKomentarza(b) {
    var box = b.closest('.okn-kciuki'); var ta = box ? box.querySelector('textarea') : null;
    ocen(b.getAttribute('data-kciuk-wyslij'), -1, ta ? ta.value.trim() : '');
    if (box) box.innerHTML = '<span class="okn-meta">Dzięki, przeczytamy.</span>';
  }
  function htmlOdpowiedziTresc(status, json, tekst) {
    if (status === 'offline') return '<p class="okn-zdanie">' + esc(TEKSTY.offline) + '</p>' + htmlEkranow(tekst);
    if (status === 429) return '<p class="okn-zdanie">' + esc(json && json.limit === 'miesiac' ? TEKSTY.miesiac : json && json.limit === 'siec' ? TEKSTY.siecLimit : TEKSTY.dzien) + '</p>' + htmlEkranow(tekst);
    if (status !== 200 || !json) return '<p class="okn-zdanie">' + esc(TEKSTY.blad) + '</p>';
    if (json.tryb === 'siec' || json.tryb === 'siec-cache') return htmlSieci(json);
    if (json.tryb === 'osoba' || json.tryb === 'impreza') return htmlOsoby(json);   // ten sam układ: sieć ze źródłami → karty   // M2d: odpowiedź z pamięci wygląda jak z sieci (źródła te same)
    var cel = bezpiecznyCel(json.akcja && json.akcja.nawiguj);
    var zdania = Array.isArray(json.zdania) ? json.zdania.filter(function (z) { return typeof z === 'string' && z; }) : [];
    if (!zdania.length && !cel) zdania = [TEKSTY.pusto];
    var html = zdania.slice(0, 2).map(function (z) { return '<p class="okn-zdanie">' + esc(z) + '</p>'; }).join('');
    html += (Array.isArray(json.karty) ? json.karty.slice(0, 5).map(karta).join('') : '');
    /* Filip 3.11: chipy z odpowiedzi (reakcja / niska pewność) — etykieta na przycisku, pytanie w data-pytanie (ten sam klik co podpowiedzi) */
    if (Array.isArray(json.chipy) && json.chipy.length) html += '<div class="okn-chipy">' + json.chipy.slice(0, 4).filter(function (c) { return c && typeof c.pytanie === 'string' && typeof c.etykieta === 'string'; })
      .map(function (c) { return '<button type="button" class="okn-chip" data-pytanie="' + esc(c.pytanie) + '">' + esc(c.etykieta) + '</button>'; }).join('') + '</div>';
    if (cel) html += '<button type="button" class="okn-otworz" data-cel="' + esc(cel) + '">Otwórz ›</button>';
    return html;
  }

  /* M2a: odpowiedź z sieci — etykieta „z sieci", zdania (≤ 3), „Źródła:" jako linki (tylko https przez
     safeExternalHref {tylkoHttps}, rel noopener, nowa karta). Bez kart i bez „Otwórz ›". Źródło bez https = pominięte. */
  function htmlSieci(json) {
    var zdania = (Array.isArray(json.zdania) ? json.zdania : []).filter(function (z) { return typeof z === 'string' && z; }).slice(0, 3);
    var zrodla = (Array.isArray(json.zrodla) ? json.zrodla : []).map(function (z) {
      var h = (z && typeof window.safeExternalHref === 'function') ? window.safeExternalHref(z.url, { tylkoHttps: true }) : '';
      return h ? '<li><a href="' + h + '" target="_blank" rel="noopener noreferrer">' + esc(z.tytul || 'źródło') + '</a></li>' : '';
    }).filter(Boolean);
    if (!zdania.length || !zrodla.length) return '<p class="okn-etykieta-siec">z sieci</p><p class="okn-zdanie">' + esc(TEKSTY.siecPusto) + '</p>';
    return '<p class="okn-etykieta-siec">z sieci</p>' + zdania.map(function (z) { return '<p class="okn-zdanie">' + esc(z) + '</p>'; }).join('') +
      '<p class="okn-zrodla-tytul">Źródła:</p><ul class="okn-zrodla">' + zrodla.join('') + '</ul>';
  }

  /* OKIENKO 2.0 — E0 (Filip 3.11, docs/projekt-okienko-2-0-2026-11-03.md §2): wersję wybiera BAZA przez RPC okienko_wersja()
     (lista okienko_v2_konta + okienko_ustawienia), raz na sesję strony; błąd, offline, brak RPC → v1. Nagłówek X-Okienko-Wersja: v1
     z EF v2 (awaria modelu) = do końca sesji v1. Kształt odpowiedzi obu wersji identyczny; v2 dokłada wersja:'v2' → etykieta. */
  var _wersja = null;
  function wersjaOkienka() {
    if (_wersja) return Promise.resolve(_wersja);
    var r = null;
    try { r = (window.sb && typeof window.sb.rpc === 'function') ? window.sb.rpc('okienko_wersja') : null; } catch (e) { r = null; }
    if (!r) { _wersja = 'v1'; return Promise.resolve(_wersja); }
    return Promise.resolve(r).then(function (x) { _wersja = (x && x.data === 'v2') ? 'v2' : 'v1'; return _wersja; })
      .catch(function () { _wersja = 'v1'; return _wersja; });
  }
  function adresOkienka(wersja) { return window.SB_URL + '/functions/v1/' + (wersja === 'v2' ? 'okienko-v2' : 'okienko'); }

  var historia = [];
  async function zapytaj(tekst) {
    tekst = String(tekst || '').trim().slice(0, 300);
    if (!tekst) return { status: 0, json: null };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline', json: null };
    var sesja = null;
    try { sesja = (await window.sb.auth.getSession()).data.session; } catch (e) {}
    if (!sesja) return { status: 401, json: null };
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    try {
      var wersja = await wersjaOkienka();
      var r = await fetch(adresOkienka(wersja), {
        method: 'POST', signal: ctrl ? ctrl.signal : undefined, credentials: 'omit', cache: 'no-store',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + sesja.access_token, 'apikey': window.SB_KEY },
        body: JSON.stringify({ tekst: tekst, ekran: 'home', historia: historia.slice(-3) })
      });
      try { if (wersja === 'v2' && r.headers && r.headers.get('x-okienko-wersja') === 'v1') _wersja = 'v1'; } catch (e) {}
      var j = await r.json().catch(function () { return null; });
      if (r.status === 200 && j && Array.isArray(j.zdania) && j.zdania.length) historia.push({ q: tekst, a: j.zdania.join(' ').slice(0, 300) });
      return { status: r.status, json: j };
    } catch (e) {
      return { status: (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 502, json: null };
    } finally { if (t) clearTimeout(t); }
  }

  function chipy() {
    var ostatnie = czytaj(KLUCZ_OSTATNIE, []);
    var lista = PODPOWIEDZI.slice(0, 3).concat(Array.isArray(ostatnie) ? ostatnie.slice(0, 2) : []);
    var bylo = {};
    return lista.filter(function (q) { var k = String(q).toLowerCase(); if (bylo[k]) return false; bylo[k] = 1; return true; })
      .map(function (q) { return '<button type="button" class="okn-chip" data-pytanie="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
  }

  function el(id) { return document.getElementById(id); }

  /* M3-1 (3): POGODA po stronie klienta — to samo źródło co kafel na Dziś (sessionStorage weather:<miasto>, EF get-weather,
     30 min), 0 tokenów, bez wywołania EF (więc bez wpisu w okienko_log). Dziś / jutro / pojutrze; inne miasto w pytaniu
     niż w kaflu → mówimy, dla którego miasta mamy pogodę. Brak kafla (miasto nieustawione) → odsyłamy do Profilu. */
  function opisPogody(c) {
    c = Number(c);
    if (c >= 95) return 'burza';
    if ([71, 73, 75, 77, 85, 86].indexOf(c) >= 0) return 'śnieg';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'deszcz';
    if (c === 45 || c === 48) return 'mgła';
    return { 0: 'słonecznie', 1: 'przeważnie słonecznie', 2: 'częściowe zachmurzenie', 3: 'pochmurno' }[c] || 'zmienne zachmurzenie';
  }
  function pogodaLokalnie(tekst) {
    var n = window.BM_TEKST ? window.BM_TEKST.normalizuj(tekst) : String(tekst || '').toLowerCase();
    if (!/\bpogod/.test(n)) return null;
    var dane = null;
    try { for (var i = 0; i < sessionStorage.length; i++) { var k = sessionStorage.key(i); if (k && k.indexOf('weather:') === 0) { var c = JSON.parse(sessionStorage.getItem(k) || 'null'); if (c && c.data && c.data.days && c.data.days.length) { dane = c.data; break; } } } } catch (e) {}
    if (!dane) return '<p class="okn-zdanie">' + esc('Pogodę biorę z kafla na Dziś — ustaw miasto w Profilu, a powiem, co jutro.') + '</p><button type="button" class="okn-otworz" data-cel="' + esc(EKRANY.profil) + '">Otwórz Profil ›</button>';
    var idx = /pojutrz/.test(n) ? 2 : /jutr/.test(n) ? 1 : 0;
    var d = dane.days[idx] || dane.days[0];
    var kiedy = idx === 2 && dane.days[2] ? 'Pojutrze' : idx >= 1 && dane.days[1] ? 'Jutro' : 'Dziś';
    var m = n.match(/\b(w|we)\s+([a-z]{3,})\s*$/), miasto = dane.city || '';
    var ra = m && window.BM_TEKST ? window.BM_TEKST.rdzen(m[2]) : '', rb = window.BM_TEKST ? window.BM_TEKST.rdzen(window.BM_TEKST.tylkoLitery(miasto)) : '';
    var inne = m && ra && rb && !(ra.indexOf(rb) === 0 || rb.indexOf(ra) === 0) ? ' Mam pogodę tylko dla miasta ' + miasto + ' (z kafla na Dziś).' : '';
    var zd = kiedy + (miasto ? ' (' + miasto + ')' : '') + ': ' + opisPogody(d.weather_code) + (d.temp_max != null ? ', do ' + Math.round(Number(d.temp_max)) + '°C' : '') + (d.precip_pct != null ? ', opady ' + Math.round(Number(d.precip_pct)) + '%' : '') + '.' + inne;
    return '<p class="okn-zdanie">' + esc(zd) + '</p>';
  }

  async function wyslij(tekst) {
    var wynik = el('okienko-wynik'); if (!wynik) return;
    var lokalnie = pogodaLokalnie(tekst);
    if (lokalnie) { wynik.innerHTML = lokalnie; zapamietajPytanie(tekst); return; }
    wynik.innerHTML = '<div class="okn-szkielet" aria-hidden="true"></div>';
    wynik.setAttribute('aria-busy', 'true');
    var o = await zapytaj(tekst);
    wynik.removeAttribute('aria-busy');
    wynik.innerHTML = htmlOdpowiedzi(o.status, o.json, tekst);
    zapamietajPytanie(tekst);
  }
  function zapamietajPytanie(tekst) {
    var ost = czytaj(KLUCZ_OSTATNIE, []);
    if (!Array.isArray(ost)) ost = [];
    zapisz(KLUCZ_OSTATNIE, [tekst].concat(ost.filter(function (q) { return q !== tekst; })).slice(0, 5));
  }

  function otworz() {
    var ov = el('okienko-arkusz'); if (!ov) return;
    var ch = el('okienko-chipy'); if (ch) ch.innerHTML = chipy();
    ov.classList.add('open'); ov.setAttribute('aria-hidden', 'false');
    wersjaOkienka();   // E0: RPC rusza przy otwarciu arkusza, żeby pierwsze pytanie nie czekało na przełącznik
    var we = el('okienko-tekst'); if (we) setTimeout(function () { try { we.focus(); } catch (e) {} }, 50);
  }
  function zamknij() { var ov = el('okienko-arkusz'); if (ov) { ov.classList.remove('open'); ov.setAttribute('aria-hidden', 'true'); } }

  /* Pole „Zapytaj" dla KAŻDEGO zalogowanego na Dziś (decyzja Filipa 1.11 13:33 — koniec trybu podglądu z parametru
     w adresie i klucza w pamięci przeglądarki). BEZ wyjątku dla ?from=trener (1.11 16:2x): ten parametr mówi tylko,
     SKĄD przyszedłeś (link „Widok zawodnika" z panelu trenera; dolny pasek dokleja go do każdego ekranu), a nie CZYJE
     dane widzisz — zawodnik.html zawsze pokazuje zalogowanego, więc EF odpowiada danymi właściwej osoby. Do 1.11 wyjątek
     chował pole każdemu trenerowi-zawodnikowi (LEKCJE #31). dataset.wlaczone = pole podpięte (showSection odsłania tylko podpięte). */
  function podepnij() {
    var pole = el('okienko-pole'); if (!pole) return;
    pole.dataset.wlaczone = '1';
    pole.style.display = '';
    var p = podpowiedz();
    var etk = el('okienko-podpowiedz'); if (etk) etk.textContent = p;
    var we = el('okienko-tekst'); if (we) we.setAttribute('placeholder', p);
    pole.addEventListener('click', otworz);
    var ov = el('okienko-arkusz');
    if (ov) ov.addEventListener('click', function (e) {
      if (e.target === ov) return zamknij();
      var b = e.target.closest ? e.target.closest('[data-pytanie],[data-cel],[data-osoba],[data-plan],[data-katalog],[data-ktoty],[data-ocena],[data-kciuk-wyslij]') : null;
      if (!b) return;
      if (b.hasAttribute('data-ocena')) return akcjaOceny(b);
      if (b.hasAttribute('data-kciuk-wyslij')) return akcjaKomentarza(b);
      if (b.hasAttribute('data-ktoty')) return akcjaKtoTy(b);
      if (b.hasAttribute('data-katalog')) return akcjaKatalogu(b);
      if (b.hasAttribute('data-osoba')) return akcjaOsoby(b);
      if (b.hasAttribute('data-plan')) return akcjaPlanu(b.getAttribute('data-plan'));
      if (b.hasAttribute('data-pytanie')) { var q = b.getAttribute('data-pytanie'); if (we) we.value = q; wyslij(q); }
      else { var c = bezpiecznyCel(b.getAttribute('data-cel')); if (c) location.href = c; }
    });
    var f = el('okienko-form');
    if (f) f.addEventListener('submit', function (e) { e.preventDefault(); if (we && we.value.trim()) wyslij(we.value); });
    var x = el('okienko-zamknij'); if (x) x.addEventListener('click', zamknij);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') zamknij(); });
  }

  /* M3c: karty katalogu. Utwór → radio.html?utwor=<uuid> (odtwarzacz zostaje w radio.html), przepis →
     nutrition.html?przepis=<uuid>, ćwiczenie → istniejące deep linki ?tab=cwiczenia&prog=/&breath=/&cw=wzmacnianie,
     ekran/wyzwanie/odznaka → ekran z listy EKRANY. Id i klucze sprawdzane wzorcem, przekazywane przez data-*. */
  var RE_KLUCZ = /^[A-Za-z0-9]{1,30}$/;
  var RE_KLUCZ_F6 = /^[a-z0-9_-]{2,30}:[A-Za-z0-9._-]{1,80}$/;
  /* M3d: „To ja" → RPC ustaw_f6_runner_key (auth.uid(), jedyny zapis tej ścieżki), potem to samo pytanie jeszcze raz. */
  function akcjaKtoTy(b) {
    var k = b.getAttribute('data-ktoty') || '';
    if (!RE_KLUCZ_F6.test(k) || !window.sb || typeof window.sb.rpc !== 'function') return Promise.resolve(false);
    b.disabled = true;
    return Promise.resolve(window.sb.rpc('ustaw_f6_runner_key', { p_key: k })).then(function (r) {
      if (r && r.error) { b.disabled = false; return false; }
      wyslij('moje wyniki'); return true;
    }, function () { b.disabled = false; return false; });
  }
  var RODZAJ_CW = { prog: 'Otwórz program', breath: 'Otwórz oddech', cw: 'Otwórz ćwiczenia' };
  function kartaKatalogu(typ, d) {
    if (typ === 'utwor') {
      if (!RE_UUID.test(String(d.id || ''))) return '';
      var okl = (window.RADIO && window.safeUrlAttr && d.cover_slug) ? window.safeUrlAttr(window.RADIO.coverUrl({ cover_slug: d.cover_slug })) : '';
      return '<div class="okn-karta">' + (okl ? '<img src="' + okl + '" alt="" width="40" height="40" style="border-radius:8px;object-fit:cover;">' : '') +
        '<b>' + esc(d.tytul || '') + '</b>' + (d.wykonawca ? '<span class="okn-meta">' + esc(d.wykonawca) + '</span>' : '') +
        '<button type="button" class="okn-otworz" data-katalog="utwor" data-id="' + esc(d.id) + '">▶ Odtwórz</button></div>';
    }
    if (typ === 'przepis') {
      if (!RE_UUID.test(String(d.id || ''))) return '';
      return '<div class="okn-karta"><b>' + esc((d.emoji ? d.emoji + ' ' : '') + (d.tytul || '')) + '</b><span class="okn-meta">przepis</span>' +
        '<button type="button" class="okn-otworz" data-katalog="przepis" data-id="' + esc(d.id) + '">Otwórz w Jedzeniu</button></div>';
    }
    if (typ === 'cwiczenie') {
      if (!RODZAJ_CW[d.rodzaj] || !RE_KLUCZ.test(String(d.klucz || ''))) return '';
      return '<div class="okn-karta"><b>' + esc(d.nazwa || '') + '</b><span class="okn-meta">ćwiczenia</span>' +
        '<button type="button" class="okn-otworz" data-katalog="cwiczenie" data-rodzaj="' + esc(d.rodzaj) + '" data-klucz="' + esc(d.klucz) + '">' + esc(RODZAJ_CW[d.rodzaj]) + '</button></div>';
    }
    /* M3-2 (b): pojęcie z kafla Forma (tekst „Co to jest" z sb.js) albo fakt o aplikacji; przycisk tylko gdy jest ekran */
    if (typ === 'kat_pojecie') {
      var celP = bezpiecznyCel(d.cel);
      return '<div class="okn-karta okn-karta--pojecie"><b>' + esc(d.tytul || '') + '</b><span class="okn-meta">' + esc(d.co_to || '') + '</span>' +
        (celP ? '<button type="button" class="okn-otworz" data-cel="' + esc(celP) + '">Otwórz ' + esc(d.ekran_nazwa || '') + ' ›</button>' : '') + '</div>';
    }
    var cel = typ === 'kat_ekran' ? bezpiecznyCel(d.cel) : typ === 'kat_wyzwanie' ? EKRANY.wyzwania : EKRANY.odznaki;
    if (!cel) return '';
    var co = typ === 'kat_ekran' ? 'ekran' : typ === 'kat_wyzwanie' ? 'wyzwanie' : 'odznaka';
    return '<div class="okn-karta"><b>' + esc(d.nazwa || '') + '</b><span class="okn-meta">' + esc(typ === 'kat_odznaka' && d.opis ? co + ' · ' + d.opis : co) + '</span>' +
      '<button type="button" class="okn-otworz" data-cel="' + esc(cel) + '">Otwórz ›</button></div>';
  }
  function akcjaKatalogu(b) {
    var co = b.getAttribute('data-katalog'), id = b.getAttribute('data-id') || '';
    if (co === 'utwor' && RE_UUID.test(id)) { location.href = 'radio.html?utwor=' + encodeURIComponent(id); return; }
    if (co === 'przepis' && RE_UUID.test(id)) { location.href = 'nutrition.html?przepis=' + encodeURIComponent(id); return; }
    if (co === 'cwiczenie') {
      var r = b.getAttribute('data-rodzaj'), k = b.getAttribute('data-klucz') || '';
      if (!RODZAJ_CW[r] || !RE_KLUCZ.test(k)) return;
      location.href = 'zawodnik.html?tab=cwiczenia&' + (r === 'cw' ? 'cw=wzmacnianie' : r + '=' + encodeURIComponent(k));
    }
  }

  /* M3b: „Ułóż plan" → istniejący modal generatora; „Napisz do trenera" → czat z trenerem (jak powiadomienie). */
  function akcjaPlanu(co) {
    zamknij();
    if (co === 'generator' && typeof window.openGenModal === 'function') window.openGenModal();
    if (co === 'trener' && typeof window.openChatThread === 'function') {
      if (typeof window.showSection === 'function') window.showSection('msgs');
      setTimeout(function () { window.openChatThread('coach', null, null); }, 400);
    }
  }

  /* M2b: akcje karty osoby — istniejące funkcje zawodnik.html; brak funkcji = nic (np. na innej stronie). */
  function akcjaOsoby(b) {
    var id = b.getAttribute('data-id') || '', co = b.getAttribute('data-osoba');
    if (!RE_UUID.test(id)) return;
    if (co === 'znajomy') { if (typeof window.sendFriendFromSearch === 'function') window.sendFriendFromSearch(id, b); return; }
    zamknij();
    if (co === 'profil' && typeof window.openAthleteProfile === 'function') window.openAthleteProfile(id);
    if (co === 'napisz' && typeof window.openChatThread === 'function') {
      if (typeof window.showSection === 'function') window.showSection('msgs');
      var nazwa = b.getAttribute('data-nazwa') || null;
      setTimeout(function () { window.openChatThread('peer', id, nazwa); }, 400);
    }
  }

  window.OKIENKO = { zapytaj: zapytaj, htmlOdpowiedzi: htmlOdpowiedzi, bezpiecznyCel: bezpiecznyCel, wyszukajEkrany: wyszukajEkrany,
    podpowiedz: podpowiedz, otworz: otworz, zamknij: zamknij, EKRANY: EKRANY, TEKSTY: TEKSTY, akcjaOsoby: akcjaOsoby, akcjaPlanu: akcjaPlanu, akcjaKatalogu: akcjaKatalogu, NAZWY_EKRANOW: NAZWY_EKRANOW, akcjaKtoTy: akcjaKtoTy, pogodaLokalnie: pogodaLokalnie };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', podepnij); else podepnij();
})();
