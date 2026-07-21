import { NextRequest, NextResponse } from "next/server";
import { createMultiJob } from "@/lib/multi-jobs";

export const runtime = "nodejs";
// El job corre en segundo plano dentro del proceso; el POST responde enseguida.
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usernames: string[] = Array.isArray(body.usernames)
      ? Array.from(
          new Set(
            body.usernames
              .map((u: unknown) => String(u).trim().toLowerCase())
              .filter(Boolean)
          )
        )
      : [];
    const n: number = Math.min(96, Math.max(6, Number(body.n ?? 48) || 48));

    if (usernames.length === 0) {
      return NextResponse.json({ error: "sin perfiles" }, { status: 400 });
    }

    const job = createMultiJob(usernames, n);
    return NextResponse.json({ jobId: job.id, total: job.total });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
