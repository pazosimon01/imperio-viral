import { NextResponse } from "next/server";
import { listBrands, getActiveBrand } from "@/lib/brands";

export const runtime = "nodejs";

export async function GET() {
  const [brands, active] = await Promise.all([listBrands(), getActiveBrand()]);
  return NextResponse.json({ brands, active });
}
