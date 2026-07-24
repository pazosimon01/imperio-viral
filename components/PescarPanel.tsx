"use client";

// Panel "Pescar ideas ganadoras" (versión profunda): la IA primero filtra por
// texto y después VE los videos candidatos — transcribe el audio y mira los
// frames — para juzgar la narrativa contra la marca activa. Cada idea ganadora
// llega con su VIDEO reproducible + qué dice + qué se ve + cómo replicarla.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Profundo {
  resumenVideo: string;
  queDice: string;
  razonMarca: string;
  comoReplicar: string;
  conAudio: boolean;
}

interface Idea {
  puntaje: number;
  veredicto: "ganadora" | "posible";
  razon: string;
  comoAdaptar: string;
  profundo: Profundo | null;
  post: {
    id: string;
    url: string;
    ownerUsername: string | null;
    caption: string | null;
    engagementRate: number | null;
    views: number | null;
    mediaType: string | null;
    thumbnailUrl: string | null;
    videoUrl: string | null;
  };
}

interface Pesca {
  fase: "rapida" | "profunda" | "lista";
  evaluados: number;
  descartadosRapido: number;
  descartadosProfundo: number;
  profundoTotal: number;
  profundoDone: number;
  ideas: Idea[];
  ligeras: Idea[];
  marca: string;
  done: boolean;
  error: string | null;
}

