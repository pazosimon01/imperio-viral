// Benchmark del barrido con la nueva concurrencia (10 con proxy).
// Correr: set -a; source .env; set +a; npx tsx scripts/test-scan-speed.ts
import { scanUsernames, CONCURRENCY } from "../lib/multi-scan";

const USERS = [
  "juanlombana", "nadiazann", "rosifacial", "aaleharo", "adraaraujo",
  "instagram", "cristiano", "leomessi", "natgeo", "nike",
];

async function main() {
  console.log(`CONCURRENCY=${CONCURRENCY} · ${USERS.length} perfiles · n=48`);
  const t0 = Date.now();
  const r = await scanUsernames(USERS, 48);
  const secs = (Date.now() - t0) / 1000;
  const ok = USERS.length - r.failed.length;
  console.log(
    `⏱️ ${secs.toFixed(1)}s → ${ok}/${USERS.length} analizados · ${r.posts.length} posts · fallos: ${r.failed.map((f) => `${f.username}(${f.reason})`).join(", ") || "ninguno"}`
  );
  console.log(`ritmo: ${(secs / ok).toFixed(1)}s/perfil efectivo → 81 perfiles ≈ ${((secs / ok) * 81 / 60).toFixed(1)} min`);
  process.exit(0);
}
main();
