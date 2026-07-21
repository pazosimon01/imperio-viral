// Scraper RÁPIDO directo a la API interna de Instagram — sin Apify, sin jobs,
// sin DB. Devuelve seguidores + posts recientes con su engagement en ~2-5s
// (igual que ViralFindr). Apify queda solo para los scrapes profundos/persistentes.
//
// Dos endpoints:
//   1. web_profile_info → metadata del perfil (seguidores, foto, etc.) + 12 posts.
//   2. feed/user/{id}   → paginación para traer más de 12 (max_id como cursor).
//
// IG puede limitar por IP si haces muchísimas consultas seguidas; manejamos
// errores (404 = no existe / privado, 429 = rate limit) con mensajes claros.

import { spawn } from "child_process";

const IG_APP_ID = "936619743392459";

// Proxy ROTATIVO opcional (IG_PROXY_URL en .env). Con un proxy que rota IP por
// request, se pueden analizar cientos/miles de perfiles sin que IG bloquee la
// IP. Sigue siendo anónimo (SIN login) → NUNCA arriesga la cuenta de Instagram.
//
// IMPORTANTE: cuando hay proxy, las llamadas a IG van por `curl` (no por el
// fetch de Node). Instagram detecta el "fingerprint" TLS de Node/undici a
// través del proxy y lo bloquea (429), pero acepta el de curl. Verificado.
const IG_PROXY_URL = (process.env.IG_PROXY_URL || "").trim();
export const PROXY_ENABLED = !!IG_PROXY_URL;

interface RawResponse {
  status: number;
  text: string;
}

// Request vía curl (para el camino con proxy). curl pasa el filtro anti-bot de
// IG donde el fetch de Node cae en 429.
function curlRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const args = [
      "-s",
      "--max-time",
      "45",
      "--connect-timeout",
      "15",
      "--proxy",
      IG_PROXY_URL,
      "-w",
      "\n__IGSTATUS__%{http_code}|%{http_connect}",
    ];
    if (method === "POST") args.push("-X", "POST");
    for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
    if (body) args.push("--data", body);
    args.push(url);

    const c = spawn("curl", args);
    let out = "";
    let err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("error", (e) => {
      lastProxyDetail = `spawn error: ${e.message}`;
      reject(e);
    });
    c.on("close", (closeCode) => {
      const idx = out.lastIndexOf("\n__IGSTATUS__");
      if (idx === -1) {
        // Sin marcador → falló antes de responder. curl exit: 7=no conecta al
        // proxy (puerto bloqueado/host malo), 28=timeout, 5=DNS del proxy.
        lastProxyDetail = `curl exit ${closeCode}${err ? " · " + err.slice(0, 100) : ""}`;
        if (/407|proxy auth|CONNECT tunnel failed/i.test(err)) markProxyAuthFail();
        reject(new Error("curl sin status: " + (err || `exit ${closeCode}`)));
        return;
      }
      const tail = out.slice(idx + 13); // "<httpCode>|<httpConnect>"
      const [codeStr, connectStr] = tail.split("|");
      const httpCode = parseInt(codeStr, 10) || 0;
      const connectCode = parseInt(connectStr, 10) || 0;
      lastProxyDetail = `http=${httpCode} connect=${connectCode} exit=${closeCode}`;
      // http_connect = respuesta del proxy al túnel HTTPS. 407 = sin saldo / auth.
      if (connectCode === 407 || httpCode === 407) markProxyAuthFail();
      resolve({ status: httpCode, text: out.slice(0, idx) });
    });
  });
}

// Último detalle técnico del intento por proxy (para diagnóstico en la nube).
let lastProxyDetail = "";

// ── Salud del proxy (detección de saldo agotado / auth) ─────────────────────
let proxyAuthFailedAt = 0;
function markProxyAuthFail() {
  proxyAuthFailedAt = Date.now();
}
// ¿El proxy rechazó auth (407) en los últimos 2 min? → probable saldo agotado.
export function proxyAuthRecentlyFailed(): boolean {
  return PROXY_ENABLED && Date.now() - proxyAuthFailedAt < 120_000;
}

