// DESCUBRIMIENTO de perfiles de nicho — reemplazo anónimo de la extensión de
// Chrome. Dos motores:
//   1. RELACIONADOS (gratis, anónimo): IG devuelve edge_related_profiles por
//      cuenta. Encadenando (bola de nieve) desde 1-3 semillas salen cientos.
//   2. APIFY (opcional): hashtag scrape para volumen extra.
// El barrido corre en el servidor (la Mac) como job; el celular solo consulta.

import { randomUUID } from "crypto";
import { igFetchJson } from "./ig-fast";

const IG_APP_ID = "936619743392459";

export interface DiscoveredProfile {
  username: string;
  fullName: string | null;
  isVerified: boolean;
  via: string; // semilla desde la que se descubrió
}

function parseSafe(x: unknown): unknown {
  return x;
}

// Perfiles relacionados de UNA cuenta (anónimo). Devuelve [] si IG no responde.
export async function fetchRelated(username: string): Promise<DiscoveredProfile[]> {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return [];
  try {
    const j = await igFetchJson(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`
    );
    const user = j?.data?.user;
    if (!user) return [];
    parseSafe(user);
    const edges = user.edge_related_profiles?.edges ?? [];
    const out: DiscoveredProfile[] = [];
    for (const e of edges) {
      const n = e?.node;
      if (!n?.username) continue;
      out.push({
        username: String(n.username).toLowerCase(),
        fullName: n.full_name || null,
        isVerified: !!n.is_verified,
        via: clean,
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Job de descubrimiento (bola de nieve) ───────────────────────────────────

const MAX_DEPTH = 3;
// Cuántas cuentas exploramos EN PARALELO por tanda. Con proxy rotativo cada
// request sale por otra IP, así que el paralelismo no dispara el rate-limit y
// multiplica la velocidad (cientos de perfiles en ~10s en vez de ~40s).
const BATCH_SIZE = 6;
const PER_BATCH_PAUSE_MS = 150;

export interface DiscoverJob {
  id: string;
  target: number;
  seeds: string[];
  found: DiscoveredProfile[];
  frontier: string[]; // cuentas por explorar
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
  try {
    // Explora en anchura, pero cada tanda de cuentas EN PARALELO. El proxy
    // rota IP por request → paralelizar acelera mucho sin gatillar rate-limit.
    let guard = 0;
    const maxGuard = job.target * 3 + 50;
    while (job.found.length < job.target && job.frontier.length > 0 && guard < maxGuard) {
      const batch = job.frontier.splice(0, BATCH_SIZE);
      guard += batch.length;

      const results = await Promise.all(batch.map((u) => fetchRelated(u)));
      job.explored += batch.length;

      for (const related of results) {
        for (const p of related) {
          if (seen.has(p.username)) continue;
          seen.add(p.username);
          job.found.push(p);
          if (job.found.length <= job.target * MAX_DEPTH) {
            job.frontier.push(p.username); // los nuevos alimentan la bola de nieve
          }
          if (job.found.length >= job.target) break;
        }
        if (job.found.length >= job.target) break;
      }
      job.updatedAt = Date.now();
      if (job.found.length < job.target && job.frontier.length > 0) {
        await new Promise((r) => setTimeout(r, PER_BATCH_PAUSE_MS));
      }
    }
  } catch (e) {
    job.error = e instanceof Error ? e.message : "error";
  } finally {
    job.done = true;
    job.updatedAt = Date.now();
  }
}

export function createDiscoverJob(seeds: string[], target: number): DiscoverJob {
  sweep();
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

export function getDiscoverSnapshot(id: string) {
  const job = jobs.get(id);
  if (!job) return null;
  job.updatedAt = Date.now();
  return {
    id: job.id,
    target: job.target,
    found: job.found,
    count: job.found.length,
    explored: job.explored,
    done: job.done,
    error: job.error,
  };
}

export const _IG_APP_ID = IG_APP_ID;
