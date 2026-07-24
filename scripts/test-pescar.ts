// Prueba del pescador de ideas con la marca real y posts sintéticos que imitan
// el problema: mismo nicho pero temas ajenos, creencias contrarias, humor.
// Correr: set -a; source .env; set +a; npx tsx scripts/test-pescar.ts
import { getActiveBrand } from "../lib/brands";
import { pescarIdeas } from "../lib/pescar";

async function main() {
  const brand = await getActiveBrand();
  if (!brand) {
    console.log("No hay marca en la DB.");
    process.exit(1);
  }
  console.log(`Marca activa: ${brand.nombre} (resumen: ${brand.resumen.length} chars)\n`);

  const posts = [
    {
      caption:
        "3 señales de que tu sonrisa está envejeciendo tu rostro (y la #2 casi nadie la nota). El borde de los dientes se desgasta y hace que los labios pierdan soporte. Un diseño de sonrisa bien hecho no es solo estética: te devuelve años. Agenda tu valoración.",
      ownerUsername: "clinica.ejemplo",
      engagementRate: 8.4,
      likes: 900,
      comments: 130,
      views: 45000,
      mediaType: "video",
      url: "https://www.instagram.com/p/AAA/",
      thumbnailUrl: null,
    },
    {
      caption:
        "JAJAJA cuando el paciente dice que no le duele nada pero llora al abrir la boca 😂😂 etiqueta a tu odontólogo favorito #humor #odontologia #meme",
      ownerUsername: "dentista.memes",
      engagementRate: 12.1,
      likes: 5000,
      comments: 800,
      views: 200000,
      mediaType: "video",
      url: "https://www.instagram.com/p/BBB/",
      thumbnailUrl: null,
    },
    {
      caption:
        "No pierdas plata en tratamientos de clínica. Con este truco casero de bicarbonato y limón blanqueas tus dientes en 3 días sin pagar un peso. Los odontólogos no quieren que lo sepas.",
      ownerUsername: "trucos.caseros",
      engagementRate: 9.7,
      likes: 3000,
      comments: 400,
      views: 150000,
      mediaType: "video",
      url: "https://www.instagram.com/p/CCC/",
      thumbnailUrl: null,
    },
    {
      caption:
        "Mi rutina de gimnasio para marcar abdomen en 30 días. Día 1: cardio en ayunas...",
      ownerUsername: "fitcoach",
      engagementRate: 7.2,
      likes: 2000,
      comments: 150,
      views: 90000,
      mediaType: "video",
      url: "https://www.instagram.com/p/DDD/",
      thumbnailUrl: null,
    },
    {
      caption:
        "Caso real: llegó con los dientes tinturados por café de 15 años. Mira el antes y después de su limpieza + carillas. El cambio en su confianza no tiene precio. ¿Te identificas con el antes?",
      ownerUsername: "sonrisas.cali",
      engagementRate: 6.8,
      likes: 700,
      comments: 90,
      views: 30000,
      mediaType: "carousel",
      url: "https://www.instagram.com/p/EEE/",
      thumbnailUrl: null,
    },
  ];

  const t0 = Date.now();
  const r = await pescarIdeas(brand, posts);
  console.log(`⏱️ ${(Date.now() - t0) / 1000}s | evaluados: ${r.evaluados} | descartados: ${r.descartados}\n`);
  for (const idea of r.ideas) {
    console.log(`[${idea.puntaje}] ${idea.veredicto.toUpperCase()} @${idea.post.ownerUsername}`);
    console.log(`   por qué: ${idea.razon}`);
    console.log(`   adaptar: ${idea.comoAdaptar}\n`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
