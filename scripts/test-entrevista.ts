// Prueba de la entrevista mejorada: ¿las preguntas salen concretas (con
// ejemplos) y NO se cierra tras 2 respuestas?
// Correr: set -a; source .env; set +a; npx tsx scripts/test-entrevista.ts
import { interviewStep, type InterviewTurn } from "../lib/cerebro";

async function main() {
  const turns: InterviewTurn[] = [
    { role: "cerebro", text: "¿Qué vendes exactamente y en qué ciudad?" },
    { role: "usuario", text: "Tengo una clínica estética en Medellín, hacemos botox, rellenos y limpieza facial." },
  ];
  const s1 = await interviewStep(turns);
  console.log(`T1 → listo=${s1.listo} avance=${s1.porcentaje}%`);
  console.log(`   pregunta: ${s1.pregunta}`);
  const tieneEjemplos = /\(ej/i.test(s1.pregunta ?? "");
  console.log(`   ¿con ejemplos?: ${tieneEjemplos ? "✅" : "❌"}`);

  turns.push({ role: "cerebro", text: s1.pregunta ?? "" });
  turns.push({ role: "usuario", text: "Mujeres de 30 a 55, sobre todo del Poblado. Llegan cuando se ven cansadas en fotos o tienen un evento." });
  const s2 = await interviewStep(turns);
  console.log(`\nT2 → listo=${s2.listo} avance=${s2.porcentaje}%`);
  console.log(`   pregunta: ${s2.pregunta}`);
  console.log(`   ¿se cerró demasiado pronto?: ${s2.listo ? "❌ SÍ (mal)" : "✅ no"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
