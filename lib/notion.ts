// Integración con Notion — envía ideas de contenido seleccionadas en la app
// a la base de datos "Simon ideas" (o la que configures en NOTION_DATABASE_ID).
//
// Diseño schema-aware: en vez de asumir los tipos de columna, leemos el schema
// real de la DB con databases.retrieve() y construimos cada propiedad según su
// tipo (title, number, date, select, multi_select, status, rich_text). Así el
// envío no se rompe si cambias el formato de una columna en Notion.
//
// Requiere dos variables de entorno (ver .env.example):
//   NOTION_TOKEN        → secret de una integración interna de Notion
//   NOTION_DATABASE_ID  → id de la DB (sale de la URL; con o sin guiones)

import { Client } from "@notionhq/client";

export interface IdeaPayload {
  idea: string; // título / hook — va a la columna title
  engagementRate: number | null; // ER% estándar (ej. 442.16)
  tipo: string | null; // etiqueta editorial (conciencia, viral/b-rolls, …)
  fechaISO: string | null; // YYYY-MM-DD; null → no se setea
  guion?: string | null; // guión adaptado, si existe
  comentarios?: string | null; // notas de la decisión
}

export interface PushResult {
  ok: boolean;
  url?: string; // URL de la página creada en Notion
  duplicated?: boolean; // ya existía una fila con esa idea
  error?: string;
}

// ── Config ────────────────────────────────────────────────────────────────

function normalizeDbId(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 32) return raw; // dejamos que Notion valide
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function notionConfig(): { token: string; dbId: string } | null {
  const token = process.env.NOTION_TOKEN?.trim();
  const dbRaw = process.env.NOTION_DATABASE_ID?.trim();
  if (!token || !dbRaw) return null;
  return { token, dbId: normalizeDbId(dbRaw) };
}

let _client: Client | null = null;
function getClient(token: string): Client {
  if (!_client) _client = new Client({ auth: token });
  return _client;
}

// ── Schema (cacheado en memoria del proceso) ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PropSchema = { name: string; type: string; raw: any };
let _schemaCache: { dbId: string; props: PropSchema[] } | null = null;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function norm(s: string): string {
  return stripAccents(s).toLowerCase().trim();
}

async function getSchema(client: Client, dbId: string): Promise<PropSchema[]> {
  if (_schemaCache && _schemaCache.dbId === dbId) return _schemaCache.props;
  const db = await client.databases.retrieve({ database_id: dbId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = Object.entries((db as any).properties).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ([name, raw]: [string, any]) => ({ name, type: raw.type, raw })
  );
  _schemaCache = { dbId, props };
  return props;
}

// Busca la propiedad que corresponde a un "rol" lógico. El title se detecta por
// tipo; el resto por coincidencia de nombre (sin acentos, case-insensitive).
function findProp(
  props: PropSchema[],
  role: "title" | "engagement" | "fecha" | "tipo" | "guion" | "comentarios"
): PropSchema | undefined {
  if (role === "title") return props.find((p) => p.type === "title");
  const matchers: Record<string, (n: string) => boolean> = {
    engagement: (n) => n.includes("engagement") || n.includes("er"),
    fecha: (n) => n.includes("fecha") || n.includes("publicacion"),
    tipo: (n) => n === "tipo" || n.includes("tipo") || n.includes("etiqueta"),
    guion: (n) => n.includes("guion"),
    comentarios: (n) => n.includes("comentario") || n.includes("nota"),
  };
  const m = matchers[role];
  return props.find((p) => m(norm(p.name)));
}

// ── Constructores de valor según el tipo real de la columna ─────────────────

function textChunk(s: string) {
  return [{ type: "text" as const, text: { content: s.slice(0, 2000) } }];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTextLike(prop: PropSchema, value: string): any {
  switch (prop.type) {
    case "title":
      return { title: textChunk(value) };
    case "rich_text":
      return { rich_text: textChunk(value) };
    case "select":
      return { select: { name: value.slice(0, 100) } };
    case "multi_select":
      return { multi_select: [{ name: value.slice(0, 100) }] };
    case "status":
      return { status: { name: value.slice(0, 100) } };
    case "url":
      return { url: value };
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEngagement(prop: PropSchema, erPercent: number): any {
  if (prop.type === "number") {
    // Notion multiplica ×100 al mostrar formato "percent": para ver 442.16%
    // debemos guardar 4.4216. Cualquier otro formato → guardamos el número tal cual.
    const isPercent = prop.raw?.number?.format === "percent";
    return { number: isPercent ? erPercent / 100 : erPercent };
  }
  // Columna de texto / título / select → mandamos "442.16 %"
  return buildTextLike(prop, `${erPercent.toFixed(2)} %`);
}

// ── API pública ─────────────────────────────────────────────────────────────

export async function pushIdeaToNotion(
  payload: IdeaPayload
): Promise<PushResult> {
  const cfg = notionConfig();
  if (!cfg) {
    return {
      ok: false,
      error:
        "Notion no configurado. Falta NOTION_TOKEN y/o NOTION_DATABASE_ID en .env.",
    };
  }

  const client = getClient(cfg.token);

  let props: PropSchema[];
  try {
    props = await getSchema(client, cfg.dbId);
  } catch (e) {
    return {
      ok: false,
      error: `No pude leer la base de datos de Notion (¿la compartiste con la integración?): ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  const titleProp = findProp(props, "title");
  if (!titleProp) {
    return { ok: false, error: "La DB de Notion no tiene columna de título." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};
  properties[titleProp.name] = buildTextLike(titleProp, payload.idea);

  if (payload.engagementRate != null) {
    const p = findProp(props, "engagement");
    if (p) {
      const v = buildEngagement(p, payload.engagementRate);
      if (v) properties[p.name] = v;
    }
  }

  if (payload.fechaISO) {
    const p = findProp(props, "fecha");
    if (p && p.type === "date") {
      properties[p.name] = { date: { start: payload.fechaISO } };
    }
  }

  if (payload.tipo) {
    const p = findProp(props, "tipo");
    if (p) {
      const v = buildTextLike(p, payload.tipo);
      if (v) properties[p.name] = v;
    }
  }

  if (payload.guion) {
    const p = findProp(props, "guion");
    if (p) {
      const v = buildTextLike(p, payload.guion);
      if (v) properties[p.name] = v;
    }
  }

  if (payload.comentarios) {
    const p = findProp(props, "comentarios");
    if (p) {
      const v = buildTextLike(p, payload.comentarios);
      if (v) properties[p.name] = v;
    }
  }

  // Dedupe: si ya hay una fila con esta misma idea, no creamos otra.
  try {
    const existing = await client.databases.query({
      database_id: cfg.dbId,
      filter: {
        property: titleProp.name,
        title: { equals: payload.idea.slice(0, 2000) },
      },
      page_size: 1,
    });
    if (existing.results.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const url = (existing.results[0] as any).url as string | undefined;
      return { ok: true, duplicated: true, url };
    }
  } catch {
    // Si el filtro falla (columna renombrada, etc.) seguimos e insertamos igual.
  }

  try {
    const page = await client.pages.create({
      parent: { database_id: cfg.dbId },
      properties,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { ok: true, url: (page as any).url };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
