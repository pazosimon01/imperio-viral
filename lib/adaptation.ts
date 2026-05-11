// Adaptación de una transcripción a español + anatomía del guión.
// Modelo: Anthropic claude-sonnet-4-6 vía tool use para JSON garantizado.

import { query, queryOne, getWorkspaceId } from "./db";
import type { AdaptationResult, StoredAdaptation } from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

export class AdaptationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "AdaptationError";
  }
}

const SYSTEM_PROMPT = `Eres un copywriter senior especializado en Instagram Reels para audiencia hispanohablante de Latinoamérica. Recibes la transcripción de un reel viral (puede estar en cualquier idioma) y tu tarea es entregarle al creador un paquete accionable para replicar el ángulo en español.

REGLAS DE ADAPTACIÓN:
- NO traduzcas literal. Adapta modismos, expresiones y cadencia al español neutro de Latinoamérica.
- Evita regionalismos de España ("tío", "vale", "guay"). Prefiere construcciones neutras.
- Mantén la longitud aproximada del guión original (un reel típico es 30-60 segundos).
- El guión debe sonar natural cuando el creador lo lea frente a cámara. Frases cortas. Cero "como modelo de lenguaje".
- Si la transcripción tiene errores obvios de transcripción (palabras técnicas mal escritas, nombres propios con errores fonéticos), interprétalos por contexto y corrige al adaptar — NO los repitas con el mismo error.

ANATOMÍA — tipos válidos:
- hook.type: "pregunta provocadora" | "dato shockeante" | "contradicción" | "promesa de valor" | "negación" | "curiosidad" | "historia personal" | "comparación"
- cta.type: "cliffhanger" | "comentar" | "guardar" | "seguir" | "compartir" | "reflexión abierta" | "ninguno"

PLANTILLA Y ALTERNATIVAS:
- template: estructura genérica con [PLACEHOLDERS] EN MAYÚSCULAS para que el creador la reuse en otros temas. Ejemplo: "¿Sabías que [DATO ESPECÍFICO]? La mayoría piensa [CREENCIA EQUIVOCADA], pero en realidad [VERDAD]..."
- alternativeHooks: exactamente 5 hooks alternos. Deben ser sobre el MISMO TEMA del reel original, NO genéricos. Cada uno con un ángulo diferente al original.

Llama SIEMPRE a la tool submit_adaptation con el resultado. No respondas con texto plano.`;

const ADAPTATION_TOOL = {
  name: "submit_adaptation",
  description:
    "Envía el paquete final con el guión adaptado, anatomía, plantilla y hooks alternativos.",
  input_schema: {
    type: "object",
    properties: {
      adaptedScript: { type: "string" },
      hook: {
        type: "object",
        properties: {
          type: { type: "string" },
          quote: { type: "string" },
        },
        required: ["type", "quote"],
      },
      development: { type: "array", items: { type: "string" } },
      cta: {
        type: "object",
        properties: {
          type: { type: "string" },
          quote: { type: "string" },
        },
        required: ["type", "quote"],
      },
      template: { type: "string" },
      alternativeHooks: { type: "array", items: { type: "string" } },
    },
    required: [
      "adaptedScript", "hook", "development", "cta", "template", "alternativeHooks",
    ],
  },
} as const;

function buildUserPrompt(opts: {
  transcription: string;
  sourceLang: string | null;
  caption: string | null;
}): string {
  const langLabel = opts.sourceLang ?? "desconocido";
  const captionBlock = opts.caption
    ? `\n\nCAPTION DEL POST (contexto adicional — puede contener hashtags, marcas, CTAs):\n"""\n${opts.caption}\n"""`
    : "";
  return `TRANSCRIPCIÓN ORIGINAL (idioma origen: ${langLabel}):
"""
${opts.transcription}
"""${captionBlock}

Adapta este reel al español de Latinoamérica siguiendo las reglas y llama a la tool submit_adaptation con el resultado.`;
}

export async function getAdaptation(
  postId: string,
): Promise<StoredAdaptation | null> {
  const wsId = getWorkspaceId();
  const row = await queryOne<{
    post_id: string;
    source_lang: string | null;
    result_json: AdaptationResult;
    model: string;
    adapted_at: number;
  }>(
    `SELECT post_id, source_lang, result_json, model, adapted_at
     FROM adaptations
     WHERE workspace_id = $1 AND post_id = $2`,
    [wsId, postId],
  );
  if (!row) return null;
  return {
    postId: row.post_id,
    sourceLang: row.source_lang,
    result: row.result_json,
    model: row.model,
    adaptedAt: row.adapted_at,
  };
}

