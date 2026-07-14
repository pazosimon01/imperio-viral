// Historial de búsquedas PERSISTENTE en disco (no se borra al salir). Se guarda
// en data/saved-searches.json del proyecto, así sobrevive reinicios del server.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const FILE = path.join(process.cwd(), "data", "saved-searches.json");

export interface SavedSearch {
  id: string;
  type: "profile" | "multi";
  label: string; // ej "@pedrosobral" o "3 perfiles"
  href: string; // ruta para reabrir (ej "/a/pedrosobral?n=48")
  createdAt: number;
}

async function readAll(): Promise<SavedSearch[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeAll(list: SavedSearch[]): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  // Escritura atómica para no corromper el archivo si se interrumpe.
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(list, null, 2));
  await fs.rename(tmp, FILE);
}

export async function listSearches(): Promise<SavedSearch[]> {
  const all = await readAll();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

// Registra (o actualiza) una búsqueda. Dedup por href: si ya existe, la mueve
// arriba con fecha nueva en vez de duplicar.
export async function recordSearch(
  s: Omit<SavedSearch, "id" | "createdAt">
): Promise<void> {
  try {
    const all = await readAll();
    const rest = all.filter((x) => x.href !== s.href);
    rest.unshift({ ...s, id: randomUUID(), createdAt: Date.now() });
    await writeAll(rest.slice(0, 300));
  } catch {
    // nunca romper la página por un fallo al guardar el historial
  }
}

export async function deleteSearch(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter((x) => x.id !== id));
}
