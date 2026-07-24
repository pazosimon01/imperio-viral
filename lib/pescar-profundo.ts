// PESCA PROFUNDA — la IA VE los videos como lo haría el usuario.
//
// El feedback que motivó esto: "la idea ganadora va de interpretar la narrativa
// del negocio, y eso solo se ve EN el video (lo que se dice, cada frame según
// el contexto) — el caption no basta; y para replicar necesito VER el video".
//
// Pipeline en dos fases (job en memoria, el celular solo pollea):
//   FASE RÁPIDA  (~10s): captions + engagement → pre-selección de candidatos.
//   FASE PROFUNDA (~2-3 min): por cada reel candidato descarga el MP4 (la URL
//   está viva — el Radar lo scrapeó hace minutos), TRANSCRIBE el audio,
//   extrae frames con ffmpeg y Claude visión juzga la NARRATIVA contra la
//   memoria de la marca. Devuelve el veredicto + qué dice + qué se ve + cómo
//   replicarlo escena a escena — y el video queda reproducible en la UI.

import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type { Brand } from "./brands";
import { pescarIdeas, type IdeaPescada } from "./pescar";
import { downloadVideo, extractFrames } from "./video-analysis";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const VISION_MODEL = "claude-sonnet-4-6";

const MAX_DEEP = 8; // reels que se analizan a fondo (costo ~$0.05 c/u)
const DEEP_CONCURRENCY = 2;
const JOB_TTL_MS = 60 * 60 * 1000;

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface IdeaProfunda extends IdeaPescada {
  profundo: {
    resumenVideo: string; // qué pasa realmente en el video
    queDice: string; // resumen del audio, en español
    razonMarca: string; // por qué encaja (o no) con la narrativa del cliente
    comoReplicar: string; // fórmula escena a escena adaptada al cliente
    conAudio: boolean; // si hubo transcripción disponible
  } | null; // null = quedó solo con el juicio rápido (no-video)
}

export interface PescaJob {
  id: string;
  fase: "rapida" | "profunda" | "lista";
  evaluados: number;
  descartadosRapido: number;
  descartadosProfundo: number;
  profundoTotal: number;
  profundoDone: number;
  ideas: IdeaProfunda[]; // ganadoras profundas (van entrando en vivo)
  ligeras: IdeaPescada[]; // no-videos que pasaron el filtro rápido
  marca: string;
  done: boolean;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, PescaJob>();

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.updatedAt > JOB_TTL_MS) jobs.delete(id);
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
}

// ── Transcripción opcional (OpenAI) desde el archivo ya descargado ──────────

async function transcribeLocalFile(filePath: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const buf = await readFile(filePath);
    if (buf.length > 24_000_000) return null; // límite 25 MB de la API
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: "video/mp4" }), "video.mp4");
    fd.append("model", "gpt-4o-transcribe");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { text?: string };
    return j.text?.trim() || null;
  } catch {
    return null;
  }
}

// ── El juez con ojos: frames + audio + marca ────────────────────────────────

const JUDGE_TOOL = {
  name: "juzgar_reel",
  description: "Veredicto sobre si este reel es una idea replicable para la marca.",
  input_schema: {
    type: "object" as const,
    properties: {
      puntaje: { type: "number" as const, description: "0-100 para ESTA marca" },
      veredicto: { type: "string" as const, enum: ["ganadora", "posible", "descartar"] },
      resumenVideo: {
        type: "string" as const,
        description: "Qué pasa REALMENTE en el video (visual + audio), 2-4 frases fieles",
      },
      queDice: {
        type: "string" as const,
        description: "Resumen en español de lo que DICE el audio ('' si no hay audio/transcripción)",
      },
      razonMarca: {
        type: "string" as const,
        description: "Por qué encaja o choca con la narrativa/creencias de la marca, 1-2 frases",
      },
      comoReplicar: {
        type: "string" as const,
        description:
          "Solo si NO se descarta: fórmula escena a escena para que ESTA marca lo replique (qué grabar, qué decir, texto en pantalla), con [PLACEHOLDERS]",
      },
    },
    required: ["puntaje", "veredicto", "resumenVideo", "queDice", "razonMarca"],
  },
};

