import { NextRequest, NextResponse } from "next/server";
import { query, getWorkspaceId } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateStrategy } from "@/lib/cerebro";
import type { BusinessBrief } from "@/lib/cerebro-method";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const wsId = getWorkspaceId();
  const rows = await query<{
    id: string;
    business: BusinessBrief;
    result: unknown;
    created_at: string;
  }>(
    `SELECT id, business, result, created_at
     FROM strategies WHERE workspace_id = $1
     ORDER BY created_at DESC LIMIT 10`,
    [wsId]
  );
  return NextResponse.json({ strategies: rows });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BusinessBrief>;
    for (const f of ["nombre", "sector", "oferta", "clienteIdeal", "objetivo"] as const) {
      if (!body[f]?.trim()) {
        return NextResponse.json({ error: `Falta el campo: ${f}` }, { status: 400 });
      }
    }
    const brief: BusinessBrief = {
      nombre: body.nombre!.trim(),
      sector: body.sector!.trim(),
      oferta: body.oferta!.trim(),
      clienteIdeal: body.clienteIdeal!.trim(),
      objetivo: body.objetivo!.trim(),
      notas: body.notas?.trim() || null,
    };

    const { result, model } = await generateStrategy(brief);

    const wsId = getWorkspaceId();
    const user = await getSessionUser();
    const rows = await query<{ id: string }>(
      `INSERT INTO strategies (workspace_id, user_id, business, result, model)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [wsId, user?.id ?? null, brief, result, model]
    );

    return NextResponse.json({ ok: true, id: rows[0].id, result });
  } catch (e) {
    console.error("[cerebro/strategy]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
