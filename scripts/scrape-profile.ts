// Script de scrape por perfil. Postgres + workspace activo.
//
// Uso:
//   npm run scrape:profile -- --user=pedrosobral --limit=200
//   npm run scrape:profile -- --user=pedrosobral,babruna
//   npm run scrape:profile -- --user=https://instagram.com/pedrosobral
//   npm run scrape:profile -- --user=pedrosobral --full

import "dotenv/config";
import { extractUsername } from "../lib/apify";
import { scrapeProfile } from "../lib/scrape-actions";
import { TIER_LABEL } from "../lib/baseline";

const DEFAULT_LIMIT = 200;

interface CliArgs {
  usernames: string[];
  limit: number;
  full: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a === "--full") args.full = "true";
  }
  if (!args.user) throw new Error("Falta --user=<username|url>[,...]");
  const usernames = Array.from(
    new Set(
      args.user
        .split(",")
        .map((s) => extractUsername(s))
        .filter(Boolean)
    )
  );
  const limit = Number(args.limit ?? String(DEFAULT_LIMIT));
  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error(`--limit inválido: ${args.limit}`);
  }
  return { usernames, limit, full: args.full === "true" };
}

async function main() {
  const { usernames, limit, full } = parseArgs(process.argv.slice(2));

  console.log(`\n=== Scrape de perfiles ===`);
  console.log(`Perfiles: ${usernames.join(", ")}`);
  console.log(`Límite por perfil: ${limit}${full ? " (--full)" : ""}\n`);

  const startedAt = Math.floor(Date.now() / 1000);

  for (const username of usernames) {
    try {
      const r = await scrapeProfile(username, { limit, full });
      console.log(`  cutoff: ${r.cutoffReason}`);
      console.log(
        `  @${r.username}: ${r.itemsReceived} items → ${r.inserted} nuevos, ${r.updated} actualizados`
      );
      console.log(
        `    mediana ER score: ${r.baseline.medianEngagementScore?.toFixed(0) ?? "—"}` +
          `  | mediana ER%: ${r.baseline.medianEngagementRate?.toFixed(2) ?? "—"}%` +
          `  | tagged: ${r.baseline.taggedPosts} posts (≥2x)`
      );
    } catch (e) {
      console.error(`  @${username}: ERROR — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const elapsed = Math.floor(Date.now() / 1000) - startedAt;
  console.log(`\n✓ Listo en ${elapsed}s.\n`);
  console.log("Tiers virales detectados:");
  for (const tier of Object.keys(TIER_LABEL) as Array<keyof typeof TIER_LABEL>) {
    console.log(`  ${TIER_LABEL[tier]}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
