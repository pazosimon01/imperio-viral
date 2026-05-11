// "Heat" relativo al hashtag para fotos y carruseles. Postgres + multi-tenant.

import { query, withTransaction, getWorkspaceId } from "./db";
import { getActiveNicheId } from "./niches";
import type { HeatLevel } from "./queries";

const HEAT_TIER_THRESHOLDS: Array<{ min: number; tier: HeatLevel }> = [
  { min: 10, tier: "explosivo" },
  { min: 5, tier: "caliente" },
  { min: 2, tier: "tibio" },
];

function median(values: number[]): number | null {
  const xs = values
    .filter((v) => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

function classify(mult: number): HeatLevel | null {
  for (const t of HEAT_TIER_THRESHOLDS) {
    if (mult >= t.min) return t.tier;
  }
  return null;
}

export interface HashtagHeatResult {
  hashtag: string;
  byType: Record<string, { median: number | null; tagged: number }>;
}

export async function recomputeHashtagHeat(
  hashtag: string
): Promise<HashtagHeatResult> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const tag = hashtag.toLowerCase();
  const byType: HashtagHeatResult["byType"] = {};

  for (const type of ["Image", "Sidecar", "Video"]) {
    const rows = await query<{ id: string; engagement_score: number }>(
      `SELECT id, engagement_score
       FROM posts
       WHERE workspace_id = $1 AND niche_id = $2 AND source_hashtag = $3 AND type = $4
         AND engagement_score IS NOT NULL`,
      [wsId, nicheId, tag, type]
    );

    if (rows.length === 0) {
      byType[type] = { median: null, tagged: 0 };
      continue;
    }

    const scores = rows.map((r) => r.engagement_score).filter((s) => s > 0);
    const med = median(scores);

    if (!med || med === 0) {
      await query(
        `UPDATE posts SET hashtag_heat_mult = NULL, hashtag_heat_tier = NULL
         WHERE workspace_id = $1 AND niche_id = $2 AND source_hashtag = $3 AND type = $4`,
        [wsId, nicheId, tag, type]
      );
      byType[type] = { median: null, tagged: 0 };
      continue;
    }

    let tagged = 0;
    await withTransaction(async (client) => {
      for (const r of rows) {
        const mult = r.engagement_score / med;
        const tier = classify(mult);
        await client.query(
          `UPDATE posts SET hashtag_heat_mult = $1, hashtag_heat_tier = $2
           WHERE workspace_id = $3 AND niche_id = $4 AND id = $5`,
          [mult, tier, wsId, nicheId, r.id]
        );
        if (tier) tagged++;
      }
    });

    byType[type] = { median: med, tagged };
  }

  return { hashtag: tag, byType };
}

export async function recomputeAllHashtagHeat(): Promise<HashtagHeatResult[]> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const tags = await query<{ source_hashtag: string }>(
    `SELECT DISTINCT source_hashtag FROM posts
     WHERE workspace_id = $1 AND niche_id = $2 AND source_hashtag IS NOT NULL`,
    [wsId, nicheId]
  );
  const results: HashtagHeatResult[] = [];
  for (const t of tags) {
    results.push(await recomputeHashtagHeat(t.source_hashtag));
  }
  return results;
}
