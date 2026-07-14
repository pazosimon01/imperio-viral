import Link from "next/link";
import { getAllProfiles } from "@/lib/queries";
import { imgProxy } from "@/lib/img";
import { ProfileSearch } from "@/components/ProfileSearch";

export const revalidate = 30;

export default async function ProfilesIndexPage() {
  const profiles = await getAllProfiles();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">Perfiles trackeados</h1>
        <p className="text-sm text-neutral-400">
          {profiles.length} perfil(es) · ordenados por followers
        </p>
      </header>

      <ProfileSearch />

      {profiles.length === 0 ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 text-neutral-400">
          Aún no has trackeado ningún perfil. Corre{" "}
          <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-xs">
            npm run scrape:profile -- --user=USERNAME
          </code>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left">Perfil</th>
                <th className="px-4 py-3 text-right">Seguidores</th>
                <th className="px-4 py-3 text-right">Engagement típico</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr
                  key={p.username}
                  className="border-b border-neutral-900 last:border-0 hover:bg-neutral-900/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/a/${p.username}`}
                      className="flex items-center gap-3"
                    >
                      {p.profilePicUrl ? (
                        <img
                          src={imgProxy(p.profilePicUrl)}
                          alt=""
                          className="h-8 w-8 rounded-full bg-neutral-800 object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800">
                          👤
                        </div>
                      )}
                      <div>
                        <div className="font-medium">
                          @{p.username}{" "}
                          {p.isVerified && (
                            <span className="text-xs text-blue-400">✓</span>
                          )}
                        </div>
                        {p.fullName && (
                          <div className="text-xs text-neutral-500">
                            {p.fullName}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmt(p.followersCount)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">
                    {p.medianEngagementRate?.toFixed(1) ?? "—"}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
