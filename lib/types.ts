// Tipos del proyecto. Reflejan tanto la respuesta cruda del actor de Apify
// como la forma normalizada que guardamos en SQLite.

export type PostType = "Image" | "Sidecar" | "Video";

// Lo que devuelve apify/instagram-hashtag-scraper por cada item.
// No incluye todos los campos; solo los que usamos.
export interface ApifyHashtagItem {
  id: string;
  shortCode?: string;
  url: string;
  type: PostType;
  ownerUsername?: string;
  ownerFullName?: string;
  ownerId?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  locationName?: string;
  videoUrl?: string;
  videoDuration?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  sharesCount?: number;
  likesCount?: number;
  commentsCount?: number;
  displayUrl?: string;
  images?: string[];
  childPosts?: Array<{ displayUrl?: string; videoUrl?: string }>;
  musicInfo?: {
    artist_name?: string;
    song_name?: string;
    audio_id?: string;
    uses_original_audio?: boolean;
  };
  timestamp?: string; // ISO date
  isSponsored?: boolean;
  dimensionsHeight?: number;
  dimensionsWidth?: number;
}

// Forma normalizada que guardamos en la tabla `posts`.
export interface StoredPost {
  id: string;
  shortCode: string | null;
  url: string;
  type: PostType;

  ownerUsername: string | null;
  ownerFullName: string | null;
  ownerId: string | null;

  caption: string | null;
  hashtags: string[];
  mentions: string[];
  locationName: string | null;

  videoUrl: string | null;
  videoDuration: number | null;
  images: string[]; // 1+ para carruseles, 1 para post simple, [] para reels
  displayUrl: string | null;

  musicArtist: string | null;
  musicTrack: string | null;
  musicId: string | null;

  likesCount: number;
  commentsCount: number;
  videoViewCount: number | null;
  videoPlayCount: number | null;
  sharesCount: number | null;

  postedAt: number; // unix seconds
  scrapedAt: number; // unix seconds
  sourceHashtag: string | null;
  sourceProfile: string | null; // username si vino de scrape de perfil
  language: "es" | "en" | "pt" | "other" | null;

  // Scores calculados (ver lib/score.ts para fórmulas)
  engagementScore: number; // absoluto: likes + comments×4 + shares×6
  engagementRate: number | null; // % por followers (estándar mercado)
  viewRate: number | null; // % por views (solo reels — complementario)
  viralVelocity: number | null;
  viralScore: number | null;
  // Multiplicador sobre la mediana del perfil (solo si vino de profile scrape).
  // Calculado retroactivamente en lib/baseline.ts tras el scrape.
  viralidadMultiplier: number | null;
  viralTier: ViralTier | null;

  rawJson: string;
}

// Tiers de viralidad sobre la mediana del perfil (escala del experto):
//   2-5x  → buen performance
//   5-10x → viral del perfil
//   10-25x → joya viral
//   25-50x → diamante
//   50x+  → unicornio
export type ViralTier = "good" | "viral" | "gem" | "diamond" | "unicorn";

export interface StoredProfile {
  username: string;
  fullName: string | null;
  bio: string | null;
  followersCount: number | null;
  followingCount: number | null;
  postsCount: number | null;
  profilePicUrl: string | null;
  isVerified: boolean | null;
  language: "es" | "en" | "pt" | "other" | null;
  // Baselines recalculados tras cada scrape de perfil
  medianEngagementScore: number | null;
  medianEngagementRate: number | null;
  medianViews: number | null;
  scrapedAt: number;
}

export type Decision = "replicate" | "maybe" | "skip";

export interface StoredDecision {
  postId: string;
  decision: Decision;
  notes: string | null;
  decidedAt: number;
}

export interface StoredTranscription {
  postId: string;
  transcription: string;
  language: string | null;
  transcribedAt: number;
}

// Estructura del JSON generado por el LLM al adaptar una transcripción.
// Guardado en `adaptations.result_json` como blob serializado.
export interface AdaptationResult {
  adaptedScript: string; // Guión completo en español, listo para grabar
  hook: { type: string; quote: string }; // Hook (primeros ~3 segundos)
  development: string[]; // Puntos clave del desarrollo
  cta: { type: string; quote: string }; // Cierre / llamado a la acción
  template: string; // Plantilla con [PLACEHOLDERS] para reusar el ángulo
  alternativeHooks: string[]; // 5 hooks alternos sobre el mismo tema
}

export interface StoredAdaptation {
  postId: string;
  sourceLang: string | null;
  result: AdaptationResult;
  model: string;
  adaptedAt: number;
}

export interface ScrapeRun {
  id: number;
  hashtag: string | null;
  startedAt: number;
  finishedAt: number | null;
  itemsCount: number | null;
  apifyRunId: string | null;
  error: string | null;
}