export interface ProxyHealth {
  configured: boolean;
  ok: boolean;
  code: "ok" | "no_saldo" | "sin_proxy" | "caido";
  message: string;
  detail?: string; // diagnóstico técnico (exit code de curl, etc.)
  host?: string; // host del proxy (sin credenciales) para verificar cuál está activo
}

// Host del proxy sin credenciales (para saber CUÁL proxy está activo sin filtrar la clave).
function proxyHostSafe(): string {
  const m = IG_PROXY_URL.match(/@([^/]+)/);
  return m ? m[1] : IG_PROXY_URL ? "(sin @host)" : "";
}

// Chequeo activo: intenta un CONNECT por el proxy y lee la respuesta del túnel.
export async function checkProxyHealth(): Promise<ProxyHealth> {
  if (!PROXY_ENABLED) {
    return {
      configured: false,
      ok: true,
      code: "sin_proxy",
      message: "No hay proxy configurado (falta IG_PROXY_URL). Se usa la IP directa y se limita rápido.",
      host: "",
    };
  }
  const host = proxyHostSafe();
  try {
    const r = await curlRequest("GET", "https://www.instagram.com/robots.txt", {
      "User-Agent": UA_DESKTOP,
    });
    if (proxyAuthRecentlyFailed() || r.status === 407) {
      return {
        configured: true, ok: false, code: "no_saldo", host,
        detail: lastProxyDetail,
        message: "El proxy (Evomi) rechaza la conexión — probablemente se agotó el saldo. Recárgalo para poder analizar.",
      };
    }
    if (r.status > 0) {
      return { configured: true, ok: true, code: "ok", host, detail: lastProxyDetail, message: "Proxy activo." };
    }
    return {
      configured: true, ok: false, code: "caido", host,
      detail: lastProxyDetail,
      message: "El proxy no responde. Revisa Evomi o que la variable IG_PROXY_URL esté bien puesta.",
    };
  } catch {
    if (proxyAuthRecentlyFailed()) {
      return {
        configured: true, ok: false, code: "no_saldo", host,
        detail: lastProxyDetail,
        message: "El proxy (Evomi) rechaza la conexión — probablemente sin saldo. Recárgalo.",
      };
    }
    return {
      configured: true, ok: false, code: "caido", host,
      detail: lastProxyDetail,
      message: "El proxy no responde. Revisa Evomi o que la variable IG_PROXY_URL esté bien puesta.",
    };
  }
}

// Hace la request por curl (si hay proxy) o por fetch nativo (directo).
// Si el proxy falla (status 0 = network error), hace fallback a fetch directo
// SOLO para esa request. Cuenta fallos consecutivos: si 5 seguidos fallan,
// marca el proxy como caído por 5 min (evita perder tiempo en un proxy muerto).
let proxyConsecutiveFails = 0;
let proxyDisabledUntil = 0;

let lastRequestTime = 0;
const MIN_REQUEST_GAP_MS = PROXY_ENABLED ? 120 : 350;

async function rawRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): Promise<RawResponse> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - elapsed);
  }
  lastRequestTime = Date.now();

  if (IG_PROXY_URL && Date.now() > proxyDisabledUntil) {
    try {
      const r = await curlRequest(method, url, headers, body);
      if (r.status !== 0) {
        proxyConsecutiveFails = 0;
        return r;
      }
    } catch {
      // curl spawn error — count as failure
    }
    proxyConsecutiveFails++;
    if (proxyConsecutiveFails >= 15) {
      proxyDisabledUntil = Date.now() + 120_000;
      console.warn("[ig-fast] proxy caído (15 fallos seguidos), desactivado 2 min");
      proxyConsecutiveFails = 0;
    } else {
      await sleep(500);
      try {
        const r2 = await curlRequest(method, url, headers, body);
        if (r2.status !== 0) {
          proxyConsecutiveFails = 0;
          return r2;
        }
      } catch {
        // retry also failed
      }
    }
  }
  const res = await fetch(url, { method, headers, body });
  return { status: res.status, text: await res.text() };
}
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 309.0.0";
// UA de la app nativa de IG — necesario para el endpoint clips/user (pestaña Reels).
const UA_IGAPP = "Instagram 309.0.0.0 (iPhone; iOS 17_0; en_US) AppleWebKit/420+";

