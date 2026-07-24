// PESCAR IDEAS — el curador con IA que reemplaza las 4 horas de revisión manual.
//
// Problema real: el Radar ordena por engagement, pero el engagement no dice si
// el post SIRVE para el cliente: muchos posts del nicho correcto hablan de otra
// cosa, comunican creencias contrarias a la marca, o son humor/casos personales
// imposibles de replicar. Filtrar eso a mano toma horas.
//
// Solución: Claude (Haiku — rápido y barato) lee cada caption y lo compara con
// la MEMORIA DE LA MARCA (resumen del cerebro): ¿tema correcto? ¿creencias
// compatibles? ¿replicable como formato? Devuelve solo las ideas ganadoras,
// rankeadas y con la explicación + cómo adaptarla. ~150 posts en ~20-30s.

import type { Brand } from "./brands";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Haiku: ideal para clasificación masiva — ~10× más barato y rápido que Sonnet.
const MODEL = "claude-haiku-4-5-20251001";

const BATCH_SIZE = 20; // posts por llamada
const MAX_POSTS = 150; // tope de posts a evaluar (los de mejor engagement)
const MIN_CAPTION = 25; // sin texto no hay nada que juzgar

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPost = any;

export interface IdeaPescada {
  puntaje: number; // 0-100
  veredicto: "ganadora" | "posible";
  razon: string; // por qué sirve (o casi)
  comoAdaptar: string; // cómo replicarla para ESTE cliente
  post: {
    id: string;
    url: string;
    ownerUsername: string | null;
    caption: string | null;
    engagementRate: number | null;
    likes: number;
    comments: number;
    views: number | null;
    mediaType: string | null;
    thumbnailUrl: string | null;
    videoUrl: string | null; // vivo mientras el scrape sea reciente → reproducible/descargable
  };
}

export interface PescaResult {
  evaluados: number;
  descartados: number;
  ideas: IdeaPescada[];
}

interface Evaluacion {
  i: number;
  puntaje: number;
  veredicto: "ganadora" | "posible" | "descartar";
  razon: string;
  comoAdaptar: string;
}

const TOOL = {
  name: "calificar_posts",
  description: "Devuelve la evaluación de cada post contra la marca del cliente.",
  input_schema: {
    type: "object" as const,
    properties: {
      evaluaciones: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            i: { type: "number" as const, description: "Índice del post evaluado" },
            puntaje: {
              type: "number" as const,
              description: "0-100: qué tan buena idea replicable es PARA ESTA MARCA",
            },
            veredicto: {
              type: "string" as const,
              enum: ["ganadora", "posible", "descartar"],
            },
            razon: {
              type: "string" as const,
              description: "1 frase: por qué sirve o por qué se descarta",
            },
            comoAdaptar: {
              type: "string" as const,
              description:
                "Solo si NO se descarta: 1-2 frases de cómo replicar la idea para esta marca",
            },
          },
          required: ["i", "puntaje", "veredicto", "razon"],
        },
      },
    },
    required: ["evaluaciones"],
  },
};

function systemPrompt(brand: Brand): string {
  return `Eres el curador de contenido de una agencia de marketing en Instagram.
Tu único trabajo: decidir si cada publicación viral es una IDEA REPLICABLE para
el cliente descrito abajo, o si se descarta. Eres MUY exigente — el usuario
pierde horas revisando basura; tú se las devuelves descartando sin piedad.

DESCARTA sin dudar cuando:
- El TEMA no es el del negocio del cliente (aunque sea del mismo nicho general).
- Comunica CREENCIAS o mensajes contrarios a los del cliente (compara con su plan).
- Es humor interno, meme, o depende de la fama/carisma de la persona (no replicable).
- Es puro caso personal sin fórmula extraíble (sorteos, saludos, vlogs).
- Es promoción de un producto/servicio que el cliente no ofrece.

Marca como GANADORA solo si: tema correcto + creencias compatibles + hay una
FÓRMULA clara que el cliente puede copiar (estructura de hook, formato, ángulo).
"posible" = sirve con ajustes. En "comoAdaptar" sé concreto: qué haría el
cliente con SU negocio usando esa fórmula.

CLIENTE (su memoria de marca):
${brand.resumen.slice(0, 3500)}`;
}

function captionForPrompt(p: AnyPost): string {
  return String(p.caption ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

async function evaluarLote(
  brand: Brand,
  lote: AnyPost[],
  offset: number
): Promise<Evaluacion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en .env.");

  const user = lote
    .map((p, k) => {
      const er = p.engagementRate != null ? `${p.engagementRate}% ER` : "ER desconocido";
      const vistas = p.views ? ` · ${p.views} vistas` : "";
      return `[${offset + k}] @${p.ownerUsername ?? "?"} (${p.mediaType ?? "?"}, ${er}${vistas})\n"${captionForPrompt(p)}"`;
    })
    .join("\n\n");

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
      system: systemPrompt(brand),
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: `Evalúa estos ${lote.length} posts (usa el índice [n] de cada uno):\n\n${user}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude respondió ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolUse = (data.content ?? []).find((b: any) => b.type === "tool_use");
  const evals = toolUse?.input?.evaluaciones;
  return Array.isArray(evals) ? evals : [];
}

// Pesca las ideas ganadoras de un montón de posts del Radar para una marca.
export async function pescarIdeas(
  brand: Brand,
  posts: AnyPost[]
): Promise<PescaResult> {
  // 1) Pre-filtro barato: necesita caption y orden por engagement.
  const conCaption = posts.filter(
    (p) => typeof p.caption === "string" && p.caption.trim().length >= MIN_CAPTION
  );
  conCaption.sort(
    (a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1)
  );
  const candidatos = conCaption.slice(0, MAX_POSTS);
  if (candidatos.length === 0) {
    return { evaluados: 0, descartados: 0, ideas: [] };
  }

  // 2) Lotes en PARALELO (son independientes) → ~150 posts en el tiempo de 1 lote.
  const lotes: Array<{ items: AnyPost[]; offset: number }> = [];
  for (let i = 0; i < candidatos.length; i += BATCH_SIZE) {
    lotes.push({ items: candidatos.slice(i, i + BATCH_SIZE), offset: i });
  }
  const resultados = await Promise.all(
    lotes.map((l) =>
      evaluarLote(brand, l.items, l.offset).catch(() => [] as Evaluacion[])
    )
  );

  // 3) Merge + ranking. Solo ganadoras y posibles; descartadas se cuentan.
  const ideas: IdeaPescada[] = [];
  let descartados = 0;
  for (const evals of resultados) {
    for (const e of evals) {
      const p = candidatos[e.i];
      if (!p) continue;
      if (e.veredicto === "descartar" || e.puntaje < 55) {
        descartados++;
        continue;
      }
      ideas.push({
        puntaje: Math.max(0, Math.min(100, Math.round(e.puntaje))),
        veredicto: e.veredicto === "ganadora" ? "ganadora" : "posible",
        razon: e.razon ?? "",
        comoAdaptar: e.comoAdaptar ?? "",
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
      });
    }
  }
  ideas.sort((a, b) => b.puntaje - a.puntaje);

  return { evaluados: candidatos.length, descartados, ideas: ideas.slice(0, 30) };
}
