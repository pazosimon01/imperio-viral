"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function TranscriptionEditor({
  postId,
  initialText,
  hasAdaptation,
}: {
  postId: string;
  initialText: string;
  hasAdaptation: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [text, setText] = useState(initialText);
  const [draft, setDraft] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function enterEdit() {
    if (
      hasAdaptation &&
      !confirm(
        "Editar la transcripción borra la adaptación al español actual (vas a tener que volver a adaptar). ¿Continuar?",
      )
    ) {
      return;
    }
    setDraft(text);
    setError(null);
    setMode("edit");
  }

  function cancelEdit() {
    setDraft(text);
    setError(null);
    setMode("read");
  }

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("La transcripción no puede quedar vacía.");
      return;
    }
    if (trimmed === text) {
      setMode("read");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/transcribe/${encodeURIComponent(postId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      setText(trimmed);
      setMode("read");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "read") {
    return (
      <div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-200">
          {text}
        </p>
        <button
          type="button"
          onClick={enterEdit}
          disabled={isPending}
          className="mt-3 self-start rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
        >
          ✏️ Editar transcripción
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={Math.max(6, Math.ceil(draft.length / 80))}
        className="w-full rounded border border-blue-700 bg-neutral-900 p-3 text-sm leading-relaxed text-neutral-100 focus:border-blue-500 focus:outline-none"
        placeholder="Corrige palabras mal transcritas (ej. Cloud → Claude)…"
      />
      {hasAdaptation && (
        <p className="text-[11px] text-yellow-500">
          ⚠ Al guardar, se borra la adaptación al español. Tendrás que
          re-adaptar.
        </p>
      )}
      {error && <p className="text-xs text-red-400">⚠ {error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
