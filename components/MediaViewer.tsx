"use client";

import { useState } from "react";
import type { PostListItem } from "@/lib/queries";
import { imgProxy } from "@/lib/img";

export function MediaViewer({ post }: { post: PostListItem }) {
  // Para reels: el iframe de IG embed es la ÚNICA forma confiable. La URL
  // directa del video viene firmada por sesión del scraper y casi siempre
  // devuelve 403 desde el browser del usuario. Verificado empíricamente.
  if (post.type === "Video") {
    if (post.shortCode) {
      return <InstagramEmbed shortCode={post.shortCode} fullUrl={post.url} />;
    }
    // Edge case: video sin shortCode (no debería pasar, pero por si acaso).
    return (
      <div className="flex aspect-[9/16] max-h-[80vh] w-full flex-col items-center justify-center gap-3 rounded-lg bg-neutral-900 p-6 text-center">
        {post.displayUrl && (
          <img
            src={imgProxy(post.displayUrl)}
            alt=""
            className="max-h-48 rounded opacity-40"
          />
        )}
        <p className="text-sm text-neutral-400">
          No tenemos el shortCode de este post para embeber.
        </p>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          Abrir en Instagram ↗
        </a>
      </div>
    );
  }

  if (post.type === "Sidecar" && post.images.length > 0) {
    return <Carousel images={post.images} />;
  }

  const url =
    post.displayUrl ?? (post.images.length > 0 ? post.images[0] : null);
  if (url) {
    return (
      <img
        src={imgProxy(url)}
        alt=""
        className="aspect-square max-h-[80vh] w-full rounded-lg bg-black object-contain"
      />
    );
  }

  return (
    <div className="flex aspect-square items-center justify-center rounded-lg bg-neutral-900 text-neutral-500">
      Sin medios disponibles
    </div>
  );
}

function InstagramEmbed({
  shortCode,
  fullUrl,
}: {
  shortCode: string;
  fullUrl: string;
}) {
  // /embed/ sin captioned. El caption ya se muestra en un bloque dedicado
  // abajo en la página, así que evitamos duplicarlo y queda más compacto.
  const src = `https://www.instagram.com/p/${shortCode}/embed/`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <iframe
        src={src}
        className="mx-auto block h-[700px] w-full max-w-[480px] rounded-md border-none"
        scrolling="no"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
        title="Instagram embed"
      />
      {/* Algunos reels IG bloquea el embed (requiere login). Para esos casos
          el usuario necesita un link directo y obvio. */}
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mx-auto flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:border-emerald-700 hover:bg-neutral-800 hover:text-white"
      >
        ▶️ ¿No se reproduce aquí? Abrir en Instagram ↗
      </a>
    </div>
  );
}

function Carousel({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  return (
    <div className="relative aspect-square max-h-[80vh] w-full overflow-hidden rounded-lg bg-black">
      <img
        key={idx}
        src={imgProxy(images[idx])}
        alt=""
        className="h-full w-full object-contain"
      />

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white hover:bg-black/80"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % images.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-white hover:bg-black/80"
            aria-label="Siguiente"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/60 px-2 py-1">
            {images.map((_, i) => (
              <span
                key={i}
                className={
                  "block h-1.5 w-1.5 rounded-full " +
                  (i === idx ? "bg-white" : "bg-white/40")
                }
              />
            ))}
          </div>
          <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {idx + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
