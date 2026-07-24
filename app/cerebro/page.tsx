"use client";

import { useEffect, useRef, useState } from "react";
import type { StrategyResult, InterviewTurn } from "@/lib/cerebro";
import { StrategyView } from "@/components/StrategyView";

interface SavedStrategy {
  id: string;
  business: { nombre?: string; resumen?: string };
  result: StrategyResult;
  created_at: string;
}

export default function CerebroPage() {
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [pct, setPct] = useState(0);
  const [resumen, setResumen] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previas, setPrevias] = useState<SavedStrategy[]>([]);
  const [started, setStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/cerebro/strategy")
      .then((r) => r.json())
      .then((d) => setPrevias(d.strategies ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, thinking, resumen]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || thinking) return;
    const nextTurns: InterviewTurn[] = [...turns, { role: "usuario", text: clean }];
    setTurns(nextTurns);
    setDraft("");
    setThinking(true);
    setError(null);
    try {
      const res = await fetch("/api/cerebro/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: nextTurns }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error");
        setThinking(false);
        return;
      }
      const step = data.step;
      setPct(step.porcentaje ?? 0);
      if (step.listo) {
        setResumen(step.resumen);
        if (step.nombre) setNombre(step.nombre);
        setTurns((t) => [
          ...t,
          {
            role: "cerebro",
            text: `¡Perfecto! Ya entendí ${step.nombre ? `"${step.nombre}"` : "tu negocio"}. Voy a guardarlo como tu marca y armarte la estrategia. ¿Le damos?`,
          },
        ]);
      } else {
        setTurns((t) => [...t, { role: "cerebro", text: step.pregunta }]);
      }
    } catch {
      setError("Error de red");
    }
    setThinking(false);
  }

  function empezar() {
    setStarted(true);
    setTurns([
      {
        role: "cerebro",
        text: "Hola 👋 Soy CEREBRO. Voy a hacerte unas 10-12 preguntas cortas — son el plan científico de marketing completo, y de eso depende que todo lo demás (ideas, contenido, filtros) salga a tu medida y no genérico.\n\nEmpecemos: ¿qué vendes exactamente y en qué ciudad? (ej: \"clínica dental en Cali, lo que más hacemos es diseño de sonrisa y ortodoncia\", \"vendo cursos de inglés online\", \"barbería en el norte de Bogotá\")",
      },
    ]);
  }

  async function construir() {
    if (!resumen) return;
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/api/cerebro/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalize: true, resumen, nombre }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error generando la estrategia");
      } else {
        setResult(data.strategy.result);
        if (data.brand?.nombre) setNombre(data.brand.nombre);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError("Error de red");
    }
    setBuilding(false);
  }

  if (result) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">🧠 Tu estrategia</h1>
          <button
            onClick={() => {
              setResult(null);
              setResumen(null);
              setTurns([]);
              setStarted(false);
              setPct(0);
            }}
            className="text-sm text-neutral-400 hover:text-white"
          >
            ← Empezar de nuevo
          </button>
        </div>
        <StrategyView r={result} nombre={nombre} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <section className="pt-2 text-center">
        <div className="text-4xl">🧠</div>
        <h1 className="mt-1 text-3xl font-bold">CEREBRO</h1>
        <p className="mx-auto mt-2 max-w-lg text-neutral-400">
          Paso 2. Vamos a charlar un momento sobre tu negocio y te armo una estrategia
          de contenido completa. No necesitas saber nada de marketing.
        </p>
      </section>

      {!started ? (
        <>
          <button
            onClick={empezar}
            className="rounded-2xl bg-gradient-to-r from-purple-600 to-purple-500 px-4 py-4 text-base font-semibold text-white shadow-lg shadow-purple-950/40 transition-transform hover:scale-[1.01]"
          >
            💬 Empezar la conversación
          </button>

          {previas.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                Estrategias anteriores
              </h2>
              <div className="flex flex-col gap-2">
                {previas.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setResult(s.result);
                      setNombre(s.business?.nombre ?? s.business?.resumen?.slice(0, 40) ?? "");
                    }}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-left text-sm text-neutral-300 hover:border-neutral-600"
                  >
                    {s.business?.nombre ?? s.business?.resumen?.split("\n")[0]?.slice(0, 50) ?? "Estrategia"}{" "}
                    <span className="text-neutral-500">
                      · {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-purple-900/40 bg-neutral-950 p-4">
          {pct > 0 && !resumen && (
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto py-1">
            {turns.map((t, i) => (
              <div
                key={i}
                className={`flex ${t.role === "usuario" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    t.role === "usuario"
                      ? "rounded-br-md bg-blue-600 text-white"
                      : "rounded-bl-md bg-neutral-800 text-neutral-100"
                  }`}
                >
                  {t.role === "cerebro" && <span className="mr-1">🧠</span>}
                  {t.text}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-neutral-800 px-4 py-2.5 text-sm text-neutral-400">
                  🧠 escribiendo…
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {error && <p className="text-sm text-red-400">⚠️ {error}</p>}

          {resumen ? (
            <button
              onClick={construir}
              disabled={building}
              className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-500 disabled:bg-neutral-700"
            >
              {building ? "🧠 Armando tu estrategia… (30-60s)" : "✨ Sí, arma mi estrategia →"}
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={thinking}
                placeholder="Escribe tu respuesta…"
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-purple-500 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={thinking || !draft.trim()}
                className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 disabled:bg-neutral-700"
              >
                Enviar
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
