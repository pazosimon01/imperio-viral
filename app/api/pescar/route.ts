import { NextRequest, NextResponse } from "next/server";
import { getMultiJobSnapshot } from "@/lib/multi-jobs";
import { getActiveBrand } from "@/lib/brands";
import { pescarIdeas } from "@/lib/pescar";

export const runtime = "nodejs";
export const maxDuration = 300;

// PESCAR IDEAS: filtra con IA los posts de un análisis del Radar contra la
// memoria de la marca activa. Devuelve solo las ideas replicables, rankeadas.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { jobId?: string };
    if (!body.jobId) {
      return NextResponse.json({ error: "Falta jobId." }, { status: 400 });
    }
    const snap = getMultiJobSnapshot(body.jobId);
    if (!snap) {
      return NextResponse.json(
        {
          error:
            "Ese análisis ya no está en memoria (se reinició el servidor). Vuelve a lanzar el Radar.",
        },
        { status: 404 }
      );
    }
    if (snap.posts.length === 0) {
      return NextResponse.json(
        { error: "El análisis no tiene publicaciones todavía." },
        { status: 400 }
      );
    }

    const brand = await getActiveBrand();
    if (!brand) {
      return NextResponse.json(
        {
          error:
            "No hay ninguna marca creada. Ve a Estrategia (CEREBRO) y crea tu plan primero — con eso sé qué le sirve a tu cliente.",
        },
        { status: 400 }
      );
    }

    const result = await pescarIdeas(brand, snap.posts);
    return NextResponse.json({ ok: true, marca: brand.nombre, ...result });
  } catch (e) {
    console.error("[pescar]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
