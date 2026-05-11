import { NextRequest, NextResponse } from "next/server";
import { createNiche, listNiches } from "@/lib/niches";

export const runtime = "nodejs";

export async function GET() {
  try {
    const niches = await listNiches();
    return NextResponse.json({ niches });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; color?: string };
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name requerido" },
        { status: 400 },
      );
    }
    const niche = await createNiche({ name: body.name, color: body.color });
    return NextResponse.json({ niche });
  } catch (e) {
    // PG unique_violation → 23505. Mensaje amistoso.
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("duplicate key") ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "Ya existe un nicho con ese nombre" : msg },
      { status },
    );
  }
}
