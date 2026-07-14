// Normalización y persistencia: ApifyHashtagItem -> StoredPost en Postgres.
// Multi-tenant: cada insert/update lleva workspace_id resuelto de getWorkspaceId().

import type { ApifyHashtagItem, StoredPost, StoredProfile } from "./types";
import { computeScores } from "./score";
import { inferLanguage } from "./language";
import { getPool, getWorkspaceId } from "./db";
import { getActiveNicheId } from "./niches";
import { downloadAndStoreImage } from "./supabase-storage";

export interface NormalizeOptions {
  sourceHashtag?: string | null;
  sourceProfile?: string | null;
  // Followers del autor — IMPRESCINDIBLE para que el engagement_rate se calcule
  // por post. El profile-scraper trae followersCount en cada item gracias a
  // addParentData; lo pasamos acá para que NINGÚN post quede con ER null.
  followersCount?: number | null;
}

export function normalize(
  item: ApifyHashtagItem,
  scrapedAt: number,
  opts: NormalizeOptions = {}
): StoredPost {
  const sourceHashtag = opts.sourceHashtag ?? null;
  const sourceProfile = opts.sourceProfile ?? null;
  // Resolvemos followers desde la opción explícita o desde el propio item
  // (addParentData lo inyecta como followersCount / owner.followersCount).
  const followersCount =
    opts.followersCount ??
    (item as any).followersCount ??
    (item as any).owner?.followersCount ??
    null;
  const scores = computeScores(item, { followersCount });
  const postedAt = item.timestamp
    ? Math.floor(new Date(item.timestamp).getTime() / 1000)
    : scrapedAt;

  const childImages = (item.childPosts ?? [])
    .map((c) => c.displayUrl)
    .filter((u): u is string => !!u);
  const images: string[] =
    item.images && item.images.length > 0
      ? item.images
      : childImages.length > 0
      ? childImages
      : item.displayUrl
      ? [item.displayUrl]
      : [];

  return {
    id: item.id,
    shortCode: item.shortCode ?? null,
    url: item.url,
    type: item.type,

    ownerUsername: item.ownerUsername ?? null,
    ownerFullName: item.ownerFullName ?? null,
    ownerId: item.ownerId ?? null,

    caption: item.caption ?? null,
    hashtags: item.hashtags ?? [],
    mentions: item.mentions ?? [],
    locationName: item.locationName ?? null,

    videoUrl: item.videoUrl ?? null,
    videoDuration: item.videoDuration ?? null,
    images,
    displayUrl: item.displayUrl ?? null,

    musicArtist: item.musicInfo?.artist_name ?? null,
    musicTrack: item.musicInfo?.song_name ?? null,
    musicId: item.musicInfo?.audio_id ?? null,

    likesCount: item.likesCount ?? 0,
    commentsCount: item.commentsCount ?? 0,
    videoViewCount: item.videoViewCount ?? null,
    videoPlayCount: item.videoPlayCount ?? null,
    sharesCount: item.sharesCount ?? null,

    postedAt,
    scrapedAt,
    sourceHashtag,
    sourceProfile,
    language: inferLanguage(sourceHashtag, item.caption ?? null),

    engagementScore: scores.engagementScore,
    engagementRate: scores.engagementRate,
    viewRate: scores.viewRate,
    viralVelocity: scores.viralVelocity,
    viralScore: scores.viralScore,
    viralidadMultiplier: null,
    viralTier: null,

    rawJson: JSON.stringify(item),
  };
}

// UPSERT con detección inserted vs updated via xmax (truco PG: xmax = 0 en
// rows recién insertadas, != 0 en updated).
//
// niche_id solo se setea en INSERT — si el post ya existe (en otro nicho),
// NO se mueve. Primera asignación gana, evita contaminar nichos cruzados.
const UPSERT_SQL = `
INSERT INTO posts (
  workspace_id, niche_id, id, short_code, url, type,
  owner_username, owner_full_name, owner_id,
  caption, hashtags, mentions, location_name,
  video_url, video_duration, images, display_url,
  music_artist, music_track, music_id,
  likes_count, comments_count, video_view_count, video_play_count, shares_count,
  posted_at, scraped_at, source_hashtag, source_profile, language,
  viral_velocity, engagement_score, engagement_rate, view_rate, viral_score,
  raw_json, thumbnail_storage_path
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9,
  $10, $11, $12, $13,
  $14, $15, $16, $17,
  $18, $19, $20,
  $21, $22, $23, $24, $25,
  $26, $27, $28, $29, $30,
  $31, $32, $33, $34, $35,
  $36, $37
)
ON CONFLICT (workspace_id, id) DO UPDATE SET
  likes_count       = EXCLUDED.likes_count,
  comments_count    = EXCLUDED.comments_count,
  video_view_count  = EXCLUDED.video_view_count,
  video_play_count  = EXCLUDED.video_play_count,
  shares_count      = EXCLUDED.shares_count,
  scraped_at        = EXCLUDED.scraped_at,
  source_profile    = COALESCE(EXCLUDED.source_profile, posts.source_profile),
  language          = COALESCE(posts.language, EXCLUDED.language),
  viral_velocity    = EXCLUDED.viral_velocity,
  engagement_score  = EXCLUDED.engagement_score,
  engagement_rate   = EXCLUDED.engagement_rate,
  view_rate         = EXCLUDED.view_rate,
  viral_score       = EXCLUDED.viral_score,
  raw_json          = EXCLUDED.raw_json,
  thumbnail_storage_path = COALESCE(EXCLUDED.thumbnail_storage_path, posts.thumbnail_storage_path)
RETURNING (xmax = 0) AS inserted
`;

