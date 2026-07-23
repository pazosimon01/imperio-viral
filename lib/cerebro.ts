// CEREBRO — generación de estrategia y de contenido (carruseles, historias,
// guiones) con el método destilado. Mismo patrón que lib/adaptation.ts:
// fetch directo a la API de Anthropic + tool use para JSON garantizado.

import { CEREBRO_SYSTEM, businessBlock, type BusinessBrief } from "./cerebro-method";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";

export class CerebroError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "CerebroError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callClaude(opts: {
  system: string;
  user: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: any;
  maxTokens: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new CerebroError("Falta ANTHROPIC_API_KEY en .env.", "config");
  }
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.tool.name },
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new CerebroError(
      `La API de Claude respondió ${res.status}: ${text.slice(0, 300)}`,
      "api"
    );
  }
  const data = await res.json();
  const toolUse = (data.content ?? []).find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => b.type === "tool_use"
  );
  if (!toolUse?.input) {
    throw new CerebroError("Claude no devolvió el resultado esperado.", "parse");
  }
  return toolUse.input;
}

// ── ESTRATEGIA ──────────────────────────────────────────────────────────────

export interface StrategyResult {
  diagnostico: string;
  creenciaObjetivo: { numero: number; nombre: string; porQue: string };
  angulos: Array<{ titulo: string; creencia: number; descripcion: string }>;
  planSemanal: Array<{
    dia: string;
    tipoReptinac: string;
    formato: string;
    idea: string;
    hook: string;
  }>;
  ideas: Array<{
    titulo: string;
    hook: string;
    tipoReptinac: string;
    creencia: number;
    formato: string;
  }>;
  busquedasRadar: { perfiles: string[]; hashtags: string[]; nota: string };
}

const STRATEGY_TOOL = {
  name: "submit_strategy",
  description: "Entrega la estrategia de contenido completa.",
  input_schema: {
    type: "object",
    properties: {
      diagnostico: {
        type: "string",
        description:
          "Diagnóstico del negocio en 3-5 frases: qué creencia falta y por qué, en lenguaje simple para alguien SIN conocimiento de marketing.",
      },
      creenciaObjetivo: {
        type: "object",
        properties: {
          numero: { type: "number" },
          nombre: { type: "string" },
          porQue: { type: "string" },
        },
        required: ["numero", "nombre", "porQue"],
      },
      angulos: {
        type: "array",
        description: "3 ángulos de contenido, cada uno anclado a una creencia.",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            creencia: { type: "number" },
            descripcion: { type: "string" },
          },
          required: ["titulo", "creencia", "descripcion"],
        },
      },
      planSemanal: {
        type: "array",
        description:
          "7 días. Respeta el mix REPTINAC. formato: 'reel' | 'carrusel' | 'historias'.",
        items: {
          type: "object",
          properties: {
            dia: { type: "string" },
            tipoReptinac: { type: "string" },
            formato: { type: "string" },
            idea: { type: "string" },
            hook: { type: "string" },
          },
          required: ["dia", "tipoReptinac", "formato", "idea", "hook"],
        },
      },
      ideas: {
        type: "array",
        description:
          "10 ideas listas (Hook + Ángulo + Creencia). Sin CTA — son ideación TOFU 60 / MOFU 35 / BOFU 5.",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            hook: { type: "string" },
            tipoReptinac: { type: "string" },
            creencia: { type: "number" },
            formato: { type: "string" },
          },
          required: ["titulo", "hook", "tipoReptinac", "creencia", "formato"],
        },
      },
      busquedasRadar: {
        type: "object",
        description:
          "Qué buscar en el Radar (scraper): tipos de perfiles/keywords del nicho para encontrar virales de referencia. perfiles = tipos de cuenta a buscar en Instagram (descripciones o handles probables), hashtags SIN #.",
        properties: {
          perfiles: { type: "array", items: { type: "string" } },
          hashtags: { type: "array", items: { type: "string" } },
          nota: { type: "string" },
        },
        required: ["perfiles", "hashtags", "nota"],
      },
    },
    required: [
      "diagnostico",
      "creenciaObjetivo",
      "angulos",
      "planSemanal",
      "ideas",
      "busquedasRadar",
    ],
  },
} as const;

