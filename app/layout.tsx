import type { Metadata } from "next";
import Link from "next/link";
import { AudioToggle } from "@/components/AudioToggle";
import { ApifyUsageBadge } from "@/components/ApifyUsageBadge";
import { NicheSelector } from "@/components/NicheSelector";
import { listNiches, getActiveNiche } from "@/lib/niches";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imperio Viral",
  description: "Análisis de virales y tendencias en Instagram para creadores y agencias",
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
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight"
            >
              👑 Imperio Viral
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link
                href="/"
                className="text-neutral-400 hover:text-white"
              >
                Dashboard
              </Link>
              <Link
                href="/profiles"
                className="text-neutral-400 hover:text-white"
              >
                Perfiles
              </Link>
              <Link
                href="/hashtags"
                className="text-neutral-400 hover:text-white"
              >
                Hashtags
              </Link>
              <Link
                href="/posts"
                className="text-neutral-400 hover:text-white"
              >
                Posts
              </Link>
              <Link
                href="/shortlist"
                className="text-neutral-400 hover:text-white"
              >
                Shortlist
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <NicheSelector niches={niches} activeSlug={active.slug} />
              <ApifyUsageBadge />
              <AudioToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
