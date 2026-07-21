import Link from "next/link";
import {
  getAllHashtagsWithCounts,
  queryPosts,
  POSTS_PAGE_SIZE,
  type HeatLevel,
  type PostType,
  type SortKey,
} from "@/lib/queries";
import type { ViralTier, Decision } from "@/lib/types";
import { FilterBar } from "@/components/FilterBar";
import { HashtagPills } from "@/components/HashtagPills";
import { PostCard } from "@/components/PostCard";
import { EnrichSection } from "@/components/EnrichSection";
import { Pagination } from "@/components/Pagination";

// Datos en vivo por workspace → nunca pre-generar en build.
export const dynamic = "force-dynamic";

export const revalidate = 30;

interface SearchParams {
  tag?: string;
  window?: string;
  lang?: string;
  type?: string;
  tier?: string;
  heat?: string;
  decision?: string;
  sort?: string;
  page?: string;
}

export default async function HashtagsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const selectedTag = sp.tag ?? null;

  const allHashtags = await getAllHashtagsWithCounts();
  const totalAcrossAll = allHashtags.reduce((sum, h) => sum + h.totalPosts, 0);

  // sp.window === "all"  → sin filtro temporal
  // sp.window === "<n>"  → últimos n días
  // sp.window indefinido → default 90 días
  let recentDays: number | undefined;
  if (sp.window === "all") {
    recentDays = undefined;
  } else {
    const n = Number(sp.window ?? 90);
    recentDays = Number.isFinite(n) && n > 0 ? n : 90;
  }

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { posts, hasMore } = await queryPosts({
    sourceHashtag: selectedTag ?? "any",
    recentDays,
    language: sp.lang as any,
    types: sp.type ? [sp.type as PostType] : undefined,
    minTier: (sp.tier as ViralTier) ?? null,
    minHeat: (sp.heat as HeatLevel) ?? null,
    decision: sp.decision as Decision | "none" | undefined,
    // Default: viralScore funciona para todos los tipos (combina velocidad
    // y engagement, asigna NULL solo si no hay nada calculable).
    sort: (sp.sort as SortKey) ?? "viralScore",
    page,
  });

  const selectedHashtag = selectedTag
    ? allHashtags.find((h) => h.hashtag === selectedTag)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">🏷️ Hashtags investigados</h1>
        <p className="text-sm text-neutral-400">
          {allHashtags.length} hashtag(s) · {totalAcrossAll} posts en total
        </p>
      </header>

      {allHashtags.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center">
          <p className="text-neutral-400">
            Aún no has investigado ningún hashtag.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm text-blue-400 hover:underline"
          >
            Ir al dashboard para buscar uno →
          </Link>
        </div>
      ) : (
        <>
          {/* Hashtag selector pills */}
          <section>
            <HashtagPills
              hashtags={allHashtags}
              totalAcrossAll={totalAcrossAll}
            />
          </section>

          {/* Selected hashtag stats */}
          {selectedHashtag && (
            <section className="rounded-lg border border-purple-900/40 bg-purple-950/20 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-mono text-purple-200">
                  #{selectedHashtag.hashtag}
                </span>
                <span className="text-neutral-400">
                  📊 {selectedHashtag.totalPosts} posts
                </span>
                <span className="text-neutral-400">
                  🎬 {selectedHashtag.reels} reels
                </span>
                <span className="text-neutral-400">
                  🖼️ {selectedHashtag.carousels} carruseles
                </span>
                <span className="text-neutral-400">
                  📷 {selectedHashtag.images} fotos
                </span>
                <span className="text-emerald-400">
                  ⭐ {selectedHashtag.taggedPosts} outliers
                </span>
                <span className="ml-auto text-xs text-neutral-500">
                  Último scrape:{" "}
                  {new Date(
                    selectedHashtag.lastScrapedAt * 1000
                  ).toLocaleDateString("es-CO")}
                </span>
              </div>
            </section>
          )}

          {/* Joyas ocultas: enriquecer followers de autores con reels caliente+ */}
          <EnrichSection />

          {/* Filtros estándar */}
          <FilterBar />

          {/* Cómo evaluar viralidad — explicación corta y honesta */}
          <details className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
            <summary className="cursor-pointer text-neutral-300">
              ⓘ ¿Cómo se clasifica la viralidad? (estándar de mercado)
            </summary>
            <div className="mt-2 space-y-1.5">
              <p>
                Engagement Rate (ER) usa la fórmula que el mercado usa
                (Hootsuite, Sprout Social, HubSpot, HypeAuditor, etc.):
              </p>
              <p className="rounded bg-neutral-900 p-1.5 font-mono text-[11px] text-neutral-200">
                ER = (likes + comments) / followers × 100
              </p>
              <p>Tiers calibrados a benchmarks publicados:</p>
              <ul className="ml-3 space-y-0.5">
                <li>🌿 <strong>fresco</strong> — ER 1-3% (promedio mercado)</li>
                <li>🔥 <strong>tibio</strong> — ER 3-6% (bueno)</li>
                <li>🔥🔥 <strong>caliente</strong> — ER 6-9% (excelente)</li>
                <li>🔥🔥🔥 <strong>explosivo</strong> — ER ≥9% (validar — puede ser bait)</li>
              </ul>
              <p>
                Si un autor no está en tu base, usa{" "}
                <strong>"Detectar joyas ocultas"</strong> arriba para
                enriquecer y poder calcularle ER.
              </p>
              <p>
                Para reels también guardamos <strong>view rate</strong>
                {" "}(engagement/views) como métrica complementaria — visible
                en el detalle del post.
              </p>
            </div>
          </details>

          {/* Aviso solo si el filtro de tier está activo */}
          {sp.tier && (
            <div className="rounded border border-amber-900/40 bg-amber-950/20 p-2 text-xs text-amber-300">
              ⚠️ Tienes activo <strong>"Tier perfil"</strong>, que oculta la
              mayoría de posts de hashtag (no tienen tier por defecto).
              Quítalo en la barra de filtros para ver todos los resultados.
            </div>
          )}

          {/* Aviso si el filtro de calor excluye posts sin followers conocidos */}
          {sp.heat && (
            <div className="rounded border border-blue-900/40 bg-blue-950/20 p-2 text-xs text-blue-300">
              ⓘ El filtro <strong>"Calor"</strong> usa el ER por followers
              (estándar de mercado). Posts cuyos autores aún no están
              enriquecidos quedan excluidos. Usa la sección{" "}
              <strong>"Detectar joyas ocultas"</strong> arriba para enriquecer.
            </div>
          )}

          {posts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-800 p-8 text-center">
              <p className="text-neutral-300">
                {page > 1
                  ? "No hay más resultados en esta página."
                  : "Sin resultados con los filtros actuales."}
              </p>
              {page === 1 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Prueba: cambiar la ventana a{" "}
                  <strong>"Todo el histórico"</strong>, quitar el filtro de{" "}
                  <strong>tier</strong>, o cambiar el orden a{" "}
                  <strong>"Engagement %"</strong>.
                </p>
              )}
              <Link
                href={`/hashtags${selectedTag ? `?tag=${selectedTag}` : ""}`}
                className="mt-3 inline-block rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
              >
                Limpiar todos los filtros
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
              <Pagination
                page={page}
                hasMore={hasMore}
                pageSize={POSTS_PAGE_SIZE}
                itemsThisPage={posts.length}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