// ── ENTREVISTA ADAPTATIVA ────────────────────────────────────────────────
// En vez de un menú fijo de "problemas", CEREBRO conversa: lee lo que el dueño
// escribe con SUS palabras y hace 1-2 preguntas de seguimiento a la medida,
// hasta tener claro el negocio y el problema real. Luego arma la estrategia.

export interface InterviewTurn {
  role: "cerebro" | "usuario";
  text: string;
}

export interface InterviewResponse {
  listo: boolean; // ¿ya hay suficiente para la estrategia?
  pregunta: string | null; // siguiente pregunta si !listo
  resumen: string | null; // si listo: brief consolidado para la estrategia
  nombre: string | null; // si listo: nombre del negocio/marca
  porcentaje: number; // 0-100, cuánto entendió del negocio
}

const INTERVIEW_TOOL = {
  name: "submit_interview_step",
  description: "Decide si ya entiendes el negocio o qué preguntar a continuación.",
  input_schema: {
    type: "object",
    properties: {
      listo: {
        type: "boolean",
        description: "true solo cuando entiendes: qué vende, a quién, y cuál es el problema real de marketing.",
      },
      pregunta: {
        type: "string",
        description: "Si NO estás listo: UNA sola pregunta, corta, cálida, en lenguaje simple, adaptada a lo que la persona ya dijo. Sin jerga de marketing. Si estás listo: ''.",
      },
      resumen: {
        type: "string",
        description: "Si estás listo: resumen del negocio en 4-6 líneas (nombre, qué vende, cliente ideal, problema real, pruebas/voz si las mencionó). Si no: ''.",
      },
      nombre: {
        type: "string",
        description: "Si estás listo: el nombre del negocio o marca (corto, para etiquetar la marca). Si no: ''.",
      },
      porcentaje: {
        type: "number",
        description: "Qué tan claro tienes el negocio, de 0 a 100.",
      },
    },
    required: ["listo", "pregunta", "resumen", "nombre", "porcentaje"],
  },
} as const;

export async function interviewStep(
  turns: InterviewTurn[]
): Promise<InterviewResponse> {
  const convo = turns
    .map((t) => `${t.role === "cerebro" ? "CEREBRO" : "DUEÑO"}: ${t.text}`)
    .join("\n");
  const system = `${CEREBRO_SYSTEM}

Ahora estás en MODO ENTREVISTA. Tu trabajo NO es dar la estrategia todavía, sino ENTENDER el negocio conversando, como un consultor cálido que habla con alguien que no sabe nada de marketing.
REGLAS DE LA ENTREVISTA:
- Haz UNA sola pregunta por turno. Corta y en lenguaje cotidiano.
- Adáptate a lo que la persona YA dijo: nunca preguntes algo que ya respondió; profundiza en lo que dijo.
- No uses palabras como "creencia", "TOFU", "funnel", "avatar" con el usuario.
- Con 2-4 respuestas suele bastar. Apenas entiendas qué vende, a quién, y qué le duele del marketing (ej: "no me conocen", "me contactan pero no compran", "no sé qué publicar"), marca listo=true.
- Sé breve y humano. Una pregunta a la vez.`;
  const user = `Conversación hasta ahora:
"""
${convo}
"""
Decide el siguiente paso y llama a submit_interview_step.`;
  return (await callClaude({
    system,
    user,
    tool: INTERVIEW_TOOL,
    maxTokens: 800,
  })) as InterviewResponse;
}

// Genera la estrategia a partir del resumen consolidado por la entrevista.
export async function generateStrategyFromSummary(
  resumen: string
): Promise<{ result: StrategyResult; model: string }> {
  const user = `NEGOCIO (consolidado en entrevista con el dueño — única fuente de verdad, Zero-Invention):
"""
${resumen}
"""

TAREA: genera la estrategia de contenido inicial siguiendo el método. El diagnóstico debe leerse en lenguaje simple, para alguien que no sabe de marketing. Llama a submit_strategy.`;
  const result = (await callClaude({
    system: CEREBRO_SYSTEM,
    user,
    tool: STRATEGY_TOOL,
    maxTokens: 6000,
  })) as StrategyResult;
  return { result, model: MODEL };
}

