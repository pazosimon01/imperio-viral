import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ApifyUsageBadge } from "@/components/ApifyUsageBadge";
import { NicheSelector } from "@/components/NicheSelector";
import { listNiches, getActiveNiche } from "@/lib/niches";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imperio Viral",
  description: "Análisis de virales y tendencias en Instagram para creadores y agencias",
  // Sin referer en TODAS las peticiones: el CDN de IG devuelve 302 si ve un
  // referer de localhost (rompía la reproducción de los reels). Las imágenes ya
  // usaban no-referrer por elemento; esto lo extiende también a los <video>.
  referrer: "no-referrer",
  manifest: "/manifest.webmanifest",
  // Para "Agregar a inicio" en iPhone: se abre a pantalla completa como app.
  appleWebApp: {
    capable: true,
    title: "Imperio Viral",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // evita el zoom automático de iOS al tocar inputs
  viewportFit: "cover", // usa toda la pantalla incl. el notch
  themeColor: "#0a0a0a",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [niches, active] = await Promise.all([listNiches(), getActiveNiche()]);

  return (
    <html lang="es">
      <body>
        <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6">
            <Link href="/" className="whitespace-nowrap text-base font-bold tracking-tight sm:text-lg">
              👑 Imperio
            </Link>
            <nav className="flex gap-3 text-sm sm:gap-4">
              <Link href="/" className="text-neutral-400 hover:text-white">
                Inicio
              </Link>
              <Link
                href="/profiles"
                className="text-neutral-400 hover:text-white"
              >
                Perfiles
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <NicheSelector niches={niches} activeSlug={active.slug} />
              <span className="hidden sm:block">
                <ApifyUsageBadge />
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
