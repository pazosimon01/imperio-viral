import { NextRequest, NextResponse } from "next/server";
import { setDecision } from "@/lib/queries";

// node:sqlite necesita el runtime Node, no Edge.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      postId?: string;
      decision?: "replicate" | "maybe" | "skip" | null;
      notes?: string | null;
    };

    if (!body.postId || typeof body.postId !== "string") {
      return NextResponse.json(
        { error: "postId requerido" },
        { status: 400 }
      );
    }
    if (
      body.decision != null &&
      !["replicate", "maybe", "skip"].includes(body.decision)
    ) {
      return NextResponse.json(
        { error: "decision inválida" },
        { status: 400 }
      );
    }

    await setDecision(body.postId, body.decision ?? null, body.notes);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
