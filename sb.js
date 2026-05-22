// ════════════════════════════════════════════════════════════════════
// BiegaMy — Supabase client + Push helpers (single source of truth)
// ════════════════════════════════════════════════════════════════════
// Załączany w <head> KAŻDEJ strony PO supabase-js CDN:
//
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="sb.js" defer></script>
//
// Eksponuje globalnie:
//   window.SB_URL, SB_KEY, SB_FN_URL — config
//   window.sb — klient Supabase
//   window.assetUrl(path) — URL do publicznego pliku w biegamy-assets
//   window.VAPID_PUBLIC_KEY — public key (NIE secret, OK w przeglądarce)
//   window.isPushSupported() / getPushPermission() / isPushSubscribed()
//   window.subscribeToPush(athleteId) / window.unsubscribeFromPush()
//   window.escapeHtml(s) — anti-XSS escape
//   window.renderMessageBody(rawBody) — bezpieczny render wiadomości czatu
//   window.renderAIReportCard(r, opts) — pigułka raportu AI (panel/modal)
//   window.safeUrlAttr(url) — escape URL dla atrybutu src/href (whitelist hostów, https-only)
//   window.safeExternalHref(url) — escape URL dla <a href> do linków zewnętrznych (https/http-only, bez whitelisty hostów)
//   window.LOG — production-silent console (debug/log/info/warn → no-op na prod)
//   window.showToast(msg, type) — toast UI zamiast alert()
//   window.QUOTES_LIBRARY — biblioteka cytatów (64, {text, author}) — single source of truth (zawodnik/raporty/kalendarz)
//   window.getDailyQuote(offsetDays=0) — 1 cytat per dzień (deterministyczny seed YYYYMMDD)
//   window.getDailyQuoteSet(count=5) — N deterministycznie zshuffle'owanych cytatów (Mulberry32)
// ════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  window.SB_URL = 'https://afqojgkaveykxbltxzwm.supabase.co';
  window.SB_KEY = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';
  window.SB_FN_URL = window.SB_URL + '/functions/v1';

  // ─── ASSET URL HELPER ───────────────────────────────────────────────
  // Buduje URL do publicznego zasobu w bucketcie biegamy-assets (GitHub Pages).
  // Użycie: assetUrl('banner1.webp') → https://filipjanczak1989-png.github.io/biegamy-assets/banner1.webp
  window.assetUrl = function(path) {
    if (!path) return '';
    const clean = String(path).replace(/^\/+/, '');
    return 'https://filipjanczak1989-png.github.io/biegamy-assets/' + clean;
  };

  // ⚠️ VAPID PUBLIC KEY
  // To NIE jest secret — może być publicznie widoczne.
  window.VAPID_PUBLIC_KEY = 'BATC1Y7rglazNCcKQXV1bqaNA_SnxC3003c5_eSKDBaUykhbZSUevTQDL-KMyVDs55oNBJogJkx4g_5irwUObTk';

  // Klient Supabase (tylko jeśli SDK jest załadowane)
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    window.sb = window.supabase.createClient(window.SB_URL, window.SB_KEY);
  }

  // ─── PUSH NOTIFICATIONS HELPERS ─────────────────────────────────────

  // Konwersja base64url → Uint8Array (wymagane przez PushManager.subscribe)
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Czy przeglądarka wspiera push?
  window.isPushSupported = function() {
    return 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  };

  // Aktualny status uprawnień (default | granted | denied | unsupported)
  window.getPushPermission = function() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  };

  // Czy aktualnie mamy aktywną subskrypcję?
  window.isPushSubscribed = async function() {
    if (!window.isPushSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (e) { return false; }
  };

  // SUBSCRIBE — pyta o pozwolenie i zapisuje endpoint do bazy
  window.subscribeToPush = async function(athleteId) {
    if (!window.isPushSupported()) {
      return { ok: false, error: 'Twoja przeglądarka nie wspiera powiadomień' };
    }
    if (!athleteId) {
      return { ok: false, error: 'Brak athlete_id' };
    }
    if (!window.VAPID_PUBLIC_KEY || window.VAPID_PUBLIC_KEY === 'TUTAJ_WKLEJ_VAPID_PUBLIC_KEY') {
      return { ok: false, error: 'VAPID_PUBLIC_KEY nie skonfigurowany w sb.js' };
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { ok: false, error: 'Pozwolenie odrzucone przez użytkownika' };
      }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      let sub;
      if (existing) {
        sub = existing;
      } else {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY),
        });
      }

      const subJson = sub.toJSON();
      const { error } = await window.sb.from('push_subscriptions').upsert({
        athlete_id: athleteId,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      }, { onConflict: 'endpoint' });

      if (error) {
        console.warn('[push] save failed:', error.message);
        return { ok: false, error: 'Nie udało się zapisać: ' + error.message };
      }

      return { ok: true };
    } catch (e) {
      console.error('[push] subscribe error:', e);
      return { ok: false, error: e.message || 'Błąd subskrypcji' };
    }
  };

  // UNSUBSCRIBE — usuwa subskrypcję z przeglądarki i bazy
  window.unsubscribeFromPush = async function() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await window.sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // ─── SECURITY: HTML escape (anti-XSS) ───────────────────────────────
  // Używaj WSZĘDZIE gdzie wstawiasz user-content do innerHTML
  // np. ${escapeHtml(m.body)}, ${escapeHtml(g.name)}
  window.escapeHtml = function(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ── UI helper: type pill renderer (anti-XSS) ──────────────────────
  // Renderuje pigułkę z typem treningu (kolor + ikonka SVG + tekst).
  // Używana w karcie loga, modal-u treningu, week-strip i kalendarzu.
  // Type escape'owany defensywnie — bo to user-input z athletes.training_type.
  function renderTypePill(type, opts) {
    if (!type) return '';
    opts = opts || {};
    const size = opts.size || 'md';
    const map = {
      'Spokojny':       {color:'#5090e0', icon:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9.5" x2="9.01" y2="9.5"/><line x1="15" y1="9.5" x2="15.01" y2="9.5"/>'},
      'Bieg spokojny':  {color:'#5090e0', icon:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9.5" x2="9.01" y2="9.5"/><line x1="15" y1="9.5" x2="15.01" y2="9.5"/>'},
      'Interwały':      {color:'#e8b840', icon:'<polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'},
      'Tempo':          {color:'#f06030', icon:'<circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 15 15"/><line x1="9" y1="3" x2="15" y2="3"/>'},
      'Wybieganie':     {color:'#3db870', icon:'<path d="M3 18 C 6 14, 9 10, 12 10 C 15 10, 18 14, 21 18"/><path d="M9 14 L 9 14.5"/><path d="M15 14 L 15 14.5"/>'},
      'Regeneracja':    {color:'#9a6fe8', icon:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'},
      'Wzmacniający':   {color:'#f0a830', icon:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'},
      'Zastępczy':      {color:'#888888', icon:'<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'},
      'Start':          {color:'#3db870', icon:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'},
      'Odpoczynek':     {color:'#888888', icon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'},
    };
    const m = map[type] || {color:'#888888', icon:'<circle cx="12" cy="12" r="9"/>'};
    const padX = size==='sm' ? '5px 9px 5px 5px' : '6px 12px 6px 6px';
    const iconBoxSize = size==='sm' ? '18px' : '24px';
    const iconSize = size==='sm' ? '12' : '14';
    const fontSize = size==='sm' ? '9px' : '10px';
    const gap = size==='sm' ? '6px' : '8px';
    const radius = size==='sm' ? '6px' : '8px';
    return `<span style="display:inline-flex;align-items:center;gap:${gap};background:linear-gradient(90deg,#1a1a1a,#0d0d0d);border:1px solid ${m.color}88;border-radius:${radius};padding:${padX};box-shadow:0 0 8px ${m.color}26;color:#fff;font-family:'DM Mono',monospace;flex-shrink:0;">
      <span style="width:${iconBoxSize};height:${iconBoxSize};border-radius:5px;background:${m.color}2e;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${m.icon}</svg>
      </span>
      <span style="font-size:${fontSize};letter-spacing:0.12em;text-transform:uppercase;font-weight:500;">${(window.escapeHtml||String)(type)}</span>
    </span>`;
  }
  window.renderTypePill = renderTypePill;

  // ── UI helper: AI report card renderer ────────────────────────────
  // Renderuje kartę raportu AI (klikalną → openAIReportModal).
  // opts.mode: 'verbose' (panel trenera — typ-meta, badge wysłany/opinia)
  //          | 'compact' (modal zawodnika — minimal) — default 'compact'.
  // opts.cardBg: override tła (default zależy od mode).
  // Wymaga: window.escapeHtml, openAIReportModal (handler w callerze).
  function renderAIReportCard(r, opts) {
    opts = opts || {};
    const isVerbose = opts.mode === 'verbose';
    const cardBg = opts.cardBg || (isVerbose ? 'rgba(255,255,255,0.03)' : 'var(--card2)');

    const date = new Date(r.generated_at).toLocaleDateString('pl-PL', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

    const priorityColors = {
      red:    { bg: 'rgba(224,80,80,0.15)', fg: '#e05050' },
      yellow: { bg: 'rgba(232,172,30,0.15)', fg: '#e8ac1e' },
      green:  { bg: 'rgba(61,184,112,0.15)', fg: '#3db870' }
    };
    const priorityText = isVerbose
      ? { red: '🚨 PILNE', yellow: '⚠ UWAGA', green: '✓ OK' }
      : { red: 'PILNE', yellow: 'UWAGA', green: 'OK' };
    const pc = priorityColors[r.priority] || priorityColors.green;
    const pt = priorityText[r.priority] || priorityText.green;
    const isUnread = !r.read_by_coach;

    let typeMeta = '', sentBadge = '', feedbackBadge = '';
    if (isVerbose) {
      const typeIcon  = r.report_type === 'daily' ? '📅' : r.report_type === 'weekly' ? '📊' : r.report_type === 'monthly' ? '📈' : '📄';
      const typeLabel = r.report_type === 'daily' ? 'Dzienny' : r.report_type === 'weekly' ? 'Tygodniowy' : r.report_type === 'monthly' ? 'Miesięczny' : 'Raport';
      typeMeta = '<span style="font-size:14px;">' + typeIcon + '</span>'
               + '<span style="font-size:10px;color:var(--muted);font-family:DM Mono,monospace;letter-spacing:0.05em;">' + typeLabel + '</span>';
      sentBadge = (r.visible_to_athlete && r.sent_at)
        ? '<span style="font-size:9px;padding:3px 8px;border-radius:6px;font-family:DM Mono,monospace;background:rgba(139,92,246,0.15);color:#a78bfa;letter-spacing:0.06em;">📤 WYSŁANY</span>'
        : '';
      feedbackBadge = (r.athlete_feedback || r.athlete_reaction)
        ? '<span style="font-size:9px;padding:3px 8px;border-radius:6px;font-family:DM Mono,monospace;background:rgba(232,86,30,0.15);color:#e8561e;letter-spacing:0.06em;font-weight:600;">💬 OPINIA</span>'
        : '';
    }

    const headerFlexWrap = isVerbose ? 'flex-wrap:wrap;' : '';

    return '<div onclick="openAIReportModal(\'' + r.id + '\')" style="background:' + cardBg + ';border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'rgba(139,92,246,0.4)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;' + headerFlexWrap + '">'
        + typeMeta
        + '<span style="background:' + pc.bg + ';color:' + pc.fg + ';font-size:9px;padding:3px 8px;border-radius:6px;font-family:DM Mono,monospace;font-weight:600;letter-spacing:0.08em;">' + pt + '</span>'
        + sentBadge
        + feedbackBadge
        + (isUnread ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--accent);"></span>' : '')
        + '<span style="font-size:10px;color:var(--muted);font-family:DM Mono,monospace;margin-left:auto;">' + date + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--fg);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + window.escapeHtml(r.summary || 'Raport AI') + '</div>'
    + '</div>';
  }
  window.renderAIReportCard = renderAIReportCard;

  // ─── MESSAGE RENDERING (czat: tekst + obrazki + voice + GIF) ────────
  // Bezpiecznie renderuje treść wiadomości z czata.
  // Obsługuje: obrazki (stary i nowy format), voice messages, cofnięte wiadomości.
  // Pozostały tekst escapowany (anti-XSS).
  // Whitelist hostów media: Supabase, GitHub Pages, Tenor (media*.tenor.com), Giphy (media*.giphy.com).
  function _isSafeMediaUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      const h = u.hostname;
      return /^media\d*\.tenor\.com$/.test(h)
          || /^media\d*\.giphy\.com$/.test(h)
          || h === 'afqojgkaveykxbltxzwm.supabase.co'
          || h === 'filipjanczak1989-png.github.io';
    } catch {
      return false;
    }
  }
  function _renderImgTag(url) {
    const safe = window.escapeHtml(url);
    return '<img src="' + safe + '" style="max-width:100%;border-radius:8px;margin:2px 0;display:block;cursor:pointer;" onclick="window.open(\'' + safe + '\',\'_blank\')" />';
  }
  window.renderMessageBody = function(rawBody) {
    if (!rawBody) return '';
    const body = String(rawBody);

    // 1. Wiadomość cofnięta (zaufana - zapisana przez aplikację)
    if (body.startsWith('<span class="msg-recall">') && body.endsWith('</span>')) {
      return body;
    }
    // 2. Voice message (zaufana - zapisana przez aplikację)
    if (body.startsWith('<div class="voice-msg">')) {
      return body;
    }
    // 3. Stary format: [zdjęcie] <a href="URL">tekst</a>
    const oldImg = body.match(/\[zdjęcie\]\s*<a href="([^"]+)"[^>]*>[^<]*<\/a>/);
    if (oldImg) {
      const url = oldImg[1];
      const before = window.escapeHtml(body.slice(0, oldImg.index));
      const after = window.escapeHtml(body.slice(oldImg.index + oldImg[0].length));
      return before + (_isSafeMediaUrl(url) ? _renderImgTag(url) : '[zdjęcie: ' + window.escapeHtml(url) + ']') + after;
    }
    // 4. Nowy format: <img src="URL" ...>
    const newImg = body.match(/<img\s+src="([^"]+)"[^>]*\/?>/);
    if (newImg) {
      const url = newImg[1];
      const before = window.escapeHtml(body.slice(0, newImg.index));
      const after = window.escapeHtml(body.slice(newImg.index + newImg[0].length));
      return before + (_isSafeMediaUrl(url) ? _renderImgTag(url) : '[zdjęcie: ' + window.escapeHtml(url) + ']') + after;
    }
    // 5. Zwykły tekst — wszystko escapujemy (anti-XSS)
    return window.escapeHtml(body);
  };

  // ─── SAFE URL FOR ATTRIBUTES (anti-XSS dla src/href) ────────────────
  // Zwraca URL gotowy do wstawienia jako wartość atrybutu src/href w HTML.
  // - Tylko HTTPS + tylko hosty z whitelist _isSafeMediaUrl
  //   (Supabase storage, GH Pages, media*.tenor.com, media*.giphy.com)
  // - Niezaufany/nieprawidłowy URL → '' (atrybut zostaje pusty, nie ładuje nic)
  // - Wynik jest escape'owany HTML — bezpiecznie wstawić jako `src="${safeUrlAttr(url)}"`
  //
  // Użycie:
  //   const safe = safeUrlAttr(l.attachment_url);
  //   safe ? '<img src="'+safe+'">' : '<span>nieufny URL</span>'
  //
  // UWAGA: dla URL-i wstawianych do JS w atrybucie (np. onclick="open('${url}',…)")
  // sam HTML-escape nie wystarczy — przeglądarka dekoduje encje przed parsowaniem JS.
  // Bezpieczny wzorzec to przekazanie URL przez data-attribute:
  //   `<button data-url="${safeUrlAttr(url)}" onclick="window.open(this.dataset.url,'_blank')">`
  window.safeUrlAttr = function(url) {
    if (!url || typeof url !== 'string') return '';
    if (!url.startsWith('https://')) return '';
    if (!_isSafeMediaUrl(url)) return '';
    return window.escapeHtml(url);
  };

  // ─── SAFE EXTERNAL HREF (anti-XSS dla <a href> do linków zewnętrznych) ──
  // Zwraca URL gotowy do wstawienia jako wartość atrybutu href w <a>.
  // - Inny threat model niż safeUrlAttr: <a href> nie ładuje zasobu automatycznie,
  //   więc whitelist hostów NIE jest potrzebna (link do dowolnego HTTPS to normalne).
  // - Jedyny XSS-vector: protokoły executable (javascript:, data:, vbscript:) → odrzucone.
  // - Akceptuje https:// i http:// (każdy host); wynik escape'owany HTML.
  // - Niezaufany/malformed URL → '' (link będzie martwy zamiast wykonywać kod).
  //
  // Użycie:
  //   <a href="${safeExternalHref(l.strava_link)}" target="_blank" rel="noopener">↗ Strava</a>
  window.safeExternalHref = function(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
      return window.escapeHtml(url);
    } catch { return ''; }
  };

  // ─── LOGGING: production silence ────────────────────────────────────
  // Na localhost/dev działa normalnie. Na produkcji log/warn/info/debug = no-op.
  // Error zostaje (chcesz widzieć błędy). Użycie: LOG.log(...) zamiast console.log
  const _isLocal = location.hostname === 'localhost'
                || location.hostname.startsWith('192.168.')
                || location.hostname.startsWith('127.')
                || location.hostname === '';
  window.LOG = _isLocal
    ? console
    : { log: function(){}, warn: function(){}, info: function(){}, debug: function(){}, error: console.error.bind(console) };

  // ─── UX: toast zamiast alert() ──────────────────────────────────────
  // Użycie: showToast('Zapisano') | showToast('Błąd!', 'error') | showToast('Uwaga', 'warn')
  // Typy: 'info' (default), 'success', 'error', 'warn'
  if (!document.getElementById('_biegamy_toast_styles')) {
    const _style = document.createElement('style');
    _style.id = '_biegamy_toast_styles';
    _style.textContent = '@keyframes _toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}@keyframes _toastOut{to{opacity:0;transform:translateX(-50%) translateY(20px);}}';
    if (document.head) document.head.appendChild(_style);
    else document.addEventListener('DOMContentLoaded', function(){ document.head.appendChild(_style); });
  }

  window.showToast = function(msg, type) {
    type = type || 'info';
    const colors = {
      success: 'rgba(61,184,112,0.95)',
      error:   'rgba(232,86,30,0.95)',
      info:    'rgba(91,140,255,0.95)',
      warn:    'rgba(232,184,64,0.95)'
    };
    const t = document.createElement('div');
    t.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:' + (colors[type] || colors.info) + ';color:#fff;' +
      'padding:12px 20px;border-radius:12px;font-family:\'DM Sans\',sans-serif;' +
      'font-size:14px;font-weight:500;z-index:99999;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.3);' +
      'animation:_toastIn 0.3s ease-out;max-width:90vw;text-align:center;' +
      'pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() {
      t.style.animation = '_toastOut 0.3s ease-in forwards';
      setTimeout(function() { try { t.remove(); } catch(e){} }, 300);
    }, 2500);
  };

  // ═══════════════════════════════════════════════════════════════
  // 📜 CYTATY MOTYWACYJNE — single source of truth
  // ═══════════════════════════════════════════════════════════════
  window.QUOTES_LIBRARY = [
    // Polscy raperzy
    { text: "Każdy dzień to nowa walka, każdy oddech nowa szansa.", author: "Quebonafide" },
    { text: "Dyscyplina przebije talent kiedy talent nie ma dyscypliny.", author: "Taco Hemingway" },
    { text: "Zostaw wszystko na trasie, nie zostawiaj nic na potem.", author: "O.S.T.R." },
    { text: "Nie ma drogi na skróty do żadnego miejsca wartego dotarcia.", author: "Mata" },
    { text: "Robisz wynik wtedy gdy nikt nie patrzy.", author: "Pezet" },
    { text: "Jeden krok dalej niż wczoraj, to już jest progres.", author: "Białas" },
    { text: "Sercem się biegnie, nie nogami.", author: "Kortez" },
    { text: "Wstajesz, ścierasz krew z brwi i znowu w ring.", author: "Sokół" },
    { text: "Czasem trzeba przegrać żeby zrozumieć po co się walczy.", author: "Eldo" },

    // Polscy biegacze i trenerzy
    { text: "Bieg to medytacja w ruchu. Każdy krok to myśl uwolniona od ciężaru.", author: "Marcin Świerc" },
    { text: "Nie chodzi o to żeby być najszybszym, chodzi o to żeby się nie poddawać.", author: "Robert Korzeniowski" },
    { text: "Biegnij dla siebie, nie dla innych. To Twoja droga.", author: "Iwona Lewandowska" },
    { text: "Każdy maraton zaczyna się w głowie, nie w nogach.", author: "Henryk Szost" },
    { text: "Ból na treningu to inwestycja w sukces na zawodach.", author: "Adam Kszczot" },
    { text: "Pasja bez dyscypliny to tylko marzenie.", author: "Anita Włodarczyk" },

    // Międzynarodowe legendy biegania
    { text: "No human is limited.", author: "Eliud Kipchoge" },
    { text: "Tylko dyscyplinowany umysł wygrywa w życiu.", author: "Eliud Kipchoge" },
    { text: "Bieganie to życie. Wszystko jest biegiem.", author: "Haile Gebrselassie" },
    { text: "Możesz biec dalej niż myślisz. Granice są w głowie.", author: "Mo Farah" },
    { text: "Powinieneś biec dla siebie, nie żeby kogoś pokonać.", author: "Steve Prefontaine" },
    { text: "Zrezygnowanie jest na zawsze. Ból jest tymczasowy.", author: "Lance Armstrong" },
    { text: "Góra to nie cel, góra to świątynia.", author: "Kilian Jornet" },
    { text: "Najgłębsza ciemność jest tuż przed świtem.", author: "Courtney Dauwalter" },
    { text: "Trzeba wierzyć w siebie kiedy nikt inny nie wierzy.", author: "Usain Bolt" },
    { text: "Marzenia bez pracy to halucynacje.", author: "Jakob Ingebrigtsen" },

    // Sportowe legendy
    { text: "Nigdy nie pozwól żeby strach przed porażką cię paraliżował.", author: "Michael Jordan" },
    { text: "Marzenia nie działają, jeśli ty nie pracujesz.", author: "Kobe Bryant" },
    { text: "Bądź sobą — wszyscy inni są zajęci.", author: "Oscar Wilde" },
    { text: "Niemożliwe to tylko duże słowo używane przez słabych.", author: "Muhammad Ali" },
    { text: "Każdy mistrz był kiedyś początkującym.", author: "Muhammad Ali" },
    { text: "Sukces to nie szczęście. To wstawanie o 5 rano gdy nikt nie patrzy.", author: "Cristiano Ronaldo" },
    { text: "Talent wygrywa mecze, ale praca zespołowa i inteligencja wygrywają mistrzostwa.", author: "Michael Jordan" },
    { text: "Jeśli się zatrzymasz, to skończysz. Jeśli pójdziesz dalej, jest szansa.", author: "Roger Federer" },

    // Filozofia stoicka i Wschód
    { text: "Nie chodzi o to ile długo żyjesz, ale jak.", author: "Seneka" },
    { text: "Przeszkoda jest drogą.", author: "Marek Aureliusz" },
    { text: "Masz władzę nad swoim umysłem, nie nad zewnętrznymi zdarzeniami. Zrozum to, a znajdziesz siłę.", author: "Marek Aureliusz" },
    { text: "Nie żądaj żeby rzeczy działy się tak jak chcesz. Chciej żeby się działy tak jak są.", author: "Epiktet" },
    { text: "Jutrzejszy dzień jest najmniej pewną rzeczą w życiu.", author: "Marek Aureliusz" },
    { text: "Najlepszą zemstą jest nie być podobnym do tego, kto cię skrzywdził.", author: "Marek Aureliusz" },
    { text: "Lepiej zwyciężyć siebie samego niż wygrać tysiąc bitw.", author: "Budda" },
    { text: "Tysiącletnia podróż zaczyna się od jednego kroku.", author: "Lao Tzu" },
    { text: "Walcz tylko z przeciwnikiem którego można pokonać.", author: "Sun Tzu" },

    // Trenerzy i myśliciele sportowi
    { text: "Wszystko jest treningiem.", author: "Bill Bowerman" },
    { text: "Mile run nie ma magii. Bieg ma magię.", author: "Arthur Lydiard" },
    { text: "Bądź jak woda.", author: "Bruce Lee" },
    { text: "Nie modlę się o lekkie życie, modlę się o siłę by znieść trudne.", author: "Bruce Lee" },
    { text: "Im więcej się pocisz na treningu, tym mniej krwawisz w walce.", author: "Stare przysłowie wojskowe" },
    { text: "Najwięksi nigdy nie idą sami. Mają wokół siebie ludzi którzy wiedzą jak ciężko jest.", author: "Vince Lombardi" },

    // Polskie klasyki
    { text: "Marzenia są jak dzieci — nawet gdy nas zmęczą, ich nie porzucisz.", author: "Stachura" },
    { text: "Człowiek jest kowalem swojego losu.", author: "Stare przysłowie" },
    { text: "Nie cofaj się. Idź. Tylko tym sposobem znajdziesz drogę.", author: "Wojaczek" },

    // Krótkie kopniaki
    { text: "Płacz w treningu, śmiej się na mecie.", author: "Anonim" },
    { text: "Słabsza wersja Ciebie z wczoraj — to ona jest Twoim przeciwnikiem.", author: "Stara mądrość" },
    { text: "Wytrwałość bije talent w 9 przypadkach na 10.", author: "Stara mądrość" },
    { text: "Robisz to dla siebie. Nikt inny nie zrobi tego za Ciebie.", author: "Anonim" },
    { text: "Jutro będziesz wdzięczny za to co zrobiłeś dziś.", author: "Anonim" },
    { text: "Ciało robi to, do czego głowa go zmusi.", author: "Stara mądrość" },
    { text: "Najtrudniej jest wyjść z domu. Reszta to formalność.", author: "Anonim" },
    { text: "Każdy bieg to nowy rozdział. Stare zostaw za sobą.", author: "Anonim" },
    { text: "Nie liczy się szybkość. Liczy się że biegniesz.", author: "Anonim" },
    { text: "Wstałeś — już wygrałeś z większością.", author: "Anonim" },
    { text: "Pierwsze 3 km kłamią. Prawdziwy bieg zaczyna się od 4-ego.", author: "Stara mądrość" },
    { text: "Trudno bo trudne. Łatwo by każdy mógł.", author: "Anonim" },
    { text: "Gorzej już nie będzie. Może być tylko lepiej.", author: "Anonim" }
  ];

  // Helper: 1 cytat per dzień (deterministyczny, seed = YYYYMMDD)
  window.getDailyQuote = function(offsetDays = 0) {
    const today = new Date();
    today.setDate(today.getDate() + offsetDays);
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    return window.QUOTES_LIBRARY[seed % window.QUOTES_LIBRARY.length];
  };

  // Helper: N deterministycznie zshuffle'owanych cytatów dnia (Mulberry32)
  window.getDailyQuoteSet = function(count = 5) {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    let s = seed;
    const rand = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const arr = [...window.QUOTES_LIBRARY];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
  };

  // ═══════════════════════════════════════════════════════════════
  // 🚀 PROFILE COMPLETION MODAL — DOB + miasto + cel + PB (opcjonalne)
  // ═══════════════════════════════════════════════════════════════
  // Sprawdza athletes.date_of_birth/city/goal/pb_X; jeśli DOB lub city
  // puste i localStorage flag nie blokuje → pokazuje modal.
  // Skip ustawia flagę na 7 dni.
  // ID prefix `pc-` żeby uniknąć kolizji z nutrition.html `ob-*` oraz
  // static `#onboarding-modal` w zawodnik.html (kreator nowego profilu).
  // ═══════════════════════════════════════════════════════════════

  window.checkProfileCompletion = async function(athleteId) {
    if (!athleteId) return;

    // Sprawdź flag dismissal
    try {
      const until = parseInt(localStorage.getItem('profile_completion_dismissed_until') || '0');
      if (until > Date.now()) {
        console.log('[profile-completion] Dismissed until', new Date(until).toISOString().slice(0,10));
        return;
      }
    } catch(e) {}

    // Pobierz pola z athletes
    let ath;
    try {
      const { data } = await sb.from('athletes')
        .select('date_of_birth, city, goal, pb_5k, pb_10k, pb_half, pb_marathon')
        .eq('id', athleteId)
        .maybeSingle();
      ath = data;
    } catch(e) { console.error('[profile-completion] fetch err', e); return; }

    if (!ath) return;

    // Sprawdź czy mamy gap w niezbędnych polach
    const needsDOB = !ath.date_of_birth;
    const needsCity = !ath.city || !ath.city.trim();
    if (!needsDOB && !needsCity) {
      console.log('[profile-completion] All required filled, skip');
      return;
    }

    // Pokaż modal
    window._showProfileCompletionModal(athleteId, ath);
  };

  window._showProfileCompletionModal = function(athleteId, currentData) {
    // Wstrzyknij keyframes jeśli nie ma
    if (!document.getElementById('profile-completion-kf')) {
      const st = document.createElement('style');
      st.id = 'profile-completion-kf';
      st.textContent = '@keyframes pcfade{from{opacity:0}to{opacity:1}}@keyframes pcpop{from{transform:translateY(20px) scale(0.96);opacity:0}to{transform:none;opacity:1}}';
      document.head.appendChild(st);
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="profile-completion-modal" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;padding:16px;animation:pcfade 0.25s ease;overflow-y:auto;">
        <div style="background:linear-gradient(140deg,#1c1626,#0f0c18);border:1px solid rgba(139,92,246,0.35);border-radius:18px;padding:24px 22px;max-width:440px;width:100%;max-height:92vh;overflow-y:auto;animation:pcpop 0.3s ease;box-shadow:0 20px 60px rgba(139,92,246,0.2);">

          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:36px;line-height:1;margin-bottom:8px;">🏃</div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--fg);line-height:1.1;letter-spacing:0.02em;">Uzupełnij profil</div>
            <div style="font-size:11px;color:var(--muted);margin-top:6px;font-family:'Inter',sans-serif;line-height:1.5;">Pomoże mi dopasować plan, raporty i pogodę.</div>
          </div>

          <!-- NIEZBĘDNE -->
          <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#8b5cf6;font-family:'DM Mono',monospace;margin-bottom:10px;">Niezbędne</div>

          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-family:'DM Mono',monospace;letter-spacing:0.05em;">📅 Data urodzenia *</label>
            <input type="date" id="pc-dob" value="${currentData.date_of_birth || ''}" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--fg);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;">
          </div>

          <div style="margin-bottom:18px;">
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-family:'DM Mono',monospace;letter-spacing:0.05em;">📍 Miasto *</label>
            <input type="text" id="pc-city" placeholder="np. Wrocław" value="${(currentData.city || '').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--fg);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;">
          </div>

          <!-- OPCJONALNE -->
          <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);font-family:'DM Mono',monospace;margin-bottom:10px;">Opcjonalne (możesz pominąć)</div>

          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-family:'DM Mono',monospace;letter-spacing:0.05em;">🎯 Cel biegowy</label>
            <input type="text" id="pc-goal" placeholder="np. Maraton, 10km PB, regularność..." value="${(currentData.goal || '').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--fg);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
            <div>
              <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-family:'DM Mono',monospace;letter-spacing:0.05em;">⏱ 5km</label>
              <input type="text" id="pc-pb-5k" placeholder="np. 22:30" value="${(currentData.pb_5k || '').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--fg);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;">
            </div>
            <div>
              <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-family:'DM Mono',monospace;letter-spacing:0.05em;">⏱ 10km</label>
              <input type="text" id="pc-pb-10k" placeholder="np. 48:15" value="${(currentData.pb_10k || '').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--fg);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;">
            </div>
            <div>
              <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-family:'DM Mono',monospace;letter-spacing:0.05em;">⏱ Półmaraton</label>
              <input type="text" id="pc-pb-half" placeholder="np. 1:48:30" value="${(currentData.pb_half || '').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--fg);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;">
            </div>
            <div>
              <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;font-family:'DM Mono',monospace;letter-spacing:0.05em;">⏱ Maraton</label>
              <input type="text" id="pc-pb-marathon" placeholder="np. 3:55:00" value="${(currentData.pb_marathon || '').replace(/"/g,'&quot;')}" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--fg);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;">
            </div>
          </div>

          <div id="pc-error" style="font-size:11px;color:#e8561e;text-align:center;margin-bottom:10px;display:none;font-family:'DM Mono',monospace;"></div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            <button onclick="window._pcSubmit('${athleteId}')" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;border:none;border-radius:10px;padding:12px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;font-weight:600;">Zapisz profil</button>
            <button onclick="window._pcDismiss()" style="background:transparent;color:var(--muted);border:none;padding:8px;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;">Wypełnię później</button>
          </div>

        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    setTimeout(() => document.getElementById('pc-dob')?.focus(), 100);

    window._pcSubmit = async (id) => {
      const dob = document.getElementById('pc-dob')?.value || '';
      const city = (document.getElementById('pc-city')?.value || '').trim();
      const goal = (document.getElementById('pc-goal')?.value || '').trim();
      const pb5k = (document.getElementById('pc-pb-5k')?.value || '').trim();
      const pb10k = (document.getElementById('pc-pb-10k')?.value || '').trim();
      const pbHalf = (document.getElementById('pc-pb-half')?.value || '').trim();
      const pbM = (document.getElementById('pc-pb-marathon')?.value || '').trim();

      const errEl = document.getElementById('pc-error');

      // Walidacja: oba wymagane
      if (!dob || !city) {
        if (errEl) { errEl.textContent = 'Data urodzenia i miasto są wymagane'; errEl.style.display = 'block'; }
        return;
      }

      // Build update object — tylko wypełnione pola
      const update = { date_of_birth: dob, city };
      if (goal) update.goal = goal;
      if (pb5k) update.pb_5k = pb5k;
      if (pb10k) update.pb_10k = pb10k;
      if (pbHalf) update.pb_half = pbHalf;
      if (pbM) update.pb_marathon = pbM;

      const { error } = await sb.from('athletes').update(update).eq('id', id);
      if (error) {
        if (errEl) { errEl.textContent = 'Błąd: ' + error.message; errEl.style.display = 'block'; }
        return;
      }

      if (typeof showToast === 'function') showToast('Profil zapisany ✓');
      window._pcClose();

      // Odśwież pogodę bo city jest nowe
      if (typeof window.loadWeather === 'function') {
        try {
          const keys = Object.keys(sessionStorage).filter(k => k.startsWith('weather:'));
          keys.forEach(k => sessionStorage.removeItem(k));
        } catch(e) {}
        window.loadWeather();
      }
    };

    window._pcDismiss = () => {
      try { localStorage.setItem('profile_completion_dismissed_until', String(Date.now() + 7*24*3600*1000)); } catch(e) {}
      window._pcClose();
    };

    window._pcClose = () => {
      document.getElementById('profile-completion-modal')?.parentElement?.remove();
      delete window._pcSubmit;
      delete window._pcDismiss;
      delete window._pcClose;
    };
  };
})();
