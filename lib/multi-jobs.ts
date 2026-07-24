// Job en segundo plano para el análisis de MUCHOS perfiles (ej. 1000) desde el
// celular. En vez de que el navegador orqueste las tandas —que en iOS se congela
// al bloquear la pantalla—, el servidor (la Mac) corre TODO el barrido y el
// cliente solo consulta el avance. Sobrevive a bloqueo de pantalla, cambio de
// app y recarga: al volver, se reanuda por jobId.
//
// El store es en memoria del proceso (next start = 1 proceso persistente), con
// RESPALDO EN DISCO (data/jobs/<id>.json) tras cada tanda: si el servidor se
// reinicia a mitad, al volver a consultar el job se rehidrata desde disco, se
// marca como "interrumpido" y la UI ofrece CONTINUAR con los que faltan. Antes
// un reinicio perdía todo el avance y ni sabíamos cuántos quedaron sin analizar.

import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "fs";
import path from "path";
import { scanUsernames } from "@/lib/multi-scan";
import type { ScanPost, FailedProfile } from "@/lib/multi-scan";
import { proxyAuthRecentlyFailed } from "@/lib/ig-fast";

const CHUNK = 15; // perfiles por tanda
const PAUSE_BETWEEN_CHUNKS_MS = 2_500;
// IG pide "espera unos minutos" al bloquear. Las pasadas de recuperación esperan
// de verdad ese tiempo (crece por ronda) para que el bloqueo se levante.
const RECOVERY_PAUSES_MS = [45_000, 90_000]; // hasta 2 rondas de recuperación
const MAX_POSTS = 6_000; // tope en memoria; se guarda el top por engagement
const MAX_USERNAMES = 3_000;
const JOB_TTL_MS = 60 * 60 * 1000; // 1h
const RESPONSE_POSTS_CAP = 2_000; // cuántos posts devolvemos por poll

export interface MultiJob {
  id: string;
  n: number;
  total: number;
  processed: number;
  successCount: number;
  usernames: string[]; // la lista COMPLETA pedida (para saber qué falta)
  analizados: string[]; // usernames realmente analizados con éxito
  posts: ScanPost[];
  // Fallos separados por causa:
  permanentes: string[]; // @usuario inexistente o privado (no se recuperan)
  transitorios: string[]; // @usuario limitado por IP / red (reintentables)
  rateLimited: boolean;
  recovering: boolean; // true durante la pasada de recuperación
  interrumpido: boolean; // true si el server se reinició a mitad (rehidratado de disco)
  done: boolean;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, MultiJob>();

// ── Respaldo en disco ───────────────────────────────────────────────────────
const JOBS_DIR = path.join(process.cwd(), "data", "jobs");
let dirReady = false;
function ensureDir() {
  if (dirReady) return;
  try {
    mkdirSync(JOBS_DIR, { recursive: true });
    dirReady = true;
  } catch {
    /* disco no disponible: seguimos solo en memoria */
  }
}

function fileFor(id: string): string {
  return path.join(JOBS_DIR, `${id}.json`);
}

function saveToDisk(job: MultiJob) {
  ensureDir();
  try {
    writeFileSync(fileFor(job.id), JSON.stringify(job));
  } catch {
    /* best effort */
  }
}

// Rehidrata un job desde disco (tras un reinicio). Si estaba a medias, su
// runner ya no existe → lo marcamos terminado + interrumpido para que la UI
// ofrezca continuar con los que faltan.
function loadFromDisk(id: string): MultiJob | null {
  if (!/^[0-9a-f][0-9a-f-]{20,40}$/i.test(id)) return null; // el id viene de la URL
  try {
    const j = JSON.parse(readFileSync(fileFor(id), "utf8")) as MultiJob;
    if (!j.done) {
      j.done = true;
      j.interrumpido = true;
      j.recovering = false;
    }
    j.updatedAt = Date.now();
    jobs.set(j.id, j);
    saveToDisk(j);
    return j;
  } catch {
    return null;
  }
}

function sweepOld() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.updatedAt > JOB_TTL_MS) jobs.delete(id);
  }
  // Limpieza best-effort de archivos viejos (mismo TTL).
  ensureDir();
  try {
    for (const f of readdirSync(JOBS_DIR)) {
      const p = path.join(JOBS_DIR, f);
      try {
        if (now - statSync(p).mtimeMs > JOB_TTL_MS) unlinkSync(p);
      } catch {
        /* noop */
      }
    }
  } catch {
    /* noop */
  }
}

function capPosts(posts: ScanPost[]): ScanPost[] {
  if (posts.length <= MAX_POSTS) return posts;
  posts.sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1));
  posts.length = MAX_POSTS;
  return posts;
}

function classifyInto(
  job: MultiJob,
  failed: FailedProfile[],
  permanentSet: Set<string>,
  retrySet: Set<string>
) {
  for (const f of failed) {
    if (f.reason === "rate_limited" || f.reason === "network") {
      retrySet.add(f.username);
    } else {
      permanentSet.add(f.username);
      retrySet.delete(f.username);
    }
  }
}

