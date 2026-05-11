import "dotenv/config";
import { queryOne, getPool, getWorkspaceId } from "../lib/db";

(async () => {
  const wsId = getWorkspaceId();
  const p = await queryOne<{ display_url: string }>(
    "SELECT display_url FROM posts WHERE workspace_id = $1 AND id = $2",
    [wsId, process.argv[2]]
  );
  console.log(p?.display_url ?? "no encontrado");
  await getPool().end();
})();
