"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COUNT_OPTIONS = [12, 24, 48];
const DEFAULT_COUNT = 48;

function parseUsers(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;\n]+/)
        .map((u) =>
          u
            .trim()
            .replace(/^@/, "")
            .replace(/^https?:\/\/.*?instagram\.com\//i, "")
            .replace(/\/+$/, "")
            .toLowerCase()
        )
        .filter(Boolean)
    )
  );
}

export function MultiProfileForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [going, setGoing] = useState(false);

  const users = parseUsers(text);

  function go() {
    if (users.length === 0) return;
    setGoing(true);
    if (users.length > 40) {
      sessionStorage.setItem("multi_users", users.join(","));
      router.push(`/m?from=session&n=${count}`);
    } else {
      router.push(`/m?users=${encodeURIComponent(users.join(","))}&n=${count}`);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
      <header className="mb-3">
        <h2 className="text-base font-semibold">🔍 Investigar perfiles</h2>
        <p className="text-xs text-neutral-500">
          Pega hasta 3000 perfiles (coma o salto de línea). Los analiza a todos y
          junta sus publicaciones ordenadas por{" "}
          <span className="text-emerald-400">engagement vs. seguidores</span>.
        </p>
      </header>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        disabled={going}
        placeholder="pedrosobral, @juanlombana, https://instagram.com/babruna"
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 p-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span>Posts/perfil:</span>
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              disabled={going}
              className={
                "rounded border px-2.5 py-1 font-medium transition-colors disabled:opacity-50 " +
                (count === n
                  ? "border-blue-500 bg-blue-950 text-blue-200"
                  : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
              }
            >
              {n}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={go}
          disabled={going || users.length === 0}
          className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
        >
          {going ? "Analizando…" : `Analizar ${users.length || ""} →`}
        </button>
      </div>
    </section>
  );
}
