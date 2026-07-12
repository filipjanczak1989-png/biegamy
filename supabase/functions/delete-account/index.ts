// supabase/functions/delete-account/index.ts  (Deno — Supabase Edge Function)
// Model B (tombstone). Kolejność: guardy/re-auth -> ZBIERZ ścieżki -> RPC (atomowa) -> STORAGE (best-effort+queue).
// RPC idzie na user-JWT (auth.uid()-scoping). service_role TYLKO do storage + collection + queue.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Parser ścieżki storage: pełny URL (public/sign/authenticated) LUB bare-path + bucket-hint.
function parseStorageRef(raw: string, bucketHint: string): { bucket: string; path: string } | null {
  if (!raw) return null;
  try {
    if (raw.includes('/storage/v1/object/')) {
      const noQuery = raw.split('?')[0];                                       // utnij ?t= buster / ?token=
      const m = noQuery.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/(.+)$/);
      if (!m) return null;
      const rest = decodeURIComponent(m[1]);                                   // "bucket/path/do/pliku"
      const i = rest.indexOf('/');
      if (i < 0) return null;
      return { bucket: rest.slice(0, i), path: rest.slice(i + 1) };
    }
    // bare-path (np. prywatny training-screenshots trzyma sam path) -> bucket z hintu
    return { bucket: bucketHint, path: raw.replace(/^\/+/, '') };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // ── Guard: nagłówek autoryzacji ──
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Brak autoryzacji' });
  const jwt = authHeader.slice(7);

  // ── Guard: body ──
  let body: { password?: string; confirmText?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'Zły request' }); }
  const { password, confirmText } = body;

  // ── Guard 0: typed-confirmation ZAWSZE (dodatkowa bariera) ──
  if (confirmText !== 'USUŃ KONTO') return json(400, { error: 'Wpisz USUŃ KONTO aby potwierdzić' });

  const SB_URL  = Deno.env.get('SUPABASE_URL')!;
  const ANON    = 'sb_publishable_PeK_bJBiBt20Dxm0g5myWg_R1hc3qlY';   // publiczny (== sb.js:32) — literal przetrwa Disable legacy anon
  const SERVICE = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;   // rotacja: nowy sb_secret priorytet, legacy fallback

  // ── Guard 1: weryfikacja JWT -> uid + email + providers (uid WYŁĄCZNIE z tokena) ──
  const anonClient = createClient(SB_URL, ANON);
  const { data: { user }, error: uErr } = await anonClient.auth.getUser(jwt);
  if (uErr || !user) return json(401, { error: 'Sesja nieważna' });
  const uid = user.id;
  const email = user.email || '';
  const providers: string[] = (user.identities || []).map((i: any) => i.provider);
  const hasPassword = providers.includes('email');

  // ── Guard 2: re-auth (hasło gdy provider email; OAuth-only -> typed-confirmation z Guard 0) ──
  if (hasPassword) {
    if (!password) return json(401, { error: 'Hasło wymagane' });
    const reauth = createClient(SB_URL, ANON);
    const { error: pErr } = await reauth.auth.signInWithPassword({ email, password });
    if (pErr) return json(401, { error: 'Nieprawidłowe hasło' });
    await reauth.auth.signOut();                                               // wyrzuć efemeryczną sesję re-authu
  }

  // ════════ Od tego miejsca: wszystkie guardy przeszły ════════

  // ── 3) ZBIERZ ścieżki plików PRZED rpc (service_role; rpc zaraz wyczyści/usunie wiersze) ──
  const admin = createClient(SB_URL, SERVICE);   // default OK dla legacy(rola z Bearer-JWT) i sb_secret(rola z apikey); NIE dodawać Authorization:'' — łamie legacy (42501)
  const refs: Array<{ raw: string; hint: string }> = [];

  const { data: ath } = await admin.from('athletes')
    .select('id, avatar_url').eq('user_id', uid).maybeSingle();
  const athleteId = ath?.id || null;
  if (ath?.avatar_url) refs.push({ raw: ath.avatar_url, hint: 'biegamy-assets' });     // pełny URL

  if (athleteId) {
    const { data: logs } = await admin.from('training_logs')
      .select('attachment_url').eq('athlete_id', athleteId).not('attachment_url', 'is', null);
    (logs || []).forEach((l: any) => l.attachment_url && refs.push({ raw: l.attachment_url, hint: 'training-screenshots' })); // bare-path

    const { data: posts } = await admin.from('profile_posts')
      .select('image_url').eq('athlete_id', athleteId).not('image_url', 'is', null);
    (posts || []).forEach((p: any) => p.image_url && refs.push({ raw: p.image_url, hint: 'profile-posts' }));                  // pełny URL (bucket dziś nie istnieje)
  }

  // intake (badania medyczne!): 2 osobne .eq() + dedup (unik parsowania .or() dla maili ze znakami specjalnymi)
  const bloodPaths: string[] = [];
  if (athleteId) {
    const { data } = await admin.from('athlete_intake_forms')
      .select('blood_tests_screen_url').eq('created_athlete_id', athleteId).not('blood_tests_screen_url', 'is', null);
    (data || []).forEach((f: any) => f.blood_tests_screen_url && bloodPaths.push(f.blood_tests_screen_url));
  }
  if (email) {
    const { data } = await admin.from('athlete_intake_forms')
      .select('blood_tests_screen_url').eq('email', email).not('blood_tests_screen_url', 'is', null);
    (data || []).forEach((f: any) => f.blood_tests_screen_url && bloodPaths.push(f.blood_tests_screen_url));
  }
  [...new Set(bloodPaths)].forEach(p => refs.push({ raw: p, hint: 'training-screenshots' }));   // bare-path

  const objects = refs
    .map(r => parseStorageRef(r.raw, r.hint))
    .filter(Boolean) as Array<{ bucket: string; path: string }>;

  // ── 4) RPC (klient z JWT USERA -> auth.uid() = ten user). ATOMOWA BRAMKA — nieodwracalny rdzeń. ──
  const userClient = createClient(SB_URL, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { error: rpcErr } = await userClient.rpc('delete_my_account');
  if (rpcErr) {
    // ROLLBACK po stronie DB -> konto NIETKNIĘTE, storage jeszcze nieruszony. Czysty stan, bezpieczny retry.
    console.error('[delete-account] RPC fail', { uid, msg: rpcErr.message });
    return json(500, { error: 'Nie udało się usunąć konta. Spróbuj ponownie.' });
  }

  // ── 5) STORAGE delete PO rpc (best-effort; konto już usunięte = NIE blokujemy) ──
  const byBucket = new Map<string, string[]>();
  for (const o of objects) {
    if (!byBucket.has(o.bucket)) byBucket.set(o.bucket, []);
    byBucket.get(o.bucket)!.push(o.path);
  }
  const storageFailures: Array<{ bucket: string; path: string; error: string }> = [];
  for (const [bucket, paths] of byBucket) {
    const { data, error } = await admin.storage.from(bucket).remove(paths);
    if (error) {
      // API-błąd → wszystkie ścieżki tego bucketu nieusunięte
      paths.forEach(p => storageFailures.push({ bucket, path: p, error: error.message }));
      continue;
    }
    // ⚠️ remove() NIE błądzi dla nie-dopasowanych/RLS-denied — porównaj żądane vs faktycznie usunięte (data[].name)
    const removed = new Set((data || []).map((o: any) => o.name));
    paths.forEach(p => { if (!removed.has(p)) storageFailures.push({ bucket, path: p, error: 'not_removed' }); });
  }
  if (storageFailures.length) {
    // Konto USUNIĘTE; pliki nieusunięte (osierocone) -> durable queue do retry (nie tylko log)
    const rows = storageFailures.map(f => ({ uid, bucket: f.bucket, path: f.path, error: f.error }));
    const { error: qErr } = await admin.from('storage_cleanup_queue').insert(rows);
    if (qErr) console.error('[delete-account] queue insert FAIL', { uid, msg: qErr.message });   // ostateczny fallback: log
    console.error('[delete-account] storage cleanup incomplete (account already deleted)', { uid, count: rows.length });
  }

  // ── 6) sukces (signOut robi frontend w ETAP C) ──
  return json(200, { success: true, storageWarnings: storageFailures.length });
});
