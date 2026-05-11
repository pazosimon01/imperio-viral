// Enriquecimiento de followers para autores descubiertos vía hashtag.
// Postgres + multi-tenant.

import { runProfileDetailsScrape } from "./apify";
import { recomputeAllHashtagHeat } from "./hashtag-heat";
import { recomputeProfileBaseline } from "./baseline";
import { query, withTransaction, getWorkspaceId } from "./db";
import { getActiveNicheId } from "./niches";
import { upsertProfile } from "./persist";
import { computeScores } from "./score";
import type { HeatLevel } from "./queries";

const HEAT_MIN_ER: Record<HeatLevel, number> = {
  fresco: 1,
  tibio: 3,
  caliente: 6,
  explosivo: 9,
};

export interface EnrichmentCandidate {
  username: string;
  reelCount: number;
  bestEr: number;
}

export async function getEnrichmentCandidates(
  minHeat: HeatLevel = "caliente"
): Promise<EnrichmentCandidate[]> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const minER = HEAT_MIN_ER[minHeat];

  const rows = await query<{
    username: string;
    reel_count: number;
    best_er: number;
  }>(
    `SELECT
       p.owner_username AS username,
       COUNT(*)         AS reel_count,
       MAX(p.view_rate) AS best_er
     FROM posts p
     LEFT JOIN profiles pr
            ON pr.workspace_id = p.workspace_id
           AND pr.niche_id = p.niche_id
           AND LOWER(pr.username) = LOWER(p.owner_username)
     WHERE p.workspace_id = $1
       AND p.niche_id = $2
       AND p.type = 'Video'
       AND p.view_rate >= $3
       AND p.owner_username IS NOT NULL
       AND p.owner_username != ''
       AND pr.username IS NULL
     GROUP BY p.owner_username
     ORDER BY best_er DESC`,
    [wsId, nicheId, minER]
  );

  return rows.map((r) => ({
    username: r.username,
    reelCount: Number(r.reel_count),
    bestEr: r.best_er,
  }));
}

export interface EnrichmentResult {
  enriched: number;
  stubbed: number;
  failed: number;
  apifyRunId: string;
  affectedPosts: number;
}

export async function enrichProfiles(
  usernames: string[]
): Promise<EnrichmentResult> {
  if (usernames.length === 0) {
    return {
      enriched: 0,
      stubbed: 0,
      failed: 0,
      apifyRunId: "",
      affectedPosts: 0,
    };
  }

  const result = await runProfileDetailsScrape({ usernames });
  const scrapedAt = Math.floor(Date.now() / 1000);

  const returned = new Map<string, any>();
  for (const item of result.items) {
    if (item.username) {
      returned.set(item.username.toLowerCase(), item);
    }
  }

  let enriched = 0;
  let stubbed = 0;
  let failed = 0;

  for (const requested of usernames) {
    const key = requested.toLowerCase();
    const item = returned.get(key);
    try {
      if (item) {
        await upsertProfile({
          username: key,
          fullName: item.fullName ?? null,
          bio: item.biography ?? null,
          followersCount: item.followersCount ?? null,
          followingCount: item.followsCount ?? null,
          postsCount: item.postsCount ?? null,
          profilePicUrl: item.profilePicUrlHD ?? item.profilePicUrl ?? null,
          isVerified: typeof item.verified === "boolean" ? item.verified : null,
          language: null,
          medianEngagementScore: null,
          medianEngagementRate: null,
          medianViews: null,
          scrapedAt,
        });
        enriched++;
      } else {
        await upsertProfile({
          username: key,
          fullName: null,
          bio: "[no enriquecido — cuenta privada, eliminada o sin acceso]",
          followersCount: null,
          followingCount: null,
          postsCount: null,
          profilePicUrl: null,
          isVerified: null,
          language: null,
          medianEngagementScore: null,
          medianEngagementRate: null,
          medianViews: null,
          scrapedAt,
        });
        stubbed++;
      }
    } catch (e) {
      console.error("enrich error:", e);
      failed++;
    }
  }

  const affectedPosts = await recomputeScoresForOwners(usernames);

  for (const u of usernames) {
    try {
      await recomputeProfileBaseline(u);
    } catch {}
  }
  await recomputeAllHashtagHeat();

  return {
    enriched,
    stubbed,
    failed,
    apifyRunId: result.runId,
    affectedPosts,
  };
}

async function recomputeScoresForOwners(usernames: string[]): Promise<number> {
  if (usernames.length === 0) return 0;
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const lowerUsernames = usernames.map((u) => u.toLowerCase());

  const rows = await query<{
    id: string;
    raw_json: any;
    followers: number | null;
  }>(
    `SELECT p.id, p.raw_json,
            COALESCE(pr1.followers_count, pr2.followers_count) AS followers
     FROM posts p
     LEFT JOIN profiles pr1
            ON pr1.workspace_id = p.workspace_id
           AND pr1.niche_id = p.niche_id
           AND LOWER(pr1.username) = LOWER(p.source_profile)
     LEFT JOIN profiles pr2
            ON pr2.workspace_id = p.workspace_id
           AND pr2.niche_id = p.niche_id
           AND LOWER(pr2.username) = LOWER(p.owner_username)
     WHERE p.workspace_id = $1
       AND p.niche_id = $2
       AND LOWER(p.owner_username) = ANY($3)`,
    [wsId, nicheId, lowerUsernames]
  );

  if (rows.length === 0) return 0;

  let n = 0;
  await withTransaction(async (client) => {
    for (const r of rows) {
      // raw_json viene parseado como objeto desde jsonb
      const item = typeof r.raw_json === "string" ? JSON.parse(r.raw_json) : r.raw_json;
      const s = computeScores(item, { followersCount: r.followers });
      await client.query(
        `UPDATE posts SET
           engagement_score = $1,
           engagement_rate  = $2,
           view_rate        = $3,
           viral_velocity   = $4,
           viral_score      = $5
         WHERE workspace_id = $6 AND niche_id = $7 AND id = $8`,
        [
          s.engagementScore,
          s.engagementRate,
          s.viewRate,
          s.viralVelocity,
          s.viralScore,
          wsId,
          nicheId,
          r.id,
        ]
      );
      n++;
    }
  });
  return n;
}
