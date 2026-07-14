"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SavedSearch } from "@/lib/searches";

// Historial de búsquedas guardadas. Cada chip reabre el análisis; la × lo borra.
export function SavedSearches({ initial }: { initial: SavedSearch[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);

  async function remove(id: string) {
    setItems((xs) => xs.filter((x) => x.id !== id));
    try {
      await fetch(`/api/searches?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      router.refresh();
    } catch {}
  }

  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm uppercase tracking-wide text-neutral-500">
        Búsquedas guardadas
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <div
            key={s.id}
            className="group flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-950 pl-3 pr-1 text-sm hover:border-neutral-600"
          >
            <Link
              href={s.href}
              className="py-1.5 font-medium text-neutral-200"
            >
              {s.type === "multi" ? "👥 " : "⚡ "}
              {s.label}
            </Link>
            <button
              type="button"
              onClick={() => remove(s.id)}
              aria-label="Borrar"
              className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
