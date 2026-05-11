import { NextRequest, NextResponse } from "next/server";
import { getEnrichmentCandidates } from "@/lib/enrichment";
import {
  APIFY_PROFILE_COST_PER_ITEM,
} from "@/lib/pricing";
import type { HeatLevel } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const minHeat =
    (req.nextUrl.searchParams.get("minHeat") as HeatLevel) ?? "caliente";
  const candidates = await getEnrichmentCandidates(minHeat);
  const cost = candidates.length * APIFY_PROFILE_COST_PER_ITEM;

  return NextResponse.json({
    minHeat,
    count: candidates.length,
    estimatedCost: cost,
    candidates: candidates.slice(0, 50), // muestra hasta 50 para preview
  });
}
