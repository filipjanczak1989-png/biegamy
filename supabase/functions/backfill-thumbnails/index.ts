import { createClient } from "jsr:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

Deno.serve(async (req) => {
  const { paths } = await req.json().catch(() => ({ paths: [] }));
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const BUCKET = "training-screenshots";
  const results: any[] = [];
  for (const p of (paths || [])) {
    try {
      const m = String(p).match(/^([^/]+)\/(.+)\.[^.]+$/);
      if (!m) { results.push({ p, s: "skip-format" }); continue; }
      const thumbPath = `${m[1]}/thumbs/${m[2]}.jpg`;
      const { data: blob, error: dl } = await sb.storage.from(BUCKET).download(p);
      if (dl || !blob) { results.push({ p, s: "dl-fail" }); continue; }
      const img = await Image.decode(new Uint8Array(await blob.arrayBuffer()));
      const scale = Math.min(600 / img.width, 600 / img.height, 1);
      const t = scale < 1 ? img.resize(Math.round(img.width * scale), Math.round(img.height * scale)) : img;
      const jpeg = await t.encodeJPEG(80);
      const { error: up } = await sb.storage.from(BUCKET).upload(thumbPath, jpeg, { contentType: "image/jpeg", upsert: true });
      results.push({ p, s: up ? "up-fail:" + up.message : "ok" });
    } catch (e) {
      results.push({ p, s: "err:" + (e?.message || e) });
    }
  }
  return new Response(JSON.stringify({ count: results.length, ok: results.filter((r) => r.s === "ok").length, results }),
    { headers: { "Content-Type": "application/json" } });
});