async function saveAdaptation(
  postId: string,
  sourceLang: string | null,
  result: AdaptationResult,
  model: string,
): Promise<StoredAdaptation> {
  const wsId = getWorkspaceId();
  const adaptedAt = Math.floor(Date.now() / 1000);
  await query(
    `INSERT INTO adaptations (workspace_id, post_id, source_lang, result_json, model, adapted_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, post_id) DO UPDATE SET
       source_lang = EXCLUDED.source_lang,
       result_json = EXCLUDED.result_json,
       model       = EXCLUDED.model,
       adapted_at  = EXCLUDED.adapted_at`,
    [wsId, postId, sourceLang, result, model, adaptedAt],
  );
  return { postId, sourceLang, result, model, adaptedAt };
}

function validateResult(data: unknown): AdaptationResult {
  if (!data || typeof data !== "object") {
    throw new AdaptationError(
      "La tool no devolvió un objeto válido.",
      "invalid_response",
    );
  }
  const d = data as Record<string, unknown>;
  const hook = d.hook as Record<string, unknown> | undefined;
  const cta = d.cta as Record<string, unknown> | undefined;
  const development = d.development;
  const alternativeHooks = d.alternativeHooks;
  if (
    typeof d.adaptedScript !== "string" ||
    !hook ||
    typeof hook.type !== "string" ||
    typeof hook.quote !== "string" ||
    !Array.isArray(development) ||
    !cta ||
    typeof cta.type !== "string" ||
    typeof cta.quote !== "string" ||
    typeof d.template !== "string" ||
    !Array.isArray(alternativeHooks)
  ) {
    throw new AdaptationError(
      "El objeto de la tool no tiene la estructura esperada.",
      "invalid_response",
    );
  }
  return {
    adaptedScript: d.adaptedScript,
    hook: { type: hook.type, quote: hook.quote },
    development: development.filter((x): x is string => typeof x === "string"),
    cta: { type: cta.type, quote: cta.quote },
    template: d.template,
    alternativeHooks: alternativeHooks.filter(
      (x): x is string => typeof x === "string",
    ),
  };
}

async function callAnthropic(
  userPrompt: string,
): Promise<{ data: AdaptationResult; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AdaptationError(
      "Falta ANTHROPIC_API_KEY en .env. Crea una key en https://console.anthropic.com/settings/keys (requiere saldo cargado).",
      "no_api_key",
    );
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      tools: [ADAPTATION_TOOL],
      tool_choice: { type: "tool", name: ADAPTATION_TOOL.name },
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    let userMessage = `Anthropic API error ${res.status}`;
    if (res.status === 401) {
      userMessage =
        "API key de Anthropic inválida. Verifica ANTHROPIC_API_KEY en .env.";
    } else if (res.status === 429) {
      userMessage =
        "Anthropic rechazó por rate limit / saldo insuficiente. Revisa billing en console.anthropic.com.";
    } else if (res.status === 400) {
      userMessage = `Petición inválida a Anthropic (revisa modelo o tool schema).`;
    }
    throw new AdaptationError(`${userMessage}  —  ${body}`, "anthropic_error");
  }

  const json = (await res.json()) as {
    content?: Array<{
      type: string;
      name?: string;
      input?: unknown;
      text?: string;
    }>;
    model?: string;
    stop_reason?: string;
  };

  const toolBlock = json.content?.find(
    (c) => c.type === "tool_use" && c.name === ADAPTATION_TOOL.name,
  );
  if (!toolBlock || toolBlock.input == null) {
    throw new AdaptationError(
      `Claude no llamó a submit_adaptation (stop_reason=${json.stop_reason ?? "?"}).`,
      "invalid_response",
    );
  }

  return {
    data: validateResult(toolBlock.input),
    model: json.model ?? DEFAULT_MODEL,
  };
}

export interface AdaptOptions {
  postId: string;
  transcription: string;
  sourceLang: string | null;
  caption: string | null;
  force?: boolean;
}

export async function adaptPost(
  opts: AdaptOptions,
): Promise<StoredAdaptation> {
  if (!opts.force) {
    const existing = await getAdaptation(opts.postId);
    if (existing) return existing;
  }
  const userPrompt = buildUserPrompt({
    transcription: opts.transcription,
    sourceLang: opts.sourceLang,
    caption: opts.caption,
  });
  const { data, model } = await callAnthropic(userPrompt);
  return saveAdaptation(opts.postId, opts.sourceLang, data, model);
}
