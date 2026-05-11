// Recalcula la inferencia de idioma para todos los posts del workspace.

import "dotenv/config";
import { query, withTransaction, getWorkspaceId } from "../lib/db";
import { inferLanguage } from "../lib/language";

async function main() {
  const wsId = getWorkspaceId();

  const rows = await query<{
    id: string;
    source_hashtag: string | null;
    caption: string | null;
  }>(
    "SELECT id, source_hashtag, caption FROM posts WHERE workspace_id = $1",
    [wsId]
  );

  if (rows.length === 0) {
    console.log("No hay posts.");
    return;
  }

  const counts: Record<string, number> = {};

  await withTransaction(async (client) => {
    for (const r of rows) {
      const lang = inferLanguage(r.source_hashtag, r.caption);
      const key = lang ?? "null";
      counts[key] = (counts[key] ?? 0) + 1;
      await client.query(
        "UPDATE posts SET language = $1 WHERE workspace_id = $2 AND id = $3",
        [lang, wsId, r.id]
      );
    }
  });

  console.log(`✓ ${rows.length} posts reclasificados:`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
