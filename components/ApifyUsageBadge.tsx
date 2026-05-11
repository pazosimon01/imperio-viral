"use client";

import { useEffect, useState } from "react";

interface Usage {
  planName: string;
  monthlyCreditUsd: number;
  usedUsd: number;
  percentUsed: number;
  daysRemaining: number | null;
  topServices: Array<{ service: string; usd: number }>;
}

export function ApifyUsageBadge() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/apify/usage")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
        return data as Usage;
      })
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <span className="ml-auto text-xs text-neutral-600">Apify…</span>
    );
  }
  if (error || !usage) {
    return (
      <span
        className="ml-auto text-xs text-red-500/70"
        title={error ?? "Sin datos"}
      >
        Apify: —
      </span>
    );
  }

  const colorClass =
    usage.percentUsed >= 90
      ? "border-red-700 bg-red-950/40 text-red-200"
      : usage.percentUsed >= 70
        ? "border-yellow-700 bg-yellow-950/40 text-yellow-200"
        : "border-emerald-800 bg-emerald-950/40 text-emerald-200";

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-xs ${colorClass}`}
        title="Click para detalles"
      >
        <span>
          Apify ${usage.usedUsd.toFixed(2)} / ${usage.monthlyCreditUsd}
        </span>
        <span className="opacity-70">
          {usage.percentUsed.toFixed(0)}%
        </span>
        {usage.daysRemaining != null && (
          <span className="opacity-50">· {usage.daysRemaining}d</span>
        )}
      </button>

      {expanded && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-xs shadow-xl"
          onMouseLeave={() => setExpanded(false)}
        >
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-neutral-400">Plan</span>
            <span className="font-semibold text-neutral-100">
              {usage.planName}
            </span>
          </div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-neutral-400">Ciclo termina en</span>
            <span className="text-neutral-100">
              {usage.daysRemaining != null
                ? `${usage.daysRemaining} días`
                : "—"}
            </span>
          </div>

          <div className="mb-3 h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full ${
                usage.percentUsed >= 90
                  ? "bg-red-500"
                  : usage.percentUsed >= 70
                    ? "bg-yellow-500"
                    : "bg-emerald-500"
              }`}
              style={{
                width: `${Math.min(100, usage.percentUsed).toFixed(1)}%`,
              }}
            />
          </div>

          {usage.topServices.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-neutral-500">Top servicios del mes</div>
              <ul className="space-y-1">
                {usage.topServices.map((s) => (
                  <li
                    key={s.service}
                    className="flex justify-between text-neutral-200"
                  >
                    <span className="truncate pr-2">{s.service}</span>
                    <span className="font-mono">${s.usd.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <a
            href="https://console.apify.com/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded bg-neutral-800 px-2 py-1.5 text-center text-neutral-200 hover:bg-neutral-700"
          >
            Abrir billing en Apify ↗
          </a>
        </div>
      )}
    </div>
  );
}