export interface FastPost {
  id: string;
  shortcode: string | null;
  url: string; // permalink de Instagram
  thumbnailUrl: string | null;
  videoUrl: string | null; // URL reproducible del reel (preview en la app)
  mediaType: "image" | "video" | "carousel";
  likes: number; // -1 = IG ocultó el contador
  comments: number;
  views: number | null; // solo reels
  takenAt: number; // unix segundos
  caption: string | null;
  engagementRate: number | null; // (likes + comments) / followers × 100
}

export interface FastProfile {
  username: string;
  fullName: string | null;
  bio: string | null;
  followers: number | null;
  following: number | null;
  postsCount: number | null;
  profilePicUrl: string | null;
  isVerified: boolean;
  isPrivate: boolean;
}

export interface FastResult {
  profile: FastProfile;
  posts: FastPost[];
}

export class IgFastError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "rate_limited" | "network" | "parse"
  ) {
    super(message);
    this.name = "IgFastError";
  }
}

function cleanUsername(input: string): string {
  const cleaned = input.trim().replace(/^@/, "");
  const m = cleaned.match(/instagram\.com\/([^/?#]+)/i);
  return (m ? m[1] : cleaned).toLowerCase().replace(/\/+$/, "");
}

// IG a veces devuelve JSON con caracteres de control sin escapar dentro de los
// captions. JSON.parse los rechaza → los limpiamos antes de parsear.
function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/[\u0000-\u001F]+/g, " "));
  }
}

const RATE_LIMIT_MSG =
  "Instagram limitó las consultas (demasiadas seguidas). Espera 2-3 minutos y reintenta, o analiza menos perfiles a la vez.";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function igHeaders(ua: string): Record<string, string> {
  return {
    "x-ig-app-id": IG_APP_ID,
    "User-Agent": ua,
    Accept: "*/*",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    // El WAF de IG rechaza la petición ("SecFetch Policy violation") si no
    // parece una llamada same-origin de su propia web. Estos headers la emulan.
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Referer: "https://www.instagram.com/",
    Origin: "https://www.instagram.com",
  };
}

// Expuesto para lib/ig-discover.ts (perfiles relacionados). Reusa el mismo
// transporte (curl+proxy con fallback) y los mismos headers anti-WAF.
export async function igFetchJson(url: string, mobile = false): Promise<any> {
  return igFetch(url, mobile ? UA_MOBILE : UA_DESKTOP);
}

async function igFetch(url: string, ua: string, attempt = 0): Promise<any> {
  let status: number;
  let text: string;
  try {
    ({ status, text } = await rawRequest("GET", url, igHeaders(ua)));
  } catch (e) {
    if (attempt < 2) {
      await sleep(1000 * (attempt + 1));
      return igFetch(url, ua, attempt + 1);
    }
    throw new IgFastError(
      `No se pudo conectar con Instagram: ${e instanceof Error ? e.message : e}`,
      "network"
    );
  }

  if (status === 404) {
    throw new IgFastError("Perfil no encontrado.", "not_found");
  }
  // 429 y 401 ("Please wait a few minutes", require_login) = límite de IG por IP.
  // Con proxy, cada reintento sale por una IP nueva → suele resolverse.
  if (status === 429 || status === 401) {
    const maxAttempts = IG_PROXY_URL ? 4 : 3;
    if (attempt < maxAttempts) {
      await sleep((IG_PROXY_URL ? 600 : 2500) * (attempt + 1));
      return igFetch(url, ua, attempt + 1);
    }
    throw new IgFastError(RATE_LIMIT_MSG, "rate_limited");
  }
  if (status < 200 || status >= 300) {
    throw new IgFastError(`Instagram respondió ${status}.`, "network");
  }

  try {
    return safeJsonParse(text);
  } catch {
    throw new IgFastError(
      "Instagram devolvió una respuesta inesperada (¿requiere login?).",
      "parse"
    );
  }
}

function erFor(
  likes: number,
  comments: number,
  followers: number | null
): number | null {
  if (!followers || followers <= 0) return null;
  const l = Math.max(0, likes);
  const c = Math.max(0, comments);
  return Math.round(((l + c) / followers) * 1000) / 10; // 1 decimal
}

