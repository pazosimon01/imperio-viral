// Queries server-side reutilizadas por páginas de Next.js. Postgres + multi-tenant.

import { query, queryOne, getWorkspaceId } from "./db";
import { getActiveNicheId } from "./niches";
import type { ViralTier, Decision } from "./types";
import { publicUrlFor } from "./supabase-storage";

const DAY = 86400;

// ─────────────────────────────────────────────────────────────
// PERFILES
// ─────────────────────────────────────────────────────────────

export interface ProfileSummary {
  username: string;
  fullName: string | null;
  bio: string | null;
  followersCount: number | null;
  followingCount: number | null;
  postsCount: number | null;
  profilePicUrl: string | null;
  isVerified: boolean;
  language: string | null;
  medianEngagementScore: number | null;
  medianEngagementRate: number | null;
  medianViews: number | null;
  scrapedAt: number;
  totalPostsInDb: number;
  taggedPostsCount: number;
}

export async function getAllProfiles(): Promise<ProfileSummary[]> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  // Antes: 2 subconsultas correlacionadas por fila (N×2 escaneos de posts).
  // Ahora: un solo GROUP BY sobre posts unido a profiles → 1 escaneo.
  const rows = await query<any>(
    `SELECT p.*,
            COALESCE(c.total_posts, 0)  AS total_posts,
            COALESCE(c.tagged_posts, 0) AS tagged_posts
     FROM profiles p
     LEFT JOIN (
       SELECT source_profile,
              COUNT(*)                                   AS total_posts,
              COUNT(*) FILTER (WHERE viral_tier IS NOT NULL) AS tagged_posts
       FROM posts
       WHERE workspace_id = $1 AND niche_id = $2 AND source_profile IS NOT NULL
       GROUP BY source_profile
     ) c ON c.source_profile = p.username
     WHERE p.workspace_id = $1 AND p.niche_id = $2
     ORDER BY p.followers_count DESC NULLS LAST`,
    [wsId, nicheId]
  );
  return rows.map(rowToProfileSummary);
}

export async function getProfile(username: string): Promise<ProfileSummary | null> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const row = await queryOne<any>(
    `SELECT p.*,
            (SELECT COUNT(*) FROM posts WHERE workspace_id = p.workspace_id AND niche_id = p.niche_id AND source_profile = p.username) AS total_posts,
            (SELECT COUNT(*) FROM posts WHERE workspace_id = p.workspace_id AND niche_id = p.niche_id AND source_profile = p.username AND viral_tier IS NOT NULL) AS tagged_posts
     FROM profiles p
     WHERE p.workspace_id = $1 AND p.niche_id = $2 AND p.username = $3`,
    [wsId, nicheId, username.toLowerCase()]
  );
  return row ? rowToProfileSummary(row) : null;
}

function rowToProfileSummary(r: any): ProfileSummary {
  return {
    username: r.username,
    fullName: r.full_name,
    bio: r.bio,
    followersCount: r.followers_count,
    followingCount: r.following_count,
    postsCount: r.posts_count,
    profilePicUrl: r.profile_pic_url,
    isVerified: !!r.is_verified,
    language: r.language,
    medianEngagementScore: r.median_engagement_score,
    medianEngagementRate: r.median_engagement_rate,
    medianViews: r.median_views,
    scrapedAt: r.scraped_at,
    totalPostsInDb: Number(r.total_posts),
    taggedPostsCount: Number(r.tagged_posts),
  };
}

// ─────────────────────────────────────────────────────────────
// POSTS
// ─────────────────────────────────────────────────────────────

export type PostType = "Image" | "Sidecar" | "Video";
export type SortKey =
  | "viralScore"
  | "viralidadMultiplier"
  | "engagementRate"
  | "viralVelocity"
  | "engagementScore"
  | "viewsPerFollower"
  | "postedAt"
  | "videoViewCount";

export type HeatLevel = "fresco" | "tibio" | "caliente" | "explosivo";

