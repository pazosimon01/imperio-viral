import { NextRequest, NextResponse } from "next/server";
import { getBrand } from "@/lib/brands";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { brandId } = (await req.json()) as { brandId?: string };
  if (!brandId) {
    return NextResponse.json({ error: "brandId requerido" }, { status: 400 });
  }
  const brand = await getBrand(brandId);
  if (!brand) {
    return NextResponse.json({ error: "marca no encontrada" }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("active_brand", brandId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86400,
  });
  return res;
}
