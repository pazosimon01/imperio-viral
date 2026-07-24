// Análisis visual de video, frame por frame, con Claude visión.
// Pipeline: descargar el MP4 (la URL de IG debe estar viva) → extraer ~10
// fotogramas equiespaciados con ffmpeg → mandarlos a Claude junto a la
// transcripción y el caption → resumen exacto escena a escena + traducción.
// Persistencia en video_analyses (1 por post/workspace).

import { spawn } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { query, queryOne, getWorkspaceId } from "./db";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";
const MAX_FRAMES = 10;
const FRAME_WIDTH = 640;

export class VideoAnalysisError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "VideoAnalysisError";
  }
}

export interface VideoAnalysisResult {
  resumenExacto: string;
  escenas: Array<{
    segundo: number;
    queSeVe: string;
    textoEnPantalla: string;
  }>;
  estiloVisual: string;
  hookVisual: string;
  porQueFunciona: string;
  formulaReplicable: string;
  transcripcionEspanol: string;
  idiomaOriginal: string;
}

export interface StoredVideoAnalysis {
  postId: string;
  result: VideoAnalysisResult;
  model: string;
  framesCount: number;
  analyzedAt: string;
}

function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = "";
    const t = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} timeout`));
    }, timeoutMs);
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(t);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exit ${code}: ${err.slice(-300)}`));
    });
  });
}

function runOut(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => resolve(out.trim()));
  });
}

export async function downloadVideo(url: string, dest: string): Promise<void> {
  await run("curl", [
    "-s",
    "-L",
    "--max-time",
    "90",
    "--fail",
    "-o",
    dest,
    url,
  ]).catch(() => {
    throw new VideoAnalysisError(
      "No se pudo descargar el video. El enlace de Instagram probablemente caducó — vuelve a analizar el perfil en el Radar para refrescarlo.",
      "expired_url"
    );
  });
}

export async function extractFrames(
  videoPath: string,
  dir: string
): Promise<{ frames: string[]; duration: number }> {
  const durStr = await runOut("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    videoPath,
  ]);
  const duration = Math.max(1, parseFloat(durStr) || 1);
  const n = Math.min(MAX_FRAMES, Math.max(4, Math.ceil(duration / 3)));
  const fps = n / duration;
  await run("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-vf", `fps=${fps.toFixed(4)},scale=${FRAME_WIDTH}:-2`,
    "-q:v", "5",
    path.join(dir, "frame-%02d.jpg"),
  ]);
  const frames: string[] = [];
  for (let i = 1; i <= n + 1; i++) {
    const f = path.join(dir, `frame-${String(i).padStart(2, "0")}.jpg`);
    try {
      await readFile(f);
      frames.push(f);
    } catch {
      break;
    }
  }
  if (frames.length === 0) {
    throw new VideoAnalysisError("ffmpeg no extrajo fotogramas.", "ffmpeg");
  }
  return { frames, duration };
}

const ANALYSIS_TOOL = {
  name: "submit_video_analysis",
  description: "Entrega el análisis visual completo del video.",
  input_schema: {
    type: "object",
    properties: {
      resumenExacto: {
        type: "string",
        description:
          "Resumen fiel y detallado de TODO lo que pasa en el video (qué se ve + qué se dice), en 4-8 frases. Sin inventar nada que no esté en los fotogramas o la transcripción.",
      },
      escenas: {
        type: "array",
        description: "Una entrada por fotograma/escena, en orden.",
        items: {
          type: "object",
          properties: {
            segundo: { type: "number", description: "Segundo aproximado del video." },
            queSeVe: { type: "string", description: "Descripción visual concreta de la escena." },
            textoEnPantalla: { type: "string", description: "Texto sobreimpreso visible, o '' si no hay." },
          },
          required: ["segundo", "queSeVe", "textoEnPantalla"],
        },
      },
      estiloVisual: {
        type: "string",
        description: "Estilo de grabación y edición: cámara, cortes, b-roll, subtítulos, iluminación, locación.",
      },
      hookVisual: {
        type: "string",
        description: "Qué muestra el primer fotograma/segundos y por qué detiene el scroll.",
      },
      porQueFunciona: {
        type: "string",
        description: "Análisis de por qué este video funciona (combinando lo visual y lo dicho).",
      },
      formulaReplicable: {
        type: "string",
        description: "Fórmula paso a paso para replicar este video con otro tema/negocio, con [PLACEHOLDERS].",
      },
      transcripcionEspanol: {
        type: "string",
        description: "La transcripción en español (traducida si el original está en otro idioma; igual si ya está en español). '' si no hay transcripción.",
      },
      idiomaOriginal: { type: "string", description: "Código del idioma original detectado (es, en, pt...) o 'desconocido'." },
    },
    required: [
      "resumenExacto", "escenas", "estiloVisual", "hookVisual",
      "porQueFunciona", "formulaReplicable", "transcripcionEspanol", "idiomaOriginal",
    ],
  },
} as const;

