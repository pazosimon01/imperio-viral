import { NextRequest, NextResponse } from "next/server";
import { authenticate, signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
    }
    const user = await authenticate(body.email, body.password);
    if (!user) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 }
      );
    }
    const res = NextResponse.json({ ok: true, user: { email: user.email } });
    res.cookies.set(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
