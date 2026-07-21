import { NextRequest, NextResponse } from "next/server";
import { getMultiJobSnapshot } from "@/lib/multi-jobs";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snap = getMultiJobSnapshot(id);
  if (!snap) {
    // El job expiró (TTL) o el servidor se reinició. El cliente debe reiniciar.
    return NextResponse.json({ error: "job no encontrado" }, { status: 404 });
  }
  return NextResponse.json(snap);
}
