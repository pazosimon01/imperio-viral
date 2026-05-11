// Recalcula baselines de TODOS los perfiles del workspace activo.

import "dotenv/config";
import { query, getWorkspaceId } from "../lib/db";
import { recomputeProfileBaseline } from "../lib/baseline";

async function main() {
  const wsId = getWorkspaceId();

  const profiles = await query<{ username: string }>(
    "SELECT username FROM profiles WHERE workspace_id = $1 ORDER BY username",
    [wsId]
  );

  if (profiles.length === 0) {
    console.log("No hay perfiles. Corre npm run scrape:profile primero.");
    return;
  }

  console.log(`Recomputando baselines para ${profiles.length} perfil(es)…\n`);

  for (const { username } of profiles) {
    const r = await recomputeProfileBaseline(username);
    console.log(
      `@${username}` +
        `  | sample baseline: ${r.baselineSampleSize}` +
        `  | activos: ${r.activePostsCount}` +
        `  | mediana ER: ${r.medianEngagementRate?.toFixed(2) ?? "—"}%` +
        `  | tagged: ${r.taggedPosts}`
    );
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
