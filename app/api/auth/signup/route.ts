import { NextRequest, NextResponse } from "next/server";
import { createUser, signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
      invite?: string;
    };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    if (!/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        { status: 400 }
      );
    }
    const invite = (process.env.INVITE_CODE ?? "").trim();
    if (invite && body.invite?.trim() !== invite) {
      return NextResponse.json(
        { error: "Código de invitación incorrecto." },
        { status: 403 }
      );
    }

    const user = await createUser({
      email,
      password,
      displayName: body.name?.trim() || null,
    });
    const res = NextResponse.json({ ok: true, user: { email: user.email } });
    res.cookies.set(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 400 }
    );
  }
}
