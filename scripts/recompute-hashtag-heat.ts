// Recalcula el heat relativo al hashtag para todos los hashtags del workspace.

import "dotenv/config";
import { recomputeAllHashtagHeat } from "../lib/hashtag-heat";

async function main() {
  const results = await recomputeAllHashtagHeat();
  console.log(`\nRecomputado para ${results.length} hashtag(s):\n`);
  for (const r of results) {
    const types = Object.entries(r.byType)
      .filter(([, v]) => v.median != null)
      .map(([t, v]) => `${t}: ${v.tagged} tagged (mediana=${v.median!.toFixed(0)})`)
      .join("  |  ");
    console.log(`  #${r.hashtag}: ${types || "(sin datos)"}`);
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
