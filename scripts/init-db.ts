// Verifica conexión al workspace activo y lista counts por tabla.
// El schema lo manejan los migrations de Supabase (supabase/migrations/).

import "dotenv/config";
import { query, queryOne, getWorkspaceId } from "../lib/db";

async function main() {
  const wsId = getWorkspaceId();
  console.log(`Workspace activo: ${wsId}\n`);

  const tables = [
    "posts",
    "decisions",
    "transcriptions",
    "adaptations",
    "profiles",
    "scrape_runs",
    "jobs",
  ];

  console.log("Conteos por tabla en este workspace:");
  for (const t of tables) {
    const row = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE workspace_id = $1`,
      [wsId]
    );
    console.log(`  - ${t}: ${row?.n ?? 0} filas`);
  }

  // Workspace tables (sin workspace_id filter)
  const wsCount = await queryOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM workspaces"
  );
  const memberCount = await queryOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM workspace_members"
  );
  console.log(`\nGlobal:`);
  console.log(`  - workspaces: ${wsCount?.n ?? 0}`);
  console.log(`  - workspace_members: ${memberCount?.n ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
