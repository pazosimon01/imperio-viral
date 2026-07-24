// DESCUBRIMIENTO de perfiles de nicho a partir de 1-3 cuentas de ejemplo.
// Motor HÍBRIDO con plan B automático (nunca "se queda en cero"):
//   FASE 1 — RELACIONADOS (gratis, anónimo, segundos): IG devuelve
//     edge_related_profiles por cuenta; bola de nieve en paralelo. Funciona
//     bien con cuentas grandes; con cuentas chicas (belleza local) IG no
//     sugiere nada.
//   FASE 2 — HASHTAGS DEL PERFIL (automática si la fase 1 rinde poco):
//     de los captions/bio de la misma cuenta semilla sacamos los hashtags que
//     usa, y buscamos por esos hashtags vía Apify (~30-60s). Así "dame un
//     perfil y encuéntrame parecidos" SIEMPRE devuelve resultados.
// El barrido corre en el servidor como job; el celular solo consulta.

import { randomUUID } from "crypto";
import { igFetchJson } from "./ig-fast";
import { runHashtagScrape } from "./apify";
import { persistJob, loadJobFromDb, sweepJobRows } from "./job-store";

const IG_APP_ID = "936619743392459";

export interface DiscoveredProfile {
  username: string;
  fullName: string | null;
  isVerified: boolean;
  via: string; // semilla o #hashtag desde el que se descubrió
}

interface SeedInfo {
  related: DiscoveredProfile[];
  hashtags: string[]; // hashtags que usa la cuenta en sus últimos posts + bio
}

function extractHashtags(texts: Array<string | null | undefined>): string[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(/#([\p{L}\p{N}_]{3,40})/gu)) {
      const tag = m[1].toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

// Info de UNA cuenta en un solo request: relacionados + hashtags que usa.
async function fetchSeedInfo(username: string): Promise<SeedInfo> {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return { related: [], hashtags: [] };
  try {
    const j = await igFetchJson(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`
    );
    const user = j?.data?.user;
    if (!user) return { related: [], hashtags: [] };

    const related: DiscoveredProfile[] = [];
    for (const e of user.edge_related_profiles?.edges ?? []) {
      const n = e?.node;
      if (!n?.username) continue;
      related.push({
        username: String(n.username).toLowerCase(),
        fullName: n.full_name || null,
        isVerified: !!n.is_verified,
        via: clean,
      });
    }

    const captions: string[] = [user.biography || ""];
    for (const e of user.edge_owner_to_timeline_media?.edges ?? []) {
      const cap = e?.node?.edge_media_to_caption?.edges?.[0]?.node?.text;
      if (cap) captions.push(cap);
    }
    return { related, hashtags: extractHashtags(captions) };
  } catch {
    return { related: [], hashtags: [] };
  }
}

// Compat: solo los relacionados (lo usa la bola de nieve para los no-semilla).
export async function fetchRelated(username: string): Promise<DiscoveredProfile[]> {
  return (await fetchSeedInfo(username)).related;
}

// ── Job de descubrimiento ───────────────────────────────────────────────────

const MAX_DEPTH = 3;
const BATCH_SIZE = 6; // paralelo: el proxy rota IP por request
const PER_BATCH_PAUSE_MS = 150;
// Si la bola de nieve rinde menos que esto, pasamos al plan B (hashtags).
const MIN_ACEPTABLE = 20;
const MAX_TAGS_PLAN_B = 6;

export interface DiscoverJob {
  id: string;
  target: number;
  seeds: string[];
  fase: "parecidas" | "hashtags" | "lista";
  usedHashtags: string[]; // hashtags del plan B (para mostrar en la UI)
  found: DiscoveredProfile[];
  frontier: string[];
  explored: number;
  done: boolean;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const jobs = new Map<string, DiscoverJob>();
const JOB_TTL_MS = 60 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.updatedAt > JOB_TTL_MS) jobs.delete(id);
}

async function runDiscover(job: DiscoverJob) {
  const seen = new Set<string>(job.seeds.map((s) => s.toLowerCase()));
  const seedHashtags: string[] = [];
  try {
    // ── FASE 1: bola de nieve de relacionados (paralela) ──
    // La primera tanda son las semillas: de ellas también sacamos hashtags
    // (mismo request) por si toca activar el plan B.
    let first = true;
    let guard = 0;
    const maxGuard = job.target * 3 + 50;
    while (job.found.length < job.target && job.frontier.length > 0 && guard < maxGuard) {
      const batch = job.frontier.splice(0, BATCH_SIZE);
      guard += batch.length;

      let relatedLists: DiscoveredProfile[][];
      if (first) {
        const infos = await Promise.all(batch.map((u) => fetchSeedInfo(u)));
        for (const info of infos) seedHashtags.push(...info.hashtags.slice(0, 8));
        relatedLists = infos.map((i) => i.related);
        first = false;
      } else {
        relatedLists = await Promise.all(batch.map((u) => fetchRelated(u)));
      }
      job.explored += batch.length;

      for (const related of relatedLists) {
        for (const p of related) {
          if (seen.has(p.username)) continue;
          seen.add(p.username);
          job.found.push(p);
          if (job.found.length <= job.target * MAX_DEPTH) {
            job.frontier.push(p.username);
          }
          if (job.found.length >= job.target) break;
        }
        if (job.found.length >= job.target) break;
      }
      job.updatedAt = Date.now();
      persistJob("discover", job.id, job, job.done);
      if (job.found.length < job.target && job.frontier.length > 0) {
        await new Promise((r) => setTimeout(r, PER_BATCH_PAUSE_MS));
      }
    }

    // ── FASE 2 (plan B automático): hashtags del propio perfil ──
    // Si IG no sugirió (casi) nada — típico con cuentas chicas — buscamos por
    // los hashtags que la cuenta semilla usa en sus posts. Nunca "queda en 0".
    if (job.found.length < Math.min(MIN_ACEPTABLE, job.target)) {
      const tags = [...new Set(seedHashtags)].slice(0, MAX_TAGS_PLAN_B);
      if (tags.length > 0) {
        job.fase = "hashtags";
        job.usedHashtags = tags;
        job.updatedAt = Date.now();
        try {
          const { items } = await runHashtagScrape({
            hashtags: tags,
            resultsType: "posts",
            resultsLimit: 40,
          });
          for (const it of items) {
            const u = it.ownerUsername?.toLowerCase();
            if (!u || seen.has(u)) continue;
            seen.add(u);
            job.found.push({
              username: u,
              fullName: it.ownerFullName ?? null,
              isVerified: false,
              via: `#${tags[0]}…`,
            });
            if (job.found.length >= job.target) break;
          }
        } catch (e) {
          // Apify caído/sin saldo: reportamos lo que haya, con error visible.
          if (job.found.length === 0) {
            job.error = e instanceof Error ? e.message : "error en la búsqueda por hashtags";
          }
        }
      }
    }
  } catch (e) {
    job.error = e instanceof Error ? e.message : "error";
  } finally {
    job.fase = "lista";
    job.done = true;
    job.updatedAt = Date.now();
    persistJob("discover", job.id, job, true);
  }
}

