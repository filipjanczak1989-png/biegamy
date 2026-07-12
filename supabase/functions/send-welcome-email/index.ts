import { Resend } from "npm:resend";

const resend = new Resend("re_MrpyBPXP_Ldvw7WTWqZXPWdrmzE6Fu52U");

Deno.serve(async (req) => {
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