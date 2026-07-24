// E2E de la pesca profunda con un perfil REAL de belleza y la marca real:
// scrape fresco (videoUrl vivo) → filtro rápido → VER videos → veredictos.
// Correr: set -a; source .env; set +a; npx tsx scripts/test-pesca-profunda.ts
import { fetchProfileFast } from "../lib/ig-fast";
import { getActiveBrand } from "../lib/brands";
import { createPescaJob, getPescaSnapshot } from "../lib/pescar-profundo";

async function main() {
  const brand = await getActiveBrand();
  if (!brand) throw new Error("sin marca");
  console.log(`Marca: ${brand.nombre}`);

  console.log("Scrapeando perfil de belleza (videoUrl fresco)…");
  const r = await fetchProfileFast("dratlatzin", 12);
  const posts = r.posts.map((p) => ({
    ...p,
    ownerUsername: r.profile.username,
    ownerFollowers: r.profile.followers,
  }));
  const conVideo = posts.filter((p) => p.videoUrl).length;
  console.log(`${posts.length} posts (${conVideo} con video)`);

  const job = createPescaJob(brand, posts);
  const t0 = Date.now();
  for (;;) {
    await new Promise((res) => setTimeout(res, 3000));
    const s = getPescaSnapshot(job.id)!;
    process.stdout.write(
      `\r fase=${s.fase} profundo=${s.profundoDone}/${s.profundoTotal} ideas=${s.ideas.length}   `
    );
    if (s.done) {
      console.log(`\n⏱️ ${((Date.now() - t0) / 1000).toFixed(0)}s total · error=${s.error}`);
      console.log(`evaluados=${s.evaluados} descartadosTexto=${s.descartadosRapido} descartadosVideo=${s.descartadosProfundo}`);
      for (const idea of s.ideas) {
        console.log(`\n[${idea.puntaje}] ${idea.veredicto.toUpperCase()} @${idea.post.ownerUsername} (audio:${idea.profundo?.conAudio})`);
        console.log(`  VIDEO: ${idea.profundo?.resumenVideo?.slice(0, 150)}`);
        console.log(`  DICE: ${idea.profundo?.queDice?.slice(0, 120)}`);
        console.log(`  MARCA: ${idea.profundo?.razonMarca?.slice(0, 150)}`);
        console.log(`  REPLICAR: ${idea.profundo?.comoReplicar?.slice(0, 180)}`);
      }
      break;
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
