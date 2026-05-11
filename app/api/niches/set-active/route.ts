import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_NICHE_COOKIE } from "@/lib/niches";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { slug?: string };
  if (!body.slug || typeof body.slug !== "string") {
    return NextResponse.json({ error: "slug requerido" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, slug: body.slug });
  res.cookies.set({
    name: ACTIVE_NICHE_COOKIE,
    value: body.slug,
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 año
    sameSite: "lax",
  });
  return res;
}