export function PescarPanel({ jobId, totalPosts }: { jobId: string; totalPosts: number }) {
  const [pescaId, setPescaId] = useState<string | null>(null);
  const [pesca, setPesca] = useState<Pesca | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function pescar() {
    setStarting(true);
    setError(null);
    setPesca(null);
    try {
      const res = await fetch("/api/pescar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "No se pudo pescar.");
      else setPescaId(data.pescaId);
    } catch {
      setError("Error de red.");
    }
    setStarting(false);
  }

  useEffect(() => {
    if (!pescaId) return;
    let alive = true;
    async function tick() {
      try {
        const res = await fetch(`/api/pescar/${pescaId}`);
        if (res.ok) {
          const data = (await res.json()) as Pesca;
          if (!alive) return;
          setPesca(data);
          if (data.done) return;
        }
      } catch {}
      if (alive) pollRef.current = setTimeout(tick, 2500);
    }
    tick();
    return () => {
      alive = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [pescaId]);

  function ideaParaCrear(idea: Idea): string {
    const base = idea.profundo
      ? `Reel de @${idea.post.ownerUsername ?? "?"} (${idea.post.engagementRate ?? "?"}% ER). QUÉ PASA EN EL VIDEO: ${idea.profundo.resumenVideo} QUÉ DICE: ${idea.profundo.queDice} CÓMO REPLICARLO: ${idea.profundo.comoReplicar}`
      : `Viral de @${idea.post.ownerUsername ?? "?"}: "${(idea.post.caption ?? "").replace(/\s+/g, " ").slice(0, 300)}" — Cómo adaptarlo: ${idea.comoAdaptar}`;
    return base.slice(0, 1500);
  }

  const enCurso = pesca && !pesca.done;

  return (
    <div className="rounded-2xl border border-purple-800/60 bg-purple-950/20 p-5">
      {!pescaId && (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">🎣 Pescar ideas ganadoras</h3>
            <p className="mt-1 text-sm text-neutral-400">
              La IA filtra las {totalPosts.toLocaleString()} publicaciones y luego{" "}
              <strong className="text-purple-300">VE los videos candidatos</strong> — escucha lo
              que dicen y mira cada escena — para juzgar si la narrativa le sirve a tu marca.
              Las ganadoras llegan con su video para que lo veas aquí mismo. Tarda ~2-3 min.
            </p>
          </div>
          <button
            onClick={pescar}
            disabled={starting}
            className="shrink-0 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:bg-neutral-700"
          >
            {starting ? "Arrancando…" : "🎣 Pescar ahora →"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">⚠️ {error}</p>}

      {pesca && (
        <div className="flex flex-col gap-3">
          {/* Progreso */}
          {enCurso && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-sm text-purple-200">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-purple-400" />
                {pesca.fase === "rapida"
                  ? `Filtrando ${pesca.evaluados || totalPosts} publicaciones por texto…`
                  : `👁️ Viendo los videos como lo harías tú… (${pesca.profundoDone}/${pesca.profundoTotal})`}
              </div>
              {pesca.fase === "profunda" && pesca.profundoTotal > 0 && (
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-500"
                    style={{ width: `${Math.round((pesca.profundoDone / pesca.profundoTotal) * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-neutral-500">
                Puedes bloquear la pantalla — sigue en el servidor. Las ganadoras van apareciendo abajo.
              </p>
            </div>
          )}

          {pesca.done && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">
                🎣 {pesca.ideas.length} ideas vistas y aprobadas para{" "}
                <span className="text-purple-300">{pesca.marca}</span>
              </h3>
              <span className="text-xs text-neutral-500">
                filtró {pesca.evaluados} · descartó {pesca.descartadosRapido} por texto ·{" "}
                {pesca.descartadosProfundo} tras ver el video
              </span>
            </div>
          )}

          {pesca.done && pesca.ideas.length === 0 && pesca.ligeras.length === 0 && (
            <p className="text-sm text-neutral-400">
              Ningún video pasó el filtro para esta marca. Analiza más perfiles o revisa que la
              marca activa sea la correcta.
            </p>
          )}

          {/* Ideas PROFUNDAS: con video reproducible */}
          {pesca.ideas.map((idea, k) => (
            <div
              key={idea.post.id || k}
              className={`rounded-xl border p-4 ${
                idea.veredicto === "ganadora"
                  ? "border-emerald-700/60 bg-emerald-950/20"
                  : "border-neutral-800 bg-neutral-950"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                {/* El VIDEO — para verlo aquí mismo antes de replicar */}
                {idea.post.videoUrl && (
                  <video
                    src={idea.post.videoUrl}
                    poster={idea.post.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    preload="none"
                    className="w-full shrink-0 rounded-lg bg-black sm:w-44"
                    style={{ aspectRatio: "9/16", objectFit: "cover" }}
                  />
                )}
                <div className="min-w-0 flex-1">
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
                  </div>

                  {idea.profundo && (
                    <div className="mt-2 flex flex-col gap-1.5 text-sm text-neutral-300">
                      <p>
                        <strong className="text-white">👁️ Qué pasa en el video:</strong>{" "}
                        {idea.profundo.resumenVideo}
                      </p>
                      {idea.profundo.queDice && (
                        <p>
                          <strong className="text-white">🗣️ Qué dice:</strong> {idea.profundo.queDice}
                        </p>
                      )}
                      <p>
                        <strong className="text-purple-300">Por qué le sirve a tu marca:</strong>{" "}
                        {idea.profundo.razonMarca}
                      </p>
                      {idea.profundo.comoReplicar && (
                        <p className="rounded-lg bg-neutral-900 p-2.5 text-xs leading-relaxed">
                          <strong className="text-emerald-300">🎬 Cómo replicarlo:</strong>{" "}
                          {idea.profundo.comoReplicar}
                        </p>
                      )}
                    </div>
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
              </div>
            </div>
          ))}

          {/* No-videos que pasaron el filtro rápido (carruseles/fotos) */}
          {pesca.done && pesca.ligeras.length > 0 && (
            <details className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <summary className="cursor-pointer text-sm font-medium text-neutral-300">
                📸 {pesca.ligeras.length} carruseles/fotos prometedores (juzgados por su texto)
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {pesca.ligeras.map((idea, k) => (
                  <div key={k} className="rounded-lg border border-neutral-800 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-neutral-400">{idea.puntaje}</span>
                      <a
                        href={idea.post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-300 hover:text-blue-200"
                      >
                        @{idea.post.ownerUsername} ↗
                      </a>
                    </div>
                    <p className="mt-1 text-neutral-300">{idea.razon}</p>
                    <Link
                      href={`/creacion?idea=${encodeURIComponent(ideaParaCrear(idea))}`}
                      className="mt-2 inline-block text-xs font-semibold text-purple-300 hover:text-purple-200"
                    >
                      ✨ Crear con esta idea →
                    </Link>
                  </div>
                ))}
              </div>
            </details>
          )}

          {pesca.done && (
            <button
              onClick={() => {
                setPescaId(null);
                setPesca(null);
              }}
              className="self-start text-sm text-neutral-500 hover:text-neutral-300"
            >
              ↺ Volver a pescar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
