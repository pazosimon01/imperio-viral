import { NextRequest, NextResponse } from "next/server";
import { getPostById } from "@/lib/queries";
import { getAdaptation } from "@/lib/adaptation";
import { pushIdeaToNotion } from "@/lib/notion";

export const runtime = "nodejs";

// Deriva un título corto para la columna "Idea de Contenido" a partir del caption.
// Toma la primera línea con texto, limpia hashtags/menciones sueltas y recorta.
function deriveIdea(caption: string | null, shortCode: string | null): string {
  const firstLine = (caption ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return shortCode ? `Reel ${shortCode}` : "Idea sin título";
  const cleaned = firstLine
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = cleaned.length > 0 ? cleaned : firstLine;
  return base.length > 120 ? `${base.slice(0, 117)}…` : base;
}

// Fecha de hoy en YYYY-MM-DD (zona horaria del server).
function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      postId?: string;
      tipo?: string | null;
      includeGuion?: boolean;
    };

    if (!body.postId || typeof body.postId !== "string") {
      return NextResponse.json({ error: "postId requerido" }, { status: 400 });
    }

    const post = await getPostById(body.postId);
    if (!post) {
      return NextResponse.json({ error: "post no encontrado" }, { status: 404 });
    }

    // Guión: solo si existe una adaptación y el usuario lo pidió.
    let guion: string | null = null;
    if (body.includeGuion) {
      const adaptation = await getAdaptation(post.id);
      guion = adaptation?.result.adaptedScript ?? null;
    }

    const result = await pushIdeaToNotion({
      idea: deriveIdea(post.caption, post.shortCode ?? null),
      engagementRate: post.engagementRate,
      tipo: body.tipo?.trim() || null,
      fechaISO: todayISO(),
      guion,
      comentarios: post.decisionNotes,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      url: result.url,
      duplicated: result.duplicated ?? false,
    });
  } catch (e) {
    console.error("[notion/push]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
