import { queryPosts, POSTS_PAGE_SIZE } from "@/lib/queries";
import { PostCard } from "@/components/PostCard";
import { Pagination } from "@/components/Pagination";

// Datos en vivo por workspace → nunca pre-generar en build.
export const dynamic = "force-dynamic";

export const revalidate = 30;

interface SearchParams {
  page?: string;
}

export default async function ShortlistPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { posts, hasMore } = await queryPosts({
    decision: "replicate",
    sort: "postedAt",
    page,
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">📌 Shortlist — Para replicar</h1>
        <p className="text-sm text-neutral-400">
          Posts que marcaste con ✓ Replicar. Ordenados por más recientes.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          {page > 1
            ? "No hay más resultados en esta página."
            : 'Aún no has marcado nada como "Replicar". Entra a un perfil y revisa sus virales.'}
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
