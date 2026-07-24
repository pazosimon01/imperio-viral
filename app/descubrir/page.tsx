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
  const [modo, setModo] = useState<"cuentas" | "hashtags">("hashtags");
  const [hashtagText, setHashtagText] = useState("");
  const [buscandoHash, setBuscandoHash] = useState(false);

  // Hashtags sugeridos por nicho — un clic los carga y en ~13s salen ~100 perfiles.
  // (Para cuentas chicas de belleza, "cuentas parecidas" no sirve: IG no sugiere
  // relacionados. Los hashtags son la vía confiable.)
  const SUGERENCIAS: Record<string, string[]> = {
    "Belleza / estética": [
      "botox", "armonizacionfacial", "disenodesonrisa", "rinomodelacion",
      "acidohialuronico", "medicinaestetica", "odontologiaestetica",
      "rejuvenecimiento", "bioestimuladores", "lifting", "ortodoncia",
      "carillasdental", "depilacionlaser", "esteticafacial",
    ],
    "Emprendimiento / dinero": [
      "emprendimiento", "libertadfinanciera", "negociosonline", "mentalidadmillonaria",
      "finanzaspersonales", "marketingdigital", "ingresospasivos", "emprendedores",
    ],
  };

  function agregarHashtags(tags: string[]) {
    setHashtagText((prev) => {
      const yaHay = new Set(
        prev.split(/[\s,;\n]+/).map((s) => s.trim().replace(/^#+/, "").toLowerCase()).filter(Boolean)
      );
      const nuevos = tags.filter((t) => !yaHay.has(t.toLowerCase()));
      const base = prev.trim();
      return (base ? base + ", " : "") + nuevos.join(", ");
    });
  }

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

  // Descubrir por HASHTAGS (vía Apify) — reemplazo del scraper viejo de Chrome.
  async function buscarPorHashtag() {
    setError(null);
    const hashtags = hashtagText
      .split(/[\s,;\n]+/)
      .map((h) => h.trim().replace(/^#+/, ""))
      .filter(Boolean);
    if (hashtags.length === 0) {
      setError("Escribe al menos un hashtag (ej: botox, diseñodesonrisa).");
      return;
    }
    setBuscandoHash(true);
    setFound([]);
    setDone(false);
    try {
      const res = await fetch("/api/discover-hashtag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashtags, porHashtag: 60 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo buscar");
      } else {
        setFound(
          (data.profiles ?? []).map((p: { username: string; fullName: string | null }) => ({
            username: p.username,
            fullName: p.fullName,
            isVerified: false,
            via: "hashtag",
          }))
        );
        setDone(true);
      }
    } catch {
      setError("Error de red");
    }
    setBuscandoHash(false);
  }

  // Puente: toma los perfiles hallados por hashtag y los usa como semillas de la
  // bola de nieve (rápida) para ampliar a cientos en segundos, sin otro minuto de Apify.
  async function ampliarConBolaDeNieve() {
    const seeds = found.map((f) => f.username).slice(0, 20);
    if (seeds.length === 0) return;
    setError(null);
    setFound([]);
    setDone(false);
    setExplored(0);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seeds, target: 300 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo ampliar");
        return;
      }
      setTarget(300);
      setJobId(data.jobId);
    } catch {
      setError("Error de red");
    }
  }

  const pct = target > 0 ? Math.min(100, Math.round((found.length / target) * 100)) : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="pt-2 text-center">
        <div className="text-4xl">🧲</div>
        <h1 className="mt-1 text-3xl font-bold">Descubrir perfiles</h1>
        <p className="mx-auto mt-2 max-w-xl text-neutral-400">
          Paso 1. ¿No sabes a quién analizar? Pon los <strong className="text-white">hashtags de tu nicho</strong> y
          encuentro <strong className="text-white">cientos de perfiles</strong> en segundos. Sin instalar nada.
        </p>
      </section>

      <ProxyHealthBanner />

      {!jobId && found.length === 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          {/* Elegir el método de descubrimiento. Primero el rápido. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setModo("cuentas")}
              className={`flex flex-col items-center rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                modo === "cuentas"
                  ? "border-blue-500 bg-blue-950/40 text-blue-200"
                  : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              👥 Por cuentas parecidas
              <span className="mt-0.5 text-[11px] font-normal text-emerald-400">⚡ segundos</span>
            </button>
            <button
              onClick={() => setModo("hashtags")}
              className={`flex flex-col items-center rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                modo === "hashtags"
                  ? "border-blue-500 bg-blue-950/40 text-blue-200"
                  : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              # Por hashtags
              <span className="mt-0.5 text-[11px] font-normal text-emerald-400">⚡ segundos · sin cuentas</span>
            </button>
          </div>

          {modo === "hashtags" ? (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-300">
                  Hashtags de tu nicho
                </label>
                <textarea
                  value={hashtagText}
                  onChange={(e) => setHashtagText(e.target.value)}
                  rows={2}
                  placeholder="botox, diseñodesonrisa, armonizacionfacial"
                  className="w-full rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-100 placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1.5 text-xs text-neutral-500">
                  💡 Cada hashtag suma ~8-10 perfiles (límite de Instagram). Para
                  encontrar muchos, <strong className="text-neutral-300">pon varios</strong> (5-10 hashtags).
                  Rápido y sin riesgo a tu cuenta.
                </p>
                {/* Sugerencias por nicho: un clic carga el set completo → ~100 perfiles en ~13s. */}
                <div className="mt-3 space-y-2">
                  {Object.entries(SUGERENCIAS).map(([nicho, tags]) => (
                    <div key={nicho}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                          {nicho}
                        </span>
                        <button
                          onClick={() => agregarHashtags(tags)}
                          className="text-[11px] font-medium text-blue-400 hover:text-blue-300"
                        >
                          + usar todos
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t) => (
                          <button
                            key={t}
                            onClick={() => agregarHashtags([t])}
                            className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:border-blue-500 hover:text-blue-200"
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {error && <p className="text-sm text-red-400">⚠️ {error}</p>}
              <button
                onClick={buscarPorHashtag}
                disabled={buscandoHash}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:bg-neutral-700"
              >
                {buscandoHash ? "Buscando perfiles… (~1 min)" : "# Encontrar perfiles por hashtag →"}
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {(jobId || found.length > 0) && (
        <>
          {jobId && (
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
          )}

          {found.length > 0 && (
            <div className="sticky top-2 z-10 flex flex-wrap gap-2 rounded-xl border border-neutral-800 bg-neutral-950/90 p-3 backdrop-blur">
              <button
                onClick={() => analizarSeleccionados(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                🔍 Analizar los {found.length} en el Radar →
              </button>
              {!jobId && done && (
                <button
                  onClick={ampliarConBolaDeNieve}
                  className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-950/40"
                  title="Usa estos perfiles como semilla y encuentra cientos más al instante"
                >
                  ⚡ Ampliar a cientos al instante
                </button>
              )}
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
                setFound([]);
                setDone(false);
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
