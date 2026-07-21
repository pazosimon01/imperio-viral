"use client";

import { useState } from "react";

// Etiquetas editoriales que ya usas en la tabla "Simon ideas" de Notion.
// Si agregas una nueva en Notion, súmala acá para tenerla a un clic.
const TIPOS = [
  "conciencia",
  "viral/b-rolls",
  "aporta valor",
  "Humor",
  "motivación",
  "hablando",
] as const;

type State =
  | { kind: "idle" }
  | { kind: "picking" }
  | { kind: "sending" }
  | { kind: "done"; url?: string; duplicated: boolean }
  | { kind: "error"; msg: string };

export function NotionButton({
  postId,
  hasAdaptation = false,
}: {
  postId: string;
  hasAdaptation?: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [includeGuion, setIncludeGuion] = useState(hasAdaptation);

  async function send(tipo: string | null) {
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/notion/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, tipo, includeGuion }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", msg: data.error ?? "Error al enviar" });
        return;
      }
      setState({
        kind: "done",
        url: data.url,
        duplicated: !!data.duplicated,
      });
    } catch (e) {
      setState({
        kind: "error",
        msg: e instanceof Error ? e.message : "Error de red",
      });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm">
        <span className="text-emerald-300">
          {state.duplicated ? "✓ Ya estaba en Notion" : "✓ Enviado a Notion"}
        </span>
        <div className="flex items-center gap-3">
          {state.url && (
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              Ver ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => setState({ kind: "idle" })}
            className="text-neutral-400 hover:text-neutral-200"
            title="Enviar otra vez"
          >
            ↺
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "idle" || state.kind === "error") {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setState({ kind: "picking" })}
          className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-700"
        >
          📋 Enviar a Notion
        </button>
        {state.kind === "error" && (
          <p className="text-xs text-red-400">⚠️ {state.msg}</p>
        )}
      </div>
    );
  }

  // picking | sending
  const disabled = state.kind === "sending";
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-700 bg-neutral-900 p-3">
      <div className="text-xs uppercase tracking-wider text-neutral-500">
        Elegí el tipo → se envía
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => send(t)}
            className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 transition-colors hover:border-blue-500 hover:bg-blue-950/40 disabled:opacity-40"
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => send(null)}
          className="rounded-full border border-dashed border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 transition-colors hover:border-neutral-500 disabled:opacity-40"
        >
          sin tipo
        </button>
      </div>

      {hasAdaptation && (
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={includeGuion}
            disabled={disabled}
            onChange={(e) => setIncludeGuion(e.target.checked)}
            className="accent-purple-600"
          />
          Incluir el guión adaptado
        </label>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          {disabled ? "Enviando…" : ""}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setState({ kind: "idle" })}
          className="text-xs text-neutral-500 hover:text-neutral-300 disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