export interface UpsertResult {
  inserted: number;
  updated: number;
  failed: number;
}

// Descarga thumbnails en paralelo con concurrencia limitada. Las URLs de IG
// caducan en horas — la primera ventana tras el scrape es la única confiable.
async function downloadThumbnails(
  posts: StoredPost[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const concurrency = 10;
  let cursor = 0;

  async function worker() {
    while (cursor < posts.length) {
      const i = cursor++;
      const p = posts[i];
      if (!p.displayUrl) {
        result.set(p.id, null);
        continue;
      }
      const path = await downloadAndStoreImage(p.displayUrl, `${p.id}.jpg`);
      result.set(p.id, path);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, posts.length) }, () => worker())
  );
  return result;
}

export async function upsertPosts(posts: StoredPost[]): Promise<UpsertResult> {
  if (posts.length === 0) return { inserted: 0, updated: 0, failed: 0 };
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const pool = getPool();

  // Paso 1: descargar thumbnails ANTES de insertar. Si fallan (URL ya
  // caduca, rate-limit, etc.) seguimos sin thumbnail — el post se inserta
  // igual con thumbnail_storage_path = null.
  console.log(`  → Descargando thumbnails de ${posts.length} posts...`);
  const t0 = Date.now();
  const thumbnails = await downloadThumbnails(posts);
  const ok = Array.from(thumbnails.values()).filter((v) => v !== null).length;
  console.log(
    `  ✓ Thumbnails: ${ok}/${posts.length} guardados (${(
      (Date.now() - t0) / 1000
    ).toFixed(1)}s)`
  );

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const p of posts) {
    try {
      const res = await pool.query<{ inserted: boolean }>(UPSERT_SQL, [
        wsId, nicheId, p.id, p.shortCode, p.url, p.type,
        p.ownerUsername, p.ownerFullName, p.ownerId,
        p.caption, p.hashtags ?? [], p.mentions ?? [], p.locationName,
        p.videoUrl, p.videoDuration, p.images ?? [], p.displayUrl,
        p.musicArtist, p.musicTrack, p.musicId,
        p.likesCount ?? 0, p.commentsCount ?? 0, p.videoViewCount, p.videoPlayCount, p.sharesCount,
        p.postedAt, p.scrapedAt, p.sourceHashtag, p.sourceProfile, p.language,
        p.viralVelocity, p.engagementScore, p.engagementRate, p.viewRate, p.viralScore,
        p.rawJson, thumbnails.get(p.id) ?? null,
      ]);
      if (res.rows[0]?.inserted) inserted++;
      else updated++;
    } catch (e) {
      failed++;
      failures.push({
        id: p.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (failures.length > 0) {
    console.warn(`  ⚠ ${failures.length} post(s) saltados por error:`);
    for (const f of failures.slice(0, 5)) {
      console.warn(`    ${f.id}: ${f.error}`);
    }
    if (failures.length > 5) console.warn(`    …y ${failures.length - 5} más`);
  }

  return { inserted, updated, failed };
}

export async function upsertProfile(profile: StoredProfile): Promise<void> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  await getPool().query(
    `INSERT INTO profiles (
       workspace_id, niche_id, username, full_name, bio,
       followers_count, following_count, posts_count,
       profile_pic_url, is_verified, language,
       median_engagement_score, median_engagement_rate, median_views,
       scraped_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, $11,
       $12, $13, $14,
       $15
     )
     ON CONFLICT (workspace_id, username) DO UPDATE SET
       full_name        = COALESCE(EXCLUDED.full_name, profiles.full_name),
       bio              = COALESCE(EXCLUDED.bio, profiles.bio),
       followers_count  = COALESCE(EXCLUDED.followers_count, profiles.followers_count),
       following_count  = COALESCE(EXCLUDED.following_count, profiles.following_count),
       posts_count      = COALESCE(EXCLUDED.posts_count, profiles.posts_count),
       profile_pic_url  = COALESCE(EXCLUDED.profile_pic_url, profiles.profile_pic_url),
       is_verified      = COALESCE(EXCLUDED.is_verified, profiles.is_verified),
       language         = COALESCE(profiles.language, EXCLUDED.language),
       scraped_at       = EXCLUDED.scraped_at`,
    [
      wsId,
      nicheId,
      profile.username,
      profile.fullName,
      profile.bio,
      profile.followersCount,
      profile.followingCount,
      profile.postsCount,
      profile.profilePicUrl,
      profile.isVerified,
      profile.language,
      profile.medianEngagementScore,
      profile.medianEngagementRate,
      profile.medianViews,
      profile.scrapedAt,
    ]
  );
}

export async function recordScrapeRun(args: {
  hashtag: string | null;
  startedAt: number;
  finishedAt: number | null;
  itemsCount: number | null;
  apifyRunId: string | null;
  error: string | null;
}): Promise<number> {
  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const res = await getPool().query<{ id: number }>(
    `INSERT INTO scrape_runs (workspace_id, niche_id, hashtag, started_at, finished_at, items_count, apify_run_id, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      wsId,
      nicheId,
      args.hashtag,
      args.startedAt,
      args.finishedAt,
      args.itemsCount,
      args.apifyRunId,
      args.error,
    ]
  );
  return res.rows[0].id;
}
