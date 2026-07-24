import { NextRequest, NextResponse } from "next/server";
import { getDiscoverSnapshot } from "@/lib/ig-discover";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snap = await getDiscoverSnapshot(id);
  if (!snap) return NextResponse.json({ error: "job no encontrado" }, { status: 404 });
  return NextResponse.json(snap);
}
