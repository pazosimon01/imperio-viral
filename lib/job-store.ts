// Persistencia de jobs en DB (tabla app_jobs). Los jobs corren en memoria del
// proceso, pero su SNAPSHOT se guarda aquí: sobrevive reinicios locales Y
// redespliegues de Railway (cada push redespliega y antes borraba todo).
// Escrituras fire-and-forget con throttle — jamás frenan el barrido.

import { query, queryOne, getWorkspaceId } from "./db";

const lastSave = new Map<string, number>();
const MIN_SAVE_INTERVAL_MS = 5_000;
const JOB_ROW_TTL_H = 24;

// Guarda (upsert) el estado de un job. No bloquea: errores solo se logean.
export function persistJob(
  kind: "radar" | "discover" | "pesca",
  id: string,
  state: unknown,
  done: boolean
): void {
  const key = `${kind}:${id}`;
  const now = Date.now();
  if (!done && now - (lastSave.get(key) ?? 0) < MIN_SAVE_INTERVAL_MS) return;
  lastSave.set(key, now);
  void (async () => {
    try {
      await query(
        `INSERT INTO app_jobs (id, workspace_id, kind, state, done, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (id) DO UPDATE
           SET state = EXCLUDED.state, done = EXCLUDED.done, updated_at = now()`,
        [id, getWorkspaceId(), kind, state, done]
      );
    } catch (e) {
      console.warn("[job-store] no se pudo guardar:", e instanceof Error ? e.message : e);
    }
  })();
}

export async function loadJobFromDb<T>(
  kind: "radar" | "discover" | "pesca",
  id: string
): Promise<T | null> {
  if (!/^[0-9a-f][0-9a-f-]{20,40}$/i.test(id)) return null; // el id viene de la URL
  try {
    const row = await queryOne<{ state: T }>(
      `SELECT state FROM app_jobs WHERE id = $1 AND kind = $2`,
      [id, kind]
    );
    return row?.state ?? null;
  } catch (e) {
    console.warn("[job-store] no se pudo leer:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Limpieza best-effort de filas viejas (se llama al crear jobs nuevos).
export function sweepJobRows(): void {
  void (async () => {
    try {
      await query(`DELETE FROM app_jobs WHERE updated_at < now() - interval '${JOB_ROW_TTL_H} hours'`);
    } catch {
      /* noop */
    }
  })();
}
