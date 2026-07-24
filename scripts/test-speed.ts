// Diagnóstico de velocidad del Radar: ¿dónde se va el tiempo?
//   1. latencia de UNA petición vía proxy (Evomi residencial)
//   2. un perfil completo con n=48 (lo que corre el análisis del usuario)
// Correr: set -a; source .env; set +a; npx tsx scripts/test-speed.ts
import { igFetchJson, fetchProfileFast } from "../lib/ig-fast";

async function main() {
  console.log("— 1) Latencia por petición (web_profile_info × 3) —");
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    try {
      const j = await igFetchJson(
        "https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram"
      );
      console.log(`  req ${i + 1}: ${Date.now() - t0}ms (user: ${j?.data?.user?.username})`);
    } catch (e) {
      console.log(`  req ${i + 1}: FALLÓ en ${Date.now() - t0}ms — ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("— 2) Perfil completo n=48 (como el análisis del usuario) —");
  const t1 = Date.now();
  try {
    const r = await fetchProfileFast("juanlombana", 48);
    console.log(`  total: ${((Date.now() - t1) / 1000).toFixed(1)}s · posts: ${r.posts.length}`);
  } catch (e) {
    console.log(`  FALLÓ en ${((Date.now() - t1) / 1000).toFixed(1)}s — ${e instanceof Error ? e.message : e}`);
  }

  console.log("— 3) Perfil completo n=12 (referencia) —");
  const t2 = Date.now();
  try {
    const r = await fetchProfileFast("nadiazann", 12);
    console.log(`  total: ${((Date.now() - t2) / 1000).toFixed(1)}s · posts: ${r.posts.length}`);
  } catch (e) {
    console.log(`  FALLÓ en ${((Date.now() - t2) / 1000).toFixed(1)}s — ${e instanceof Error ? e.message : e}`);
  }
  process.exit(0);
}
main();
