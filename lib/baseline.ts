// Baselines por perfil + clasificación de viralidad relativa. Postgres + multi-tenant.

import { query, queryOne, withTransaction, getWorkspaceId } from "./db";
import { getActiveNicheId } from "./niches";
import type { ViralTier } from "./types";

const DAY = 86400;
export const DEFAULT_BASELINE_WINDOW_DAYS = 180;
export const DEFAULT_ACTIVE_WINDOW_DAYS = 365;

export function classifyTier(multiplier: number | null): ViralTier | null {
  if (multiplier == null || multiplier < 2) return null;
  if (multiplier < 5) return "good";
  if (multiplier < 10) return "viral";
  if (multiplier < 25) return "gem";
  if (multiplier < 50) return "diamond";
  return "unicorn";
}

export const TIER_LABEL: Record<ViralTier, string> = {
  good: "🟢 good",
  viral: "🥉 viral",
  gem: "🥈 gem",
  diamond: "🥇 diamond",
  unicorn: "💎 unicorn",
};

function median(values: number[]): number | null {
  const xs = values
    .filter((v) => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

export interface BaselineOptions {
  baselineWindowDays?: number;
  activeWindowDays?: number;
}

export interface BaselineResult {
  username: string;
  baselineSampleSize: number;
  activePostsCount: number;
  medianEngagementScore: number | null;
  medianEngagementRate: number | null;
  medianViews: number | null;
  taggedPosts: number;
}

// Versión RÁPIDA: calcula las medianas del perfil en UNA sola sentencia SQL
// (percentile_cont), sin el loop fila-por-fila de tiers que tenía
// recomputeProfileBaseline. Es lo que usa el flujo "Analizar perfil" para no
// pagar la latencia (ni el riesgo de "Connection closed") de actualizar tier
// por tier. Devuelve un BaselineResult compatible (taggedPosts = 0: los tiers
// no se usan en la vista simplificada).
export async function recomputeProfileMedianFast(
  username: string,
  options: BaselineOptions = {}
): Promise<BaselineResult> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const u = username.toLowerCase();
  const baselineDays = options.baselineWindowDays ?? DEFAULT_BASELINE_WINDOW_DAYS;
  const cutoff = Math.floor(Date.now() / 1000) - baselineDays * DAY;

  const row = await queryOne<{
    med_er: number | null;
    med_es: number | null;
    med_views: number | null;
    n: number;
  }>(
    `WITH agg AS (
       SELECT
         percentile_cont(0.5) WITHIN GROUP (ORDER BY engagement_rate)
           FILTER (WHERE engagement_rate > 0) AS med_er,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY engagement_score)
           FILTER (WHERE engagement_score > 0) AS med_es,
         percentile_cont(0.5) WITHIN GROUP
           (ORDER BY COALESCE(video_view_count, video_play_count))
           FILTER (WHERE COALESCE(video_view_count, video_play_count) > 0) AS med_views,
         COUNT(*)::int AS n
       FROM posts
       WHERE workspace_id = $1 AND niche_id = $2
         AND source_profile = $3 AND posted_at > $4
     )
     UPDATE profiles p SET
       median_engagement_rate  = agg.med_er,
       median_engagement_score = agg.med_es,
       median_views            = agg.med_views
     FROM agg
     WHERE p.workspace_id = $1 AND p.niche_id = $2 AND p.username = $3
     RETURNING agg.med_er, agg.med_es, agg.med_views, agg.n`,
    [wsId, nicheId, u, cutoff]
  );

  return {
    username: u,
    baselineSampleSize: row?.n ?? 0,
    activePostsCount: row?.n ?? 0,
    medianEngagementScore: row?.med_es ?? null,
    medianEngagementRate: row?.med_er ?? null,
    medianViews: row?.med_views ?? null,
    taggedPosts: 0,
  };
}

export async function recomputeProfileBaseline(
  username: string,
  options: BaselineOptions = {}
): Promise<BaselineResult> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const u = username.toLowerCase();

  const baselineDays = options.baselineWindowDays ?? DEFAULT_BASELINE_WINDOW_DAYS;
  const activeDays = options.activeWindowDays ?? DEFAULT_ACTIVE_WINDOW_DAYS;

  const now = Math.floor(Date.now() / 1000);
  const baselineCutoff = now - baselineDays * DAY;
  const activeCutoff = now - activeDays * DAY;

  // 1. Calcular mediana sobre los posts del baseline.
  const baselineRows = await query<{
    engagement_score: number | null;
    engagement_rate: number | null;
    plays: number | null;
  }>(
    `SELECT engagement_score, engagement_rate,
            COALESCE(video_view_count, video_play_count) AS plays
     FROM posts
     WHERE workspace_id = $1 AND niche_id = $2 AND source_profile = $3 AND posted_at > $4`,
    [wsId, nicheId, u, baselineCutoff]
  );

  const medES = median(
    baselineRows.map((r) => r.engagement_score ?? 0).filter((v) => v > 0)
  );
  const medER = median(
    baselineRows
      .map((r) => r.engagement_rate)
      .filter((v): v is number => v != null && v > 0)
  );
  const medViews = median(
    baselineRows
      .map((r) => r.plays)
      .filter((v): v is number => v != null && v > 0)
  );

  await query(
    `UPDATE profiles SET
       median_engagement_score = $1,
       median_engagement_rate  = $2,
       median_views            = $3
     WHERE workspace_id = $4 AND niche_id = $5 AND username = $6`,
    [medES, medER, medViews, wsId, nicheId, u]
  );

  // 2. Limpiar multiplier/tier de posts viejos.
  await query(
    `UPDATE posts
     SET viralidad_multiplier = NULL, viral_tier = NULL
     WHERE workspace_id = $1 AND niche_id = $2 AND source_profile = $3 AND posted_at <= $4`,
    [wsId, nicheId, u, activeCutoff]
  );

  // 3. Calcular multiplier y tier para los posts activos (en una transacción
  //    porque son updates row-by-row).
  const activeRows = await query<{ id: string; engagement_score: number | null }>(
    `SELECT id, engagement_score
     FROM posts
     WHERE workspace_id = $1 AND niche_id = $2 AND source_profile = $3 AND posted_at > $4`,
    [wsId, nicheId, u, activeCutoff]
  );

  let tagged = 0;
  await withTransaction(async (client) => {
    for (const r of activeRows) {
      let mult: number | null = null;
      if (medES && medES > 0 && r.engagement_score != null) {
        mult = r.engagement_score / medES;
      }
      const tier = classifyTier(mult);
      await client.query(
        `UPDATE posts SET viralidad_multiplier = $1, viral_tier = $2
         WHERE workspace_id = $3 AND niche_id = $4 AND id = $5`,
        [mult, tier, wsId, nicheId, r.id]
      );
      if (tier) tagged++;
    }
  });

  return {
    username: u,
    baselineSampleSize: baselineRows.length,
    activePostsCount: activeRows.length,
    medianEngagementScore: medES,
    medianEngagementRate: medER,
    medianViews: medViews,
    taggedPosts: tagged,
  };
}
