const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-gen-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const provided = (req.headers.get("x-gen-secret") || "").trim();
  const expected = (Deno.env.get("GEN_SECRET") || "").trim();
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({
      error: "Unauthorized",
      _debug: { hasEnv: !!expected, envLen: expected.length, gotLen: provided.length }
    }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return new Response(JSON.stringify({ error: "OPENAI_API_KEY not set" }),
    { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  if (!body.prompt) return new Response(JSON.stringify({ error: "prompt required" }),
    { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: body.prompt,
      size: body.size || "1024x1024",
      quality: body.quality || "medium",
      background: body.background || "transparent",
      output_format: body.output_format || "png",
      n: 1,
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return new Response(JSON.stringify({ error: "openai_error", detail }),
      { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const data = await r.json();
  return new Response(JSON.stringify({ b64: data?.data?.[0]?.b64_json }),
    { headers: { ...cors, "Content-Type": "application/json" } });
});