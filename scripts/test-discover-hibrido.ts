// E2E del descubrimiento híbrido con el PEOR caso: cuenta chica de belleza
// (0 relacionados en IG) → debe activar el plan B (hashtags del perfil) y
// devolver perfiles igual. Antes esto "se quedaba en cero".
// Correr: set -a; source .env; set +a; npx tsx scripts/test-discover-hibrido.ts
import { createDiscoverJob, getDiscoverSnapshot } from "../lib/ig-discover";

async function main() {
  const job = createDiscoverJob(["dradeborasantos.estetica"], 100);
  console.log(`job ${job.id} — semilla chica de belleza (0 relacionados esperados)`);
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = getDiscoverSnapshot(job.id)!;
    process.stdout.write(
      `\r fase=${s.fase} explorados=${s.explored} encontrados=${s.count} hashtags=[${s.usedHashtags.join(",")}]   `
    );
    if (s.done) {
      console.log(`\n⏱️ ${((Date.now() - t0) / 1000).toFixed(0)}s · error=${s.error}`);
      console.log(
        `RESULTADO: ${s.count} perfiles · vía: ${[...new Set(s.found.map((f) => f.via))].slice(0, 4).join(", ")}`
      );
      console.log(s.found.slice(0, 15).map((f) => "@" + f.username).join("  "));
      const ok = s.count >= 15;
      console.log(ok ? "✅ PASA: el plan B rescató la búsqueda" : "❌ FALLA: sigue quedando en casi cero");
      process.exit(ok ? 0 : 1);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
