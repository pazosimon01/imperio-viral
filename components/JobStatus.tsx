"use client";

import { useEffect, useRef, useState } from "react";
import type { Job } from "@/lib/jobs";

const POLL_INTERVAL_MS = 2500;

export function JobStatus({
  jobId,
  onDone,
  onComplete,
}: {
  jobId: string;
  onDone?: () => void;
  // Se dispara UNA vez, automáticamente, cuando el job termina con éxito.
  // Útil para redirigir a los resultados sin que el usuario tenga que clickear.
  onComplete?: (job: Job) => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [tick, setTick] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as Job;
        if (!alive) return;
        setJob(data);
        if (data.status === "running") {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (data.status === "done" && !completedRef.current) {
          completedRef.current = true;
          onComplete?.(data);
        }
      } catch {
        if (!alive) return;
        timer = setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    }
    poll();

    // Tick para mostrar el contador de elapsed mientras corre
    const interval = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
    };
  }, [jobId]);

  if (!job) {
    return (
      <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-400">
        ⏳ Iniciando…
      </div>
    );
  }

  const elapsed = Math.max(
    0,
    (job.finishedAt ?? Math.floor(Date.now() / 1000)) - job.startedAt
  );
  const elapsedStr =
    elapsed >= 60
      ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
      : `${elapsed}s`;

  if (job.status === "running") {
    return (
      <div className="rounded-md border border-blue-800/60 bg-blue-950/30 p-3">
        <div className="flex items-center gap-2 text-sm text-blue-200">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400"></span>
          <span className="flex-1">
            {job.message ?? "Scrapeando…"}
          </span>
          <span className="font-mono text-xs text-blue-400">{elapsedStr}</span>
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          Tarda 1-15 min según tamaño. Puedes seguir navegando — no canceles esta página.
        </div>
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm">
        <div className="font-medium text-red-200">❌ Falló: {job.error}</div>
        {job.result && (
          <pre className="mt-2 overflow-x-auto text-[10px] text-neutral-400">
            {JSON.stringify(job.result, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  // done
  return (
    <div className="rounded-md border border-emerald-800/60 bg-emerald-950/30 p-3">
      <div className="flex items-center gap-2 text-sm text-emerald-200">
        <span>✓</span>
        <span className="flex-1 font-medium">
          {job.message ?? "Listo"}
        </span>
        <span className="font-mono text-xs text-emerald-400">
          {elapsedStr}
        </span>
      </div>

      {Array.isArray(job.result) && job.result.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-neutral-300">
          {job.result.map((r: any, i: number) => (
            <li key={i} className="font-mono">
              {r.error ? (
                <span className="text-red-400">
                  ✕ {r.username ?? r.type}: {r.error}
                </span>
              ) : r.username ? (
                <span>
                  @{r.username}: {r.received} items,{" "}
                  <span className="text-emerald-400">{r.inserted} nuevos</span>
                  {r.updated > 0 && (
                    <span className="text-amber-400">
                      , {r.updated} duplicados
                    </span>
                  )}
                  {r.medianER != null && (
                    <span className="text-emerald-400">
                      {" "}
                      · ER {r.medianER.toFixed(2)}%
                    </span>
                  )}
                </span>
              ) : (
                <span>
                  {r.type}: {r.received} items,{" "}
                  <span className="text-emerald-400">{r.inserted} nuevos</span>
                  {r.updated > 0 && (
                    <span className="text-amber-400">
                      , {r.updated} duplicados (ya estaban de otros hashtags)
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onDone}
        className="mt-3 rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
      >
        Cerrar y refrescar
      </button>
    </div>
  );
}
