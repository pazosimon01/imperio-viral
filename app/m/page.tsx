"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MultiProfileView, type MultiPost } from "@/components/MultiProfileView";
import { PescarPanel } from "@/components/PescarPanel";

const POLL_MS = 2500;

export default function MultiPage() {
  const sp = useSearchParams();
  const rawN = Math.min(96, Math.max(6, Number(sp.get("n") ?? 48) || 48));

  // Perfiles a analizar (para crear el job si aún no existe).
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

  // jobId: puede venir en la URL (?job=) al reabrir/recargar → se reanuda.
  const [jobId, setJobId] = useState<string | null>(() => sp.get("job"));
  const [posts, setPosts] = useState<MultiPost[]>([]);
  const [permanentes, setPermanentes] = useState<string[]>([]);
  const [transitorios, setTransitorios] = useState<string[]>([]);
  const [rateLimited, setRateLimited] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [done, setDone] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(usernames.length);
  const [successCount, setSuccessCount] = useState(0);
  const [fatal, setFatal] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const [proxySinSaldo, setProxySinSaldo] = useState(false);
  const [servidorReinicio, setServidorReinicio] = useState(false);
  const savedRef = useRef(false);
  const creatingRef = useRef(false);
  const gotResultsRef = useRef(false); // ¿ya recibimos posts? (evita closure stale)

  // 1) Si no hay job todavía pero sí perfiles → crear el job en el servidor.
  const createJob = useCallback(async () => {
    if (creatingRef.current || jobId || usernames.length === 0) return;
    creatingRef.current = true;
    try {
      const res = await fetch("/api/multi-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames, n: rawN }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFatal(data.error ?? "No se pudo iniciar el análisis");
        return;
      }
      setJobId(data.jobId);
      setTotal(data.total);
      // Poner ?job= en la URL sin recargar → sobrevive a bloqueo/recarga/reabrir.
      const url = new URL(window.location.href);
      url.searchParams.set("job", data.jobId);
      url.searchParams.set("n", String(rawN));
      url.searchParams.delete("users");
      url.searchParams.delete("from");
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Error de red");
    }
  }, [jobId, usernames, rawN]);

  useEffect(() => {
    createJob();
  }, [createJob]);

  // 2) Poll del job hasta que termine. Se reanuda solo tras recargar/reabrir.
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const res = await fetch(`/api/multi-job/${jobId}`);
        if (res.status === 404) {
          // El job ya no está en el servidor (se reinició o pasó 1h).
          if (gotResultsRef.current) {
            // Ya teníamos resultados en pantalla → NO alarmar, NO borrar nada.
            setDone(true);
            setServidorReinicio(true);
            return;
          }
          if (usernames.length > 0) {
            // Aún tenemos los perfiles → relanzamos solos, sin molestar.
            setJobId(null);
            creatingRef.current = false;
            createJob();
          } else {
            setFatal(
              "El análisis se detuvo (se reinició el servidor) antes de traer resultados. Vuelve a lanzarlo desde el inicio."
            );
          }
          return;
        }
        const data = await res.json();
        if (!alive) return;
        if ((data.posts ?? []).length > 0) gotResultsRef.current = true;
        setPosts(data.posts ?? []);
        setPermanentes(data.permanentes ?? []);
        setTransitorios(data.transitorios ?? []);
        setRateLimited(!!data.rateLimited);
        setRecovering(!!data.recovering);
        setProxySinSaldo(!!data.proxySinSaldo);
        setProcessed(data.processed ?? 0);
        setTotal(data.total ?? total);
        setSuccessCount(data.successCount ?? 0);
        if (data.done) {
          setDone(true);
          maybeSaveSearch();
          return; // dejamos de pollear
        }
      } catch {
        /* red intermitente: reintentamos en el próximo tick */
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  function maybeSaveSearch() {
    if (savedRef.current || usernames.length === 0) return;
    savedRef.current = true;
    fetch("/api/searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "multi",
        label: `${usernames.length} perfiles: ${usernames.slice(0, 3).join(", ")}${
          usernames.length > 3 ? "…" : ""
        }`,
        href: `/m?users=${encodeURIComponent(
          usernames.slice(0, 30).join(",")
        )}&n=${rawN}`,
      }),
    }).catch(() => {});
  }

  // Reintenta SOLO los que Instagram limitó temporalmente: crea un job nuevo con
  // esos usernames y cambia a seguirlo. IPs frescas → suelen recuperarse casi todos.
  async function reintentar() {
    const users = transitorios.map((u) => u.replace(/^@/, ""));
    if (users.length === 0 || reintentando) return;
    setReintentando(true);
    try {
      const res = await fetch("/api/multi-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: users, n: rawN }),
      });
      const data = await res.json();
      if (res.ok) {
        // Reiniciar estado y seguir el nuevo job (conservando los posts ya logrados).
        setDone(false);
        setTransitorios([]);
        setProcessed(0);
        setTotal(data.total);
        savedRef.current = true; // no re-guardar la búsqueda
        const url = new URL(window.location.href);
        url.searchParams.set("job", data.jobId);
        window.history.replaceState(null, "", url.toString());
        setJobId(data.jobId);
      }
    } catch {
      /* noop */
    }
    setReintentando(false);
  }

  const sorted = useMemo(
    () =>
      [...posts].sort(
        (a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1)
      ),
    [posts]
  );

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const noInput = usernames.length === 0 && !jobId;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm">
        <Link href="/" className="text-neutral-400 hover:text-white">
          ← Inicio
        </Link>
      </div>

      {fatal && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-6 text-center text-red-200">
          {fatal}
        </div>
      )}

      {/* Nota suave: el servidor se reinició pero los resultados siguen aquí */}
      {servidorReinicio && sorted.length > 0 && (
        <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-300">
          ℹ️ El análisis se detuvo porque se reinició el servidor.{" "}
          <strong className="text-white">Tus {sorted.length > 0 ? successCount : 0} perfiles siguen aquí abajo</strong> —
          no se perdió nada. Para completar el resto, vuelve a lanzarlo desde el inicio cuando quieras.
        </div>
      )}

      {/* AVISO: proxy sin saldo → nada se va a poder analizar hasta recargar */}
      {proxySinSaldo && (
        <div className="rounded-xl border border-red-700 bg-red-950/50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🚨</span>
            <div className="text-sm">
              <p className="font-semibold text-red-200">
                Tu proxy (Evomi) se quedó sin saldo.
              </p>
              <p className="mt-1 text-red-300/80">
                Por eso los perfiles no se están analizando — no es Instagram, es el
                saldo del proxy. Recárgalo en tu cuenta de Evomi y vuelve a intentar.
              </p>
              <a
                href="https://my.evomi.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Abrir Evomi para recargar ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {!done && !fatal && (total > 0 || !!jobId) && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-neutral-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
              {recovering
                ? "Reintentando los que Instagram limitó…"
                : "Revisando perfiles…"}
            </span>
            <span className="tabular-nums text-neutral-400">
              revisados {processed} de {total} ({pct}%)
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Desglose claro: qué significa cada número */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-emerald-400">
              ✅ {successCount} analizados
            </span>
            {posts.length > 0 && (
              <span className="text-neutral-500">
                · {posts.length.toLocaleString()} publicaciones
              </span>
            )}
            {transitorios.length > 0 && (
              <span className="text-amber-400">
                · ⏳ {transitorios.length} se reintentan solos
              </span>
            )}
            {permanentes.length > 0 && (
              <span className="text-neutral-500">
                · 🔒 {permanentes.length} privados/inexistentes
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-600">
            Puedes bloquear la pantalla o salir — el análisis sigue en tu Mac.
          </div>
        </div>
      )}

      {/* Aviso de fallos separados por causa, cuando ya terminó y hubo resultados */}
      {done && sorted.length > 0 && (permanentes.length > 0 || transitorios.length > 0) && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
          {transitorios.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-amber-800/50 bg-amber-950/20 p-3">
              <span className="text-amber-200">
                ⏳ <strong>{transitorios.length}</strong> perfiles no se pudieron
                analizar ahora porque Instagram limitó la conexión un momento.
                <span className="text-amber-300/70"> No están perdidos — son válidos.</span>
              </span>
              <button
                onClick={reintentar}
                disabled={reintentando}
                className="self-start rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:bg-neutral-700"
              >
                {reintentando ? "Reintentando…" : `🔄 Reintentar estos ${transitorios.length}`}
              </button>
            </div>
          )}
          {permanentes.length > 0 && (
            <span className="text-neutral-500">
              🔒 {permanentes.length} son cuentas privadas o que ya no existen (esas no se pueden analizar).
            </span>
          )}
        </div>
      )}

      {noInput ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          No pasaste ningún perfil.
        </div>
      ) : sorted.length === 0 && done ? (
        transitorios.length > 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-amber-700 bg-amber-950/40 p-6 text-center text-amber-200">
            <p className="font-medium">
              Instagram limitó la conexión y no alcanzó a analizar estos perfiles.
            </p>
            <p className="text-sm text-amber-300/80">
              Son válidos — solo hay que reintentar con IPs frescas. Suele recuperarlos casi todos.
            </p>
            <button
              onClick={reintentar}
              disabled={reintentando}
              className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:bg-neutral-700"
            >
              {reintentando ? "Reintentando…" : `🔄 Reintentar los ${transitorios.length}`}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-red-800 bg-red-950/40 p-6 text-center text-red-200">
            No se pudo analizar ninguno. Estas cuentas son privadas o ya no existen.
          </div>
        )
      ) : sorted.length > 0 ? (
        <>
          {/* Pescar con IA: disponible apenas hay publicaciones (aún sin terminar) */}
          {jobId && sorted.length >= 10 && (
            <PescarPanel jobId={jobId} totalPosts={sorted.length} />
          )}
          <MultiProfileView
            posts={sorted}
            profilesCount={successCount}
            errors={permanentes}
            rateLimited={rateLimited}
          />
        </>
      ) : null}
    </div>
  );
}
