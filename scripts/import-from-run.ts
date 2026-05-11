// Importa posts desde el dataset de un Apify run que ya se ejecutó.
//
// Uso: npm run import-run -- --runId=WiICsqwLs5KBKK5Kt --user=melisaescobarta

import "dotenv/config";
import { ApifyClient } from "apify-client";
import {
  normalize,
  upsertPosts,
  upsertProfile,
  recordScrapeRun,
} from "../lib/persist";
import { recomputeProfileBaseline } from "../lib/baseline";
import { inferLanguage } from "../lib/language";
import type { ApifyHashtagItem, StoredProfile } from "../lib/types";

function parseArgs() {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  if (!args.runId) throw new Error("Falta --runId=<runId>");
  if (!args.user) throw new Error("Falta --user=<username>");
  return { runId: args.runId, username: args.user.toLowerCase() };
}

function extractProfileFromItem(item: any): Partial<StoredProfile> {
  return {
    fullName: item.fullName ?? item.ownerFullName ?? null,
    bio: item.biography ?? null,
    followersCount: item.followersCount ?? null,
    followingCount: item.followsCount ?? null,
    postsCount: item.postsCount ?? null,
    profilePicUrl: item.profilePicUrlHD ?? item.profilePicUrl ?? null,
    isVerified: typeof item.verified === "boolean" ? item.verified : null,
  };
}

async function main() {
  const { runId, username } = parseArgs();

  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Falta APIFY_TOKEN");
  const client = new ApifyClient({ token });

  console.log(`\nObteniendo dataset del run ${runId}…`);
  const run = await client.run(runId).get();
  if (!run) throw new Error(`Run ${runId} no encontrado`);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const apifyItems = items as unknown as ApifyHashtagItem[];
  console.log(`  ${apifyItems.length} items en el dataset.\n`);

  if (apifyItems.length === 0) {
    console.log("Nada que importar.");
    return;
  }

  const scrapedAt = Math.floor(Date.now() / 1000);
  const normalized = apifyItems.map((it) =>
    normalize(it, scrapedAt, { sourceProfile: username })
  );
  const { inserted, updated, failed } = await upsertPosts(normalized);

  const sample = apifyItems[0] as any;
  const profileData = extractProfileFromItem(sample);
  const profileLang = inferLanguage(null, sample.caption ?? null);

  await upsertProfile({
    username,
    fullName: profileData.fullName ?? null,
    bio: profileData.bio ?? null,
    followersCount: profileData.followersCount ?? null,
    followingCount: profileData.followingCount ?? null,
    postsCount: profileData.postsCount ?? null,
    profilePicUrl: profileData.profilePicUrl ?? null,
    isVerified: profileData.isVerified ?? null,
    language: profileLang,
    medianEngagementScore: null,
    medianEngagementRate: null,
    medianViews: null,
    scrapedAt,
  });

  const baseline = await recomputeProfileBaseline(username);

  await recordScrapeRun({
    hashtag: `profile:${username}`,
    startedAt: scrapedAt,
    finishedAt: scrapedAt,
    itemsCount: apifyItems.length,
    apifyRunId: runId,
    error: failed > 0 ? `${failed} rows skipped` : null,
  });

  console.log(
    `@${username}: ${apifyItems.length} items → ${inserted} nuevos, ${updated} actualizados, ${failed} saltados`
  );
  console.log(
    `  mediana ER score: ${baseline.medianEngagementScore?.toFixed(0) ?? "—"}` +
      `  | mediana ER%: ${baseline.medianEngagementRate?.toFixed(2) ?? "—"}%` +
      `  | tagged: ${baseline.taggedPosts} posts (≥2x)\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
