import { NextRequest, NextResponse } from "next/server";
import { query, getWorkspaceId } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
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
    };

    // Fase 2: el usuario confirma → generamos la estrategia con el resumen.
    if (body.finalize && body.resumen) {
      const { result, model } = await generateStrategyFromSummary(body.resumen);
      const wsId = getWorkspaceId();
      const user = await getSessionUser();
      const rows = await query<{ id: string }>(
        `INSERT INTO strategies (workspace_id, user_id, business, result, model)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [wsId, user?.id ?? null, { resumen: body.resumen }, result, model]
      );
      return NextResponse.json({ ok: true, strategy: { id: rows[0].id, result } });
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
