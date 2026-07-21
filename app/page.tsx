import Link from "next/link";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PASOS = [
  {
    n: 1,
    icon: "🧲",
    titulo: "Descubrir",
    desc: "Encuentra perfiles de tu nicho para inspirarte. Solo dinos 1 o 2 cuentas parecidas y buscamos cientos por ti.",
    href: "/descubrir",
    cta: "Buscar perfiles",
    grad: "from-cyan-950/40",
    ring: "hover:border-cyan-600/70",
  },
  {
    n: 2,
    icon: "🧠",
    titulo: "Estrategia",
    desc: "Charlamos un momento sobre tu negocio y te armamos el plan: qué publicar y cómo, en palabras simples.",
    href: "/cerebro",
    cta: "Crear mi plan",
    grad: "from-purple-950/40",
    ring: "hover:border-purple-600/70",
  },
  {
    n: 3,
    icon: "🔍",
    titulo: "Analizar",
    desc: "Miramos qué publicaciones funcionan mejor (más reacciones frente a sus seguidores) para copiar la fórmula.",
    href: "/radar",
    cta: "Ver qué funciona",
    grad: "from-blue-950/40",
    ring: "hover:border-blue-600/70",
  },
  {
    n: 4,
    icon: "✨",
    titulo: "Crear",
    desc: "Convertimos una idea o un ejemplo que te gustó en un carrusel, historias o guión listo para publicar.",
    href: "/creacion",
    cta: "Crear contenido",
    grad: "from-amber-950/40",
    ring: "hover:border-amber-600/70",
  },
  {
    n: 5,
    icon: "📋",
    titulo: "Organizar",
    desc: "Lo que elijas se guarda ordenado en tu calendario de Notion, con fecha y tipo. Todo en un solo lugar.",
    href: "/posts",
    cta: "Ver mi calendario",
    grad: "from-neutral-900",
    ring: "hover:border-neutral-500",
  },
];

export default async function HomePage() {
  const user = await getSessionUser();
  const nombre = user?.displayName?.split(" ")[0];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <section className="pt-6 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          Hola{nombre ? `, ${nombre}` : ""} 👋
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-neutral-400">
          Este es tu asistente de marketing. Sigue los pasos en orden — cada uno te
          lleva de la mano. <span className="text-neutral-200">No necesitas saber nada de marketing.</span>
        </p>
      </section>

      <div className="flex flex-col gap-3">
        {PASOS.map((p) => (
          <Link
            key={p.n}
            href={p.href}
            className={`group flex items-center gap-4 rounded-2xl border border-neutral-800 bg-gradient-to-r ${p.grad} to-neutral-950 p-4 transition-all ${p.ring} hover:shadow-lg hover:shadow-black/30 sm:p-5`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-neutral-500">
                {p.n}
              </span>
              <span className="text-3xl">{p.icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold tracking-tight">{p.titulo}</div>
              <p className="mt-0.5 text-sm text-neutral-400">{p.desc}</p>
            </div>
            <span className="hidden shrink-0 text-sm font-medium text-neutral-400 group-hover:text-white sm:inline">
              {p.cta} →
            </span>
          </Link>
        ))}
      </div>

      <p className="pb-4 text-center text-xs text-neutral-600">
        Descubre → planea → analiza → crea → organiza. Un paso a la vez.
      </p>
    </div>
  );
}
