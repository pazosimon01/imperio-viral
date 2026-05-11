"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PostListItem } from "@/lib/queries";
import { TierBadge, HeatBadge, HashtagHeatBadge } from "./TierBadge";
import { imgProxy } from "@/lib/img";
import { useAudioPref } from "@/hooks/useAudioPref";

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

// Formato de "joya": views/followers. Solo mostramos si ≥1× (mínimo
// "alcance >= audiencia"). Por encima de 3× ya es claramente outlier.
function fmtJoya(ratio: number | null): string | null {
  if (ratio == null || ratio < 1) return null;
  if (ratio >= 10) return `${ratio.toFixed(0)}×`;
  return `${ratio.toFixed(1)}×`;
}

function joyaTier(ratio: number | null): "normal" | "alta" | "joya" | null {
  if (ratio == null || ratio < 1) return null;
  if (ratio >= 5) return "joya"; // claramente fuera de su burbuja
  if (ratio >= 2) return "alta"; // outlier moderado
  return "normal"; // alcance ~1× su audiencia
}

function fmtAge(postedAt: number): string {
  const days = (Date.now() / 1000 - postedAt) / 86400;
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

function erColor(rate: number | null | undefined): string {
  if (rate == null) return "text-neutral-500";
  if (rate >= 9) return "text-orange-400";
  if (rate >= 6) return "text-emerald-400";
  if (rate >= 3) return "text-yellow-400";
  if (rate >= 1) return "text-blue-400";
  return "text-neutral-500";
}

const HOVER_DELAY_MS = 200;
const CAROUSEL_INTERVAL_MS = 1200;

export function PostCard({ post }: { post: PostListItem }) {
  const [audioPref] = useAudioPref();
  const [hovering, setHovering] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [playingWithSound, setPlayingWithSound] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carouselTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rawThumb =
    post.displayUrl ?? (post.images.length > 0 ? post.images[0] : null);
  const thumb = imgFailed ? null : imgProxy(rawThumb);
  const plays = post.videoViewCount ?? post.videoPlayCount;
  const showThumb = !!thumb;

  // Iniciar/parar el preview cuando cambia hover
  useEffect(() => {
    // limpieza previa
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (carouselTimerRef.current) {
      clearInterval(carouselTimerRef.current);
      carouselTimerRef.current = null;
    }

    if (!hovering) {
      if (videoRef.current) {
        videoRef.current.pause();
        try {
          videoRef.current.currentTime = 0;
        } catch {}
      }
      setVideoReady(false);
      setPlayingWithSound(false);
      setCarouselIdx(0);
      return;
    }

    enterTimerRef.current = setTimeout(() => {
      if (post.type === "Video" && post.videoUrl && videoRef.current) {
        const v = videoRef.current;
        v.muted = !audioPref;
        v.volume = 0.7;
        v.play()
          .then(() => {
            setPlayingWithSound(audioPref && !v.muted);
          })
          .catch(() => {
            // Autoplay con sonido bloqueado por el browser → fallback muted.
            // Tras la próxima interacción del usuario (cualquier click), el
            // siguiente hover ya tendrá sonido.
            v.muted = true;
            v.play().catch(() => {});
            setPlayingWithSound(false);
          });
      } else if (post.type === "Sidecar" && post.images.length > 1) {
        carouselTimerRef.current = setInterval(() => {
          setCarouselIdx((i) => (i + 1) % post.images.length);
        }, CAROUSEL_INTERVAL_MS);
      }
    }, HOVER_DELAY_MS);

    return () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      if (carouselTimerRef.current) clearInterval(carouselTimerRef.current);
    };
  }, [hovering, post.type, post.videoUrl, post.images.length, audioPref]);

  const isCarousel = post.type === "Sidecar" && post.images.length > 1;
  const currentImg: string | undefined =
    (isCarousel && hovering
      ? imgProxy(post.images[carouselIdx])
      : thumb) ?? undefined;

  return (
    <Link
      href={`/posts/${post.id}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 transition-colors hover:border-neutral-600"
    >
      {/* ─── Thumbnail / Preview ─── */}
      <div className="relative aspect-[4/5] overflow-hidden bg-neutral-900">
        {/* Imagen base (siempre montada para evitar parpadeo) */}
        {showThumb ? (
          <img
            src={currentImg}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className={`h-full w-full object-cover transition-opacity duration-200 ${
              hovering && videoReady ? "opacity-0" : "opacity-100"
            }`}
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

        {/* Video preview (lazy: preload="none" — solo carga al pulsar play) */}
        {post.type === "Video" && post.videoUrl && hovering && (
          <>
            <video
              ref={videoRef}
              src={post.videoUrl}
              loop
              playsInline
              preload="none"
              onLoadedData={() => setVideoReady(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
                videoReady ? "opacity-100" : "opacity-0"
              }`}
            />
            {videoReady && (
              <div className="pointer-events-none absolute right-1.5 top-9 rounded bg-black/70 px-1.5 py-0.5 text-[10px] backdrop-blur-sm">
                {playingWithSound ? "🔊" : "🔇"}
              </div>
            )}
          </>
        )}

        {/* Indicador de carrusel multi-imagen */}
        {isCarousel && hovering && post.images.length > 1 && (
          <div className="pointer-events-none absolute bottom-7 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/60 px-1.5 py-0.5">
            {post.images.map((_, i) => (
              <span
                key={i}
                className={`block h-1 w-1 rounded-full ${
                  i === carouselIdx ? "bg-white" : "bg-white/40"
                }`}
              />
            ))}
          </div>
        )}

        {/* Top-left: clasificación por prioridad
              1. Tier de perfil (si está trackeado y multiplicado)
              2. Heat por ER% (reels)
              3. Heat relativo al hashtag (carruseles/fotos sin ER%)
              4. Multiplier numérico (sin tier) */}
        <div className="pointer-events-none absolute left-1.5 top-1.5">
          {post.viralTier ? (
            <TierBadge
              tier={post.viralTier}
              multiplier={post.viralidadMultiplier}
              size="sm"
            />
          ) : post.engagementRate != null && post.engagementRate >= 1 ? (
            <HeatBadge rate={post.engagementRate} size="sm" />
          ) : post.hashtagHeatTier ? (
            <HashtagHeatBadge
              tier={post.hashtagHeatTier}
              mult={post.hashtagHeatMult}
              size="sm"
            />
          ) : post.viralidadMultiplier != null ? (
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-300 backdrop-blur-sm">
              {post.viralidadMultiplier.toFixed(1)}×
            </span>
          ) : null}
        </div>

        {/* Top-right: tipo + decisión */}
        <div className="pointer-events-none absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] backdrop-blur-sm">
            {TYPE_ICON[post.type] ?? "📄"}
          </span>
          {post.decision === "replicate" && (
            <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
              ✓
            </span>
          )}
          {post.decision === "maybe" && (
            <span className="rounded bg-yellow-600 px-1.5 py-0.5 text-[9px] font-bold uppercase">
              ?
            </span>
          )}
          {post.decision === "skip" && (
            <span className="rounded bg-red-700 px-1.5 py-0.5 text-[9px] font-bold uppercase">
              ✕
            </span>
          )}
        </div>

        {/* Bottom: edad + joya/idioma */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
          <span className="text-[10px] font-medium text-neutral-300">
            ⏱ {fmtAge(post.postedAt)}
          </span>
          <div className="flex items-center gap-1">
            {(() => {
              const tier = joyaTier(post.viewsPerFollower);
              if (!tier) return null;
              const ratioStr = fmtJoya(post.viewsPerFollower);
              if (tier === "joya") {
                return (
                  <span
                    className="rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                    title={`${ratioStr} views/followers — joya oculta (cuenta chica + reel viralizando)`}
                  >
                    🚀 {ratioStr}
                  </span>
                );
              }
              if (tier === "alta") {
                return (
                  <span
                    className="rounded bg-purple-900/60 px-1.5 py-0.5 text-[10px] text-purple-200 backdrop-blur-sm"
                    title={`${ratioStr} views/followers`}
                  >
                    {ratioStr} ▶/👥
                  </span>
                );
              }
              return null;
            })()}
            {post.language && (
              <span className="rounded bg-black/40 px-1 py-0.5 text-[9px] uppercase tracking-wider text-neutral-300">
                {post.language}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Body: métricas + caption ─── */}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        {/* Línea 1: likes + comments + plays */}
        <div className="flex items-center gap-2 text-[11px] text-neutral-400">
          <span
            title={
              post.likesCount === -1
                ? "El autor ocultó el contador de likes en su perfil"
                : "likes"
            }
          >
            ❤️{" "}
            {post.likesCount === -1 ? (
              <span className="text-neutral-600">oculto</span>
            ) : (
              fmtCount(post.likesCount)
            )}
          </span>
          <span title="comments">💬 {fmtCount(post.commentsCount)}</span>
          {plays != null ? (
            <span title="plays (solo reels)">▶️ {fmtCount(plays)}</span>
          ) : (
            <span
              title="Instagram no expone alcance/impresiones para fotos y carruseles. Usa el multiplicador para comparar viralidad entre tipos."
              className="text-neutral-600"
            >
              ▶️ —
            </span>
          )}
          <span
            title={
              post.ownerFollowersCount != null
                ? `Followers del autor: ${post.ownerFollowersCount.toLocaleString()}`
                : "Followers del autor — enriquece para conocer"
            }
            className={
              post.ownerFollowersCount != null
                ? ""
                : "text-neutral-600"
            }
          >
            👥{" "}
            {post.ownerFollowersCount != null
              ? fmtCount(post.ownerFollowersCount)
              : "—"}
          </span>
        </div>

        {/* Línea 2: ER% destacado */}
        {post.engagementRate != null && (
          <div
            className={`text-xs font-semibold ${erColor(post.engagementRate)}`}
          >
            {post.engagementRate.toFixed(1)}% ER
          </div>
        )}

        {/* Línea 3: caption (solo si hay miniatura — si no, va en el placeholder) */}
        {showThumb && post.caption && (
          <p className="line-clamp-2 text-[11px] leading-snug text-neutral-500">
            {post.caption}
          </p>
        )}

        {post.ownerUsername && (
          <div className="mt-auto text-[10px] text-neutral-600">
            @{post.ownerUsername}
          </div>
        )}
      </div>
    </Link>
  );
}
