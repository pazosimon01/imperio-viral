import Link from "next/link";
import { getAllProfiles, getGlobalStats } from "@/lib/queries";
import { imgProxy } from "@/lib/img";
import { ScrapeProfileForm } from "@/components/ScrapeProfileForm";
import { ScrapeHashtagForm } from "@/components/ScrapeHashtagForm";

export const revalidate = 30;

export default async function HomePage() {
  const [stats, profiles] = await Promise.all([
    getGlobalStats(),
    getAllProfiles(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section>
        <h1 className="text-3xl font-bold">Imperio Viral</h1>
        <p className="mt-1 text-neutral-400">
          Investiga perfiles y hashtags de Instagram. Detecta las joyas
          virales escondidas de tu nicho.
        </p>
      </section>

      {/* Forms para iniciar scrapes */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ScrapeProfileForm />
        <ScrapeHashtagForm />
      </section>

      {/* Stats globales */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Perfiles trackeados" value={stats.totalProfiles} />
        <Stat label="Posts en DB" value={stats.totalPosts} />
        <Stat label="Outliers detectados" value={stats.taggedPosts} accent />
        <Stat label="Marcados Replicar" value={stats.decisionsCount.replicate} accent />
      </section>

      {/* Tier breakdown */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="mb-3 text-sm uppercase tracking-wide text-neutral-400">
          Distribución de outliers por tier
        </h2>
        <div className="grid grid-cols-5 gap-2">
          <TierStat tier="good" count={stats.byTier.good} />
          <TierStat tier="viral" count={stats.byTier.viral} />
          <TierStat tier="gem" count={stats.byTier.gem} />
          <TierStat tier="diamond" count={stats.byTier.diamond} />
          <TierStat tier="unicorn" count={stats.byTier.unicorn} />
        </div>
      </section>

      {/* Perfiles */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Perfiles</h2>
          <Link
            href="/profiles"
            className="text-sm text-blue-400 hover:underline"
          >
            Ver todos →
          </Link>
        </div>
        {profiles.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 text-neutral-400">
            Aún no has trackeado ningún perfil. Corre{" "}
            <code className="rounded bg-neutral-900 px-1.5 py-0.5">
              npm run scrape:profile -- --user=USERNAME
            </code>
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <ProfileCard key={p.username} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div
        className={
          "mt-1 text-2xl font-bold " +
          (accent ? "text-emerald-400" : "text-neutral-100")
        }
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function TierStat({
  tier,
  count,
}: {
  tier: "good" | "viral" | "gem" | "diamond" | "unicorn";
  count: number;
}) {
  const config: Record<string, { emoji: string; label: string; color: string }> = {
    good: { emoji: "🟢", label: "good", color: "text-emerald-300" },
    viral: { emoji: "🥉", label: "viral", color: "text-amber-300" },
    gem: { emoji: "🥈", label: "gem", color: "text-slate-200" },
    diamond: { emoji: "🥇", label: "diamond", color: "text-yellow-300" },
    unicorn: { emoji: "💎", label: "unicorn", color: "text-purple-300" },
  };
  const c = config[tier];
  return (
    <div className="flex flex-col items-center rounded border border-neutral-800 bg-neutral-900 p-3 text-center">
      <div className="text-2xl">{c.emoji}</div>
      <div className={`text-xl font-bold ${c.color}`}>{count}</div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {c.label}
      </div>
    </div>
  );
}

function ProfileCard({
  p,
}: {
  p: Awaited<ReturnType<typeof getAllProfiles>>[number];
}) {
  return (
    <Link
      href={`/profiles/${p.username}`}
      className="group flex gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-600"
    >
      {p.profilePicUrl ? (
        <img
          src={imgProxy(p.profilePicUrl)}
          alt=""
          className="h-14 w-14 flex-shrink-0 rounded-full bg-neutral-800 object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xl">
          👤
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="font-semibold">@{p.username}</span>
          {p.isVerified && (
            <span className="text-xs text-blue-400">✓</span>
          )}
          {p.language && (
            <span className="ml-auto rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase">
              {p.language}
            </span>
          )}
        </div>
        {p.fullName && (
          <div className="truncate text-xs text-neutral-400">
            {p.fullName}
          </div>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs">
          <span title="Followers" className="text-neutral-300">
            👥 {fmt(p.followersCount)}
          </span>
          <span title="Mediana ER" className="text-emerald-400">
            ER {p.medianEngagementRate?.toFixed(1) ?? "—"}%
          </span>
          <span title="Posts trackeados" className="text-neutral-500">
            {p.totalPostsInDb}/{p.postsCount?.toLocaleString() ?? "—"}
          </span>
          {p.taggedPostsCount > 0 && (
            <span className="ml-auto rounded bg-emerald-900/40 px-1.5 py-0.5 text-emerald-300">
              {p.taggedPostsCount} virales
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
