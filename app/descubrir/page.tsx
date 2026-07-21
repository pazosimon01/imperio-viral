"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProxyHealthBanner } from "@/components/ProxyHealthBanner";

interface Found {
  username: string;
  fullName: string | null;
  isVerified: boolean;
  via: string;
}

export default function DescubrirPage() {
  const router = useRouter();
  const [seedText, setSeedText] = useState("");
  const [target, setTarget] = useState(100);
  const [jobId, setJobId] = useState<string | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [done, setDone] = useState(false);
  const [explored, setExplored] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function iniciar() {
    setError(null);
    const seeds = seedText
      .split(/[\s,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (seeds.length === 0) {
      setError("Escribe al menos una cuenta de ejemplo (ej: @juanlombana).");
      return;
    }
    setFound([]);
    setDone(false);
    setExplored(0);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seeds, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar");
        return;
      }
      setJobId(data.jobId);
    } catch {
      setError("Error de red");
    }
  }

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    async function tick() {
      try {
        const res = await fetch(`/api/discover/${jobId}`);
        const data = await res.json();
        if (!alive) return;
        if (res.ok) {
          setFound(data.found ?? []);
          setExplored(data.explored ?? 0);
          if (data.done) {
            setDone(true);
            return;
          }
        }
      } catch {}
      if (alive) pollRef.current = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      alive = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [jobId]);

  function toggle(u: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  }

  function analizarSeleccionados(todos = false) {
    const users = todos ? found.map((f) => f.username) : [...selected];
    if (users.length === 0) return;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("multi_users", users.join(","));
    }
    router.push("/m?from=session&n=48");
  }

  const pct = target > 0 ? Math.min(100, Math.round((found.length / target) * 100)) : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="pt-2 text-center">
        <div className="text-4xl">🧲</div>
        <h1 className="mt-1 text-3xl font-bold">Descubrir perfiles</h1>
        <p className="mx-auto mt-2 max-w-xl text-neutral-400">
          Paso 1. ¿No sabes a quién analizar? Dame 1 o 2 cuentas parecidas a tu
          nicho y encuentro <strong className="text-white">cientos de perfiles similares</strong> por ti.
          Sin instalar nada.
        </p>
      </section>

      <ProxyHealthBanner />

      {!jobId && (
        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-300">
              Cuentas de ejemplo de tu nicho
            </label>
            <textarea
              value={seedText}
              onChange={(e) => setSeedText(e.target.value)}
              rows={2}
              placeholder="@juanlombana, @pedrosobral"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-neutral-500">
              💡 Piensa en 1-2 referentes de tu sector. Instagram nos dirá quiénes se le parecen.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-300">
              ¿Cuántos perfiles quieres encontrar?
            </label>
            <div className="flex flex-wrap gap-2">
              {[50, 100, 200, 500].map((n) => (
                <button
                  key={n}
                  onClick={() => setTarget(n)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    target === n
                      ? "border-blue-500 bg-blue-950/50 text-blue-200"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">⚠️ {error}</p>}
          <button
            onClick={iniciar}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            🧲 Encontrar perfiles →
          </button>
        </div>
      )}

      {jobId && (
        <>
          <div className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-neutral-300">
                {!done && (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                )}
                {done ? "✅ Listo" : "Buscando perfiles parecidos…"}
              </span>
              <span className="tabular-nums text-neutral-400">
                {found.length}/{target}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {!done && (
              <p className="text-xs text-neutral-500">
                Puedes bloquear el teléfono — la búsqueda sigue en el servidor.
              </p>
            )}
          </div>

          {found.length > 0 && (
            <div className="sticky top-2 z-10 flex flex-wrap gap-2 rounded-xl border border-neutral-800 bg-neutral-950/90 p-3 backdrop-blur">
              <button
                onClick={() => analizarSeleccionados(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                🔍 Analizar los {found.length} en el Radar →
              </button>
              {selected.size > 0 && (
                <button
                  onClick={() => analizarSeleccionados(false)}
                  className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-950/40"
                >
                  Analizar {selected.size} seleccionados →
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {found.map((f) => {
              const on = selected.has(f.username);
              return (
                <button
                  key={f.username}
                  onClick={() => toggle(f.username)}
                  className={`flex flex-col rounded-xl border p-3 text-left transition-colors ${
                    on
                      ? "border-emerald-500 bg-emerald-950/30"
                      : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
                  }`}
                >
                  <span className="flex items-center gap-1 text-sm font-medium text-neutral-100">
                    @{f.username}
                    {f.isVerified && <span className="text-blue-400">✓</span>}
                    {on && <span className="ml-auto text-emerald-400">✓</span>}
                  </span>
                  {f.fullName && (
                    <span className="truncate text-xs text-neutral-500">{f.fullName}</span>
                  )}
                </button>
              );
            })}
          </div>

          {done && (
            <button
              onClick={() => {
                setJobId(null);
                setSelected(new Set());
              }}
              className="mx-auto text-sm text-neutral-500 hover:text-neutral-300"
            >
              ↺ Buscar de nuevo
            </button>
          )}
        </>
      )}
    </div>
  );
}
