"use client";

// Panel "Pescar ideas ganadoras": un clic y la IA revisa TODAS las publicaciones
// del análisis contra la memoria de la marca activa — descarta las que hablan de
// otra cosa, van contra las creencias del cliente o no son replicables, y
// devuelve solo las ideas que sirven, con el porqué y cómo adaptarlas.
// (Reemplaza las ~4 horas de revisión manual.)

import { useState } from "react";
import Link from "next/link";

interface IdeaPescada {
  puntaje: number;
  veredicto: "ganadora" | "posible";
  razon: string;
  comoAdaptar: string;
  post: {
    url: string;
    ownerUsername: string | null;
    caption: string | null;
    engagementRate: number | null;
    likes: number;
    comments: number;
    views: number | null;
    mediaType: string | null;
    thumbnailUrl: string | null;
  };
}

export function PescarPanel({ jobId, totalPosts }: { jobId: string; totalPosts: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<IdeaPescada[] | null>(null);
  const [marca, setMarca] = useState<string>("");
  const [stats, setStats] = useState<{ evaluados: number; descartados: number } | null>(null);

  async function pescar() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pescar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo pescar.");
      } else {
        setIdeas(data.ideas ?? []);
        setMarca(data.marca ?? "");
        setStats({ evaluados: data.evaluados ?? 0, descartados: data.descartados ?? 0 });
      }
    } catch {
      setError("Error de red.");
    }
    setBusy(false);
  }

  function ideaParaCrear(idea: IdeaPescada): string {
    const cap = (idea.post.caption ?? "").replace(/\s+/g, " ").slice(0, 400);
    return `Viral de @${idea.post.ownerUsername ?? "?"} (${idea.post.engagementRate ?? "?"}% ER): "${cap}" — Cómo adaptarlo: ${idea.comoAdaptar}`;
  }

  return (
    <div className="rounded-2xl border border-purple-800/60 bg-purple-950/20 p-5">
      {!ideas && (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">🎣 Pescar ideas ganadoras</h3>
            <p className="mt-1 text-sm text-neutral-400">
              La IA revisa las {totalPosts.toLocaleString()} publicaciones contra el plan de tu
              marca y te deja <strong className="text-purple-300">solo las replicables</strong> —
              descarta temas ajenos, creencias contrarias y humor no copiable. En ~30 segundos,
              no en 4 horas.
            </p>
          </div>
          <button
            onClick={pescar}
            disabled={busy}
            className="shrink-0 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:bg-neutral-700"
          >
            {busy ? "🎣 Pescando… (~30s)" : "🎣 Pescar ahora →"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">⚠️ {error}</p>}

      {ideas && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-white">
              🎣 {ideas.length} ideas para <span className="text-purple-300">{marca}</span>
            </h3>
            {stats && (
              <span className="text-xs text-neutral-500">
                revisó {stats.evaluados} · descartó {stats.descartados} que no servían
              </span>
            )}
          </div>

          {ideas.length === 0 && (
            <p className="text-sm text-neutral-400">
              Ninguna publicación pasó el filtro para esta marca. Prueba analizar más perfiles
              o revisa que la marca activa (arriba) sea la correcta.
            </p>
          )}

          {ideas.map((idea, k) => (
            <div
              key={k}
              className={`rounded-xl border p-4 ${
                idea.veredicto === "ganadora"
                  ? "border-emerald-700/60 bg-emerald-950/20"
                  : "border-neutral-800 bg-neutral-950"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    idea.veredicto === "ganadora"
                      ? "bg-emerald-600 text-white"
                      : "bg-neutral-700 text-neutral-200"
                  }`}
                >
                  {idea.veredicto === "ganadora" ? "🏆 GANADORA" : "🤔 posible"} · {idea.puntaje}
                </span>
                <a
                  href={idea.post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-300 hover:text-blue-200"
                >
                  @{idea.post.ownerUsername} ↗
                </a>
                {idea.post.engagementRate != null && (
                  <span className="text-neutral-400">{idea.post.engagementRate}% ER</span>
                )}
                {idea.post.views != null && (
                  <span className="text-neutral-500">
                    {idea.post.views.toLocaleString()} vistas
                  </span>
                )}
              </div>
              {idea.post.caption && (
                <p className="mt-2 line-clamp-2 text-xs text-neutral-500">
                  "{idea.post.caption.replace(/\s+/g, " ").slice(0, 180)}"
                </p>
              )}
              <p className="mt-2 text-sm text-neutral-300">
                <strong className="text-white">Por qué sirve:</strong> {idea.razon}
              </p>
              {idea.comoAdaptar && (
                <p className="mt-1 text-sm text-neutral-300">
                  <strong className="text-purple-300">Cómo adaptarla:</strong> {idea.comoAdaptar}
                </p>
              )}
              <div className="mt-3">
                <Link
                  href={`/creacion?idea=${encodeURIComponent(ideaParaCrear(idea))}`}
                  className="inline-block rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500"
                >
                  ✨ Crear contenido con esta idea →
                </Link>
              </div>
            </div>
          ))}

          <button
            onClick={pescar}
            disabled={busy}
            className="self-start text-sm text-neutral-500 hover:text-neutral-300"
          >
            {busy ? "Pescando de nuevo…" : "↺ Volver a pescar"}
          </button>
        </div>
      )}
    </div>
  );
}
