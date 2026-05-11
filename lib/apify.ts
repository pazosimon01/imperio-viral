// Cliente de Apify y wrapper sobre el actor instagram-hashtag-scraper.
//
// Inputs aceptados (verificados con npm run inspect-actor):
//   - hashtags:     string[]     Lista de hashtags (con o sin #)
//   - resultsType:  "posts" | "reels" | "stories"
//                   "posts" devuelve fotos y carruseles (Image + Sidecar).
//                   "reels" devuelve solo reels (Video) con métricas de views.
//   - resultsLimit: number       Items por hashtag.

import { ApifyClient } from "apify-client";
import type { ApifyHashtagItem } from "./types";

const ACTOR_ID = "apify/instagram-hashtag-scraper";
const PROFILE_ACTOR_ID = "apify/instagram-scraper";

export type ResultsType = "posts" | "reels";

export interface RunHashtagScrapeOptions {
  hashtags: string[];
  resultsType: ResultsType;
  resultsLimit: number;
}

export interface ScrapeResult {
  runId: string;
  items: ApifyHashtagItem[];
  resultsType: ResultsType;
}

export async function runHashtagScrape(
  opts: RunHashtagScrapeOptions
): Promise<ScrapeResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token || token.startsWith("PEGA_AQUI")) {
    throw new Error(
      "APIFY_TOKEN no está configurado. Edita .env y pega tu token de Apify."
    );
  }

  const client = new ApifyClient({ token });

  const cleanHashtags = opts.hashtags
    .map((h) => h.trim().replace(/^#+/, ""))
    .filter((h) => h.length > 0);

  if (cleanHashtags.length === 0) {
    throw new Error("Pasa al menos un hashtag.");
  }

  const input = {
    hashtags: cleanHashtags,
    resultsType: opts.resultsType,
    resultsLimit: opts.resultsLimit,
  };

  console.log(
    `→ Apify ${ACTOR_ID}  type=${opts.resultsType}  hashtags=[${cleanHashtags.join(",")}]  limit=${opts.resultsLimit}`
  );

  const run = await client.actor(ACTOR_ID).call(input);
  console.log(`  runId=${run.id}  status=${run.status}`);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return {
    runId: run.id,
    items: items as unknown as ApifyHashtagItem[],
    resultsType: opts.resultsType,
  };
}

// --- Profile scraper ---

export interface RunProfileScrapeOptions {
  usernames: string[];
  resultsLimit: number;
  // Date ISO (YYYY-MM-DD). Apify ignora posts más viejos que esta fecha.
  // Para incremental: pasar last_scraped_at - 1 día.
  // Para primer scrape: pasar 1 año atrás (cutoff duro).
  onlyPostsNewerThan?: string;
}

export interface ProfileScrapeResult {
  runId: string;
  items: ApifyHashtagItem[];
}

// Normaliza un input (URL o username) a username puro.
// Acepta: "pedrosobral", "@pedrosobral",
//         "https://www.instagram.com/pedrosobral/", "instagram.com/pedrosobral".
export function extractUsername(input: string): string {
  const cleaned = input.trim().replace(/^@/, "");
  const urlMatch = cleaned.match(/instagram\.com\/([^\/\?#]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return cleaned.toLowerCase();
}

// Scrape de "detalles de perfil" — solo metadata, sin posts. Mucho más
// barato (1 item por perfil en vez de N posts). Útil para enriquecer
// followers/bio de autores descubiertos vía hashtag.
export async function runProfileDetailsScrape(opts: {
  usernames: string[];
}): Promise<{ runId: string; items: any[] }> {
  const token = process.env.APIFY_TOKEN;
  if (!token || token.startsWith("PEGA_AQUI")) {
    throw new Error("APIFY_TOKEN no está configurado.");
  }

  const usernames = opts.usernames
    .map((u) => extractUsername(u))
    .filter((u) => u.length > 0);
  if (usernames.length === 0) throw new Error("Pasa al menos un perfil.");

  const directUrls = usernames.map((u) => `https://www.instagram.com/${u}/`);
  const input = {
    directUrls,
    resultsType: "details",
    resultsLimit: 1,
    addParentData: false,
  };

  console.log(
    `→ Apify ${PROFILE_ACTOR_ID}  details=${usernames.length} perfil(es)`
  );

  const client = new ApifyClient({ token });
  const run = await client.actor(PROFILE_ACTOR_ID).call(input);
  console.log(`  runId=${run.id}  status=${run.status}`);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { runId: run.id, items: items as any[] };
}

// Refresh de UN solo post — útil cuando la URL firmada del video caducó.
// El actor de profile acepta directUrls con URLs de posts puntuales
// (no solo de perfiles) y devuelve solo ese item.
export async function runPostScrape(
  postUrl: string
): Promise<{ runId: string; items: ApifyHashtagItem[] }> {
  const token = process.env.APIFY_TOKEN;
  if (!token || token.startsWith("PEGA_AQUI")) {
    throw new Error("APIFY_TOKEN no está configurado.");
  }
  const input = {
    directUrls: [postUrl],
    resultsType: "posts",
    resultsLimit: 1,
    addParentData: true,
  };
  console.log(`→ Apify ${PROFILE_ACTOR_ID}  refresh  ${postUrl}`);
  const client = new ApifyClient({ token });
  const run = await client.actor(PROFILE_ACTOR_ID).call(input);
  console.log(`  runId=${run.id}  status=${run.status}`);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { runId: run.id, items: items as unknown as ApifyHashtagItem[] };
}

export async function runProfileScrape(
  opts: RunProfileScrapeOptions
): Promise<ProfileScrapeResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token || token.startsWith("PEGA_AQUI")) {
    throw new Error("APIFY_TOKEN no está configurado.");
  }

  const usernames = opts.usernames
    .map((u) => extractUsername(u))
    .filter((u) => u.length > 0);
  if (usernames.length === 0) throw new Error("Pasa al menos un perfil.");

  const directUrls = usernames.map((u) => `https://www.instagram.com/${u}/`);

  const input: Record<string, unknown> = {
    directUrls,
    resultsType: "posts",
    resultsLimit: opts.resultsLimit,
    addParentData: true,
  };
  if (opts.onlyPostsNewerThan) {
    input.onlyPostsNewerThan = opts.onlyPostsNewerThan;
  }

  console.log(
    `→ Apify ${PROFILE_ACTOR_ID}  perfiles=[${usernames.join(",")}]` +
      `  limit=${opts.resultsLimit}` +
      (opts.onlyPostsNewerThan ? `  desde=${opts.onlyPostsNewerThan}` : "")
  );

  const client = new ApifyClient({ token });
  const run = await client.actor(PROFILE_ACTOR_ID).call(input);
  console.log(`  runId=${run.id}  status=${run.status}`);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  return {
    runId: run.id,
    items: items as unknown as ApifyHashtagItem[],
  };
}
