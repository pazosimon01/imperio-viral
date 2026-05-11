// Transcripción de audio de reels usando la API de audio de OpenAI.
// Modelo por defecto: gpt-4o-transcribe (WER 4.1% — mejor que whisper-1 al
// mismo precio). Acepta mp4 directamente, no requiere extraer audio.
// Límite de 25 MB por archivo (suficiente para reels normales).

import { query, queryOne, getWorkspaceId } from "./db";
import type { StoredTranscription } from "./types";

const OPENAI_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MODEL = "gpt-4o-transcribe";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const AI_GLOSSARY = [
  "Claude", "ChatGPT", "GPT-4", "GPT-5", "OpenAI", "Anthropic", "Gemini",
  "Sora", "Midjourney", "Runway", "ElevenLabs", "Stable Diffusion",
  "Hugging Face", "Copilot", "DALL-E", "Whisper", "Llama", "Mistral",
  "Perplexity", "Pika", "Suno",
  "n8n", "Make", "Zapier", "Notion", "Airtable",
  "prompt", "agente", "agentes", "LLM", "RAG", "embedding", "embeddings",
  "fine-tuning", "tokens", "inferencia", "modelo", "API", "workflow",
  "automatización",
];

function buildTranscriptionPrompt(opts: { hashtags: string[] | null }): string {
  const cleanHashtags = (opts.hashtags ?? [])
    .filter((h) => h.length >= 4 && h.length <= 30)
    .slice(0, 12);
  const hashtagBlock = cleanHashtags.length
    ? ` Hashtags relacionados: ${cleanHashtags.join(", ")}.`
    : "";
  return `Reel sobre inteligencia artificial y marketing digital. Vocabulario común: ${AI_GLOSSARY.join(", ")}.${hashtagBlock}`;
}

export class TranscriptionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export async function getTranscription(
  postId: string,
): Promise<StoredTranscription | null> {
  const wsId = getWorkspaceId();
  const row = await queryOne<{
    post_id: string;
    transcription: string;
    language: string | null;
    transcribed_at: number;
  }>(
    `SELECT post_id, transcription, language, transcribed_at
     FROM transcriptions
     WHERE workspace_id = $1 AND post_id = $2`,
    [wsId, postId],
  );
  if (!row) return null;
  return {
    postId: row.post_id,
    transcription: row.transcription,
    language: row.language,
    transcribedAt: row.transcribed_at,
  };
}

async function saveTranscription(
  postId: string,
  text: string,
  language: string | null,
): Promise<StoredTranscription> {
  const wsId = getWorkspaceId();
  const transcribedAt = Math.floor(Date.now() / 1000);
  await query(
    `INSERT INTO transcriptions (workspace_id, post_id, transcription, language, transcribed_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, post_id) DO UPDATE SET
       transcription  = EXCLUDED.transcription,
       language       = EXCLUDED.language,
       transcribed_at = EXCLUDED.transcribed_at`,
    [wsId, postId, text, language, transcribedAt],
  );
  return { postId, transcription: text, language, transcribedAt };
}

async function fetchVideoBlob(videoUrl: string): Promise<Blob> {
  const res = await fetch(videoUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  if (!res.ok) {
    throw new TranscriptionError(
      `No se pudo descargar el video (HTTP ${res.status}). La URL del CDN de Instagram probablemente caducó — re-scrapea el post para obtener una URL nueva.`,
      "video_download_failed",
    );
  }
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_SIZE) {
    throw new TranscriptionError(
      `Video supera el límite de 25 MB (${(contentLength / 1024 / 1024).toFixed(1)} MB). OpenAI no acepta archivos más grandes; sería necesario extraer el audio con ffmpeg primero.`,
      "file_too_large",
    );
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FILE_SIZE) {
    throw new TranscriptionError(
      `Video supera el límite de 25 MB (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB). OpenAI no acepta archivos más grandes; sería necesario extraer el audio con ffmpeg primero.`,
      "file_too_large",
    );
  }
  const contentType = res.headers.get("content-type") ?? "video/mp4";
  return new Blob([buf], { type: contentType });
}

async function callOpenAI(
  videoBlob: Blob,
  filename: string,
  language: string | null,
  vocabularyPrompt: string | null,
): Promise<{ text: string; language: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new TranscriptionError(
      "Falta OPENAI_API_KEY en .env. Crea una key en https://platform.openai.com/api-keys y agrega saldo a la cuenta.",
      "no_api_key",
    );
  }

  const form = new FormData();
  form.append("file", videoBlob, filename);
  form.append("model", DEFAULT_MODEL);
  if (language) form.append("language", language);
  if (vocabularyPrompt) form.append("prompt", vocabularyPrompt);

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    let userMessage = `OpenAI API error ${res.status}`;
    if (res.status === 401) {
      userMessage =
        "API key de OpenAI inválida o no tiene permisos. Verifica OPENAI_API_KEY en .env.";
    } else if (res.status === 429) {
      userMessage =
        "OpenAI rechazó por rate limit o saldo insuficiente. Verifica tu billing en platform.openai.com.";
    } else if (res.status === 413) {
      userMessage = "El archivo excede el límite de OpenAI (25 MB).";
    }
    throw new TranscriptionError(`${userMessage}  —  ${body}`, "openai_error");
  }
  const data = (await res.json()) as { text: string; language?: string };
  return { text: data.text, language: data.language ?? null };
}

export interface TranscribeOptions {
  postId: string;
  videoUrl: string;
  language?: string | null;
  hashtags?: string[] | null;
  force?: boolean;
}

export async function transcribePost(
  opts: TranscribeOptions,
): Promise<StoredTranscription> {
  if (!opts.force) {
    const existing = await getTranscription(opts.postId);
    if (existing) return existing;
  }

  const videoBlob = await fetchVideoBlob(opts.videoUrl);
  const vocabularyPrompt = buildTranscriptionPrompt({
    hashtags: opts.hashtags ?? null,
  });
  const result = await callOpenAI(
    videoBlob,
    `${opts.postId}.mp4`,
    opts.language ?? null,
    vocabularyPrompt,
  );

  const finalLang = result.language ?? opts.language ?? null;
  return saveTranscription(opts.postId, result.text, finalLang);
}

export async function updateTranscriptionText(
  postId: string,
  newText: string,
): Promise<StoredTranscription> {
  const wsId = getWorkspaceId();
  const existing = await getTranscription(postId);
  if (!existing) {
    throw new TranscriptionError(
      "No existe transcripción para este post. Transcríbelo primero.",
      "not_found",
    );
  }
  const trimmed = newText.trim();
  if (!trimmed) {
    throw new TranscriptionError(
      "La transcripción no puede quedar vacía.",
      "empty_text",
    );
  }
  const updated = await saveTranscription(postId, trimmed, existing.language);
  // Invalidar adaptación previa — el guión adaptado se basaba en el texto viejo.
  await query(
    `DELETE FROM adaptations WHERE workspace_id = $1 AND post_id = $2`,
    [wsId, postId],
  );
  return updated;
}
