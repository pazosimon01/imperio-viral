import { NextRequest, NextResponse } from "next/server";
import { getPostById } from "@/lib/queries";
import {
  transcribePost,
  updateTranscriptionText,
  TranscriptionError,
} from "@/lib/transcription";

// node:sqlite + descargar el video del CDN de IG requiere runtime Node.
export const runtime = "nodejs";
// Reels suelen ser <60s; la API de OpenAI responde en pocos segundos.
// Damos margen amplio por si el video es de 3-4 MB y la red está lenta.
export const maxDuration = 120;

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

    if (post.type !== "Video") {
      return NextResponse.json(
        {
          error: `Solo se transcriben reels (tipo Video). Este post es ${post.type}.`,
        },
        { status: 400 },
      );
    }

    if (!post.videoUrl) {
      return NextResponse.json(
        { error: "El post no tiene videoUrl. Re-scrapea el post." },
        { status: 400 },
      );
    }

    const transcription = await transcribePost({
      postId,
      videoUrl: post.videoUrl,
      language: post.language ?? null,
      hashtags: post.hashtags ?? null,
      force,
    });

    return NextResponse.json({ ok: true, transcription });
  } catch (e) {
    if (e instanceof TranscriptionError) {
      // Errores con código semántico para que el cliente pueda diferenciar
      // (URL caducada, sin saldo, archivo grande, etc.).
      const status =
        e.code === "no_api_key"
          ? 500
          : e.code === "video_download_failed"
            ? 502
            : e.code === "file_too_large"
              ? 413
              : 502;
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status },
      );
    }
    console.error("transcribe error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error inesperado" },
      { status: 500 },
    );
  }
}

/**
 * Edición manual de la transcripción. Permite corregir errores que el modelo
 * no pudo evitar incluso con el glosario (palabras muy raras, nombres propios
 * fuera del nicho, mala calidad de audio, etc.). Invalida la adaptación
 * previa porque el guión adaptado dependía del texto anterior.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const { postId } = await params;
    const body = (await req.json()) as { text?: string };
    if (typeof body.text !== "string") {
      return NextResponse.json(
        { error: "Campo `text` requerido (string)" },
        { status: 400 },
      );
    }
    const transcription = await updateTranscriptionText(postId, body.text);
    return NextResponse.json({ ok: true, transcription });
  } catch (e) {
    if (e instanceof TranscriptionError) {
      const status =
        e.code === "not_found"
          ? 404
          : e.code === "empty_text"
            ? 400
            : 500;
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status },
      );
    }
    console.error("transcribe PATCH error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error inesperado" },
      { status: 500 },
    );
  }
}
