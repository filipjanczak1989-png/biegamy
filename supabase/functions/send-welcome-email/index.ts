import { Resend } from "npm:resend";

/* ⚠️ KLUCZ Z ENV, NIE Z ŹRÓDŁA — od 13.09.2026. Do tego dnia stał tu literał
   `re_…` wpisany 13.07.2026 (d331f48), w publicznym repo i w historii gita na
   zawsze — przepisania historii nie robimy (Pages, klony, rollback po SHA),
   więc jedyną drogą była ROTACJA klucza w panelu Resend. Ta sama nazwa
   sekretu co w send-report-email, żeby rotacja była jednym `secrets set`.
   Bramka-commit od 13.09 zna wzorzec `re_…` i blokuje go także w CI. */
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const resend = new Resend(RESEND_API_KEY || "");

Deno.serve(async (req) => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY nie jest ustawiony' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const { email } = await req.json();

  const data = await resend.emails.send({
    from: "BiegaMy <noreply@biegamy.run>",
    to: [email],
    subject: "Witamy w BiegaMy!",
    html: "<h1>Witaj!</h1><p>Dzięki za rejestrację 🔥</p>",
  });

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});