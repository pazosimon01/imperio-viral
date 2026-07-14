// Backfill del engagement_rate de TODOS los posts cuyo autor tiene followers
// conocidos, en una sola sentencia SQL set-based (sin loop fila-por-fila, así
// que no sufre el "Connection closed" del pooler como recompute-scores).
//
// ER = (likes + comments) / followers × 100   (likes/comments < 0 = ocultos → 0)
//
// Uso: npm run backfill-engagement

import "dotenv/config";
import { query, getWorkspaceId } from "../lib/db";

async function main() {
  const wsId = getWorkspaceId();

  const res = await query<{ id: string }>(
    `UPDATE posts p
     SET engagement_rate = ROUND(
       ((GREATEST(p.likes_count, 0) + GREATEST(p.comments_count, 0))::numeric
         / pr.followers_count) * 100,
       2
     )
     FROM profiles pr
     WHERE pr.workspace_id = p.workspace_id
       AND pr.niche_id     = p.niche_id
       AND LOWER(pr.username) = LOWER(COALESCE(p.source_profile, p.owner_username))
       AND pr.followers_count IS NOT NULL
       AND pr.followers_count > 0
       AND p.workspace_id = $1
     RETURNING p.id`,
    [wsId]
  );

  console.log(`✓ engagement_rate recalculado en ${res.length} posts.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
