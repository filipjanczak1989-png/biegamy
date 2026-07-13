// Supabase Edge Function: gif-search
// Giphy proxy z autoryzacją JWT i CORS dla biegamy.run + GH Pages.

const ALLOWED_ORIGINS = new Set([
  "https://biegamy.run",
  "https://filipjanczak1989-png.github.io",
]);

function buildCors(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://biegamy.run";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}

Deno.serve(async (req: Request) => {
  const cors = buildCors(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, cors, {
      "Allow": "GET, OPTIONS",
    });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Unauthorized" }, 401, cors);
  }

  const apiKey = Deno.env.get("GIPHY_API_KEY");
  if (!apiKey) {
    return json({ error: "Server misconfigured: missing GIPHY_API_KEY" }, 500, cors);
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return json({ results: [] }, 200, cors);
  }
  if (q.length > 100) {
    return json({ error: "Query too long" }, 400, cors);
  }

  const limitRaw = parseInt(url.searchParams.get("limit") ?? "24", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 50)
    : 24;

  const giphyUrl = new URL("https://api.giphy.com/v1/gifs/search");
  giphyUrl.searchParams.set("api_key", apiKey);
  giphyUrl.searchParams.set("q", q);
  giphyUrl.searchParams.set("limit", String(limit));
  giphyUrl.searchParams.set("rating", "pg-13");
  giphyUrl.searchParams.set("lang", "pl");
  giphyUrl.searchParams.set("bundle", "messaging_non_clips");

  let giphyData: any;
  try {
    const upstream = await fetch(giphyUrl.toString(), {
      headers: { "Accept": "application/json" },
    });
    if (!upstream.ok) {
      return json(
        { error: "Giphy upstream error", status: upstream.status },
        502,
        cors,
      );
    }
    giphyData = await upstream.json();
  } catch (_err) {
    return json({ error: "Giphy fetch failed" }, 502, cors);
  }

  const results = (Array.isArray(giphyData?.data) ? giphyData.data : [])
    .map((gif: any) => {
      const fixed = gif?.images?.fixed_height;
      const preview = gif?.images?.fixed_height_small ??
        gif?.images?.preview_gif ??
        fixed;
      return {
        id: String(gif?.id ?? ""),
        url: fixed?.url ?? gif?.images?.original?.url ?? "",
        preview: preview?.url ?? "",
        alt: gif?.title || gif?.alt_text || "GIF",
      };
    })
    .filter((r: { id: string; url: string }) => r.id && r.url);

  return json({ results }, 200, cors, {
    "Cache-Control": "public, max-age=300",
  });
});