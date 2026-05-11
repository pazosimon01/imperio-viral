import { NextRequest, NextResponse } from "next/server";
import { enrichProfiles, getEnrichmentCandidates } from "@/lib/enrichment";
import { createJob, finishJob, updateJobMessage } from "@/lib/jobs";
import type { HeatLevel } from "@/lib/queries";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { minHeat?: HeatLevel };
    const minHeat = body.minHeat ?? "caliente";

    const candidates = await getEnrichmentCandidates(minHeat);
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "No hay autores nuevos para enriquecer" },
        { status: 400 }
      );
    }

    const usernames = candidates.map((c) => c.username);
    const jobId = await createJob(
      "enrich",
      { usernames, minHeat },
      `Enriqueciendo followers de ${usernames.length} autor(es) — calor ${minHeat}+`
    );

    runJob(jobId, usernames);

    return NextResponse.json({ jobId, count: usernames.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}

async function runJob(jobId: string, usernames: string[]) {
  try {
    await updateJobMessage(jobId, `Scrapeando details de ${usernames.length} perfil(es)…`);
    const r = await enrichProfiles(usernames);
    const total = usernames.length;
    const summary = [
      `${r.enriched}/${total} enriquecidos`,
      r.stubbed > 0
        ? `${r.stubbed} privados/inaccesibles (no se reintentarán)`
        : null,
      `${r.affectedPosts} posts recalculados`,
    ]
      .filter(Boolean)
      .join(" · ");
    await finishJob(jobId, "done", {
      result: r,
      message: summary,
    });
  } catch (e) {
    await finishJob(jobId, "failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
