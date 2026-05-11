import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProfile,
  getProfilePosts,
  POSTS_PAGE_SIZE,
  type HeatLevel,
  type PostType,
  type SortKey,
} from "@/lib/queries";
import type { ViralTier, Decision } from "@/lib/types";
import { FilterBar } from "@/components/FilterBar";
import { PostCard } from "@/components/PostCard";
import { Pagination } from "@/components/Pagination";
import { imgProxy } from "@/lib/img";

export const revalidate = 30;

interface Params {
  username: string;
}
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

  let recentDays: number | undefined;
  if (sp.window === "all") {
    recentDays = undefined;
  } else {
    const n = Number(sp.window ?? 90);
    recentDays = Number.isFinite(n) && n > 0 ? n : 90;
  }

  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { posts, hasMore } = await getProfilePosts(username, {
    recentDays,
    language: sp.lang as any,
    types: sp.type ? [sp.type as PostType] : undefined,
    minTier: (sp.tier as ViralTier) ?? null,
    minHeat: (sp.heat as HeatLevel) ?? null,
    decision: sp.decision as Decision | "none" | undefined,
    sort: (sp.sort as SortKey) ?? "viralScore",
    page,
  });

  const tierCounts: Record<string, number> = {};
  for (const p of posts) {
    if (p.viralTier) tierCounts[p.viralTier] = (tierCounts[p.viralTier] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb */}
      <div className="text-sm">
        <Link
          href="/profiles"
          className="text-neutral-400 hover:text-white"
        >
          ← Perfiles
        </Link>
      </div>

      {/* Profile header */}
      <header className="rounded-lg border border-neutral-800 bg-neutral-950 p-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          {profile.profilePicUrl ? (
            <img
              src={imgProxy(profile.profilePicUrl)}
              alt=""
              className="h-20 w-20 flex-shrink-0 rounded-full bg-neutral-800 object-cover md:h-24 md:w-24"
            />
          ) : (
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-3xl md:h-24 md:w-24">
              👤
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">@{profile.username}</h1>
              {profile.isVerified && <span className="text-blue-400">✓</span>}
              {profile.language && (
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs uppercase">
                  {profile.language}
                </span>
              )}
              {profile.fullName && (
                <span className="text-sm text-neutral-400">
                  · {profile.fullName}
                </span>
              )}
            </div>
            {profile.bio && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-300">
                {profile.bio}
              </p>
            )}
          </div>

          {/* Métricas baseline en grid compacto */}
          <div className="grid w-full grid-cols-4 gap-2 md:w-auto md:grid-cols-2 md:gap-3">
            <Metric
              label="Mediana ER"
              value={
                profile.medianEngagementRate != null
                  ? `${profile.medianEngagementRate.toFixed(1)}%`
                  : "—"
              }
              accent
            />
            <Metric label="Followers" value={fmt(profile.followersCount)} />
            <Metric label="Posts IG" value={fmt(profile.postsCount)} />
            <Metric
              label="En DB"
              value={`${profile.totalPostsInDb}`}
            />
          </div>
        </div>
      </header>

      {/* Filtros */}
      <FilterBar />

      {/* Resumen del filtro actual */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
        <span>
          Mostrando <strong className="text-white">{posts.length}</strong> posts
        </span>
        {Object.keys(tierCounts).length > 0 && (
          <>
            <span>·</span>
            <div className="flex gap-2">
              {(["unicorn", "diamond", "gem", "viral", "good"] as const).map(
                (t) =>
                  tierCounts[t] ? (
                    <span key={t} className="text-xs">
                      {EMOJI[t]} {tierCounts[t]}
                    </span>
                  ) : null
              )}
            </div>
          </>
        )}
      </div>

      {/* Grid de posts */}
      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          {page > 1
            ? "No hay más resultados en esta página."
            : "No hay posts con esos filtros. Prueba ampliando la ventana temporal."}
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

const EMOJI: Record<ViralTier, string> = {
  good: "🟢",
  viral: "🥉",
  gem: "🥈",
  diamond: "🥇",
  unicorn: "💎",
};

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md bg-neutral-900 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={
          "text-base font-bold tabular-nums " +
          (accent ? "text-emerald-400" : "text-neutral-100")
        }
      >
        {value}
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
