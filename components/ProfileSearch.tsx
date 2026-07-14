"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Cantidad de posts a traer. 12 = 1 request (~2s). Más = paginación (~+2s c/u).
const COUNT_OPTIONS = [12, 24, 48];
const DEFAULT_COUNT = 48;

function toUsername(input: string): string {
  const cleaned = input.trim().replace(/^@/, "");
  const m = cleaned.match(/instagram\.com\/([^/?#]+)/i);
  return (m ? m[1] : cleaned).toLowerCase().replace(/\/+$/, "");
}

export function ProfileSearch() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [going, setGoing] = useState(false);

  function go() {
    const u = toUsername(input);
    if (!u) return;
    setGoing(true);
    router.push(`/a/${encodeURIComponent(u)}?n=${count}`);
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-5">
      <header className="mb-3">
        <h2 className="text-lg font-semibold">⚡ Analizar perfil</h2>
        <p className="text-xs text-neutral-400">
          Resultados en segundos, ordenados por{" "}
          <span className="text-emerald-400">engagement vs. seguidores</span>.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
          autoFocus
          placeholder="@usuario  o  instagram.com/usuario"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={go}
          disabled={going || !input.trim()}
          className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
        >
          {going ? "Analizando…" : "Analizar →"}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
        <span>Publicaciones:</span>
        {COUNT_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            className={
              "rounded border px-2.5 py-1 font-medium transition-colors " +
              (count === n
                ? "border-blue-500 bg-blue-950 text-blue-200"
                : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
            }
          >
            {n}
          </button>
        ))}
        <span className="text-neutral-600">
          {count <= 12 ? "· ~2s" : count <= 24 ? "· ~4s" : "· ~8s"}
        </span>
      </div>
    </section>
  );
}
