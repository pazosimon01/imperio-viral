import { NextRequest } from "next/server";

// Proxy server-side para imágenes de Instagram. Necesario porque el navegador
// las bloquea por la política de referer de IG, pero desde Node.js fetch
// pasa sin problema. Solo permitimos hostnames de IG/FB para evitar SSRF.

export const runtime = "nodejs";

const ALLOWED_HOSTS = /^(.*\.)?(cdninstagram\.com|fbcdn\.net)$/i;

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) return new Response("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!ALLOWED_HOSTS.test(parsed.hostname)) {
    return new Response(`Forbidden host: ${parsed.hostname}`, { status: 403 });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    if (!upstream.ok) {
      return new Response(null, { status: upstream.status });
    }
    return new Response(upstream.body, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
        "cache-control":
          "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    console.error("img proxy error:", e);
    return new Response("Upstream error", { status: 502 });
  }
}
