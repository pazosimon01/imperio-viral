// Mide latencia básica + tiempo de queries clave.
import "dotenv/config";
import { query, getPool, getWorkspaceId } from "../lib/db";

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  const elapsed = Date.now() - t0;
  console.log(`  ${elapsed.toString().padStart(5)}ms  ${label}`);
  return r;
}

async function main() {
  const wsId = getWorkspaceId();
  console.log(`\nWorkspace: ${wsId}\n`);

  console.log("Variantes de queryPosts con JOIN:");

  // Test 1: con p.* completo (incluye raw_json jsonb)
  await time("(A) SELECT p.* (incluye raw_json)", () =>
    query(
      `SELECT p.*, d.decision, d.notes
       FROM posts p
       LEFT JOIN decisions d ON d.workspace_id = p.workspace_id AND d.post_id = p.id
       LEFT JOIN profiles pr1 ON pr1.workspace_id = p.workspace_id AND pr1.username = p.source_profile
       LEFT JOIN profiles pr2 ON pr2.workspace_id = p.workspace_id AND pr2.username = p.owner_username
       WHERE p.workspace_id = $1
       ORDER BY p.viral_score DESC NULLS LAST
       LIMIT 500`,
      [wsId]
    )
  );

  // Test 2: SIN raw_json — explícito
  await time("(B) SELECT columnas (sin raw_json)", () =>
    query(
      `SELECT p.id, p.short_code, p.url, p.type, p.owner_username, p.owner_full_name,
              p.caption, p.hashtags, p.images, p.display_url, p.video_url,
              p.likes_count, p.comments_count, p.video_view_count, p.video_play_count,
              p.shares_count, p.video_duration, p.music_artist, p.music_track,
              p.engagement_score, p.engagement_rate, p.view_rate, p.viral_velocity,
              p.viral_score, p.viralidad_multiplier, p.viral_tier,
              p.hashtag_heat_mult, p.hashtag_heat_tier,
              p.posted_at, p.language, p.source_profile, p.source_hashtag,
              d.decision, d.notes AS decision_notes,
              COALESCE(pr1.followers_count, pr2.followers_count) AS owner_followers
       FROM posts p
       LEFT JOIN decisions d ON d.workspace_id = p.workspace_id AND d.post_id = p.id
       LEFT JOIN profiles pr1 ON pr1.workspace_id = p.workspace_id AND pr1.username = p.source_profile
       LEFT JOIN profiles pr2 ON pr2.workspace_id = p.workspace_id AND pr2.username = p.owner_username
       WHERE p.workspace_id = $1
       ORDER BY p.viral_score DESC NULLS LAST
       LIMIT 500`,
      [wsId]
    )
  );

  // Test 3: bare bones — solo id
  await time("(C) SELECT p.id (mínimo)", () =>
    query(
      `SELECT p.id
       FROM posts p
       LEFT JOIN decisions d ON d.workspace_id = p.workspace_id AND d.post_id = p.id
       LEFT JOIN profiles pr1 ON pr1.workspace_id = p.workspace_id AND pr1.username = p.source_profile
       LEFT JOIN profiles pr2 ON pr2.workspace_id = p.workspace_id AND pr2.username = p.owner_username
       WHERE p.workspace_id = $1
       ORDER BY p.viral_score DESC NULLS LAST
       LIMIT 500`,
      [wsId]
    )
  );

  // Test 4: sin JOINs
  await time("(D) Sin JOINs", () =>
    query(
      `SELECT p.* FROM posts p
       WHERE p.workspace_id = $1
       ORDER BY p.viral_score DESC NULLS LAST
       LIMIT 500`,
      [wsId]
    )
  );

  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
