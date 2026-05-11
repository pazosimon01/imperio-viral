import { NextRequest, NextResponse } from "next/server";
import { getPostById } from "@/lib/queries";
import { runPostScrape } from "@/lib/apify";
import { normalize, upsertPosts } from "@/lib/persist";

export const runtime = "nodejs";
export const maxDuration = 120;

// Re-scrapea un post puntual cuando sus URLs del CDN caducaron. Apify
// devuelve el mismo item con URLs firmadas frescas y upsertPosts actualiza
// el row existente.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await getPostById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Post no encontrado" },
        { status: 404 },
      );
    }

    const { items, runId } = await runPostScrape(existing.url);
    if (items.length === 0) {
      return NextResponse.json(
        {
          error:
            "Apify no devolvió data. El post puede haber sido eliminado o estar en una cuenta privada.",
        },
        { status: 502 },
      );
    }

    const scrapedAt = Math.floor(Date.now() / 1000);
    const normalized = items.map((it) =>
      normalize(it, scrapedAt, {
        sourceHashtag: existing.sourceHashtag,
        sourceProfile: existing.sourceProfile,
      }),
    );
    const result = await upsertPosts(normalized);

    return NextResponse.json({ ok: true, runId, ...result });
  } catch (e) {
    console.error("refresh post error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error inesperado" },
      { status: 500 },
    );
  }
}
