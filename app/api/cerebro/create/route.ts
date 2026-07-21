import { NextRequest, NextResponse } from "next/server";
import { query, getWorkspaceId } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  generateContent,
  refineContent,
  type ContentKind,
  type CreateBrief,
} from "@/lib/cerebro";

export const runtime = "nodejs";
export const maxDuration = 120;

const KINDS: ContentKind[] = ["carrusel", "historias", "guion"];

export async function GET() {
  const wsId = getWorkspaceId();
  const rows = await query<{
    id: string;
    kind: string;
    brief: unknown;
    result: unknown;
    created_at: string;
  }>(
    `SELECT id, kind, brief, result, created_at
     FROM generated_content WHERE workspace_id = $1
     ORDER BY created_at DESC LIMIT 10`,
    [wsId]
  );
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<CreateBrief> & {
      sourcePostId?: string | null;
      previous?: unknown; // pieza actual a refinar
      feedback?: string; // qué cambiar
    };
    if (!body.kind || !KINDS.includes(body.kind)) {
      return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    }
    if (!body.negocio?.trim() || !body.fuente?.trim()) {
      return NextResponse.json(
        { error: "Faltan el contexto del negocio y el material de partida." },
        { status: 400 }
      );
    }
    const brief: CreateBrief = {
      kind: body.kind,
      negocio: body.negocio.trim(),
      fuente: body.fuente.trim(),
      creencia: body.creencia ?? null,
      instrucciones: body.instrucciones?.trim() || null,
    };

    // Modo REFINAR: hay pieza previa + pedido de cambios → no empieza de cero.
    const isRefine = body.previous != null && !!body.feedback?.trim();
    const { result, model } = isRefine
      ? await refineContent({
          kind: brief.kind,
          negocio: brief.negocio,
          fuente: brief.fuente,
          previous: body.previous,
          feedback: body.feedback!.trim(),
        })
      : await generateContent(brief);

    const wsId = getWorkspaceId();
    const user = await getSessionUser();
    const rows = await query<{ id: string }>(
      `INSERT INTO generated_content (workspace_id, user_id, kind, source_post_id, brief, result, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [wsId, user?.id ?? null, brief.kind, body.sourcePostId ?? null, brief, result, model]
    );

    return NextResponse.json({ ok: true, id: rows[0].id, kind: brief.kind, result });
  } catch (e) {
    console.error("[cerebro/create]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
