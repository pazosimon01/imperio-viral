"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MultiProfileView, type MultiPost } from "@/components/MultiProfileView";

const BATCH_SIZE = 20;
const MAX_POSTS_IN_MEMORY = 6000;

export default function MultiPage() {
  const sp = useSearchParams();
  const rawN = Math.min(96, Math.max(6, Number(sp.get("n") ?? 48) || 48));

  const usernames = useMemo(() => {
    let raw = sp.get("users") ?? "";
    if (sp.get("from") === "session" && typeof window !== "undefined") {
      raw = sessionStorage.getItem("multi_users") ?? raw;
    }
    return Array.from(
      new Set(
        raw
          .split(",")
          .map((u) => u.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }, [sp]);

  const n = usernames.length > 200 ? Math.min(rawN, 12) :
            usernames.length > 50  ? Math.min(rawN, 24) : rawN;

  const [posts, setPosts] = useState<MultiPost[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [rateLimited, setRateLimited] = useState(false);
  const [done, setDone] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current || usernames.length === 0) return;
    running.current = true;

    for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
      const batch = usernames.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch("/api/multi-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames: batch, n }),
        });
        if (!res.ok) {
          setErrors((prev) => [...prev, ...batch.map((u) => `@${u}`)]);
          setProcessed((p) => p + batch.length);
          continue;
        }
        const data = await res.json();
        if (data.rateLimited) setRateLimited(true);
        if (data.posts.length > 0) {
          setPosts((prev) => {
            const merged = [...prev, ...data.posts];
            if (merged.length <= MAX_POSTS_IN_MEMORY) return merged;
            merged.sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1));
            return merged.slice(0, MAX_POSTS_IN_MEMORY);
          });
        }
        if (data.errors.length > 0) {
          setErrors((prev) => [...prev, ...data.errors]);
        }
        setSuccessCount((c) => c + (batch.length - (data.errors?.length ?? 0)));
      } catch {
        setErrors((prev) => [...prev, ...batch.map((u) => `@${u}`)]);
      }
      setProcessed((p) => p + batch.length);

      if (i + BATCH_SIZE < usernames.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setDone(true);
    running.current = false;

    try {
      await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "multi",
          label: `${usernames.length} perfiles: ${usernames.slice(0, 3).join(", ")}${
            usernames.length > 3 ? "…" : ""
          }`,
          href: `/m?users=${encodeURIComponent(usernames.slice(0, 30).join(","))}&n=${rawN}`,
        }),
      });
    } catch {}
  }, [usernames, n, rawN]);

  useEffect(() => {
    run();
  }, [run]);

  const sorted = useMemo(() => {
    return [...posts].sort(
      (a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1)
    );
  }, [posts]);

  const total = usernames.length;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const errorsTruncated = errors.length > 50;
  const displayErrors = errorsTruncated ? errors.slice(0, 50) : errors;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm">
        <Link href="/" className="text-neutral-400 hover:text-white">
          ← Inicio
        </Link>
      </div>

      {!done && total > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-neutral-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
              Analizando perfiles…
              {n < rawN && (
                <span className="text-xs text-neutral-500">
                  (modo rápido: {n} posts/perfil)
                </span>
              )}
            </span>
            <span className="tabular-nums text-neutral-400">
              {processed}/{total} ({pct}%)
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {posts.length > 0 && (
            <div className="text-xs text-neutral-500">
              {successCount} perfiles cargados · {posts.length.toLocaleString()} publicaciones
              {posts.length >= MAX_POSTS_IN_MEMORY && " (mostrando top por engagement)"}
            </div>
          )}
        </div>
      )}

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          No pasaste ningun perfil.
        </div>
      ) : sorted.length === 0 && done ? (
        rateLimited ? (
          <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-6 text-center text-amber-200">
            <p className="font-medium">Instagram limito las consultas por tu IP.</p>
            <p className="mt-1 text-sm text-amber-300/80">
              Espera 2-3 minutos y reintenta, o analiza menos perfiles por tanda.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-red-800 bg-red-950/40 p-6 text-center text-red-200">
            No se pudo analizar ninguno (perfiles inexistentes o privados).
            {displayErrors.length > 0 && (
              <div className="mt-1 text-sm text-red-300/80">
                {displayErrors.join(", ")}
                {errorsTruncated && ` …y ${errors.length - 50} más`}
              </div>
            )}
          </div>
        )
      ) : sorted.length > 0 ? (
        <MultiProfileView
          posts={sorted}
          profilesCount={successCount}
          errors={displayErrors}
          rateLimited={rateLimited}
        />
      ) : null}
    </div>
  );
}
