"use client";

import Link from "next/link";
import type { StrategyResult } from "@/lib/cerebro";

export function StrategyView({ r, nombre }: { r: StrategyResult; nombre: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-purple-900/50 bg-gradient-to-br from-purple-950/30 to-neutral-950 p-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-300">
          Lo que está pasando en tu negocio
        </h3>
        <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-100">
          {r.diagnostico}
        </p>
        <div className="mt-3 rounded-xl bg-neutral-900/80 p-3 text-sm">
          🎯 <strong>Lo primero que hay que lograr:</strong> que tu público{" "}
          <span className="text-purple-200">{beliefPlain(r.creenciaObjetivo?.numero)}</span>
          <div className="mt-1 text-neutral-400">{r.creenciaObjetivo?.porQue}</div>
        </div>
      </div>

      <Section title="Ángulos para tu contenido">
        <div className="flex flex-col gap-3">
          {(r.angulos ?? []).map((a, i) => (
            <div key={i} className="border-l-2 border-purple-700/50 pl-3">
              <div className="text-sm font-semibold text-neutral-100">{a.titulo}</div>
              <p className="text-sm text-neutral-400">{a.descripcion}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tu plan para esta semana">
        <div className="flex flex-col gap-2">
          {(r.planSemanal ?? []).map((d, i) => (
            <div key={i} className="rounded-xl bg-neutral-900 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-purple-900/50 px-2 py-0.5 text-xs font-semibold text-purple-200">
                  {d.dia}
                </span>
                <span className="text-xs text-neutral-400">{formatoPlain(d.formato)}</span>
              </div>
              <div className="mt-1 text-neutral-200">{d.idea}</div>
              <div className="text-xs italic text-neutral-500">
                Empieza diciendo: &ldquo;{d.hook}&rdquo;
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="10 ideas listas para grabar">
        <ol className="flex flex-col gap-2">
          {(r.ideas ?? []).map((idea, i) => (
            <li key={i} className="rounded-xl bg-neutral-900 p-3 text-sm">
              <span className="font-mono text-purple-400">{i + 1}.</span>{" "}
              <strong className="text-neutral-100">{idea.titulo}</strong>{" "}
              <span className="text-xs text-neutral-500">({formatoPlain(idea.formato)})</span>
              <div className="text-xs italic text-neutral-400">&ldquo;{idea.hook}&rdquo;</div>
              <Link
                href={`/creacion?idea=${encodeURIComponent(
                  `${idea.titulo}. Empieza así: ${idea.hook}`
                )}&negocio=${encodeURIComponent(nombre)}`}
                className="mt-1 inline-block text-xs font-medium text-emerald-400 hover:underline"
              >
                ✨ Convertir en pieza →
              </Link>
            </li>
          ))}
        </ol>
      </Section>

      <div className="rounded-2xl border border-blue-900/50 bg-gradient-to-br from-blue-950/30 to-neutral-950 p-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
          Siguiente paso: busca ejemplos que ya funcionan
        </h3>
        <p className="text-sm text-neutral-300">{r.busquedasRadar?.nota}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(r.busquedasRadar?.hashtags ?? []).map((h) => (
            <span key={h} className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs">
              #{h}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/descubrir"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            🧲 Descubrir perfiles →
          </Link>
          <Link
            href="/radar"
            className="rounded-lg border border-blue-700 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-950/40"
          >
            🔍 Ir al Radar →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

function beliefPlain(n?: number): string {
  switch (n) {
    case 1: return "confíe en ti y te conozca";
    case 2: return "sienta que sí puede lograrlo";
    case 3: return "crea que tu solución funciona";
    case 4: return "te elija sobre la competencia";
    case 5: return "actúe ahora y no lo deje para después";
    default: return "dé el primer paso";
  }
}

function formatoPlain(f?: string): string {
  const s = (f ?? "").toLowerCase();
  if (s.includes("reel")) return "🎬 Reel";
  if (s.includes("carrus")) return "🖼️ Carrusel";
  if (s.includes("histor")) return "📱 Historias";
  return f ?? "";
}
