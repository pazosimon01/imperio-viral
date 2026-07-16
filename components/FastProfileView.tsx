"use client";

import { useCallback, useMemo, useState } from "react";
import type { FastProfile, FastPost } from "@/lib/ig-fast";

const TYPE_ICON: Record<FastPost["mediaType"], string> = {
  image: "📷",
  carousel: "🖼️",
  video: "🎬",
};

const FORMATS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "video", label: "🎬 Reels" },
  { value: "carousel", label: "🖼️ Carruseles" },
  { value: "image", label: "📷 Fotos" },
];

const SORTS: Array<{ value: string; label: string }> = [
  { value: "er", label: "Engagement (vs seguidores)" },
  { value: "views", label: "Más vistas" },
  { value: "likes", label: "Más likes + comments" },
  { value: "recent", label: "Más recientes" },
];

function fmt(n: number | null | undefined): string {
  if (n == null || n < 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// Fecha exacta de publicación: "22 jun 2026".
function fmtDate(takenAt: number): string {
  const d = new Date(takenAt * 1000);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

const PAGE_SIZE = 30;

function erColor(rate: number | null): string {
  if (rate == null) return "text-neutral-400";
  if (rate >= 6) return "text-emerald-400";
  if (rate >= 3) return "text-yellow-400";
  if (rate >= 1) return "text-blue-400";
  return "text-neutral-400";
}

export function FastProfileView({
  profile,
  posts,
}: {
  profile: FastProfile;
  posts: FastPost[];
}) {
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState("er");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const visible = useMemo(() => {
    let list = posts;
    if (format !== "all") list = list.filter((p) => p.mediaType === format);
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "views") return (b.views ?? -1) - (a.views ?? -1);
      if (sort === "likes")
        return b.likes + b.comments - (a.likes + a.comments);
      if (sort === "recent") return b.takenAt - a.takenAt;
      return (b.engagementRate ?? -1) - (a.engagementRate ?? -1);
    });
    return sorted;
  }, [posts, format, sort]);

  const rendered = useMemo(() => visible.slice(0, limit), [visible, limit]);
  const hasMore = visible.length > limit;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
        {profile.profilePicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.profilePicUrl}
            referrerPolicy="no-referrer"
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded-full bg-neutral-800 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-2xl">
            👤
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a
              href={`https://www.instagram.com/${profile.username}/`}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xl font-bold hover:underline"
            >
              @{profile.username}
            </a>
            {profile.isVerified && <span className="text-blue-400">✓</span>}
          </div>
          {profile.fullName && (
            <p className="truncate text-sm text-neutral-400">
              {profile.fullName}
            </p>
          )}
        </div>
        <div className="flex gap-6 text-center">
          <Metric label="Seguidores" value={fmt(profile.followers)} />
          <Metric label="Publicaciones" value={fmt(profile.postsCount)} />
        </div>
      </header>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setFormat(f.value); setLimit(PAGE_SIZE); }}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                (format === f.value
                  ? "border-blue-500 bg-blue-950 text-blue-200"
                  : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
          <span>Ordenar:</span>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setLimit(PAGE_SIZE); }}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 hover:border-neutral-500 focus:border-blue-500 focus:outline-none"
          >
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {profile.isPrivate ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          🔒 Este perfil es privado — Instagram no expone sus publicaciones.
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          No hay publicaciones con ese formato.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {rendered.map((p) => (
              <Card key={p.id} post={p} />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="mx-auto rounded-lg border border-neutral-700 bg-neutral-900 px-6 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
            >
              Mostrar {Math.min(PAGE_SIZE, visible.length - limit)} mas ({limit}/{visible.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
    </div>
  );
}

function Card({ post }: { post: FastPost }) {
  const [failed, setFailed] = useState(false);
  const isVideo = post.mediaType === "video";

  const onImgError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.dataset.proxied) { setFailed(true); return; }
    img.dataset.proxied = "1";
    img.src = `/api/img?url=${encodeURIComponent(post.thumbnailUrl!)}`;
  }, [post.thumbnailUrl]);

  return (
    <a
      href={post.url}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 transition-colors hover:border-neutral-600"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-neutral-900">
        {post.thumbnailUrl && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.thumbnailUrl}
            referrerPolicy="no-referrer"
            alt=""
            loading="lazy"
            decoding="async"
            onError={onImgError}
            className="h-full w-full object-cover transition-opacity duration-200"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-950 text-5xl opacity-40">
            {TYPE_ICON[post.mediaType]}
          </div>
        )}

        {isVideo && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/55 px-3 py-2 text-lg backdrop-blur-sm group-hover:scale-110 transition-transform">
              ▶
            </span>
          </div>
        )}

        {post.engagementRate != null && (
          <div className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 backdrop-blur-sm">
            <span className={`text-sm font-bold ${erColor(post.engagementRate)}`}>
              {post.engagementRate.toFixed(1)}%
            </span>
          </div>
        )}
        <div className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] backdrop-blur-sm">
          {TYPE_ICON[post.mediaType]}
        </div>
        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-neutral-200 backdrop-blur-sm">
          📅 {fmtDate(post.takenAt)}
        </div>
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5 text-[12px] text-neutral-300">
        <span title="likes">
          ❤️{" "}
          {post.likes === -1 ? (
            <span className="text-neutral-600">oculto</span>
          ) : (
            fmt(post.likes)
          )}
        </span>
        <span title="comentarios">💬 {fmt(post.comments)}</span>
        {post.views != null && <span title="vistas">▶️ {fmt(post.views)}</span>}
      </div>
    </a>
  );
}
