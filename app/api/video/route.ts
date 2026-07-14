import { NextRequest } from "next/server";

// Proxy server-side para videos de Instagram. El navegador los bloquea al
// cargarlos directo desde el CDN de IG (Cross-Origin-Resource-Policy →
// ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). Al servirlos desde nuestro mismo
// origen el bloqueo desaparece. Soporta Range (206) para que <video> pueda
// hacer streaming/seek sin descargar todo el archivo. Solo hosts de IG/FB.

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

  const range = req.headers.get("range");

  try {
    const upstream = await fetch(target, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "*/*",
        ...(range ? { Range: range } : {}),
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(null, { status: upstream.status });
    }

    const headers = new Headers();
    headers.set(
      "content-type",
      upstream.headers.get("content-type") ?? "video/mp4"
    );
    headers.set("accept-ranges", "bytes");
    const cr = upstream.headers.get("content-range");
    if (cr) headers.set("content-range", cr);
    const cl = upstream.headers.get("content-length");
    if (cl) headers.set("content-length", cl);
    headers.set("cache-control", "public, max-age=86400");

    // Stream directo (sin bufferizar todo el video en memoria).
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (e) {
    console.error("video proxy error:", e);
    return new Response("Upstream error", { status: 502 });
  }
}
