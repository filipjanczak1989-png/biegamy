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

  // ─── IKONY 3D — helper + auto-resolver data-ic ──────────────────────
  // icHtml('act-save', 16, 'margin-right:6px;') → <img ...> (do JS-innerHTML)
  // Statyczny HTML: <img data-ic="icon-act-save.webp"> → resolver ustawia src na load.
  window.icHtml = window.icHtml || function(slug, size, extra) {
    if (!window.assetUrl) return '';
    size = size || 16;
    return '<img src="' + window.assetUrl('icon-' + slug + '.webp') + '" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;vertical-align:middle;flex-shrink:0;' + (extra || '') + '" alt="">';
  };
  (function resolveDataIc(){
    function run(){ try { document.querySelectorAll('img[data-ic]').forEach(function(el){ if(el.dataset.ic) el.src = window.assetUrl(el.dataset.ic); }); } catch(e){} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  })();

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

  // ─── PUSH AUTO-HEAL (W3, 2026-05-26): reconcile DB vs aktualna subskrypcja ──
  // Wołane po initAuth (gdy znamy athleteId) + po SW 'push-resubscribed'.
  // Tylko gdy permission=granted (NIGDY nie promptuje). Upsert-only (nie kasuje
  // innych endpointów → ochrona multi-device; stale czyści send-push EF na 410).
  window.reconcilePushSubscription = async function(athleteId) {
    if (!athleteId || !window.isPushSupported()) return;
    if (Notification.permission !== 'granted') { console.log('[push reconcile] skipped (permission denied/not subscribed)'); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // przeglądarka zgubiła subskrypcję — re-subscribe (permission już granted → brak promptu)
        try {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY) });
        } catch (e) { console.warn('[push reconcile] re-subscribe failed', e); return; }
      }
      const subJson = sub.toJSON();
      const { data: rows } = await window.sb.from('push_subscriptions').select('endpoint').eq('athlete_id', athleteId);
      const eps = (rows || []).map(r => r.endpoint);
      if (eps.includes(subJson.endpoint)) {
        await window.sb.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('athlete_id', athleteId).eq('endpoint', subJson.endpoint);
        console.log('[push reconcile] match');
      } else {
        const { error } = await window.sb.from('push_subscriptions').upsert({
          athlete_id: athleteId,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          user_agent: navigator.userAgent.slice(0, 200),
          last_used_at: new Date().toISOString(),
        }, { onConflict: 'endpoint' });
        if (error) console.warn('[push reconcile] upsert failed:', error.message);
        else console.log(eps.length ? '[push reconcile] upserted (endpoint changed)' : '[push reconcile] upserted (new)');
      }
    } catch (e) { console.warn('[push reconcile] error', e); }
  };

  // SW → main thread: po pushsubscriptionchange SW prosi o authenticated persist.
  // Strony ustawiają window._pushAthleteId (initAuth) — tu używamy go do reconcile.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'push-resubscribed' && window._pushAthleteId) {
        console.log('[push reconcile] SW push-resubscribed → reconcile');
        window.reconcilePushSubscription(window._pushAthleteId);
      }
    });
  }

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

    // 1. Wiadomość cofnięta — NIE ufamy zapisanemu HTML. Recall nie ma żadnych
    //    zmiennych danych, więc zwracamy STAŁY bezpieczny HTML i ignorujemy
    //    cokolwiek było w body (defense: nawet '<span class="msg-recall"><img
    //    onerror=…></span>' renderuje się jako zwykłe "cofnięta"). [stored XSS fix #1]
    if (body.startsWith('<span class="msg-recall">') && body.endsWith('</span>')) {
      return '<span class="msg-recall">Wiadomość cofnięta</span>';
    }
    // 2. Voice message — NIE ufamy zapisanej strukturze. Parsujemy ŚCISŁYM regexem
    //    tylko PATH głosu + długość (int), walidujemy path przez _chatVoicePathValid
    //    i ODBUDOWUJEMY tag od zera z zahardkodowanym onclick + zwalidowanymi danymi.
    //    Wszystko inne w body (np. <img onerror=…>) jest odrzucane — naprawia też
    //    ewentualne już-zapisane payloady. [stored XSS fix #1]
    if (body.startsWith('<div class="voice-msg">')) {
      var _vm = body.match(/onclick="playVoice(?:Msg)?\(this,'([^']+)'\)"/);
      var _vpath = _vm && _vm[1];
      if (_vpath && window._chatVoicePathValid && window._chatVoicePathValid(_vpath)) {
        var _vd = body.match(/class="voice-duration">(\d{1,5})s</);
        var _dur = _vd ? _vd[1] : '';
        // _chatVoicePathValid gwarantuje brak ' " < > ( ) → _vpath bezpieczny w atrybucie i JS-stringu.
        // Dwa warianty stylu odbudowane 1:1 (coach=biały pasek, athlete=accent) — wygląd identyczny.
        if (body.indexOf('rgba(255,255,255') !== -1) {
          return '<div class="voice-msg"><button class="voice-play" onclick="playVoiceMsg(this,\'' + _vpath + '\')">▶️</button><div style="flex:1;height:3px;background:rgba(255,255,255,0.2);border-radius:2px;"><div style="height:3px;background:rgba(255,255,255,0.7);width:100%;border-radius:2px;"></div></div><span class="voice-duration">' + _dur + 's</span></div>';
        }
        return '<div class="voice-msg"><button class="voice-play" onclick="playVoice(this,\'' + _vpath + '\')">▶️</button><div style="flex:1;height:3px;background:var(--border);border-radius:2px;"><div style="height:3px;background:var(--accent);width:100%;border-radius:2px;"></div></div><span class="voice-duration">' + _dur + 's</span></div>';
      }
      // path nie przechodzi walidacji → potencjalnie spreparowane body → bezpieczny tekst
      return window.escapeHtml(body);
    }
    // 3. Stary format: [zdjęcie] <a href="URL">tekst</a>
    const oldImg = body.match(/\[zdjęcie\]\s*<a href="([^"]+)"[^>]*>[^<]*<\/a>/);
    if (oldImg) {
      const url = oldImg[1];
      const before = window.escapeHtml(body.slice(0, oldImg.index));
      const after = window.escapeHtml(body.slice(oldImg.index + oldImg[0].length));
      return before + (_isSafeMediaUrl(url) ? _renderImgTag(url) : '[zdjęcie: ' + window.escapeHtml(url) + ']') + after;
    }
    // 4. Nowy format: JEDEN LUB WIĘCEJ <img src="URL|PATH"> — DUAL MODE (W2 Step 2b).
    //    Walka po wszystkich <img> (fix: wcześniej tylko pierwszy). Tekst między/wokół escapowany.
    //    legacy https (whitelist) → render; PATH → data-sp placeholder (Step 2a observer hydratuje
    //    przez createSignedUrl); nieufny → tekst [zdjęcie: …].
    if (/<img\s+src="[^"]+"[^>]*\/?>/.test(body)) {
      const re = /<img\s+src="([^"]+)"[^>]*\/?>/g;
      let out = '', last = 0, m;
      while ((m = re.exec(body)) !== null) {
        out += window.escapeHtml(body.slice(last, m.index));
        const u = m[1];
        const attrs = window._spImgSrc(u); // https-safe → src="…"; PATH → data-sp+placeholder; nieufny → ''
        out += attrs
          ? '<img ' + attrs + ' style="max-width:100%;border-radius:8px;margin:2px 0;display:block;cursor:pointer;" onclick="window.open(this.src,\'_blank\')" />'
          : '[zdjęcie: ' + window.escapeHtml(u) + ']';
        last = m.index + m[0].length;
      }
      out += window.escapeHtml(body.slice(last));
      return out;
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
    let s = url.trim();
    // Zawodnicy wklejają cały tekst "udostępnij" (np. z Garmina: "Sprawdź moją aktywność... https://connect.garmin.com/...").
    // Wyłuskaj prawdziwy URL z tekstu; gdy brak protokołu, a wygląda na domenę → dodaj https://.
    const m = s.match(/https?:\/\/\S+/i);
    if (m) {
      s = m[0].replace(/[.,;:)\]]+$/, ''); // utnij końcową interpunkcję sklejoną z URL
    } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !s.startsWith('//')) {
      s = 'https://' + s;
    }
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
      return window.escapeHtml(s);
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
  // 🎨 MOTYWY — przełączanie tokenów (theme.css html[data-theme])
  // ═══════════════════════════════════════════════════════════════
  window.setTheme = function(name){
    try {
      if (name && name !== 'default') { document.documentElement.setAttribute('data-theme', name); localStorage.setItem('bm_theme', name); }
      else { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('bm_theme'); }
    } catch(e){}
  };
  window.getTheme = function(){ try { return localStorage.getItem('bm_theme') || 'default'; } catch(e){ return 'default'; } };
  (function(){ try { var t = localStorage.getItem('bm_theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch(e){} })();

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
  // 🏃 RUN TYPES — allowlist do SUM KM (single source)
  // Nie-bieg (zastępczy/wzmacniający/odpoczynek/nieznane) → wykluczone z km biegowych.
  // NIE dotyczy TRIMP/TSB — te liczą z czasu (formaTRIMP), zastępczy ma własny effort.
  // ⚠️ Nowy pill biegowy w przyszłości → dopisz tutaj, inaczej jego km znikną z sum.
  // ═══════════════════════════════════════════════════════════════
  window.RUN_TYPES = new Set([
    'spokojny', 'bieg spokojny', 'wybieganie', 'długi', 'tempo',
    'progresja', 'interwały', 'start', 'wyścig', 'regeneracja'
  ]);
  window.isRunType = function(t) {
    return window.RUN_TYPES.has((t || '').toLowerCase().trim());
  };

  // Cel kcal = TDEE (maintenance, liczony triggerem DB calc_bmr_tdee) + korekta celu. Single source dla ±300.
  window.GOAL_KCAL_ADJUST = { deficit: -300, surplus: 300, maintain: 0 };
  window.computeTargetKcal = function(tdee, goal) {
    if (!tdee) return null;                                 // brak tdee → null (callsite decyduje fallback)
    return tdee + (window.GOAL_KCAL_ADJUST[goal] || 0);     // nieznany goal → 0
  };

  // Losowe tło oddechowe (20 grafik breath-bg-1..20.webp w biegamy-assets) + ciemny veil dla czytelności
  // białego tekstu na jasnych grafikach. Zwraca string do element.style.backgroundImage (veil NA WIERZCHU, foto pod).
  window.randomBreathBg = function(alphaTop, alphaBot) {
    const n = 1 + Math.floor(Math.random() * 20);
    return 'linear-gradient(180deg, rgba(7,5,12,' + alphaTop + '), rgba(7,5,12,' + alphaBot + ')), ' +
           'url(https://filipjanczak1989-png.github.io/biegamy-assets/breath-bg-' + n + '.webp)';
  };

  // Heurystyka „to trening wzmacniający" — typ == Wzmacniający LUB słowa-klucze w opisie.
  // Drille trenera (sil*) mają type='Regeneracja' + opis siłowy → dlatego też skan opisu.
  // Używane do deep-linku planu → sekcja ĆWICZENIA (zawodnik.html?tab=cwiczenia).
  window.looksLikeStrength = function(type, desc) {
    if ((type || '').toLowerCase().trim() === 'wzmacniający') return true;
    return /przysiad|wykrok|plank|deska|mostek|glute|dead.?bug|martw|brzuszk|\bcore\b|wzmacniaj|jaskół|łydk|pompk|bird.?dog|side.?plank|stabiliz/.test((desc || '').toLowerCase());
  };

  // Smart-match opisu planu → id programu ĆWICZENIA (lub null = brak pewnego dopasowania → lista).
  // Kolejność = priorytet (specyficzne przed ogólnymi). Ids: rozgrzewka/core/nogi/stabilizacja/pelny.
  window.matchProgram = function(desc) {
    const d = (desc || '').toLowerCase();
    if (/rozgrzew|przed startem|przed biegiem|aktywac/.test(d)) return 'rozgrzewka';
    if (/\bcore\b|brzuch|plank|deska|dead.?bug|martw/.test(d)) return 'core';
    if (/stabiliz|równowag|rownowag|jaskół|jaskol|balans|bird.?dog/.test(d)) return 'stabilizacja';
    if (/nóg|\bnog|łydk|lydk|przysiad|wykrok|calf|wspięci|wspieci/.test(d)) return 'nogi';
    return null;
  };

  // Detekcja treningu oddechowego (desc-only — brak typu „Oddechowy"; drille trenera odd* = Regeneracja+opis).
  window.looksLikeBreath = function(type, desc) {
    return /oddech|4-7-8|478|box breathing|wim hof|przeponow|hiperwentyl|breathing|kwadrat.*oddech|wstrzym.*oddech/.test((desc || '').toLowerCase());
  };
  // Smart-match opisu → technika oddechowa (lub null = ogólny oddech → lista 3 technik). Klucze: 478/box/wim.
  window.matchBreath = function(desc) {
    const d = (desc || '').toLowerCase();
    if (/4-7-8|478|4 7 8/.test(d)) return '478';
    if (/\bbox\b|box breathing|kwadrat/.test(d)) return 'box';
    if (/wim hof|wim|retencj|hiperwentyl|lodow/.test(d)) return 'wim';
    return null;
  };
  // Parse jawnego ref-u z planu (trainings.exercise_ref) → {kind:'prog'|'breath', key} lub null.
  // Format namespaced: 'prog:core' / 'breath:478'. Ma PIERWSZEŃSTWO nad smart-matchem opisu.
  window.parseExerciseRef = function(ref) {
    if (!ref || typeof ref !== 'string' || ref.indexOf(':') < 0) return null;
    const i = ref.indexOf(':'), kind = ref.slice(0, i), key = ref.slice(i + 1);
    if ((kind === 'prog' || kind === 'breath') && key) return { kind: kind, key: key };
    return null;
  };

  // RADIO BiegaMy — buildery URL. media z bucketu radio-audio (URL = slug + '.' + media_ext),
  // cover z bucketu radio-audio (cover_slug = pełna nazwa pliku bez .webp, np. 'cover-park-wolnosci').
  window.RADIO = {
    MEDIA_BASE: window.SB_URL + '/storage/v1/object/public/radio-audio/',
    COVER_BASE: window.SB_URL + '/storage/v1/object/public/radio-audio/',
    mediaUrl: function(t){ return (t && t.slug) ? (this.MEDIA_BASE + t.slug + '.' + (t.media_ext || 'mp4')) : ''; },
    coverUrl: function(t){ return (t && t.cover_slug) ? (this.COVER_BASE + t.cover_slug + '.webp') : ''; },
    // Hit tygodnia — #N utworów z najwięcej odtworzeń w ostatnich 7 dniach (widok radio_top_weekly, security_invoker=false)
    weeklyTop: async function(limit){
      try {
        const { data, error } = await window.sb.from('radio_top_weekly').select('*').limit(limit || 1);
        if (error) return [];
        return data || [];
      } catch(e){ return []; }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // window.WATCH — SSOT podłączenia zegarka (intervals.icu OAuth)
  // Reużywa flow z profil.html (authorizeIntervals) — jedna ścieżka, nie kopia.
  // Stan czytany z athletes.intervals_athlete_id (intervals_credentials ma RLS
  // BEZ SELECT dla klienta — tylko DELETE-own; EF service_role zapisuje oba).
  // ═══════════════════════════════════════════════════════════════════
  window.WATCH = {

    // 1) ODPAL OAUTH — jedyna definicja flow (profil.html ją woła)
    odpalOAuth: function(returnTo) {
      const nonce = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now() + '.' + Math.random().toString(36).slice(2));
      sessionStorage.setItem('icu_oauth_state', nonce);            // CSRF — sprawdzany w intervals-callback.html
      if (returnTo) sessionStorage.setItem('icu_oauth_return', returnTo);  // powrót do onboardingu (dopięcie callbacku osobno)
      const redirect = 'https://biegamy.run/intervals-callback.html';     // = redirect_uri client_id 533
      location.href = 'https://intervals.icu/oauth/authorize'
        + '?client_id=533'
        + '&redirect_uri=' + encodeURIComponent(redirect)
        + '&scope=ACTIVITY:READ'
        + '&state=' + encodeURIComponent(nonce)
        + '&response_type=code';
    },

    // 2) STAN — JEDNO źródło prawdy. Zwraca {polaczony, od_kiedy}
    czyPolaczony: async function(athleteId) {
      if (!athleteId) return { polaczony: false, od_kiedy: null };
      const { data } = await window.sb.from('athletes')
        .select('intervals_athlete_id, intervals_connected_at')
        .eq('id', athleteId).maybeSingle();
      return { polaczony: !!(data && data.intervals_athlete_id),
               od_kiedy: (data && data.intervals_connected_at) || null };
    },

    // 3) RENDER — jedna funkcja, 4 wagi. Async, bo pyta czyPolaczony o stan.
    //    opts = { athleteId, returnTo?, onSkip? (nazwa globalnej fn jako string) }
    render: async function(waga, opts) {
      opts = opts || {};
      this._injectCss();
      const st = await this.czyPolaczony(opts.athleteId);
      const ic = this.iconSvg();
      const rt = opts.returnTo ? ("'" + opts.returnTo + "'") : '';
      const skip = opts.onSkip || 'WATCH._noop';

      // Instrukcja "Jak podłączyć zegarek?" — współdzielona (full + status). Statyczny tekst (bez danych usera → bez escape).
      const helpHtml = function(open) {
        return '<details class="wc-help"' + (open ? ' open' : '') + '><summary>Jak podłączyć zegarek?</summary>'
        + '<div class="wc-help-body">'
        + '<p class="wc-help-intro">Treningi z zegarka wpadną tu automatycznie — przez intervals.icu (darmowy pośrednik, który pobiera je z Garmina).</p>'
        + '<ol class="wc-help-steps">'
        + '<li><b>Załóż darmowe konto na intervals.icu</b><br>Wejdź na intervals.icu i zarejestruj się (email, hasło, nazwa, waga — wymagana; resztę pomiń). Maila nie musisz potwierdzać.<img class="wc-help-img" src="' + window.assetUrl('krok1-rejestracja.webp') + '" alt="Krok 1 — rejestracja na intervals.icu" loading="lazy"></li>'
        + '<li><b>Ustawienia → Połączenia</b><br>Kliknij zębatkę ⚙️ w lewej kolumnie, wejdź w zakładkę Połączenia i znajdź kartę Garmin Connect.<img class="wc-help-img" src="' + window.assetUrl('krok2-polaczenia.webp') + '" alt="Krok 2 — Ustawienia → Połączenia" loading="lazy"></li>'
        + '<li><b>Podłącz Garmina</b><br>Zaznacz trzy pola (Pobieranie aktywności, Pobierz dane kondycji, Prześlij zaplanowane treningi). Po trzecim przeniesie Cię na stronę Garmina — zaloguj się. Po wpisaniu hasła zegarek jest połączony.<img class="wc-help-img" src="' + window.assetUrl('krok3-garmin.webp') + '" alt="Krok 3 — podłącz Garmin Connect" loading="lazy"></li>'
        + '<li><b>Wróć do BiegaMy</b><br>Kliknij „Autoryzuj przez intervals.icu”, na ekranie zgody zaznacz Aktywności — Czytać ✓ i OK.<img class="wc-help-img" src="' + window.assetUrl('krok4-autoryzacja.webp') + '" alt="Krok 4 — autoryzacja w BiegaMy" loading="lazy"></li>'
        + '</ol>'
        + '<p class="wc-help-done">✅ Gotowe! Od teraz każdy trening wpada sam.</p>'
        + '<p class="wc-help-support">🤝 Problem? Napisz do trenera na czacie albo na biegamy.run@gmail.com — podłączymy razem.</p>'
        + '</div></details>';
      };

      // połączony (poza 'status') → kompaktowe potwierdzenie
      if (st.polaczony && waga !== 'status' && waga !== 'badge') {
        return '<div class="wc-ok">' + ic + '<span>Zegarek połączony ✓</span></div>';
      }

      if (waga === 'full') {
        return '<div class="wc wc-full">'
          + '<div class="wc-ic-lg">' + ic + '</div>'
          + '<div class="wc-h1">Treningi wpadną same<br>— bez wpisywania</div>'
          + '<div class="wc-sub">Przez intervals.icu połączysz Garmin / Polar / Suunto. '
          + 'Każdy trening z zegarka trafi tu i do trenera automatycznie.</div>'
          + '<button class="wc-btn" onclick="WATCH.odpalOAuth(' + rt + ')">Połącz z zegarkiem</button>'
          + '<button class="wc-ghost" onclick="' + skip + '()">Pomiń, zrobię później</button>'
          + helpHtml(false)
          + '</div>';
      }
      if (waga === 'medium') {
        return '<div class="wc wc-medium">' + ic
          + '<div class="wc-txt"><b>Połącz zegarek</b><span>Garmin/Polar/Suunto — trening sam wpadnie</span></div>'
          + '<button class="wc-btn-sm" onclick="WATCH.odpalOAuth(' + rt + ')">Połącz →</button></div>';
      }
      if (waga === 'light') {
        return '<button class="wc wc-light" onclick="WATCH.odpalOAuth(' + rt + ')">'
          + '<span class="watch-pulse">' + ic + '</span>'
          + '<span class="wc-light-txt">Masz zegarek? Połącz — nie wpisuj ręcznie</span></button>';
      }
      if (waga === 'status') {
        if (st.polaczony) {
          const d = st.od_kiedy ? new Date(st.od_kiedy).toLocaleDateString('pl-PL',{day:'numeric',month:'short',year:'numeric'}) : '';
          return '<div class="wc-ok">' + ic + '<span>Połączono ✓' + (d ? ' · od ' + d : '') + '</span>'
            + '<button class="wc-disc" onclick="disconnectIntervals()">Rozłącz</button></div>';
        }
        return '<div class="wc-status-connect">'
          + '<button class="wc-btn" onclick="WATCH.odpalOAuth(' + rt + ')">Autoryzuj przez intervals.icu</button>'
          + helpHtml(false)
          + '</div>';
      }
      if (waga === 'badge') {
        // Mała ikona-wskaźnik w topbarze (jak Garmin) — zawsze widoczna, dwa stany.
        if (st.polaczony) {
          return '<button class="wc-badge wc-badge-ok" title="Zegarek połączony — status/rozłącz" '
            + 'onclick="location.href=\'profil.html?open=icu\'">' + ic
            + '<span class="wc-badge-check">✓</span></button>';
        }
        return '<button class="wc-badge wc-badge-off" title="Połącz zegarek" '
          + 'onclick="location.href=\'profil.html?open=icu\'">' + ic
          + '<span class="wc-badge-dot">!</span></button>';
      }
      return '';
    },

    // 4) IKONA — prosty smartwatch, theme-aware (var(--accent)), animowalny CSS-em
    iconSvg: function() {
      return '<svg class="wc-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"'
        + ' stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="7" y="7" width="10" height="10" rx="2.5"/>'
        + '<path d="M9 7 L9.4 3.6 A1 1 0 0 1 10.4 2.7 L13.6 2.7 A1 1 0 0 1 14.6 3.6 L15 7"/>'
        + '<path d="M9 17 L9.4 20.4 A1 1 0 0 0 10.4 21.3 L13.6 21.3 A1 1 0 0 0 14.6 20.4 L15 17"/>'
        + '<path d="M12 9.8 L12 12 L13.5 13"/></svg>';
    },

    _noop: function() {},

    _injectCss: function() {
      if (document.getElementById('wc-css')) return;
      const s = document.createElement('style'); s.id = 'wc-css';
      s.textContent =
        '.wc-icon{transition:transform .2s}'
        + '@keyframes wc-pulse{0%,100%{opacity:1}50%{opacity:.5}}'
        + '.watch-pulse .wc-icon{animation:wc-pulse 2.4s ease-in-out infinite}'
        + '.wc-full{text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px}'
        + '.wc-ic-lg .wc-icon{width:40px;height:40px}'
        + '.wc-full .wc-h1{font-size:20px;font-weight:600;color:var(--fg);line-height:1.15}'
        + '.wc-full .wc-sub{font-size:13px;color:var(--muted);line-height:1.55;max-width:300px}'
        + '.wc-btn{width:100%;background:var(--accent);color:#fff;border:none;border-radius:12px;padding:14px;font-family:DM Mono,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}'
        + '.wc-ghost{background:none;border:none;color:var(--muted);font-family:DM Mono,monospace;font-size:12px;cursor:pointer;padding:6px}'
        + '.wc-help{font-size:11px;color:var(--muted);font-family:DM Mono,monospace;width:100%;box-sizing:border-box;border:1px solid rgba(var(--accent-rgb),.28);border-radius:12px;padding:12px 14px;background:rgba(var(--accent-rgb),.05)}'
        + '.wc-help>summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:12px;letter-spacing:.02em;list-style:none;display:flex;align-items:center;gap:8px}'
        + '.wc-help>summary::-webkit-details-marker{display:none}'
        + '.wc-help>summary::before{content:"▸";display:inline-block;transition:transform .2s;color:var(--accent)}'
        + '.wc-help[open]>summary::before{transform:rotate(90deg)}'
        + '.wc-adv{margin-top:12px;border:1px solid var(--border);border-radius:12px;padding:10px 14px}'
        + '.wc-adv>summary{cursor:pointer;color:var(--muted);font-family:DM Mono,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;list-style:none;display:flex;align-items:center;gap:8px}'
        + '.wc-adv>summary::-webkit-details-marker{display:none}'
        + '.wc-adv>summary::before{content:"▸";display:inline-block;transition:transform .2s}'
        + '.wc-adv[open]>summary::before{transform:rotate(90deg)}'
        + '.wc-adv-body{margin-top:12px}'
        + '.wc-status-connect{display:flex;flex-direction:column;gap:10px}'
        + '.wc-help-body{margin-top:8px;line-height:1.55;color:var(--muted);text-align:left;font-family:inherit;font-size:12px}'
        + '.wc-help-intro{margin:0 0 8px}'
        + '.wc-help-steps{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:9px}'
        + '.wc-help-steps li{padding-left:2px}'
        + '.wc-help-steps b{color:var(--fg)}'
        + '.wc-help-done{margin:10px 0 4px;color:var(--accent);font-weight:600}'
        + '.wc-help-support{margin:0}'
        + '.wc-help-img{display:block;width:100%;max-width:280px;margin:10px auto 4px;border-radius:10px;border:1px solid var(--border)}'
        + '.wc-medium{display:flex;align-items:center;gap:12px}'
        + '.wc-medium .wc-txt{flex:1;display:flex;flex-direction:column}'
        + '.wc-medium .wc-txt b{font-size:13px;color:var(--fg)}.wc-medium .wc-txt span{font-size:11px;color:var(--muted)}'
        + '.wc-btn-sm{background:var(--accent);color:#fff;border:none;border-radius:10px;padding:9px 14px;font-family:DM Mono,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}'
        + '.wc-light{display:flex;align-items:center;gap:8px;width:100%;background:rgba(var(--accent-rgb),.08);border:1px solid rgba(var(--accent-rgb),.25);border-radius:10px;padding:10px 12px;cursor:pointer}'
        + '.wc-light-txt{font-size:12px;color:var(--accent);font-weight:500}'
        + '.wc-ok{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--fg)}'
        + '.wc-disc{margin-left:auto;font-size:10px;font-family:DM Mono,monospace;color:var(--muted);background:none;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 10px;cursor:pointer}';
      s.textContent +=
        '.wc-badge{position:relative;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;border:1px solid var(--border);background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.02));transition:all .25s ease}'
        + '.wc-badge:hover{border-color:rgba(var(--accent-rgb),.5);background:linear-gradient(135deg,rgba(var(--accent-rgb),.10),rgba(var(--accent-rgb),.03));box-shadow:0 0 18px rgba(var(--accent-rgb),.18);transform:scale(1.04)}'
        + '.wc-badge:hover .wc-icon{stroke:var(--accent)}'
        + '.wc-badge .wc-icon{width:18px;height:18px}'
        + '.wc-badge-off{border-color:rgba(var(--accent-rgb),.45);background:linear-gradient(135deg,rgba(var(--accent-rgb),.10),rgba(var(--accent-rgb),.03))}'
        + '.wc-badge-off .wc-icon{animation:wc-pulse 2.4s ease-in-out infinite}'
        + '.wc-badge-ok{opacity:.55}'
        + '.wc-badge-ok:hover{opacity:1}'
        + '.wc-badge-ok .wc-icon{stroke:var(--muted)}'
        + '.wc-badge-dot{position:absolute;top:-3px;right:-3px;min-width:14px;height:14px;background:var(--accent);border:2px solid var(--bg);border-radius:7px;font-size:8px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;font-family:DM Mono,monospace;line-height:1;padding:0 2px}'
        + '.wc-badge-check{position:absolute;bottom:-2px;right:-2px;width:13px;height:13px;background:var(--green,#3db870);border:2px solid var(--bg);border-radius:50%;font-size:8px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;line-height:1}';
      document.head.appendChild(s);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // window.NAV — SSOT dolnej nawigacji (wzorem WATCH). CSS w theme.css
  // (.bottom-nav/.nav-it/.nav-lbl — kanon Fork A z nutrition). N0: skeleton,
  // jeszcze NIEWPIĘTY w ekrany (czysty dodatek, no-op na prodzie — lokalne
  // reguły nav per plik wygrywają w kaskadzie do czasu migracji).
  // render(activeId, {role,athleteId,onLog}) → HTML <nav>.
  // ═══════════════════════════════════════════════════════════════════
  window.NAV = {
    _ic: {
      home:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      plan:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      food:'<path d="M19 11 c 0 6 -3 10 -7 10 c -4 0 -7 -4 -7 -10 c 0 -3 2 -5 5 -5 c 1 0 2 1 2 1 c 0 0 1 -1 2 -1 c 3 0 5 2 5 5 z"/><path d="M12 2 C 14 4, 14 6, 12 7 C 10 6, 10 4, 12 2"/>',
      forma:'<path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/>',
      social:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      profil:'<circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>',
      analytics:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
      msgs:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
      roster:'<circle cx="8" cy="8" r="3.2"/><path d="M2.5 20v-1.2a4.2 4.2 0 0 1 4.2-4.2h2.6a4.2 4.2 0 0 1 4.2 4.2V20"/><line x1="16" y1="9" x2="21.5" y2="9"/><line x1="16" y1="14" x2="21.5" y2="14"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
    },
    _svg: function(k){ return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">' + (this._ic[k] || '') + '</svg>'; },
    _here: function(){ try { return (location.pathname.split('/').pop() || '') + location.search; } catch(e){ return ''; } },
    _item: function(o){
      var cls = 'nav-it' + (o.active ? ' active' : '');
      var attr;
      if (o.onLocal) attr = 'href="#" onclick="' + o.onLocal + ';return false;"';    // pozycja in-page (opts.local) — nie opuszcza ekranu
      else if (o.onLog) attr = 'href="#" onclick="' + o.onLog + '();return false;"';
      else if (o.target === this._here()) attr = 'href="' + o.target + '" onclick="return false;"'; // ta sama strona → nie przeładowuj
      else attr = 'href="' + o.target + '"';
      var icon = o.logo
        ? '<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;margin-top:-18px;box-shadow:0 0 20px rgba(var(--accent-rgb),0.6);"><img src="' + (window.assetUrl ? window.assetUrl('bm-nav.webp') : '') + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.background=\'var(--accent)\';this.style.display=\'none\'"></div>'
        : this._svg(o.icon);
      return '<a class="' + cls + '" data-navid="' + o.id + '" ' + attr + (o.title ? ' title="' + o.title + '"' : '') + '>' + icon + '<div class="nav-lbl"' + (o.logo ? ' style="margin-top:2px;"' : '') + '>' + o.label + '</div></a>';
    },
    // JEDNO źródło kolejności pozycji per rola (używa render ORAZ window.SWIPE — bez dwóch prawd).
    items: function(role, opts){
      opts = opts || {};
      if (role === 'coach') {
        // Kanon coach = 5 sekcji trenera (in-page na trener.html przez opts.local; href-fallback na profil/kalendarz)
        return [
          {id:'home', label:'Zawodnicy', target:'trener.html', icon:'roster'},
          {id:'plan', label:'Plan', target:'kalendarz.html?role=coach', icon:'plan'},
          {id:'analytics', label:'Analityka', target:'trener.html?tab=analytics', icon:'analytics'},
          {id:'msgs', label:'Czat', target:'trener.html?tab=msgs', icon:'msgs'},
          {id:'social', label:'Społeczność', target:'trener.html?tab=social', icon:'social'},
          {id:'settings', label:'Ustawienia', target:'trener.html?tab=settings', icon:'settings'}
        ];
      }
      // Podgląd trenera: gdy bieżący URL ma ?from=trener (lub przekazano opts.from) — propaguj go do WSZYSTKICH
      // targetów athlety, żeby swipe/nav między ekranami nie gubił kontekstu podglądu (trener nie wypadał z widoku zawodnika).
      var from = (opts.from !== undefined) ? opts.from
                 : (function(){ try { return new URLSearchParams(location.search).get('from') === 'trener' ? 'trener' : null; } catch(e){ return null; } })();
      function wf(t){ return (from && t) ? (t + (t.indexOf('?') >= 0 ? '&' : '?') + 'from=' + from) : t; }
      var prof = opts.athleteId ? ('profil.html?id=' + opts.athleteId) : 'profil.html';
      return [
        {id:'home', label:'Dziś', target:wf('zawodnik.html'), icon:'home'},
        {id:'plan', label:'Plan', target:wf('kalendarz.html?role=athlete'), icon:'plan'},
        {id:'food', label:'Jedzenie', target:wf('nutrition.html'), icon:'food', title:'Odżywianie'},
        {id:'log', label:'Log', logo:true, target:wf('zawodnik.html?log=1'), onLog:(opts.onLog || null)},
        {id:'forma', label:'Forma', target:wf('zawodnik.html?tab=forma'), icon:'forma'},
        {id:'social', label:'Społeczność', target:wf('zawodnik.html?tab=social'), icon:'social'},
        {id:'profil', label:'Profil', target:wf(prof), icon:'profil'}
      ];
    },
    render: function(activeId, opts){
      opts = opts || {};
      var items = this.items(opts.role, opts);
      var self = this;
      return '<nav class="bottom-nav">' + items.map(function(it){ it.active = (it.id === activeId); it.onLocal = (opts.local && opts.local[it.id]) || null; return self._item(it); }).join('') + '</nav>';
    },
    // Zarządzanie active z zewnątrz (in-page sekcje) — class-based, kolory z theme.css, zero dotykania atrybutów svg.
    setActive: function(id){
      try {
        var nav = document.querySelector('.bottom-nav');
        if (!nav) return;
        var els = nav.querySelectorAll('[data-navid]');
        for (var i = 0; i < els.length; i++){ els[i].classList.toggle('active', els[i].getAttribute('data-navid') === id); }
      } catch(e){}
    }
  };

  // ═══ SWIPE — gest lewo/prawo między pozycjami nav (S0 szkielet; ZERO wpięć = no-op) ═══
  //   Kolejność bierze z NAV.items(role) (jedno źródło). Strona woła SWIPE.attach() w S1.
  //   attach({ items, activeId, onLocal, local }):
  //     items    = NAV.items(role, opts)  — kolejność
  //     activeId = string | function()    — bieżąca pozycja (null → gest nieaktywny)
  //     onLocal(id) = callback dla pozycji in-page (SWIPE nie zna showSection)
  //     local    = mapa {id:...} jak w NAV.render — które pozycje są in-page (reszta = href)
  window.SWIPE = {
    _enabled: function(){
      try { return localStorage.getItem('bm_swipe') !== 'off' && ('ontouchstart' in window); }
      catch(e){ return false; }
    },
    // ── DEBUG MODE (za flagą localStorage.bm_swipe_debug==='1'; włącz z telefonu przez ?swipedebug=1) ──
    _dbgOn: function(){ try { return localStorage.getItem('bm_swipe_debug') === '1'; } catch(e){ return false; } },
    _sel: function(el){
      if (!el || !el.tagName) return '?';
      var s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      if (el.className && typeof el.className === 'string') { var c = el.className.trim().split(/\s+/).slice(0,2).join('.'); if (c) s += '.' + c; }
      return s;
    },
    _dbg: function(msg){
      if (!this._dbgOn()) return;
      try {
        var o = document.getElementById('_swipe_dbg');
        if (!o) {
          o = document.createElement('div'); o.id = '_swipe_dbg';
          o.style.cssText = 'position:fixed;left:8px;right:8px;bottom:96px;z-index:2147483647;background:rgba(0,0,0,0.92);color:#4ade80;font:600 11px/1.45 monospace;padding:9px 11px;border-radius:8px;border:1px solid #4ade80;white-space:pre-wrap;word-break:break-word;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
          document.body.appendChild(o);
        }
        o.textContent = '🖐 ' + msg;
        o.style.opacity = '1';
        clearTimeout(this._dbgT);
        this._dbgT = setTimeout(function(){ if (o) o.style.opacity = '0'; }, 2000);
      } catch(e){}
    },
    _scrollableX: function(el){
      try {
        var ox = getComputedStyle(el).overflowX;
        // Blokuj tylko REALNY poziomy scroller: overflow-x auto/scroll ORAZ treść szersza niż kontener.
        // (Sam scrollWidth>clientWidth daje false-positive na overflow:hidden — np. karty Ustawień trenera → blokowały swipe.)
        if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 4) return true;
      } catch(e){}
      return false;
    },
    // Kierunek gestu wg WSPÓLNYCH progów (attach + attachEl — zero zdublowanych 60/600).
    //   1 = swipe w lewo (następny), -1 = swipe w prawo (poprzedni), 0 = brak.
    _dir: function(dx, dy, dt){
      if (Math.abs(dx) < 60 || Math.abs(dx) <= 2 * Math.abs(dy) || dt >= 600) return 0;
      return dx < 0 ? 1 : -1;
    },
    // Guard po ścieżce target→góra: (a) poziomy scroller, (b) canvas, (c) input/textarea/select/contenteditable.
    //   checkModalZ=true → dodatkowo blokuj wewnątrz fixed z-index>=300 (tylko document-level attach).
    _blockedEl: function(target, checkModalZ){
      var el = target;
      while (el && el !== document.body) {
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') { this._blockReason = 'input(' + this._sel(el) + ')'; return true; } // (c) — canvas ZDJĘTY
        if (el.isContentEditable) { this._blockReason = 'contenteditable(' + this._sel(el) + ')'; return true; }   // (c)
        if (this._scrollableX(el)) { this._blockReason = 'scrollableX(' + this._sel(el) + ')'; return true; }      // (a) poziomy scroller
        if (checkModalZ) {                                                 // (d) wysoki modal fixed z-index>=300
          try { var cs = getComputedStyle(el); if (cs.position === 'fixed' && parseInt(cs.zIndex, 10) >= 300) { this._blockReason = 'modalZ(' + this._sel(el) + ')'; return true; } } catch(e){}
        }
        el = el.parentElement;
      }
      return false;
    },
    // Pełny guard dla document-level attach (nav-swipe): wyłączony / otwarty modal + _blockedEl z modal-z.
    _blocked: function(target){
      if (!this._enabled()) { this._blockReason = 'disabled'; return true; }                     // (e) wyłączony / brak touch
      if (document.querySelector('.add-overlay.open')) { this._blockReason = 'add-overlay.open'; return true; }  // (d) bottom-sheet
      var gm = document.getElementById('goal-modal');
      if (gm) { try { if (getComputedStyle(gm).display !== 'none') { this._blockReason = 'goal-modal'; return true; } } catch(e){} }  // (d) modal celu
      return this._blockedEl(target, true);
    },
    attach: function(opts){
      opts = opts || {};
      var self = this;
      if (!self._enabled()) return;                                        // no-op gdy wyłączony/desktop
      var items = (opts.items || []).filter(function(it){ return it.id !== 'log'; }); // log slot pomijany
      var getActive = (typeof opts.activeId === 'function') ? opts.activeId : function(){ return opts.activeId; };
      var onLocal = (typeof opts.onLocal === 'function') ? opts.onLocal : function(){};
      var localMap = opts.local || {};
      var blockWhen = (typeof opts.blockWhen === 'function') ? opts.blockWhen : null;  // opcjonalny twardy gate (np. otwarty arkusz dnia); brak = wstecznie zgodne
      var sx = 0, sy = 0, st = 0, tracking = false, blocked = false;

      document.addEventListener('touchstart', function(e){
        tracking = false; blocked = false;
        if (!e.touches || e.touches.length !== 1) { blocked = true; self._blockReason = 'multitouch'; return; }
        if (blockWhen && blockWhen()) { blocked = true; self._blockReason = 'blockWhen'; return; }  // (f) strona-specyficzny gate (S3: arkusz dnia)
        if (self._blocked(e.target)) { blocked = true; return; }            // _blocked ustawia _blockReason
        var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true;
      }, { passive: true });

      document.addEventListener('touchend', function(e){
        if (blocked) { self._dbg('BLOCKED: ' + (self._blockReason || '?')); return; }  // _dbg no-op bez flagi = zero zmian zachowania
        if (!tracking) return;
        tracking = false;
        var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
        var dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st;
        var dir = self._dir(dx, dy, dt);
        if (!dir) { self._dbg('IGNORED: dx=' + Math.round(dx) + ' dy=' + Math.round(dy) + ' t=' + dt + 'ms'); return; }
        var active = getActive();
        if (active == null) { self._dbg('GESTURE dir=' + dir + ' ale activeId=null (martwy)'); return; }
        var idx = -1;
        for (var i = 0; i < items.length; i++) { if (items[i].id === active) { idx = i; break; } }
        if (idx < 0) { self._dbg('GESTURE dir=' + dir + ' active=' + active + ' — brak w items'); return; }
        var ni = (idx + dir + items.length) % items.length;               // ZAWIJANIE (karuzela): ostatnia↔pierwsza; tylko nav-swipe (attach), day-swipe (attachEl) bez zawijania
        var it = items[ni];
        self._dbg('GESTURE: ' + active + ' dir=' + dir + ' → ' + it.id + ' (' + (localMap[it.id] ? 'local' : ('href ' + it.target)) + ')');
        if (localMap[it.id]) onLocal(it.id);                               // in-page → callback
        else if (it.target) {
          if (self._dbgOn()) { var _t = it.target; setTimeout(function(){ location.href = _t; }, 1600); }  // debug: pokaż toast przed nawigacją
          else location.href = it.target;                                  // normalnie: natychmiast
        }
      }, { passive: true });
    },
    // Gest lewo/prawo NA ELEMENCIE (np. arkusz dnia). Współdzieli progi (_dir) i guardy (_blockedEl)
    //   z attach — WYJĄTEK: bez modal-z (el sam JEST w overlayu). stopPropagation po rozpoznaniu.
    //   opts: { onLeft, onRight, blockSelector }  (onLeft = swipe w lewo, np. następny dzień)
    attachEl: function(el, opts){
      opts = opts || {};
      var self = this;
      if (!el || !self._enabled()) return;
      var onLeft = (typeof opts.onLeft === 'function') ? opts.onLeft : function(){};
      var onRight = (typeof opts.onRight === 'function') ? opts.onRight : function(){};
      var blockSel = opts.blockSelector || null;
      var sx = 0, sy = 0, st = 0, tracking = false, blocked = false;

      el.addEventListener('touchstart', function(e){
        tracking = false; blocked = false;
        if (!e.touches || e.touches.length !== 1) { blocked = true; return; }
        if (!self._enabled()) { blocked = true; return; }
        if (blockSel && e.target.closest && e.target.closest(blockSel)) { blocked = true; return; }  // jawne wyłączenie (np. galeria)
        if (self._blockedEl(e.target, false)) { blocked = true; return; }  // bez modal-z (el JEST w overlayu)
        var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); tracking = true;
        e.stopPropagation();   // zabierz gest document-level nav-swipe od startu (pas do blockWhen z części B)
      }, { passive: true });

      el.addEventListener('touchend', function(e){
        if (!tracking || blocked) return;
        tracking = false;
        var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
        var dir = self._dir(t.clientX - sx, t.clientY - sy, Date.now() - st);
        if (!dir) return;
        e.stopPropagation();                                               // nie oddawaj gestu document-level nav-swipe
        if (dir === 1) onLeft(); else onRight();
      }, { passive: true });
    }
  };

  // Włącznik debug z URL (telefon bez konsoli): ?swipedebug=1 → flaga on (persist w localStorage), ?swipedebug=0 → off.
  (function(){ try { var d = new URLSearchParams(location.search).get('swipedebug'); if (d === '1') localStorage.setItem('bm_swipe_debug','1'); else if (d === '0') localStorage.removeItem('bm_swipe_debug'); } catch(e){} })();

  // ─── IKONY POGODY 3D — weather_code/cloud_pct → slug (home + kalendarz) ───
  // Chmury = wariant dark (wygrał A/B 2026-06-17). Opady/burza/śnieg/mgła z code; clear-spectrum (0-3) z cloud_pct.
  window.wxIcon = function(code, cloudPct){
    code = Number(code);
    if (code >= 95) return 'wx-storm';                                  // burza
    if ([71,73,75,77,85,86].indexOf(code) !== -1) return 'wx-snow';     // śnieg
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'wx-rain'; // mżawka/deszcz/przelotne
    if (code === 45 || code === 48) return 'wx-fog';                    // mgła
    // clear-spectrum (0-3): preferuj cloud_pct; gdy brak (np. stary cache sprzed EF v3) → fallback z weather_code
    if (cloudPct == null) {
      if (code === 0) return 'wx-sun';
      if (code === 1) return 'wx-mostly-sun';
      if (code === 2) return 'wx-partly';
      return 'wx-cloud';                                                // code 3 + nieznane
    }
    const c = Number(cloudPct);                                        // clear-spectrum wg zachmurzenia
    if (c < 25) return 'wx-sun';
    if (c < 55) return 'wx-mostly-sun';
    if (c < 80) return 'wx-partly';
    return 'wx-cloud';
  };
  // Zwraca <img> ikony pogody; przy 404/braku helpera → emoji fallback (data-fb, bez JS-in-attr footguna).
  window.wxImg = function(code, cloudPct, emojiFallback, sizePx){
    if (!window.wxIcon || !window.assetUrl) return emojiFallback || '';
    const sz = sizePx || 32;
    const fb = (emojiFallback || '').replace(/"/g, '');
    return '<img src="' + window.assetUrl('icon-' + window.wxIcon(code, cloudPct) + '.webp') +
      '" alt="" data-fb="' + fb + '" style="width:' + sz + 'px;height:' + sz +
      'px;object-fit:contain;vertical-align:middle;" onerror="this.replaceWith(document.createTextNode(this.dataset.fb||\'\'))">';
  };

  // Wykrywanie ukrytego roweru: bieg ≥15km & pace <3:20/km = niemożliwe dla człowieka (zero false-positive).
  // NIE auto-filtr (pole pace brudne) — tylko soft-warning przy logowaniu.
  window.looksLikeBike = function(type, distKm, paceStr) {
    if (!window.isRunType(type)) return false;          // nie-bieg → już Zastępczy/itd.
    const d = parseFloat(distKm);
    if (!(d >= 15)) return false;                        // krótkie → możliwy sprint/interwał
    const m = /^(\d{1,2}):(\d{2})/.exec((paceStr || '').trim());
    if (!m) return false;                                // brak/zły pace → nie oceniamy
    const sec = (+m[1]) * 60 + (+m[2]);
    return sec > 0 && sec < 200;                         // < 3:20/km
  };

  // ── validateWorkoutSteps — walidacja trainings.steps wg BiegaMy_workout_steps_schema.md ──
  // Zwraca { ok:boolean, errors:string[], stepCount:number }. stepCount = kroki po rozwinięciu repeatów (limit Garmina ≤50).
  window.validateWorkoutSteps = (function () {
    var STEP_KINDS = ['warmup', 'run', 'recovery', 'rest', 'cooldown'];
    var DUR_TYPES = ['distance', 'time', 'open'];
    var TGT_TYPES = ['none', 'pace', 'hr', 'hr_zone'];
    var MAX_STEPS = 50;
    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
    function isPosInt(n) { return isInt(n) && n > 0; }
    function validateDuration(d, path, errs) {
      if (!d || typeof d !== 'object') { errs.push(path + '.duration: brak/zły typ'); return; }
      if (DUR_TYPES.indexOf(d.type) === -1) { errs.push(path + '.duration.type nieprawidłowy: ' + d.type); return; }
      if (d.type === 'distance') { if (!isPosInt(d.m)) errs.push(path + '.duration.m musi być dodatnią liczbą całkowitą (metry)'); }
      else if (d.type === 'time') { if (!isPosInt(d.s)) errs.push(path + '.duration.s musi być dodatnią liczbą całkowitą (sekundy)'); }
    }
    function validateTarget(t, path, errs) {
      if (!t || typeof t !== 'object') { errs.push(path + '.target: brak/zły typ'); return; }
      if (TGT_TYPES.indexOf(t.type) === -1) { errs.push(path + '.target.type nieprawidłowy: ' + t.type); return; }
      if (t.type === 'pace') {
        if (!isPosInt(t.min_s_per_km) || !isPosInt(t.max_s_per_km)) { errs.push(path + '.target pace: min/max_s_per_km muszą być dodatnimi int'); return; }
        if (t.min_s_per_km > t.max_s_per_km) errs.push(path + '.target pace: min_s_per_km (szybsza) musi być ≤ max_s_per_km (wolniejsza)');
      } else if (t.type === 'hr') {
        if (!isPosInt(t.min_bpm) || !isPosInt(t.max_bpm)) { errs.push(path + '.target hr: min/max_bpm muszą być dodatnimi int'); return; }
        if (t.min_bpm > t.max_bpm) errs.push(path + '.target hr: min_bpm ≤ max_bpm');
      } else if (t.type === 'hr_zone') {
        if (!isInt(t.zone) || t.zone < 1 || t.zone > 5) errs.push(path + '.target hr_zone: zone musi być 1–5');
      }
    }
    function validateStep(s, path, errs) {
      if (!s || typeof s !== 'object') { errs.push(path + ': nie jest obiektem'); return; }
      if (STEP_KINDS.indexOf(s.kind) === -1) { errs.push(path + '.kind nieprawidłowy: ' + s.kind); return; }
      validateDuration(s.duration, path, errs);
      validateTarget(s.target, path, errs);
      if (s.note != null && typeof s.note !== 'string') errs.push(path + '.note musi być stringiem');
    }
    return function validateWorkoutSteps(steps) {
      var errs = [], count = 0;
      if (!Array.isArray(steps)) return { ok: false, errors: ['steps musi być tablicą'], stepCount: 0 };
      if (steps.length === 0) return { ok: false, errors: ['steps nie może być pusta'], stepCount: 0 };
      steps.forEach(function (el, i) {
        var path = 'steps[' + i + ']';
        if (el && el.kind === 'repeat') {
          if (!isPosInt(el.count)) errs.push(path + '.count musi być dodatnią liczbą całkowitą');
          if (!Array.isArray(el.steps) || el.steps.length === 0) { errs.push(path + '.steps (repeat) musi być niepustą tablicą'); return; }
          el.steps.forEach(function (cs, j) {
            var cpath = path + '.steps[' + j + ']';
            if (cs && cs.kind === 'repeat') { errs.push(cpath + ': zagnieżdżony repeat niedozwolony (v1)'); return; }
            validateStep(cs, cpath, errs);
          });
          count += (isPosInt(el.count) ? el.count : 0) * el.steps.length;
        } else { validateStep(el, path, errs); count += 1; }
      });
      if (count > MAX_STEPS) errs.push('Za dużo kroków po rozwinięciu repeatów: ' + count + ' > ' + MAX_STEPS + ' (limit Garmina)');
      return { ok: errs.length === 0, errors: errs, stepCount: count };
    };
  })();

  // ── renderWorkoutSteps — trainings.steps → czytelny opis PL (podgląd planu/push/auto-opis) ──
  // Zwraca { lines:string[], text:string }. text = lines.join(' → ').
  window.renderWorkoutSteps = (function () {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function fmtDist(m) {
      if (m % 1000 === 0) return (m / 1000) + ' km';
      if (m >= 1000) return (m / 1000).toFixed(1).replace(/\.0$/, '') + ' km';
      return m + ' m';
    }
    function fmtTime(s) {
      if (s % 60 === 0) return (s / 60) + ' min';
      return Math.floor(s / 60) + ':' + pad(s % 60);
    }
    var KIND_PL = { warmup: 'Rozgrzewka', run: 'Bieg', recovery: 'Przerwa (trucht)', rest: 'Przerwa (stój)', cooldown: 'Schłodzenie' };
    function dur(d) {
      if (!d) return '';
      if (d.type === 'distance') return fmtDist(d.m);
      if (d.type === 'time') return fmtTime(d.s);
      if (d.type === 'open') return 'do wciśnięcia lap';
      return '';
    }
    function tgt(t) {
      if (!t || t.type === 'none') return '';
      if (t.type === 'pace') return '@ ' + Math.floor(t.min_s_per_km/60)+':'+pad(t.min_s_per_km%60) + '–' + Math.floor(t.max_s_per_km/60)+':'+pad(t.max_s_per_km%60) + '/km';
      if (t.type === 'hr') return '@ ' + t.min_bpm + '–' + t.max_bpm + ' bpm';
      if (t.type === 'hr_zone') return '@ strefa ' + t.zone;
      return '';
    }
    function stepLine(s) {
      var parts = [KIND_PL[s.kind] || s.kind, dur(s.duration), tgt(s.target)].filter(Boolean);
      var line = parts.join(' ');
      if (s.note) line += ' (' + s.note + ')';
      return line;
    }
    return function renderWorkoutSteps(steps) {
      if (!Array.isArray(steps) || steps.length === 0) return { lines: [], text: '' };
      var lines = steps.map(function (el) {
        if (el && el.kind === 'repeat') {
          var inner = (el.steps || []).map(stepLine).join(' + ');
          return el.count + '× [' + inner + ']';
        }
        return stepLine(el);
      });
      return { lines: lines, text: lines.join(' → ') };
    };
  })();

  // Soft confirm 2-przyciskowy (promise). Klik w tło / "To bieg" = 'run'; "To rower" = 'bike'.
  window.askBikeOrRun = function(distKm, paceStr) {
    return new Promise((resolve) => {
      document.getElementById('_bikeAsk')?.remove();
      const m = document.createElement('div');
      m.id = '_bikeAsk';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
      const done = (v) => { m.remove(); resolve(v); };
      const detail = (distKm ? Math.round(distKm) + ' km' : '') + (paceStr ? ' po ' + paceStr + '/km' : '');
      m.innerHTML = '<div style="max-width:380px;width:100%;background:linear-gradient(140deg,#1a1422,#13101a);border:1px solid rgba(232,86,30,0.3);border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.6);text-align:center;">'
        + '<div style="font-size:40px;line-height:1;margin-bottom:10px;">🚴</div>'
        + '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;color:#fff;letter-spacing:0.03em;margin-bottom:8px;">To wygląda na rower</div>'
        + '<div style="font-family:\'Inter\',sans-serif;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;margin-bottom:18px;">' + detail + ' — to tempo jest niemożliwe dla biegu. Zapisać jako trening zastępczy?</div>'
        + '<div style="display:flex;gap:10px;">'
        + '<button id="_baRun" style="flex:1;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:12px;font-family:\'DM Mono\',monospace;font-size:12px;cursor:pointer;">To bieg</button>'
        + '<button id="_baBike" style="flex:1;background:linear-gradient(135deg,#e8561e,#ff8a4c);color:#fff;border:none;border-radius:10px;padding:12px;font-family:\'DM Mono\',monospace;font-size:12px;font-weight:700;cursor:pointer;">To rower 🚴</button>'
        + '</div></div>';
      m.addEventListener('click', (e) => { if (e.target === m) done('run'); });  // klik w tło = soft "zostaw bieg"
      document.body.appendChild(m);
      document.getElementById('_baRun').onclick = () => done('run');
      document.getElementById('_baBike').onclick = () => done('bike');
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // 📈 FORMA HELPERS — TRIMP calculation (CTL/ATL/TSB feature)
  // ═══════════════════════════════════════════════════════════════
  window.FORMA_EFFORT_FACTORS = {
    'odpoczynek': 0,
    'regeneracja': 1.0,
    'spokojny': 1.5,
    'bieg spokojny': 1.5,
    'wybieganie': 2.0,
    'długi': 2.5,
    'wzmacniający': 1.5,
    'zastępczy': 1.5,
    'tempo': 3.5,
    'progresja': 3.0,
    'interwały': 4.5,
    'start': 5.0,
    'wyścig': 5.0,
  };
  window.FORMA_FEEL_MODIFIERS = { 'good': 1.0, 'mid': 1.1, 'bad': 1.3 };

  window.formaDurationToMin = function(s) {
    if (!s || typeof s !== 'string') return 0;
    const t = s.trim(); if (!t) return 0;
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    const p = t.split(':').map(x => parseInt(x, 10) || 0);
    if (p.length === 2) return p[0] + p[1] / 60;
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    return 0;
  };

  window.formaTRIMP = function(log) {
    const dur = window.formaDurationToMin(log.duration);
    const key = (log.training_type || '').toLowerCase().trim();
    const effort = (window.FORMA_EFFORT_FACTORS[key] !== undefined) ? window.FORMA_EFFORT_FACTORS[key] : 1.5;
    const feelMod = window.FORMA_FEEL_MODIFIERS[log.feel] || 1.0;
    return Math.round(dur * effort * feelMod);
  };

  // MET factors — kalkulacja kalorii spalonych per trening (formula: MET × kg × hours)
  window.FORMA_MET_FACTORS = {
    'odpoczynek': 0,
    'regeneracja': 6,
    'spokojny': 8.5,
    'bieg spokojny': 8.5,
    'wybieganie': 9,
    'długi': 9.5,
    'wzmacniający': 5,
    'zastępczy': 6,
    'tempo': 11,
    'progresja': 11,
    'interwały': 13,
    'start': 14,
    'wyścig': 14,
  };

  window.formaCalories = function(log, weightKg) {
    // Priority: stored value (manual input lub OCR) > MET compute z weight
    if (log && log.calories && log.calories > 0) return log.calories;
    if (!weightKg || weightKg <= 0) return 0;
    const dur = window.formaDurationToMin(log.duration);
    const key = (log.training_type || '').toLowerCase().trim();
    const met = (window.FORMA_MET_FACTORS[key] !== undefined) ? window.FORMA_MET_FACTORS[key] : 8;
    return Math.round(met * weightKg * (dur / 60));
  };

  // Compute forma summary stats — używane przez compare athletes feature (CTL/ATL/TSB + weekly metrics)
  window.computeFormaStats = function(logs, weightKg) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = new Date(today); start.setDate(start.getDate() - 90);

    // Daily TRIMP map
    const dailyTRIMP = {};
    (logs || []).forEach(log => {
      const dateStr = (log.logged_at || '').split('T')[0];
      if (!dateStr) return;
      dailyTRIMP[dateStr] = (dailyTRIMP[dateStr] || 0) + window.formaTRIMP(log);
    });

    // EMA loop (CTL 42d, ATL 7d) from start to today
    let ctl = 0, atl = 0;
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const trimp = dailyTRIMP[dateStr] || 0;
      ctl = ctl + (trimp - ctl) / 42;
      atl = atl + (trimp - atl) / 7;
    }

    // Weekly metrics (last 7 days)
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const weekLogs = (logs || []).filter(l => new Date(l.logged_at) >= weekAgo);
    const weekKm = weekLogs.reduce((s, l) => s + (parseFloat(l.distance_km) || 0), 0);
    const weekTrimp = weekLogs.reduce((s, l) => s + window.formaTRIMP(l), 0);
    const weekKcal = (weightKg && weightKg > 0) ? weekLogs.reduce((s, l) => s + window.formaCalories(l, weightKg), 0) : 0;

    return {
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb: Math.round(ctl - atl),
      weekKm: Math.round(weekKm * 10) / 10,
      weekTrimp,
      weekKcal,
      weekTrainings: weekLogs.length,
      totalLogs: (logs || []).length
    };
  };

  // ────────────────────────────────────────────────────────────────────────
  // computeFormaSeries — time-series CTL/ATL/TSB/TRIMP per day
  // Reusable dla compare.html, future AI reports, future viz
  // Input: logs array (sorted by logged_at asc), days window (default 90)
  // Output: { labels, ctlData, atlData, tsbData, trimpData } — same length arrays
  // ────────────────────────────────────────────────────────────────────────
  window.computeFormaSeries = function(logs, daysWindow) {
    daysWindow = daysWindow || 90;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - daysWindow + 1);

    // Bucketize logs per ISO date (YYYY-MM-DD)
    const dailyTrimp = {};
    for (const log of (logs || [])) {
      if (!log.logged_at) continue;
      if ((log.training_type || '').startsWith('__badge__')) continue;
      const d = new Date(log.logged_at);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const trimp = (typeof window.formaTRIMP === 'function') ? window.formaTRIMP(log) : 0;
      dailyTrimp[key] = (dailyTrimp[key] || 0) + trimp;
    }

    const labels = [], ctlData = [], atlData = [], tsbData = [], trimpData = [];
    const CTL_TAU = 42, ATL_TAU = 7;
    const ctlAlpha = 1 - Math.exp(-1 / CTL_TAU);
    const atlAlpha = 1 - Math.exp(-1 / ATL_TAU);
    let ctl = 0, atl = 0;

    for (let i = 0; i < daysWindow; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const trimp = dailyTrimp[key] || 0;
      ctl = ctl + ctlAlpha * (trimp - ctl);
      atl = atl + atlAlpha * (trimp - atl);
      labels.push(key);
      ctlData.push(Math.round(ctl * 10) / 10);
      atlData.push(Math.round(atl * 10) / 10);
      tsbData.push(Math.round((ctl - atl) * 10) / 10);
      trimpData.push(Math.round(trimp));
    }

    return { labels, ctlData, atlData, tsbData, trimpData };
  };

  // ────────────────────────────────────────────────────────────────────────
  // computeFormaProjection — N dni do przodu CTL/ATL/TSB przy ZAŁOŻENIU braku treningów
  // Strava-style "what if I rest from today" — dashed line w przyszłość
  // EMA: CTL_t = CTL_t-1 + (TRIMP - CTL_t-1) * (1/42), ATL analog z 1/7
  // ────────────────────────────────────────────────────────────────────────
  window.computeFormaProjection = function(currentCTL, currentATL, daysForward) {
    const days = daysForward || 14;
    const projection = { labels: [], ctlData: [], atlData: [], tsbData: [] };
    let ctl = currentCTL;
    let atl = currentATL;
    const today = new Date();
    for (let i = 1; i <= days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const lbl = (d.getMonth()+1) + '-' + String(d.getDate()).padStart(2,'0');
      // Założenie TRIMP = 0 (brak treningu)
      ctl = ctl + (0 - ctl) * (1/42);
      atl = atl + (0 - atl) * (1/7);
      projection.labels.push(lbl);
      projection.ctlData.push(Math.round(ctl * 10) / 10);
      projection.atlData.push(Math.round(atl * 10) / 10);
      projection.tsbData.push(Math.round((ctl - atl) * 10) / 10);
    }
    return projection;
  };

  // ────────────────────────────────────────────────────────────────────────
  // computeNextRace — z race_goals JSON wyciągnij najbliższy upcoming start
  // Input: raceGoals (array of {name, date, ...} lub stringified JSON)
  // Output: { name, date, daysLeft } | null
  // ────────────────────────────────────────────────────────────────────────
  window.computeNextRace = function(raceGoals) {
    let goals = raceGoals;
    if (typeof goals === 'string') {
      try { goals = JSON.parse(goals); } catch(e) { return null; }
    }
    if (!Array.isArray(goals) || goals.length === 0) return null;
    const now = new Date();
    const upcoming = goals
      .filter(g => g.date && new Date(g.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!upcoming.length) return null;
    const nearest = upcoming[0];
    const daysLeft = Math.ceil((new Date(nearest.date) - now) / 86400000);
    return {
      name: nearest.name || 'Start',
      date: nearest.date,
      daysLeft: daysLeft
    };
  };

  // ─────────────────────────────────────────────────────────────────────
  // METRIC_TOOLTIPS — content store dla v2 "jak dla debida"
  // Używane przez showMetricTooltip() w zawodnik.html + compare.html
  // Każda metryka ma 3 sekcje: "Co to jest" / "Jak czytać" / "Co robić"
  // ─────────────────────────────────────────────────────────────────────
  window.METRIC_TOOLTIPS = {
    tsb: {
      title: 'TSB · Forma świeża',
      sections: [
        { heading: 'Co to jest', body: 'TSB to <b>wskaźnik świeżości</b> Twojej formy. Pokazuje różnicę między długoterminowym treningiem (CTL, ostatnie 6 tygodni) a krótkoterminowym zmęczeniem (ATL, ostatnie 7 dni).<br><br>Jeśli ostatnio sporo trenowałeś = ATL wysoki = TSB spada. Jeśli odpoczywałeś po build-upie = ATL niski + CTL trzyma = TSB rośnie.' },
        { heading: 'Jak czytać', body: '<b>Linia w górę = jesteś świeższy.</b> (Tak, brzmi nieintuicyjnie — bo zmęczenie "rośnie" gdy linia idzie w dół. To bilans świeżości, nie obciążenia. Wyższy = lepszy.)<br><br>Wartości referencyjne:<br>🟡 <b>TSB &gt; +25</b> — Over-rested, możesz tracić formę<br>🟢 <b>TSB +5 do +15</b> — Optimum, gotowość startowa<br>⚪ <b>TSB -10 do +5</b> — Neutralna, normalny rytm<br>🟠 <b>TSB -10 do -30</b> — Obciążenie, celowy build-up<br>🔴 <b>TSB &lt; -30</b> — Przeciążenie, ryzyko kontuzji' },
        { heading: 'Co robić', body: '• <b>Przed startem</b> (10-14 dni): celuj w TSB +5 do +15 dzień przed<br>• <b>W okresie budowania</b>: TSB -10 do -20 to idealny stres treningowy<br>• <b>Czujesz wypalenie + TSB &lt; -25</b>: dorzucisz 2-3 dni regeneracji<br>• <b>TSB &gt; +20 bez startu w planie</b>: dorzuć intensywność, tracisz formę' }
      ]
    },
    ctl: {
      title: 'CTL · Forma długa',
      sections: [
        { heading: 'Co to jest', body: 'CTL to Twoja <b>forma długoterminowa</b> — średnie obciążenie treningowe z ostatnich ~6 tygodni, ważone w stronę świeższych treningów.<br><br>Im więcej i regularniej trenujesz, tym wyższe CTL. To <b>pojemność</b>, którą organizm wytrzymuje w trybie ciągłym.' },
        { heading: 'Jak czytać', body: 'Wartość rośnie wolno (tygodniami systematyczności) i spada wolno (też tygodniami przerwy). Brak jednoznacznych "stref" — każdy zawodnik ma własną bazę.<br><br>Punkty odniesienia hobbysta-amator:<br>• <b>CTL 30-50</b> — biegacz rekreacyjny, 3-4 treningi/tydz<br>• <b>CTL 50-80</b> — średnio-zaawansowany, 5-6 treningów/tydz<br>• <b>CTL 80-110</b> — zaawansowany, sezonowy peak<br>• <b>CTL &gt; 110</b> — poziom (sub)elity, ryzyko bez monitoringu' },
        { heading: 'Co robić', body: '• <b>Patrz na trend</b>, nie wartość. Rosnące CTL = budujesz formę. Stałe = utrzymujesz. Spadające &gt; 2 tygodnie = tracisz bazę.<br>• <b>Nie podnoś CTL &gt; 5-7 punktów/tydz</b> — próg ryzyka kontuzji (zasada 7% Coggan)<br>• <b>Po starcie</b> CTL spada o 5-15 punktów przez taper — to OK, wróci' }
      ]
    },
    atl: {
      title: 'ATL · Zmęczenie',
      sections: [
        { heading: 'Co to jest', body: 'ATL to <b>zmęczenie krótkoterminowe</b> — średnie obciążenie z ostatnich ~7 dni. Reaguje szybko na to co właśnie zrobiłeś.<br><br>Po ciężkim tygodniu ATL skoczy w górę. Po 2-3 dniach regeneracji szybko spadnie.' },
        { heading: 'Jak czytać', body: 'Wartość zmienna z dnia na dzień. <b>Wysokie ATL</b> = jesteś w okresie obciążenia. <b>Niskie ATL</b> = świeży, zregenerowany.<br><br>ATL sam w sobie nie mówi czy to "dobrze" — kontekst daje porównanie z CTL (czyli wskaźnik TSB).' },
        { heading: 'Co robić', body: '• <b>ATL znacznie wyższe niż CTL</b> (np. ATL 70 / CTL 50) = jesteś przemęczony względem swojej bazy. TSB ujemne = patrz tam.<br>• <b>ATL niskie + CTL wysokie</b> = świeży na peak formy. Dobry moment na start.<br>• <b>ATL śledzi tygodniowy trening</b> — jeśli nie spada mimo "lekkiego tygodnia", sprawdź czy faktycznie odpoczywasz.' }
      ]
    },
    trimp: {
      title: 'TRIMP · Jednostka obciążenia',
      sections: [
        { heading: 'Co to jest', body: 'TRIMP (Training Impulse) to <b>jednostka obciążenia</b> pojedynczego treningu. Łączy w jednej liczbie: długość treningu × intensywność × samopoczucie.<br><br>60 minut spokojnego = ~50 TRIMP. 60 minut interwałów = ~120 TRIMP. 3h długi bieg = ~150 TRIMP.' },
        { heading: 'Jak czytać', body: 'Im wyższy TRIMP, tym ciężej organizm pracował. To <b>waluta</b> której organizm "zapłaci" obciążeniem (ATL) i regeneracją.<br><br>Każdy TRIMP dnia wpływa na: TSB (jak czujesz się jutro), CTL (jak forma rośnie), heatmap (intensywność dnia).' },
        { heading: 'Co robić', body: '• <b>Tygodniowy TRIMP</b> = suma wszystkich dni. Trzymaj progres ~5-10% tygodniowo.<br>• <b>Pojedynczy trening &gt; 200 TRIMP</b> = bardzo ciężki, wymaga 24-48h regeneracji<br>• <b>Dzień z 0 TRIMP</b> = pełna regeneracja, OK 1-2× tygodniowo' }
      ]
    },
    weekly_km: {
      title: 'Kilometraż tygodniowy',
      sections: [
        { heading: 'Co to jest', body: 'Suma <b>kilometrów przebiegniętych</b> w każdym z ostatnich 8 tygodni. Najprostszy wskaźnik objętości treningu.' },
        { heading: 'Jak czytać', body: 'Wysokość słupka = km tygodnia. Porównuj tygodnie obok siebie — szukasz trendu, nie pojedynczego rekordu.<br><br>Idealny pattern: 3 tygodnie progresji (~10% wzrost) + 1 tydzień regeneracyjny (~20% niżej). Cykl 4-tygodniowy.' },
        { heading: 'Co robić', body: '• <b>Skok &gt; 15% tydzień-do-tygodnia</b> = ryzyko kontuzji. Cofnij się do progresji 5-10%.<br>• <b>Plateau przez 4+ tygodnie</b> = czas na progresję lub zmianę bodźca (więcej intensywności).<br>• <b>Drop &gt; 30%</b> = sprawdź czy intencjonalny (taper, regeneracja), czy "wypadek" (choroba, kontuzja, motywacja).<br>• <b>Long run</b> to zwykle 25-35% tygodniowego kilometrażu — sprawdź czy się mieścisz.' }
      ]
    },
    kalorie: {
      title: 'Kalorie spalone',
      sections: [
        { heading: 'Co to jest', body: 'Sumaryczny <b>wydatek energetyczny</b> treningów. Liczone z OCR screenów (gdy dostępne) lub szacowane wzorem MET × waga × czas (gdy brak danych z zegarka).' },
        { heading: 'Jak czytać', body: 'Tygodniowe słupki — porównuj objętość energetyczną tygodni. Wartości zależne od wagi: 70kg biegacz spala ~60% mniej niż 90kg na tej samej trasie.<br><br>Punkty odniesienia (przy biegu spokojnym):<br>• 30 min biegu = ~300-450 kcal<br>• 1h biegu = ~600-900 kcal<br>• Long run 2h = ~1200-1800 kcal' },
        { heading: 'Co robić', body: '• <b>Łącz z nutrition tracker</b> — jeśli widzisz tydzień 4000+ kcal spalonego treningu, sprawdź czy jesz wystarczająco. Deficyt &gt; 500 kcal/dzień długoterminowo = ryzyko spadku formy.<br>• <b>Po dużym wydatku</b> (long run, race) zwiększ białko i węglowodany przez 24-48h.<br>• <b>Wzór MET</b> to szacunek — z OCR dane z zegarka są dokładniejsze (uwzględniają HR, elevation).' }
      ]
    },
    heatmap: {
      title: 'Heatmap · 13 tygodni',
      sections: [
        { heading: 'Co to jest', body: 'Heatmap to <b>GitHub-style mapa cieplna</b> — 13 tygodni × 7 dni. Każda komórka = jeden dzień, kolor pokazuje intensywność treningu (TRIMP).' },
        { heading: 'Jak czytać', body: '5 poziomów intensywności:<br><br>⬜ <b>0</b> — brak treningu (regeneracja lub odpoczynek)<br>🟩 <b>1-30 TRIMP</b> — lekki (spokojny bieg, krótka aktywność)<br>🟢 <b>31-60 TRIMP</b> — średni (typowy trening 60min)<br>🟠 <b>61-100 TRIMP</b> — wysoki (tempo, długi, interwały)<br>🔴 <b>&gt; 100 TRIMP</b> — bardzo wysoki (long, ciężki interwałowy, race)<br><br>Hover na komórkę = data, TRIMP, kcal.' },
        { heading: 'Co robić', body: '• <b>Patrz na pattern, nie pojedyncze dni</b> — szukasz mieszanki kolorów. Same zielone = brak intensywności. Same czerwone = brak regeneracji.<br>• <b>Białe dni 2× w tygodniu</b> = zdrowa regeneracja. 0 białych dni &gt; 2 tygodnie = ryzyko przemęczenia.<br>• <b>Dwa czerwone z rzędu</b> = sprawdź czy następny jest biały/zielony. Twardy-twardy-twardy = receptura na kontuzję.' }
      ]
    },
    types_pie: {
      title: 'Typy treningów · 7 dni',
      sections: [
        { heading: 'Co to jest', body: 'Wykres kołowy pokazujący <b>podział kilometrażu wg typu treningu</b> w ostatnich 7 dniach. Spokojny, tempo, interwały, długi, regeneracja itd.' },
        { heading: 'Jak czytać', body: 'Większa wycinka = więcej km tego typu. Kolory zgodne z resztą aplikacji (każdy typ ma swoją barwę).<br><br>Zdrowy podział hobbysty (orientacyjnie):<br>• <b>70-80%</b> spokojny / wybieganie / regeneracja<br>• <b>15-20%</b> tempo / progresja<br>• <b>5-10%</b> interwały / wyścig<br>• <b>+</b> długi 1× tygodniowo (osobno, ~25-30% tygodniowego km)' },
        { heading: 'Co robić', body: '• <b>100% spokojny</b> &gt; 2 tygodnie = brak intensywności = forma się "płaszczy". Dorzuć 1× tempo lub interwał.<br>• <b>&gt; 30% intensywny</b> (tempo+interwały) = duże ryzyko przemęczenia/kontuzji. Łatwiej, łatwiej, łatwiej.<br>• <b>Brak długiego</b> &gt; 2 tygodnie (jeśli plan ma) = zawęża się baza wytrzymałości.' }
      ]
    },
    race_countdown: {
      title: 'Odliczanie do startu',
      sections: [
        { heading: 'Co to jest', body: 'Odliczanie do <b>najbliższego startu</b> zapisanego w Twoich celach startowych. Pokazuje nazwę startu + liczbę dni do daty.' },
        { heading: 'Jak czytać', body: 'Pojawia się tylko gdy masz upcoming start w profil → cele. Aktualizuje się codziennie.<br><br>Strefy taperu (orientacyjnie):<br>• <b>&gt; 28 dni</b> — build phase, normalna progresja<br>• <b>14-28 dni</b> — peak phase, ostatnie ciężkie tygodnie<br>• <b>7-14 dni</b> — taper start, redukcja objętości o 20-40%<br>• <b>0-7 dni</b> — final taper, lekkie treningi, race readiness check<br>• <b>DZIŚ!</b> — race day, powodzenia 🏁' },
        { heading: 'Co robić', body: '• <b>Dodaj kolejny start</b> w profil → cele żeby countdown szedł dalej po wyścigu.<br>• <b>W taperze</b> patrz na TSB — celuj w +5 do +15 dzień przed startem.<br>• <b>48h przed</b> zero ciężkich treningów. Krótkie wybieganie + pasta party.<br>• <b>Race day</b> — śpisz, jesz znanymi rzeczami, nie testujesz nowości.' }
      ]
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // showMetricTooltip(key) — uniwersalny modal "jak dla debida"
  // Wstrzykuje modal do body, zamyka klik backdrop / ESC / × button
  // ─────────────────────────────────────────────────────────────────────
  window.showMetricTooltip = function(key) {
    const data = window.METRIC_TOOLTIPS && window.METRIC_TOOLTIPS[key];
    if (!data) { console.warn('[tooltip] brak content dla key:', key); return; }

    // Remove existing modal jeśli był
    document.getElementById('metric-tooltip-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'metric-tooltip-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);animation:tipFadeIn 0.2s ease;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const sectionsHtml = data.sections.map(s =>
      '<div style="margin-bottom:16px;">' +
        '<div style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#e8561e;font-weight:700;margin-bottom:6px;">' + s.heading + '</div>' +
        '<div style="font-family:\'Inter\',sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.88);">' + s.body + '</div>' +
      '</div>'
    ).join('');

    modal.innerHTML = '<div style="max-width:520px;width:100%;max-height:85vh;overflow-y:auto;background:linear-gradient(140deg,#1a1422,#13101a);border:1px solid rgba(232,86,30,0.3);border-radius:16px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">' +
      '<div style="display:flex;align-items:start;justify-content:space-between;gap:12px;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
        '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:20px;letter-spacing:0.04em;color:#fff;">' + data.title + '</div>' +
        '<button onclick="document.getElementById(\'metric-tooltip-modal\')?.remove()" style="background:rgba(255,255,255,0.08);border:none;color:#fff;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px;flex-shrink:0;">×</button>' +
      '</div>' +
      sectionsHtml +
    '</div>';

    document.body.appendChild(modal);

    // ESC close
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  };

  // Helper do generowania (i) icon HTML — używany inline w templates
  window.tooltipIconHtml = function(key, style) {
    style = style || '';
    return '<button onclick="event.stopPropagation();window.showMetricTooltip(\'' + key + '\')" title="Co to znaczy?" style="background:rgba(232,86,30,0.15);border:1px solid rgba(232,86,30,0.35);color:#e8561e;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:10px;font-family:\'DM Mono\',monospace;font-weight:700;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1;flex-shrink:0;' + style + '">i</button>';
  };

  // Inject CSS animacja fadeIn raz (jeśli sb.js loaded multiple times — guard)
  if (typeof document !== 'undefined' && !document.getElementById('tip-anim-style')) {
    const s = document.createElement('style');
    s.id = 'tip-anim-style';
    s.textContent = '@keyframes tipFadeIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}';
    document.head.appendChild(s);
  }

  // Single source of truth dla training_type colors (używane w _renderFormaTypes, statystyki.html, future heatmap)
  window.TRAINING_TYPE_COLORS = {
    'Spokojny':'#3db870','Bieg spokojny':'#3db870','Tempo':'#e8b840','Interwały':'#e05050','Długi':'#5b8cff','Wybieganie':'#5b8cff',
    'Regeneracja':'#9b6dff','Wzmacniający':'#ff7a45','Zastępczy':'#66c0ff','Odpoczynek':'#888','Progresja':'#e8b840','Start':'#dc2626','Wyścig':'#dc2626','Trening':'#e8561e'
  };

  // Ikony 3D typów treningu (SSOT) — nazwa pliku bez 'icon-' i '.webp'
  window.TRAINING_TYPE_ICONS = {
    'Spokojny':'type-spokojny','Interwały':'type-interwaly','Tempo':'type-tempo','Wybieganie':'type-wybieganie',
    'Regeneracja':'type-regeneracja','Wzmacniający':'type-wzmacniajacy','Start':'type-start','Zastępczy':'type-zastepczy','Odpoczynek':'type-odpoczynek'
  };
  // Zwraca <img> ikony typu (lub '' gdy brak). size w px.
  window.trainingTypeIconHtml = function(type, size) {
    const n = (window.TRAINING_TYPE_ICONS || {})[type];
    if (!n || !window.assetUrl) return '';
    size = size || 18;
    return '<img src="' + window.assetUrl('icon-' + n + '.webp') + '" style="width:' + size + 'px;height:' + size + 'px;vertical-align:-3px;flex-shrink:0;" alt="">';
  };

  // Intensity helpers — używane przez heatmap aktywności (GitHub-style)
  // thresholds opcjonalne — default statyczne progi (zachowanie zawodnik.html)
  window.formaIntensityLevel = function(trimp, thresholds) {
    if (!trimp || trimp === 0) return 0;
    const t = thresholds || { l1: 30, l2: 60, l3: 100 };
    if (trimp <= t.l1) return 1;
    if (trimp <= t.l2) return 2;
    if (trimp <= t.l3) return 3;
    return 4;
  };

  // Helper — wylicz percentile thresholds z logów athlete'a (dni > 0 TRIMP)
  // null gdy < 5 dni danych — fallback do statycznych progów
  window.formaComputePercentileThresholds = function(logs) {
    const dailyTRIMP = {};
    for (const log of (logs || [])) {
      if (!log.logged_at) continue;
      if ((log.training_type || '').startsWith('__badge__')) continue;
      const d = new Date(log.logged_at);
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const t = window.formaTRIMP(log);
      dailyTRIMP[key] = (dailyTRIMP[key] || 0) + t;
    }
    const values = Object.values(dailyTRIMP).filter(v => v > 0).sort((a, b) => a - b);
    if (values.length < 5) return null;
    const pct = (p) => values[Math.floor(values.length * p)];
    return { l1: pct(0.25), l2: pct(0.50), l3: pct(0.80) };
  };
  window.formaIntensityColor = function(level) {
    const colors = [
      'rgba(255,255,255,0.04)',  // 0 — brak treningu
      'rgba(74,222,128,0.25)',   // 1 — lekki (1-30 TRIMP)
      'rgba(74,222,128,0.55)',   // 2 — średni (31-60)
      'rgba(232,86,30,0.65)',    // 3 — wysoki (61-100)
      'rgba(248,113,113,0.75)',  // 4 — bardzo wysoki (100+)
    ];
    return colors[level] || colors[0];
  };

  // Zone label + color helpers — używane przez hero TSB tile + chart marker
  window.formaZoneLabel = function(tsb) {
    if (tsb < -30) return 'PRZECIĄŻENIE';
    if (tsb < -10) return 'OBCIĄŻENIE';
    if (tsb < 5) return 'NEUTRALNA';
    if (tsb <= 15) return 'OPTIMUM';
    return 'WYPOCZĘTY';
  };
  window.formaZoneColor = function(tsb) {
    if (tsb < -30) return '#f87171';  // red
    if (tsb < -10) return '#fb923c';  // orange
    if (tsb < 5) return '#60a5fa';    // blue (neutral)
    if (tsb <= 15) return '#4ade80';  // green
    return '#fbbf24';                  // yellow
  };

  // ═══════════════════════════════════════════════════════════════
  // 📖 STORYTELLING — coach voice + data voice + recommendation
  // ═══════════════════════════════════════════════════════════════
  window.formaStory = function(logs, raceMarkers, lastCtl, lastAtl, lastTsb, ctl30dAgo) {
    const logsCount = (logs || []).length;

    // Edge: za mało danych
    if (logsCount < 5) {
      return {
        icon: '📝',
        headline: 'BUDUJ HISTORIĘ',
        subline: 'Loguj więcej treningów, by zobaczyć formę i otrzymywać wskazówki.',
        recommendation: null,
        color: 'rgba(255,255,255,0.7)'
      };
    }

    const today = new Date();
    const upcomingRace = (raceMarkers && raceMarkers[0]) ? raceMarkers[0] : null;
    const daysToRace = upcomingRace ? Math.round((upcomingRace.ms - today.getTime()) / 86400000) : null;
    const ctlTrend = ctl30dAgo > 0 ? Math.round((lastCtl - ctl30dAgo) / ctl30dAgo * 100) : 0;
    const trendStr = ctlTrend > 0 ? '↗ +' + ctlTrend + '%' : ctlTrend < 0 ? '↘ ' + ctlTrend + '%' : '→ stabilna';

    // Rule 1: Race w 0-7 dni — taper time
    if (daysToRace !== null && daysToRace >= 0 && daysToRace <= 7) {
      return {
        icon: '🏁',
        headline: upcomingRace.name.toUpperCase() + ' ZA ' + daysToRace + (daysToRace === 1 ? ' DZIEŃ' : ' DNI'),
        subline: 'Czas na taper. Lekkie treningi, krótkie tempa, sporo snu. TSB powinien rosnąć w stronę +10.',
        recommendation: lastTsb < 5
          ? '⚠ TSB jest niski (' + Math.round(lastTsb) + ') — odpocznij, nie forsuj w tym tygodniu.'
          : '✓ Forma rośnie świetnie, jesteś na dobrej drodze.',
        color: '#e8561e'
      };
    }

    // Rule 2: Race w 8-14 dni — ostatni mocny tydzień
    if (daysToRace !== null && daysToRace > 7 && daysToRace <= 14) {
      return {
        icon: '🎯',
        headline: upcomingRace.name.toUpperCase() + ' ZA ' + daysToRace + ' DNI',
        subline: 'Ostatni mocny tydzień przed taperem. 1-2 quality sesje, potem zacznij obniżać objętość.',
        recommendation: '✓ Wykonaj zaplanowane mocne sesje, w przyszłym tygodniu zacznij taper.',
        color: '#fb923c'
      };
    }

    // Rule 3: Heavy fatigue (TSB < -25)
    if (lastTsb < -25) {
      return {
        icon: '🚨',
        headline: 'WYSOKIE OBCIĄŻENIE',
        subline: 'TSB ' + Math.round(lastTsb) + ' · Twój organizm potrzebuje regeneracji. Ryzyko kontuzji rośnie.',
        recommendation: '⚠ Dorzuć 1-2 dni regeneracji. Zmęczenie (ATL ' + Math.round(lastAtl) + ') znacznie przekracza bazę (CTL ' + Math.round(lastCtl) + ').',
        color: '#f87171'
      };
    }

    // Rule 4: Fresh & ready (TSB +5 to +15)
    if (lastTsb >= 5 && lastTsb <= 15) {
      return {
        icon: '⚡',
        headline: 'ŚWIEŻY · GOTOWY DO STARTU',
        subline: 'TSB +' + Math.round(lastTsb) + ' · idealne okno na mocną sesję, start lub PB attempt. CTL ' + trendStr + ' vs 30 dni.',
        recommendation: ctlTrend > 5
          ? '✓ Baza rośnie — wykorzystaj formę na quality trening.'
          : ctlTrend < -5
            ? '⚠ Baza spada — quality trening OK, ale zwiększ objętość.'
            : '✓ Forma świetna — dobry czas na intensywność.',
        color: '#4ade80'
      };
    }

    // Rule 5: Over-rested (TSB > +15)
    if (lastTsb > 15) {
      return {
        icon: '🌿',
        headline: 'BARDZO WYPOCZĘTY',
        subline: 'TSB +' + Math.round(lastTsb) + ' · możesz tracić formę bez treningu. Wróć do regularnej aktywności.',
        recommendation: '✓ Zacznij od spokojnych treningów, stopniowo dorzucaj intensywność.',
        color: '#fbbf24'
      };
    }

    // Rule 6: Steady state (TSB -10 to +5)
    if (lastTsb >= -10) {
      return {
        icon: '📈',
        headline: 'W TRENINGU · ' + trendStr,
        subline: 'Trenujesz w normalnym rytmie. CTL ' + Math.round(lastCtl) + ' · forma ' + (lastTsb >= 0 ? '+' : '') + Math.round(lastTsb) + ' · zmęczenie ' + Math.round(lastAtl) + '.',
        recommendation: ctlTrend > 10
          ? '✓ Świetny progress — baza buduje się solidnie.'
          : ctlTrend < -5
            ? '⚠ Baza spada — zwiększ objętość lub regularność.'
            : '✓ Kontynuuj plan, stabilna forma.',
        color: '#60a5fa'
      };
    }

    // Rule 7: Moderate fatigue (TSB -10 to -25) — fallback
    return {
      icon: '⚠',
      headline: 'OBCIĄŻENIE',
      subline: 'TSB ' + Math.round(lastTsb) + ' · uważaj na regenerację. Pilnuj snu i jedzenia.',
      recommendation: '⚠ Rozważ łatwiejszy tydzień, jeśli nie czujesz świeżości w nogach.',
      color: '#fb923c'
    };
  };

  // Count-up kafelków Formy — znak-aware (TSB +/-), guard NaN, reduced-motion
  window.formaCountUp = function(el, target, withSign) {
    if (!el) return;
    if (!Number.isFinite(target)) { el.textContent = '—'; return; }
    const fmt = (n) => (withSign && n >= 0 ? '+' : '') + Math.round(n);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { el.textContent = fmt(target); return; }
    const start = parseInt((el.textContent || '').replace(/[^\d-]/g, ''), 10) || 0;
    if (start === target) { el.textContent = fmt(target); return; }
    const range = target - start, t0 = performance.now(), dur = 700;
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(start + range * eased);
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  };

  // ── Strefy tętna: palety + wizual słupków (single source; A=kalendarz przepniemy potem) ──
  window.HR_ZONE_COLORS = { Z1:'#8a94a6', Z2:'#4a90d9', Z3:'#3db870', Z4:'#f2b134', Z5:'#e03e3e', Z5a:'#ef7d3a', Z5b:'#e03e3e', Z5c:'#a02525' };
  window.HR_ZONE_PL     = { Z1:'regeneracja', Z2:'tlenowy', Z3:'tempo', Z4:'próg', Z5:'VO2max', Z5a:'VO2max', Z5b:'beztlenowy', Z5c:'maksymalny' };
  // zwraca HTML słupków (sortowanie malejąco wg czasu, rampa, nazwy PL odporne, bpm-range, czas h:mm/m:ss + %)
  window.renderHrZoneBars = function(z) {
    const labels = z.labels || [], times = z.time_s || [], bounds = Array.isArray(z.bounds) ? z.bounds : [];
    const n = Math.min(labels.length, times.length);
    if (!n) return '';
    const total = times.slice(0,n).reduce((s,t)=>s+(t||0),0) || 1;
    const maxT  = Math.max(...times.slice(0,n).map(t=>t||0)) || 1;
    const fmt = (s)=>{ const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
      return h ? (h+':'+String(m).padStart(2,'0')) : (m+':'+String(ss).padStart(2,'0')); };
    const bpmRange = (i)=>{ const hi=bounds[i]; if (hi==null) return ''; const lo=i>0?bounds[i-1]:null;
      return lo!=null ? (lo+'–'+hi) : ('<'+hi); };
    const idx = Array.from({length:n},(_,i)=>i);
    return idx.slice().sort((a,b)=>(times[b]||0)-(times[a]||0)).map(i=>{
      const t=times[i]||0, pct=Math.round(100*t/total), w=Math.max(2, Math.round(100*t/maxT));
      const col=(window.HR_ZONE_COLORS||{})[labels[i]] || '#8a94a6', pl=(window.HR_ZONE_PL||{})[labels[i]], rng=bpmRange(i);
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-family:'DM Mono',monospace;font-size:11px;">
        <div style="width:88px;flex-shrink:0;line-height:1.25;">
          <div style="color:rgba(240,237,232,0.9);">${labels[i]}</div>
          ${pl?`<div style="font-size:8px;color:rgba(240,237,232,0.5);text-transform:uppercase;letter-spacing:0.05em;">${pl}</div>`:''}
          ${rng?`<div style="font-size:8px;color:rgba(240,237,232,0.35);">${rng}</div>`:''}
        </div>
        <div style="flex:1;height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${w}%;background:${col};border-radius:4px;"></div>
        </div>
        <div style="width:64px;text-align:right;flex-shrink:0;color:rgba(240,237,232,0.85);">${fmt(t)} <span style="color:rgba(240,237,232,0.4);">${pct}%</span></div>
      </div>`;
    }).join('');
  };

  // Agregat stref HR w Formie (90d z EF intervals-hr-aggregate; cache klient sessionStorage 6h; authz owner+coach = server-side)
  window.renderFormaHrZones = async function(athleteId, idPrefix, opts) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-hrzones');
    if (!el || !athleteId) return;
    const hide = ()=>{ el.style.display='none'; el.innerHTML=''; };
    try {
      const days = 90, cacheKey = 'hragg_'+athleteId+'_'+days, now = Date.now();
      let d = null;
      try { const c = JSON.parse(sessionStorage.getItem(cacheKey)||'null');
        if (c && c.ts && (now - c.ts) < 6*3600*1000) d = c.data; } catch(e){}   // hit TTL 6h
      if (!d) {
        const { data:{ session } } = await sb.auth.getSession();
        if (!session) return hide();
        const fnUrl = (window.SB_FN_URL || 'https://afqojgkaveykxbltxzwm.supabase.co/functions/v1') + '/intervals-hr-aggregate';
        const res = await fetch(fnUrl, { method:'POST',
          headers:{ 'Authorization':'Bearer '+session.access_token, 'Content-Type':'application/json' },   // ZERO apikey (CORS preflight)
          body: JSON.stringify({ athlete_id: athleteId, days }) });
        d = await res.json().catch(()=>null);
        if (d && d.ok) { try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts:now, data:d })); } catch(e){} }
      }
      if (!d || !d.ok || !d.n_hr || !(d.time_s||[]).some(t=>t>0)) return hide();   // graceful: brak biegów z tętnem
      const labels=d.labels||[], times=d.time_s||[];
      let domI=0; for (let i=1;i<times.length;i++) if ((times[i]||0)>(times[domI]||0)) domI=i;   // dominująca
      const domPL=(window.HR_ZONE_PL||{})[labels[domI]];
      const dom = labels[domI] + (domPL?(' ('+domPL+')'):'');
      const cap = 'ostatnie '+d.days+' dni · '+d.n_hr+' z '+d.n_runs+' biegów z tętnem · głównie '+dom
        + (d.bounds_varied ? ' · progi zmieniły się w oknie' : '');
      el.innerHTML =
        `<div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#fff;font-family:'DM Mono',monospace;font-weight:700;margin-bottom:6px;">❤️ Strefy tętna</div>
         <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.03em;color:rgba(240,237,232,0.5);margin-bottom:10px;">${cap}</div>
         ${window.renderHrZoneBars(d)}`;
      el.style.display='block';
    } catch(e){ hide(); }
  };

  // Core forma renderer — parametryzowany athleteId + idPrefix dla reuse w zawodnik.html + trener.html
  window.renderFormaForAthlete = async function(athleteId, idPrefix, options) {
    if (!athleteId) return;
    const px = idPrefix || 'forma';
    // v4: visibleMetrics — domyślnie wszystkie ON (backward-compat dla starych wywołań)
    const vm = (options && options.visibleMetrics) ? options.visibleMetrics : { tsb: true, ctl: true, atl: true };

    // Lazy-load Chart.js
    if (typeof Chart === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // Lazy-load annotation plugin
    if (typeof Chart !== 'undefined' && !Chart.registry?.plugins?.get('annotation')) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    // Fetch 90 dni training_logs
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 90);

    const { data: logs, error } = await sb.from('training_logs')
      .select('logged_at,duration,training_type,feel,distance_km,pace,heart_rate,elevation_gain,calories')
      .eq('athlete_id', athleteId)
      .not('training_type', 'like', '__badge__%')
      .gte('logged_at', start.toISOString())
      .order('logged_at', { ascending: true });

    if (error) { console.error('[forma] fetch err', error); return; }

    // Fetch race_goals
    const { data: ath } = await sb.from('athletes').select('race_goals').eq('id', athleteId).maybeSingle();
    let raceMarkers = [];
    try {
      const rg = ath?.race_goals ? JSON.parse(ath.race_goals) : [];
      const todayMs = today.getTime();
      const sixtyDaysLater = todayMs + 60 * 24 * 60 * 60 * 1000;
      raceMarkers = (Array.isArray(rg) ? rg : [])
        .filter(r => r && r.date && r.name)
        .map(r => ({ date: r.date, name: r.name, ms: new Date(r.date).getTime() }))
        .filter(r => r.ms >= todayMs && r.ms <= sixtyDaysLater)
        .sort((a, b) => a.ms - b.ms);
    } catch(e) { console.warn('[forma] race_goals parse err', e); }

    // Fetch weight_kg dla calorie calc (heatmap tooltip) — soft fail jeśli brak nutrition_profiles
    let weightKg = 0;
    try {
      const { data: nutProfile } = await sb.from('nutrition_profiles').select('weight_kg').eq('athlete_id', athleteId).maybeSingle();
      weightKg = nutProfile?.weight_kg || 0;
    } catch(e) { console.warn('[forma] nutrition_profiles fetch err', e); }

    // Build daily TRIMP map
    const dailyTRIMP = {};
    (logs || []).forEach(log => {
      const dateStr = log.logged_at.split('T')[0];
      dailyTRIMP[dateStr] = (dailyTRIMP[dateStr] || 0) + window.formaTRIMP(log);
    });

    // Compute endDate dynamic
    const maxRaceFutureDays = raceMarkers.length
      ? Math.ceil((raceMarkers[raceMarkers.length - 1].ms - today.getTime()) / 86400000) + 5
      : 30;
    const cappedMaxFuture = Math.min(maxRaceFutureDays, 90);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + cappedMaxFuture);

    const todayDateStr = today.toISOString().slice(0, 10);

    // Compute series CTL/ATL/TSB (EMA)
    const labels = [];
    const ctlData = [];
    const atlData = [];
    const tsbData = [];
    const trimpData = [];
    let ctl = 0, atl = 0;
    const CTL_DAYS = 42, ATL_DAYS = 7;

    for (let d = new Date(start); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const isFuture = dateStr > todayDateStr;

      if (isFuture) {
        const trimp = 0;
        ctl = ctl + (trimp - ctl) / CTL_DAYS;
        atl = atl + (trimp - atl) / ATL_DAYS;
      } else {
        const trimp = dailyTRIMP[dateStr] || 0;
        ctl = ctl + (trimp - ctl) / CTL_DAYS;
        atl = atl + (trimp - atl) / ATL_DAYS;
        trimpData.push(trimp);
      }

      labels.push(dateStr.slice(5));
      ctlData.push(Math.round(ctl * 10) / 10);
      atlData.push(Math.round(atl * 10) / 10);
      tsbData.push(Math.round((ctl - atl) * 10) / 10);

      if (isFuture) {
        trimpData.push(null);
      }
    }

    // ── Update 3 kafelki premium (TSB + CTL + ATL) ──
    const lastCtl = ctlData[ctlData.length - 1] || 0;
    const lastAtl = atlData[atlData.length - 1] || 0;
    const lastTsb = tsbData[tsbData.length - 1] || 0;
    const animTiles = !!(options && options.animate);

    // TSB: status color + label + scale position
    const tsbValEl = document.getElementById(px + '-tsb-val');
    const tsbDotEl = document.getElementById(px + '-tsb-dot');
    const tsbLabelEl = document.getElementById(px + '-tsb-label');
    const tsbIndicatorEl = document.getElementById(px + '-tsb-indicator');
    if (tsbValEl) { if (animTiles) window.formaCountUp(tsbValEl, Math.round(lastTsb), true); else tsbValEl.textContent = (lastTsb >= 0 ? '+' : '') + Math.round(lastTsb); }

    let tsbColor, tsbLabelText;
    if (lastTsb >= 5 && lastTsb <= 15) { tsbColor = '#4ade80'; tsbLabelText = 'optimum'; }
    else if (lastTsb > 15) { tsbColor = '#fbbf24'; tsbLabelText = 'wypoczęty'; }
    else if (lastTsb >= -10) { tsbColor = '#60a5fa'; tsbLabelText = 'trening'; }
    else if (lastTsb >= -30) { tsbColor = '#fb923c'; tsbLabelText = 'obciążenie'; }
    else { tsbColor = '#f87171'; tsbLabelText = 'przeciążenie'; }

    if (tsbDotEl) { tsbDotEl.style.background = tsbColor; tsbDotEl.style.color = tsbColor; }
    if (tsbLabelEl) tsbLabelEl.textContent = tsbLabelText;
    if (tsbValEl) tsbValEl.style.color = tsbColor;

    // TSB position on scale -30 (0%) to +20 (100%), clamp
    const tsbPct = Math.max(0, Math.min(100, ((lastTsb + 30) / 50) * 100));
    if (tsbIndicatorEl) {
      tsbIndicatorEl.style.left = tsbPct + '%';
      tsbIndicatorEl.style.borderColor = tsbColor;
      tsbIndicatorEl.style.boxShadow = '0 0 6px ' + tsbColor + 'AA';
    }

    // Compute CTL/ATL trend vs 30d ago
    const todayIdx = ctlData.length - 1 - cappedMaxFuture;
    const idx30 = Math.max(0, todayIdx - 30);
    const ctl30dAgo = ctlData[idx30] || 0;
    const atl30dAgo = atlData[idx30] || 0;
    const ctlTrend = ctl30dAgo > 0 ? Math.round((lastCtl - ctl30dAgo) / ctl30dAgo * 100) : 0;
    const atlTrend = atl30dAgo > 0 ? Math.round((lastAtl - atl30dAgo) / atl30dAgo * 100) : 0;

    // CTL tile
    const ctlValEl = document.getElementById(px + '-ctl-val');
    const ctlArrowEl = document.getElementById(px + '-ctl-arrow');
    const ctlLabelEl = document.getElementById(px + '-ctl-label');
    const ctlFillEl = document.getElementById(px + '-ctl-fill');
    const ctlTrendEl = document.getElementById(px + '-ctl-trend');
    if (ctlValEl) { if (animTiles) window.formaCountUp(ctlValEl, Math.round(lastCtl), false); else ctlValEl.textContent = Math.round(lastCtl); }
    if (ctlArrowEl) {
      ctlArrowEl.textContent = ctlTrend > 2 ? '↗' : ctlTrend < -2 ? '↘' : '→';
      ctlArrowEl.style.color = ctlTrend > 2 ? '#4ade80' : ctlTrend < -2 ? '#f87171' : '#60a5fa';
    }
    if (ctlLabelEl) ctlLabelEl.textContent = ctlTrend > 5 ? 'rośnie' : ctlTrend < -5 ? 'spada' : 'stabilna';
    if (ctlFillEl) {
      const ctlFillPct = 50 + Math.max(-50, Math.min(50, ctlTrend));
      ctlFillEl.style.width = ctlFillPct + '%';
    }
    if (ctlTrendEl) ctlTrendEl.textContent = (ctlTrend > 0 ? '+' : '') + ctlTrend + '% vs 30d';

    // ATL tile
    const atlValEl = document.getElementById(px + '-atl-val');
    const atlArrowEl = document.getElementById(px + '-atl-arrow');
    const atlLabelEl = document.getElementById(px + '-atl-label');
    const atlFillEl = document.getElementById(px + '-atl-fill');
    const atlTrendEl = document.getElementById(px + '-atl-trend');
    if (atlValEl) { if (animTiles) window.formaCountUp(atlValEl, Math.round(lastAtl), false); else atlValEl.textContent = Math.round(lastAtl); }
    if (atlArrowEl) {
      atlArrowEl.textContent = atlTrend > 2 ? '↗' : atlTrend < -2 ? '↘' : '→';
      atlArrowEl.style.color = atlTrend > 2 ? '#f87171' : atlTrend < -2 ? '#4ade80' : '#60a5fa';
    }
    if (atlLabelEl) {
      atlLabelEl.textContent = lastAtl > lastCtl * 1.2 ? 'zmęczony' : lastAtl < lastCtl * 0.7 ? 'wypoczęty' : 'normalny';
    }
    if (atlFillEl) {
      const ratio = lastCtl > 0 ? Math.min(100, (lastAtl / lastCtl) * 70) : 50;
      atlFillEl.style.width = ratio + '%';
    }
    if (atlTrendEl) atlTrendEl.textContent = (atlTrend > 0 ? '+' : '') + atlTrend + '% vs 30d';

    // Strefa interpretacji
    const zoneEl = document.getElementById(px + '-zone');
    if (zoneEl) {
      let zoneText, zoneColor;
      if ((logs || []).length < 5) {
        zoneText = 'ℹ️ Za mało danych — loguj więcej treningów, by zobaczyć formę';
        zoneColor = 'rgba(255,255,255,0.7)';
      } else if (lastTsb >= 15) { zoneText = '⚠️ Bardzo wypoczęty — możliwy spadek formy bez treningu'; zoneColor = '#fbbf24'; }
      else if (lastTsb >= 5) { zoneText = '🟢 Forma świeża — gotowy do startów lub mocnych treningów'; zoneColor = '#4ade80'; }
      else if (lastTsb >= -10) { zoneText = '🔵 Trening neutralny — kontynuuj plan'; zoneColor = '#60a5fa'; }
      else if (lastTsb >= -30) { zoneText = '🟠 Wyraźne obciążenie — uważaj na regenerację'; zoneColor = '#fb923c'; }
      else { zoneText = '🔴 Przeciążenie — ryzyko kontuzji, odpocznij'; zoneColor = '#f87171'; }
      zoneEl.textContent = zoneText;
      zoneEl.style.color = zoneColor;
      zoneEl.style.background = zoneColor.startsWith('rgba') ? 'rgba(255,255,255,0.04)' : `${zoneColor}14`;
      zoneEl.style.borderColor = zoneColor.startsWith('rgba') ? 'rgba(255,255,255,0.1)' : `${zoneColor}40`;
    }

    // ── Storytelling header ──
    // ctl30dAgo + todayIdx + idx30 obliczone wcześniej w 3-tile block (CTL trend)
    if (typeof window.formaStory === 'function') {
      const story = window.formaStory(logs || [], raceMarkers, lastCtl, lastAtl, lastTsb, ctl30dAgo);
      const storyContainer = document.getElementById(px + '-story');
      const iconEl = document.getElementById(px + '-story-icon');
      const headlineEl = document.getElementById(px + '-story-headline');
      const sublineEl = document.getElementById(px + '-story-subline');
      const recWrapEl = document.getElementById(px + '-story-rec-wrap');
      const recEl = document.getElementById(px + '-story-rec');
      const bgEl = document.getElementById(px + '-story-bg');

      // Helper: hex → rgb csv dla dynamic radial gradient
      const hexToRgb = (hex) => {
        const h = (hex || '').replace('#', '');
        if (h.length !== 6) return '232,86,30';
        return parseInt(h.substr(0,2), 16) + ',' + parseInt(h.substr(2,2), 16) + ',' + parseInt(h.substr(4,2), 16);
      };

      if (iconEl) iconEl.textContent = story.icon || '📊';
      if (headlineEl) {
        headlineEl.textContent = story.headline;
        headlineEl.style.color = '#fff';  // premium: headline zawsze biały, kolor poprzez ikonę i bg
      }
      if (sublineEl) sublineEl.textContent = story.subline;

      if (recWrapEl && recEl) {
        if (story.recommendation) {
          recEl.textContent = story.recommendation;
          recWrapEl.style.display = 'block';
          recWrapEl.style.borderLeftColor = story.color || '#e8561e';
          const recLabel = recWrapEl.querySelector('div:first-child');
          if (recLabel) recLabel.style.color = story.color || '#e8561e';
        } else {
          recWrapEl.style.display = 'none';
        }
      }

      // Dynamic radial gradient bg (2 punkty emanujące kolorem rule)
      if (bgEl && story.color) {
        const c = story.color.startsWith('rgba') ? '232,86,30' : hexToRgb(story.color);
        bgEl.style.background =
          'radial-gradient(circle at 30% 20%, rgba(' + c + ',0.18) 0%, transparent 50%), ' +
          'radial-gradient(circle at 70% 80%, rgba(' + c + ',0.12) 0%, transparent 50%)';
      }

      // Fade animation na re-render
      if (storyContainer) {
        storyContainer.classList.remove('story-update');
        void storyContainer.offsetWidth; // force reflow
        storyContainer.classList.add('story-update');
      }
    }

    // Build annotations: Dziś + "Tu jesteś" (Strava-pure — race markers w osobnym DIV pod chartem)
    const annotations = {
      // Linia "Dziś"
      today: {
        type: 'line',
        xMin: todayDateStr.slice(5),
        xMax: todayDateStr.slice(5),
        borderColor: 'rgba(255,255,255,0.4)',
        borderWidth: 1.5,
        borderDash: [2, 3],
        label: {
          display: true,
          content: 'Dziś',
          position: 'end',
          backgroundColor: 'rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.85)',
          font: { size: 9, family: 'DM Mono' },
          padding: { top: 3, bottom: 3, left: 6, right: 6 },
          borderRadius: 4,
          yAdjust: -8,
        }
      },
      // MARKER "Tu jesteś" — duża kropka na końcu TSB linii z kolorem per strefa
      you_are_here: {
        type: 'point',
        xValue: todayDateStr.slice(5),
        yValue: lastTsb,
        backgroundColor: lastTsb >= 5 && lastTsb <= 15 ? '#4ade80' : lastTsb > 15 ? '#fbbf24' : lastTsb >= -10 ? '#60a5fa' : lastTsb >= -30 ? '#fb923c' : '#f87171',
        borderColor: '#fff',
        borderWidth: 3,
        radius: 8,
        drawTime: 'afterDatasetsDraw',
        label: {
          display: true,
          content: 'Tu jesteś',
          position: 'top',
          backgroundColor: 'rgba(20,15,30,0.9)',
          color: '#fff',
          font: { size: 9, family: 'DM Mono', weight: 'bold' },
          padding: { top: 3, bottom: 3, left: 7, right: 7 },
          borderRadius: 5,
          yAdjust: -20,
        }
      },
    };

    // v5 Strava-style: 14-day projection (dashed line) — "co jutro jeśli odpoczynę"
    // Liczone tu (poza chart block) bo race markers + TRIMP bars muszą się alignować z chart canvas
    const lastCTL = ctlData[ctlData.length - 1] || 0;
    const lastATL = atlData[atlData.length - 1] || 0;
    const projection = (typeof window.computeFormaProjection === 'function')
      ? window.computeFormaProjection(lastCTL, lastATL, 14)
      : null;
    const extendedLabels = projection ? labels.concat(projection.labels) : labels;
    const padNullsToProj = (arr) => projection ? arr.concat(new Array(projection.labels.length).fill(null)) : arr;
    const padNullsFromHist = (projArr) => projection ? new Array(labels.length).fill(null).concat(projArr) : [];

    // Render race markers POD chartem w osobnym DIV (Strava-style) — szuka #PREFIX-races
    const racesContainerEl = document.getElementById(px + '-races');
    if (racesContainerEl) {
      if (!raceMarkers || raceMarkers.length === 0) {
        racesContainerEl.innerHTML = '';
        racesContainerEl.style.display = 'none';
      } else {
        const escHtml = window.escapeHtml || (s => String(s).replace(/[<>"&]/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;'})[c]));
        const labelToIdx = {};
        labels.forEach((lbl, i) => { labelToIdx[lbl] = i; });

        const markers = raceMarkers.map(race => {
          const raceLabelDate = race.date.slice(5);
          const idx = labelToIdx[raceLabelDate];
          if (idx === undefined) return null;
          const pctX = (idx / (extendedLabels.length - 1)) * 100;
          return {
            pctX: pctX,
            name: race.name,
            date: race.date,
            daysFromNow: Math.round((new Date(race.date).getTime() - Date.now()) / 86400000)
          };
        }).filter(m => m !== null);

        if (markers.length === 0) {
          racesContainerEl.innerHTML = '';
          racesContainerEl.style.display = 'none';
        } else {
          racesContainerEl.style.display = 'block';
          racesContainerEl.innerHTML = '<div style="position:relative;height:28px;margin-top:4px;">' +
            markers.map(m => {
              const safeName = escHtml(m.name);
              const daysLabel = m.daysFromNow >= 0 ? ('za ' + m.daysFromNow + ' dni') : (Math.abs(m.daysFromNow) + ' dni temu');
              return '<div style="position:absolute;left:' + m.pctX.toFixed(2) + '%;top:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;">' +
                '<div style="font-size:14px;line-height:1;">🏁</div>' +
                '<div title="' + safeName + ' (' + daysLabel + ')" style="font-size:8px;font-family:DM Mono,monospace;color:#e8561e;letter-spacing:0.05em;white-space:nowrap;background:rgba(232,86,30,0.12);padding:1px 5px;border-radius:3px;border:1px solid rgba(232,86,30,0.3);max-width:80px;overflow:hidden;text-overflow:ellipsis;">' + safeName + '</div>' +
              '</div>';
            }).join('') +
          '</div>';
        }
      }
    }

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // v4: TRIMP bars w osobnym mini-chart canvasie POD głównym chartem — szuka #PREFIX-trimp-bars
    const trimpBarsEl = document.getElementById(px + '-trimp-bars');
    if (trimpBarsEl && typeof Chart !== 'undefined') {
      const trimpCtx = trimpBarsEl.getContext('2d');
      const trimpChartKey = '_formaTrimpChart_' + px;
      if (window[trimpChartKey]) window[trimpChartKey].destroy();
      window[trimpChartKey] = new Chart(trimpCtx, {
        type: 'bar',
        data: {
          labels: extendedLabels,
          datasets: [{
            label: 'TRIMP',
            data: padNullsToProj(trimpData),
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderColor: 'rgba(255,255,255,0.25)',
            borderWidth: 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reduce ? false : { duration: 800, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(20,15,30,0.95)',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              padding: 8,
              titleFont: { family: 'DM Mono', size: 10 },
              bodyFont: { family: 'DM Sans', size: 11 }
            }
          },
          scales: {
            x: { display: false, grid: { display: false } },
            y: {
              position: 'left',
              ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10, weight: '500' }, maxTicksLimit: 3 },
              grid: { color: 'rgba(255,255,255,0.03)' },
              beginAtZero: true
            }
          }
        }
      });
    }

    // Render Chart — per-prefix instance żeby zawodnik i trener panel mogły coexist
    const chartEl = document.getElementById(px + '-chart');
    if (chartEl) {
      const ctx = chartEl.getContext('2d');
      const chartKey = '_formaChart_' + px;
      if (window[chartKey]) window[chartKey].destroy();
      window[chartKey] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: extendedLabels,
          datasets: [
            // CTL — GŁÓWNA linia (forma długa = progres sezonu): gruba (3px), wypełniona = ciężar wizualny.
            // order:3 → rysowana ZA liniami pomocniczymi, niebieski fill NIE przemywa TSB/ATL; dominuje grubością.
            vm.ctl && { label: 'CTL (forma długa)', data: padNullsToProj(ctlData), borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.10)', tension: 0.3, pointRadius: 0, borderWidth: 3, fill: true, yAxisID: 'y', order: 3 },
            // TSB — pomocnicza (cienka), krystaliczna na wierzchu (order:0). Fill tylko w trybie TSB-solo (graceful fallback dawnego widoku).
            vm.tsb && { label: 'TSB (forma świeża)', data: padNullsToProj(tsbData), borderColor: '#4ade80', backgroundColor: (!vm.ctl && !vm.atl) ? 'rgba(74,222,128,0.12)' : 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, fill: !vm.ctl && !vm.atl, yAxisID: 'y', order: 0 },
            // ATL — pomocnicza (cienka)
            vm.atl && { label: 'ATL (zmęczenie)', data: padNullsToProj(atlData), borderColor: '#f87171', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, yAxisID: 'y', order: 1 },
            // Projection (dashed) — hidden z legend filter
            vm.ctl && projection && { label: 'CTL projection', data: padNullsFromHist(projection.ctlData), borderColor: 'rgba(96,165,250,0.5)', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [5,5], yAxisID: 'y', order: 5 },
            vm.atl && projection && { label: 'ATL projection', data: padNullsFromHist(projection.atlData), borderColor: 'rgba(248,113,113,0.5)', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [5,5], yAxisID: 'y', order: 5 },
            vm.tsb && projection && { label: 'TSB projection', data: padNullsFromHist(projection.tsbData), borderColor: 'rgba(74,222,128,0.5)', backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [5,5], yAxisID: 'y', order: 5 },
          ].filter(Boolean)
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reduce ? false : { duration: 1200, easing: 'easeOutQuart' },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            zoom: {
              pan: { enabled: false },   // S3-fix: wyłączony poziomy drag-pan → nie koliduje z nav-swipe (pinch-zoom niżej zostaje)
              zoom: {
                wheel: { enabled: true, speed: 0.1 },
                pinch: { enabled: true },
                mode: 'x'
              },
              limits: { x: { minRange: 7 } }
            },
            legend: {
              labels: {
                color: 'rgba(255,255,255,0.7)',
                font: { size: 10, family: 'DM Mono' },
                boxWidth: 10,
                padding: 12,
                filter: (item) => !item.text.includes('projection')
              },
              position: 'bottom',
            },
            tooltip: { backgroundColor: 'rgba(20,15,30,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10, titleFont: { family: 'DM Mono', size: 11 }, bodyFont: { family: 'DM Sans', size: 12 } },
            annotation: { annotations: annotations }
          },
          scales: {
            x: {
              ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 }, maxRotation: 0, autoSkipPadding: 20 },
              grid: { display: false }
            },
            y: {
              position: 'left',
              ticks: { color: 'rgba(255,255,255,0.75)', font: { size: 12, weight: '500' } },
              grid: { color: 'rgba(255,255,255,0.04)' }
            }
          }
        }
      });

      // v5.2: Reset zoom button (Strava-style) — pojawia się gdy user zoomował
      let resetBtnEl = document.getElementById(px + '-reset-zoom');
      if (!resetBtnEl) {
        const chartParent = chartEl.parentElement;
        if (chartParent) {
          chartParent.style.position = 'relative';
          const btn = document.createElement('button');
          btn.id = px + '-reset-zoom';
          btn.textContent = '⟲ Reset';
          btn.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 10px;font-family:DM Mono,monospace;font-size:9px;letter-spacing:0.1em;border-radius:6px;cursor:pointer;opacity:0;transition:opacity 0.2s;pointer-events:none;z-index:5;';
          btn.onclick = function() {
            if (window[chartKey] && typeof window[chartKey].resetZoom === 'function') {
              window[chartKey].resetZoom();
              btn.style.opacity = '0';
              btn.style.pointerEvents = 'none';
            }
          };
          chartParent.appendChild(btn);
          resetBtnEl = btn;
        }
      }
      // Re-attach onZoom/onPan callbacks na każdy render (poprzedni chart instance był destroyed)
      if (resetBtnEl && window[chartKey] && window[chartKey].options && window[chartKey].options.plugins && window[chartKey].options.plugins.zoom) {
        const showBtn = function() { resetBtnEl.style.opacity = '1'; resetBtnEl.style.pointerEvents = 'auto'; };
        window[chartKey].options.plugins.zoom.zoom.onZoom = showBtn;
        window[chartKey].options.plugins.zoom.pan.onPan = showBtn;
      }
    }

    // 2 dodatkowe sekcje — pass prefix
    window._renderFormaWeekly(logs || [], px, undefined, !!(options && options.animate));
    window._renderFormaTypes(logs || [], px, !!(options && options.animate));
    window._renderFormaHeatmap(logs || [], px, weightKg, undefined, !!(options && options.animate), athleteId);
    window._renderFormaKcalWeekly(logs || [], px, weightKg, undefined, !!(options && options.animate));
    if (window.renderFormaHrZones) window.renderFormaHrZones(athleteId, px, { isCoach: px === 'pfo' });   // agregat stref HR (async, non-blocking; authz owner+coach server-side)
  };

  // Weekly bars renderer — parametryzowany prefix
  window._renderFormaWeekly = function(logs, idPrefix, globalMax, animate) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-weekly-bars');
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doAnim = !!animate && !reduce;
    const esc = window.escapeHtml || (s => String(s));
    const MON = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

    const buckets = [];
    const today = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(today);
      const dow = today.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      weekStart.setDate(today.getDate() + mondayOffset - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const weekLogs = logs.filter(l => {
        const d = new Date(l.logged_at);
        return d >= weekStart && d < weekEnd;
      });

      const trimp = Math.round(weekLogs.reduce((sum, log) => sum + window.formaTRIMP(log), 0));
      const lbl = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();
      const endDt = new Date(weekEnd); endDt.setDate(endDt.getDate() - 1);
      const m1 = MON[weekStart.getMonth()], m2 = MON[endDt.getMonth()];
      const range = (m1 === m2) ? (weekStart.getDate() + '-' + endDt.getDate() + ' ' + m1)
                                : (weekStart.getDate() + ' ' + m1 + '–' + endDt.getDate() + ' ' + m2);
      buckets.push({ trimp, lbl, range, count: weekLogs.length });
    }

    const localMax = Math.max(...buckets.map(b => b.trimp), 1);
    const max = (globalMax && globalMax > 0) ? globalMax : localMax;
    const peakIdx = buckets.reduce((mi, b, i, a) => b.trimp > a[mi].trimp ? i : mi, 0);
    const curIdx = buckets.length - 1;

    el.style.position = 'relative';  // kontener dla absolutnego tooltipa
    el.innerHTML = buckets.map((b, i) => {
      const h = Math.max((b.trimp / max) * 100, 2);
      const isPeak = b.trimp > 0 && i === peakIdx;
      const isCur = i === curIdx;
      const grad = isPeak ? 'linear-gradient(180deg,#ff7a3d,#ffb27a)' : 'linear-gradient(180deg,#e8561e,#ff7a3d)';
      const glow = isPeak ? 'box-shadow:0 0 10px rgba(255,122,61,0.45);' : '';
      const barTrans = doAnim ? 'transition:height 0.55s cubic-bezier(0.215,0.61,0.355,1);transition-delay:' + (i * 45) + 'ms;' : '';
      const valTrans = doAnim ? 'transition:opacity 0.3s ease;transition-delay:' + (i * 45 + 480) + 'ms;' : '';
      return '<div class="fwb-bar-wrap" data-week="' + esc(b.range) + '" data-trimp="' + b.trimp + '" data-count="' + b.count + '" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;cursor:pointer;">'
        + '<div class="fwb-val" style="font-size:9px;color:rgba(255,255,255,0.6);font-family:DM Mono,monospace;opacity:' + (doAnim ? 0 : 1) + ';' + valTrans + '">' + (b.trimp || '') + '</div>'
        + '<div class="fwb-bar" style="width:100%;background:' + grad + ';border-radius:4px 4px 0 0;height:' + (doAnim ? 0 : h) + '%;min-height:2px;' + glow + barTrans + '"></div>'
        + '<div style="font-size:9px;color:rgba(255,255,255,' + (isCur ? '0.85' : '0.4') + ');font-family:DM Mono,monospace;display:flex;align-items:center;gap:3px;">' + b.lbl + (isCur ? '<span style="width:4px;height:4px;border-radius:50%;background:#4ade80;display:inline-block;"></span>' : '') + '</div>'
        + '</div>';
    }).join('')
    + '<div class="fwb-tip" style="position:absolute;bottom:calc(100% + 8px);left:0;transform:translateX(-50%);pointer-events:none;opacity:0;transition:opacity 0.15s ease;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:7px 10px;font-family:\'DM Mono\',monospace;font-size:10px;color:#fff;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.45);"></div>';

    // Draw-on-load: flip do docelowych wysokości po 1 klatce (CSS transition + stagger robią resztę)
    if (doAnim) requestAnimationFrame(() => {
      const bars = el.querySelectorAll('.fwb-bar'), vals = el.querySelectorAll('.fwb-val');
      buckets.forEach((b, i) => {
        if (bars[i]) bars[i].style.height = Math.max((b.trimp / max) * 100, 2) + '%';
        if (vals[i]) vals[i].style.opacity = '1';
      });
    });

    // Tooltip per słupek (hover desktop + tap mobile) — bind RAZ na kontener (przeżywa re-render innerHTML)
    if (!el._fwbBound) {
      el._fwbBound = true;
      const showTip = (wrap) => {
        const tip = el.querySelector('.fwb-tip'); if (!tip || !wrap) return;
        const cn = +wrap.dataset.count;
        const word = cn === 1 ? 'trening' : (cn >= 2 && cn <= 4 ? 'treningi' : 'treningów');
        tip.innerHTML = esc(wrap.dataset.week) + ' · <b>' + wrap.dataset.trimp + ' TRIMP</b> · ' + cn + ' ' + word;
        const r = wrap.getBoundingClientRect(), er = el.getBoundingClientRect();
        let left = r.left - er.left + r.width / 2;
        const half = tip.offsetWidth / 2, contW = el.clientWidth;
        if (tip.offsetWidth < contW) left = Math.max(half, Math.min(left, contW - half));  // clamp w obrębie kontenera
        tip.style.left = left + 'px';
        tip.style.opacity = '1';
      };
      const hideTip = () => { const tip = el.querySelector('.fwb-tip'); if (tip) tip.style.opacity = '0'; };
      el.addEventListener('pointerover', e => { const w = e.target.closest('.fwb-bar-wrap'); if (w) showTip(w); });
      el.addEventListener('pointerout', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip(); });
      el.addEventListener('pointerdown', e => { const w = e.target.closest('.fwb-bar-wrap'); if (w) showTip(w); });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#' + px + '-weekly-bars')) hideTip(); });
    }
  };

  // Types pie renderer — parametryzowany prefix
  window._renderFormaTypes = function(logs, idPrefix, animate) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-types-content');
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doAnim = !!animate && !reduce;
    const esc = window.escapeHtml || (s => String(s));

    const today = new Date();
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

    const TYPE_COLORS = window.TRAINING_TYPE_COLORS || {};

    const counts = {};
    logs.forEach(l => {
      const d = new Date(l.logged_at);
      if (d < weekAgo) return;
      const t = l.training_type || 'Trening';
      const km = parseFloat(l.distance_km) || 0;
      counts[t] = (counts[t] || 0) + km;
    });

    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    if (total === 0) {
      el.innerHTML = '<div style="font-size:12px;color:rgba(255,255,255,0.5);text-align:center;padding:20px;">Brak treningów w ostatnich 7 dniach</div>';
      return;
    }

    const cx = 60, cy = 60, r = 50;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    let startAngle = -Math.PI / 2;
    let paths = '';
    let legend = '';
    entries.forEach(([type, km], si) => {
      const pct = km / total;
      const tip = type + ' · ' + km.toFixed(1) + ' km · ' + Math.round(pct * 100) + '%';
      const isTop = si === 0;
      const stroke = isTop ? ' stroke="rgba(255,255,255,0.45)" stroke-width="1.5"' : '';
      const endAngle = startAngle + pct * 2 * Math.PI;
      const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
      const largeArc = pct > 0.5 ? 1 : 0;
      const color = TYPE_COLORS[type] || '#e8561e';
      if (pct >= 0.999) {
        paths += '<circle class="fpie-slice" data-tip="' + esc(tip) + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"' + stroke + ' style="cursor:pointer;"/>';
      } else {
        paths += '<path class="fpie-slice" data-tip="' + esc(tip) + '" d="M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z" fill="' + color + '"' + stroke + ' style="cursor:pointer;"/>';
      }
      startAngle = endAngle;

      legend += '<div class="fpie-legrow" data-tip="' + esc(tip) + '" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;cursor:pointer;' + (isTop ? 'font-weight:600;' : '') + '">'
        + '<div style="width:10px;height:10px;background:' + color + ';border-radius:2px;flex-shrink:0;"></div>'
        + '<div style="flex:1;color:rgba(255,255,255,0.85);">' + esc(type) + '</div>'
        + '<div style="color:rgba(255,255,255,0.6);font-family:DM Mono,monospace;">' + km.toFixed(1) + ' km</div>'
        + '</div>';
    });

    const gStyle = doAnim ? 'opacity:0;transform:scale(0.7) rotate(-12deg);transform-box:view-box;transform-origin:60px 60px;transition:opacity 0.5s ease,transform 0.5s cubic-bezier(0.215,0.61,0.355,1);' : '';
    const tipHtml = '<div class="fwb-tip" style="position:absolute;left:0;top:0;transform:translateX(-50%);pointer-events:none;opacity:0;transition:opacity 0.15s ease;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 9px;font-family:\'DM Mono\',monospace;font-size:10px;color:#fff;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.45);"></div>';
    el.style.position = 'relative';
    el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">'
      + '<svg width="120" height="120" viewBox="0 0 120 120" style="flex-shrink:0;overflow:visible;"><g class="fpie-g" style="' + gStyle + '">' + paths + '</g></svg>'
      + '<div style="flex:1;min-width:120px;">' + legend + '</div>'
      + '</div>' + tipHtml;

    // Draw-on-load: pop+settle całego pie po 1 klatce
    if (doAnim) requestAnimationFrame(() => {
      const g = el.querySelector('.fpie-g');
      if (g) { g.style.opacity = '1'; g.style.transform = 'scale(1) rotate(0deg)'; }
    });

    // Tooltip per slice + wiersz legendy (hover + tap) — bind RAZ na kontener
    if (!el._fpieBound) {
      el._fpieBound = true;
      const showTip = (node) => {
        const tip = el.querySelector('.fwb-tip'); if (!tip || !node) return;
        tip.textContent = node.dataset.tip || '';
        const er = el.getBoundingClientRect(), nr = node.getBoundingClientRect();
        const half = tip.offsetWidth / 2;
        let left = nr.left - er.left + nr.width / 2;
        left = Math.max(half, Math.min(left, el.clientWidth - half));  // clamp X
        let top = nr.top - er.top - tip.offsetHeight - 6;
        if (top < 0) top = nr.top - er.top + nr.height + 6;  // flip
        tip.style.left = left + 'px'; tip.style.top = top + 'px'; tip.style.opacity = '1';
      };
      const hideTip = () => { const t = el.querySelector('.fwb-tip'); if (t) t.style.opacity = '0'; };
      el.addEventListener('pointerover', e => { const n = e.target.closest('[data-tip]'); if (n) showTip(n); });
      el.addEventListener('pointerout', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip(); });
      el.addEventListener('pointerdown', e => { const n = e.target.closest('[data-tip]'); if (n) showTip(n); });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#' + px + '-types-content')) hideTip(); });
    }
  };

  // Heatmap aktywności — 13 tygodni × 7 dni grid (GitHub-style)
  window._renderFormaHeatmap = function(logs, idPrefix, weightKg, useGlobalPercentile, animate, athleteId) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-heatmap');
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doAnim = !!animate && !reduce;
    const esc = window.escapeHtml || (s => String(s));

    // Percentile thresholds liczone raz dla całych logów (per athlete) — opcjonalnie
    const thresholds = useGlobalPercentile ? window.formaComputePercentileThresholds(logs) : null;

    // Recompute dailyTRIMP + dailyKcal map (kcal display jeśli weightKg > 0)
    const dailyTRIMP = {};
    const dailyKcal = {};
    const hasKcal = weightKg && weightKg > 0;
    (logs || []).forEach(log => {
      const dateStr = (log.logged_at || '').split('T')[0];
      if (!dateStr) return;
      dailyTRIMP[dateStr] = (dailyTRIMP[dateStr] || 0) + window.formaTRIMP(log);
      if (hasKcal) {
        dailyKcal[dateStr] = (dailyKcal[dateStr] || 0) + window.formaCalories(log, weightKg);
      }
    });

    // Anchor: Monday of current week (Polish convention, Mon=1, Sun=0)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() + mondayOffset);

    // Start grid: 12 weeks ago Monday → 13 columns total
    const startMonday = new Date(currentMonday);
    startMonday.setDate(currentMonday.getDate() - 12 * 7);

    // Cell sizing per prefix
    const cellSize = px === 'pfo' ? 9 : 11;
    const gap = px === 'pfo' ? 2 : 3;

    // Day labels (Polish)
    const dayLabels = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

    // Build grid HTML
    let cells = '';
    let anyClickable = false;   // L3: czy jest choć jeden klikalny dzień (do mikro-podpisu)
    let monthLabels = '';
    let lastMonth = -1;
    for (let w = 0; w < 13; w++) {
      // Month label dla pierwszej kolumny każdego nowego miesiąca
      const weekStart = new Date(startMonday);
      weekStart.setDate(startMonday.getDate() + w * 7);
      const monthIdx = weekStart.getMonth();
      if (monthIdx !== lastMonth) {
        const monthName = weekStart.toLocaleDateString('pl-PL', { month: 'short' });
        monthLabels += '<div style="position:absolute;left:' + (w * (cellSize + gap)) + 'px;top:0;font-size:8px;color:rgba(255,255,255,0.4);font-family:DM Mono,monospace;">' + monthName + '</div>';
        lastMonth = monthIdx;
      }
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + d);
        const dateStr = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');   // LOKALNA data (spójne z _calLogs=logged_at.split, kaflami mobile 4680/4708, i labelem toLocaleDateString); NIE toISOString — UTC cofa o dzień w +tz → off-by-one (heatmapa + L3 openDay)
        const trimp = dailyTRIMP[dateStr] || 0;
        const kcal = hasKcal ? (dailyKcal[dateStr] || 0) : 0;
        const level = window.formaIntensityLevel(trimp, thresholds);
        const color = window.formaIntensityColor(level);
        const isFuture = date.getTime() > today.getTime();
        const dayDateLabel = date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
        const titleAttr = isFuture
          ? dayDateLabel + ' — przyszłość'
          : trimp > 0
            ? dayDateLabel + ' · TRIMP ' + trimp + (kcal > 0 ? ' · ' + kcal + ' kcal' : '')
            : dayDateLabel + ' · brak treningu';
        const opacity = isFuture ? 0.25 : 1;
        const isToday = !isFuture && date.getTime() === today.getTime();
        const ring = isToday ? 'outline:1.5px solid #4ade80;outline-offset:1px;' : '';
        const animStyle = doAnim
          ? 'opacity:0;transform:scale(0.6);transition:opacity 0.3s ease,transform 0.3s cubic-bezier(0.215,0.61,0.355,1);transition-delay:' + (w * 40) + 'ms;'
          : 'opacity:' + opacity + ';transition:transform 0.15s;';
        // L3: klik → drill-down dnia (aktywny dzień; nie-przyszłość). Zawodnik → ?openDay; trener(pfo) → ?role=coach&athlete=<id>&openDay (drill-down zawodnika; wymaga athleteId — coach-auth EF przepuszcza trenera-tego-zawodnika). dateStr generowany → inline onclick bezpieczny
        const clickable = !isFuture && trimp > 0 && (px !== 'pfo' || !!athleteId);
        if (clickable) anyClickable = true;
        const tipFull = clickable ? (titleAttr + ' · otwórz') : titleAttr;
        const navUrl = (px === 'pfo')
          ? 'kalendarz.html?role=coach&athlete=' + athleteId + '&openDay=' + dateStr
          : 'kalendarz.html?openDay=' + dateStr;
        const clickAttr = clickable ? ' onclick="location.href=\'' + navUrl + '\'"' : '';
        cells += '<div class="fhm-cell" data-tip="' + esc(tipFull) + '" data-date="' + dateStr + '" data-future="' + (isFuture ? 1 : 0) + '" style="width:' + cellSize + 'px;height:' + cellSize + 'px;background:' + color + ';border-radius:2px;grid-column:' + (w + 2) + ';grid-row:' + (d + 1) + ';' + (clickable ? 'cursor:pointer;' : 'cursor:default;') + ring + animStyle + '"' + clickAttr + ' onmouseover="this.style.transform=\'scale(1.4)\'" onmouseout="this.style.transform=\'scale(1)\'"></div>';
      }
    }

    // Day labels column (1)
    let labels = '';
    for (let d = 0; d < 7; d++) {
      labels += '<div style="font-size:8px;color:rgba(255,255,255,0.4);font-family:DM Mono,monospace;line-height:' + cellSize + 'px;grid-column:1;grid-row:' + (d + 1) + ';padding-right:4px;">' + (d % 2 === 0 ? dayLabels[d] : '') + '</div>';
    }

    // Legend
    let legend = '<div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;margin-top:10px;font-size:9px;color:rgba(255,255,255,0.5);font-family:DM Mono,monospace;">';
    legend += '<span>Mniej</span>';
    for (let l = 0; l < 5; l++) {
      legend += '<div style="width:' + cellSize + 'px;height:' + cellSize + 'px;background:' + window.formaIntensityColor(l) + ';border-radius:2px;"></div>';
    }
    legend += '<span>Więcej</span>';
    legend += '</div>';

    const tipHtml = '<div class="fwb-tip" style="position:absolute;left:0;top:0;transform:translateX(-50%);pointer-events:none;opacity:0;transition:opacity 0.15s ease;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 9px;font-family:\'DM Mono\',monospace;font-size:10px;color:#fff;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.45);"></div>';
    const gridHtml = '<div class="fhm-grid" style="position:relative;display:grid;grid-template-columns:18px repeat(13,' + cellSize + 'px);grid-template-rows:repeat(7,' + cellSize + 'px);gap:' + gap + 'px;padding-top:12px;">' + monthLabels + labels + cells + tipHtml + '</div>';
    // L3: mikro-podpis odkrywalności (mobile-friendly, brak hover) — gdy są klikalne dni (zawodnik i trener); ZERO ramek na komórkach (kolor=intensywność zostaje czysty)
    const hint = anyClickable
      ? '<div style="text-align:center;margin-top:8px;font-size:9px;color:rgba(255,255,255,0.4);font-family:\'DM Mono\',monospace;letter-spacing:0.03em;">dotknij dnia z treningiem, żeby zobaczyć szczegóły</div>'
      : '';
    el.innerHTML = gridHtml + legend + hint;

    // Draw-on-load: column-sweep reveal po 1 klatce
    if (doAnim) requestAnimationFrame(() => {
      el.querySelectorAll('.fhm-cell').forEach(c => {
        c.style.opacity = c.dataset.future === '1' ? '0.25' : '1';
        c.style.transform = 'scale(1)';
      });
    });

    // Tooltip per komórka (hover + tap) — bind RAZ na kontener
    if (!el._fhmBound) {
      el._fhmBound = true;
      const showTip = (cell) => {
        const grid = el.querySelector('.fhm-grid'); const tip = grid && grid.querySelector('.fwb-tip');
        if (!tip || !cell) return;
        tip.textContent = cell.dataset.tip || '';
        const gr = grid.getBoundingClientRect(), cr = cell.getBoundingClientRect();
        const half = tip.offsetWidth / 2;
        let left = cr.left - gr.left + cr.width / 2;
        left = Math.max(half, Math.min(left, grid.clientWidth - half));  // clamp X
        let top = cr.top - gr.top - tip.offsetHeight - 6;
        if (top < 0) top = cr.top - gr.top + cr.height + 6;  // flip pod komórkę
        tip.style.left = left + 'px'; tip.style.top = top + 'px'; tip.style.opacity = '1';
      };
      const hideTip = () => { const t = el.querySelector('.fwb-tip'); if (t) t.style.opacity = '0'; };
      el.addEventListener('pointerover', e => { const c = e.target.closest('.fhm-cell'); if (c) showTip(c); });
      el.addEventListener('pointerout', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip(); });
      el.addEventListener('pointerdown', e => { const c = e.target.closest('.fhm-cell'); if (c) showTip(c); });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#' + px + '-heatmap')) hideTip(); });
    }
  };

  // Kalorie weekly bars — 8 tygodni sum kcal (analog do _renderFormaWeekly ale dla kcal)
  window._renderFormaKcalWeekly = function(logs, idPrefix, weightKg, globalMax, animate) {
    const px = idPrefix || 'forma';
    const el = document.getElementById(px + '-kcal-weekly');
    if (!el) return;
    if (!weightKg || weightKg <= 0) {
      el.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,0.5);text-align:center;padding:14px;">🔥 Brak danych — wpisz wagę w sekcji <a href="nutrition.html" style="color:var(--accent);text-decoration:underline;">Odżywianie</a></div>';
      return;
    }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doAnim = !!animate && !reduce;
    const esc = window.escapeHtml || (s => String(s));
    const MON = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];

    // 8 tygodni — buckets Monday-Sunday
    const buckets = [];
    const today = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(today);
      const dow = today.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      weekStart.setDate(today.getDate() + mondayOffset - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const weekLogs = logs.filter(l => {
        const d = new Date(l.logged_at);
        return d >= weekStart && d < weekEnd;
      });

      const kcal = Math.round(weekLogs.reduce((sum, log) => sum + window.formaCalories(log, weightKg), 0));
      const lbl = (weekStart.getMonth() + 1) + '/' + weekStart.getDate();
      const endDt = new Date(weekEnd); endDt.setDate(endDt.getDate() - 1);
      const m1 = MON[weekStart.getMonth()], m2 = MON[endDt.getMonth()];
      const range = (m1 === m2) ? (weekStart.getDate() + '-' + endDt.getDate() + ' ' + m1)
                                : (weekStart.getDate() + ' ' + m1 + '–' + endDt.getDate() + ' ' + m2);
      buckets.push({ kcal, lbl, range, count: weekLogs.length });
    }

    const localMax = Math.max(...buckets.map(b => b.kcal), 1);
    const max = (globalMax && globalMax > 0) ? globalMax : localMax;
    const peakIdx = buckets.reduce((mi, b, i, a) => b.kcal > a[mi].kcal ? i : mi, 0);
    const curIdx = buckets.length - 1;

    el.style.position = 'relative';  // kontener dla absolutnego tooltipa
    el.innerHTML = buckets.map((b, i) => {
      const h = Math.max((b.kcal / max) * 100, 2);
      const isPeak = b.kcal > 0 && i === peakIdx;
      const isCur = i === curIdx;
      const grad = isPeak ? 'linear-gradient(180deg,#fcd34d,#fbbf24)' : 'linear-gradient(180deg,#fbbf24,#f59e0b)';
      const glow = isPeak ? 'box-shadow:0 0 10px rgba(251,191,36,0.45);' : '';
      const barTrans = doAnim ? 'transition:height 0.55s cubic-bezier(0.215,0.61,0.355,1);transition-delay:' + (i * 45) + 'ms;' : '';
      const valTrans = doAnim ? 'transition:opacity 0.3s ease;transition-delay:' + (i * 45 + 480) + 'ms;' : '';
      return '<div class="fwb-bar-wrap" data-week="' + esc(b.range) + '" data-kcal="' + b.kcal + '" data-count="' + b.count + '" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;cursor:pointer;">'
        + '<div class="fwb-val" style="font-size:9px;color:rgba(255,255,255,0.6);font-family:DM Mono,monospace;opacity:' + (doAnim ? 0 : 1) + ';' + valTrans + '">' + (b.kcal > 0 ? b.kcal : '') + '</div>'
        + '<div class="fwb-bar" style="width:100%;background:' + grad + ';border-radius:4px 4px 0 0;height:' + (doAnim ? 0 : h) + '%;min-height:2px;' + glow + barTrans + '"></div>'
        + '<div style="font-size:9px;color:rgba(255,255,255,' + (isCur ? '0.85' : '0.4') + ');font-family:DM Mono,monospace;display:flex;align-items:center;gap:3px;">' + b.lbl + (isCur ? '<span style="width:4px;height:4px;border-radius:50%;background:#4ade80;display:inline-block;"></span>' : '') + '</div>'
        + '</div>';
    }).join('')
    + '<div class="fwb-tip" style="position:absolute;bottom:calc(100% + 8px);left:0;transform:translateX(-50%);pointer-events:none;opacity:0;transition:opacity 0.15s ease;background:rgba(20,15,30,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:7px 10px;font-family:\'DM Mono\',monospace;font-size:10px;color:#fff;white-space:nowrap;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.45);"></div>';

    // Draw-on-load: flip do docelowych wysokości po 1 klatce
    if (doAnim) requestAnimationFrame(() => {
      const bars = el.querySelectorAll('.fwb-bar'), vals = el.querySelectorAll('.fwb-val');
      buckets.forEach((b, i) => {
        if (bars[i]) bars[i].style.height = Math.max((b.kcal / max) * 100, 2) + '%';
        if (vals[i]) vals[i].style.opacity = '1';
      });
    });

    // Tooltip per słupek (hover desktop + tap mobile) — bind RAZ na kontener
    if (!el._fwbBound) {
      el._fwbBound = true;
      const showTip = (wrap) => {
        const tip = el.querySelector('.fwb-tip'); if (!tip || !wrap) return;
        const cn = +wrap.dataset.count;
        const word = cn === 1 ? 'trening' : (cn >= 2 && cn <= 4 ? 'treningi' : 'treningów');
        tip.innerHTML = esc(wrap.dataset.week) + ' · <b>' + wrap.dataset.kcal + ' kcal</b> · ' + cn + ' ' + word;
        const r = wrap.getBoundingClientRect(), er = el.getBoundingClientRect();
        let left = r.left - er.left + r.width / 2;
        const half = tip.offsetWidth / 2, contW = el.clientWidth;
        if (tip.offsetWidth < contW) left = Math.max(half, Math.min(left, contW - half));  // clamp w obrębie kontenera
        tip.style.left = left + 'px';
        tip.style.opacity = '1';
      };
      const hideTip = () => { const tip = el.querySelector('.fwb-tip'); if (tip) tip.style.opacity = '0'; };
      el.addEventListener('pointerover', e => { const w = e.target.closest('.fwb-bar-wrap'); if (w) showTip(w); });
      el.addEventListener('pointerout', e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) hideTip(); });
      el.addEventListener('pointerdown', e => { const w = e.target.closest('.fwb-bar-wrap'); if (w) showTip(w); });
      document.addEventListener('pointerdown', e => { if (!e.target.closest('#' + px + '-kcal-weekly')) hideTip(); });
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // 🔗 FILE METADATA — WeakMap dla "side data" przy plikach (OCR tracking)
  // Cross-browser safe (NIE mutuje native File object, iOS Safari tolerant)
  // ═══════════════════════════════════════════════════════════════
  window._fileMeta = window._fileMeta || new WeakMap();

  // Cleanup po usunięciu zoom feature — kasuje stary localStorage flag i resetuje zoom
  try {
    if (localStorage.getItem('zoomLevel')) {
      localStorage.removeItem('zoomLevel');
      if (document.body && document.body.style.zoom) {
        document.body.style.zoom = '';
      }
    }
  } catch(e) {}

  // Cleanup po usunięciu profile completion modal
  try {
    if (localStorage.getItem('profile_completion_dismissed_until')) {
      localStorage.removeItem('profile_completion_dismissed_until');
    }
  } catch(e) {}

  // ============================================================
  // v6.8: Storage helpers — signed URL generation z 1h expiry
  //
  // Po W2 Step 1: training-screenshots ma granular RLS (zawodnicy
  // uploadują do własnego folderu, trenerzy do folderów swoich atletów).
  // Po W2 Step 4 (planowane): bucket będzie private → getPublicUrl
  // przestanie działać, zostają TYLKO signed URLs.
  //
  // Migracja: zapisujemy PATH (np. "athlete_uuid/file.jpg") zamiast
  // pełnego URL w bazie. Przy renderze wywołujemy storageSignedUrl(path).
  //
  // DUAL MODE: w okresie Step 2-3 baza zawiera oba stany — stare
  // permanentne URL ("https://...supabase.co/storage/v1/object/public/...")
  // i nowe PATH. storageResolveUrl() obsługuje oba.
  // ============================================================

  window.storageSignedUrl = async function(path, bucket = 'training-screenshots', expiresIn = 3600) {
    if (!path) return null;
    const delays = [0, 1200];
    let lastErr = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
      try {
        const { data, error } = await window.sb.storage
          .from(bucket)
          .createSignedUrl(path, expiresIn);
        if (!error) return data?.signedUrl || null;
        lastErr = error;
        const msg = (error.message || '').toLowerCase();
        // permanent — bez retry (brak pliku, brak uprawnień)
        if (msg.includes('not found') || msg.includes('not authorized') || msg.includes('permission')) {
          console.warn('[storageSignedUrl] permanent', path, error.message);
          return null;
        }
        console.warn('[storageSignedUrl] attempt ' + (attempt+1), path, error.message, '(retry)');
      } catch (e) {
        lastErr = e;
        console.warn('[storageSignedUrl] attempt ' + (attempt+1) + ' exception', path, e && e.message);
      }
    }
    console.error('[storageSignedUrl] failed all', path, lastErr && lastErr.message);
    return null;
  };

  window.storageSignedUrls = async function(paths, bucket = 'training-screenshots', expiresIn = 3600) {
    if (!Array.isArray(paths) || paths.length === 0) return [];
    const delays = [0, 1200];
    let lastErr = null;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]));
      try {
        const { data, error } = await window.sb.storage
          .from(bucket)
          .createSignedUrls(paths, expiresIn);
        if (!error) return (data || []).map(d => d?.signedUrl || null);
        lastErr = error;
        console.warn('[storageSignedUrls] attempt ' + (attempt+1), error.message, '(retry)');
      } catch (e) {
        lastErr = e;
        console.warn('[storageSignedUrls] attempt ' + (attempt+1) + ' exception', e && e.message);
      }
    }
    console.error('[storageSignedUrls] failed all', lastErr && lastErr.message);
    return paths.map(() => null);
  };

  // DUAL MODE resolver — bierze "URL lub PATH" i zwraca świeży URL.
  // Wykrywa po prefiksie:
  //   - "https://..." → traktuje jako stary public URL (zwraca as-is)
  //   - cokolwiek innego → traktuje jako PATH, generuje signed URL
  window.storageResolveUrl = async function(urlOrPath, bucket = 'training-screenshots', expiresIn = 3600) {
    if (!urlOrPath) return null;
    if (typeof urlOrPath !== 'string') return null;
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      return urlOrPath; // legacy public URL
    }
    return await window.storageSignedUrl(urlOrPath, bucket, expiresIn);
  };

  window.storageResolveUrls = async function(urlsOrPaths, bucket = 'training-screenshots', expiresIn = 3600) {
    if (!Array.isArray(urlsOrPaths) || urlsOrPaths.length === 0) return [];
    // Rozdziel na legacy URL (zostaw as-is) i PATH (batch signed URL)
    const result = new Array(urlsOrPaths.length).fill(null);
    const pathsToSign = [];
    const pathsIndices = [];
    for (let i = 0; i < urlsOrPaths.length; i++) {
      const v = urlsOrPaths[i];
      if (!v) continue;
      if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) {
        result[i] = v; // legacy
      } else {
        pathsToSign.push(v);
        pathsIndices.push(i);
      }
    }
    if (pathsToSign.length > 0) {
      const signed = await window.storageSignedUrls(pathsToSign, bucket, expiresIn);
      for (let j = 0; j < signed.length; j++) {
        result[pathsIndices[j]] = signed[j];
      }
    }
    return result;
  };

  // ============================================================
  // v6.8: Image placeholder resolver — MutationObserver auto-hydration
  //
  // Renderery są synchroniczne i ich src musi przejść przez safeUrlAttr
  // (https + whitelist). Bare PATH zostałby odrzucony przez XSS sanitizer.
  //
  // Wzorzec: buildery emitują <img data-sp="PATH"> (lub <video data-sp>)
  // z przezroczystym placeholderem jako src. MutationObserver na document.body
  // wykrywa nowe [data-sp], batch-podpisuje przez storageSignedUrls i ustawia
  // .src. Idempotent — po hydration usuwamy data-sp (observer nie złapie 2x).
  //
  // DUAL MODE: legacy https URL renderowane jak dotychczas (przez safeUrlAttr,
  // bez data-sp). Tylko PATH (nowe uploady po W2 Step 2a) idą przez placeholder.
  //
  // Kill switch: window._spObserverEnabled = false wyłącza auto-hydration.
  // Ręczne API window._resolveStorageImgs(container) zachowane (idempotent).
  // ============================================================

  // Przezroczysty 1x1 SVG — placeholder zanim signed URL dojdzie
  var _SP_PLACEHOLDER = 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%2F%3E';

  // Zwraca atrybuty src dla <img>/<video>: legacy https → src="<safe>",
  // PATH → data-sp + placeholder. '' = wartość nieufna/pusta (caller pomija).
  window._spImgSrc = function(urlOrPath) {
    if (!urlOrPath || typeof urlOrPath !== 'string') return '';
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      var safe = window.safeUrlAttr ? window.safeUrlAttr(urlOrPath) : '';
      return safe ? 'src="' + safe + '"' : '';
    }
    return 'data-sp="' + window.escapeHtml(urlOrPath) + '" src="' + _SP_PLACEHOLDER + '"';
  };

  // ── Strategia 2b (2026-05-27): feed = thumb (display) + oryginał (klik/fallback) ──
  window.toThumbPath = function(path) {
    if (!path || typeof path !== 'string' || path.indexOf('http') === 0) return path; // legacy URL → bez thumba
    var m = path.match(/^([^/]+)\/(.+)\.[^.]+$/);
    return m ? m[1] + '/thumbs/' + m[2] + '.jpg' : path;
  };
  // Atrybuty img dla feedu: data-sp=thumb (hydracja), data-orig=oryginał (klik/onerror).
  window._spImgSrcThumb = function(origPath) {
    if (!origPath || typeof origPath !== 'string') return '';
    if (origPath.indexOf('http') === 0) {  // legacy https → render wprost, brak thumba
      var safe = window.safeUrlAttr ? window.safeUrlAttr(origPath) : '';
      return safe ? 'src="' + safe + '"' : '';
    }
    return 'data-sp="' + window.escapeHtml(window.toThumbPath(origPath)) + '" data-orig="' + window.escapeHtml(origPath) + '" src="' + _SP_PLACEHOLDER + '"';
  };
  // onerror: thumb brak (HEIF-skip/straggler) → załaduj oryginał (świeży signed URL). Guard 1×.
  window._spThumbFallback = function(img) {
    if (img._spfb) { img.onerror = null; img.style.display = 'none'; return; }
    img._spfb = true;
    var orig = img.getAttribute('data-orig');
    if (!orig) { img.onerror = null; img.style.display = 'none'; return; }
    img.onerror = function() {  // Strategia 5: oryginał padł → retry 1× po 2s (świeży signed URL), potem hide
      if (img._spRetried) { img.onerror = null; img.style.display = 'none'; return; }
      img._spRetried = true;
      setTimeout(function() {
        window.storageResolveUrl(orig).then(function(u) {
          var s = window.safeUrlAttr ? window.safeUrlAttr(u) : u;
          if (s) img.src = u; else { img.onerror = null; img.style.display = 'none'; }
        }).catch(function() { img.onerror = null; img.style.display = 'none'; });
      }, 2000);
    };
    window.storageResolveUrl(orig).then(function(u){ var s = window.safeUrlAttr ? window.safeUrlAttr(u) : u; if (s) img.src = u; else img.style.display = 'none'; }).catch(function(){ img.style.display = 'none'; });
  };
  // klik → ORYGINAŁ full-res (świeży signed URL).
  window._spOpenOrig = function(img) {
    var orig = img.getAttribute('data-orig');
    if (!orig) { if (img.src) window.open(img.src, '_blank'); return; }
    window.storageResolveUrl(orig).then(function(u){ if (u) window.open(u, '_blank'); });
  };

  // ── Upload z retry+backoff (2026-05-28): łagodzi transient throttle/breaker/network.
  // Permanent errors (RLS/too-large/mime/duplicate) → bez retry. Zwraca {data,error} jak upload().
  window.storageUploadRetry = async function(bucket, path, file, options, retries) {
    retries = retries || 3;
    var delays = [0, 1500, 4000];  // backoff: 0 / 1.5s / 4s
    var lastErr = null;
    for (var attempt = 0; attempt < retries; attempt++) {
      if (delays[attempt] > 0) await new Promise(function(r){ setTimeout(r, delays[attempt]); });
      try {
        var res = await sb.storage.from(bucket).upload(path, file, options);
        if (!res.error) return { data: res.data, error: null };
        lastErr = res.error;
        var msg = (res.error.message || '').toLowerCase();
        if (msg.includes('duplicate') || msg.includes('already exists') || msg.includes('permission') ||
            msg.includes('not authorized') || msg.includes('too large') || msg.includes('exceeded') || msg.includes('mime')) {
          return { data: null, error: res.error };  // permanent — bez retry
        }
        console.warn('[uploadRetry] ' + path + ' attempt ' + (attempt + 1) + ' failed:', res.error.message, '(retry)');
      } catch (e) {
        lastErr = { message: (e && e.message) || 'Network error' };
        console.warn('[uploadRetry] ' + path + ' attempt ' + (attempt + 1) + ' network err:', e && e.message);
      }
    }
    return { data: null, error: lastErr };
  };

  // Pełny <img> tag z DUAL MODE src. '' jeśli wartość nieufna/pusta.
  window._makeStorageImgTag = function(urlOrPath, className, extraStyles) {
    var attrs = window._spImgSrc(urlOrPath);
    if (!attrs) return '';
    return '<img ' + attrs + ' class="' + (className || '') + '" style="' + (extraStyles || '') + '">';
  };

  // v6.8 W2 Step 2b: walidacja PATH wiadomości głosowej PRZED createSignedUrl.
  // Akceptuje TYLKO "uuid/filename.<audio-ext>" — odrzuca URL-e (http/https),
  // schematy (javascript:), path traversal, obce rozszerzenia. Defense przy
  // playVoice (które dostaje wartość z onclick w trusted body).
  window._chatVoicePathValid = function(path) {
    if (!path || typeof path !== 'string') return false;
    // mp4 dodane: builder uploadVoiceMsg produkuje webm/ogg/mp4 (Safari=mp4) — regex musi je objąć
    return /^[a-f0-9-]{36}\/[\w._-]+\.(webm|mp3|ogg|m4a|mp4)$/i.test(path);
  };

  // v6.9 (2026-05-27): downscale image → JPEG blob (max maxDim px) PRZED uploadem.
  // Free-plan egress/storage opt. NIGDY nie rzuca — fallback resolve(file) gdy
  // nie-image / HEIF nie do zdekodowania (Android canvas) / już mały / brak zysku.
  window.downscaleImage = function(file, maxDim, quality) {
    maxDim = maxDim || 1600; quality = quality || 0.85;
    return new Promise(function(resolve) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) { resolve(file); return; }
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function() {
        URL.revokeObjectURL(url);
        var scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        if (scale >= 1 && file.size < 300 * 1024) { resolve(file); return; }
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function(blob) {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = function() { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  };

  // Przygotowanie pliku do uploadu — SSOT kompresji + strażnik rozmiaru.
  // Nieskompresowalny (wideo / HEIC-fail) i > maxRawBytes → {ok:false,tooBig}. Inaczej {ok,data,ext,contentType}.
  window.prepUpload = async function(file, maxDim, quality, maxRawBytes) {
    maxRawBytes = maxRawBytes || 15 * 1024 * 1024;
    var up = await window.downscaleImage(file, maxDim || 1600, quality || 0.85);
    var shrunk = up !== file;
    if (!shrunk && file.size > maxRawBytes) return { ok: false, tooBig: true };
    return { ok: true, data: up, ext: shrunk ? 'jpg' : (file.name.split('.').pop() || 'jpg'),
             contentType: shrunk ? 'image/jpeg' : file.type };
  };

  window._resolveStorageImgs = function(container, bucket = 'training-screenshots') {
    if (!container) return;
    const els = (container.querySelectorAll ? container.querySelectorAll('[data-sp]') : []); // <img> i <video>
    if (!els || els.length === 0) return;
    const paths = [];
    const elements = [];
    els.forEach(el => {
      const p = el.getAttribute('data-sp');
      if (p) { paths.push(p); elements.push(el); }
    });
    if (paths.length === 0) return;
    window.storageSignedUrls(paths, bucket, 21600).then(urls => {
      for (let i = 0; i < elements.length; i++) {
        const url = urls[i];
        const el = elements[i];
        if (!el || !el.isConnected) continue;
        el.removeAttribute('data-sp'); // idempotent — observer nie złapie 2x
        // Walidacja: signed URL = supabase host → przejdzie safeUrlAttr
        const safe = window.safeUrlAttr ? window.safeUrlAttr(url) : (url && url.startsWith('https://') ? url : '');
        if (safe) { el.src = url; }
        else if (el.getAttribute('data-orig') && window._spThumbFallback) { window._spThumbFallback(el); }
        else { el.style.display = 'none'; }
      }
    }).catch(e => { console.error('[_resolveStorageImgs] batch failed', e); });
  };

  // ── Strategia 4 (2026-05-27): LAZY hydration — signed URL dopiero gdy element
  // wjeżdża w viewport (IntersectionObserver). Feed nie ładuje wszystkich thumbów
  // naraz — tylko widoczne. Fallback: brak IO → eager _resolveStorageImgs.
  async function _spSignOne(el, bucket) {
    if (!el || !el.isConnected) return true; // znikł — przestań obserwować
    var path = el.getAttribute('data-sp');
    if (!path) return true;
    var url = await window.storageSignedUrl(path, bucket, 21600);
    if (!el.isConnected) return true;
    var safe = window.safeUrlAttr ? window.safeUrlAttr(url) : (url && url.indexOf('https://') === 0 ? url : '');
    if (safe) {
      el.removeAttribute('data-sp');  // sukces — dopiero teraz
      el.src = url;
      return true;
    }
    // sign FAIL — jeśli jest data-orig (thumb mógł nie istnieć) → fallback od razu
    if (el.getAttribute('data-orig') && window._spThumbFallback) {
      el.removeAttribute('data-sp');
      window._spThumbFallback(el);
      return true;
    }
    // brak fallbacku → NIE pal: zostaw data-sp, pozwól IO spróbować znów przy następnym przecięciu viewportu
    return false;
  }
  var _spIO = null;
  window._spLazyHydrate = function(container, bucket) {
    bucket = bucket || 'training-screenshots';
    if (!container || !container.querySelectorAll) return;
    var els = container.querySelectorAll('[data-sp]');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { window._resolveStorageImgs(container, bucket); return; } // fallback eager
    if (!_spIO) {
      _spIO = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          if (e.isIntersecting) {
            _spSignOne(e.target, bucket).then(function(done){ if (done) _spIO.unobserve(e.target); });
          }
        });
      }, { rootMargin: '300px' });
    }
    els.forEach(function(el){ _spIO.observe(el); });
  };

  // Auto-hydration observer (debounce 50ms)
  window._spObserverEnabled = true;
  (function _initSpObserver() {
    let pending = null;
    const flush = () => { pending = null; if (window._spObserverEnabled) window._spLazyHydrate(document.body); };
    const schedule = () => { if (!pending) pending = setTimeout(flush, 50); };
    const start = () => {
      if (!document.body) { setTimeout(start, 50); return; }
      const obs = new MutationObserver((muts) => {
        if (!window._spObserverEnabled) return;
        for (const m of muts) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if ((node.matches && node.matches('[data-sp]')) || (node.querySelector && node.querySelector('[data-sp]'))) {
              schedule();
              return;
            }
          }
        }
      });
      obs.observe(document.body, { subtree: true, childList: true });
      schedule(); // initial — placeholdery obecne już przy load
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  })();
})();
