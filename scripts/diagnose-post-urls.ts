// Diagnóstico: verifica si las URLs (display, video, images) de un post
// siguen siendo válidas o ya caducaron en el CDN de Instagram.
//
// Uso: npx tsx scripts/diagnose-post-urls.ts <postId>

import "dotenv/config";
import { queryOne, getPool, getWorkspaceId } from "../lib/db";

async function checkUrl(url: string, label: string): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    console.log(`  ${label}: HTTP ${res.status} ${res.ok ? "✅" : "⚠️"}`);
  } catch (e: any) {
    const msg = e?.cause?.code ?? e?.message ?? String(e);
    console.log(`  ${label}: ❌ ${msg}`);
  }
}

async function main() {
  const postId = process.argv[2];
  if (!postId) {
    console.error("Uso: npx tsx scripts/diagnose-post-urls.ts <postId>");
    process.exit(1);
  }

  const wsId = getWorkspaceId();
  const post = await queryOne<{
    id: string;
    type: string;
    short_code: string | null;
    url: string;
    display_url: string | null;
    video_url: string | null;
    images: string[];
    posted_at: number;
    scraped_at: number;
  }>(
    `SELECT id, type, short_code, url, display_url, video_url, images,
            posted_at, scraped_at
     FROM posts WHERE workspace_id = $1 AND id = $2`,
    [wsId, postId]
  );

  if (!post) {
    console.error(`Post ${postId} no existe en este workspace.`);
    process.exit(1);
  }

  const scrapedAgo = Math.floor((Date.now() / 1000 - post.scraped_at) / 86400);
  console.log(`\nPost ${post.id} (${post.type})`);
  console.log(`  IG URL: ${post.url}`);
  console.log(`  Scrapeado hace: ${scrapedAgo} días`);
  console.log(`  short_code: ${post.short_code}\n`);

  if (post.display_url) {
    await checkUrl(post.display_url, "display_url");
  }
  if (post.video_url) {
    await checkUrl(post.video_url, "video_url ");
  }
  for (let i = 0; i < post.images.length; i++) {
    await checkUrl(post.images[i], `images[${i}]`);
  }

  console.log();
  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