export function createDiscoverJob(seeds: string[], target: number): DiscoverJob {
  sweep();
  sweepJobRows();
  const cleanSeeds = Array.from(
    new Set(
      seeds
        .map((s) => s.trim().replace(/^@/, "").replace(/^https?:\/\/.*instagram\.com\//i, "").replace(/\/+$/, "").toLowerCase())
        .filter(Boolean)
    )
  );
  const job: DiscoverJob = {
    id: randomUUID(),
    target: Math.min(1000, Math.max(10, target)),
    seeds: cleanSeeds,
    fase: "parecidas",
    usedHashtags: [],
    found: [],
    frontier: [...cleanSeeds],
    explored: 0,
    done: cleanSeeds.length === 0,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  if (cleanSeeds.length > 0) void runDiscover(job);
  return job;
}

export async function getDiscoverSnapshot(id: string) {
  let job = jobs.get(id);
  if (!job) {
    // Reinicio/redespliegue: rehidratar de DB. El runner ya no existe → si
    // estaba a medias, se marca terminado con lo que alcanzó a juntar.
    const fromDb = await loadJobFromDb<DiscoverJob>("discover", id);
    if (!fromDb) return null;
    if (!fromDb.done) {
      fromDb.done = true;
      fromDb.fase = "lista";
    }
    jobs.set(fromDb.id, fromDb);
    job = fromDb;
  }
  job.updatedAt = Date.now();
  return {
    id: job.id,
    target: job.target,
    fase: job.fase,
    usedHashtags: job.usedHashtags,
    found: job.found,
    count: job.found.length,
    explored: job.explored,
    done: job.done,
    error: job.error,
  };
}

export const _IG_APP_ID = IG_APP_ID;
