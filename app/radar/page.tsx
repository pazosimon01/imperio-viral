import { ProfileSearch } from "@/components/ProfileSearch";
import { MultiProfileForm } from "@/components/MultiProfileForm";
import { ScrapeHashtagForm } from "@/components/ScrapeHashtagForm";
import { SavedSearches } from "@/components/SavedSearches";
import { ProxyHealthBanner } from "@/components/ProxyHealthBanner";
import { listSearches } from "@/lib/searches";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const searches = await listSearches();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      {/* Hero + búsqueda */}
      <section className="flex flex-col gap-3 pt-4 text-center">
        <h1 className="text-3xl font-bold">🔍 Radar</h1>
        <p className="text-neutral-400">
          Paso 2 del método. Analiza perfiles de Instagram y encuentra los virales
          con más engagement real (comparado con seguidores) para replicar el ángulo.
        </p>
      </section>

      <ProxyHealthBanner />

      <ProfileSearch />

      {/* Historial persistente de búsquedas */}
      <SavedSearches initial={searches} />

      {/* Opciones avanzadas — escondidas por defecto */}
      <details className="rounded-lg border border-neutral-800 bg-neutral-950/60">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm text-neutral-400 hover:text-neutral-200">
          ⚙️ Opciones avanzadas (varios perfiles · hashtags)
        </summary>
        <div className="grid grid-cols-1 gap-4 border-t border-neutral-800 p-4 lg:grid-cols-2">
          <MultiProfileForm />
          <ScrapeHashtagForm />
        </div>
      </details>
    </div>
  );
}
