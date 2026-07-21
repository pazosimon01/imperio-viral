"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

type Kind = "carrusel" | "historias" | "guion";

/* eslint-disable @typescript-eslint/no-explicit-any */

function CreacionInner() {
  const sp = useSearchParams();
  const [kind, setKind] = useState<Kind>("carrusel");
  const [negocio, setNegocio] = useState(sp.get("negocio") ?? "");
  const [fuente, setFuente] = useState(sp.get("idea") ?? sp.get("fuente") ?? "");
  const [creencia, setCreencia] = useState<string>("");
  const [instrucciones, setInstrucciones] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [resultKind, setResultKind] = useState<Kind>("carrusel");
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<string[]>([]);

  async function generar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cerebro/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          negocio,
          fuente,
          creencia: creencia ? Number(creencia) : null,
          instrucciones,
          sourcePostId: sp.get("post"),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Error generando");
      else {
        setResult(data.result);
        setResultKind(data.kind);
        setHistorial([]);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError("Error de red");
    }
    setBusy(false);
  }

  async function aplicarCambios(e: React.FormEvent) {
    e.preventDefault();
    const feedback = refineText.trim();
    if (!feedback || refining) return;
    setRefining(true);
    setRefineError(null);
    try {
      const res = await fetch("/api/cerebro/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: resultKind,
          negocio,
          fuente,
          previous: result,
          feedback,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefineError(data.error ?? "No se pudo aplicar el cambio");
      } else {
        setResult(data.result);
        setHistorial((h) => [...h, feedback]);
        setRefineText("");
      }
    } catch {
      setRefineError("Error de red");
    }
    setRefining(false);
  }

  const input =
    "w-full rounded-md border border-neutral-700 bg-neutral-900 p-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none";

  const KINDS: Array<{ k: Kind; label: string; icon: string }> = [
    { k: "carrusel", label: "Carrusel", icon: "🖼️" },
    { k: "historias", label: "Historias", icon: "📱" },
    { k: "guion", label: "Guión de Reel", icon: "🎬" },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">✨ Tu pieza</h1>
            <button onClick={() => setResult(null)} className="text-sm text-neutral-400 hover:text-white">
              ← Crear otra
            </button>
          </div>
          {resultKind === "carrusel" && <CarruselView r={result} />}
          {resultKind === "historias" && <HistoriasView r={result} />}
          {resultKind === "guion" && <GuionView r={result} />}

          {/* Recuadro para pedir cambios sin empezar de cero */}
          <form
            onSubmit={aplicarCambios}
            className="flex flex-col gap-2 rounded-2xl border border-emerald-900/50 bg-gradient-to-br from-emerald-950/25 to-neutral-950 p-4"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✏️</span>
              <h3 className="text-sm font-semibold">¿Quieres cambiar algo?</h3>
            </div>
            <p className="text-xs text-neutral-400">
              Pídelo con tus palabras y lo ajusto sobre esta misma versión — no
              se pierde lo que ya te gustó. Ej: &ldquo;hazlo más corto&rdquo;,
              &ldquo;cambia el gancho por algo más directo&rdquo;, &ldquo;tono
              más cercano&rdquo;, &ldquo;agrega un slide de testimonio&rdquo;.
            </p>
            {historial.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {historial.map((h, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-[11px] text-neutral-300"
                  >
                    ✓ {h.length > 40 ? h.slice(0, 40) + "…" : h}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                disabled={refining}
                placeholder="Escribe qué quieres cambiar…"
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={refining || !refineText.trim()}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-neutral-700"
              >
                {refining ? "Ajustando…" : "Aplicar"}
              </button>
            </div>
            {refineError && <p className="text-xs text-red-400">⚠️ {refineError}</p>}
          </form>
        </div>
      )}

      {!result && (
        <>
          <section className="pt-2 text-center">
            <h1 className="text-3xl font-bold">✨ CREACIÓN</h1>
            <p className="mx-auto mt-2 max-w-xl text-neutral-400">
              Paso 4 del método. Convierte un viral del Radar o una idea de CEREBRO
              en una pieza lista: carrusel slide por slide, secuencia de historias o
              guión de reel.
            </p>
          </section>

          <form onSubmit={generar} className="flex flex-col gap-3 rounded-lg border border-emerald-900/50 bg-neutral-950 p-5">
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(({ k, label, icon }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                    kind === k
                      ? "border-emerald-500 bg-emerald-950/40 text-emerald-200"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            <textarea
              className={`${input} h-20`}
              placeholder="El negocio/marca: qué vende, a quién, cómo habla. (Pega aquí el contexto — solo esto se usa como verdad, nada se inventa)"
              value={negocio}
              onChange={(e) => setNegocio(e.target.value)}
              required
            />
            <textarea
              className={`${input} h-24`}
              placeholder="El material de partida: pega el caption/transcripción del viral que quieres replicar, o escribe tu idea (ej: una de las 10 ideas de CEREBRO)"
              value={fuente}
              onChange={(e) => setFuente(e.target.value)}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select className={input} value={creencia} onChange={(e) => setCreencia(e.target.value)}>
                <option value="">Creencia: que CEREBRO elija</option>
                <option value="1">#1 Confianza — que me conozcan</option>
                <option value="2">#2 Autoeficacia — &ldquo;yo sí puedo&rdquo;</option>
                <option value="3">#3 Mi solución funciona</option>
                <option value="4">#4 Mejor que la competencia</option>
                <option value="5">#5 Ahora, no después</option>
              </select>
              <input
                className={input}
                placeholder="Instrucciones extra (opcional)"
                value={instrucciones}
                onChange={(e) => setInstrucciones(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-400">⚠️ {error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:bg-neutral-700"
            >
              {busy ? "✨ Escribiendo… (30-60s)" : "Generar pieza →"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function CopyAll({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        });
      }}
      className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
    >
      {ok ? "✓ Copiado" : "📋 Copiar todo"}
    </button>
  );
}

function CarruselView({ r }: { r: any }) {
  const all = [
    `CARRUSEL: ${r.titulo}`,
    ...(r.slides ?? []).map((s: any) => `--- Slide ${s.numero} (${s.rol}) ---\n${s.texto}\n[Visual: ${s.notaVisual}]`),
    `--- CAPTION ---\n${r.caption}`,
  ].join("\n\n");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-4">
        <div>
          <div className="font-semibold">{r.titulo}</div>
          <div className="text-xs text-neutral-500">
            Estructura: {r.estructura} · {r.tipoReptinac} · creencia #{r.creencia}
            {r.ctaPalabraClave ? ` · palabra clave: ${r.ctaPalabraClave}` : ""}
          </div>
        </div>
        <CopyAll text={all} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(r.slides ?? []).map((s: any) => (
          <div key={s.numero} className="flex aspect-[4/5] flex-col rounded-lg border border-neutral-700 bg-gradient-to-br from-neutral-900 to-neutral-950 p-4">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500">
              <span>Slide {s.numero}</span>
              <span className="rounded bg-neutral-800 px-1.5 py-0.5">{s.rol}</span>
            </div>
            <p className="flex-1 whitespace-pre-line text-sm font-medium leading-snug">{s.texto}</p>
            <p className="mt-2 border-t border-neutral-800 pt-2 text-[11px] italic text-neutral-500">🎨 {s.notaVisual}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">Caption</h3>
        <p className="whitespace-pre-line text-sm">{r.caption}</p>
      </div>
      {(r.hooksAlternativos ?? []).length > 0 && (
        <details className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
          <summary className="cursor-pointer text-neutral-400">🎣 Los 5 ganchos considerados</summary>
          <ol className="mt-2 flex flex-col gap-1">
            {r.hooksAlternativos.map((h: string, i: number) => (
              <li key={i} className="text-neutral-300">{i + 1}. {h}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function HistoriasView({ r }: { r: any }) {
  const all = [
    `SECUENCIA DE HISTORIAS: ${r.titulo}`,
    ...(r.pantallas ?? []).map((p: any) => `--- Historia ${p.numero} ---\n${p.texto}${p.sticker ? `\n[Sticker: ${p.sticker}]` : ""}\n[Visual: ${p.notaVisual}]`),
    `CTA final: ${r.cta}`,
  ].join("\n\n");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-4">
        <div>
          <div className="font-semibold">{r.titulo}</div>
          <div className="text-xs text-neutral-500">{r.objetivo} · creencia #{r.creencia}</div>
        </div>
        <CopyAll text={all} />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {(r.pantallas ?? []).map((p: any) => (
          <div key={p.numero} className="flex aspect-[9/16] w-44 shrink-0 flex-col rounded-lg border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-3">
            <div className="mb-1 text-[10px] text-neutral-500">Historia {p.numero}</div>
            <p className="flex-1 whitespace-pre-line text-[13px] font-medium leading-snug">{p.texto}</p>
            {p.sticker && (
              <div className="mt-1 rounded-full bg-purple-900/60 px-2 py-1 text-center text-[10px] text-purple-200">
                {p.sticker}
              </div>
            )}
            <p className="mt-1 text-[9px] italic text-neutral-600">🎨 {p.notaVisual}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
        <strong>CTA final:</strong> {r.cta}
      </div>
    </div>
  );
}

function GuionView({ r }: { r: any }) {
  const all = `GUIÓN: ${r.titulo}\n\nTexto en pantalla (primer fotograma): ${r.textoEnPantalla}\n\n${r.guion}\n\nCTA: ${r.cta}\n\nNotas: ${r.notasGrabacion}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-4">
        <div>
          <div className="font-semibold">{r.titulo}</div>
          <div className="text-xs text-neutral-500">{r.tipoReptinac} · creencia #{r.creencia}</div>
        </div>
        <CopyAll text={all} />
      </div>
      <div className="rounded-lg border border-purple-900/50 bg-purple-950/20 p-4">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-purple-300">🎙️ Guión (léelo a cámara)</h3>
        <p className="whitespace-pre-line text-sm leading-relaxed">{r.guion}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
          <h3 className="mb-1 text-xs uppercase tracking-wider text-neutral-500">Texto en pantalla</h3>
          <p className="font-medium">{r.textoEnPantalla}</p>
          <p className="mt-1 text-xs text-neutral-500">Complementa al audio, no lo copia.</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
          <h3 className="mb-1 text-xs uppercase tracking-wider text-neutral-500">CTA</h3>
          <p>{r.cta}</p>
        </div>
      </div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
        <h3 className="mb-1 text-xs uppercase tracking-wider text-neutral-500">🎬 Notas de grabación</h3>
        <p className="whitespace-pre-line text-neutral-300">{r.notasGrabacion}</p>
      </div>
      {(r.hooksAlternativos ?? []).length > 0 && (
        <details className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm">
          <summary className="cursor-pointer text-neutral-400">🎣 Los 5 ganchos considerados</summary>
          <ol className="mt-2 flex flex-col gap-1">
            {r.hooksAlternativos.map((h: string, i: number) => (
              <li key={i} className="text-neutral-300">{i + 1}. {h}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export default function CreacionPage() {
  return (
    <Suspense>
      <CreacionInner />
    </Suspense>
  );
}
