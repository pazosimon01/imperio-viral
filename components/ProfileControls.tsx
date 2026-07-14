"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

// Versión simplificada de la barra de filtros para la vista de perfil.
// Solo lo esencial: formato y orden. Nada de ventanas, idiomas, tiers, heat
// ni decisiones — eso solo agregaba ruido.

const TYPES = [
  { value: "all", label: "Todos" },
  { value: "Video", label: "🎬 Reels" },
  { value: "Sidecar", label: "🖼️ Carruseles" },
  { value: "Image", label: "📷 Fotos" },
];

const SORTS = [
  { value: "engagementRate", label: "Engagement (vs followers)" },
  { value: "videoViewCount", label: "Más vistas" },
  { value: "engagementScore", label: "Más likes + comments" },
  { value: "postedAt", label: "Más recientes" },
];

export function ProfileControls() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const update = useCallback(
    (key: string, value: string, clearOn: string) => {
      const next = new URLSearchParams(sp.toString());
      if (value === clearOn) next.delete(key);
      else next.set(key, value);
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, sp]
  );

  const activeType = sp.get("type") ?? "all";
  const activeSort = sp.get("sort") ?? "engagementRate";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Formato como pills */}
      <div className="flex gap-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => update("type", t.value, "all")}
            className={
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
              (activeType === t.value
                ? "border-blue-500 bg-blue-950 text-blue-200"
                : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Orden a la derecha */}
      <label className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
        <span>Ordenar:</span>
        <select
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 hover:border-neutral-500 focus:border-blue-500 focus:outline-none"
          value={activeSort}
          onChange={(e) => update("sort", e.target.value, "engagementRate")}
        >
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
