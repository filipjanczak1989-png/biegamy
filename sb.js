// ════════════════════════════════════════════════════════════════════
// BiegaMy — Supabase client (single source of truth)
// ════════════════════════════════════════════════════════════════════
// Załączany w <head> KAŻDEJ strony PO supabase-js CDN:
//
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="js/sb.js" defer></script>
//
// Używanie (globalne):
//   sb.auth.getSession()
//   sb.from('athletes').select(...)
//   fetch(SB_FN_URL + '/verify-coach-code', { headers: { Authorization: 'Bearer ' + SB_KEY } })
//
// Rotacja klucza:
//   1. Wygeneruj nowy publishable key w Supabase
//   2. Zmień SB_KEY w tym pliku
//   3. Deploy — wszystkie strony używają nowego klucza automatycznie
// ════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  window.SB_URL = 'https://afqojgkaveykxbltxzwm.supabase.co';
  window.SB_KEY = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';
  window.SB_FN_URL = window.SB_URL + '/functions/v1';

  // Klient Supabase tworzymy TYLKO jeśli supabase-js jest załadowane.
  // Niektóre strony (np. strava-callback.html) używają tylko klucza w fetch
  // i nie ładują pełnego SDK.
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    window.sb = window.supabase.createClient(window.SB_URL, window.SB_KEY);
  }
})();
