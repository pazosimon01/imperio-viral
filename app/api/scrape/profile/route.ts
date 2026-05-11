import { NextRequest, NextResponse } from "next/server";
import { extractUsername } from "@/lib/apify";
import { scrapeProfile } from "@/lib/scrape-actions";
import { createJob, finishJob, updateJobMessage } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      users?: string[];
      limit?: number;
    };
    const usersRaw = body.users ?? [];
    const usernames = Array.from(
      new Set(usersRaw.map((u) => extractUsername(u)).filter(Boolean))
    );
    const limit = Math.max(1, Math.min(2000, body.limit ?? 200));

    if (usernames.length === 0) {
      return NextResponse.json(
        { error: "Pasa al menos un username" },
        { status: 400 }
      );
    }

    const jobId = await createJob(
      "profile",
      { usernames, limit },
      `Scrape de ${usernames.length} perfil(es), ${limit} posts c/u`
    );

    // Lanzar en background. El proceso de Next dev mantiene la promesa viva.
    runJob(jobId, usernames, limit);

    return NextResponse.json({ jobId, usernames, limit });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}

async function runJob(jobId: string, usernames: string[], limit: number) {
  const summary: any[] = [];
  try {
    for (let i = 0; i < usernames.length; i++) {
      const u = usernames[i];
      await updateJobMessage(
        jobId,
        `[${i + 1}/${usernames.length}] @${u}…`
      );
      try {
        const r = await scrapeProfile(u, { limit });
        summary.push({
          username: r.username,
          received: r.itemsReceived,
          inserted: r.inserted,
          updated: r.updated,
          medianER: r.baseline.medianEngagementRate,
          tagged: r.baseline.taggedPosts,
          cutoff: r.cutoffReason,
        });
      } catch (e) {
        summary.push({
          username: u,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await finishJob(jobId, "done", {
      result: summary,
      message: `Listo — ${summary.length} perfil(es)`,
    });
  } catch (e) {
    await finishJob(jobId, "failed", {
      error: e instanceof Error ? e.message : String(e),
      result: summary,
    });
  }
}
