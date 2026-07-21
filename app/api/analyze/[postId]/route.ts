import { NextRequest, NextResponse } from "next/server";
import { getPostById } from "@/lib/queries";
import { getTranscription, transcribePost } from "@/lib/transcription";
import {
  analyzeVideo,
  getVideoAnalysis,
  VideoAnalysisError,
} from "@/lib/video-analysis";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const existing = await getVideoAnalysis(postId);
  if (!existing) return NextResponse.json({ exists: false });
  return NextResponse.json({ exists: true, analysis: existing });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params;
    const post = await getPostById(postId);
    if (!post) {
      return NextResponse.json({ error: "post no encontrado" }, { status: 404 });
    }
    if (post.type !== "Video" || !post.videoUrl) {
      return NextResponse.json(
        { error: "Este post no es un video con enlace disponible." },
        { status: 400 }
      );
    }

    // 1) Transcripción: usa la existente; si no hay, intenta transcribir
    //    automáticamente (si hay OPENAI_API_KEY). Si falla, seguimos solo visual.
    let transcription = await getTranscription(postId);
    if (!transcription && process.env.OPENAI_API_KEY) {
      try {
        transcription = await transcribePost({
          postId,
          videoUrl: post.videoUrl,
          language: post.language,
          hashtags: post.hashtags,
        });
      } catch {
        transcription = null; // sin audio no se frena: análisis solo visual
      }
    }

    // 2) Análisis visual frame por frame + traducción.
    const analysis = await analyzeVideo({
      postId,
      videoUrl: post.videoUrl,
      transcription: transcription?.transcription ?? null,
      transcriptionLang: transcription?.language ?? null,
      caption: post.caption,
    });

    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    const status = e instanceof VideoAnalysisError && e.code === "expired_url" ? 410 : 500;
    console.error("[analyze]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status }
    );
  }
}