function judgeSystem(brand: Brand): string {
  return `Eres el curador de contenido de una agencia. Acabas de VER un reel de
Instagram (fotogramas + transcripción del audio). Decide si es una IDEA
REPLICABLE para el cliente de abajo. Sé muy exigente: el usuario pierde horas
con ideas que "parecen" del nicho pero no sirven.

Juzga por lo VISTO y lo DICHO (no por el caption):
- ¿La NARRATIVA del video encaja con el negocio y las creencias del cliente?
- ¿O comunica lo contrario (p.ej. "no pagues clínicas", humor interno, fama personal)?
- ¿Hay una FÓRMULA extraíble (estructura de hook, escenas, texto en pantalla)
  que el cliente pueda grabar con SUS recursos?

MÉTRICA (regla del usuario): te doy cuántas veces su propia audiencia hizo el
reel. Desde 5× vale la pena de verdad; cerca o encima de 10× es excelente —
entre más, mejor puntaje. PERO la narrativa MANDA: 20× con narrativa
incompatible = descartar; 3× con narrativa perfecta puede ser "posible".

CLIENTE (memoria de marca):
${brand.resumen.slice(0, 3500)}`;
}

interface DeepVerdict {
  puntaje: number;
  veredicto: "ganadora" | "posible" | "descartar";
  resumenVideo: string;
  queDice: string;
  razonMarca: string;
  comoReplicar?: string;
}

async function judgeReel(opts: {
  brand: Brand;
  framesB64: string[];
  duration: number;
  transcription: string | null;
  caption: string | null;
  engagementRate: number | null;
  views: number | null;
}): Promise<DeepVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY.");

  const step = opts.duration / opts.framesB64.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  opts.framesB64.forEach((b64, i) => {
    content.push({ type: "text", text: `Fotograma ${i + 1} (~seg ${Math.round(i * step)}):` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: b64 },
    });
  });
  // Regla del usuario: ER/100 = cuántas veces su propia audiencia hizo el post.
  const mult = opts.engagementRate != null ? opts.engagementRate / 100 : null;
  const er =
    mult != null
      ? `hizo ${mult.toFixed(1)}× la audiencia del creador${
          mult >= 10
            ? " — EXCELENTE (10×+)"
            : mult >= 5
            ? " — vale la pena (5×+)"
            : " — por debajo del umbral de 5× del usuario"
        }`
      : "viralidad desconocida (sin datos de seguidores)";
  content.push({
    type: "text",
    text: `Reel de ${Math.round(opts.duration)}s — VIRALIDAD: ${er}${opts.views ? ` (${opts.views} vistas)` : ""}.

${opts.transcription ? `TRANSCRIPCIÓN DEL AUDIO:\n"""\n${opts.transcription.slice(0, 2500)}\n"""` : "SIN transcripción de audio — júzgalo por lo visual y el texto en pantalla."}
${opts.caption ? `\nCAPTION (secundario, no es el criterio principal):\n"""\n${opts.caption.slice(0, 400)}\n"""` : ""}

Evalúa si es una idea replicable PARA ESTA MARCA y llama a juzgar_reel.`,
  });

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 2000,
      system: judgeSystem(opts.brand),
      tools: [JUDGE_TOOL],
      tool_choice: { type: "tool", name: JUDGE_TOOL.name },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude respondió ${res.status}: ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolUse = (data.content ?? []).find((b: any) => b.type === "tool_use");
  if (!toolUse?.input) throw new Error("Claude no devolvió veredicto.");
  return toolUse.input as DeepVerdict;
}