// IG entrega cada reel en varias resoluciones (video_versions). Para el preview
// elegimos la MÁS LIVIANA (menor área) → carga mucho más rápido al hacer hover.
function pickLightestVideo(versions: any[]): string | null {
  if (!Array.isArray(versions) || versions.length === 0) return null;
  let best = versions[0];
  let bestArea = (best.width ?? 1e9) * (best.height ?? 1e9);
  for (const v of versions) {
    if (!v?.url) continue;
    const area = (v.width ?? 1e9) * (v.height ?? 1e9);
    if (area < bestArea) {
      best = v;
      bestArea = area;
    }
  }
  return best?.url ?? versions[0]?.url ?? null;
}

// --- Parser del shape "private API" (endpoint feed/user) ---
function parseFeedItem(it: any, followers: number | null): FastPost | null {
  if (!it) return null;
  const mt = it.media_type;
  const mediaType: FastPost["mediaType"] =
    mt === 2 ? "video" : mt === 8 ? "carousel" : "image";
  const thumb =
    it.image_versions2?.candidates?.[0]?.url ??
    it.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ??
    null;
  const likes = typeof it.like_count === "number" ? it.like_count : 0;
  const comments =
    typeof it.comment_count === "number" ? it.comment_count : 0;
  // "Reproducciones" público = el mayor de los contadores (play incluye replays;
  // view_count es el contador viejo, más bajo). Tomamos el máximo para que
  // coincida con lo que muestra Instagram.
  const viewCandidates = [it.play_count, it.ig_play_count, it.view_count].filter(
    (v): v is number => typeof v === "number" && v >= 0
  );
  const views = viewCandidates.length ? Math.max(...viewCandidates) : null;
  const code = it.code ?? null;
  return {
    id: String(it.pk ?? it.id ?? code ?? Math.random()),
    shortcode: code,
    url: code ? `https://www.instagram.com/p/${code}/` : "https://instagram.com",
    thumbnailUrl: thumb,
    videoUrl: pickLightestVideo(it.video_versions) ?? null,
    mediaType,
    likes,
    comments,
    views: typeof views === "number" ? views : null,
    takenAt: it.taken_at ?? Math.floor(Date.now() / 1000),
    caption: it.caption?.text ?? null,
    engagementRate: erFor(likes, comments, followers),
  };
}

// --- Parser del shape "GraphQL" (web_profile_info edges) ---
function parseGraphNode(node: any, followers: number | null): FastPost | null {
  if (!node) return null;
  const typename = node.__typename ?? "";
  const mediaType: FastPost["mediaType"] = typename.includes("Video")
    ? "video"
    : typename.includes("Sidecar")
    ? "carousel"
    : "image";
  const likes = node.edge_liked_by?.count ?? node.edge_media_preview_like?.count ?? 0;
  const comments = node.edge_media_to_comment?.count ?? 0;
  const code = node.shortcode ?? null;
  return {
    id: String(node.id ?? code ?? Math.random()),
    shortcode: code,
    url: code ? `https://www.instagram.com/p/${code}/` : "https://instagram.com",
    thumbnailUrl: node.display_url ?? node.thumbnail_src ?? null,
    videoUrl: node.video_url ?? null,
    mediaType,
    likes,
    comments,
    views: node.video_view_count ?? null,
    takenAt: node.taken_at_timestamp ?? Math.floor(Date.now() / 1000),
    caption: node.edge_media_to_caption?.edges?.[0]?.node?.text ?? null,
    engagementRate: erFor(likes, comments, followers),
  };
}

// Timeline (grilla): trae fotos, carruseles y algunos reels.
async function fetchTimeline(
  userId: string,
  max: number,
  followers: number | null
): Promise<FastPost[]> {
  const out: FastPost[] = [];
  let maxId: string | null = null;
  let guard = 0;
  while (out.length < max && guard < 12) {
    guard++;
    const url =
      `https://i.instagram.com/api/v1/feed/user/${userId}/?count=33` +
      (maxId ? `&max_id=${encodeURIComponent(maxId)}` : "");
    let feed: any;
    try {
      feed = await igFetch(url, UA_MOBILE);
    } catch {
      break;
    }
    for (const it of feed?.items ?? []) {
      const p = parseFeedItem(it, followers);
      if (p) out.push(p);
    }
    if (!feed?.more_available || !feed?.next_max_id) break;
    maxId = feed.next_max_id;
  }
  return out;
}