async function scanChunks(
  job: MultiJob,
  usernames: string[],
  n: number,
  okSet: Set<string>,
  permanentSet: Set<string>,
  retrySet: Set<string>,
  countProcessed: boolean
) {
  for (let i = 0; i < usernames.length; i += CHUNK) {
    const chunk = usernames.slice(i, i + CHUNK);
    const { posts, failed, rateLimited } = await scanUsernames(chunk, n);

    if (rateLimited) job.rateLimited = true;
    if (posts.length > 0) job.posts = capPosts(job.posts.concat(posts));

    // Los que NO fallaron en esta tanda son éxito real (analizados).
    const failedUsers = new Set(failed.map((f) => f.username));
    for (const u of chunk) {
      if (!failedUsers.has(u)) {
        okSet.add(u);
        retrySet.delete(u); // por si venía de un reintento
      }
    }
    classifyInto(job, failed, permanentSet, retrySet);

    job.successCount = okSet.size; // SOLO perfiles realmente analizados
    job.analizados = [...okSet];
    job.permanentes = [...permanentSet].map((u) => `@${u}`);
    job.transitorios = [...retrySet].map((u) => `@${u}`);
    if (countProcessed) job.processed += chunk.length;
    job.updatedAt = Date.now();
    saveToDisk(job); // respaldo: un reinicio no pierde el avance

    if (i + CHUNK < usernames.length) {
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_CHUNKS_MS));
    }
  }
}

async function runJob(job: MultiJob, usernames: string[], n: number) {
  const okSet = new Set<string>();
  const permanentSet = new Set<string>();
  const retrySet = new Set<string>();
  try {
    // Pasada principal.
    await scanChunks(job, usernames, n, okSet, permanentSet, retrySet, true);

    // Pasadas de RECUPERACIÓN: reintenta los transitorios (rate-limit/red) con
    // IPs frescas del proxy y pausas crecientes (IG pide "espera unos minutos").
    // Recupera la mayoría en 1-2 rondas.
    for (const pauseMs of RECOVERY_PAUSES_MS) {
      if (retrySet.size === 0) break;
      job.recovering = true;
      job.updatedAt = Date.now();
      await new Promise((r) => setTimeout(r, pauseMs));
      const retryList = [...retrySet];
      await scanChunks(job, retryList, n, okSet, permanentSet, retrySet, false);
    }
    job.recovering = false;
  } catch (e) {
    job.error = e instanceof Error ? e.message : "error";
  } finally {
    job.done = true;
    job.updatedAt = Date.now();
    saveToDisk(job);
  }
}

export function createMultiJob(usernames: string[], n: number): MultiJob {
  sweepOld();
  const list = usernames.slice(0, MAX_USERNAMES);
  const job: MultiJob = {
    id: randomUUID(),
    n,
    total: list.length,
    processed: 0,
    successCount: 0,
    usernames: list,
    analizados: [],
    posts: [],
    permanentes: [],
    transitorios: [],
    rateLimited: false,
    recovering: false,
    interrumpido: false,
    done: list.length === 0,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  saveToDisk(job);
  // Fire-and-forget: el proceso de Next sigue vivo (server persistente), así que
  // la tarea async continúa en el event loop aunque ya respondimos el POST.
  if (list.length > 0) void runJob(job, list, n);
  return job;
}

// Snapshot para el poll. Devuelve los posts ordenados por engagement y
// acotados, para no mandar megabytes en cada consulta desde el celular.
export function getMultiJobSnapshot(id: string) {
  // Memoria primero; si no está (reinicio del server), rehidratamos de disco.
  const job = jobs.get(id) ?? loadFromDisk(id);
  if (!job) return null;
  job.updatedAt = Date.now(); // el poll cuenta como actividad → no expira mientras lo miras
  const sorted = [...job.posts].sort(
    (a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1)
  );

  // Qué perfiles FALTAN de la lista original: ni analizados ni permanentes.
  // (Solo se calcula al terminar; incluye los transitorios y los nunca tocados.)
  let faltantes: string[] = [];
  if (job.done) {
    const cubiertos = new Set([
      ...(job.analizados ?? []),
      ...job.permanentes.map((u) => u.replace(/^@/, "")),
    ]);
    faltantes = (job.usernames ?? []).filter((u) => !cubiertos.has(u));
  }

  return {
    id: job.id,
    total: job.total,
    processed: job.processed,
    successCount: job.successCount,
    permanentes: job.permanentes,
    transitorios: job.transitorios,
    permanentesCount: job.permanentes.length,
    transitoriosCount: job.transitorios.length,
    rateLimited: job.rateLimited,
    proxySinSaldo: proxyAuthRecentlyFailed(), // proxy rechazó auth (407) → sin saldo
    recovering: job.recovering,
    interrumpido: job.interrumpido,
    faltantes,
    faltantesCount: faltantes.length,
    done: job.done,
    error: job.error,
    postsTruncated: sorted.length > RESPONSE_POSTS_CAP,
    posts: sorted.slice(0, RESPONSE_POSTS_CAP),
  };
}
