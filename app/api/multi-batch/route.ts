import { NextRequest, NextResponse } from "next/server";
import {
  fetchProfileFast,
  IgFastError,
  PROXY_ENABLED,
} from "@/lib/ig-fast";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BATCH = 60;
const CONCURRENCY = PROXY_ENABLED ? 15 : 3;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const usernames: string[] = (body.usernames ?? []).slice(0, MAX_BATCH);
  const n: number = Math.min(96, Math.max(6, Number(body.n ?? 48) || 48));

  if (usernames.length === 0) {
    return NextResponse.json({ posts: [], errors: [], rateLimited: false });
  }

  const posts: any[] = [];
  const errors: string[] = [];
  let rateLimited = false;

  const results = await mapLimit(usernames, CONCURRENCY, async (u) => {
    try {
      const r = await fetchProfileFast(u, n);
      return { u, r, code: null as string | null };
    } catch (e) {
      return {
        u,
        r: null,
        code: e instanceof IgFastError ? e.code : "error",
      };
    }
  });

  for (const { u, r, code } of results) {
    if (code === "rate_limited") rateLimited = true;
    if (!r || r.profile.isPrivate) {
      errors.push(`@${u}`);
      continue;
    }
    for (const p of r.posts) {
      posts.push({
        ...p,
        ownerUsername: r.profile.username,
        ownerFollowers: r.profile.followers,
      });
    }
  }

  return NextResponse.json({ posts, errors, rateLimited });
}
