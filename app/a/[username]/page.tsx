import Link from "next/link";
import { fetchProfileFast, IgFastError } from "@/lib/ig-fast";
import { FastProfileView } from "@/components/FastProfileView";
import { recordSearch } from "@/lib/searches";

// Siempre fresco: cada análisis consulta Instagram en vivo (~2-5s).
export const dynamic = "force-dynamic";

export default async function AnalyzePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const n = Math.min(96, Math.max(6, Number(sp.n ?? 48) || 48));

  let data: Awaited<ReturnType<typeof fetchProfileFast>> | null = null;
  let error: string | null = null;
  try {
    data = await fetchProfileFast(username, n);
    // Guardar en el historial (persistente) solo si el análisis funcionó.
    await recordSearch({
      type: "profile",
      label: `@${data.profile.username}`,
      href: `/a/${data.profile.username}?n=${n}`,
    });
  } catch (e) {
    error =
      e instanceof IgFastError
        ? e.message
        : "Error inesperado al consultar Instagram.";
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm">
        <Link href="/" className="text-neutral-400 hover:text-white">
          ← Analizar otro perfil
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-6 text-center text-red-200">
          <p className="font-medium">No se pudo analizar @{username}</p>
          <p className="mt-1 text-sm text-red-300/80">{error}</p>
        </div>
      ) : data ? (
        <FastProfileView profile={data.profile} posts={data.posts} />
      ) : null}
    </div>
  );
}
