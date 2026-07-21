"use client";

import { useState } from "react";
import type { VideoAnalysisResult } from "@/lib/video-analysis";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function AnalyzeVideoButton({
  postId,
  initialAnalysis,
}: {
  postId: string;
  initialAnalysis: { result: VideoAnalysisResult; framesCount: number } | null;
}) {
  const [analysis, setAnalysis] = useState<VideoAnalysisResult | null>(
    initialAnalysis?.result ?? null
  );
  const [frames, setFrames] = useState(initialAnalysis?.framesCount ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analizar() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyze/${postId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error en el análisis");
      } else {
        setAnalysis(data.analysis.result);
        setFrames(data.analysis.framesCount);
      }
    } catch {
      setError("Error de red");
    }
    setBusy(false);
  }

  if (!analysis) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={analizar}
          disabled={busy}
          className="w-full rounded-md border border-cyan-800/60 bg-cyan-950/30 px-3 py-2 text-sm font-medium text-cyan-200 transition-colors hover:border-cyan-500 disabled:opacity-60"
        >
          {busy
            ? "🎥 Analizando frame por frame… (1-2 min)"
            : "🎥 Análisis completo del video (IA visual)"}
        </button>
        {busy && (
          <p className="text-xs text-neutral-500">
            Descargando el video, extrayendo fotogramas, transcribiendo y analizando…
          </p>
        )}
        {error && <p className="text-xs text-red-400">⚠️ {error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-cyan-900/50 bg-cyan-950/20 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            🎥 Qué pasa en el video
          </h3>
          <span className="text-[10px] text-neutral-500">
            {frames} fotogramas · {analysis.idiomaOriginal}
          </span>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-100">
          {analysis.resumenExacto}
        </p>
      </div>

      <details className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-neutral-300">
          🎬 Escena por escena ({analysis.escenas?.length ?? 0})
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          {(analysis.escenas ?? []).map((e: any, i: number) => (
            <div key={i} className="rounded bg-neutral-900 p-2.5">
              <span className="font-mono text-xs text-cyan-400">
                {Math.round(e.segundo)}s
              </span>{" "}
              <span className="text-neutral-200">{e.queSeVe}</span>
              {e.textoEnPantalla && (
                <div className="mt-1 text-xs text-amber-200/90">
                  📝 En pantalla: &ldquo;{e.textoEnPantalla}&rdquo;
                </div>
              )}
            </div>
          ))}
        </div>
      </details>

      {analysis.transcripcionEspanol && (
        <details className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
          <summary className="cursor-pointer font-medium text-neutral-300">
            🌎 Transcripción en español
            {analysis.idiomaOriginal && analysis.idiomaOriginal !== "es"
              ? ` (traducida del ${analysis.idiomaOriginal})`
              : ""}
          </summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-neutral-200">
            {analysis.transcripcionEspanol}
          </p>
        </details>
      )}

      <div className="grid gap-3">
        <MiniCard titulo="👁️ Hook visual (primeros segundos)" texto={analysis.hookVisual} />
        <MiniCard titulo="🎨 Estilo y edición" texto={analysis.estiloVisual} />
        <MiniCard titulo="🚀 Por qué funciona" texto={analysis.porQueFunciona} />
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
            📐 Fórmula para replicarlo
          </h4>
          <p className="whitespace-pre-line font-mono text-xs leading-relaxed text-emerald-100">
            {analysis.formulaReplicable}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={analizar}
        disabled={busy}
        className="self-start text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-50"
      >
        {busy ? "Re-analizando…" : "↺ Re-analizar"}
      </button>
      {error && <p className="text-xs text-red-400">⚠️ {error}</p>}
    </div>
  );
}

function MiniCard({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {titulo}
      </h4>
      <p className="whitespace-pre-line leading-relaxed text-neutral-200">{texto}</p>
    </div>
  );
}
