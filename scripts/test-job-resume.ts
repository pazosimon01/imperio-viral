// Prueba del respaldo de jobs del Radar (reinicio local Y redespliegue cloud).
//   fase A: crea un job (81 perfiles simulados) y MUERE de inmediato.
//   fase B: proceso NUEVO consulta el job → rehidrata (disco o DB), lo marca
//           interrumpido y dice exactamente qué falta.
// Correr:  npx tsx scripts/test-job-resume.ts A   (anota el id)
//          npx tsx scripts/test-job-resume.ts B <id>
//   (para simular REDESPLIEGUE cloud: borrar data/jobs/*.json antes de B —
//    así solo queda la DB, como en Railway.)
import { createMultiJob, getMultiJobSnapshot } from "../lib/multi-jobs";

async function main() {
  const fase = process.argv[2];
  if (fase === "A") {
    const usernames = Array.from({ length: 81 }, (_, i) => `perfil_${i + 1}`);
    const job = createMultiJob(usernames, 6);
    console.log(job.id);
    await new Promise((r) => setTimeout(r, 2500)); // deja aterrizar el write a DB
    process.exit(0);
  } else if (fase === "B") {
    const id = process.argv[3];
    const snap = await getMultiJobSnapshot(id);
    if (!snap) {
      console.log("FALLO: no se rehidrató (ni disco ni DB)");
      process.exit(1);
    }
    console.log(`done=${snap.done} interrumpido=${snap.interrumpido}`);
    console.log(`total=${snap.total} analizados=${snap.successCount} faltantes=${snap.faltantesCount}`);
    const ok = snap.done && snap.interrumpido && snap.faltantesCount === 81;
    console.log(ok ? "✅ PASA: sabe que faltan los 81 y ofrece continuar" : "❌ FALLA");
    process.exit(ok ? 0 : 1);
  } else {
    console.log("Usa: A | B <id>");
    process.exit(1);
  }
}
main();
