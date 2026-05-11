"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Niche } from "@/lib/niches";

export function NicheSelector({
  niches,
  activeSlug,
}: {
  niches: Niche[];
  activeSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const active = niches.find((n) => n.slug === activeSlug) ?? niches[0];

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setErr(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function switchTo(slug: string) {
    if (slug === activeSlug) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/niches/set-active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) throw new Error("Error cambiando de nicho");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name) {
      setErr("Nombre vacío");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/niches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error");
      // Switch automáticamente al nicho recién creado.
      await fetch("/api/niches/set-active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: body.niche.slug }),
      });
      setOpen(false);
      setCreating(false);
      setNewName("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
        title="Cambiar nicho activo"
      >
        <span className="text-neutral-500">Nicho:</span>
        <span className="font-medium text-white">
          {active?.name ?? "—"}
        </span>
        <span className="text-neutral-500">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-neutral-800 bg-neutral-950 p-1 shadow-xl">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
            Cambiar a
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {niches.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => switchTo(n.slug)}
                  disabled={busy}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-800 ${
                    n.slug === activeSlug
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-300"
                  }`}
                >
                  <span>{n.name}</span>
                  {n.slug === activeSlug && (
                    <span className="text-xs text-emerald-400">✓ activo</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="my-1 h-px bg-neutral-800" />

          {!creating ? (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setErr(null);
              }}
              className="w-full rounded px-2 py-1.5 text-left text-sm text-emerald-400 hover:bg-neutral-800"
            >
              + Crear nicho nuevo
            </button>
          ) : (
            <div className="p-2">
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setErr(null);
                  }
                }}
                placeholder="Belleza, Cocina, Cirugía..."
                disabled={busy}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-white placeholder-neutral-600 focus:border-emerald-700 focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={create}
                  disabled={busy || !newName.trim()}
                  className="flex-1 rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {busy ? "..." : "Crear y entrar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setErr(null);
                  }}
                  disabled={busy}
                  className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {err && (
            <div className="px-2 py-1 text-xs text-red-400">{err}</div>
          )}
        </div>
      )}
    </div>
  );
}
