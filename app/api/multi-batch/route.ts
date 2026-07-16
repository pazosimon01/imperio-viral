import { NextRequest, NextResponse } from "next/server";
import {
  fetchProfileFast,
  IgFastError,
  PROXY_ENABLED,
} from "@/lib/ig-fast";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BATCH = 30;
const CONCURRENCY = PROXY_ENABLED ? 5 : 2;
const MAX_RETRIES = 2;
const RETRY_PAUSE_MS = PROXY_ENABLED ? 8_000 : 15_000;
const MAX_POSTS_PER_RESPONSE = 600;

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

function pause(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type FetchResult = {
  u: string;
  r: Awaited<ReturnType<typeof fetchProfileFast>> | null;
  code: string | null;
};

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

  let pending = usernames;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (pending.length === 0) break;

    if (attempt > 0) {
      const waitMs = RETRY_PAUSE_MS * attempt;
      console.log(
        `[multi-batch] retry ${attempt}/${MAX_RETRIES}: ${pending.length} perfiles tras pausa de ${waitMs}ms`
      );
      await pause(waitMs);
    }

    const results = await mapLimit(pending, CONCURRENCY, async (u): Promise<FetchResult> => {
      try {
        const r = await fetchProfileFast(u, n);
        return { u, r, code: null };
      } catch (e) {
        return {
          u,
          r: null,
          code: e instanceof IgFastError ? e.code : "error",
        };
      }
    });

    const retryList: string[] = [];

    for (const { u, r, code } of results) {
      if (code === "rate_limited") {
        rateLimited = true;
        if (attempt < MAX_RETRIES) {
          retryList.push(u);
        } else {
          errors.push(`@${u}`);
        }
        continue;
      }
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

    pending = retryList;
  }

  if (posts.length > MAX_POSTS_PER_RESPONSE) {
    posts.sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1));
    posts.length = MAX_POSTS_PER_RESPONSE;
  }

  return NextResponse.json({ posts, errors, rateLimited });
}