// Analiza UN reel a fondo: descarga → transcribe → frames → juicio con marca.
async function analyzeCandidato(
  brand: Brand,
  cand: IdeaPescada
): Promise<{ verdict: DeepVerdict; conAudio: boolean }> {
  const dir = await mkdtemp(path.join(tmpdir(), "iv-pesca-"));
  try {
    const videoPath = path.join(dir, "video.mp4");
    await downloadVideo(cand.post.videoUrl!, videoPath);
    // Transcripción y frames en paralelo (independientes).
    const [transcription, framesInfo] = await Promise.all([
      transcribeLocalFile(videoPath),
      extractFrames(videoPath, dir),
    ]);
    const framesB64: string[] = [];
    for (const f of framesInfo.frames) {
      framesB64.push((await readFile(f)).toString("base64"));
    }
    const verdict = await judgeReel({
      brand,
      framesB64,
      duration: framesInfo.duration,
      transcription,
      caption: cand.post.caption,
      engagementRate: cand.post.engagementRate,
      views: cand.post.views,
    });
    return { verdict, conAudio: !!transcription };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── El job completo ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runPesca(job: PescaJob, brand: Brand, posts: any[]) {
  try {
    // FASE RÁPIDA: pre-selección por caption+ER (barata, segundos).
    const quick = await pescarIdeas(brand, posts);
    job.evaluados = quick.evaluados;
    job.descartadosRapido = quick.descartados;

    const esVideoConUrl = (i: IdeaPescada) =>
      i.post.mediaType === "video" && !!i.post.videoUrl;

    // Candidatos profundos: por VIRALIDAD REAL. Regla del usuario: vale la
    // pena desde 5× su audiencia (ER ≥ 500%), excelente desde 10× — entre más,
    // mejor. El caption NO decide quién entra (la narrativa vive en el video);
    // el filtro de texto solo aporta contexto si coincide. La narrativa la
    // juzga el que VE cada video.
    const quickById = new Map(
      quick.ideas.filter(esVideoConUrl).map((i) => [i.post.id, i])
    );
    const allVideos = posts
      .filter((p) => p?.mediaType === "video" && p?.videoUrl)
      .sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1));
    const candidatos = allVideos.slice(0, MAX_DEEP).map(
      (p): IdeaPescada =>
        quickById.get(String(p.id ?? "")) ?? {
          puntaje: 0,
          veredicto: "posible",
          razon: "",
          comoAdaptar: "",
          post: {
            id: String(p.id ?? ""),
            url: p.url ?? "#",
            ownerUsername: p.ownerUsername ?? null,
            caption: p.caption ?? null,
            engagementRate: p.engagementRate ?? null,
            likes: p.likes ?? 0,
            comments: p.comments ?? 0,
            views: p.views ?? null,
            mediaType: p.mediaType ?? null,
            thumbnailUrl: p.thumbnailUrl ?? null,
            videoUrl: p.videoUrl ?? null,
          },
        }
    );
    job.ligeras = quick.ideas.filter((i) => !esVideoConUrl(i)).slice(0, 10);
    job.profundoTotal = candidatos.length;
    job.fase = "profunda";
    job.updatedAt = Date.now();

    // FASE PROFUNDA: ver cada video (los resultados van entrando en vivo).
    await mapLimit(candidatos, DEEP_CONCURRENCY, async (cand) => {
      try {
        const { verdict, conAudio } = await analyzeCandidato(brand, cand);
        if (verdict.veredicto !== "descartar" && verdict.puntaje >= 55) {
          job.ideas.push({
            ...cand,
            puntaje: Math.max(0, Math.min(100, Math.round(verdict.puntaje))),
            veredicto: verdict.veredicto === "ganadora" ? "ganadora" : "posible",
            razon: verdict.razonMarca,
            comoAdaptar: verdict.comoReplicar ?? cand.comoAdaptar,
            profundo: {
              resumenVideo: verdict.resumenVideo,
              queDice: verdict.queDice,
              razonMarca: verdict.razonMarca,
              comoReplicar: verdict.comoReplicar ?? "",
              conAudio,
            },
          });
          job.ideas.sort((a, b) => b.puntaje - a.puntaje);
        } else {
          job.descartadosProfundo++;
        }
      } catch {
        // video caído/error puntual: no tumba la pesca completa
        job.descartadosProfundo++;
      }
      job.profundoDone++;
      job.updatedAt = Date.now();
    });

    job.fase = "lista";
  } catch (e) {
    job.error = e instanceof Error ? e.message : "error";
  } finally {
    job.done = true;
    job.updatedAt = Date.now();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPescaJob(brand: Brand, posts: any[]): PescaJob {
  sweep();
  const job: PescaJob = {
    id: randomUUID(),
    fase: "rapida",
    evaluados: 0,
    descartadosRapido: 0,
    descartadosProfundo: 0,
    profundoTotal: 0,
    profundoDone: 0,
    ideas: [],
    ligeras: [],
    marca: brand.nombre,
    done: false,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  void runPesca(job, brand, posts);
  return job;
}

export function getPescaSnapshot(id: string): PescaJob | null {
  const job = jobs.get(id);
  if (!job) return null;
  job.updatedAt = Date.now();
  return job;
}
