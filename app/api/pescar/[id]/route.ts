import { NextRequest, NextResponse } from "next/server";
import { getPescaSnapshot } from "@/lib/pescar-profundo";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snap = await getPescaSnapshot(id);
  if (!snap) {
    return NextResponse.json({ error: "pesca no encontrada" }, { status: 404 });
  }
  return NextResponse.json(snap);
}
