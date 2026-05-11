import "dotenv/config";
import { queryOne, getPool, getWorkspaceId } from "../lib/db";

(async () => {
  const wsId = getWorkspaceId();
  const p = await queryOne<any>(
    `SELECT id, type, short_code, url, display_url, video_url,
            images, raw_json
     FROM posts WHERE workspace_id = $1 AND id = $2`,
    [wsId, process.argv[2]]
  );
  if (!p) {
    console.log("Post no encontrado");
    process.exit(1);
  }
  console.log("type:        ", p.type);
  console.log("short_code:  ", p.short_code);
  console.log("url:         ", p.url);
  console.log("display_url: ", p.display_url?.slice(0, 80) ?? "(null)");
  console.log("video_url:   ", p.video_url?.slice(0, 80) ?? "(null)");
  console.log("images.len:  ", p.images.length);

  // Echar un ojo a childPosts en raw_json (Sidecars con videos adentro)
  const raw = typeof p.raw_json === "string" ? JSON.parse(p.raw_json) : p.raw_json;
  if (raw.childPosts && raw.childPosts.length > 0) {
    console.log("\nchildPosts:  ", raw.childPosts.length);
    raw.childPosts.forEach((c: any, i: number) => {
      console.log(`  [${i}] type=${c.type ?? "?"} hasVideo=${!!c.videoUrl}`);
    });
  }

  await getPool().end();
})();
