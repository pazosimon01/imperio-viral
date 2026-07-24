import { NextRequest, NextResponse } from "next/server";
import { getMultiJobSnapshot } from "@/lib/multi-jobs";
import { getActiveBrand } from "@/lib/brands";
import { createPescaJob } from "@/lib/pescar-profundo";

export const runtime = "nodejs";

// PESCAR IDEAS (profundo): arranca el job que filtra por caption y luego VE
// los videos candidatos (transcripción + frames) contra la memoria de la
// marca activa. Devuelve pescaId; el cliente pollea /api/pescar/[id].
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
            "Ese análisis ya no está disponible. Vuelve a lanzar el Radar y pesca apenas termine (los videos caducan).",
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

    const job = createPescaJob(brand, snap.posts);
    return NextResponse.json({ ok: true, pescaId: job.id, marca: brand.nombre });
  } catch (e) {
    console.error("[pescar]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
