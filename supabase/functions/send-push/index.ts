// ════════════════════════════════════════════════════════════════════
// BIEGAMY — Edge Function: send-push (v5)
// ════════════════════════════════════════════════════════════════════
// v5 zmiany (na bazie v4):
//   - icon: bez /icons/ (root path bezpośrednio — sw.js self-heal
//     pozostaje jako defense in depth dla starszych EF)
//   - badge: faktyczna sylweta monochromatyczna z biegamy-assets
//     (wcześniej był ten sam icon-192 co icon → po mono mask Androida
//      = biały kwadrat na każdej notyfikacji)
//
// v4 zmiany (zachowane):
//   - Dodany typ "athlete_message" w mapie URL → /trener.html?section=msgs
//
// v3 zmiany (zachowane):
//   - Unikalny tag dla ai_report: "ai_report_{report_id}"
//   - report_id w payloadzie
//   - requireInteraction: true dla ai_report
//   - renotify: true
//
// v2 zmiany (zachowane):
//   - Obsługa typu ai_report — URL z report_id w query
//   - Pobieranie data konkretnego raportu dla typu ai_report
// ════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PUSH_HOOK_SECRET = Deno.env.get("PUSH_HOOK_SECRET");   // handshake trigger→EF (Wariant 2); sekret serwisowy NIE trafia do nagłówka triggera
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@biegamy.run";

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 🔒 AUTH GUARD (Push revival Wariant 2): system (x-push-secret == PUSH_HOOK_SECRET) lub zalogowany user; inaczej -> 401
    const _authHeader = req.headers.get("Authorization") || "";
    const _bearer = _authHeader.replace(/^Bearer\s+/i, "");
    const _hookSecret = req.headers.get("x-push-secret");
    const _isSystem = !!PUSH_HOOK_SECRET && _hookSecret === PUSH_HOOK_SECRET;

    // Stróż v0: odrzucony handshake świeci w security_events (best-effort — nie może wywalić 401)
    const _reject = async (reason: string) => {
      try {
        await supabase.from("security_events").insert({
          severity: "warning",
          source: "ef:send-push",
          message: "rejected handshake",
          details: {
            reason,
            ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
            ua: req.headers.get("user-agent") || null,
            has_hook: !!_hookSecret,
            has_bearer: !!_bearer,
          },
        });
      } catch (_e) { /* logowanie best-effort */ }
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    };

    if (!_isSystem) {
      if (!_bearer) return await _reject("no_hook_no_bearer");
      const { data: { user: _caller }, error: _authErr } = await supabase.auth.getUser(_bearer);
      if (_authErr || !_caller) return await _reject("bad_user_jwt");
    }

    const body = await req.json();

    let athlete_id: string;
    let title: string;
    let bodyText: string;
    let url: string;
    let type: string;
    let report_id: string | null = null;
    let customTag: string | null = null;
    let requireInteraction = false;

    if (body.notification_id) {
      const { data: notif, error } = await supabase
        .from("notifications")
        .select("athlete_id, type, message, from_athlete_id")
        .eq("id", body.notification_id)
        .maybeSingle();

      if (error || !notif) {
        return new Response(
          JSON.stringify({ error: "notification not found", details: error?.message }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      athlete_id = notif.athlete_id;
      type = notif.type;
      bodyText = notif.message || "Masz nową aktywność";

      const map: Record<string, { title: string; url: string }> = {
        friend_request: { title: "Nowe zaproszenie", url: "/profil.html" },
        friend_accepted: { title: "Zaproszenie zaakceptowane", url: "/profil.html" },
        follow: { title: "Nowy obserwator", url: "/profil.html" },
        like: { title: "Reakcja na trening", url: "/zawodnik.html?section=social" },
        comment: { title: "Nowy komentarz", url: "/zawodnik.html?section=social" },
        log_comment: { title: "Nowy komentarz", url: "/zawodnik.html?section=social" },
        chat: { title: "Nowa wiadomość", url: "/zawodnik.html?section=msgs" },
        coach_message: { title: "Wiadomość od trenera", url: "/zawodnik.html?section=msgs" },
        athlete_message: { title: "Wiadomość od zawodnika", url: "/trener.html?section=msgs" },
        training_added: { title: "Nowy trening", url: "/zawodnik.html" },
        training_change: { title: "Zmiana planu", url: "/kalendarz.html" },
        training_updated: { title: "Plan zaktualizowany", url: "/kalendarz.html" },
        duel: { title: "Nowy pojedynek", url: "/wyzwania.html" },
        badge: { title: "Nowa odznaka 🏅", url: "/odznaki.html" },
        race_added: { title: "Nowy start", url: "/races.html" },
        ai_report: { title: "Nowy raport od trenera", url: "/raporty.html" },
      };
      let meta = map[type] || { title: "BiegaMy", url: "/zawodnik.html" };

      // ── DLA ai_report: dołącz konkretny report_id do URL ────────
      if (type === "ai_report") {
        const { data: latestReport } = await supabase
          .from("ai_reports")
          .select("id, report_type, summary")
          .eq("athlete_id", athlete_id)
          .eq("visible_to_athlete", true)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestReport) {
          meta = {
            title: "Nowy raport od trenera",
            url: "/raporty.html?report_id=" + latestReport.id,
          };
          if (latestReport.summary) {
            const typeLbl = latestReport.report_type === 'daily' ? 'Dzienny'
              : latestReport.report_type === 'weekly' ? 'Tygodniowy'
              : latestReport.report_type === 'monthly' ? 'Miesięczny'
              : 'Raport';
            bodyText = typeLbl + ': ' + latestReport.summary.substring(0, 120);
          }
          report_id = latestReport.id;
          customTag = "ai_report_" + latestReport.id;
          requireInteraction = true;
        }
      }

      title = meta.title;
      url = meta.url;
    } else if (body.athlete_id && body.title && body.body) {
      // 🔒 ścieżka B (dowolna treść do dowolnego usera) — tylko system (x-push-secret)
      if (!_isSystem) {
        return new Response(
          JSON.stringify({ error: "forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      athlete_id = body.athlete_id;
      title = body.title;
      bodyText = body.body;
      url = body.url || "/zawodnik.html";
      type = body.type || "custom";
      report_id = body.report_id || null;
      customTag = body.tag || null;
      requireInteraction = !!body.requireInteraction;
    } else {
      return new Response(
        JSON.stringify({ error: "missing notification_id or (athlete_id, title, body)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("athlete_id", athlete_id);

    if (subsErr) {
      return new Response(
        JSON.stringify({ error: "fetching subscriptions failed", details: subsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "no subscriptions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payloadObj: Record<string, unknown> = {
      title,
      body: bodyText,
      icon: "https://biegamy.run/icon-192.png",
      badge: "https://filipjanczak1989-png.github.io/biegamy-assets/icon-badge.png",
      url,
      type,
      tag: customTag || type,
    };
    if (report_id) payloadObj.report_id = report_id;
    if (requireInteraction) {
      payloadObj.requireInteraction = true;
      payloadObj.renotify = true;
    }

    const payload = JSON.stringify(payloadObj);

    let sent = 0;
    let failed = 0;
    const expiredIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          sent++;
        } catch (err: any) {
          failed++;
          if (err.statusCode === 410 || err.statusCode === 404) {
            expiredIds.push(sub.id);
          } else {
            console.error("push failed", sub.endpoint.slice(0, 60), err.statusCode, err.message);
          }
        }
      })
    );

    if (expiredIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed, expired: expiredIds.length, type, url, tag: payloadObj.tag }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-push error", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});