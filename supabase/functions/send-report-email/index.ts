// ════════════════════════════════════════════════════════════════════
// BIEGAMY — Edge Function: send-report-email (v1)
// ════════════════════════════════════════════════════════════════════
// Wysyła pełen raport AI jako branded HTML email przez Resend.
//
// Wywołanie:
//   POST { report_id: "uuid" }
//
// Zwraca:
//   { ok: true, email_sent_at, recipient }  lub
//   { ok: false, error, skipped: "reason" }  (np. opt-out)
//
// ENV vars:
//   - RESEND_API_KEY (już skonfigurowany dla auth)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   - PUBLIC_APP_URL (np. https://biegamy.run)  — opcjonalne, default wyciąga z origin
// ════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ════════════════════════════════════════════════════════════════════
// MARKDOWN → HTML (uproszczony, dla email — bez fancy CSS)
// ════════════════════════════════════════════════════════════════════
function mdToEmailHtml(md: string): string {
  if (!md) return '';

  // Wytnij meta-linie typu "PRIORITY: red"
  let html = md
    .replace(/^\s*PRIORITY:\s*(green|yellow|red|low|medium|high)\s*$/gmi, '')
    .replace(/^\s*\*{0,2}PRIORITY\s*:?\s*\w+\s*\*{0,2}\s*$/gmi, '')
    .replace(/^\s*#{1,4}\s*(Priority|PRIORITY|Red flags?|RED FLAGS?)\s*:?\s*$/gmi, '');

  // TL;DR → WSTĘP (spójność z modalem)
  html = html.replace(/^(\s*#{1,4}\s+)TL\s*;?\s*DR\s*:?\s*$/gmi, '$1Wstęp');

  // Escape HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Headers (h1, h2, h3 → branded inline styles)
  html = html.replace(/^### (.+)$/gm,
    '<h3 style="font-family:\'Helvetica Neue\',Arial,sans-serif;font-size:14px;letter-spacing:0.06em;color:#e8561e;margin:24px 0 8px;text-transform:uppercase;font-weight:700;">$1</h3>');
  html = html.replace(/^## (.+)$/gm,
    '<h2 style="font-family:\'Helvetica Neue\',Arial,sans-serif;font-size:18px;letter-spacing:0.04em;color:#0c0c10;margin:32px 0 14px;padding-top:20px;border-top:1px solid #eaeaea;text-transform:uppercase;font-weight:700;">$1</h2>');
  html = html.replace(/^# (.+)$/gm,
    '<h1 style="font-family:\'Helvetica Neue\',Arial,sans-serif;font-size:22px;color:#0c0c10;margin:24px 0 16px;font-weight:700;">$1</h1>');

  // Bold + italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0c0c10;font-weight:700;">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em style="font-style:italic;color:#444;">$1</em>');

  // Lists
  html = html.replace(/^[\-\*] (.+)$/gm,
    '<li style="margin:8px 0;list-style:none;padding-left:20px;position:relative;line-height:1.65;color:#1a1a1a;"><span style="position:absolute;left:0;color:#e8561e;font-weight:700;">›</span>$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm,
    '<li style="margin:10px 0;list-style:none;padding-left:28px;position:relative;line-height:1.65;color:#1a1a1a;"><span style="position:absolute;left:0;color:#e8561e;font-weight:700;font-size:13px;top:1px;">$1.</span>$2</li>');
  html = html.replace(/(<li[^>]*>.+?<\/li>\s*)+/gs, function(match) {
    return '<ul style="padding:0;margin:14px 0;">' + match + '</ul>';
  });

  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p style="margin:14px 0;color:#1a1a1a;line-height:1.7;font-size:15px;">');
  html = '<p style="margin:14px 0;color:#1a1a1a;line-height:1.7;font-size:15px;">' + html + '</p>';

  // Cleanup pustych paragrafów + paragrafów wokół headerów/list
  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');
  html = html.replace(/<p[^>]*>(\s*<h[1-3]|\s*<ul)/g, '$1');
  html = html.replace(/(<\/h[1-3]>|<\/ul>)\s*<\/p>/g, '$1');

  return html;
}

// ════════════════════════════════════════════════════════════════════
// Hero zdjęcie — deterministyczny indeks z 26 (ten sam co w modalu)
// ════════════════════════════════════════════════════════════════════
function heroImageForReport(reportId: string, baseUrl: string): string {
  let h = 0;
  for (let i = 0; i < (reportId || '').length; i++) {
    h = ((h << 5) - h + reportId.charCodeAt(i)) | 0;
  }
  const idx = (Math.abs(h) % 26) + 1;
  return `${baseUrl}/storage/v1/object/public/biegamy-assets/ra${idx}.webp`;
}

// ════════════════════════════════════════════════════════════════════
// Branded HTML email template
// ════════════════════════════════════════════════════════════════════
function renderEmailHtml(opts: {
  athleteName: string;
  reportType: string; // "Dzienny" / "Tygodniowy" / "Miesięczny"
  reportDate: string;
  periodLabel: string; // np. "10 kwi - 8 maj 2026"
  bodyHtml: string;
  heroUrl: string;
  appUrl: string;
  reportId: string;
}): string {
  const { athleteName, reportType, reportDate, periodLabel, bodyHtml, heroUrl, appUrl, reportId } = opts;

  const openInAppUrl = `${appUrl}/raporty.html?report_id=${reportId}`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Raport od trenera — BIEGAMY</title>
</head>
<body style="margin:0;padding:0;background:#f4f3ef;font-family:'Helvetica Neue',Arial,sans-serif;">

<!-- Wrapper zewnętrzny dla outlooków -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f3ef;padding:24px 12px;">
  <tr><td align="center">

    <!-- Email content (max 600px) -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

      <!-- Hero zdjęcie -->
      <tr>
        <td style="position:relative;height:240px;background-color:#0c0c10;background-image:url('${heroUrl}');background-size:cover;background-position:center 28%;">
          <!-- Czarny header overlay -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="height:240px;background:linear-gradient(180deg,rgba(7,5,16,0.55) 0%,rgba(7,5,16,0.05) 25%,rgba(7,5,16,0) 50%,rgba(7,5,16,0.92) 100%);">
            <tr>
              <td valign="top" style="padding:20px 24px;">
                <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.06em;color:#ffffff;text-shadow:0 2px 8px rgba(0,0,0,0.6);">BIEGAMY</div>
                <div style="font-size:9px;color:rgba(255,255,255,0.7);letter-spacing:0.18em;text-transform:uppercase;margin-top:3px;text-shadow:0 1px 4px rgba(0,0,0,0.6);">Od trenera</div>
              </td>
              <td valign="top" align="right" style="padding:20px 24px;">
                <div style="font-size:9px;color:rgba(255,255,255,0.7);letter-spacing:0.18em;text-transform:uppercase;text-shadow:0 1px 4px rgba(0,0,0,0.6);">${reportDate}</div>
              </td>
            </tr>
            <tr>
              <td colspan="2" valign="bottom" style="padding:0 24px 20px;">
                <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:0.02em;color:#ffffff;line-height:1.05;text-shadow:0 2px 8px rgba(0,0,0,0.5);text-transform:uppercase;">Raport ${reportType}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.85);font-family:'Courier New',monospace;letter-spacing:0.06em;margin-top:6px;text-shadow:0 1px 4px rgba(0,0,0,0.6);">${athleteName} · ${periodLabel}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Pomarańczowa linia akcent -->
      <tr>
        <td style="padding:0;background:#ffffff;">
          <div style="height:3px;width:60px;background:linear-gradient(90deg,#e8561e 0%,#FF6B2C 100%);margin:24px 24px 8px;border-radius:2px;"></div>
        </td>
      </tr>

      <!-- Treść raportu -->
      <tr>
        <td style="padding:8px 28px 24px;">
          ${bodyHtml}
        </td>
      </tr>

      <!-- CTA: Otwórz w aplikacji -->
      <tr>
        <td style="padding:24px 28px 32px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>
              <td style="background:linear-gradient(135deg,#e8561e 0%,#FF6B2C 100%);border-radius:10px;box-shadow:0 4px 14px rgba(232,86,30,0.3);">
                <a href="${openInAppUrl}" target="_blank"
                   style="display:inline-block;padding:14px 28px;font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff;text-decoration:none;">
                  Otwórz w aplikacji →
                </a>
              </td>
            </tr>
          </table>
          <div style="margin-top:14px;font-size:11px;color:#888;font-family:'Helvetica Neue',Arial,sans-serif;">
            Możesz też zostawić feedback dla trenera w aplikacji
          </div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:24px 28px;background:#f9f8f5;border-top:1px solid #eaeaea;text-align:center;">
          <div style="display:inline-block;">
            <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.1em;color:#0c0c10;line-height:1;">BIEGAMY</div>
            <div style="font-size:9px;color:#888;font-family:'Courier New',monospace;letter-spacing:0.18em;text-transform:uppercase;margin-top:4px;">biegamy.run</div>
          </div>
          <div style="margin-top:18px;font-size:10px;color:#aaa;font-family:'Helvetica Neue',Arial,sans-serif;letter-spacing:0.04em;line-height:1.6;">
            Dostajesz tę wiadomość, bo Twój trener wysłał Ci raport.<br>
            <a href="${appUrl}/zawodnik.html?section=profile" style="color:#888;text-decoration:underline;">Możesz wyłączyć emaile w preferencjach.</a>
          </div>
        </td>
      </tr>

    </table>

  </td></tr>
</table>

</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════════
// Plain text version (fallback dla klientów bez HTML)
// ════════════════════════════════════════════════════════════════════
function renderEmailText(opts: {
  athleteName: string;
  reportType: string;
  reportDate: string;
  periodLabel: string;
  rawMd: string;
  appUrl: string;
  reportId: string;
}): string {
  const openUrl = `${opts.appUrl}/raporty.html?report_id=${opts.reportId}`;
  // Wytnij PRIORITY linie z plain text
  const cleanMd = opts.rawMd
    .replace(/^\s*PRIORITY:\s*\w+\s*$/gmi, '')
    .replace(/^(\s*#{1,4}\s+)TL\s*;?\s*DR\s*:?\s*$/gmi, '$1Wstęp')
    .trim();

  return `BIEGAMY — Raport ${opts.reportType}
${opts.athleteName} · ${opts.periodLabel}
${opts.reportDate}

═══════════════════════════════════════════

${cleanMd}

═══════════════════════════════════════════

Otwórz w aplikacji: ${openUrl}

—
BIEGAMY · biegamy.run
Możesz wyłączyć emaile w preferencjach: ${opts.appUrl}/zawodnik.html?section=profile`;
}

// ════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;   // rotacja: nowy sb_secret priorytet, legacy fallback
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") || "https://biegamy.run";
    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "BiegaMy <noreply@biegamy.run>";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);   // default OK dla legacy i sb_secret; NIE dodawać Authorization:'' — łamie legacy (42501)

    // 🔒 AUTH GUARD (audyt 2026-07-02, F4): JWT wymagany PRZED danymi — blokada unauth (leak email + spam mailer)
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(jwt);
    if (callerErr || !caller) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { report_id } = body;

    if (!report_id) {
      return new Response(
        JSON.stringify({ error: "report_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Pobierz raport + zawodnika ────────────────────────────────
    const { data: report, error: repErr } = await supabase
      .from("ai_reports")
      .select(`
        id, athlete_id, report_type, period_start, period_end,
        content_markdown, content_markdown_edited, summary,
        sent_at, generated_at,
        athletes (id, full_name, email_reports_enabled, coach_id, user_id)
      `)
      .eq("id", report_id)
      .maybeSingle();

    if (repErr || !report) {
      return new Response(
        JSON.stringify({ error: "Report not found", details: repErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const athlete = (report as any).athletes;
    if (!athlete) {
      return new Response(
        JSON.stringify({ error: "Athlete not found for this report" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🔒 AUTH GUARD cd. (audyt 2026-07-02, F4): woła trener TEGO zawodnika albo sam zawodnik (anti-IDOR)
    if (athlete.coach_id !== caller.id && athlete.user_id !== caller.id) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Sprawdź opt-out ────────────────────────────────────────────
    if (athlete.email_reports_enabled === false) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "email_disabled_by_athlete", athlete_id: athlete.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Pobierz email zawodnika z auth.users ──────────────────────
    // (athletes.email może nie istnieć — id mapuje na auth.users.id)
    const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(athlete.id);

    if (authErr || !authUser?.user?.email) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Could not fetch athlete email",
          details: authErr?.message
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipientEmail = authUser.user.email;

    // ── Renderuj treść ────────────────────────────────────────────
    const reportType = report.report_type === 'daily' ? 'Dzienny'
                     : report.report_type === 'weekly' ? 'Tygodniowy'
                     : report.report_type === 'monthly' ? 'Miesięczny'
                     : 'Raport';

    const reportDate = new Date(report.sent_at || report.generated_at).toLocaleDateString('pl-PL', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    const periodLabel = (report.period_start && report.period_end)
      ? new Date(report.period_start).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })
        + ' – '
        + new Date(report.period_end).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })
      : reportDate;

    // Preferuj edytowaną wersję trenera
    const finalMd = report.content_markdown_edited || report.content_markdown || '';

    if (!finalMd.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "Report has no content to email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const heroUrl = heroImageForReport(report.id, SUPABASE_URL);
    const bodyHtml = mdToEmailHtml(finalMd);

    const html = renderEmailHtml({
      athleteName: athlete.full_name || 'Zawodnik',
      reportType,
      reportDate,
      periodLabel,
      bodyHtml,
      heroUrl,
      appUrl: PUBLIC_APP_URL,
      reportId: report.id,
    });

    const text = renderEmailText({
      athleteName: athlete.full_name || 'Zawodnik',
      reportType,
      reportDate,
      periodLabel,
      rawMd: finalMd,
      appUrl: PUBLIC_APP_URL,
      reportId: report.id,
    });

    const subject = `Raport ${reportType.toLowerCase()} od trenera · ${reportDate}`;

    // 🔒 CONFIG GUARD (F4 reorder 2026-07-02): RESEND-check DOPIERO TU — ZA ownership(403) z ~linii 310.
    //    Authz bezwarunkowe/niezależne od configu: cudzy raport dostaje 403 zanim tu dojdzie,
    //    więc RESEND-off NIE maskuje już 403 (naprawa maskowania guardu przez 500 config-checku).
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Wyślij przez Resend ───────────────────────────────────────
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipientEmail],
        subject,
        html,
        text,
      }),
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      console.error("Resend API error:", resendResp.status, errText);

      // Zapisz błąd w bazie (audit)
      await supabase
        .from("ai_reports")
        .update({ email_send_error: `Resend ${resendResp.status}: ${errText.substring(0, 500)}` })
        .eq("id", report_id);

      return new Response(
        JSON.stringify({
          ok: false,
          error: "Resend API failed",
          status: resendResp.status,
          details: errText.substring(0, 500),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendData = await resendResp.json();
    const sentAt = new Date().toISOString();

    // Zapisz audit
    await supabase
      .from("ai_reports")
      .update({
        email_sent_at: sentAt,
        email_send_error: null,
      })
      .eq("id", report_id);

    return new Response(
      JSON.stringify({
        ok: true,
        email_sent_at: sentAt,
        recipient: recipientEmail,
        resend_id: resendData.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-report-email error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});