export async function generateStrategy(
  brief: BusinessBrief
): Promise<{ result: StrategyResult; model: string }> {
  const user = `${businessBlock(brief)}

TAREA: genera la estrategia de contenido inicial para este negocio siguiendo el método. El usuario puede NO saber nada de marketing: el diagnóstico debe leerse en lenguaje simple. Llama a submit_strategy.`;
  const result = (await callClaude({
    system: CEREBRO_SYSTEM,
    user,
    tool: STRATEGY_TOOL,
    maxTokens: 6000,
  })) as StrategyResult;
  return { result, model: MODEL };
}

// ── CREACIÓN DE CONTENIDO ───────────────────────────────────────────────────

export type ContentKind = "carrusel" | "historias" | "guion";

export interface CreateBrief {
  kind: ContentKind;
  negocio: string; // contexto del negocio/marca (texto libre)
  fuente: string; // idea propia o texto/caption/transcripción del viral de referencia
  creencia?: number | null; // 1-5 opcional
  instrucciones?: string | null;
}

const CARRUSEL_TOOL = {
  name: "submit_carrusel",
  description: "Entrega el carrusel completo, slide por slide.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string" },
      creencia: { type: "number" },
      tipoReptinac: { type: "string" },
      estructura: {
        type: "string",
        description: "Cuál estructura usaste: 'VSL comprimido' | '3 Yes' | 'Logic Ladder' | 'Comparativa'",
      },
      hooksAlternativos: {
        type: "array",
        description: "Las 5 variantes de gancho de portada que consideraste (regla obligatoria).",
        items: { type: "string" },
      },
      slides: {
        type: "array",
        description: "5-10 slides. rol: portada | segundo-hook | desarrollo | prueba | cta.",
        items: {
          type: "object",
          properties: {
            numero: { type: "number" },
            rol: { type: "string" },
            texto: { type: "string", description: "El copy EXACTO del slide. Líneas cortas, una idea." },
            notaVisual: { type: "string", description: "Sugerencia visual breve para el diseño." },
          },
          required: ["numero", "rol", "texto", "notaVisual"],
        },
      },
      caption: { type: "string", description: "Caption del post, con el CTA de palabra clave si aplica." },
      ctaPalabraClave: { type: "string", description: "Palabra clave del lead magnet en MAYÚSCULAS, o '' si no aplica." },
    },
    required: ["titulo", "creencia", "tipoReptinac", "estructura", "hooksAlternativos", "slides", "caption", "ctaPalabraClave"],
  },
} as const;

const HISTORIAS_TOOL = {
  name: "submit_historias",
  description: "Entrega la secuencia de historias completa.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string" },
      creencia: { type: "number" },
      objetivo: { type: "string" },
      pantallas: {
        type: "array",
        description: "5-10 pantallas. Una frase/idea por pantalla, lectura en 2-3s.",
        items: {
          type: "object",
          properties: {
            numero: { type: "number" },
            texto: { type: "string" },
            sticker: {
              type: "string",
              description: "'' si no lleva, o el sticker: 'encuesta: [opción A / opción B]' | 'pregunta: [texto]' | 'link'",
            },
            notaVisual: { type: "string" },
          },
          required: ["numero", "texto", "sticker", "notaVisual"],
        },
      },
      cta: { type: "string", description: "El CTA único de la última pantalla." },
    },
    required: ["titulo", "creencia", "objetivo", "pantallas", "cta"],
  },
} as const;

const GUION_TOOL = {
  name: "submit_guion",
  description: "Entrega el guión de reel completo.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string" },
      creencia: { type: "number" },
      tipoReptinac: { type: "string" },
      hooksAlternativos: {
        type: "array",
        description: "5 variantes de gancho (regla obligatoria). La primera es la elegida.",
        items: { type: "string" },
      },
      guion: {
        type: "string",
        description: "Guión completo listo para leer a cámara. Frases cortas, cabe en 30-60s.",
      },
      textoEnPantalla: {
        type: "string",
        description: "Texto sobreimpreso del primer fotograma. COMPLEMENTA al audio, no lo copia.",
      },
      cta: { type: "string" },
      notasGrabacion: { type: "string", description: "2-3 notas de grabación/b-roll." },
    },
    required: ["titulo", "creencia", "tipoReptinac", "hooksAlternativos", "guion", "textoEnPantalla", "cta", "notasGrabacion"],
  },
} as const;

