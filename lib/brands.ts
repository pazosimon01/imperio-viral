// Marcas: la memoria por cliente/negocio. La marca activa se guarda en cookie
// (igual que el nicho) y TODAS las secciones (Cerebro, Creación, Radar) la usan
// para no volver a pedir el contexto ni salir genéricas.

import { cookies } from "next/headers";
import { query, queryOne, getWorkspaceId } from "./db";

const ACTIVE_BRAND_COOKIE = "active_brand";

export interface Brand {
  id: string;
  nombre: string;
  resumen: string;
  createdAt: string;
}

export async function listBrands(): Promise<Brand[]> {
  const wsId = getWorkspaceId();
  const rows = await query<{
    id: string;
    nombre: string;
    resumen: string;
    created_at: string;
  }>(
    `SELECT id, nombre, resumen, created_at
     FROM brands WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [wsId]
  );
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    resumen: r.resumen,
    createdAt: r.created_at,
  }));
}

export async function getBrand(id: string): Promise<Brand | null> {
  const wsId = getWorkspaceId();
  const r = await queryOne<{
    id: string;
    nombre: string;
    resumen: string;
    created_at: string;
  }>(
    `SELECT id, nombre, resumen, created_at
     FROM brands WHERE workspace_id = $1 AND id = $2`,
    [wsId, id]
  );
  if (!r) return null;
  return { id: r.id, nombre: r.nombre, resumen: r.resumen, createdAt: r.created_at };
}

// Marca activa: cookie si es válida; si no, la primera del workspace; o null.
export async function getActiveBrand(): Promise<Brand | null> {
  let cookieId: string | undefined;
  try {
    cookieId = (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;
  } catch {
    cookieId = undefined; // fuera de request scope
  }
  const brands = await listBrands();
  if (brands.length === 0) return null;
  if (cookieId) {
    const found = brands.find((b) => b.id === cookieId);
    if (found) return found;
  }
  return brands[0];
}

export async function createBrand(opts: {
  nombre: string;
  resumen: string;
  userId: string | null;
}): Promise<Brand> {
  const wsId = getWorkspaceId();
  const rows = await query<{
    id: string;
    nombre: string;
    resumen: string;
    created_at: string;
  }>(
    `INSERT INTO brands (workspace_id, user_id, nombre, resumen)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, resumen, created_at`,
    [wsId, opts.userId, opts.nombre.trim(), opts.resumen.trim()]
  );
  const r = rows[0];
  return { id: r.id, nombre: r.nombre, resumen: r.resumen, createdAt: r.created_at };
}
