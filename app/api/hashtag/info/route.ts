import { NextRequest, NextResponse } from "next/server";
import { queryOne, getWorkspaceId } from "@/lib/db";
import { getActiveNicheId } from "@/lib/niches";

export const runtime = "nodejs";

// Info del hashtag para warning antes de scrapear: cuántos posts ya tenemos
// y % estimado de duplicados según cuándo fue el último scrape.
export async function GET(req: NextRequest) {
  const tag = (req.nextUrl.searchParams.get("tag") ?? "")
    .trim()
    .toLowerCase()
    .replace(/^#+/, "");
  if (!tag) {
    return NextResponse.json({ tag: "", exists: false }, { status: 200 });
  }

  const wsId = getWorkspaceId();
  const nicheId = await getActiveNicheId();
  const row = await queryOne<{
    posts_count: number;
    last_scraped_at: number | null;
  }>(
    `SELECT
       COUNT(*)::int    AS posts_count,
       MAX(scraped_at)  AS last_scraped_at
     FROM posts
     WHERE workspace_id = $1 AND niche_id = $2 AND source_hashtag = $3`,
    [wsId, nicheId, tag],
  );

  const postsCount = row?.posts_count ?? 0;
  const lastScrapedAt = row?.last_scraped_at ?? null;
  const exists = postsCount > 0;
  const daysAgo = lastScrapedAt
    ? (Date.now() / 1000 - lastScrapedAt) / 86400
    : null;

  let estimatedOverlapPct: number | null = null;
  if (daysAgo != null) {
    if (daysAgo < 1) estimatedOverlapPct = 90;
    else if (daysAgo < 3) estimatedOverlapPct = 75;
    else if (daysAgo < 7) estimatedOverlapPct = 50;
    else if (daysAgo < 30) estimatedOverlapPct = 25;
    else estimatedOverlapPct = 10;
  }

  return NextResponse.json({
    tag,
    exists,
    postsCount,
    lastScrapedAt,
    daysAgo,
    estimatedOverlapPct,
  });
}
