import { ProfileSearch } from "@/components/ProfileSearch";
import { MultiProfileForm } from "@/components/MultiProfileForm";
import { ScrapeHashtagForm } from "@/components/ScrapeHashtagForm";
import { SavedSearches } from "@/components/SavedSearches";
import { listSearches } from "@/lib/searches";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const searches = await listSearches();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      {/* Hero + búsqueda */}
      <section className="flex flex-col gap-3 pt-4 text-center">
        <h1 className="text-3xl font-bold">Analiza cualquier perfil de Instagram</h1>
        <p className="text-neutral-400">
          Escribe un perfil y mira sus publicaciones ordenadas por engagement
          real (comparado con sus seguidores), de mayor a menor.
        </p>
      </section>

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
