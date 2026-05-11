import { NextResponse } from "next/server";
import { fetchApifyUsage } from "@/lib/apify-usage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const usage = await fetchApifyUsage();
    return NextResponse.json(usage);
  } catch (e) {
    console.error("apify usage error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status: 502 },
    );
  }
}
