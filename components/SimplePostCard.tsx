"use client";

import Link from "next/link";
import { useState } from "react";
import type { PostListItem } from "@/lib/queries";
import { imgProxy } from "@/lib/img";

const TYPE_ICON: Record<string, string> = {
  Image: "📷",
  Sidecar: "🖼️",
  Video: "🎬",
};

function fmtCount(n: number | null | undefined): string {
  if (n == null || n < 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtAge(postedAt: number): string {
  const days = (Date.now() / 1000 - postedAt) / 86400;
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

// Color del ER según benchmarks de industria.
function erColor(rate: number | null | undefined): string {
  if (rate == null) return "text-neutral-500";
  if (rate >= 6) return "text-emerald-400";
  if (rate >= 3) return "text-yellow-400";
  if (rate >= 1) return "text-blue-400";
  return "text-neutral-400";
}

// Tarjeta minimalista estilo ViralFindr: imagen + UNA métrica protagonista
// (engagement vs followers) + conteos crudos. Sin tiers, heat ni badges.
export function SimplePostCard({ post }: { post: PostListItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const rawThumb =
    post.displayUrl ?? (post.images.length > 0 ? post.images[0] : null);
  const thumb = imgFailed ? null : imgProxy(rawThumb);
  const plays = post.videoViewCount ?? post.videoPlayCount;

  return (
    <Link
      href={`/posts/${post.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 transition-colors hover:border-neutral-600"
    >
      {/* Miniatura */}
      <div className="relative aspect-[4/5] overflow-hidden bg-neutral-900">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-neutral-900 to-neutral-950 px-3 text-center">
            <span className="text-5xl opacity-40">
              {TYPE_ICON[post.type] ?? "📄"}
            </span>
            {post.caption && (
              <p className="line-clamp-3 text-[11px] leading-snug text-neutral-400">
                {post.caption.slice(0, 100)}
              </p>
            )}
          </div>
        )}

        {/* ER protagonista, arriba a la izquierda */}
        {post.engagementRate != null && (
          <div className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 backdrop-blur-sm">
            <span className={`text-sm font-bold ${erColor(post.engagementRate)}`}>
              {post.engagementRate.toFixed(1)}%
            </span>
          </div>
        )}

        {/* Tipo + antigüedad */}
        <div className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] backdrop-blur-sm">
          {TYPE_ICON[post.type] ?? "📄"}
        </div>
        <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-neutral-200 backdrop-blur-sm">
          ⏱ {fmtAge(post.postedAt)}
        </div>
      </div>

      {/* Métricas crudas */}
      <div className="flex items-center gap-3 px-3 py-2.5 text-[12px] text-neutral-300">
        <span title="likes">
          ❤️{" "}
          {post.likesCount === -1 ? (
            <span className="text-neutral-600">oculto</span>
          ) : (
            fmtCount(post.likesCount)
          )}
        </span>
        <span title="comentarios">💬 {fmtCount(post.commentsCount)}</span>
        {plays != null && <span title="vistas">▶️ {fmtCount(plays)}</span>}
      </div>
    </Link>
  );
}
