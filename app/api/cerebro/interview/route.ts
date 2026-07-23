import { NextRequest, NextResponse } from "next/server";
import { query, getWorkspaceId } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createBrand } from "@/lib/brands";
import {
  interviewStep,
  generateStrategyFromSummary,
  type InterviewTurn,
} from "@/lib/cerebro";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      turns?: InterviewTurn[];
      finalize?: boolean;
      resumen?: string;
      nombre?: string;
    };

    // Fase 2: el usuario confirma → se CREA LA MARCA (memoria del negocio),
    // se genera su estrategia y queda ligada a la marca. La marca queda activa.
    if (body.finalize && body.resumen) {
      const user = await getSessionUser();
      const brand = await createBrand({
        nombre: body.nombre?.trim() || body.resumen.split("\n")[0]?.slice(0, 60) || "Mi marca",
        resumen: body.resumen,
        userId: user?.id ?? null,
      });

      const { result, model } = await generateStrategyFromSummary(body.resumen);
      const wsId = getWorkspaceId();
      const rows = await query<{ id: string }>(
        `INSERT INTO strategies (workspace_id, user_id, brand_id, business, result, model)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [wsId, user?.id ?? null, brand.id, { resumen: body.resumen, nombre: brand.nombre }, result, model]
      );

      const res = NextResponse.json({
        ok: true,
        brand: { id: brand.id, nombre: brand.nombre },
        strategy: { id: rows[0].id, result },
      });
      // Dejar esta marca como la activa de una vez.
      res.cookies.set("active_brand", brand.id, {
        httpOnly: false, sameSite: "lax", path: "/", maxAge: 365 * 86400,
      });
      return res;
    }

    // Fase 1: siguiente paso de la entrevista.
    const turns = Array.isArray(body.turns) ? body.turns : [];
    const step = await interviewStep(turns);
    return NextResponse.json({ ok: true, step });
  } catch (e) {
    console.error("[cerebro/interview]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