const KIND_TOOL = {
  carrusel: CARRUSEL_TOOL,
  historias: HISTORIAS_TOOL,
  guion: GUION_TOOL,
} as const;

const KIND_TASK: Record<ContentKind, string> = {
  carrusel:
    "Crea un CARRUSEL de Instagram (5-10 slides, 7-8 ideal) siguiendo las leyes del carrusel y eligiendo UNA estructura. Slide 1 = portada con el mejor gancho de tus 5 variantes. Slide 2 = segundo hook. Último slide = un solo CTA.",
  historias:
    "Crea una SECUENCIA DE HISTORIAS de Instagram (5-10 pantallas) siguiendo las leyes de la historia y la estructura del email fragmentado. Incluye al menos un sticker de interacción. Última pantalla = un solo CTA.",
  guion:
    "Crea un GUIÓN DE REEL de 30-60 segundos. El reel filtra e instala UNA creencia; NO vende. Genera 5 variantes de gancho y elige la mejor. El texto en pantalla complementa al audio, no lo copia.",
};

export async function generateContent(
  brief: CreateBrief
): Promise<{ result: unknown; model: string }> {
  const creenciaLine =
    brief.creencia && brief.creencia >= 1 && brief.creencia <= 5
      ? `CREENCIA OBJETIVO ELEGIDA POR EL USUARIO: #${brief.creencia}. Ánclate a ella.`
      : "Elige tú la creencia objetivo más rentable para esta pieza y decláralo.";
  const user = `CONTEXTO DEL NEGOCIO/MARCA (única fuente de verdad — Zero-Invention):
"""
${brief.negocio}
"""

MATERIAL DE PARTIDA (idea propia del usuario o texto/caption/transcripción de un viral de referencia — si es un viral, REPLICA EL ÁNGULO adaptado a este negocio, no lo copies literal):
"""
${brief.fuente}
"""

${creenciaLine}
${brief.instrucciones ? `INSTRUCCIONES EXTRA DEL USUARIO: ${brief.instrucciones}` : ""}

TAREA: ${KIND_TASK[brief.kind]} Llama a la tool con el resultado.`;

  const result = await callClaude({
    system: CEREBRO_SYSTEM,
    user,
    tool: KIND_TOOL[brief.kind],
    maxTokens: 5000,
  });
  return { result, model: MODEL };
}

// Refina una pieza YA generada según el pedido del usuario, SIN empezar de
// cero: recibe la pieza actual (JSON) + la instrucción de cambio, y devuelve
// la pieza completa revisada aplicando solo lo pedido y conservando el resto.
export async function refineContent(opts: {
  kind: ContentKind;
  negocio: string;
  fuente: string;
  previous: unknown;
  feedback: string;
}): Promise<{ result: unknown; model: string }> {
  const user = `CONTEXTO DEL NEGOCIO/MARCA (única fuente de verdad — Zero-Invention):
"""
${opts.negocio}
"""

PIEZA ACTUAL (la que ya generaste, en JSON):
"""
${JSON.stringify(opts.previous, null, 2)}
"""

EL USUARIO PIDE ESTOS CAMBIOS:
"""
${opts.feedback}
"""

TAREA: aplica EXACTAMENTE los cambios pedidos y devuelve la pieza COMPLETA revisada. Conserva todo lo que el usuario NO pidió cambiar (no reescribas de cero lo que ya estaba bien). Sigue respetando el método y las leyes (una idea por línea, un solo CTA, Zero-Invention, etc.). Llama a la tool con el resultado.`;

  const result = await callClaude({
    system: CEREBRO_SYSTEM,
    user,
    tool: KIND_TOOL[opts.kind],
    maxTokens: 5000,
  });
  return { result, model: MODEL };
}
