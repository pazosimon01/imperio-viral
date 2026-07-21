import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProfile,
  getProfilePosts,
  type PostType,
  type SortKey,
} from "@/lib/queries";
import { ProfileControls } from "@/components/ProfileControls";
import { SimplePostCard } from "@/components/SimplePostCard";
import { Pagination } from "@/components/Pagination";
import { imgProxy } from "@/lib/img";

// Datos en vivo por workspace → nunca pre-generar en build.
export const dynamic = "force-dynamic";

export const revalidate = 30;

// Mostramos las últimas N publicaciones en una sola página, ordenadas por
// engagement vs followers (de mayor a menor) por defecto.
const PROFILE_PAGE_SIZE = 100;

interface Params {
  username: string;
}
interface SearchParams {
  type?: string;
  sort?: string;
  page?: string;
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { username } = await params;
  const sp = await searchParams;

  const profile = await getProfile(username);
  if (!profile) notFound();

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { posts, hasMore } = await getProfilePosts(username, {
    types: sp.type ? [sp.type as PostType] : undefined,
    sort: (sp.sort as SortKey) ?? "engagementRate",
    page,
    pageSize: PROFILE_PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm">
        <Link href="/" className="text-neutral-400 hover:text-white">
          ← Inicio
        </Link>
      </div>

      {/* Header del perfil — compacto, solo lo esencial */}
      <header className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
        {profile.profilePicUrl ? (
          <img
            src={imgProxy(profile.profilePicUrl)}
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
            <h1 className="truncate text-xl font-bold">@{profile.username}</h1>
            {profile.isVerified && <span className="text-blue-400">✓</span>}
          </div>
          {profile.fullName && (
            <p className="truncate text-sm text-neutral-400">
              {profile.fullName}
            </p>
          )}
        </div>

        {/* Dos números: seguidores + engagement promedio */}
        <div className="flex gap-6 text-center">
          <div>
            <div className="text-lg font-bold tabular-nums">
              {fmt(profile.followersCount)}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              Seguidores
            </div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-emerald-400">
              {profile.medianEngagementRate != null
                ? `${profile.medianEngagementRate.toFixed(1)}%`
                : "—"}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              Engagement típico
            </div>
          </div>
        </div>
      </header>

      {/* Controles mínimos: formato + orden */}
      <ProfileControls />

      {/* Grilla */}
      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          {page > 1
            ? "No hay más publicaciones."
            : "Aún no hay publicaciones de este perfil. Analízalo desde el inicio."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {posts.map((p) => (
              <SimplePostCard key={p.id} post={p} />
            ))}
          </div>
          <Pagination
            page={page}
            hasMore={hasMore}
            pageSize={PROFILE_PAGE_SIZE}
            itemsThisPage={posts.length}
          />
        </>
      )}
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
