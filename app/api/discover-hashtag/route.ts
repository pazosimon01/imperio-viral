import { NextRequest, NextResponse } from "next/server";
import { runHashtagScrape } from "@/lib/apify";

export const runtime = "nodejs";
export const maxDuration = 300;

// Descubre PERFILES a partir de hashtags del nicho (reemplaza el scraper viejo
// de Chrome). Usa Apify (que el usuario ya paga) → no depende de navegador,
// sesión de IG ni proxy, y es mucho más rápido. Saca los autores que publican
// en esos hashtags.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      hashtags?: string[];
      porHashtag?: number;
      tipo?: "posts" | "reels";
    };
    const hashtags = (body.hashtags ?? [])
      .map((h) => String(h).trim().replace(/^#+/, ""))
      .filter(Boolean);
    if (hashtags.length === 0) {
      return NextResponse.json({ error: "Pega al menos un hashtag." }, { status: 400 });
    }
    const perHashtag = Math.min(200, Math.max(20, Number(body.porHashtag) || 60));

    const { items } = await runHashtagScrape({
      hashtags,
      resultsType: body.tipo === "reels" ? "reels" : "posts",
      resultsLimit: perHashtag,
    });

    // Autores únicos = los perfiles del nicho.
    const seen = new Set<string>();
    const profiles: Array<{ username: string; fullName: string | null }> = [];
    for (const it of items) {
      const u = it.ownerUsername?.toLowerCase();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      profiles.push({ username: u, fullName: it.ownerFullName ?? null });
    }

    return NextResponse.json({ ok: true, count: profiles.length, profiles });
  } catch (e) {
    console.error("[discover-hashtag]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
