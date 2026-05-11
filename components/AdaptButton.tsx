"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdaptButton({
  postId,
  hasExisting,
  sourceLang,
}: {
  postId: string;
  hasExisting: boolean;
  sourceLang: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adapt(force = false) {
    if (
      force &&
      !confirm(
        "¿Re-adaptar? Esto sobrescribe la adaptación actual y consume otra llamada a Claude (~$0.015).",
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = `/api/adapt/${encodeURIComponent(postId)}${force ? "?force=true" : ""}`;
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (hasExisting) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => adapt(true)}
          disabled={loading || isPending}
          className="self-start rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Adaptando…" : "↻ Re-adaptar"}
        </button>
        {error && <p className="text-xs text-red-400">⚠ {error}</p>}
      </div>
    );
  }

  const langLabel = sourceLang ? `(idioma origen: ${sourceLang})` : "";

  return (
    <div className="rounded-lg border border-purple-900/50 bg-purple-950/20 p-4">
      <h3 className="mb-1 text-xs uppercase tracking-wider text-purple-300">
        🌐 Adaptar al español + Anatomía
      </h3>
      <p className="mb-3 text-xs text-neutral-400">
        Adapta el guión al español de Latam {langLabel}, descompone hook /
        desarrollo / CTA, genera plantilla replicable y 5 hooks alternos.
        Modelo: Claude Sonnet 4.6 (≈ $0.015).
      </p>
      <button
        type="button"
        onClick={() => adapt(false)}
        disabled={loading || isPending}
        className="rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
      >
        {loading ? "Adaptando… (10-25s)" : "Adaptar y analizar"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">⚠ {error}</p>}
    </div>
  );
}
