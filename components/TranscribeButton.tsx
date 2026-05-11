"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function TranscribeButton({
  postId,
  hasExisting,
}: {
  postId: string;
  hasExisting: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transcribe(force = false) {
    if (
      force &&
      !confirm(
        "¿Re-transcribir? Esto sobrescribe la transcripción actual y consume otra llamada a OpenAI (~$0.005).",
      )
    ) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = `/api/transcribe/${encodeURIComponent(postId)}${force ? "?force=true" : ""}`;
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
          onClick={() => transcribe(true)}
          disabled={loading || isPending}
          className="self-start rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Transcribiendo…" : "↻ Re-transcribir"}
        </button>
        {error && (
          <p className="text-xs text-red-400">⚠ {error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <h3 className="mb-1 text-xs uppercase tracking-wider text-neutral-500">
        📝 Transcripción
      </h3>
      <p className="mb-3 text-xs text-neutral-400">
        Transcribe el audio de este reel con OpenAI gpt-4o-transcribe (≈ $0.005
        por reel). Útil para extraer el guión y replicarlo.
      </p>
      <button
        type="button"
        onClick={() => transcribe(false)}
        disabled={loading || isPending}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? "Transcribiendo… (15-30s)" : "Transcribir audio"}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">⚠ {error}</p>}
    </div>
  );
}