const HEAT_MIN_ER: Record<HeatLevel, number> = {
  fresco: 1,
  tibio: 3,
  caliente: 6,
  explosivo: 9,
};

export interface PostFilters {
  recentDays?: number;
  language?: "es" | "en" | "pt" | "supported" | null;
  types?: PostType[];
  minTier?: ViralTier | null;
  minHeat?: HeatLevel | null;
  decision?: Decision | "none" | null;
  sort?: SortKey;
  sourceHashtag?: string | "any" | null;
  page?: number; // 1-indexed
  pageSize?: number; // override del tamaño de página (default POSTS_PAGE_SIZE)
}

export const POSTS_PAGE_SIZE = 60;

export interface PostsPage {
  posts: PostListItem[];
  page: number;
  hasMore: boolean;
}

export interface PostListItem {
  id: string;
  shortCode: string | null;
  url: string;
  type: PostType;
  ownerUsername: string | null;
  ownerFullName: string | null;
  caption: string | null;
  displayUrl: string | null;
  videoUrl: string | null;
  images: string[];
  hashtags: string[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number | null;
  videoViewCount: number | null;
  videoPlayCount: number | null;
  videoDuration: number | null;
  musicArtist: string | null;
  musicTrack: string | null;
  engagementScore: number | null;
  engagementRate: number | null;
  viewRate: number | null;
  viralVelocity: number | null;
  viralScore: number | null;
  viralidadMultiplier: number | null;
  viralTier: ViralTier | null;
  hashtagHeatMult: number | null;
  hashtagHeatTier: HeatLevel | null;
  ownerFollowersCount: number | null;
  viewsPerFollower: number | null;
  postedAt: number;
  language: string | null;
  sourceProfile: string | null;
  sourceHashtag: string | null;
  decision: Decision | null;
  decisionNotes: string | null;
}

export async function getProfilePosts(
  username: string,
  filters: PostFilters
): Promise<PostsPage> {
  return queryPosts({ ...filters, sourceProfile: username });
}

interface InternalQueryFilters extends PostFilters {
  sourceProfile?: string;
}

export async function queryPosts(
  filters: InternalQueryFilters
): Promise<PostsPage> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const params: any[] = [];
  const addParam = (v: any): string => {
    params.push(v);
    return `$${params.length}`;
  };

  const where: string[] = [
    `p.workspace_id = ${addParam(wsId)}`,
    `p.niche_id = ${addParam(nicheId)}`,
  ];

  if (filters.sourceProfile) {
    where.push(`p.source_profile = ${addParam(filters.sourceProfile.toLowerCase())}`);
  }

  if (filters.sourceHashtag === "any") {
    where.push("p.source_hashtag IS NOT NULL");
  } else if (filters.sourceHashtag) {
    where.push(`p.source_hashtag = ${addParam(filters.sourceHashtag.toLowerCase())}`);
  }

  if (filters.recentDays != null) {
    const cutoff = Math.floor(Date.now() / 1000) - filters.recentDays * DAY;
    where.push(`p.posted_at > ${addParam(cutoff)}`);
  }

  if (filters.language === "supported") {
    where.push("p.language IN ('es','en','pt')");
  } else if (filters.language) {
    where.push(`p.language = ${addParam(filters.language)}`);
  }

  if (filters.types && filters.types.length > 0) {
    where.push(`p.type = ANY(${addParam(filters.types)})`);
  }

  if (filters.minTier) {
    const order: ViralTier[] = ["good", "viral", "gem", "diamond", "unicorn"];
    const minIdx = order.indexOf(filters.minTier);
    const allowed = order.slice(minIdx);
    where.push(`p.viral_tier = ANY(${addParam(allowed)})`);
  }

  if (filters.minHeat) {
    where.push(`p.engagement_rate >= ${addParam(HEAT_MIN_ER[filters.minHeat])}`);
  }

  if (filters.decision === "none") {
    where.push("d.decision IS NULL");
  } else if (filters.decision) {
    where.push(`d.decision = ${addParam(filters.decision)}`);
  }

