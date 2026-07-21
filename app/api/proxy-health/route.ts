import { NextResponse } from "next/server";
import { checkProxyHealth } from "@/lib/ig-fast";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const health = await checkProxyHealth();
  return NextResponse.json(health);
}
