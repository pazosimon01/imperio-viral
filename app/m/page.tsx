"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MultiProfileView, type MultiPost } from "@/components/MultiProfileView";

const BATCH_SIZE = 50;

export default function MultiPage() {
  const sp = useSearchParams();
  const n = Math.min(96, Math.max(6, Number(sp.get("n") ?? 48) || 48));
  const usernames = useMemo(() => {
    return Array.from(
      new Set(
        (sp.get("users") ?? "")
          .split(",")
          .map((u) => u.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }, [sp]);

  const [posts, setPosts] = useState<MultiPost[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [rateLimited, setRateLimited] = useState(false);
  const [done, setDone] = useState(false);
  const [processed, setProcessed] = useState(0);
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
          setPosts((prev) => [...prev, ...data.posts]);
        }
        if (data.errors.length > 0) {
          setErrors((prev) => [...prev, ...data.errors]);
        }
      } catch {
        setErrors((prev) => [...prev, ...batch.map((u) => `@${u}`)]);
      }
      setProcessed((p) => p + batch.length);
    }

    setDone(true);
    running.current = false;

    try {
      const okCount = usernames.length;
      await fetch("/api/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "multi",
          label: `${okCount} perfiles: ${usernames.slice(0, 3).join(", ")}${
            usernames.length > 3 ? "…" : ""
          }`,
          href: `/m?users=${encodeURIComponent(usernames.join(","))}&n=${n}`,
        }),
      });
    } catch {}
  }, [usernames, n]);

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
            {errors.length > 0 && (
              <div className="mt-1 text-sm text-red-300/80">
                {errors.join(", ")}
              </div>
            )}
          </div>
        )
      ) : sorted.length > 0 ? (
        <MultiProfileView
          posts={sorted}
          profilesCount={processed - errors.length}
          errors={errors}
          rateLimited={rateLimited}
        />
      ) : null}
    </div>
  );
}
