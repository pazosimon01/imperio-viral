import { NextRequest, NextResponse } from "next/server";
import { getPostById } from "@/lib/queries";
import { getTranscription } from "@/lib/transcription";
import { adaptPost, AdaptationError } from "@/lib/adaptation";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params;
    const force = req.nextUrl.searchParams.get("force") === "true";

    const post = await getPostById(postId);
    if (!post) {
      return NextResponse.json(
        { error: "Post no encontrado" },
        { status: 404 },
      );
    }

    const transcription = await getTranscription(postId);
    if (!transcription) {
      return NextResponse.json(
        {
          error:
            "El post no tiene transcripción. Transcribe el reel primero.",
        },
        { status: 400 },
      );
    }

    const adaptation = await adaptPost({
      postId,
      transcription: transcription.transcription,
      sourceLang: transcription.language,
      caption: post.caption ?? null,
      force,
    });

    return NextResponse.json({ ok: true, adaptation });
  } catch (e) {
    if (e instanceof AdaptationError) {
      const status =
        e.code === "no_api_key"
          ? 500
          : e.code === "invalid_response"
            ? 502
            : 502;
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status },
      );
    }
    console.error("adapt error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error inesperado" },
      { status: 500 },
    );
  }
}
