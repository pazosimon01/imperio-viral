import { NextRequest, NextResponse } from "next/server";
import { createDiscoverJob } from "@/lib/ig-discover";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { seeds?: string[]; target?: number };
    const seeds = Array.isArray(body.seeds) ? body.seeds : [];
    if (seeds.length === 0) {
      return NextResponse.json({ error: "Pega al menos una cuenta de ejemplo." }, { status: 400 });
    }
    const job = createDiscoverJob(seeds, Number(body.target) || 100);
    return NextResponse.json({ jobId: job.id, target: job.target });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
