// Script de scrape de hashtag. Llama a Apify, normaliza, persiste en Postgres.
//
// Uso:
//   npm run scrape -- --hashtag=inteligenciaartificial --limit=10
//   npm run scrape -- --hashtag=ia,chatgpt --limit=20 --type=reels
//   npm run scrape -- --hashtag=ia --limit=10 --type=posts

import "dotenv/config";
import { runHashtagScrape, type ResultsType } from "../lib/apify";
import { normalize, upsertPosts, recordScrapeRun } from "../lib/persist";

interface CliArgs {
  hashtags: string[];
  limit: number;
  types: ResultsType[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }

  const hashtagRaw = args.hashtag ?? "inteligenciaartificial";
  const hashtags = Array.from(
    new Set(
      hashtagRaw
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/^#+/, ""))
        .filter(Boolean)
    )
  );

  const limit = Number(args.limit ?? "10");
  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error(`--limit inválido: ${args.limit}`);
  }

  const typeArg = (args.type ?? "both").toLowerCase();
  let types: ResultsType[];
  if (typeArg === "both") types = ["posts", "reels"];
  else if (typeArg === "posts" || typeArg === "reels") types = [typeArg];
  else throw new Error(`--type inválido: ${typeArg} (usa posts|reels|both)`);

  return { hashtags, limit, types };
}

async function main() {
  const { hashtags, limit, types } = parseArgs(process.argv.slice(2));

  console.log(`\n=== Scrape ===`);
  console.log(`Hashtags: ${hashtags.join(", ")}`);
  console.log(`Tipos:    ${types.join(", ")}`);
  console.log(`Límite por hashtag×tipo: ${limit}\n`);

  const startedAt = Math.floor(Date.now() / 1000);
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalReceived = 0;

  for (const hashtag of hashtags) {
    for (const type of types) {
      const tagStart = Math.floor(Date.now() / 1000);
      let runId: string | null = null;
      let error: string | null = null;
      let receivedCount = 0;

      try {
        const result = await runHashtagScrape({
          hashtags: [hashtag],
          resultsType: type,
          resultsLimit: limit,
        });
        runId = result.runId;
        receivedCount = result.items.length;
        totalReceived += receivedCount;

        const scrapedAt = Math.floor(Date.now() / 1000);
        const items = result.items.map((it) =>
          normalize(it, scrapedAt, { sourceHashtag: hashtag })
        );

        const { inserted, updated } = await upsertPosts(items);
        totalInserted += inserted;
        totalUpdated += updated;

        console.log(
          `  #${hashtag} [${type}]: ${receivedCount} items → ${inserted} nuevos, ${updated} actualizados`
        );
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        console.error(`  #${hashtag} [${type}]: ERROR — ${error}`);
      } finally {
        await recordScrapeRun({
          hashtag: `${hashtag}:${type}`,
          startedAt: tagStart,
          finishedAt: Math.floor(Date.now() / 1000),
          itemsCount: receivedCount,
          apifyRunId: runId,
          error,
        });
      }
    }
  }

  const elapsed = Math.floor(Date.now() / 1000) - startedAt;
  console.log(
    `\n✓ Listo en ${elapsed}s. ${totalReceived} recibidos, ${totalInserted} nuevos, ${totalUpdated} actualizados.\n`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