// Pestaña REELS (clips/user): muchos perfiles tienen los reels SOLO acá, no en
// la grilla. Endpoint POST en i.instagram.com con UA de la app nativa.
async function fetchClips(
  userId: string,
  max: number,
  followers: number | null
): Promise<FastPost[]> {
  const out: FastPost[] = [];
  let maxId: string | null = null;
  let guard = 0;
  while (out.length < max && guard < 10) {
    guard++;
    let body = `target_user_id=${userId}&page_size=12`;
    if (maxId) body += `&max_id=${encodeURIComponent(maxId)}`;
    let data: any;
    try {
      const res = await rawRequest(
        "POST",
        "https://i.instagram.com/api/v1/clips/user/",
        {
          "x-ig-app-id": IG_APP_ID,
          "User-Agent": UA_IGAPP,
          Accept: "*/*",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body
      );
      if (res.status < 200 || res.status >= 300) break;
      data = safeJsonParse(res.text);
    } catch {
      break;
    }
    for (const it of data?.items ?? []) {
      const p = parseFeedItem(it?.media, followers);
      if (p) out.push(p);
    }
    const more = data?.paging_info?.more_available;
    const nm = data?.paging_info?.max_id;
    if (!more || !nm) break;
    maxId = nm;
  }
  return out;
}

export async function fetchProfileFast(
  rawUsername: string,
  maxPosts = 12
): Promise<FastResult> {
  const username = cleanUsername(rawUsername);
  if (!username) throw new IgFastError("Username inválido.", "not_found");

  // 1) Metadata + primeros 12 posts (1 request, ~2s).
  const info = await igFetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
      username
    )}`,
    UA_DESKTOP
  );
  const user = info?.data?.user;
  if (!user) throw new IgFastError("Perfil no encontrado.", "not_found");

  const followers: number | null = user.edge_followed_by?.count ?? null;
  const profile: FastProfile = {
    username: user.username ?? username,
    fullName: user.full_name || null,
    bio: user.biography || null,
    followers,
    following: user.edge_follow?.count ?? null,
    postsCount: user.edge_owner_to_timeline_media?.count ?? null,
    profilePicUrl: user.profile_pic_url_hd ?? user.profile_pic_url ?? null,
    isVerified: !!user.is_verified,
    isPrivate: !!user.is_private,
  };

  const posts: FastPost[] = [];
  const seen = new Set<string>();
  const push = (p: FastPost | null) => {
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      posts.push(p);
    }
  };

  // Traemos en PARALELO la pestaña Reels (clips/user) y la grilla (timeline).
  // Muchos perfiles tienen los reels SOLO en la pestaña Reels, así que sin esto
  // solo aparecían fotos/carruseles. Ambos endpoints dan el play_count real.
  if (!profile.isPrivate && user.id) {
    const [reels, timeline] = await Promise.all([
      fetchClips(user.id, maxPosts, followers),
      fetchTimeline(user.id, maxPosts, followers),
    ]);
    // Reels primero para que, ante duplicados, gane la versión con métricas de reel.
    for (const p of reels) push(p);
    for (const p of timeline) push(p);
  }

  // Fallback: si ambos endpoints fallaron, usamos los ~12 del web_profile_info.
  if (posts.length === 0) {
    const firstEdges = user.edge_owner_to_timeline_media?.edges ?? [];
    for (const e of firstEdges) push(parseGraphNode(e?.node, followers));
  }

  // Recorte + orden por engagement (mayor → menor), nulls al final.
  const trimmed = posts.slice(0, maxPosts);
  trimmed.sort((a, b) => {
    const ea = a.engagementRate ?? -1;
    const eb = b.engagementRate ?? -1;
    return eb - ea;
  });

  return { profile, posts: trimmed };
}