async function callClaudeVision(opts: {
  framesB64: string[];
  duration: number;
  transcription: string | null;
  transcriptionLang: string | null;
  caption: string | null;
}): Promise<VideoAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new VideoAnalysisError("Falta ANTHROPIC_API_KEY.", "config");

  const step = opts.duration / opts.framesB64.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  opts.framesB64.forEach((b64, i) => {
    content.push({
      type: "text",
      text: `Fotograma ${i + 1} (~segundo ${Math.round(i * step)}):`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: b64 },
    });
  });
  content.push({
    type: "text",
    text: `Estos son ${opts.framesB64.length} fotogramas equiespaciados de un reel de Instagram de ${Math.round(opts.duration)} segundos.

${opts.transcription ? `TRANSCRIPCIÓN DEL AUDIO (idioma: ${opts.transcriptionLang ?? "desconocido"}):\n"""\n${opts.transcription}\n"""` : "NO hay transcripción de audio disponible — analiza solo lo visual y el texto en pantalla."}
${opts.caption ? `\nCAPTION DEL POST:\n"""\n${opts.caption.slice(0, 800)}\n"""` : ""}

TAREA: analiza el video frame por frame con MÁXIMA exactitud. Describe solo lo que realmente se ve en los fotogramas y lo que dice la transcripción — cero invención. Si la transcripción está en otro idioma, tradúcela al español neutro de Latinoamérica en transcripcionEspanol. Llama a submit_video_analysis.`,
  });

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system:
        "Eres un analista experto de contenido de Instagram. Describes videos con precisión forense: solo lo que se ve y se oye, nada inventado. Escribes en español neutro de Latinoamérica.",
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "submit_video_analysis" },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new VideoAnalysisError(
      `La API de Claude respondió ${res.status}: ${t.slice(0, 200)}`,
      "api"
    );
  }
  const data = await res.json();
  const toolUse = (data.content ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => b.type === "tool_use"
  );
  if (!toolUse?.input) {
    throw new VideoAnalysisError("Claude no devolvió el análisis.", "parse");
  }
  return toolUse.input as VideoAnalysisResult;
}

export async function getVideoAnalysis(
  postId: string
): Promise<StoredVideoAnalysis | null> {
  const wsId = getWorkspaceId();
  const row = await queryOne<{
    post_id: string;
    result: VideoAnalysisResult;
    model: string;
    frames_count: number;
    analyzed_at: string;
  }>(
    `SELECT post_id, result, model, frames_count, analyzed_at
     FROM video_analyses WHERE workspace_id = $1 AND post_id = $2`,
    [wsId, postId]
  );
  if (!row) return null;
  return {
    postId: row.post_id,
    result: row.result,
    model: row.model,
    framesCount: row.frames_count,
    analyzedAt: row.analyzed_at,
  };
}

export async function analyzeVideo(opts: {
  postId: string;
  videoUrl: string;
  transcription: string | null;
  transcriptionLang: string | null;
  caption: string | null;
}): Promise<StoredVideoAnalysis> {
  const dir = await mkdtemp(path.join(tmpdir(), "iv-analyze-"));
  try {
    const videoPath = path.join(dir, "video.mp4");
    await downloadVideo(opts.videoUrl, videoPath);
    const { frames, duration } = await extractFrames(videoPath, dir);

    const framesB64: string[] = [];
    for (const f of frames) {
      framesB64.push((await readFile(f)).toString("base64"));
    }

    const result = await callClaudeVision({
      framesB64,
      duration,
      transcription: opts.transcription,
      transcriptionLang: opts.transcriptionLang,
      caption: opts.caption,
    });

    const wsId = getWorkspaceId();
    await query(
      `INSERT INTO video_analyses (workspace_id, post_id, result, model, frames_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, post_id)
       DO UPDATE SET result = EXCLUDED.result, model = EXCLUDED.model,
                     frames_count = EXCLUDED.frames_count, analyzed_at = now()`,
      [wsId, opts.postId, result, MODEL, framesB64.length]
    );

    return {
      postId: opts.postId,
      result,
      model: MODEL,
      framesCount: framesB64.length,
      analyzedAt: new Date().toISOString(),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
