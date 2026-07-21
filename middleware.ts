// Muro de autenticación. Corre en Edge: verifica la firma HMAC de la cookie de
// sesión (sin tocar la DB) y redirige a /login si falta o es inválida.
//
// NOTA: usamos crypto.subtle.sign + comparación de strings en vez de
// crypto.subtle.verify — en el sandbox Edge de Next, verify falla con
// TypedArrays de otro realm (bug conocido); sign no.

import { NextRequest, NextResponse } from "next/server";

const COOKIE = "imperio_session";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/api/auth/",
  "/_next/",
  "/icon",
  "/apple-icon",
  "/favicon",
  "/manifest.webmanifest",
];

async function hmacB64url(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  );
  let bin = "";
  for (const byte of mac) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(token: string, secret: string): Promise<boolean> {
  const [p, sig] = token.split(".");
  if (!p || !sig) return false;
  try {
    const expected = await hmacB64url(secret, p);
    if (!safeEqual(sig, expected)) return false;
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const payload = JSON.parse(json);
    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.next(); // sin secret configurado, no bloquear

  const token = req.cookies.get(COOKIE)?.value;
  if (token && (await verify(token, secret))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Todo menos archivos estáticos con extensión (png, js, css...).
  matcher: ["/((?!_next/static|_next/image|.*\\.\\w+$).*)"],
};
