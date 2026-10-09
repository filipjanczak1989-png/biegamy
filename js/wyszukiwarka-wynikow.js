/* Wyszukiwarka wyników (races.html, sekcja „Wyniki zawodników") — klasyczny skrypt, bez modułów ES:
   <script src="js/wyszukiwarka-wynikow.js"> po sb.js, więc deploy nadaje mu ?v= jak reszcie js/*.js.
     window.initResultsSearch({ client: sb, root })
   Dane wyłącznie przez textContent; linki przez window.safeExternalHref (sb.js). Kolory tylko ze zmiennych
   theme.css (--card, --fg, --accent, --muted, --border) — bez wartości awaryjnych, motywy działają same.
   RPC (migracje 20261010_wyniki_*): search_runners(q) → grupy po runner_key, runner_results(p_runner_key);
   obie SECURITY INVOKER i tylko dla authenticated. probable=true → część wyników dopięta po nazwisku i roczniku
   (reguła name_yob_unique), stąd oznaczenie „prawdopodobnie".
   Importu profilu Enduhub NIE MA (decyzja 9.10: regulamin Enduhub V.5.c, SOURCES.md w paczce). */
(function () {
  'use strict';

  function fmtTime(s) {
    if (s == null) return '–';
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return h ? h + ':' + p(m) + ':' + p(sec) : m + ':' + p(sec);
  }

  function fmtPace(s, km) {
    if (!s || !km) return '';
    var spk = Math.round(s / km);
    return Math.floor(spk / 60) + ':' + String(spk % 60).padStart(2, '0') + '/km';
  }

  function liczbaWynikow(n) {
    var d = n % 10, s = n % 100;
    return n + (n === 1 ? ' wynik' : d >= 2 && d <= 4 && (s < 12 || s > 14) ? ' wyniki' : ' wyników');
  }

  function el(doc, tag, props) {
    var n = doc.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    for (var i = 3; i < arguments.length; i++) if (arguments[i]) n.append(arguments[i]);
    return n;
  }

  /* safeExternalHref (sb.js) zwraca adres PO escapeHtml — pod szablony innerHTML. Tu href idzie przez
     setAttribute, więc encje trzeba odwrócić (dokładnie 5 z escapeHtml), inaczej link z parametrami
     dostałby dosłowne „&amp;". Walidacja protokołu zostaje w sb.js. */
  var ENCJE = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  function hrefZewnetrzny(url) {
    return String(window.safeExternalHref(url) || '').replace(/&(?:amp|lt|gt|quot|#39);/g, function (e) { return ENCJE[e]; });
  }

  var CSS =
    '.rs{font:inherit;color:var(--fg)}' +
    '.rs input{width:100%;box-sizing:border-box;padding:.6rem;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--fg)}' +
    '.rs ul{list-style:none;margin:.5rem 0;padding:0}' +
    '.rs li button{width:100%;text-align:left;padding:.6rem;margin:.2rem 0;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--fg);cursor:pointer}' +
    '.rs li button:hover{border-color:var(--accent)}' +
    '.rs .muted{color:var(--muted);font-size:.85em}' +
    '.rs .prawd{color:var(--accent);font-size:.8em}' +
    '.rs table{width:100%;border-collapse:collapse;font-size:.9em}' +
    '.rs td,.rs th{padding:.35rem;border-bottom:1px solid var(--border);text-align:left}' +
    '.rs a{color:var(--accent)}' +
    '.rs .priv{color:var(--accent);font-size:.8em}';

  function initResultsSearch(opts) {
    var client = opts.client, root = opts.root, debounceMs = opts.debounceMs == null ? 350 : opts.debounceMs;
    var doc = root.ownerDocument;
    root.textContent = '';
    var style = el(doc, 'style', { text: CSS });
    var input = el(doc, 'input', { type: 'search', placeholder: 'Imię i nazwisko, np. Jan Kowalski', 'aria-label': 'Szukaj zawodnika', autocomplete: 'off' });
    var status = el(doc, 'p', { class: 'muted', role: 'status' });
    var list = el(doc, 'ul');
    var detail = el(doc, 'div');
    root.append(el(doc, 'div', { class: 'rs' }, style, input, status, list, detail));

    var timer = null, seq = 0;

    async function search(q) {
      var my = ++seq;
      list.textContent = ''; detail.textContent = '';
      if (q.trim().length < 3) { status.textContent = q.trim() ? 'Wpisz co najmniej 3 znaki.' : ''; return; }
      status.textContent = 'Szukam…';
      var res = await client.rpc('search_runners', { q: q.trim() });
      if (my !== seq) return;
      if (res.error) { status.textContent = 'Błąd wyszukiwania. Spróbuj ponownie.'; return; }
      var data = res.data || [];
      if (!data.length) { status.textContent = 'Brak wyników.'; return; }
      status.textContent = data.length > 1 ? 'Znaleziono ' + data.length + ' osób – wybierz właściwą:' : '';
      data.forEach(function (c) {
        var sub = [c.yob ? 'rocznik ' + c.yob : 'rocznik nieznany', liczbaWynikow(Number(c.results_count)), c.last_city, c.last_event].filter(Boolean).join(' · ');
        var b = el(doc, 'button', { type: 'button', onclick: function () { open(c); } },
          el(doc, 'strong', { text: c.display_name }),
          c.probable ? el(doc, 'span', { class: 'prawd', text: ' · prawdopodobnie', title: 'Część wyników dopasowana po nazwisku i roczniku' }) : null,
          el(doc, 'br'), el(doc, 'span', { class: 'muted', text: sub }));
        list.append(el(doc, 'li', {}, b));
      });
    }

    async function open(c) {
      detail.textContent = 'Ładuję…';
      var res = await client.rpc('runner_results', { p_runner_key: c.runner_key });
      if (res.error) { detail.textContent = 'Nie udało się pobrać wyników.'; return; }
      detail.textContent = '';
      detail.append(el(doc, 'h3', { text: c.display_name }));
      if (c.probable) detail.append(el(doc, 'p', { class: 'prawd', text: 'Prawdopodobnie — część wyników dopasowana po nazwisku i roczniku, nie po identyfikatorze ze źródła.' }));
      var head = el(doc, 'tr', {});
      ['Data', 'Zawody', 'Dyst.', 'Czas', 'Tempo', 'Miejsce'].forEach(function (t) { head.append(el(doc, 'th', { text: t })); });
      var tbody = el(doc, 'tbody');
      (res.data || []).forEach(function (r) {
        var nameCell = el(doc, 'td');
        var href = r.result_url ? hrefZewnetrzny(r.result_url) : '';
        nameCell.append(href
          ? el(doc, 'a', { href: href, rel: 'noopener noreferrer', target: '_blank', text: r.event_name || '' })
          : doc.createTextNode(r.event_name || ''));
        if (r.scope === 'private') nameCell.append(el(doc, 'span', { class: 'priv', text: ' 🔒 tylko Ty' }));
        var km = Number(r.distance_km);
        tbody.append(el(doc, 'tr', {},
          el(doc, 'td', { text: r.event_date || '' }), nameCell,
          el(doc, 'td', { text: r.distance_km ? km + ' km' : '' }),
          el(doc, 'td', { text: fmtTime(r.time_seconds) }),
          el(doc, 'td', { text: fmtPace(r.time_seconds, km) }),
          el(doc, 'td', { text: r.position_total ? r.position_total + (r.position_category ? ' (kat. ' + r.position_category + ')' : '') : '' })));
      });
      detail.append(el(doc, 'table', {}, el(doc, 'thead', {}, head), tbody));
    }

    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { search(input.value); }, debounceMs); });

    return { search: search, destroy: function () { clearTimeout(timer); root.textContent = ''; } };
  }

  window.initResultsSearch = initResultsSearch;
  window._wyszukiwarkaWynikow = { fmtTime: fmtTime, fmtPace: fmtPace, liczbaWynikow: liczbaWynikow };
})();
