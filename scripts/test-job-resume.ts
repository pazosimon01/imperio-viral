// Prueba del respaldo en disco de los jobs del Radar (escenario "reinicio").
//   fase A: crea un job (81 perfiles simulados) y MUERE de inmediato — como
//           cuando el servidor se reinicia a mitad del análisis.
//   fase B: proceso NUEVO (memoria vacía) consulta el job → debe rehidratarlo
//           de disco, marcarlo interrumpido y decir exactamente qué falta.
// Correr:  npx tsx scripts/test-job-resume.ts A   (anota el id)
//          npx tsx scripts/test-job-resume.ts B <id>
import { createMultiJob, getMultiJobSnapshot } from "../lib/multi-jobs";

const fase = process.argv[2];

if (fase === "A") {
  const usernames = Array.from({ length: 81 }, (_, i) => `perfil_${i + 1}`);
  const job = createMultiJob(usernames, 6);
  console.log(job.id);
  process.exit(0); // ← muere con el análisis recién arrancado (peor caso)
} else if (fase === "B") {
  const id = process.argv[3];
  const snap = getMultiJobSnapshot(id);
  if (!snap) {
    console.log("FALLO: no se rehidrató desde disco");
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
