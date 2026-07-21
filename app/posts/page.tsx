import {
  queryPosts,
  POSTS_PAGE_SIZE,
  type HeatLevel,
  type PostType,
  type SortKey,
} from "@/lib/queries";
import type { ViralTier, Decision } from "@/lib/types";
import { FilterBar } from "@/components/FilterBar";
import { PostCard } from "@/components/PostCard";
import { Pagination } from "@/components/Pagination";

// Datos en vivo por workspace → nunca pre-generar en build.
export const dynamic = "force-dynamic";

export const revalidate = 30;

interface SearchParams {
  window?: string;
  lang?: string;
  type?: string;
  tier?: string;
  heat?: string;
  decision?: string;
  sort?: string;
  page?: string;
}

export default async function AllPostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  let recentDays: number | undefined;
  if (sp.window === "all") {
    recentDays = undefined;
  } else {
    const n = Number(sp.window ?? 90);
    recentDays = Number.isFinite(n) && n > 0 ? n : 90;
  }

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { posts, hasMore } = await queryPosts({
    recentDays,
    language: sp.lang as any,
    types: sp.type ? [sp.type as PostType] : undefined,
    minTier: (sp.tier as ViralTier) ?? null,
    minHeat: (sp.heat as HeatLevel) ?? null,
    decision: sp.decision as Decision | "none" | undefined,
    sort: (sp.sort as SortKey) ?? "viralScore",
    page,
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">Todos los posts</h1>
        <p className="text-sm text-neutral-400">
          Filtrar y ordenar a través de todos los perfiles trackeados.
        </p>
      </header>

      <FilterBar />

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          {page > 1
            ? "No hay más resultados en esta página. Vuelve a la anterior."
            : "Sin resultados. Prueba ampliar la ventana temporal o quitar filtros."}
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
    </div>
  );
}
