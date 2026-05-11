// Acciones de scrape reutilizables (CLI scripts y API endpoints).
// Encapsula: cutoff temporal, llamada a Apify, normalización, persistencia,
// recálculo de baselines.

import {
  extractUsername,
  runHashtagScrape,
  runProfileScrape,
  type ResultsType,
} from "./apify";
import { queryOne, getWorkspaceId } from "./db";
import { inferLanguage } from "./language";
import {
  normalize,
  recordScrapeRun,
  upsertPosts,
  upsertProfile,
} from "./persist";
import { recomputeProfileBaseline, type BaselineResult } from "./baseline";
import { recomputeHashtagHeat } from "./hashtag-heat";
import type { StoredProfile } from "./types";

const HARD_CUTOFF_DAYS = 365;

function toIsoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

export async function decideProfileCutoff(
  username: string,
  full: boolean
): Promise<{ cutoff: string | undefined; reason: string }> {
  if (full) return { cutoff: undefined, reason: "full" };

  const wsId = getWorkspaceId();
  const existing = await queryOne<{ scraped_at: number }>(
    "SELECT scraped_at FROM profiles WHERE workspace_id = $1 AND username = $2",
    [wsId, username]
  );

  if (existing?.scraped_at) {
    const overlap = existing.scraped_at - 86400;
    return {
      cutoff: toIsoDate(overlap),
      reason: `incremental (desde ${toIsoDate(existing.scraped_at)})`,
    };
  }

  const oneYearAgo = Math.floor(Date.now() / 1000) - HARD_CUTOFF_DAYS * 86400;
  return { cutoff: toIsoDate(oneYearAgo), reason: "primer scrape (1 año)" };
}

function extractProfileFromItem(item: any): Partial<StoredProfile> {
  return {
    fullName: item.fullName ?? item.ownerFullName ?? null,
    bio: item.biography ?? null,
    followersCount: item.followersCount ?? null,
    followingCount: item.followsCount ?? null,
    postsCount: item.postsCount ?? null,
    profilePicUrl: item.profilePicUrlHD ?? item.profilePicUrl ?? null,
    isVerified: typeof item.verified === "boolean" ? item.verified : null,
  };
}

export interface ProfileScrapeResult {
  username: string;
  itemsReceived: number;
  inserted: number;
  updated: number;
  failed: number;
  baseline: BaselineResult;
  apifyRunId: string;
  cutoffReason: string;
}

export async function scrapeProfile(
  rawUsername: string,
  options: { limit?: number; full?: boolean } = {}
): Promise<ProfileScrapeResult> {
  const username = extractUsername(rawUsername);
  if (!username) throw new Error("Username inválido");
  const limit = options.limit ?? 200;

  const tagStart = Math.floor(Date.now() / 1000);
  const { cutoff, reason } = await decideProfileCutoff(username, !!options.full);

  let runId: string | null = null;
  let receivedCount = 0;
  let error: string | null = null;
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let baseline: BaselineResult | null = null;

  try {
    const result = await runProfileScrape({
      usernames: [username],
      resultsLimit: limit,
      onlyPostsNewerThan: cutoff,
    });
    runId = result.runId;
    receivedCount = result.items.length;

    if (receivedCount > 0) {
      const scrapedAt = Math.floor(Date.now() / 1000);
      const normalized = result.items.map((it) =>
        normalize(it, scrapedAt, { sourceProfile: username })
      );
      const up = await upsertPosts(normalized);
      inserted = up.inserted;
      updated = up.updated;
      failed = up.failed;

      const sample = result.items[0] as any;
      const profileData = extractProfileFromItem(sample);
      const profileLang = inferLanguage(null, sample.caption ?? null);

      await upsertProfile({
        username,
        fullName: profileData.fullName ?? null,
        bio: profileData.bio ?? null,
        followersCount: profileData.followersCount ?? null,
        followingCount: profileData.followingCount ?? null,
        postsCount: profileData.postsCount ?? null,
        profilePicUrl: profileData.profilePicUrl ?? null,
        isVerified: profileData.isVerified ?? null,
        language: profileLang,
        medianEngagementScore: null,
        medianEngagementRate: null,
        medianViews: null,
        scrapedAt,
      });

      baseline = await recomputeProfileBaseline(username);
    } else {
      baseline = await recomputeProfileBaseline(username);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    await recordScrapeRun({
      hashtag: `profile:${username}`,
      startedAt: tagStart,
      finishedAt: Math.floor(Date.now() / 1000),
      itemsCount: receivedCount,
      apifyRunId: runId,
      error,
    });
  }

  return {
    username,
    itemsReceived: receivedCount,
    inserted,
    updated,
    failed,
    baseline: baseline ?? {
      username,
      baselineSampleSize: 0,
      activePostsCount: 0,
      medianEngagementScore: null,
      medianEngagementRate: null,
      medianViews: null,
      taggedPosts: 0,
    },
    apifyRunId: runId ?? "",
    cutoffReason: reason,
  };
}

// ─────────────────────────────────────────────────────────────
// HASHTAG
// ─────────────────────────────────────────────────────────────

export interface HashtagScrapeResult {
  hashtag: string;
  resultsType: ResultsType;
  itemsReceived: number;
  inserted: number;
  updated: number;
  failed: number;
  apifyRunId: string;
}

export async function scrapeHashtag(
  rawHashtag: string,
  resultsType: ResultsType,
  limit: number
): Promise<HashtagScrapeResult> {
  const hashtag = rawHashtag.trim().toLowerCase().replace(/^#+/, "");
  if (!hashtag) throw new Error("Hashtag inválido");

  const tagStart = Math.floor(Date.now() / 1000);
  let runId: string | null = null;
  let receivedCount = 0;
  let error: string | null = null;
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  try {
    const result = await runHashtagScrape({
      hashtags: [hashtag],
      resultsType,
      resultsLimit: limit,
    });
    runId = result.runId;
    receivedCount = result.items.length;

    if (receivedCount > 0) {
      const scrapedAt = Math.floor(Date.now() / 1000);
      const normalized = result.items.map((it) =>
        normalize(it, scrapedAt, { sourceHashtag: hashtag })
      );
      const up = await upsertPosts(normalized);
      inserted = up.inserted;
      updated = up.updated;
      failed = up.failed;

      await recomputeHashtagHeat(hashtag);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    await recordScrapeRun({
      hashtag: `${hashtag}:${resultsType}`,
      startedAt: tagStart,
      finishedAt: Math.floor(Date.now() / 1000),
      itemsCount: receivedCount,
      apifyRunId: runId,
      error,
    });
  }

  return {
    hashtag,
    resultsType,
    itemsReceived: receivedCount,
    inserted,
    updated,
    failed,
    apifyRunId: runId ?? "",
  };
}
