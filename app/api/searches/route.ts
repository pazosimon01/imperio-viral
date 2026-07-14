import { NextRequest, NextResponse } from "next/server";
import { listSearches, deleteSearch, recordSearch } from "@/lib/searches";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ searches: await listSearches() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, label, href } = body;
  if (!type || !label || !href) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }
  await recordSearch({ type, label, href });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await deleteSearch(id);
  return NextResponse.json({ ok: true });
}
