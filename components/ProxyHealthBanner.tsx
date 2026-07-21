"use client";

import { useEffect, useState } from "react";

interface Health {
  ok: boolean;
  code: string;
  message: string;
}

// Chequea la salud del proxy al entrar al Radar y avisa si está sin saldo/caído,
// ANTES de que el usuario pierda tiempo lanzando un análisis que va a fallar.
export function ProxyHealthBanner() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/proxy-health")
      .then((r) => r.json())
      .then((h) => alive && setHealth(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!health || health.ok) return null;

  return (
    <div className="rounded-xl border border-red-700 bg-red-950/50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🚨</span>
        <div className="text-sm">
          <p className="font-semibold text-red-200">
            {health.code === "no_saldo"
              ? "Tu proxy se quedó sin saldo"
              : "El proxy no está respondiendo"}
          </p>
          <p className="mt-1 text-red-300/80">{health.message}</p>
          {health.code === "no_saldo" && (
            <a
              href="https://my.evomi.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
            >
              Revisar el proxy (Evomi) ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
