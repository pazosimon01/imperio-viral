// Job tracking en Postgres. Permite lanzar scrapes desde la app y consultar
// el estado vía polling. No hay queue real — los jobs corren en paralelo
// dentro del proceso Node de Next.js. input/result son jsonb nativos.

import { randomUUID } from "node:crypto";
import { query, queryOne, getWorkspaceId } from "./db";
import { getActiveNicheId } from "./niches";

export type JobType = "profile" | "hashtag" | "enrich";
export type JobStatus = "running" | "done" | "failed";

export interface Job {
  id: string;
  type: JobType;
  input: any;
  status: JobStatus;
  message: string | null;
  result: any | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export async function createJob(
  type: JobType,
  input: any,
  message?: string
): Promise<string> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const id = randomUUID();
  await query(
    `INSERT INTO jobs (id, workspace_id, niche_id, type, input, status, message, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      wsId,
      nicheId,
      type,
      input ?? {},
      "running",
      message ?? null,
      Math.floor(Date.now() / 1000),
    ]
  );
  return id;
}

export async function updateJobMessage(id: string, message: string): Promise<void> {
  await query("UPDATE jobs SET message = $1 WHERE id = $2", [message, id]);
}

export async function finishJob(
  id: string,
  status: "done" | "failed",
  payload: { result?: any; error?: string; message?: string } = {}
): Promise<void> {
  await query(
    `UPDATE jobs SET
       status      = $1,
       result      = $2,
       error       = $3,
       message     = COALESCE($4, message),
       finished_at = $5
     WHERE id = $6`,
    [
      status,
      payload.result ?? null,
      payload.error ?? null,
      payload.message ?? null,
      Math.floor(Date.now() / 1000),
      id,
    ]
  );
}

export async function getJob(id: string): Promise<Job | null> {
  const r = await queryOne<any>("SELECT * FROM jobs WHERE id = $1", [id]);
  if (!r) return null;
  return rowToJob(r);
}

export async function listRecentJobs(limit = 10): Promise<Job[]> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const rows = await query<any>(
    "SELECT * FROM jobs WHERE workspace_id = $1 AND niche_id = $2 ORDER BY started_at DESC LIMIT $3",
    [wsId, nicheId, limit]
  );
  return rows.map(rowToJob);
}

function rowToJob(r: any): Job {
  return {
    id: r.id,
    type: r.type,
    input: r.input,
    status: r.status,
    message: r.message,
    result: r.result,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}
