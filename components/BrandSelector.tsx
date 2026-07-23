"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Brand } from "@/lib/brands";

// Selector de MARCA en el header. La marca activa manda en Cerebro, Creación y
// las sugerencias del Radar. "+ Nueva marca" lleva al onboarding (CEREBRO).
export function BrandSelector({
  brands,
  activeId,
}: {
  brands: Brand[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = brands.find((b) => b.id === activeId) ?? brands[0] ?? null;

  async function activar(id: string) {
    setBusy(true);
    await fetch("/api/brands/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: id }),
    });
    setOpen(false);
    router.refresh();
    setBusy(false);
  }

  if (brands.length === 0) {
    return (
      <button
        onClick={() => router.push("/cerebro")}
        className="whitespace-nowrap rounded-full border border-purple-700 bg-purple-950/40 px-3 py-1 text-xs font-medium text-purple-200 hover:bg-purple-900/40"
      >
        + Crear marca
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
      >
        <span className="text-neutral-500">Marca:</span>
        <span className="max-w-[120px] truncate">{active?.nombre ?? "—"}</span>
        <span className="text-neutral-500">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-neutral-700 bg-neutral-950 p-1 shadow-xl">
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => activar(b.id)}
                className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-800 ${
                  b.id === active?.id ? "text-white" : "text-neutral-300"
                }`}
              >
                {b.id === active?.id ? "✓ " : ""}
                {b.nombre}
              </button>
            ))}
            <div className="my-1 border-t border-neutral-800" />
            <button
              onClick={() => {
                setOpen(false);
                router.push("/cerebro");
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-purple-300 hover:bg-neutral-800"
            >
              + Nueva marca
            </button>
          </div>
        </>
      )}
    </div>
  );
}
