// Motor de barrido de perfiles (análisis rápido). Escanea una lista de
// usernames con concurrencia + reintentos ante rate-limit, y devuelve los
// posts con su owner. Es la misma lógica que usa /api/multi-batch, extraída
// aquí para poder reusarla también desde el job en segundo plano del servidor
// (ver lib/multi-jobs.ts) sin depender del navegador.

import { fetchProfileFast, IgFastError, PROXY_ENABLED } from "@/lib/ig-fast";

// Concurrencia: con proxy RESIDENCIAL (Evomi) cada petición sale por una IP
// distinta, así que el paralelismo alto NO dispara los bloqueos de IG. El valor
// 3 venía de la era del proxy datacenter (~50% bloqueos); medido 2026-07-23:
// residencial tarda 2.6-5.3s/petición → un perfil n=48 son ~50s; con 3 en
// paralelo, 81 perfiles = ~22 min. Con 10 → ~7 min. Sin proxy seguimos en 2.
export const CONCURRENCY = PROXY_ENABLED ? 10 : 2;
const MAX_RETRIES = 3;
// Con proxy ROTATIVO cada reintento ya sale por IP fresca — no hace falta
// "enfriar" 10s (eso era para IP fija). Los bloqueos persistentes los cubren
// las pasadas de recuperación de multi-jobs (45s/90s).
const RETRY_PAUSE_MS = PROXY_ENABLED ? 2_000 : 15_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScanPost = any;

export interface ScanResult {
  posts: ScanPost[];
  errors: string[]; // "@usuario" que falló (todos) — compat
  failed: FailedProfile[]; // fallos con su causa clasificada
  rateLimited: boolean;
}

// Causa de fallo. `rate_limited` y `network` son TRANSITORIOS (Instagram limitó
// la IP o hubo un corte) → se pueden reintentar y suelen recuperarse. `not_found`
// y `private` son PERMANENTES (la cuenta no existe o es privada).
export type FailReason = "rate_limited" | "network" | "not_found" | "private";
export interface FailedProfile {
  username: string;
  reason: FailReason;
}
export const RETRIABLE_REASONS: FailReason[] = ["rate_limited", "network"];

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

function pause(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type FetchResult = {
  u: string;
  r: Awaited<ReturnType<typeof fetchProfileFast>> | null;
  code: string | null;
};

// Escanea un grupo de usernames (idealmente ≤30 por llamada). Reintenta los
// que caen por rate-limit hasta MAX_RETRIES con pausas crecientes.
export async function scanUsernames(
  usernames: string[],
  n: number
): Promise<ScanResult> {
  const posts: ScanPost[] = [];
  const failed: FailedProfile[] = [];
  let rateLimited = false;

  let pending = usernames;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (pending.length === 0) break;

    if (attempt > 0) {
      await pause(RETRY_PAUSE_MS * attempt);
    }

    const results = await mapLimit(
      pending,
      CONCURRENCY,
      async (u): Promise<FetchResult> => {
        try {
          const r = await fetchProfileFast(u, n);
          return { u, r, code: null };
        } catch (e) {
          return {
            u,
            r: null,
            code: e instanceof IgFastError ? e.code : "error",
          };
        }
      }
    );

    const retryList: string[] = [];
    const isLast = attempt >= MAX_RETRIES;

    for (const { u, r, code } of results) {
      // Transitorios: rate-limit o red → reintentar en la tanda; si se agotan
      // los intentos, quedan marcados como TRANSITORIOS (reintentables luego).
      if (code === "rate_limited" || code === "network" || code === "parse" || code === "error") {
        if (code === "rate_limited") rateLimited = true;
        if (!isLast) {
          retryList.push(u);
        } else {
          failed.push({ username: u, reason: code === "rate_limited" ? "rate_limited" : "network" });
        }
        continue;
      }
      // Permanentes: la cuenta no existe.
      if (code === "not_found") {
        failed.push({ username: u, reason: "not_found" });
        continue;
      }
      // Éxito pero cuenta privada → permanente.
      if (!r || r.profile.isPrivate) {
        failed.push({ username: u, reason: "private" });
        continue;
      }
      for (const p of r.posts) {
        posts.push({
          ...p,
          ownerUsername: r.profile.username,
          ownerFollowers: r.profile.followers,
        });
      }
    }

    pending = retryList;
  }

  const errors = failed.map((f) => `@${f.username}`);
  return { posts, errors, failed, rateLimited };
}
