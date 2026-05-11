// Test si nuestro servidor Node puede fetchear el video_url
// (transcripción lo hacía OK, pero el browser falla 403).

import "dotenv/config";
import { queryOne, getPool, getWorkspaceId } from "../lib/db";

async function test(label: string, headers: Record<string, string>) {
  try {
    const url = (await queryOne<{ video_url: string }>(
      "SELECT video_url FROM posts WHERE workspace_id=$1 AND id=$2",
      [getWorkspaceId(), "3891402824030253349"]
    ))!.video_url;
    const t0 = Date.now();
    const res = await fetch(url, { headers });
    const buf = res.ok ? await res.arrayBuffer() : null;
    const elapsed = Date.now() - t0;
    console.log(
      `  ${label}: HTTP ${res.status}${buf ? `  ${(buf.byteLength / 1024).toFixed(0)} KB` : ""}  (${elapsed}ms)`
    );
  } catch (e: any) {
    console.log(`  ${label}: ❌ ${e?.cause?.code ?? e.message}`);
  }
}

async function main() {
  console.log("\nFetcheando video_url desde Node (mismo IP que browser):\n");
  await test("sin headers", {});
  await test("UA Safari (como transcripción)", {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  });
  await test("UA Chrome + Range bytes=0-1", {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    range: "bytes=0-1",
  });
  await test("UA Chrome SIN Referer (como en transcripción)", {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  await getPool().end();
}

main().catch(console.error);
