import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostById } from "@/lib/queries";
import { getTranscription } from "@/lib/transcription";
import { getAdaptation } from "@/lib/adaptation";
import { TierBadge, EngagementBadge } from "@/components/TierBadge";
import { MediaViewer } from "@/components/MediaViewer";
import { DecisionButtons } from "@/components/DecisionButtons";
import { NotionButton } from "@/components/NotionButton";
import { BackButton } from "@/components/BackButton";
import { TranscribeButton } from "@/components/TranscribeButton";
import { TranscriptionEditor } from "@/components/TranscriptionEditor";
import { AdaptButton } from "@/components/AdaptButton";
import { AnalyzeVideoButton } from "@/components/AnalyzeVideoButton";
import { getVideoAnalysis } from "@/lib/video-analysis";

export const revalidate = 30;

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  const plays = post.videoViewCount ?? post.videoPlayCount;
  const ageDays = ((Date.now() / 1000 - post.postedAt) / 86400).toFixed(1);
  const transcription =
    post.type === "Video" ? await getTranscription(post.id) : null;
  const videoAnalysis =
    post.type === "Video" ? await getVideoAnalysis(post.id) : null;
  const adaptation = transcription ? await getAdaptation(post.id) : null;
  // Solo ofrecemos adaptación si el reel NO está en español. Si ya está en es,
  // omitimos el botón (decisión explícita del usuario al elegir el alcance).
  const sourceLang = transcription?.language ?? null;
  const shouldOfferAdapt =
    !!transcription && sourceLang !== "es" && !adaptation;

  return (
    <div className="flex flex-col gap-5">
      {/* Navegación */}
      <div className="flex items-center gap-3">
        <BackButton fallbackHref="/posts" />
        {post.sourceProfile && (
          <Link
            href={`/profiles/${post.sourceProfile}`}
            className="text-sm text-neutral-400 hover:text-white"
          >
            Ir al perfil de @{post.sourceProfile} →
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Columna izquierda — Media */}
        <div>
          <MediaViewer post={post} />

          {/* Caption */}
          {post.caption && (
            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
              <h3 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                Caption
              </h3>
              <p className="whitespace-pre-line text-sm text-neutral-200">
                {post.caption}
              </p>
              {post.hashtags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {post.hashtags.map((h) => (
                    <span
                      key={h}
                      className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Análisis visual frame por frame (solo reels) */}
          {post.type === "Video" && post.videoUrl && (
            <div className="mt-4">
              <AnalyzeVideoButton
                postId={post.id}
                initialAnalysis={
                  videoAnalysis
                    ? {
                        result: videoAnalysis.result,
                        framesCount: videoAnalysis.framesCount,
                      }
                    : null
                }
              />
            </div>
          )}

          {/* Transcripción (solo reels) */}
          {post.type === "Video" && (
            <div className="mt-4">
              {transcription ? (
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs uppercase tracking-wider text-neutral-500">
                      📝 Transcripción
                      {transcription.language && (
                        <span className="ml-2 font-mono text-neutral-600">
                          [{transcription.language}]
                        </span>
                      )}
                    </h3>
                    <span className="text-[11px] text-neutral-600">
                      {new Date(
                        transcription.transcribedAt * 1000,
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  <TranscriptionEditor
                    postId={post.id}
                    initialText={transcription.transcription}
                    hasAdaptation={!!adaptation}
                  />
                  <div className="mt-3 border-t border-neutral-900 pt-3">
                    <TranscribeButton postId={post.id} hasExisting />
                  </div>
                </div>
              ) : post.videoUrl ? (
                <TranscribeButton postId={post.id} hasExisting={false} />
              ) : null}
            </div>
          )}

          {/* Adaptación al español + anatomía (solo si hay transcripción no-es) */}
          {shouldOfferAdapt && (
            <div className="mt-4">
              <AdaptButton
                postId={post.id}
                hasExisting={false}
                sourceLang={sourceLang}
              />
            </div>
          )}

          {adaptation && (
            <div className="mt-4 flex flex-col gap-3">
              {/* Bloque 1 — Guión adaptado */}
              <div className="rounded-lg border border-purple-900/50 bg-purple-950/20 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs uppercase tracking-wider text-purple-300">
                    🎙️ Guión adaptado al español
                  </h3>
                  <span className="text-[11px] text-neutral-500">
                    {adaptation.model} ·{" "}
                    {new Date(
                      adaptation.adaptedAt * 1000,
                    ).toLocaleDateString()}
                  </span>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-100">
                  {adaptation.result.adaptedScript}
                </p>
              </div>

              {/* Bloque 2 — Anatomía */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <h3 className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
                  🧬 Anatomía del guión
                </h3>
                <div className="space-y-3 text-sm">
                  <AnatomyRow
                    icon="🎯"
                    label="Hook (0-3s)"
                    type={adaptation.result.hook.type}
                    quote={adaptation.result.hook.quote}
                  />
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-neutral-400">
                      📖 Desarrollo
                    </div>
                    <ul className="ml-1 space-y-1 text-neutral-200">
                      {adaptation.result.development.map((point, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-neutral-600">
                            {i + 1}.
                          </span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <AnatomyRow
                    icon="🎬"
                    label="CTA / cierre"
                    type={adaptation.result.cta.type}
                    quote={adaptation.result.cta.quote}
                  />
                </div>
              </div>

              {/* Bloque 3 — Plantilla replicable */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <h3 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                  📋 Plantilla replicable
                </h3>
                <p className="whitespace-pre-line rounded bg-neutral-900 p-3 font-mono text-xs leading-relaxed text-emerald-200">
                  {adaptation.result.template}
                </p>
              </div>

              {/* Bloque 4 — Hooks alternativos */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <h3 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                  🎣 Hooks alternativos sobre el mismo tema
                </h3>
                <ol className="space-y-2 text-sm text-neutral-200">
                  {adaptation.result.alternativeHooks.map((h, i) => (
                    <li
                      key={i}
                      className="flex gap-3 border-l-2 border-purple-700/50 pl-3"
                    >
                      <span className="font-mono text-purple-400">
                        {i + 1}.
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <AdaptButton
                  postId={post.id}
                  hasExisting
                  sourceLang={sourceLang}
                />
              </div>
            </div>
          )}
        </div>

        {/* Columna derecha — Métricas + decisiones */}
        <aside className="flex flex-col gap-4">
          {/* Header */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex items-center gap-2">
              {post.viralTier && (
                <TierBadge
                  tier={post.viralTier}
                  multiplier={post.viralidadMultiplier}
                />
              )}
              <span className="ml-auto text-xs text-neutral-500">
                {post.type} · {ageDays}d ago
              </span>
            </div>

            {post.ownerUsername && (
              <Link
                href={`/profiles/${post.ownerUsername}`}
                className="mt-2 block text-base font-semibold hover:underline"
              >
                @{post.ownerUsername}
              </Link>
            )}

            {/* Métricas */}
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row
                label="Likes"
                value={
                  post.likesCount === -1
                    ? "ocultos por el autor"
                    : fmtCount(post.likesCount)
                }
                icon="❤️"
              />
              <Row
                label="Comments"
                value={fmtCount(post.commentsCount)}
                icon="💬"
              />
              {plays != null ? (
                <Row label="Plays" value={fmtCount(plays)} icon="▶️" />
              ) : (
                <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2 text-[11px] leading-snug text-neutral-400">
                  ⓘ Instagram no expone <strong>alcance/impresiones</strong> para
                  fotos y carruseles a usuarios externos. Solo el dueño de la
                  cuenta lo ve. Para comparar viralidad entre tipos, usa el{" "}
                  <strong>multiplicador</strong> (siguiente bloque).
                </div>
              )}
              {post.sharesCount != null && (
                <Row
                  label="Shares"
                  value={fmtCount(post.sharesCount)}
                  icon="🔁"
                />
              )}
              {post.viralidadMultiplier != null && (
                <Row
                  label="vs. mediana del perfil"
                  value={`${post.viralidadMultiplier.toFixed(1)}×`}
                  icon="📊"
                />
              )}
              {post.ownerFollowersCount != null && (
                <Row
                  label="Followers del autor"
                  value={fmtCount(post.ownerFollowersCount)}
                  icon="👥"
                />
              )}
              {post.viewsPerFollower != null && (
                <Row
                  label="Views / Followers"
                  value={`${post.viewsPerFollower.toFixed(2)}×${post.viewsPerFollower >= 5 ? " 🚀" : ""}`}
                  icon="📈"
                />
              )}
              {post.viewRate != null && (
                <Row
                  label="View rate (compl.)"
                  value={`${post.viewRate.toFixed(2)}%`}
                  icon="👀"
                />
              )}
              <div className="pt-2">
                <EngagementBadge rate={post.engagementRate} />
              </div>
            </dl>
          </div>

          {/* Audio (solo reels) */}
          {(post.musicArtist || post.musicTrack) && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
              <h3 className="mb-1 text-xs uppercase tracking-wider text-neutral-500">
                🎵 Audio
              </h3>
              <div className="text-neutral-200">
                {post.musicTrack ?? "—"}
              </div>
              {post.musicArtist && (
                <div className="text-xs text-neutral-400">
                  por {post.musicArtist}
                </div>
              )}
            </div>
          )}

          {/* Decisiones */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <h3 className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
              Decisión
            </h3>
            <DecisionButtons
              postId={post.id}
              initialDecision={post.decision}
              initialNotes={post.decisionNotes}
            />
            <div className="mt-3 border-t border-neutral-900 pt-3">
              <NotionButton postId={post.id} hasAdaptation={!!adaptation} />
            </div>
            <div className="mt-3 border-t border-neutral-900 pt-3">
              <Link
                href={`/creacion?post=${post.id}&fuente=${encodeURIComponent(
                  (transcription?.transcription ?? post.caption ?? "").slice(0, 1500),
                )}`}
                className="block w-full rounded-md border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-center text-sm font-medium text-amber-200 transition-colors hover:border-amber-500"
              >
                ✨ Crear contenido desde este viral
              </Link>
            </div>
          </div>

          {/* Link a IG */}
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-center text-sm text-blue-400 hover:bg-neutral-900"
          >
            Abrir en Instagram ↗
          </a>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="flex justify-between border-b border-neutral-900 py-1 last:border-0">
      <span className="text-neutral-400">
        {icon} {label}
      </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function fmtCount(n: number | null | undefined): string {
  if (n == null || n < 0) return "—";
  return n.toLocaleString();
}

function AnatomyRow({
  icon,
  label,
  type,
  quote,
}: {
  icon: string;
  label: string;
  type: string;
  quote: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-xs font-semibold text-neutral-400">
          {icon} {label}
        </span>
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-300">
          {type}
        </span>
      </div>
      <blockquote className="border-l-2 border-neutral-700 pl-3 italic text-neutral-200">
        &ldquo;{quote}&rdquo;
      </blockquote>
    </div>
  );
}
