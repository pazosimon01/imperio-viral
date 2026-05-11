import { NextRequest, NextResponse } from "next/server";
import type { ResultsType } from "@/lib/apify";
import { scrapeHashtag } from "@/lib/scrape-actions";
import { createJob, finishJob, updateJobMessage } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      hashtag?: string;
      limit?: number;
      type?: "posts" | "reels" | "both";
    };
    const hashtag = (body.hashtag ?? "").trim().replace(/^#+/, "");
    const limit = Math.max(1, Math.min(500, body.limit ?? 50));
    const typeArg = body.type ?? "both";

    if (!hashtag) {
      return NextResponse.json(
        { error: "Falta hashtag" },
        { status: 400 }
      );
    }

    const types: ResultsType[] =
      typeArg === "both" ? ["posts", "reels"] : [typeArg];

    const jobId = await createJob(
      "hashtag",
      { hashtag, limit, types },
      `Buscar #${hashtag} (${types.join("+")}, ${limit} c/u)`
    );

    runJob(jobId, hashtag, types, limit);

    return NextResponse.json({ jobId, hashtag, limit, types });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}

async function runJob(
  jobId: string,
  hashtag: string,
  types: ResultsType[],
  limit: number
) {
  const summary: any[] = [];
  try {
    for (let i = 0; i < types.length; i++) {
      const t = types[i];
      await updateJobMessage(
        jobId,
        `[${i + 1}/${types.length}] #${hashtag} (${t})…`
      );
      try {
        const r = await scrapeHashtag(hashtag, t, limit);
        summary.push({
          type: t,
          received: r.itemsReceived,
          inserted: r.inserted,
          updated: r.updated,
        });
      } catch (e) {
        summary.push({
          type: t,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await finishJob(jobId, "done", {
      result: summary,
      message: `Listo — #${hashtag}`,
    });
  } catch (e) {
    await finishJob(jobId, "failed", {
      error: e instanceof Error ? e.message : String(e),
      result: summary,
    });
  }
}