  const sortKey = filters.sort ?? "viralidadMultiplier";
  const orderBy: Record<SortKey, string> = {
    viralScore: "p.viral_score DESC NULLS LAST",
    viralidadMultiplier: "p.viralidad_multiplier DESC NULLS LAST",
    engagementRate: "p.engagement_rate DESC NULLS LAST",
    viralVelocity: "p.viral_velocity DESC NULLS LAST",
    engagementScore: "p.engagement_score DESC NULLS LAST",
    viewsPerFollower:
      "(COALESCE(p.video_view_count, p.video_play_count)::double precision / NULLIF(COALESCE(pr1.followers_count, pr2.followers_count), 0)) DESC NULLS LAST",
    postedAt: "p.posted_at DESC",
    videoViewCount:
      "COALESCE(p.video_view_count, p.video_play_count) DESC NULLS LAST",
  };

  // Paginación: pedimos pageSize + 1 para detectar si hay más sin necesidad
  // de un COUNT(*) extra. Slice al final si trajo pageSize + 1.
  const pageSize = Math.max(1, Math.min(500, filters.pageSize ?? POSTS_PAGE_SIZE));
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * pageSize;
  const limitParam = addParam(pageSize + 1);
  const offsetParam = addParam(offset);

  // Importante: NO traer p.raw_json acá — son ~10KB por row × 500 = 5MB
  // que tarda 4-5s en transferirse. Lista columnas explícitas.
  const sql = `
    SELECT p.id, p.short_code, p.url, p.type,
           p.owner_username, p.owner_full_name,
           p.caption, p.hashtags, p.images, p.display_url, p.video_url,
           p.thumbnail_storage_path,
           p.likes_count, p.comments_count, p.video_view_count, p.video_play_count,
           p.shares_count, p.video_duration, p.music_artist, p.music_track,
           p.engagement_score, p.engagement_rate, p.view_rate, p.viral_velocity,
           p.viral_score, p.viralidad_multiplier, p.viral_tier,
           p.hashtag_heat_mult, p.hashtag_heat_tier,
           p.posted_at, p.language, p.source_profile, p.source_hashtag,
           d.decision AS decision,
           d.notes    AS decision_notes,
           COALESCE(pr1.followers_count, pr2.followers_count) AS owner_followers
    FROM posts p
    LEFT JOIN decisions d
           ON d.workspace_id = p.workspace_id AND d.post_id = p.id
    LEFT JOIN profiles pr1
           ON pr1.workspace_id = p.workspace_id AND pr1.niche_id = p.niche_id AND LOWER(pr1.username) = LOWER(p.source_profile)
    LEFT JOIN profiles pr2
           ON pr2.workspace_id = p.workspace_id AND pr2.niche_id = p.niche_id AND LOWER(pr2.username) = LOWER(p.owner_username)
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy[sortKey]},
             p.engagement_score DESC NULLS LAST,
             p.posted_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const rows = await query<any>(sql, params);
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    posts: sliced.map(rowToPost),
    page,
    hasMore,
  };
}

export async function getPostById(id: string): Promise<PostListItem | null> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const row = await queryOne<any>(
    `SELECT p.*,
            d.decision AS decision,
            d.notes    AS decision_notes,
            COALESCE(pr1.followers_count, pr2.followers_count) AS owner_followers
     FROM posts p
     LEFT JOIN decisions d
            ON d.workspace_id = p.workspace_id AND d.post_id = p.id
     LEFT JOIN profiles pr1
            ON pr1.workspace_id = p.workspace_id AND pr1.niche_id = p.niche_id AND LOWER(pr1.username) = LOWER(p.source_profile)
     LEFT JOIN profiles pr2
            ON pr2.workspace_id = p.workspace_id AND pr2.niche_id = p.niche_id AND LOWER(pr2.username) = LOWER(p.owner_username)
     WHERE p.workspace_id = $1 AND p.niche_id = $2 AND p.id = $3`,
    [wsId, nicheId, id]
  );
  return row ? rowToPost(row) : null;
}

function rowToPost(r: any): PostListItem {
  // text[] columns vienen como JS arrays directos; jsonb como objetos.
  const images: string[] = Array.isArray(r.images) ? r.images : [];
  const hashtags: string[] = Array.isArray(r.hashtags) ? r.hashtags : [];

  // Si tenemos el thumbnail guardado en Supabase Storage, lo preferimos
  // a la URL de IG (que caduca en horas). Caemos a display_url para posts
  // viejos pre-feature, aunque casi nunca cargará por la firma vencida.
  const displayUrl =
    r.thumbnail_storage_path != null
      ? publicUrlFor(r.thumbnail_storage_path)
      : r.display_url;

  return {
    id: r.id,
    shortCode: r.short_code,
    url: r.url,
    type: r.type,
    ownerUsername: r.owner_username,
    ownerFullName: r.owner_full_name,
    caption: r.caption,
    displayUrl,
    videoUrl: r.video_url,
    images,
    hashtags,
    likesCount: r.likes_count ?? 0,
    commentsCount: r.comments_count ?? 0,
    sharesCount: r.shares_count,
    videoViewCount: r.video_view_count,
    videoPlayCount: r.video_play_count,
    videoDuration: r.video_duration,
    musicArtist: r.music_artist,
    musicTrack: r.music_track,
    engagementScore: r.engagement_score,
    engagementRate: r.engagement_rate,
    viewRate: r.view_rate,
    viralVelocity: r.viral_velocity,
    viralScore: r.viral_score,
    viralidadMultiplier: r.viralidad_multiplier,
    viralTier: r.viral_tier,
    hashtagHeatMult: r.hashtag_heat_mult,
    hashtagHeatTier: r.hashtag_heat_tier,
    ownerFollowersCount: r.owner_followers ?? null,
    viewsPerFollower: (() => {
      const views = r.video_view_count ?? r.video_play_count ?? null;
      const followers = r.owner_followers ?? null;
      if (views == null || followers == null || followers <= 0) return null;
      return views / followers;
    })(),
    postedAt: r.posted_at,
    language: r.language,
    sourceProfile: r.source_profile,
    sourceHashtag: r.source_hashtag,
    decision: r.decision,
    decisionNotes: r.decision_notes,
  };
}

// ─────────────────────────────────────────────────────────────
// DECISIONS
// ─────────────────────────────────────────────────────────────

export async function setDecision(
  postId: string,
  decision: Decision | null,
  notes?: string | null
): Promise<void> {
  const wsId = getWorkspaceId();
  if (decision === null) {
    await query(
      `DELETE FROM decisions WHERE workspace_id = $1 AND post_id = $2`,
      [wsId, postId]
    );
    return;
  }
  await query(
    `INSERT INTO decisions (workspace_id, post_id, decision, notes, decided_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, post_id) DO UPDATE SET
       decision   = EXCLUDED.decision,
       notes      = COALESCE(EXCLUDED.notes, decisions.notes),
       decided_at = EXCLUDED.decided_at`,
    [wsId, postId, decision, notes ?? null, Math.floor(Date.now() / 1000)]
  );
}

// ─────────────────────────────────────────────────────────────
// HASHTAGS
// ─────────────────────────────────────────────────────────────

export interface HashtagSummary {
  hashtag: string;
  totalPosts: number;
  taggedPosts: number;
  reels: number;
  carousels: number;
  images: number;
  lastScrapedAt: number;
}

export async function getAllHashtagsWithCounts(): Promise<HashtagSummary[]> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const rows = await query<any>(
    `SELECT
       source_hashtag AS hashtag,
       COUNT(*) AS total_posts,
       COUNT(*) FILTER (WHERE viral_tier IS NOT NULL) AS tagged_posts,
       COUNT(*) FILTER (WHERE type = 'Video')   AS reels,
       COUNT(*) FILTER (WHERE type = 'Sidecar') AS carousels,
       COUNT(*) FILTER (WHERE type = 'Image')   AS images,
       MAX(scraped_at) AS last_scraped_at
     FROM posts
     WHERE workspace_id = $1 AND niche_id = $2 AND source_hashtag IS NOT NULL
     GROUP BY source_hashtag
     ORDER BY total_posts DESC`,
    [wsId, nicheId]
  );

  return rows.map((r) => ({
    hashtag: r.hashtag,
    totalPosts: Number(r.total_posts),
    taggedPosts: Number(r.tagged_posts),
    reels: Number(r.reels),
    carousels: Number(r.carousels),
    images: Number(r.images),
    lastScrapedAt: r.last_scraped_at,
  }));
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────────

export interface GlobalStats {
  totalProfiles: number;
  totalPosts: number;
  totalReels: number;
  totalCarousels: number;
  totalImages: number;
  taggedPosts: number;
  byTier: Record<ViralTier, number>;
  byLanguage: { lang: string; n: number }[];
  decisionsCount: { replicate: number; maybe: number; skip: number };
}

export async function getGlobalStats(): Promise<GlobalStats> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();

  // decisions no tiene niche_id directamente; las filtramos por post para
  // que solo cuenten decisiones sobre posts del nicho activo.
  const [profilesRow, typeRows, taggedRow, tierRows, langRows, decisionRows] =
    await Promise.all([
      queryOne<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM profiles WHERE workspace_id = $1 AND niche_id = $2",
        [wsId, nicheId]
      ),
      query<{ type: string; n: number }>(
        "SELECT type, COUNT(*)::int AS n FROM posts WHERE workspace_id = $1 AND niche_id = $2 GROUP BY type",
        [wsId, nicheId]
      ),
      queryOne<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM posts WHERE workspace_id = $1 AND niche_id = $2 AND viral_tier IS NOT NULL",
        [wsId, nicheId]
      ),
      query<{ tier: ViralTier; n: number }>(
        "SELECT viral_tier AS tier, COUNT(*)::int AS n FROM posts WHERE workspace_id = $1 AND niche_id = $2 AND viral_tier IS NOT NULL GROUP BY viral_tier",
        [wsId, nicheId]
      ),
      query<{ lang: string; n: number }>(
        "SELECT COALESCE(language, '?') AS lang, COUNT(*)::int AS n FROM posts WHERE workspace_id = $1 AND niche_id = $2 GROUP BY language ORDER BY n DESC",
        [wsId, nicheId]
      ),
      query<{ decision: Decision; n: number }>(
        `SELECT d.decision, COUNT(*)::int AS n
         FROM decisions d
         JOIN posts p ON p.workspace_id = d.workspace_id AND p.id = d.post_id
         WHERE d.workspace_id = $1 AND p.niche_id = $2
         GROUP BY d.decision`,
        [wsId, nicheId]
      ),
    ]);

  const totalPosts = typeRows.reduce((s, r) => s + r.n, 0);
  const totalReels = typeRows.find((r) => r.type === "Video")?.n ?? 0;
  const totalCarousels = typeRows.find((r) => r.type === "Sidecar")?.n ?? 0;
  const totalImages = typeRows.find((r) => r.type === "Image")?.n ?? 0;

  const byTier: Record<ViralTier, number> = {
    good: 0,
    viral: 0,
    gem: 0,
    diamond: 0,
    unicorn: 0,
  };
  for (const r of tierRows) byTier[r.tier] = r.n;

  const decisionsCount = { replicate: 0, maybe: 0, skip: 0 };
  for (const r of decisionRows) decisionsCount[r.decision] = r.n;

  return {
    totalProfiles: profilesRow?.n ?? 0,
    totalPosts,
    totalReels,
    totalCarousels,
    totalImages,
    taggedPosts: taggedRow?.n ?? 0,
    byTier,
    byLanguage: langRows,
    decisionsCount,
  };
}
