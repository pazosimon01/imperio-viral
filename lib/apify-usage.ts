// Consulta el consumo mensual de Apify para mostrarlo en el header.
//
// Endpoints usados:
//   GET /v2/users/me/usage/monthly  → gasto del ciclo + breakdown + fechas
//   GET /v2/users/me                → plan + crédito mensual del plan
//
// Cache en memoria con TTL 5 min para no martillar a Apify en cada page load.
// Si la API falla, el componente del header se oculta gracefully — el
// caller debe llamar a esta función dentro de un try/catch.

import { APIFY_MONTHLY_CREDIT, APIFY_PLAN_NAME } from "./pricing";

const APIFY_API = "https://api.apify.com/v2";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export interface ApifyUsageSummary {
  planName: string;
  monthlyCreditUsd: number;
  usedUsd: number;
  percentUsed: number;
  cycleStartIso: string | null;
  cycleEndIso: string | null;
  daysRemaining: number | null;
  /** Top servicios del mes ordenados por gasto descendente (top 5). */
  topServices: Array<{ service: string; usd: number }>;
}

let cached: { at: number; value: ApifyUsageSummary } | null = null;

// Estructura real del response (verificada con tsx -e contra el API):
// `monthlyServiceUsage` es un OBJETO keyed por nombre de servicio
// (PAID_ACTORS_PER_EVENT, DATASET_READS, etc.), NO un array.
// No hay campo de total — hay que sumar `amountAfterVolumeDiscountUsd`
// (preferido) o `baseAmountUsd` (fallback) de cada servicio.
interface ApifyServiceUsage {
  quantity?: number;
  baseAmountUsd?: number;
  amountAfterVolumeDiscountUsd?: number;
}

interface ApifyUsageResponse {
  data?: {
    monthlyServiceUsage?: Record<string, ApifyServiceUsage>;
    usageCycle?: { startAt?: string; endAt?: string };
  };
}

interface ApifyUserResponse {
  data?: {
    plan?: {
      id?: string;
      tier?: string;
      monthlyUsageCreditsUsd?: number;
      monthlyBasePriceUsd?: number;
      maxMonthlyUsageUsd?: number;
    };
  };
}

// Labels más legibles para los servicios de Apify. Si llega uno nuevo
// no mapeado, mostramos el id raw (PASCAL_CASE legible).
const SERVICE_LABELS: Record<string, string> = {
  PAID_ACTORS_PER_EVENT: "Actores pagados",
  ACTOR_COMPUTE_UNITS: "Compute units",
  DATA_TRANSFER_EXTERNAL_GBYTES: "Transferencia externa",
  DATA_TRANSFER_INTERNAL_GBYTES: "Transferencia interna",
  DATASET_READS: "Lecturas dataset",
  DATASET_WRITES: "Escrituras dataset",
  DATASET_TIMED_STORAGE_GBYTE_HOURS: "Almacén dataset",
  KEY_VALUE_STORE_TIMED_STORAGE_GBYTE_HOURS: "Almacén KV",
  KEY_VALUE_STORE_READS: "Lecturas KV",
  KEY_VALUE_STORE_WRITES: "Escrituras KV",
  REQUEST_QUEUE_TIMED_STORAGE_GBYTE_HOURS: "Almacén queue",
  REQUEST_QUEUE_READS: "Lecturas queue",
  REQUEST_QUEUE_WRITES: "Escrituras queue",
  PROXY_RESIDENTIAL_TRANSFER_GBYTES: "Proxy residencial",
  PROXY_SERPS: "Proxy SERPs",
};

export async function fetchApifyUsage(): Promise<ApifyUsageSummary> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN no configurado en .env");

  const headers = { authorization: `Bearer ${token}` };
  const [usageRes, userRes] = await Promise.all([
    fetch(`${APIFY_API}/users/me/usage/monthly`, { headers }),
    fetch(`${APIFY_API}/users/me`, { headers }),
  ]);
  if (!usageRes.ok) {
    throw new Error(
      `Apify usage API error ${usageRes.status}: ${await usageRes.text()}`,
    );
  }
  if (!userRes.ok) {
    throw new Error(
      `Apify user API error ${userRes.status}: ${await userRes.text()}`,
    );
  }
  const usageJson = (await usageRes.json()) as ApifyUsageResponse;
  const userJson = (await userRes.json()) as ApifyUserResponse;

  const usage = usageJson.data ?? {};
  const user = userJson.data ?? {};
  const plan = user.plan ?? {};

  // Construir el breakdown por servicio y sumar el total — Apify no expone
  // un campo "total mensual", hay que calcularlo sumando cada servicio.
  // Preferimos `amountAfterVolumeDiscountUsd` (lo que realmente cobran) y
  // caemos a `baseAmountUsd` si no existe.
  const allServices = Object.entries(usage.monthlyServiceUsage ?? {}).map(
    ([key, val]) => ({
      service: SERVICE_LABELS[key] ?? key,
      usd: Number(
        val.amountAfterVolumeDiscountUsd ?? val.baseAmountUsd ?? 0,
      ),
    }),
  );
  const usedUsd = allServices.reduce((acc, s) => acc + s.usd, 0);
  // Top 5 servicios visibles (filtramos los céntimos de céntimo para ruido).
  const topServices = allServices
    .filter((s) => s.usd >= 0.005)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5);

  // Plan: el id viene en MAYÚSCULAS (STARTER) — lo capitalizamos. Si la API
  // no lo expone, usamos los fallbacks de lib/pricing.ts.
  const planIdRaw = plan.id ?? APIFY_PLAN_NAME;
  const planName =
    planIdRaw.charAt(0).toUpperCase() + planIdRaw.slice(1).toLowerCase();
  const monthlyCreditUsd = Number(
    plan.monthlyUsageCreditsUsd ??
      plan.maxMonthlyUsageUsd ??
      APIFY_MONTHLY_CREDIT,
  );

  const cycleStartIso = usage.usageCycle?.startAt ?? null;
  const cycleEndIso = usage.usageCycle?.endAt ?? null;
  const daysRemaining = cycleEndIso
    ? Math.max(
        0,
        Math.ceil(
          (new Date(cycleEndIso).getTime() - Date.now()) / 86_400_000,
        ),
      )
    : null;

  const percentUsed =
    monthlyCreditUsd > 0
      ? Math.min(999, (usedUsd / monthlyCreditUsd) * 100)
      : 0;

  const summary: ApifyUsageSummary = {
    planName,
    monthlyCreditUsd,
    usedUsd,
    percentUsed,
    cycleStartIso,
    cycleEndIso,
    daysRemaining,
    topServices,
  };
  cached = { at: Date.now(), value: summary };
  return summary;
}

/** Invalida el cache (útil tras un scrape para refrescar el badge). */
export function invalidateApifyUsageCache(): void {
  cached = null;
}
