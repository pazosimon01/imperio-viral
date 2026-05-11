// Nicho activo: cada post, perfil, scrape y job pertenece a un nicho.
// El nicho activo se guarda en cookie (`active_niche=<slug>`) y se resuelve
// a UUID por consulta.

import { cookies } from "next/headers";
import { query, queryOne, getWorkspaceId } from "./db";

const COOKIE_NAME = "active_niche";

export interface Niche {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: string;
}

function rowToNiche(r: any): Niche {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    slug: r.slug,
    color: r.color,
    createdAt: r.created_at,
  };
}

export async function listNiches(): Promise<Niche[]> {
  const wsId = getWorkspaceId();
  const rows = await query<any>(
    "SELECT * FROM niches WHERE workspace_id = $1 ORDER BY created_at ASC",
    [wsId]
  );
  return rows.map(rowToNiche);
}

// Resuelve el nicho activo desde cookie. Si no hay cookie o slug inválido,
// devuelve el primer nicho del workspace (más viejo). Si no hay nichos
// (no debería pasar tras la migración), lanza error.
export async function getActiveNiche(): Promise<Niche> {
  const wsId = getWorkspaceId();
  const c = await cookies();
  const slug = c.get(COOKIE_NAME)?.value;

  if (slug) {
    const row = await queryOne<any>(
      "SELECT * FROM niches WHERE workspace_id = $1 AND slug = $2",
      [wsId, slug]
    );
    if (row) return rowToNiche(row);
  }

  const first = await queryOne<any>(
    "SELECT * FROM niches WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1",
    [wsId]
  );
  if (!first) {
    throw new Error(
      "No hay nichos en este workspace. Algo está mal con la migración."
    );
  }
  return rowToNiche(first);
}

export async function getActiveNicheId(): Promise<string> {
  const n = await getActiveNiche();
  return n.id;
}

// Crear un nicho nuevo. El slug se genera desde el name si no se pasa.
export async function createNiche(opts: {
  name: string;
  slug?: string;
  color?: string;
}): Promise<Niche> {
  const wsId = getWorkspaceId();
  const name = opts.name.trim();
  if (!name) throw new Error("El nombre del nicho no puede estar vacío.");

  const slug = (opts.slug ?? slugify(name)).slice(0, 50);
  if (!slug) throw new Error("Slug inválido para el nicho.");

  const row = await queryOne<any>(
    `INSERT INTO niches (workspace_id, name, slug, color)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [wsId, name, slug, opts.color ?? null]
  );
  if (!row) throw new Error("No se pudo crear el nicho.");
  return rowToNiche(row);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const ACTIVE_NICHE_COOKIE = COOKIE_NAME;
