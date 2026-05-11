// Recalcula engagement_score, engagement_rate, viral_velocity y viral_score
// para todos los posts del workspace activo.
//
// Uso: npm run recompute-scores

import "dotenv/config";
import { query, withTransaction, getWorkspaceId } from "../lib/db";
import { computeScores } from "../lib/score";
import type { ApifyHashtagItem } from "../lib/types";

interface Row {
  id: string;
  raw_json: any;
  type: string;
  owner_username: string | null;
  source_profile: string | null;
  followers: number | null;
}

async function main() {
  const wsId = getWorkspaceId();

  const rows = await query<Row>(
    `SELECT
       p.id,
       p.raw_json,
       p.type,
       p.owner_username,
       p.source_profile,
       COALESCE(pr1.followers_count, pr2.followers_count) AS followers
     FROM posts p
     LEFT JOIN profiles pr1
            ON pr1.workspace_id = p.workspace_id
           AND LOWER(pr1.username) = LOWER(p.source_profile)
     LEFT JOIN profiles pr2
            ON pr2.workspace_id = p.workspace_id
           AND LOWER(pr2.username) = LOWER(p.owner_username)
     WHERE p.workspace_id = $1`,
    [wsId]
  );

  if (rows.length === 0) {
    console.log("No hay posts para recalcular.");
    return;
  }

  let n = 0;
  let withFollowers = 0;
  let withER = 0;

  await withTransaction(async (client) => {
    for (const row of rows) {
      const item =
        typeof row.raw_json === "string"
          ? (JSON.parse(row.raw_json) as ApifyHashtagItem)
          : (row.raw_json as ApifyHashtagItem);
      const followers = row.followers;
      if (followers != null) withFollowers++;

      const s = computeScores(item, { followersCount: followers });
      if (s.engagementRate != null) withER++;

      await client.query(
        `UPDATE posts SET
           engagement_score = $1,
           engagement_rate  = $2,
           view_rate        = $3,
           viral_velocity   = $4,
           viral_score      = $5
         WHERE workspace_id = $6 AND id = $7`,
        [
          s.engagementScore,
          s.engagementRate,
          s.viewRate,
          s.viralVelocity,
          s.viralScore,
          wsId,
          row.id,
        ]
      );
      n++;
    }
  });

  console.log(
    `✓ Recalculados ${n} posts. ` +
      `${withFollowers} con followers conocidos, ${withER} con ER% calculado.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
